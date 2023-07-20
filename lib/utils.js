const config = require('config');
const pino = require('pino');
const dtmfListenPort = config.has('rtpengine.localPort')
  ? config.get('rtpengine.localPort')
  : 22222;
const ngProtocol = config.has('rtpengine.ngProtocol')
  ? config.get('rtpengine.ngProtocol')
  : 'udp';
const { getRtpEngine, setRtpEngines } = require('@jambonz/rtpengine-utils')(
  [],
  pino(),
  {
    //emitter: stats,
    dtmfListenPort,
    protocol: ngProtocol,
  }
);
const obj = (module.exports = {});
//const debug = require('debug')('drachtio:siprec-recording-server');

obj.isFreeswitchSource = (req) => {
  console.log(
    `has token? ${req.has('X-Return-Token')}: ${req.get('X-Return-Token')}`
  );
  return req.has('X-Return-Token');
};

let idx = 0;
let servers;
obj.getAvailableFreeswitch = () => {
  servers = servers || config.get('freeswitch');
  if (idx == servers.length) idx = 0;
  return servers[idx++];
};

if (config.has('rtpengine')) {
  let rtpEngines = config.get('rtpengine');
  rtpEngines = Array.isArray(rtpEngines) ? rtpEngines : [rtpEngines];
  setRtpEngines(rtpEngines.map((r) => `${r.remote.host}:${r.remote.port}`));
}

obj.getAvailableRtpengine = () => {
  return getRtpEngine();
};
