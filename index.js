const MongoClient = require('mongodb').MongoClient;
const https = require('https');

var username = 'root';
var password = 'root';
var shards = ['cluster0-shard-00-00-shxrr.mongodb.net:27017',
    'cluster0-shard-00-01-shxrr.mongodb.net:27017',
    'cluster0-shard-00-02-shxrr.mongodb.net:27017'];
var database = 'MyDatabase';

var url = 'mongodb://' + username + ':' + password + '@' + shards.join(',') + '/' + database + '?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin';

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
    limit: 21,
    skip: 0
};

var client;

var result_to_array_callback = function (err, result){
    if (err) throw err;

    var promise_array = [];
    
    for (let obj of result) {
        console.log("locating: " + obj._id);
        promise_array.push(locate(obj));
    }

    Promise.all(promise_array).then((localized_reports)=>{
        
        for(let localized_report of localized_reports){
            client.db('MyDatabase').collection(collectionName)
                .updateOne({"_id" : localized_report._id},
                    {$set : { geometry : localized_report.geometry }},
                    function(err, res){
                        if (err) throw err;
                        console.log("1 document updated");
            });
        }
        
        client.close();
    })
    .catch((err)=>{
        console.log(err);
        throw err;
        client.close();
    });

    
};

MongoClient.connect(url, function (err, c) {
    if (err) throw err;

    client = c;

    c.db('MyDatabase').collection(collectionName).find(p.filter, p.project)
        .sort(p.sort)
        .skip(p.skip)
        .limit(p.limit)
        .toArray(result_to_array_callback);
        
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
                console.log("\tCALLED: " + opencageURL);

                //create the object from the html page
                var location_results = JSON.parse(body);
                if(location_results.status.code == 402){
                    if(location_results.total_results > 0 && location_results.results[0].geometry.lat && location_results.results[0].geometry.lng){
                        report["geometry"] = {
                            type: "Point",
                            coordinates: [
                                location_results.results[0].geometry.lat,
                                location_results.results[0].geometry.lng
                            ]
                        };
                        resolve(report);
                    }
                    else{
                        console.log("something wrong with report _id: " + report._id +" while geolocalizing");
                        return;
                    }
                }
                else{
                    reject("open cage returned 402: quota exceeded");
                }
            });
        });
    });    


}