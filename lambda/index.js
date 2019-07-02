const { exec } = require('child_process');

// Set path
process.env['PATH'] = process.env['PATH'] + ':' + process.cwd();

// Set home directory
process.env['HOME'] = '/tmp';

// Set buffer size to half of the Lambda memory
const MAX_OUTPUT = ((parseInt(process.env['AWS_LAMBDA_FUNCTION_MEMORY_SIZE']) * 1024 * 1024) / 2);

// Store current working directory. Initial one is /tmp because it's the only writable path
let cwd = '/tmp';

// Extract relevant infos from stdout
const extract = (input, isStdout) => {
    const lines = input.split('\n');
    // Remove last line if it's empty
    if (lines[lines.length-1].length === 0) lines.pop();
    // Remove second last line and use it as cwd
    if (isStdout) cwd = lines.pop();
    // Return concatenated output
    return lines.join('\n');
};

// Promisified exec()
const execPromise = (command) => {
    return new Promise(function(resolve, reject) {
        exec(`${command} && pwd`, { encoding: 'binary', maxBuffer: MAX_OUTPUT, cwd: cwd }, (error, stdout, stderr) => {
            const cleanedStdout = extract(stdout, true);
            const cleanedStderr = extract(stderr, false);
            // Define response format
            const response = {
                "stdout": Buffer.from(cleanedStdout, 'binary').toString('base64'),
                "stderr": Buffer.from(cleanedStderr, 'binary').toString('base64'),
                "error": error
            };
            resolve(response);
        });
    });
}

exports.handler = async (event, context) => {
    // Run command and get command output
    const commandOutput = await execPromise(event.command);
    // Return command output
    context.succeed(commandOutput);
}
