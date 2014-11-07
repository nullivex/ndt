'use strict';
var ndtutil = require('../ndtutil')


/**
 * Once
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'once')
}
