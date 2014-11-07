'use strict';


/**
 * Actions
 * @type {object}
 */
module.exports = {
  alarm: require('./alarm'),
  continue: require('./continue'),
  exit: require('./exit'),
  hangup: require('./hangup'),
  install: require('./install'),
  interrupt: require('./interrupt'),
  kill: require('./kill'),
  once: require('./once'),
  pause: require('./pause'),
  restart: require('./restart'),
  start: require('./start'),
  status: require('./status'),
  stop: require('./stop')
}
