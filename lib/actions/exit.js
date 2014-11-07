'use strict';
var ndtutil = require('../ndtutil')


/**
 * Exit
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'exit')
}
