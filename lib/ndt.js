'use strict';
var P = require('bluebird')
var Table = require('cli-table')
var program = require('commander')
var debug = require('debug')('ndt')
var fs = require('graceful-fs')
var LinerStream = require('linerstream')
var path = require('path')
var promisePipe = require('promisepipe')
var S = require('string')
var through2 = require('through2')
var util = require('util')

var actions = require('./actions')
var allowedMacroActions = [
  'start','restart','status','stop','once','pause','continue',
  'hangup','alaram','interrupt','kill','exit']
var ndtutil = require('./ndtutil')
var pkg = require('../package.json')

//make some promises
P.promisifyAll(fs)


/**
 * Setup a svcAction handler
 * @param {object} program
 * @param {string} action
 */
var svcAction = function(program,action){
  program
    .command(action)
    .description(S(action).capitalize().s + ' instance')
    .action(function(){
      debug('Executing service ' + action)
      actions.start.call(this,ndtutil.getEnv(program))
        .then(function(result){
          if(result) console.log(result)
          console.log('Service ' + action + ' executed successfully!')
        })
        .catch(function(err){
          console.error('Failed to ' + action + ' service',err)
        })
    })
}


/**
 * Run an action and maintain name reference
 * @param {string} name
 * @param {string} action
 * @param {object} env
 * @return {P}
 */
var actionWithName = function(name,action,env){
  return actions[action](env)
    .then(function(result){
      if(result instanceof Array) result = result.join(' ')
      if(!result) result = ''
      if('string' !== typeof result) result = util.inspect(result)
      if('' === result.trim()) result = 'Success'
      return [name,result]
    })
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
  .action(function(){
    debug('Starting service installation')
    actions.install.call(this,ndtutil.getEnv(program))
      .then(function(){
        console.log('Installation complete, your service is ' +
        'probably already running')
      })
      .catch(function(err){
        console.error('Failed to install service',err)
      })
  })


program
  .command('remove')
  .description('Remove instance')
  .action(function(){
    debug('Starting service removal')
    var env = ndtutil.getEnv(program)
    P.try(function(){
      if(!env.app) throw new Error('Failed to load app')
      debug('Stopping dt if its already running')
      return actions.stop(env)
    })
      .then(function(){
        debug('Removing link to dt files',env.appLink)
        return fs.unlinkAsync(env.appLink)
      })
      .then(function(){
        console.log('Removal complete, ' + env.appFolder + ' can be removed ' +
        'manually')
      })
      .catch(function(err){
        console.error('Failed to remove service',err)
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
    var env = ndtutil.getEnv(program)
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
      })
      .catch(function(err){
        console.error('Failed to generate dt.json',err)
      })
  })

program
  .command('save')
  .description('Save instance')
  .action(function(){
    debug('Saving instance locally')
    var env = ndtutil.getEnv(program)
    ndtutil.dbGet()
      .then(function(db){
        db.apps[env.app.name] = env.app
        return ndtutil.dbSave(db)
      })
      .then(function(){
        console.log('Instance saved to database!')
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
    var env = ndtutil.getEnv(program)
    ndtutil.dbGet()
      .then(function(db){
        delete db.apps[env.app.name]
        return ndtutil.dbSave(db)
      })
      .then(function(){
        console.log('Instance removed from database!')
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
    ndtutil.dbDestroy()
      .then(function(){
        console.log('Database flushed successfully')
      })
      .catch(function(err){
        console.err('Failed to flush database',err)
      })
  })

var listDatabase = function(){
  debug('Listing database')
  ndtutil.dbGet()
    .then(function(db){
      var promises = []
      var ak = Object.keys(db.apps)
      var key,app,env
      for(var i = 0; i < ak.length; i++){
        key = ak[i]
        app = db.apps[key]
        env = ndtutil.getEnv(program,app)
        promises.push(ndtutil.svcStatusWithName(app.name,env))
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
    })
    .catch(function(err){
      console.error('Failed to list database',err)
    })
}

program
  .command('list')
  .description('List database and status of processes')
  .action(listDatabase)


program
  .command('all')
  .description('Execute command on all instances in the database')
  .action(function(action){
    debug('Executing ' + action + ' on all instances in the database')
    ndtutil.dbGet()
      .then(function(db){
        if(allowedMacroActions.indexOf(action) < 0)
          throw new Error('Macro action not allowed: ' + action)
        var promises = []
        var ak = Object.keys(db.apps)
        var key, app
        for(var i = 0; i < ak.length; i++){
          key = ak[i]
          app = db.apps[key]
          promises.push(
            actionWithName(app.name,action,ndtutil.getEnv(program,app))
          )
        }
        return P.all(promises)
      })
      .then(function(results){
        var table = new Table({
          head: ['Name','Result']
        })
        for(var i = 0; i < results.length; i++)
          table.push(results[i])
        console.log(table.toString())
      })
      .catch(function(err){
        console.error('Failed to complete action',err)
      })
  })

//define service actions
svcAction(program,'start')
svcAction(program,'status')
svcAction(program,'restart')
svcAction(program,'stop')
svcAction(program,'once')
svcAction(program,'pause')
svcAction(program,'continue')
svcAction(program,'hangup')
svcAction(program,'alarm')
svcAction(program,'interrupt')
svcAction(program,'kill')
svcAction(program,'exit')

//database redirector
program
  .command('*')
  .description('App name in the database to operate the above commands on')
  .action(function(appName,action){
    if(!appName && (!action || action instanceof Object)) program.help()
    if(!action || action instanceof Object) action = 'status'
    debug('Got wildcard',appName,action)
    ndtutil.dbGet()
      .then(function(db){
        if(!db.apps[appName]){
          listDatabase()
        } else{
          return actions[action](ndtutil.getEnv(program,db.apps[appName]))
            .then(function(){
              console.log(S(action).capitalize().s + ' executed successfully!')
            })
            .catch(function(err){
              console.error('Command failed',err)
            })
        }
      })
  })

program.parse(process.argv)

//manual default thanks to new commander version
if(!process.argv.slice(2).length){
  listDatabase()
}
