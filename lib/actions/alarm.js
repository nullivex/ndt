'use strict';
var ndtutil = require('../ndtutil')


/**
 * Alarm
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'alarm')
}
