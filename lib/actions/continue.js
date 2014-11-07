'use strict';
var ndtutil = require('../ndtutil')


/**
 * Continue
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'continue')
}
