'use strict';
var ndtutil = require('../ndtutil')


/**
 * Stop
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'down')
    .then(function(){
      return ndtutil.svcWaitDown(env)
    })
}
