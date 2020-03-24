const MongoClient = require('mongodb').MongoClient;
const https = require('https');

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // needed because of winzozz error

var username = 'root';
var password = 'root';
var shards = [
    'cluster0-shard-00-00-shxrr.mongodb.net:27017',
    'cluster0-shard-00-01-shxrr.mongodb.net:27017',
    'cluster0-shard-00-02-shxrr.mongodb.net:27017'
    ];
var database = 'MyDatabase';

var mongoDbConnectionString = 'mongodb://' + username + ':' + password + '@' + shards.join(',') + '/' + database + '?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin';

var collectionName = 'test-report-collection';

var errorCallback = function(findErr, result){
    if (findErr) throw findErr;
    console.log(result.name);
    client.close();
};

var p = {
    filter: {
        geometry : {$exists:false}
    },
    project: {},
    sort: {
        Date:-1,
        CreatedAt: -1
    },
    limit: 1,
    skip: 0
};

var updateInMongoDb = function(localizedReport , mongoDbClient , isLastReport){
    mongoDbClient.db('MyDatabase').collection(collectionName)
        .updateOne(
            {"_id" : localizedReport._id},
            {$set : { geometry : localizedReport.geometry }},
            function(err, res){
                if (err) throw err;
                console.log(localizedReport._id + " succesfully updated");
            }
        );

    if(isLastReport){
        mongoDbClient.close();
    }
}

MongoClient.connect(mongoDbConnectionString, function (error, currentClient) {

    if (error) throw error;

    currentClient.db('MyDatabase').collection(collectionName).find(p.filter, p.project)
        .sort(p.sort)
        .skip(p.skip)
        .limit(p.limit)
        .toArray(function(error , reportsToLocalizeArray){

            if (error) throw error;

            console.log(reportsToLocalizeArray.length  + " reports to localize");

            var locatePromises = reportsToLocalizeArray.map((reportToGeolocalize) => {
                return locate(reportToGeolocalize)
            });

            console.log("Got " + locatePromises.length + " promises");

            var updatedReports = 0

            var geolocalizedReport = locatePromises.map((locatePromise , currentIndex , promisesArray) => {
                updatedReports++

                var isLastReport = updatedReports === promisesArray.length

                locatePromise
                    .then(localizedReport => updateInMongoDb(localizedReport , currentClient , isLastReport))
                    .catch((error) => {throw error})
            });
        });




});

function locate(report){
    return new Promise((resolve, reject) => {
        var opencageURL = "https://api.opencagedata.com/geocode/v1/json?key=efb086e9e0884dc7a05179eb453bf2ab&q=TripName,Region&pretty=0&no_annotations=1";

        opencageURL = opencageURL.replace("TripName", report.SearchTripName);
        opencageURL = opencageURL.replace("Region", report.Region);

        opencageURL = encodeURI(opencageURL);

        https.get(opencageURL, (response) => {
            var body = '';

            response.on('data', (chunk) => body += chunk);

            response.on('error', (err) => {
                throw err;
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
                    return undefined;
                }

            });
        });
    });


}