ndt
============

ndt is a **Daemon Tools** wrapper for NodeJS that will create, remove, and
upgrade the daemon tools folder structure.

## Usage

```
$ sudo su -
$ npm -g install ndt
$ cd /opt/myapp
$ ndt install
$ ndt start
$ ndt status
$ ndt restart
$ ndt stop
$ ndt remove
$ ndt save
$ cd /
$ ndt myapp start
$ ndt myapp restart
$ ndt myapp stop
$ ndt unsave myapp
```

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
$ env | ndt generate --command "node app -vv"
```

## Debugging

This package is built using the https://www.npmjs.org/package/debug package.

Use the following to see debug output

```
$ cd /opt/mysqll
$ DEBUG=ndt* ndt install
```

## Changelog

### 0.2.0
* Completion of features and testing
* Restart now waits for process exit
* Removal now waits for process exit
* Database support

### 0.1.0

* Initial release

