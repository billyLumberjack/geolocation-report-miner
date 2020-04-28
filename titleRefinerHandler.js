module.exports = function(pythonScriptFolder, pythonScriptName) {

    const childProcessLib = require("child_process");

    function synchRefineFromTitlesArray (titleToRefine) {

        var pythonScriptPath = pythonScriptFolder + pythonScriptName;
        
        return childProcessLib.spawnSync(
            'python3',
            [pythonScriptPath, titleToRefine], 
            {
                cwd : pythonScriptFolder,
                shell: true
            })
            .stdout.toString();
    }

    return {
        synchRefineFromTitlesArray : synchRefineFromTitlesArray
    };
};