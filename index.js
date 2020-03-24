const MongoClient = require('mongodb').MongoClient;
const https = require('https');

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // needed because of winzozz error


function makeConnectionString(username , password , shards , database){
    return 'mongodb://' + username + ':' + password + '@' + shards.join(',') + '/' + database + '?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin';
}

function updateInMongoDb(localizedReport , mongoDbClient){
    mongoDbClient.db(database).collection(collectionName)
        .updateOne(
            {"_id" : localizedReport._id},
            {$set : { geometry : localizedReport.geometry }},
            function(err, res){
                if (err) throw err;
                console.log(localizedReport._id + " succesfully updated");
            }
        );
}

var database = 'MyDatabase';
var collectionName = 'test-report-collection';
var mongoDbConnectionString = makeConnectionString(
    'root',
    'root',
     [
        'cluster0-shard-00-00-shxrr.mongodb.net:27017',
        'cluster0-shard-00-01-shxrr.mongodb.net:27017',
        'cluster0-shard-00-02-shxrr.mongodb.net:27017'
    ],
    database
);

MongoClient.connect(mongoDbConnectionString, function (error, currentClient) {

    if (error) throw error;

    var queryParameters = {
        filter: {
            geometry : {$exists:false}
        },
        project: {},
        sort: {
            Date:-1,
            CreatedAt: -1
        },
        limit: 2000,
        skip: 0
    };

    currentClient.db(database).collection(collectionName).find(queryParameters.filter, queryParameters.project)
        .sort(queryParameters.sort)
        .skip(queryParameters.skip)
        .limit(queryParameters.limit)
        .toArray(function(error , reportsToLocalizeArray){

            if (error) throw error;

            console.log(reportsToLocalizeArray.length  + " reports to localize");

            var locatePromises = reportsToLocalizeArray.map((reportToGeolocalize) => {
                return locate(reportToGeolocalize)
            });

            console.log("Got " + locatePromises.length + " promises");

            Promise.all(locatePromises).then(function(geolocalizedReportArray){
                geolocalizedReportArray
                    .filter((gelocalizedReport) => {return gelocalizedReport != undefined})
                    .forEach(gelocalizedReport => updateInMongoDb(gelocalizedReport , currentClient))
            })
            .then(() => {
                currentClient.close();
            })
            .catch((error) => {throw error});
        });
});

function locate(report){
    return new Promise((resolve, reject) => {
        var opencageURL = "https://api.opencagedata.com/geocode/v1/json?key=efb086e9e0884dc7a05179eb453bf2ab&q=TripName,Region&pretty=0&no_annotations=1&min_confidence=2"
            .replace("TripName", report.SearchTripName)
            .replace("Region", report.Region);

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

                if(location_results.status.code == 402){
                    reject("open cage returned 402: quota exceeded");
                }
                else if(location_results.total_results > 0 && location_results.results[0].geometry.lat && location_results.results[0].geometry.lng){
                    report["geometry"] = {
                        type: "Point",
                        coordinates: [
                            location_results.results[0].geometry.lat,
                            location_results.results[0].geometry.lng
                        ]
                    };
                    console.log("Succesfully added coordinates for report " + report["_id"]);
                    resolve(report);
                }
                else{
                    console.log("something wrong with report _id: " + report._id +" while geolocalizing");
                    resolve(undefined);
                }

            });
        });
    });


}