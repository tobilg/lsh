const exec = require('child_process').exec;

// Set path
process.env['PATH'] = process.env['PATH'] + ':' + process.cwd();

// Set home directory
process.env['HOME'] = '/tmp';

// Set buffer size to half of the Lambda memory
const MAX_OUTPUT = ((parseInt(process.env['AWS_LAMBDA_FUNCTION_MEMORY_SIZE']) * 1024 * 1024) / 2);

// Store current working directory
let cwd = '/tmp';

exports.handler = function (event, context) {
    // Add 'pwd' to each transferred command to derive the cwd
    const child = exec(`${event.command} && pwd`, { encoding: 'binary', maxBuffer: MAX_OUTPUT, cwd: cwd },
        function (error, stdout, stderr) {
            // Log to CloudWatch
            console.log(stdout);
            console.log(stderr);
            console.log(error);

            // Hack for deriving cwd
            let newStdOut = '';
            let temp = [];
            if (!error) {
                temp = stdout.split('\n');
                cwd = temp[temp.length-2];
                temp.pop();
                temp.pop();
                newStdOut = temp.join('\n');
            } else {
                newStdOut = stdout;
            }

            // Define response
            const result = {
                "stdout": Buffer.from(newStdOut, 'binary').toString('base64'),
                "stderr": Buffer.from(stderr, 'binary').toString('base64'),
                "error": error
            };

            // Send response
            context.succeed(result);
        }
    );
}
