'use strict';
var ndtutil = require('../ndtutil')


/**
 * Restart
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'down')
    .then(function(){
      return ndtutil.svcWaitDown(env)
    })
    .then(function(){
      return ndtutil.svc(env,'up')
    })
}
