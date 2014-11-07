'use strict';
var P = require('bluebird')
var childProcess = require('child_process')
var program = require('commander')
var debug = require('debug')('ndt')
var fs = require('graceful-fs')
var LinerStream = require('linerstream')
var path = require('path')
var promisePipe = require('promisepipe')
var through2 = require('through2')

var pkg = require('../package.json')

//make some promises
P.promisifyAll(fs)
P.promisifyAll(childProcess)


/**
 * Command execution wrapper
 * @param {string} command
 * @return {P}
 */
var execute = function(command){
  debug('Executing command',command)
  return childProcess.execAsync(command)
}


/**
 * Execute a command on svc
 * @param {object} env
 * @param {string} action
 * @return {P}
 */
var svc = function(env,action){
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
  return execute(actions[action])
}


/**
 * Check the status of the service
 * @param {object} env
 * @return {P}
 */
var svcStatus = function(env){
  return execute(path.dirname(env.svc.bin) + '/svc-status ' + env.appLink)
}


/**
 * Resolve the environment for running commands
 * @param {object} program
 * @return {object}
 */
var getEnv = function(program){
  var cwd = program.cwd || process.cwd()
  var app = require(cwd + '/dt.json')
  var serviceDir = program.service || '/service'
  var env = {
    cwd: cwd,
    app: app,
    appFolder: cwd + '/dt',
    appLink: path.resolve(serviceDir + '/' + app.name),
    svc: {
      bin: path.resolve(program.bin || '/usr/bin/svc'),
      folder: path.resolve(serviceDir)
    }
  }
  debug('Env setup',env)
  return env
}

program
  .version(pkg.version)
  .option('-b --bin','Change the location of the service bin ' +
    '(default: /usr/bin/svc)')
  .option('-c --cwd','Set the current working directory away from default (.)')
  .option('-s --service','Service folder, defaults to /service')
  .usage('[options] [action]')

program
  .command('install')
  .option('-F --force','Force overwrite of existing dt instance')
  .description('Install dt files using dt.json')
  .action(function(){
    debug('Starting service installation')
    var env = getEnv(program)
    P.try(function(){
      if(!env.app) throw new Error('Failed to load dt.json')
      //create the dt folder
      return fs.mkdirAsync(env.appFolder)
    })
      .then(function(){
        //create subfolders
        return P.all([
          fs.mkdirAsync(env.appFolder + '/log'),
          fs.mkdirAsync(env.appFolder + '/env')
        ])
      })
      .then(function(){
        //create env files
        var promises = []
        var ek = Object.keys(env.app.env)
        var key, value
        for(var i = 0; i < ek.length; i++){
          key = ek[i]
          value = env.app.env[key]
          promises.push(
            fs.writeFileAsync(env.appFolder + '/env/' + key,value + '\n'))
        }
        return P.all(promises)
      })
      .then(function(){
        //create the log run file
        var content = '#!/bin/sh\nexec ' +
          'setuidgid ' + env.app.user + ' ' + env.log.command + '\n'
        return fs.writeFileAsync(env.appFolder + '/log/run',content)
      })
      .then(function(){
        //create the main run file
        var content =
          '#!/bin/sh\n' +
          'BASE=`pwd`\n' +
          'cd ' + env.app.cwd + '\n' +
          'exec 2>&1\n' +
          'exec envuidgid ' + env.app.user + ' envdir ${BASE}/env ' +
            env.log.command + '\n'
        return fs.writeFileAsync(env.appFolder + '/run',content)
      })
      .then(function(){
        //set permissions on run files
        return P.all([
          fs.chmodAsync(env.appFolder + '/run','755'),
          fs.chmodAsync(env.appFolder + '/log/run','755')
        ])
      })
      .then(function(){
        //link the folder to the service directory
        return fs.symlinkAsync(env.appFolder,env.appLink,'dir')
      })
      .then(function(){
        console.log('Installation complete, your service is ' +
          'probably already running')
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to install service',err)
        process.exit()
      })
  })

program
  .command('start')
  .description('Start instance')
  .action(function(){
    debug('Executing service start')
    var env = getEnv(program)
    svc(env,'up')
      .then(function(){
        console.log('Service started')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to start service',err)
        process.exit()
      })
  })

program
  .command('restart')
  .description('Restart instance')
  .action(function(){
    debug('Executing service restart')
    var env = getEnv(program)
    svc(env,'down')
      .then(function(){
        debug('Service stopped')
        return svc(env,'up')
      })
      .then(function(){
        debug('Service started')
        console.log('Service restarted')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to restart service',err)
        process.exit()
      })
  })

program
  .command('status')
  .description('Status of an instance')
  .action(function(){
    debug('Getting instance status')
    var env = getEnv(program)
    svcStatus(env,'status')
      .then(function(out){
        console.log(out)
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to get service status',err)
        process.exit()
      })
  })

program
  .command('stop')
  .description('Stop instance')
  .action(function(){
    debug('Executing service stop')
    var env = getEnv(program)
    svc(env,'down')
      .then(function(){
        console.log('Service stopped')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to stop service',err)
        process.exit()
      })
  })

