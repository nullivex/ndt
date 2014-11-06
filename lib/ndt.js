'use strict';
var P = require('bluebird')
var program = require('commander')
var fs = require('graceful-fs')
//var path = require('path')

var pkg = require('../package.json')

//make some promises
P.promisifyAll(fs)


program
  .version(pkg.version)
  .option('-s --service','Service folder, defaults to /service')
  .option('-f --file','Location of dt.json, defaults to ./dt.json')
  .usage('[options] [install | start | restart | stop | remove | generate]')

program
  .command('install')
  .option('-F --force','Force overwrite of existing dt instance')
  .description('Install dt files using dt.json')
  .action(function(){
    console.log('Doing installation')
  })

program
  .command('start')
  .description('Start instance using dt.json')
  .action(function(){
    console.log('Doing start')
  })

program
  .command('restart')
  .description('Restart instance using dt.json')
  .action(function(){
    console.log('Doing restart')
  })

program
  .command('stop')
  .description('Stop instance using dt.json')
  .action(function(){
    console.log('Stop stop')
  })

program
  .command('remove')
  .description('Remove instance using dt.json')
  .action(function(){
    console.log('Doing remove')
  })

program
  .command('generate')
  .description('Generate dt.json, accepts stdin of current env')
  .action(function(){
    console.log('Doing generate')
  })

var cli = program.parse(process.argv)
if(!cli.args.length) program.help()
