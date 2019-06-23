const exec = require('child_process').exec;

// Set path
process.env['PATH'] = process.env['PATH'] + ':' + process.cwd();

// Set home directory
process.env['HOME'] = '/tmp';

// Set buffer size
const MAX_OUTPUT = 1024 * 1024 * 1024; // 1 GB

// Store current working directory
let cwd = '/tmp';

exports.handler = function (event, context) {
    const child = exec(`${event.command} && pwd`, { encoding: 'binary', maxBuffer: MAX_OUTPUT, cwd: cwd },
        function (error, stdout, stderr) {
            let newStdOut = '';
            if (!error) {
                // Hack
                const temp = stdout.split('\n');
                cwd = temp[temp.length-2];
                temp.pop();
                temp.pop();
                newStdOut = temp.join('\n');
            } else {
                newStdOut = stdout;
            }
            // Define response
            const result = {
                "stdout": Buffer.from(`${newStdOut}`, 'binary').toString('base64'),
                "stderr": Buffer.from(stderr, 'binary').toString('base64'),
                "error": error
            };
            // Send response
            context.succeed(result);
        }
    );
}