program
  .command('once')
  .description('Run instance once do not keep it alive')
  .action(function(){
    debug('Executing service once')
    var env = getEnv(program)
    svc(env,'once')
      .then(function(){
        console.log('Service started once')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to start service once',err)
        process.exit()
      })
  })

program
  .command('pause')
  .description('Pause instance')
  .action(function(){
    debug('Executing service pause')
    var env = getEnv(program)
    svc(env,'pause')
      .then(function(){
        console.log('Service paused')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to pause service',err)
        process.exit()
      })
  })

program
  .command('continue')
  .description('Continue instance')
  .action(function(){
    debug('Executing service continue')
    var env = getEnv(program)
    svc(env,'continue')
      .then(function(){
        console.log('Service continued')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to continue service',err)
        process.exit()
      })
  })

program
  .command('hangup')
  .description('Hangup instance')
  .action(function(){
    debug('Executing service hangup')
    var env = getEnv(program)
    svc(env,'hangup')
      .then(function(){
        console.log('Service told to hangup')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to hangup service',err)
        process.exit()
      })
  })

program
  .command('alarm')
  .description('Alarm instance')
  .action(function(){
    debug('Executing service alarm')
    var env = getEnv(program)
    svc(env,'alarm')
      .then(function(){
        console.log('Service sent alarm')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to alarm service',err)
        process.exit()
      })
  })

program
  .command('interrupt')
  .description('Interrupt instance')
  .action(function(){
    debug('Executing service interrupt')
    var env = getEnv(program)
    svc(env,'interrupt')
      .then(function(){
        console.log('Service sent interrupt')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to interrupt service',err)
        process.exit()
      })
  })

program
  .command('kill')
  .description('Kill instance')
  .action(function(){
    debug('Executing service kill')
    var env = getEnv(program)
    svc(env,'kill')
      .then(function(){
        console.log('Service sent kill')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to kill service',err)
        process.exit()
      })
  })

program
  .command('exit')
  .description('Exit instance')
  .action(function(){
    debug('Executing service exit')
    var env = getEnv(program)
    svc(env,'exit')
      .then(function(){
        console.log('Service sent exit')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to exit service',err)
        process.exit()
      })
  })

program
  .command('remove')
  .description('Remove instance')
  .action(function(){
    debug('Starting service removal')
    var env = getEnv(program)
    P.try(function(){
      if(!env.app) throw new Error('Failed to load app')
      debug('Stopping dt if its already running')
      return childProcess.execAsync(env.svc.bin + ' -d ' + env.appLink)
    })
      .then(function(){
        debug('Removing link to dt files',env.appLink)
        return fs.unlinkAsync(env.appLink)
      })
      .then(function(){
        console.log('Removal complete, ' + env.appFolder + ' can be removed ' +
          'manually')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to remove service',err)
        process.exit()
      })
  })

program
  .command('generate')
  .option('-c --command','Command used to start your application ' +
    '(default: node app)')
  .option('-l --log-command','Command used for logging (default: ' +
    'multilog s16777215 t #{cwd}/log)')
  .option('-L --log-user','User the logger should run under (default: ' +
    ' program.logUser || program.user || \'node\')')
  .option('-n --name','Name of your application (default: ' +
    ' path.basename(cwd) )')
  .option('-u --user','User to execute your application as (default: node)')
  .description('Generate dt.json, accepts stdin of current env using the env' +
    ' command')
  .action(function(){
    debug('Starting to generate dt.json')
    var env = getEnv(program)
    var appEnv = {}
    var linestream = new LinerStream()
    var sniff = through2(function(line,enc,next){
      var parts = line.split('=')
      if(2 !== parts.length){
        debug('Skipping env, not enough parts',line)
        return next(null,line)
      }
      debug('Loading env: ' + parts[0] + '=' + parts[1],line)
      appEnv[parts[0]] = parts[1]
      next(null,line)
    })
    promisePipe(process.stdin,linestream,sniff)
      .then(function(){
        debug('Finished reading stdin, creating object',appEnv)
        var app = {
          name: program.name || path.basename(env.cwd),
          cwd: env.cwd,
          user: program.user || 'node',
          command: program.command || 'node app',
          env: appEnv,
          log: {
            user: program.logUser || program.user || 'node',
            command: program.logCommand || 'multilog s16777215 t ' +
              env.cwd + '/log'
          }
        }
        debug('Object creation finished',app)
        debug('Writing dt.json to ' + env.cwd + '/dt.json')
        return fs.writeFileAsync(env.cwd + '/dt.json',JSON.stringify(app))
      })
      .then(function(){
        console.log('dt.json successfully written to ' + env.cwd + '/dt.json!')
        process.exit()
      })
      .catch(function(err){
        console.trace(err)
        console.error('Failed to generate dt.json',err)
        process.exit()
      })
  })

var cli = program.parse(process.argv)
if(!cli.args.length) program.help()
