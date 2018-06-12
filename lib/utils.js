const config = require('config');
const servers = config.get('freeswitch');
const obj = module.exports = {} ;
//const debug = require('debug')('drachtio:siprec-recording-server');

obj.isFreeswitchSource = (req) => {
  console.log(`has token? ${req.has('X-Return-Token')}: ${req.get('X-Return-Token')}`);
  return req.has('X-Return-Token');
};

let idx = 0;
obj.getAvailableFreeswitch = () => {
  if (idx == servers.length) idx = 0;
  return servers[idx++];
};
