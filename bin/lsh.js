#! /usr/bin/env node
const package = require('../package.json');
const vorpal = require('vorpal')();
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AWS = require('aws-sdk');
const figlet = require('figlet');
const chalk = require('chalk');

// Create config file
const configPath = `${os.homedir()}/.lsh`;

// Store config
let config = {};

try {
    if (fs.statSync(configPath)) {
        // Load config file
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (err) {
    // Create config file
    const startConfig = {
        bucketName: `lsh-${Math.random().toString(36).substring(2, 15)}`,
        memorySize: 1536,
        timeout: 60,
        region: 'us-east-1',
        functionName: 'lsh',
        stackName: 'lambda-shell'
    };
    // Write to config file
    fs.writeFileSync(configPath, JSON.stringify(startConfig));
    // Use start config
    config = startConfig;
}

// Fornat logs
const formatLog = (input, type) => {
    if (type === 'ok') {
        return ` ${chalk.green('✓')} ${input}`;
    } else if (type === 'nok') {
        return ` ${chalk.red('✗')} ${input}`;
    } else {
        return '';
    }
}

// Waiter function for stack events
const waiter = (cloudformation, status, timeout=2000) => {
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const result = await cloudformation.describeStackEvents({ StackName: config.stackName }).promise();
                result.StackEvents.forEach(resource => {
                    if (resource.ResourceType === 'AWS::CloudFormation::Stack' && resource.ResourceStatus === status) {
                        clearInterval(interval);
                        resolve();
                    }
                });
            } catch (err) {
                reject(err);
            }
        }, timeout);
    });
}

vorpal
    .mode('shell', 'Switch into interactive shell mode.')
    .init(function(args, callback){
        this.log(chalk.green(
            figlet.textSync("lsh", {
                font: "3D-ASCII",
                horizontalLayout: "default",
                verticalLayout: "default"
            })
        ))
        this.log('Welcome to the Lambda shell!\nYou can now directly enter arbitrary shell commands. To exit, type `exit`.');
        callback();
    })
    .delimiter('$ ')
    .action(async function(command, callback) {
        
        // Instantiate
        const lambda = new AWS.Lambda({region: config.region});
          
        // Trigger lambda function
        const runResult = await lambda.invoke({
            FunctionName: config.functionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({command: command})
        }).promise();

        // Handle result
        const payload = JSON.parse(runResult.Payload);
        const stdout = Buffer.from(payload.stdout, 'base64').toString('ascii');
        const stderr = Buffer.from(payload.stderr, 'base64').toString('ascii');

        // Check for error
        if (payload.error) {
            this.log(stderr);
        } else {
            this.log(stdout);
        }

        callback();
    });

