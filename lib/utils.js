const config = require('config');
const assert = require('assert');
const Client = require('rtpengine-client').Client ;
const obj = module.exports = {} ;
//const debug = require('debug')('drachtio:siprec-recording-server');

obj.isFreeswitchSource = (req) => {
  console.log(`has token? ${req.has('X-Return-Token')}: ${req.get('X-Return-Token')}`);
  return req.has('X-Return-Token');
};

let idx = 0;
let servers;
obj.getAvailableFreeswitch = () => {
  servers = servers || config.get('freeswitch');
  if (idx == servers.length) idx = 0;
  return servers[idx++];
};


let idxRtpe = 0;
let rtpes;
obj.getAvailableRtpengine = () => {
  if (!rtpes) {
    let rtpEngines = config.get('rtpengine');
    rtpEngines = Array.isArray(rtpEngines) ? rtpEngines : [rtpEngines];
    rtpes = rtpEngines.map((r) => {
      const port = r.localPort || 0;
      const rtpe = new Client({port, timeout: 1500});
      rtpe.remote = r.remote;
      return rtpe;
    });
  }
  assert(rtpes.length > 0);
  if (idxRtpe == rtpes.length) idxRtpe = 0;
  return rtpes[idxRtpe++];
};

