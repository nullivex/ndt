ndt [![Build Status](https://travis-ci.org/snailjs/ndt.png?branch=master)](https://travis-ci.org/snailjs/ndt)
============

ndt is a **Daemon Tools** wrapper for NodeJS that will create, remove, and
upgrade the daemon tools folder structure.

## Usage

```
$ npm -g install ndt
$ cd /opt/myapp
$ ndt install
$ ndt start
$ ndt status
$ ndt restart
$ ndt stop
$ ndt remove
```

## dt.json

In order for an application to work with **ndt**.

```json
{
  "env": {
    "NODE_ENV": "production",
    "DEBUG": "*"
  },
  "cwd": "/opt/myapp",
  "user": "node",
  "command": "node app -vv"
  "log": {
    "env": {
      "HOME": "/home/node"
    },
    "user": "node",
    "command": "multilog s16777215 t /var/log/node/oose"
  }
}
```

## Debugging

This package is built using the https://www.npmjs.org/package/debug package.

Use the following to see debug output

```
$ cd /opt/mysqll
$ DEBUG=ndt* ndt install
```

## Changelog

### 0.1.0

* Initial release

