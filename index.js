var MongoClient = require('mongodb').MongoClient;

var username = 'root';
var password = 'root';
var shards = ['cluster0-shard-00-00-shxrr.mongodb.net:27017',
    'cluster0-shard-00-01-shxrr.mongodb.net:27017',
    'cluster0-shard-00-02-shxrr.mongodb.net:27017'];
var database = 'MyDatabase';

var url = 'mongodb://' + username + ':' + password + '@' + shards.join(',') + '/' + database + '?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin';
console.log(url);

var collectionName = 'test-report-collection';

MongoClient.connect(url, function (err, client) {
    if (err) {
        console.log(err);
        return;
    }
    var db = client.db('MyDatabase');
    db.collection(collectionName).findOne({}, function (findErr, result) {
        if (findErr) throw findErr;
        console.log(result.name);
        client.close();
    });
});