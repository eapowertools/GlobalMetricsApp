var extend = require('extend');
var fs = require('fs');
var Promise = require('bluebird');

var appMetadata = require('./lib/getAppMetadata');
var masterMetricsData = require('./lib/getMasterMetricsData');
var sheetData = require('./lib/getSheetData');
var stringExtensions = require('./lib/stringExtensions');
var variableData = require('./lib/getVariableData');
var visualizationData = require('./lib/getVisualizationData');
var writeHeaders = require('./lib/writeHeaders');
var customPropertyDefinitions = require('./lib/getCustomPropertyDefinitions');
var entityCustomPropertyValues = require('./lib/getCustomPropertiesForEntity');
var nonMasterMetricsData = require('./lib/getNonMasterItemMetrics');



var main = function main(qsocks, serializeApp, qrsInteract, config, socket) {
    stringExtensions();

    // create folder if it doesn't exist
    try {
        fs.mkdirSync(config.filenames.outputDir);
    } catch (err) {
        console.log("Output folder already created.");
    }

    // Create all files and write headers to files
    writeHeaders.writeAllHeaders(config.filenames.outputDir);

    // write custom property definitions
    var customPropertyDefinitionPath = config.filenames.outputDir + config.filenames.customPropertyDefinitions_table;
    customPropertyDefinitions.writeToFile(qrsInteract, customPropertyDefinitionPath);

    var customPropertiesPath = config.filenames.outputDir + config.filenames.entityCustomPropertyMap_table;
    entityCustomPropertyValues.writeToFile(qrsInteract, "app", customPropertiesPath);

    return qsocks.Connect(config.qsocks).then(function (global) {
            return global.getDocList()
                .then(function (docList) {
                    return docList.map(function (doc) {
                        return doc.qDocId;
                    });
                });
        })
        .then(function (docIds) {
            var finishedApps = 0;
            return Promise.all(docIds.map(function (appId, index, originalArray) {
                socket.emit("appMetaFetcher", "Started processing app " + (index+1) + " of " + originalArray.length + ".");

                qsocksConfig = extend(true, config.qsocks, {
                    appname: appId
                });
                return qsocks.Connect(qsocksConfig).then(function (g) {
                    return g.openDoc(appId)
                        .then(function (app) {
                            return serializeApp(app).then(function (appData) {
                                var appFilePath = config.filenames.outputDir + config.filenames.apps_table;
                                appMetadata.writeToFile(appId, appFilePath, appData);

                                var sheetFilePath = config.filenames.outputDir + config.filenames.sheets_table;
                                sheetData.writeToFile(appId, sheetFilePath, appData);

                                var visualizationFilePath = config.filenames.outputDir + config.filenames.visualizations_table;
                                visualizationData.writeToFile(visualizationFilePath, appData);

                                var varFilePath = config.filenames.outputDir + config.filenames.variables_table;
                                variableData.writeToFile(appId, varFilePath, appData);

                                // master items
                                var masterMetricsFilePath = config.filenames.outputDir + config.filenames.masterMetrics_table;
                                masterMetricsData.writeToFile(appId, masterMetricsFilePath, appData);

                                // non master item metrics
                                var nonMasterMetricsFilePath = config.filenames.outputDir + config.filenames.nonMasterMetrics_table;
                                nonMasterMetricsData.writeToFile(nonMasterMetricsFilePath, appData);

                                // do metrics linking
                                var visMasterMetricsFilePath = config.filenames.outputDir + config.filenames.visualizationsMasterMetrics_table;
                                return masterMetricsData.writeLinkTableToFile(app, visMasterMetricsFilePath, appData);
                            });
                        }).then(function () {
                            finishedApps++;
                            socket.emit("appMetaFetcher", "Finished processing app " + finishedApps + " of " + originalArray.length + ".");
                        }).catch(function(reason) {
                            finishedApps++;
                            socket.emit("appMetaFetcher", "Failed to process app " + finishedApps + " of " + originalArray.length + ".");
                            socket.emit("appMetaFetcher", "\tApp ID: " + appId);
                            socket.emit("appMetaFetcher", "\tReason: " + reason.message + " - " + reason.parameter);
                    });
                })
            }));
        });
}

module.exports = main;