vorpal
    .command('install', 'Deploy the lsh stack in your AWS account.')
    .option('-b, --bucket <bucketName>', 'Name of the S3 bucket.')
    .option('-r, --region <regionName>', 'Region to which the Lambda function shall be deployed to (default: us-east-1).')
    .option('-m, --memory <memoryMegabytes>', 'Amount of memory in meagabytes the Lambda function shall have available (default: 1536).')
    .option('-t, --timeout <timeoutSeconds>', 'Timeout in seconds of the Lambda function (default: 60).')
    .action(async function(command, callback) {

        // Defaults
        const bucketName = (command.options.bucket ? command.options.bucket : config.bucketName);
        const region = (command.options.region ? command.options.region : config.region);
        const memorySize = (command.options.memory ? command.options.memory : config.memorySize);
        const timeout = (command.options.timeout ? command.options.timeout : config.timeout);

        // Dynamic values
        let bucketExists = false;
        let templateURL = null;
        const stackParams = {
            StackName: config.stackName,
            Capabilities: ['CAPABILITY_IAM'],
            Parameters: [
                {
                    ParameterKey: 'S3Bucket',
                    ParameterValue: bucketName
                },
                {
                    ParameterKey: 'MemorySize',
                    ParameterValue: memorySize.toString()
                },
                {
                    ParameterKey: 'LambdaTimeout',
                    ParameterValue: timeout.toString()
                }
            ]
        };

        const s3 = new AWS.S3();
        const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15', region: region });

        // Create archive of Lambda function
        const output = fs.createWriteStream(path.join(__dirname, '../', '/lambda.zip'));
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        archive.pipe(output);
        archive.directory('lambda/', false);
        archive.finalize();

        this.log(formatLog('ZIP file created', 'ok'));

        // Check if S3 bucket exists
        try {
            await s3.headBucket({
                Bucket: bucketName
            }).promise();
            bucketExists = true;
            this.log(formatLog('Bucket exists', 'ok'));
        } catch (err) {
            this.log(formatLog('Bucket doesn\'t exist', 'ok'));
        }

        // If not, create S3 bucket
        if (!bucketExists) {
            try {
                await s3.createBucket({
                    Bucket: bucketName,
                    ACL: 'private'
                }).promise();
                this.log(formatLog('Bucket created!', 'ok'));
            } catch (err) {
                this.log(formatLog('S3 bucket creation failed', 'nok'));
                callback();
            }
        }

        // Upload Lambda archive
        try {
            await s3.upload({
                Bucket: bucketName, 
                Key: 'lambda.zip', 
                Body: fs.createReadStream(path.join(__dirname, '../', '/lambda.zip'))
            }).promise();
            this.log(formatLog('Uploaded Lambda function', 'ok'));
        } catch (err) {
            this.log(formatLog('Upload of Lambda function failed', 'nok'));
            callback();
        }

        // Upload CloudFormation template
        try {
            const uploadTemplateResult = await s3.upload({
                Bucket: bucketName, 
                Key: 'lsh.json', 
                Body: fs.createReadStream(path.join(__dirname, '../', '/template/lsh.json'))
            }).promise();
            this.log(formatLog('Uploaded CloudFormation template', 'ok'));
            // Set template URL
            templateURL = uploadTemplateResult.Location;
        } catch (err) {
            this.log(formatLog('Upload of CloudFormation template failed', 'nok'));
            callback();
        }

        // Set template URL
        stackParams['TemplateURL'] = templateURL;

        // Create or update stack
        try {
            await cloudformation.createStack(stackParams).promise();
            this.log(formatLog('Stack creation triggered', 'ok'));
            await waiter(cloudformation, 'CREATE_COMPLETE');
            this.log(formatLog('Stack created', 'ok'));
            callback();
            
        } catch (err) {
            if (err.code === 'AlreadyExistsException') {
                this.log('Stack already exists, updating stack');
                try {
                    await cloudformation.updateStack(stackParams).promise();
                    this.log(formatLog('Stack update triggered', 'ok'));
                    await waiter(cloudformation, 'UPDATE_COMPLETE');
                    this.log(formatLog('Stack updated', 'ok'));
                    callback();
                } catch (err) {
                    if (err.code === 'ValidationError') {
                        this.log(formatLog('No updates, skipping', 'ok'));
                    }
                    callback();
                }
            }
        }
        
    });

vorpal
    .command('uninstall', 'Remove the lsh stack from your AWS account.')
    .action(async function(command, callback) {

        const s3 = new AWS.S3();
        const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15', region: config.region });

        // Clean S3 bucket
        try {
            await s3.deleteObjects({
                Bucket: config.bucketName,
                Delete: {
                    Objects: [
                        {
                            Key: "lsh.json"
                        }, 
                        {
                            Key: "lambda.zip"
                        }
                    ], 
                    Quiet: true
                }
            }).promise();
            this.log(formatLog('Deleted keys in S3 bucket', 'ok'));
        } catch (err) {
            this.log(formatLog('Deletion of S3 keys failed', 'nok'));
            callback();
        }

        // Delete S3 bucket
        try {
            await s3.deleteBucket({
                Bucket: config.bucketName
            }).promise();
            this.log(formatLog('Deleted S3 bucket', 'ok'));
        } catch (err) {
            this.log(formatLog('Deletion of S3 bucket failed', 'nok'));
            callback();
        }

        // Delete stack
        try {
            await cloudformation.deleteStack({
                StackName: config.stackName
            }).promise();
            this.log(formatLog('Stack deletion triggered', 'ok'));
            await waiter(cloudformation, 'DELETE_COMPLETE');
            this.log(formatLog('Stack deleted', 'ok'));
            callback();
        } catch (err) {
            if (err.code === 'ValidationError') {
                this.log(formatLog('Stack deleted', 'ok'));
                callback();
            } else {
                this.log(formatLog('Deletion of CloudFormation stack failed', 'nok'));
                callback();
            }
        }

    });

vorpal
    .command('version', 'Print version information.')
    .action(function(command, callback) {
        this.log(package.version);
        callback();
    });

vorpal
    .delimiter('λ ')
    .show();
