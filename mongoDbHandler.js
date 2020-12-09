module.exports = function(mongoDbClient , collectionName) {

    const toponymScriptFolder = process.env.TOPONYM_SCRIPT_FOLDER;
    const toponymScriptFilename = process.env.TOPONYM_SCRIPT_FILENAME;
    const geometryValueForFailures = "NOT_FOUND";


    const TitleRefinerHandler = require("./titleRefinerHandler")(toponymScriptFolder, toponymScriptFilename)//require("./titleRefinerHandler")("../nltk_experiment/", "get_toponym.py");

    const https = require('https');

    const minimumToponymLength = 3;
    const openCageKeys = {
        accountKey : "c61f098c79a6494ca56cc07cc83d4030",
        test : {
            always200 : "6d0e711d72d74daeb2b0bfd2a5cdfdba",
            always402 : "4372eff77b8343cebfc843eb4da4ddc4",
            always403 : "2e10e5e828262eb243ec0b54681d699a",
            always403 : "6c79ee8e1ca44ad58ad1fc493ba9542f",
            always429 : "d6d0f0065f4348a4bdfe4587ba02714b"
        }
    };


    function assignGeocodeToQueryResults(queryParameters) {

        mongoDbClient.db()
            .collection(collectionName)
            .find(queryParameters.filter, queryParameters.project)
            .sort(queryParameters.sort)
            .skip(queryParameters.skip)
            .limit(queryParameters.limit)
            .toArray(function (error, reportsToLocalizeArray) {
    
                if (error) throw error;
    
                console.log(`${reportsToLocalizeArray.length} reports to localize`);

                reportsToLocalizeArray = reportsToLocalizeArray.map((reportWithoutCleanTripName) => {
                    reportWithoutCleanTripName["cleanTitle"] = reportWithoutCleanTripName.TripName.replace(/[^a-zA-Z0-9]+/g, " ");
                    return reportWithoutCleanTripName;
                });
    
                var refinedTitles = TitleRefinerHandler.synchRefineFromTitlesArray(
                    reportsToLocalizeArray
                        .map(reportWithCleanTitle => reportWithCleanTitle.cleanTitle)
                        .join(',')
                ).split("\n");
    
                reportsToLocalizeArray = reportsToLocalizeArray.map((reportWithoutExtractedToponym, index) => {
    
                    reportWithoutExtractedToponym["extractedToponym"] = refinedTitles[index];
                    console.log(`added ${reportWithoutExtractedToponym.extractedToponym} to report object with title ${reportWithoutExtractedToponym.TripName}`);
                    return reportWithoutExtractedToponym;
                    
                });
    
                console.log(`Got ${reportsToLocalizeArray.length} reports to localize`);
    
                updateInMongoDbAsQueue(reportsToLocalizeArray, [], 0, reportsToLocalizeArray.length);
    
            });
    }

    function updateInMongoDbAsQueue (reportsToLocalizeArray, reportsNotLocalized, updatedReportsNumber, totalReportsToUpdate){

        if(reportsToLocalizeArray.length == 0){
            console.log(`\nUpdated ${updatedReportsNumber} reports on ${totalReportsToUpdate}\n`);
            mongoDbClient.close();
            return;
        }

        var searchTerms = (function getSearchTermsFromReport(report){
            if(report.extractedToponym.length > minimumToponymLength){
                return `${report.extractedToponym},${report.Region}`;
            }
            else{
                return report.cleanTitle;
            }
        })(reportsToLocalizeArray[0]);
    
        assignGeocodeBySearchTerms(reportsToLocalizeArray[0], searchTerms)
            .then((localizedReport) => {
                
                if(localizedReport.geometry){
                    updateInMongoDb(localizedReport);
                    if(localizedReport.geometry != geometryValueForFailures){
                        updatedReportsNumber++;
                    }
                }
                else{
                    reportsNotLocalized.push(localizedReport);
                }
    
                return updateInMongoDbAsQueue(reportsToLocalizeArray.slice(1), reportsNotLocalized, updatedReportsNumber, totalReportsToUpdate);
            })
            .catch((error) => {
                mongoDbClient.close();
                console.error(`\n${error.message}\n`);
                return;
            });
    }      
    
    function assignGeocodeBySearchTerms(reportToGeolocalize, searchTerms) {
        return new Promise((resolve, reject) => {
    
            var opencageURL = `https://api.opencagedata.com/geocode/v1/json?key=${openCageKeys.accountKey}&q=${searchTerms}&pretty=0&no_annotations=1&min_confidence=2`;
    
            opencageURL = encodeURI(opencageURL);
    
            https.get(opencageURL, (response) => {
                var body = '';
    
                response.on('data', (chunk) => body += chunk);
    
                response.on('error', (err) => {
                    reject(err);
                });
    
                response.on('end', () => {
                    console.log(`Succesfully CALLED: ${opencageURL}`);
    
                    //create the object from the html page
                    var location_results = JSON.parse(body);
    
                    if (location_results.status.code != 200){
                        reject(
                            new Error("Opencage returned error " + location_results.status.code +" : "+ location_results.status.message)
                            );
                    }
                    else if (location_results.total_results > 0) {
    
                        console.log("Found some result for report " + reportToGeolocalize["_id"]);
    
                        let locationResult = getFirstLocationResultFittingCategories(location_results.results);
    
                        if (locationResult) {
    
                            if (locationResult.geometry.lat && locationResult.geometry.lng) {
                                reportToGeolocalize["geometry"] = {
                                    type: "Point",
                                    coordinates: [
                                        locationResult.geometry.lat,
                                        locationResult.geometry.lng
                                    ]
                                };
                                console.log("Succesfully added coordinates for report " + reportToGeolocalize["_id"]);
                                resolve(reportToGeolocalize);
                            }
                            else {
                                console.log("Found result but does not have coordinates for report: " + reportToGeolocalize._id);
                                reportToGeolocalize["geometry"] = geometryValueForFailures;
                                resolve(reportToGeolocalize);
                            }
                        }
                        else {
                            console.log("None of the results for report: " + reportToGeolocalize._id + " fit the categories");
                            reportToGeolocalize["geometry"] = geometryValueForFailures;
                            resolve(reportToGeolocalize);
                        }
    
                    }
                    else {
                        console.log("no results for report with _id: " + reportToGeolocalize._id + " while geolocalizing");
                        reportToGeolocalize["geometry"] = geometryValueForFailures;
                        resolve(reportToGeolocalize);
                    }
    
                });
            });
        });
    }    

    function getFirstLocationResultFittingCategories(locationResults) {
        var locationResultsFittingCategories = locationResults.filter((locationResult) => {
            var allowedCategories = ["natural/water", "outdoors/recreation", "travel/tourism", "unknown"];
            return allowedCategories.indexOf(locationResult.components._category) > -1;
        });
    
        if (locationResultsFittingCategories.length > 0) {
            return locationResultsFittingCategories[0];
        }
        else {
            return undefined;
        }
    }

    function updateInMongoDb(localizedReport) {
        mongoDbClient
            .db()
            .collection(collectionName)
            .updateOne(
                { "_id": localizedReport._id },
                { $set: { geometry: localizedReport.geometry } },
                function (err, res) {
                    
                    if (err) throw err;
    
                    console.log(`${localizedReport._id} succesfully updated`);
                }
            );
    }

    return {
        assignGeocodeToQueryResults : assignGeocodeToQueryResults
    }

}