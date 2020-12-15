const uuid = require("uuid");
const CWLogsWritable = require('cwlogs-writable');

function cloudWatchError(err, logEvents, next) {
    if (logEvents) {
        console.error(
            'CWLogsWritable PutLogEvents error',
            err,
            JSON.stringify(logEvents)
        );

        // Resume without adding the log events back to the queue.
        next();
    }
    else {
        // Use built-in behavior of emitting an error,
        // clearing the queue, and ignoring all writes to the stream.
        next(err);
    }
}

//costrutture
/**
 * @param {string} logGroupName
 * @param {string} streamPrefix
 * @param {any} awsConfig
 */
function CwLogsHelper(logGroupName, streamPrefix, awsConfig) {
    //creo nome dello stream
    var logStreamName = [
        streamPrefix,
        new Date().toISOString(),
        uuid.v1()
    ].filter(Boolean).join('/').replace(/[:*]/g, '');

    this.stream = new CWLogsWritable({
        logGroupName: logGroupName,
        logStreamName: logStreamName,
        cloudWatchLogsOptions: awsConfig,
        onError: cloudWatchError
    }).on('error', function (err) {
        // Always listen for 'error' events to catch non-AWS errors as well.
        console.error('CWLogsWritable error', err);
    });
};

/**
 * @param {string} str
 */
//metodo
CwLogsHelper.prototype.write = function (str) {
    this.stream.write(str);
    console.log(str);
};
//export
module.exports = CwLogsHelper;