const childProcessLib = require("child_process");

module.exports = {
    synchRefineTitle : function(titleToRefine) {

        var pythonScriptFolder = "../nltk_experiment/";
        var pythonScriptName = "get_toponym.py";
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
}
