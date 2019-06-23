#! /usr/bin/env node
const vorpal = require('vorpal')();
const package = require('../package.json');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const figlet = require('figlet');
const chalk = require('chalk');

// Configuration
let config = {
    bucketName: 'lsh-abcdef',
    memorySize: 1536,
    timeout: 60,
    region: 'us-east-1',
    functionName: 'lsh',
    stackName: 'lambda-shell'
};

// Waiter function for stack events
const waiter = (cloudformation, status, timeout=2000) => {
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const result = await cloudformation.describeStackEvents({ StackName: config.stackName }).promise();
                //self.log(JSON.stringify(result.StackEvents))
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
    .mode('shell', 'Switch into interactive shell mode as if you\'d be ssh\'ed in the Lambda container.')
    .init(function(args, callback){
        this.log(chalk.green(
            figlet.textSync("Lambda shell", {
                font: "3D-ASCII",
                horizontalLayout: "default",
                verticalLayout: "default"
            })
        ))
        this.log('Welcome to interactive mode.\nYou can now directly enter arbitrary shell commands. To exit, type `exit`.');
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
        this.log(command);

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

        // Check if S3 bucket exists
        try {
            await s3.headBucket({
                Bucket: bucketName
            }).promise();
            bucketExists = true;
            this.log('Bucket exists');
        } catch (err) {
            this.log('Bucket doesn\'t exist')
        }

        // If not, create S3 bucket
        if (!bucketExists) {
            try {
                await s3.createBucket({
                    Bucket: bucketName,
                    ACL: 'private'
                }).promise();
                this.log('Bucket created!')
            } catch (err) {
                this.log(err);
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
            this.log('Uploaded Lambda function')
        } catch (err) {
            this.log(err);
            callback();
        }

        // Upload CloudFormation template
        try {
            const uploadTemplateResult = await s3.upload({
                Bucket: bucketName, 
                Key: 'lsh.json', 
                Body: fs.createReadStream(path.join(__dirname, '../', '/template/lsh.json'))
            }).promise();
            this.log('Uploaded template');
            // Set template URL
            templateURL = uploadTemplateResult.Location;
        } catch (err) {
            this.log(err);
            callback();
        }

        // Set template URL
        stackParams['TemplateURL'] = templateURL;

        // Create or update stack
        try {
            await cloudformation.createStack(stackParams).promise();
            this.log('Stack creation triggered');
            await waiter(cloudformation, 'CREATE_COMPLETE');
            this.log('Stack created');
            callback();
            
        } catch (err) {
            if (err.code === 'AlreadyExistsException') {
                this.log('Stack already exists, updating stack');
                try {
                    await cloudformation.updateStack(stackParams).promise();
                    this.log('Stack update triggered');
                    await waiter(cloudformation, 'UPDATE_COMPLETE');
                    this.log('Stack updated');
                    callback();
                } catch (err) {
                    if (err.code === 'ValidationError') {
                        this.log('No updates, skipping');
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
            this.log('Deleted keys in S3 bucket');
        } catch (err) {
            callback();
        }

        // Delete S3 bucket
        try {
            await s3.deleteBucket({
                Bucket: config.bucketName
            }).promise();
            this.log('Deleted S3 bucket');
        } catch (err) {
            callback();
        }

        // Delete stack
        try {
            await cloudformation.deleteStack({
                StackName: config.stackName
            }).promise();
            this.log('Stack deletion triggered');
            await waiter(cloudformation, 'DELETE_COMPLETE');
            this.log('Stack deleted');
            callback();
        } catch (err) {
            if (err.code === 'ValidationError') {
                this.log('Stack deleted');
                callback();
            } else {
                this.log(err);
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
