# lsh - The Lambda shell

Run interactive shell commands on AWS Lambda

[![asciicast](https://asciinema.org/a/3sXv75GuyT3BA79fuLyvJSaa3.svg)](https://asciinema.org/a/3sXv75GuyT3BA79fuLyvJSaa3?autoplay=1&t=0)

## Motivation

The main motivation for this project was to have a convenient way to

* "Poke around" the AWS Lambda environment
* Be able to have a "minimal" shell environment on AWS, without having to use more costly EC2 instances
* Do some experiments in the AWS Lambda environment, like running Docker containers via [udocker](https://github.com/indigo-dc/udocker)

## Installation

You can install the Lambda shell (`lsh`) via

```bash
$ npm i -g lambda-shell
```

## Usage

After the npm installation has finished, just run 

```bash
$ lsh
```

You can display the `help` like this:

```text
λ help

  Commands:

    help [command...]   Provides help for a given command.
    exit                Exits application.
    shell               Switch into interactive shell mode.
    install [options]   Deploy the lsh stack in your AWS account.
    uninstall           Remove the lsh stack from your AWS account.
    version             Print version information.
    config              Print the current Lambda configuration.
    reset               Reset the current Lambda configuration to the defaults.
```

### Using credentials

As `lsh` uses the AWS SDK internally, the same options to specify credentials apply (please refer to the [AWS SDK documentation](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html)). E.g. if you have created a credential file with multiple profiles, and want to use a specific profile, you can use the `AWS_PROFILE` [environment variable](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html) like this:

```bash
$ AWS_PROFILE=myprofile lsh
```

### Install stack

Before you can use `lsh`, you need to install the neccessary stack by issueing the following command:

```text
λ install
```

You can also specify options for the installation of the stack:

```bash
λ help install

  Usage: install [options]

  Deploy the lsh stack in your AWS account.

  Options:

    --help                                  output usage information
    -b, --bucket <bucketName>               Name of the S3 bucket.
    -r, --region <regionName>               Region to which the Lambda function shall be deployed to (default: us-east-1).
    -m, --memory <memoryMegabytes>          Amount of memory in meagabytes the Lambda function shall have available (default: 1536).
    -t, --timeout <timeoutSeconds>          Timeout in seconds of the Lambda function (default: 60).
    -e, --efs-ap-arn <efsAccessPointArn>    The ARN of the preconfigured EFS AccessPoint.
    -f, --efs-fs-arn <efsFileSystemArn>     The ARN of the preconfigured EFS FileSystem.
    -p, --path <efsMountPath>               The absolute path where the EFS file system shall be mounted (needs to have /mnt/ prefix).
    -s, --security-group <securityGroupId>  The ID of the VPC SecurityGroup to use.
    -n, --subnet <subnetId>                 The ID of the VPC Subnet to use.
    -i, --iamRoleArn <iamRoleArn>           ARN of the IAM role to be used by the Lambda function. (default: role created by lsh)
```

For example, to use a Lambda shell with 3GB of memory with a 900 seconds timeout in the `eu-central-1` region, use 

```text
λ install -m 3076 -t 900 -r eu-central-1
```

#### Configuration updates

You can update the Lambda configuration just by running `install` again with different options. This will trigger a CloudFormation stack update. You can then verify the changes by using the `config` command.

### Working with the interactive shell

Once you installed the stack, you can start working with `lsh`:

```text
λ shell
 ___       ________  ___  ___     
|\  \     |\   ____\|\  \|\  \    
\ \  \    \ \  \___|\ \  \\\  \   
 \ \  \    \ \_____  \ \   __  \  
  \ \  \____\|____|\  \ \  \ \  \ 
   \ \_______\____\_\  \ \__\ \__\
    \|_______|\_________\|__|\|__|
             \|_________|         
                                  
                                  
Welcome to interactive mode.
You can now directly enter arbitrary shell commands. To exit, type `exit`.
λ $ 
```

Now, you can use the Lambda shell interactively, e.g. 

```text
λ $ env
AWS_LAMBDA_FUNCTION_VERSION=$LATEST
AWS_LAMBDA_LOG_GROUP_NAME=/aws/lambda/lsh
LAMBDA_TASK_ROOT=/var/task
LD_LIBRARY_PATH=/var/lang/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib:/opt/lib
AWS_LAMBDA_LOG_STREAM_NAME=2019/06/23/[$LATEST]0bbb2d3b763b4b92a1027dedf3cbd0e2
AWS_EXECUTION_ENV=AWS_Lambda_nodejs8.10
AWS_XRAY_DAEMON_ADDRESS=169.254.79.2:2000
AWS_LAMBDA_FUNCTION_NAME=lsh
PATH=/var/lang/bin:/usr/local/bin:/usr/bin/:/bin:/opt/bin:/var/task
AWS_DEFAULT_REGION=us-east-1
PWD=/tmp
LAMBDA_RUNTIME_DIR=/var/runtime
LANG=en_US.UTF-8
NODE_PATH=/opt/nodejs/node8/node_modules:/opt/nodejs/node_modules:/var/runtime/node_modules:/var/runtime:/var/task:/var/runtime/node_modules
AWS_REGION=us-east-1
TZ=:UTC
SHLVL=1
_AWS_XRAY_DAEMON_ADDRESS=169.254.79.2
_AWS_XRAY_DAEMON_PORT=2000
_X_AMZN_TRACE_ID=Root=1-5d0fa6a8-a0cb5800d19af40014ac8000;Parent=67cfd29878f54a87;Sampled=0
AWS_XRAY_CONTEXT_MISSING=LOG_ERROR
_HANDLER=index.handler
AWS_LAMBDA_FUNCTION_MEMORY_SIZE=1536
_=/usr/bin/env
```

**Hint**

As `lsh` is invoking the Lambda function via request-response, it's for example not possible to edit files directly in the Lambda environment.

### Show current configuration

To check the current configuration, you can use 

```text
λ config
 ✓ Memory     128mb
 ✓ Timeout    120s
 ✓ Region     us-east-1
 ✓ S3 Bucket  lsh-j03nfi7agsd
```

The configuration can be changed by running `install` again and specifying different settings via the configuration options.

### Reset configuration

To reset the current configuration to the defaults, you can use

```bash
λ reset
 ✓ Reset configuration to defaults
λ config
 ✓ Memory     128mb
 ✓ Timeout    60s
 ✓ Region     us-east-1
 ✓ S3 Bucket  lsh-n45lrkvtabc
```

### Uninstall stack

To uninstall the created stack run the following command:

```text
λ uninstall
```

## Examples

### Use EFS

To install `lsh` with EFS support, please create a EFS FileSystem and AccessPoint first, as outlined in [this AWS article](https://aws.amazon.com/blogs/compute/using-amazon-efs-for-aws-lambda-in-your-serverless-applications/). Additionally, you need to lookup your Subnet and SecurityGroup IDs you want to use.Then, you can use the ARNs of the FileSystem and AccessPoint to install `lsh` (use the appropriate values):

```bash
λ install -p /mnt/efs -e arn:aws:elasticfilesystem:us-east-1:111111111111:access-point/fsap-123456789abcdef -f arn:aws:elasticfilesystem:us-east-1:111111111111:file-system/fs-acbdef123 -n subnet-abcdef123 -s sg-abcdef123
```

The installation can take a few minutes in this case. Once it's completed, you can use the mounted EFS FileSystem like this:

```bash
λ shell
 ___       ________  ___  ___     
|\  \     |\   ____\|\  \|\  \    
\ \  \    \ \  \___|\ \  \\\  \   
 \ \  \    \ \_____  \ \   __  \  
  \ \  \____\|____|\  \ \  \ \  \ 
   \ \_______\____\_\  \ \__\ \__\
    \|_______|\_________\|__|\|__|
             \|_________|         
                                  
                                  
Welcome to the Lambda shell!
You can now directly enter shell commands which will be run in the Lambda environment. To exit, type `exit`.
λ $ cd /mnt/efs

λ $ pwd
/mnt/efs
λ $ echo "test" > test.txt

λ $ ls -la
total 12
drwxrwxrwx 2 1000 1000 6144 Jul 25 12:10 .
drwxr-xr-x 3 root root 4096 Jul 25 12:10 ..
-rw-rw-r-- 1 1000 1000    5 Jul 25 12:10 test.txt
λ $ cat test.txt
test
λ $ rm test.txt

λ $ ls -la
total 8
drwxrwxrwx 2 1000 1000 6144 Jul 25 12:17 .
drwxr-xr-x 3 root root 4096 Jul 25 12:10 ..
λ $ 
```

### Download aws-cli

```bash
λ shell 
 ___       ________  ___  ___     
|\  \     |\   ____\|\  \|\  \    
\ \  \    \ \  \___|\ \  \\\  \   
 \ \  \    \ \_____  \ \   __  \  
  \ \  \____\|____|\  \ \  \ \  \ 
   \ \_______\____\_\  \ \__\ \__\
    \|_______|\_________\|__|\|__|
             \|_________|         
                                  
                                  
Welcome to the Lambda shell!
You can now directly enter shell commands which will be run in the Lambda environment. To exit, type `exit`.
λ $ curl "https://s3.amazonaws.com/aws-cli/awscli-bundle.zip" -o "awscli-bundle.zip"
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 11.6M  100 11.6M    0     0  78.0M      0 --:--:-- --:--:-- --:--:-- 78.0M
λ $ unzip awscli-bundle.zip
Archive:  awscli-bundle.zip
  inflating: awscli-bundle/install   
  inflating: awscli-bundle/packages/argparse-1.2.1.tar.gz  
  inflating: awscli-bundle/packages/rsa-3.4.2.tar.gz  
  inflating: awscli-bundle/packages/ordereddict-1.1.tar.gz  
  inflating: awscli-bundle/packages/simplejson-3.3.0.tar.gz  
  inflating: awscli-bundle/packages/urllib3-1.25.3.tar.gz  
  inflating: awscli-bundle/packages/python-dateutil-2.6.1.tar.gz  
  inflating: awscli-bundle/packages/s3transfer-0.2.1.tar.gz  
  inflating: awscli-bundle/packages/six-1.12.0.tar.gz  
  inflating: awscli-bundle/packages/python-dateutil-2.8.0.tar.gz  
  inflating: awscli-bundle/packages/virtualenv-15.1.0.tar.gz  
  inflating: awscli-bundle/packages/jmespath-0.9.4.tar.gz  
  inflating: awscli-bundle/packages/urllib3-1.22.tar.gz  
  inflating: awscli-bundle/packages/botocore-1.12.175.tar.gz  
  inflating: awscli-bundle/packages/colorama-0.3.9.tar.gz  
  inflating: awscli-bundle/packages/PyYAML-3.13.tar.gz  
  inflating: awscli-bundle/packages/pyasn1-0.4.5.tar.gz  
  inflating: awscli-bundle/packages/docutils-0.14.tar.gz  
  inflating: awscli-bundle/packages/PyYAML-5.1.tar.gz  
  inflating: awscli-bundle/packages/futures-3.2.0.tar.gz  
  inflating: awscli-bundle/packages/awscli-1.16.185.tar.gz  
  inflating: awscli-bundle/packages/setup/setuptools_scm-1.15.7.tar.gz  
λ $ ./awscli-bundle/install -b /tmp/bin/aws
Running cmd: /usr/bin/python virtualenv.py --no-download --python /usr/bin/python /tmp/.local/lib/aws
Running cmd: /tmp/.local/lib/aws/bin/pip install --no-cache-dir --no-index --find-links file:///tmp/awscli-bundle/packages/setup setuptools_scm-1.15.7.tar.gz
Running cmd: /tmp/.local/lib/aws/bin/pip install --no-cache-dir --no-index --find-links file:///tmp/awscli-bundle/packages awscli-1.16.185.tar.gz
You can now run: /tmp/bin/aws --version
λ $ /tmp/bin/aws --version
aws-cli/1.16.185 Python/2.7.16 Linux/4.14.123-95.109.amzn2.x86_64 exec-env/AWS_Lambda_nodejs8.10 botocore/1.12.175
λ $ 
```