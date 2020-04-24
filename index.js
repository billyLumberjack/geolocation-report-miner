const MongoClient = require('mongodb').MongoClient;
const https = require('https');
const MyPromise = require("bluebird");

const TitleRefinerHandler = require("./titleRefinerHandler")("../nltk_experiment/", "get_toponym.py");

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // needed because of winzozz error

const openCageKeys = {
    accountKey : "efb086e9e0884dc7a05179eb453bf2ab",
    test : {
        always200 : "6d0e711d72d74daeb2b0bfd2a5cdfdba",
        always402 : "4372eff77b8343cebfc843eb4da4ddc4",
        always403 : "2e10e5e828262eb243ec0b54681d699a",
        always403 : "6c79ee8e1ca44ad58ad1fc493ba9542f",
        always429 : "d6d0f0065f4348a4bdfe4587ba02714b"
    }
};
const database = 'MyDatabase';
const collectionName = 'production-report-collection';
const mongoDbConnectionString = makeConnectionString(
    'root',
    'root',
    [
        'cluster0-shard-00-00-shxrr.mongodb.net:27017',
        'cluster0-shard-00-01-shxrr.mongodb.net:27017',
        'cluster0-shard-00-02-shxrr.mongodb.net:27017'
    ],
    database
);
const queryParameters = {
    filter: {
        geometry: { $exists: false }
    },
    project: {},
    sort: {
        Date: -1,
        CreatedAt: -1
    },
    limit: 5,
    skip: 0
};

function makeConnectionString(username, password, shards, database) {
    return `mongodb://${username}:${password}@${shards.join(',')}/${database}?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin`;
}

function updateInMongoDb(localizedReport, mongoDbClient) {
    mongoDbClient.db(database).collection(collectionName)
        .updateOne(
            { "_id": localizedReport._id },
            { $set: { geometry: localizedReport.geometry } },
            function (err, res) {
                
                if (err) throw err;

                console.log("${localizedReport._id} succesfully updated");
            }
        );
}

function getFirstLocationResultFittingCategories(locationResults) {
    var locationResultsFittingCategories = locationResults.filter((locationResult) => {
        return locationResult.components._category == "natural/water" || locationResult.components._category == "outdoors/recreation" || locationResult.components._category == "travel/tourism";
    });

    if (locationResultsFittingCategories.length > 0) {
        return locationResultsFittingCategories[0];
    }
    else {
        return undefined;
    }
}

function locate(report) {
    return new MyPromise((resolve, reject) => {

        var opencageURL = `https://api.opencagedata.com/geocode/v1/json?key=${openCageKeys.accountKey}&q=${report.extractedToponym},${report.Region}&pretty=0&no_annotations=1&min_confidence=2`;

        opencageURL = encodeURI(opencageURL);

        https.get(opencageURL, (response) => {
            var body = '';

            response.on('data', (chunk) => body += chunk);

            response.on('error', (err) => {
                reject(err);
            });

            response.on('end', () => {
                console.log("Succesfully CALLED: " + opencageURL);

                //create the object from the html page
                var location_results = JSON.parse(body);

                if (location_results.status.code != 200){
                    reject(
                        new Error("Opencage returned error " + location_results.status.code +" : "+ location_results.status.message)
                        );
                }
                else if (location_results.total_results > 0) {

                    console.log("Found some result for report " + report["_id"]);

                    let locationResult = getFirstLocationResultFittingCategories(location_results.results);

                    if (locationResult) {

                        if (locationResult.geometry.lat && locationResult.geometry.lng) {
                            report["geometry"] = {
                                type: "Point",
                                coordinates: [
                                    locationResult.geometry.lat,
                                    locationResult.geometry.lng
                                ]
                            };
                            console.log("Succesfully added coordinates for report " + report["_id"]);
                            resolve(report);
                        }
                        else {
                            console.log("Found result but does not have coordinates for report: " + report._id);
                            resolve(report);
                        }
                    }
                    else {
                        console.log("None of the results for report: " + report._id + " fit the categories");
                        resolve(report);
                    }

                }
                else {
                    console.log("no results for report with _id: " + report._id + " while geolocalizing");
                    resolve(report);
                }

            });
        });
    });


}

var updateInMongoDbAsQueue = function(reportsToLocalizeArray, reportsNotLocalized, mongoClient, updatedReportsNumber, totalReportsToUpdate){

    if(reportsToLocalizeArray.length == 0){

        console.log(`\nUpdated ${updatedReportsNumber} reports on ${totalReportsToUpdate}\n`);

        console.log(JSON.stringify(reportsNotLocalized, null, 2));

        mongoClient.close();
        return;
    }

    locate(reportsToLocalizeArray[0])
        .then((localizedReport) => {
            
            if(localizedReport.geometry){
                updateInMongoDb(localizedReport, mongoClient);
                updatedReportsNumber++;
            }
            else{
                reportsNotLocalized.push(localizedReport);
            }

            return updateInMongoDbAsQueue(reportsToLocalizeArray.slice(1), reportsNotLocalized, mongoClient, updatedReportsNumber, totalReportsToUpdate);
        })
        .catch((error) => {
            mongoClient.close();
            console.error(`\n${error.message}\n`);
            return;
        });
};     

var areReportTokensLessThan = function(tokensThreshold, reportWithTitleTokensToCheck){
    let titleTokensNumber = reportWithTitleTokensToCheck.TripName.split(/[^a-zA-Z0-9]+/g).filter(token => token).length;

    let proceedWithThisReport = titleTokensNumber < tokensThreshold;

    if (!proceedWithThisReport) {
        console.log(`Removed report with _id ${reportWithTitleTokensToCheck._id} because trip name (${reportWithTitleTokensToCheck.TripName}) contains to many tokens`)
    }

    return proceedWithThisReport;
}

MongoClient.connect(mongoDbConnectionString, function (error, currentClient) {

    if (error) throw error;

    currentClient.db(database).collection(collectionName).find(queryParameters.filter, queryParameters.project)
        .sort(queryParameters.sort)
        .skip(queryParameters.skip)
        .limit(queryParameters.limit)
        .toArray(function (error, reportsToLocalizeArray) {

            if (error) throw error;

            console.log(reportsToLocalizeArray.length + " reports to localize");

            //reportsToLocalizeArray = reportsToLocalizeArray
            //    .filter((reportToCkeck) => areReportTokensLessThan(10, reportToCkeck));

            var refinedTitles = TitleRefinerHandler.synchRefineTitle(
                reportsToLocalizeArray.map(report => report.TripName.replace(/[^a-zA-Z0-9]+/g, " ")).join(',')
            ).split("\n");

            

            reportsToLocalizeArray = reportsToLocalizeArray.map((report, index) => {

                report["extractedToponym"] = refinedTitles[index];

                console.log(`refined ${report.TripName} to ${report.extractedToponym}`);

                return report;
                
            }).filter(report =>{
                return report.extractedToponym.length > 3;
            });

            console.log(`Got ${reportsToLocalizeArray.length} reports to localize`);

            updateInMongoDbAsQueue(reportsToLocalizeArray, [], currentClient, 0, reportsToLocalizeArray.length);

        });
});