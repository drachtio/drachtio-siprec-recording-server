const config = require('config');
const servers = config.get('freeswitch');
const obj = module.exports = {} ;

obj.isFreeswitchSource = (req) => {
  return req.has('X-Return-Token');
};

let idx = 0;
obj.getAvailableFreeswitch = () => {
  if (idx == servers.length) idx = 0;
  return servers[idx++];
};
