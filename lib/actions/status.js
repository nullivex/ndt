'use strict';
var ndtutil = require('../ndtutil')


/**
 * Status
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svcStatus(env)
}
