'use strict';
var P = require('bluebird')
var debug = require('debug')('ndt')
var fs = require('graceful-fs')


//make some promises
P.promisifyAll(fs)
var rmdirAsync = P.promisify(require('rmdir'))


/**
 * Install function
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return P.try(function(){
    var that = this
    if(
      (fs.existsSync(env.appFolder) || fs.existsSync(env.appLink)) &&
      !that.force
    )
      throw new Error('Application folder already exists ' +
      'and -f was not passed')
    if(!env.app) throw new Error('Failed to load dt.json')
    //remove existing references we already confirmed that we want to
    var promises = []
    debug('Removing any existing folders')
    if(fs.existsSync(env.appFolder)) promises.push(rmdirAsync(env.appFolder))
    if(fs.existsSync(env.appLink)) promises.push(fs.unlinkAsync(env.appLink))
    return P.all(promises)
  })
    .then(function(){
      //create the dt folder
      debug('Creating app folder')
      return fs.mkdirAsync(env.appFolder)
    })
    .then(function(){
      //create subfolders
      debug('Creating app subfolders')
      return P.all([
        fs.mkdirAsync(env.appFolder + '/log'),
        fs.mkdirAsync(env.appFolder + '/env')
      ])
    })
    .then(function(){
      //create env files
      var promises = []
      var ek = Object.keys(env.app.env)
      var key, value, file
      for(var i = 0; i < ek.length; i++){
        key = ek[i]
        value = env.app.env[key]
        file = env.appFolder + '/env/' + key
        debug('Writing env file',file,value)
        promises.push(fs.writeFileAsync(file,value + '\n'))
      }
      return P.all(promises)
    })
    .then(function(){
      //create the log run file
      var file = env.appFolder + '/log/run'
      var content = '#!/bin/sh\nexec ' +
        'setuidgid ' + env.app.user + ' ' + env.app.log.command + '\n'
      debug('Writing log run file',file,content)
      return fs.writeFileAsync(file,content)
    })
    .then(function(){
      //create the main run file
      var file = env.appFolder + '/run'
      var content =
        '#!/bin/sh\n' +
        'BASE=`pwd`\n' +
        'cd ' + env.app.cwd + '\n' +
        'exec 2>&1\n' +
        'exec envuidgid ' + env.app.user + ' envdir ${BASE}/env ' +
        env.app.command + '\n'
      debug('Writing main run file',file,content)
      return fs.writeFileAsync(file,content)
    })
    .then(function(){
      //set permissions on run files
      debug('Marking run files executable')
      return P.all([
        fs.chmodAsync(env.appFolder + '/run','755'),
        fs.chmodAsync(env.appFolder + '/log/run','755')
      ])
    })
    .then(function(){
      //link the folder to the service directory
      debug(
        'Creating symbolic link to service files',env.appFolder,env.appLink)
      return fs.symlinkAsync(env.appFolder,env.appLink,'dir')
    })
}
