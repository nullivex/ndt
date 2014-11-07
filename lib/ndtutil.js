'use strict';
var P = require('bluebird')
var childProcess = require('child_process')
var debug = require('debug')('ndt')
var fs = require('graceful-fs')
var path = require('path')

//make some promises
P.promisifyAll(childProcess)
P.promisifyAll(fs)


/**
 * Command execution wrapper
 * @param {string} command
 * @return {P}
 */
exports.execute = function(command){
  debug('Executing command',command)
  return childProcess.execAsync(command)
}


/**
 * Execute a command on svc
 * @param {object} env
 * @param {string} action
 * @return {P}
 */
exports.svc = function(env,action){
  var actions = {
    'up': env.svc.bin + ' -u ' + env.appLink,
    'down': env.svc.bin + ' -d ' + env.appLink,
    'once': env.svc.bin + ' -o ' + env.appLink,
    'pause': env.svc.bin + ' -p ' + env.appLink,
    'continue': env.svc.bin + ' -c ' + env.appLink,
    'hangup': env.svc.bin + ' -h ' + env.appLink,
    'alarm': env.svc.bin + ' -a ' + env.appLink,
    'interrupt': env.svc.bin + ' -i ' + env.appLink,
    'terminate': env.svc.bin + ' -t ' + env.appLink,
    'kill': env.svc.bin + ' -k ' + env.appLink,
    'exit': env.svc.bin + ' -x ' + env.appLink
  }
  if(!actions[action]) throw new Error('Action is not defined')
  return exports.execute(actions[action])
}


/**
 * Check the status of the service
 * @param {object} env
 * @return {P}
 */
exports.svcStatus = function(env){
  return exports.execute(path.dirname(env.svc.bin) + '/svstat ' + env.appLink)
    .then(function(out){
      return out.join('')
    })
}


/**
 * Service status with the app name in an array [name,status]
 * @param {string} name
 * @param {object} env
 * @return {P}
 */
exports.svcStatusWithName = function(name,env){
  return exports.svcStatus(env)
    .then(function(status){
      return [name,status.replace(/\n/,' ').trim()]
    })
}


/**
 * Check if a service is up
 * @param {object} env
 * @return {P}
 */
exports.svcIsUp = function(env){
  return exports.svcStatus(env)
    .then(function(out){
      return (out.match(/down/i))
    })
}


/**
 * Wait for a service to not be up
 * @param {object} env
 * @param {number} timeout In seconds
 * @return {P}
 */
exports.svcWaitDown = function(env,timeout){
  if(!timeout) timeout = 120
  return new P(function(resolve,reject){
    var i = 0
    var doCheck = function(){
      exports.svcIsUp(env).then(function(up){
        if(up) return resolve()
        i++
        if(i > timeout) return reject('Service did not stop')
        setTimeout(doCheck,1000)
      })
    }
    doCheck()
  })
}


/**
 * Resolve the environment for running commands
 * @param {object} program
 * @param {object} appOverride
 * @return {object}
 */
exports.getEnv = function(program,appOverride){
  var cwd = program.cwd || process.cwd()
  var appFile = path.resolve(cwd + '/dt.json')
  var app = appOverride ? appOverride :
    (fs.existsSync(appFile) ? require(appFile) : {})
  var serviceDir = program.service || '/service'
  var env = {
    cwd: cwd,
    defFile: path.resolve(cwd + '/dt.json'),
    app: app,
    appFolder: path.resolve(cwd + '/dt'),
    appLink: path.resolve(serviceDir + '/' + app.name),
    svc: {
      bin: path.resolve(program.bin || '/usr/bin/svc'),
      folder: path.resolve(serviceDir)
    }
  }
  debug('Env setup',env)
  return env
}


/**
 * Get the DB file
 * @return {string}
 */
exports.dbFile = function(){
  return path.resolve(__dirname + '/../ndt.json')
}


/**
 * Get the current database
 * @return {P}
 */
exports.dbGet = function(){
  var dbfile = exports.dbFile()
  if(!fs.existsSync(dbfile)){
    debug('Database doesnt exist, creating it')
    fs.writeFileSync(
      dbfile,
      JSON.stringify({
        apps: {},
        createdAt: new Date(),
        updatedAt: new Date()
      },null,'  ')
    )
  }
  return fs.readFileAsync(dbfile)
    .then(function(data){
      var db = JSON.parse(data)
      debug('Database read',db)
      return db
    })
}


/**
 * Destroy the database
 * @return {P}
 */
exports.dbDestroy = function(){
  var dbfile = exports.dbFile()
  return fs.unlinkAsync(dbfile)
}


/**
 * Save the database from an object
 * @param {object} db
 * @return {P}
 */
exports.dbSave = function(db){
  var dbfile = exports.dbFile()
  db.updatedAt = new Date()
  var content = JSON.stringify(db,null,'  ')
  debug('Saving database',dbfile,content)
  return fs.writeFileAsync(dbfile,content)
}
