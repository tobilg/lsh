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

// Initialize configuration
const initalizeConfig = () => {
    // Start configuration
    const startConfig = {
        bucketName: config.bucketName || `lsh-${Math.random().toString(36).substring(2, 15)}`,
        memorySize: 128,
        timeout: 60,
        region: config.region || 'us-east-1',
        functionName: config.functionName || 'lsh',
        stackName: config.stackName || 'lambda-shell',
        useVPC: false
    };
    // Write to config file
    fs.writeFileSync(configPath, JSON.stringify(startConfig));
    // Return start configuration
    return startConfig;
}

// Persist current configuration
const persistConfig = () => {
    // Write to config file
    fs.writeFileSync(configPath, JSON.stringify(config));
}

// Check if configuration exists, if not, create one from defaults
try {
    if (fs.statSync(configPath)) {
        // Load config file
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (err) {
    // Use start config
    config = initalizeConfig();
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
        const errorStatus = ['CREATE_FAILED', 'UPDATE_FAILED', 'DELETE_FAILED', 'ROLLBACK_COMPLETE', 'ROLLBACK_FAILED', 'UPDATE_ROLLBACK_COMPLETE', 'UPDATE_ROLLBACK_FAILED'];
        const startTime = new Date().getTime();
        let endTime = null;
        const interval = setInterval(async () => {
            try {
                const result = await cloudformation.describeStackEvents({ StackName: config.stackName }).promise();
                result.StackEvents.forEach(resource => {
                    if (resource.ResourceType === 'AWS::CloudFormation::Stack') {
                        if (resource.ResourceStatus === status) {
                            endTime = new Date().getTime();
                            clearInterval(interval);
                            resolve(endTime-startTime);
                        } else if (errorStatus.indexOf(resource.ResourceStatus) > -1) {
                            endTime = new Date().getTime();
                            clearInterval(interval);
                            reject({ err: `Failed with status '${resource.ResourceStatus}'`, took: (endTime-startTime) });
                        }
                    }
                });
                console.log('.. Waiting');
            } catch (err) {
                endTime = new Date().getTime();
                clearInterval(interval);
                reject({ err: err, took: (endTime-startTime) });
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
        this.log('Welcome to the Lambda shell!\nYou can now directly enter shell commands which will be run in the Lambda environment. To exit, type `exit`.');
        callback();
    })
    .delimiter('$ ')
    .action(async function(command, callback) {
        
        // Instantiate
        const lambda = new AWS.Lambda({region: config.region});

        try {

            // Trigger lambda function
            const runResult = await lambda.invoke({
                FunctionName: config.functionName,
                InvocationType: 'RequestResponse',
                Payload: JSON.stringify({command: command})
            }).promise();

            // Handle result
            const payload = JSON.parse(runResult.Payload);

            // Handle stderr
            const stderr = Buffer.from(payload.stderr, 'base64').toString('ascii');

            // Check for error
            if (payload.error || stderr.length > 0) {
                this.log(stderr);
            } else if (payload.errorMessage) {
                this.log('Lambda execution failed');
            } else {
                const stdout = Buffer.from(payload.stdout, 'base64').toString('ascii');
                this.log(stdout);
            }

            callback();

        } catch (err) {
            if (err.code && err.code === 'ResourceNotFoundException') {
                this.log(formatLog('Lambda function not installed. Please run \'install\' first', 'nok'));
            } else {
                this.log(formatLog(err.message, 'nok'));
            }
            callback();
        }
        
    });

vorpal
    .command('install', 'Deploy the lsh stack in your AWS account.')
    .option('-b, --bucket <bucketName>', 'Name of the S3 bucket.')
    .option('-r, --region <regionName>', 'Region to which the Lambda function shall be deployed to (default: us-east-1).')
    .option('-m, --memory <memoryMegabytes>', 'Amount of memory in meagabytes the Lambda function shall have available (default: 1536).')
    .option('-t, --timeout <timeoutSeconds>', 'Timeout in seconds of the Lambda function (default: 60).')
    .option('-e, --efs-ap-arn <efsAccessPointArn>', 'The ARN of the preconfigured EFS AccessPoint.')
    .option('-f, --efs-fs-arn <efsFileSystemArn>', 'The ARN of the preconfigured EFS FileSystem.')
    .option('-p, --path <efsMountPath>', 'The absolute path where the EFS file system shall be mounted (needs to have /mnt/ prefix).')
    .option('-s, --security-group <securityGroupId>', 'The ID of the VPC SecurityGroup to use.')
    .option('-n, --subnet <subnetId>', 'The ID of the VPC Subnet to use.')
    .option('-i, --role <roleArn>', 'ARN of the IAM role to be used by the Lambda function. (default: role created by lsh)')
    .action(async function(command, callback) {

        let isConfigOk = true;

        // Handle configuration input
        if (command.options.bucket) {
            config.bucketName = command.options.bucket;
        }
        if (command.options.region) {
            config.region = command.options.region;
        }
        if (command.options.memory) {
            config.memorySize = parseInt(command.options.memory);
        }
        if (command.options.timeout) {
            config.timeout = parseInt(command.options.timeout);
        }
        if (command.options['efs-ap-arn']) {
            config.efsAccessPointArn = command.options['efs-ap-arn'];
        }
        if (command.options['efs-fs-arn']) {
            config.efsFileSystemArn = command.options['efs-fs-arn'];
        }
        if (command.options.path) {
            config.efsMountPath = command.options.path;
        }
        if (command.options['security-group']) {
            config.securityGroupId = command.options['security-group'];
        }
        if (command.options.subnet) {
            config.subnetId = command.options.subnet;
        }
        if (command.options.role) {
            config.roleArn = command.options.role;
        }
        
        // Check VPC configuration
        if ((config.securityGroupId && !config.subnetId) || (config.subnetId && !config.securityGroupId)) {
            this.log(formatLog(`Invalid VPC configuration. Please specify both '-s' and the '-n' flags`, 'nok'));
            isConfigOk = false;
        } else if (config.securityGroupId && config.subnetId) {
            this.log(formatLog(`Using VPC`, 'ok'));
            config.useVPC = true;
        }

        // Check EFS config
        if ((config.efsAccessPointArn && !config.efsMountPath) || (config.efsMountPath && !config.efsAccessPointArn)) {
            this.log(formatLog(`Invalid EFS configuration. Please specify both '-e' and the '-p' flags`, 'nok'));
            isConfigOk = false;
        } else if ((config.efsAccessPointArn && config.efsMountPath) && !config.useVPC) {
            this.log(formatLog(`Please also configure the VPC settings if you want to use EFS (both '-s' and the '-n' flags)`, 'nok'));
            isConfigOk = false;
        } else {
            this.log(formatLog(`Using EFS`, 'ok'));
        }

        // Check role
        const arnRegex = /^arn:aws:iam::\d{12}:role\/[a-zA-Z0-9+=,.@\-_/]+$/;
        if (config.roleArn && !arnRegex.test(config.roleArn)) {
            this.log(formatLog(`Invalid role ARN. Please specify a valid ARN.`, 'nok'));
            isConfigOk = false;
        } else if (config.roleArn) {
            this.log(formatLog(`Using role ${config.roleArn}`, 'ok'));
        }

        // Check if configuration is deemed ok
        if (isConfigOk) {
            // Write current configuration
            persistConfig(config);

            // Set archive path
            const lambdaArchivePath = path.join(os.tmpdir(), '/lambda.zip');

            // Set lambda path
            const lambdaPath = path.join(__dirname, '../', 'lambda', 'index.js');

            // Dynamic values
            let bucketExists = false;
            let templateURL = null;
            const stackParams = {
                StackName: config.stackName,
                Capabilities: ['CAPABILITY_IAM'],
                Parameters: [
                    {
                        ParameterKey: 'S3Bucket',
                        ParameterValue: config.bucketName
                    },
                    {
                        ParameterKey: 'MemorySize',
                        ParameterValue: config.memorySize.toString()
                    },
                    {
                        ParameterKey: 'LambdaTimeout',
                        ParameterValue: config.timeout.toString()
                    },
                    {
                        ParameterKey: 'LambdaRole',
                        ParameterValue: config.roleArn ? config.roleArn : ''
                    }
                ]
            };

            const s3 = new AWS.S3({ region: config.region });
            const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15', region: config.region });

            // Create archive of Lambda function
            const output = fs.createWriteStream(lambdaArchivePath);
            const archive = archiver('zip', {
                zlib: { level: 9 }
            });

            archive.pipe(output);
            archive.append(fs.createReadStream(lambdaPath), { name: 'index.js' });
            archive.finalize();

            this.log(formatLog(`Temporary Lambda function archive created at ${lambdaArchivePath}`, 'ok'));

            // Check if S3 bucket exists
            try {
                await s3.headBucket({
                    Bucket: config.bucketName
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
                        Bucket: config.bucketName,
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
                    Bucket: config.bucketName, 
                    Key: 'lambda.zip', 
                    Body: fs.createReadStream(lambdaArchivePath)
                }).promise();
                this.log(formatLog('Uploaded Lambda function archive', 'ok'));
            } catch (err) {
                this.log(formatLog('Upload of Lambda function archive failed', 'nok'));
                callback();
            }

            // Read CF template code
            const templateCode = JSON.parse(fs.readFileSync(path.join(__dirname, '../', '/template/lsh.json')));

            // Check if EFS is enabled
            if (config.efsAccessPointArn && config.efsMountPath) {
                // Add EFS config
                templateCode.Resources.lshFunction.Properties.FileSystemConfigs = [{
                    Arn: config.efsAccessPointArn,
                    LocalMountPath: config.efsMountPath
                }];
                templateCode.Resources.lshFunction.Properties.VpcConfig = {
                    SecurityGroupIds : [config.securityGroupId],
                    SubnetIds : [config.subnetId]
                }
                // Add EFS policy
                const efsPolicy = {
                    Sid: 'EFSReadWriteAccess',
                    Effect: 'Allow',
                    Action: [
                        'elasticfilesystem:ClientMount',
                        'elasticfilesystem:ClientRootAccess',
                        'elasticfilesystem:ClientWrite',
                        'elasticfilesystem:DescribeMountTargets'
                    ],
                    Resource: config.efsFileSystemArn
                };
                templateCode.Resources.InvokeRole.Properties.Policies[0].PolicyDocument.Statement.push(efsPolicy);
                // Add ENI policy
                const eniPolicy = {
                    Sid: 'ENICreateDelete',
                    Effect: 'Allow',
                    Action: [
                        'ec2:CreateNetworkInterface',
                        'ec2:DescribeNetworkInterfaces',
                        'ec2:DeleteNetworkInterface'
                    ],
                    Resource: '*'
                };
                templateCode.Resources.InvokeRole.Properties.Policies[0].PolicyDocument.Statement.push(eniPolicy);
            }

            // Upload CloudFormation template
            try {
                const uploadTemplateResult = await s3.upload({
                    Bucket: config.bucketName, 
                    Key: 'lsh.json', 
                    Body: Buffer.from(JSON.stringify(templateCode), 'utf8')
                }).promise();
                this.log(formatLog('Uploaded CloudFormation template', 'ok'));
                // Set template URL
                templateURL = uploadTemplateResult.Location;
            } catch (err) {
                this.log(formatLog('Upload of CloudFormation template failed', 'nok'));
                console.log(err)
                callback();
            }

            // Set template URL
            stackParams['TemplateURL'] = templateURL;

            // Create or update stack
            try {
                await cloudformation.createStack(stackParams).promise();
                this.log(formatLog('Stack creation triggered', 'ok'));
                const creationTimeTaken = await waiter(cloudformation, 'CREATE_COMPLETE');
                this.log(formatLog(`Stack created (took ${creationTimeTaken}ms)`, 'ok'));
                callback();
            } catch (err) {
                if (err.code && err.code === 'AlreadyExistsException') {
                    this.log(formatLog('Stack already exists, updating stack', 'ok'));
                    try {
                        await cloudformation.updateStack(stackParams).promise();
                        this.log(formatLog('Stack update triggered', 'ok'));
                        const updateTimeTaken = await waiter(cloudformation, 'UPDATE_COMPLETE');
                        this.log(formatLog(`Stack updated (took ${updateTimeTaken}ms)`, 'ok'));
                        callback();
                    } catch (err) {
                        if (err.code && err.code === 'ValidationError') {
                            this.log(formatLog('No resources changed, skipping', 'ok'));
                        } else {
                            this.log(formatLog(err.err, 'nok'));
                        }
                        callback();
                    }
                } else {
                    this.log(formatLog(err.message, 'nok'));
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
            const deletionTimeTaken = await waiter(cloudformation, 'DELETE_COMPLETE');
            this.log(formatLog(`Stack deleted (took ${deletionTimeTaken}ms)`, 'ok'));
            callback();
        } catch (error) {
            if (error.err.code && error.err.code === 'ValidationError') {
                this.log(formatLog(`Stack deleted (took ${error.took}ms)`, 'ok'));
                callback();
            } else {
                this.log(formatLog(error.err, 'nok'));
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
    .command('config', 'Print the current Lambda configuration.')
    .action(function(command, callback) {
        this.log(formatLog(`Memory     ${config.memorySize}mb`, 'ok'));
        this.log(formatLog(`Timeout    ${config.timeout}s`, 'ok'));
        this.log(formatLog(`Region     ${config.region}`, 'ok'));
        this.log(formatLog(`S3 Bucket  ${config.bucketName}`, 'ok'));
        callback();
    });

vorpal
    .command('reset', 'Reset the current Lambda configuration to the defaults.')
    .action(function(command, callback) {
        initalizeConfig();
        this.log(formatLog(`Reset configuration to defaults`, 'ok'));
        callback();
    });

vorpal
    .delimiter('λ ')
    .show();
