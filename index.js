var MongoClient = require('mongodb').MongoClient;

var username = 'root';
var password = 'root';
var shards = ['cluster0-shard-00-00-shxrr.mongodb.net:27017',
    'cluster0-shard-00-01-shxrr.mongodb.net:27017',
    'cluster0-shard-00-02-shxrr.mongodb.net:27017'];

var connectionString = 'mongodb://' + username + ':' + password + '@' + shards.join(', ') + '/test?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin';

var databaseName = 'MyDatabase';
var collectionName = 'test-report-collection';

MongoClient.connect(connectionString, function (err, client) {
        if (null == err) {
            console.log('Error connecting to server');
            return;
        }
        console.log('Connected successfully to server');
        var db = client.db(databaseName);

        client.close();
    }
);