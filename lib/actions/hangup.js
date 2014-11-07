'use strict';
var ndtutil = require('../ndtutil')


/**
 * Hangup
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'hangup')
}
