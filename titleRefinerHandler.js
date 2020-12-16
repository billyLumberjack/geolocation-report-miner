module.exports = function(executable) {

    const childProcessLib = require("child_process");

    function synchRefineFromTitlesArray (titleToRefine) {
       
        return childProcessLib.spawnSync(
            executable,
            [titleToRefine]
	    )
            .stdout.toString();
    }

    return {
        synchRefineFromTitlesArray : synchRefineFromTitlesArray
    };
};
