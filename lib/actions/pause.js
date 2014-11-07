'use strict';
var ndtutil = require('../ndtutil')


/**
 * Pause
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'pause')
}
