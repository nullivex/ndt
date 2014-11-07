ndt
============

ndt is a **Daemon Tools** wrapper for NodeJS that will create, remove, and
upgrade the daemon tools folder structure. Where `<action>` is from the
list below.

## Usage

### Basic app usage
```
$ sudo su -
$ npm -g install ndt
$ cd /opt/myapp
$ ndt install
$ ndt <action>
$ ndt remove
```

### Database Support

`ndt` Also supports saving instances to a local database so commands can be
ran from anywhere. Also allows use of macros. Where `<action>` is from the
list below.

```
$ cd /opt/myapp
$ ndt save
$ cd /
$ ndt myapp <action>
$ ndt unsave myapp

```

### Macros

These functions affect all members of the database. Where `<action>` is from the
list of actions below.

```
$ ndt all <action>
```

## Actions

The following actions are available when using `ndt` commands that support
`<action>`

* `alarm` - Send instance an alarm
* `continue` - Continue a paused instance
* `exit` - Have supervise exit after instance ends (not for production)
* `hangup` - Tell an instance to hangup
* `interrupt` - Send instance an interrupt
* `kill` - Kill an instance
* `once` - Run an instance once and dont restart if it dies
* `pause` - Pause an instance
* `restart` - Restart an instance
* `start` - Start an instance
* `status` - Get instance status
* `stop` - Stop an instance

## dt.json

In order for an application to work with **ndt**.

```json
{
  "name": "myapp"
  "cwd": "/opt/myapp",
  "user": "node",
  "command": "node app -vv"
  "env": {
    "NODE_ENV": "production",
    "DEBUG": "*"
  },
  "log": {
    "user": "node",
    "command": "multilog s16777215 t /var/log/node/myapp"
  }
}
```

### Generating the dt.json

It is possible to generate the dt.json file in order to make the setup process
a bit less cumbersome.

In order to properly populate the environment variables. We recommend piping
them through stdin.

EG:
```
$ su - node
$ cd /opt/myapp
$ env | ndt generate --command "node app -vv" --stdin
```

## Debugging

This package is built using the https://www.npmjs.org/package/debug package.

Use the following to see debug output

```
$ cd /opt/mysqll
$ DEBUG=ndt* ndt install
```

## Changelog

### 0.3.0
* Major refactor of the internal code
* Added macro actions such as `ndt all stop`
* Database is now stored globally in `/etc/ndt/ndt.json`
* Confirmation of all commands working

### 0.2.0
* Completion of features and testing
* Restart now waits for process exit
* Removal now waits for process exit
* Database support

### 0.1.0

* Initial release

