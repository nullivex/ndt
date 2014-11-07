'use strict';
var ndtutil = require('../ndtutil')


/**
 * Start
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'up')
}
