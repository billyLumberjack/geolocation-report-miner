const MongoClient = require('mongodb').MongoClient;
const MongoDbHandlerFactory = require("./mongoDbHandler");
const dotenv = require('dotenv');
dotenv.config();

const mongoDbConnectionString = (function createConnectionString(username, password, shards, databaseName) {
    var joinesShardsString = shards.join(',');
    return `mongodb://${username}:${password}@${joinesShardsString}/${databaseName}?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin`;
})(
    'root',
    'root',
    [
        'cluster0-shard-00-00-shxrr.mongodb.net:27017',
        'cluster0-shard-00-01-shxrr.mongodb.net:27017',
        'cluster0-shard-00-02-shxrr.mongodb.net:27017'
    ],
    'MyDatabase'
);

MongoClient.connect(mongoDbConnectionString, function(error, mongoDbClient){

    if (error) throw error;


    const mongoDbHandler = MongoDbHandlerFactory(mongoDbClient, "production-report-collection");
    const queryParameters = {
        filter: {
            geometry: { $exists: false }
        },
        project: {},
        sort: {
            Date: -1,
            CreatedAt: -1
        },
        limit: 10,
        skip: 0
    };

    mongoDbHandler.assignGeocodeToQueryResults(queryParameters);
});