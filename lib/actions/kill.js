'use strict';
var ndtutil = require('../ndtutil')


/**
 * Kill
 * @param {object} env
 * @return {P}
 */
module.exports = function(env){
  return ndtutil.svc(env,'kill')
}
