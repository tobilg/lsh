# lsh - The Lambda shell
Run interactive shell commands on AWS Lambda

[![asciicast](https://asciinema.org/a/3sXv75GuyT3BA79fuLyvJSaa3.svg)](https://asciinema.org/a/3sXv75GuyT3BA79fuLyvJSaa3?autoplay=1&t=0)

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

```

### Install stack

Before you can use `lsh`, you need to install the neccessary stack by issueing the following command:

```text
λ install
```

You can also specify options for the installation of the stack:

```text
-b, --bucket <bucketName>       Name of the S3 bucket.
-r, --region <regionName>       Region to which the Lambda function shall be deployed to (default: us-east-1).
-m, --memory <memoryMegabytes>  Amount of memory in meagabytes the Lambda function shall have available (default: 1536).
-t, --timeout <timeoutSeconds>  Timeout in seconds of the Lambda function (default: 60).
```

For example, to use a maxed-out Lambda shell, use 

```text
λ install -m 3076 -t 900
```

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

### Uninstall stack

To uninstall the created stack run the following command:

```text
λ uninstall
```
