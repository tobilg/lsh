process.env['PATH'] = process.env['PATH'] + ':' + process.cwd();

const exec = require('child_process').exec;
const MAX_OUTPUT = 1024 * 1024 * 1024; // 1 GB
let cwd = null;
exports.handler = function(event, context) {
    var child = exec(`${event.command} && pwd`, {encoding: 'binary', maxBuffer: MAX_OUTPUT, cwd: cwd},
        function (error, stdout, stderr) {
            let newStdOut = '';
            if (!error) {
                const temp = stdout.split('\n');
                cwd = temp[temp.length-2];
                temp.pop();
                temp.pop();
                newStdOut = temp.join('\n');
            } else {
                newStdOut = stdout;
            }
            const result = {
                "stdout": Buffer.from(`${newStdOut}`, 'binary').toString('base64'),
                "stderr": Buffer.from(stderr, 'binary').toString('base64'),
                "error": error
            };
            context.succeed(result);
        }
    );
}
