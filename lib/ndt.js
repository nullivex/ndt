'use strict';
var P = require('bluebird')
var childProcess = require('child_process')
var Table = require('cli-table')
var program = require('commander')
var debug = require('debug')('ndt')
var fs = require('graceful-fs')
var LinerStream = require('linerstream')
var path = require('path')
var promisePipe = require('promisepipe')
var rmdir = require('rmdir')
var through2 = require('through2')

var cachedApp
var pkg = require('../package.json')

//make some promises
P.promisifyAll(childProcess)
P.promisifyAll(fs)
var rmdirAsync = P.promisify(rmdir)


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
  return execute(path.dirname(env.svc.bin) + '/svstat ' + env.appLink)
    .then(function(out){
      return out.join('')
    })
}


/**
 * Check if a service is up
 * @param {object} env
 * @return {P}
 */
var svcIsUp = function(env){
  return svcStatus(env)
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
var svcWaitDown = function(env,timeout){
  if(!timeout) timeout = 120
  return new P(function(resolve,reject){
    var i = 0
    var doCheck = function(){
      svcIsUp(env).then(function(up){
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
 * @return {object}
 */
var getEnv = function(program){
  var cwd = program.cwd || process.cwd()
  var appFile = path.resolve(cwd + '/dt.json')
  var app = cachedApp ? cachedApp :
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
var dbFile = function(){
  return path.resolve(__dirname + '/../ndt.json')
}


/**
 * Get the current database
 * @return {P}
 */
var dbGet = function(){
  var dbfile = dbFile()
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
var dbDestroy = function(){
  var dbfile = dbFile()
  return fs.unlinkAsync(dbfile)
}


/**
 * Save the database from an object
 * @param {object} db
 * @return {P}
 */
var dbSave = function(db){
  var dbfile = dbFile()
  db.updatedAt = new Date()
  var content = JSON.stringify(db,null,'  ')
  debug('Saving database',dbfile,content)
  return fs.writeFileAsync(dbfile,content)
}


program
  .version(pkg.version)
  .option('-B --bin <s>','Change the location of the service bin ' +
  '(default: /usr/bin/svc)')
  .option('-C --cwd <s>','Set the current working directory away from ' +
    'default (.)')
  .option('-S --service <s>','Service folder, defaults to /service')
  .usage('[options] [action]')

program
  .command('install')
  .option('-f --force','Force overwrite of existing dt instance')
  .description('Install dt files using dt.json')
  .action(function(args){
    debug('Starting service installation')
    var env = getEnv(program)
    P.try(function(){
      if(
        (fs.existsSync(env.appFolder) || fs.existsSync(env.appLink)) &&
        !args.force
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
      .then(function(){
        console.log('Installation complete, your service is ' +
        'probably already running')
      })
      .catch(function(err){
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
        return svcWaitDown(env)
      })
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
      return svc(env,'down')
        .then(svcWaitDown(env))
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
        console.error('Failed to remove service',err)
        process.exit()
      })
  })

program
  .command('generate')
  .option('-a --app-name','Name of your application (default: ' +
  ' path.basename(cwd) )')
  .option('-c --command','Command used to start your application ' +
  '(default: node app)')
  .option('-f --force','Force overwriting an existing dt.json file')
  .option('-l --log-command','Command used for logging (default: ' +
  'multilog s16777215 t #{cwd}/log)')
  .option('-L --log-user','User the logger should run under (default: ' +
  ' program.logUser || program.user || \'node\')')
  .option('-s --stdin','Read environment variables through stdin')
  .option('-u --user','User to execute your application as (default: node)')
  .description('Generate dt.json, accepts stdin of current env using the env' +
  ' command')
  .action(function(args){
    debug('Starting to generate dt.json')
    var env = getEnv(program)
    var appEnv = {
      NODE_ENV: 'production'
    }
    var linestream = new LinerStream()
    var sniff = through2(function(data,enc,next){
      var line = data.toString()
      debug('Parsing env line',line)
      var parts = line.match(/^([^=]+)=([^\n]*)$/)
      if(3 !== parts.length){
        debug('Skipping env, not enough parts',line)
        return next(null,line)
      }
      debug('Loading env: ' + parts[1] + '=' + parts[1])
      appEnv[parts[1]] = parts[2]
      next(null,line)
    })
    var promise
    if(args.stdin){
      promise = promisePipe(process.stdin,linestream,sniff)
    } else {
      promise = new P(function(resolve){process.nextTick(resolve)})
    }
    promise
      .then(function(){
        debug('Finished reading stdin, creating object',appEnv)
        if(fs.existsSync(env.defFile) && !program.force)
          throw new Error(env.defFile + ' already exists, ' +
            'and force is not enabled')
        var app = {
          name: args.appName || path.basename(env.cwd),
          cwd: env.cwd,
          user: args.user || 'node',
          command: args.command || 'node app',
          env: appEnv,
          log: {
            user: args.logUser || program.user || 'node',
            command: args.logCommand || 'multilog s16777215 t ' +
            path.resolve(env.cwd + '/log')
          }
        }
        debug('Object creation finished',app)
        debug('Writing dt.json to ' + env.cwd + '/dt.json')
        return fs.writeFileAsync(
          env.cwd + '/dt.json',JSON.stringify(app,null,'  '))
      })
      .then(function(){
        console.log('dt.json successfully written to ' + env.cwd + '/dt.json!')
        process.exit()
      })
      .catch(function(err){
        console.error('Failed to generate dt.json',err)
        process.exit()
      })
  })

program
  .command('save')
  .description('Save instance')
  .action(function(){
    debug('Saving instance locally')
    var env = getEnv(program)
    dbGet()
      .then(function(db){
        db.apps[env.app.name] = env.app
        return dbSave(db)
      })
      .then(function(){
        console.log('Instance saved to database!')
        process.exit()
      })
      .catch(function(err){
        console.error('Failed to save instance to database',err)
      })
  })

program
  .command('unsave')
  .description('Unsaving instance')
  .action(function(){
    debug('Unsaving instance locally')
    var env = getEnv(program)
    dbGet()
      .then(function(db){
        delete db.apps[env.app.name]
        return dbSave(db)
      })
      .then(function(){
        console.log('Instance removed from database!')
        process.exit()
      })
      .catch(function(err){
        console.error('Failed to remove instance from database',err)
      })
  })

program
  .command('flush')
  .description('Flush database')
  .action(function(){
    debug('Flushing database')
    dbDestroy()
      .then(function(){
        console.log('Database flushed successfully')
        process.exit()
      })
      .catch(function(err){
        console.err('Failed to flush database',err)
        process.exit(0)
      })
  })

program
  .command('list')
  .description('List database and status of processes')
  .action(function(){
    debug('Listing database')
    dbGet()
      .then(function(db){
        var promises = []
        var ak = Object.keys(db.apps)
        var key,app,env
        var appStatus = function(status){
          return [app.name,status.replace(/\n/,' ').trim()]
        }
        for(var i = 0; i < ak.length; i++){
          key = ak[i]
          app = db.apps[key]
          cachedApp = app
          env = getEnv(program)
          promises.push(
            svcStatus(env)
              .then(appStatus)
          )
        }
        return P.all(promises)
      })
      .then(function(results){
        var table = new Table({
          head: ['Name','Status']
        })
        for(var i = 0; i < results.length; i++)
          table.push(results[i])
        console.log(table.toString())
        process.exit()
      })
      .catch(function(err){
        console.error('Failed to list database',err)
        process.exit(0)
      })
  })

program
  .command('*')
  .description('App name in the database to operate the above commands on')
  .action(function(appName,action){
    if(!appName && (!action || action instanceof Object)) program.help()
    if(!action || action instanceof Object) action = 'status'
    debug('Got wildcard',appName,action)
    dbGet()
      .then(function(db){
        if(!db.apps[appName]) throw new Error('App doesnt exist in database')
        cachedApp = db.apps[appName]
        program.emit(action)
      })
      .catch(function(err){
        console.error('Command failed',err)
      })
  })

var cli = program.parse(process.argv)
if(!cli.args.length) program.help()
