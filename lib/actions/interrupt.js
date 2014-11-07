'use strict';
var ndtutil = require('../ndtutil')


/**
 * Interrupt
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'interrupt')
}
