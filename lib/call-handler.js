const config = require('config');
const parseSiprecPayload = require('./payload-parser');
const constructSiprecPayload = require('./payload-combiner');
const Client = require('rtpengine-client').Client ;
const rtpengine = new Client({port: config.get('rtpengine.localPort'), timeout: 600});
const rtpengineLocation = config.get('rtpengine.remote');
const uuidv4 = require('uuid/v4');

module.exports = (req, res) => {
  const callid = req.get('Call-ID');
  const from = req.getParsedHeader('From');
  const logger = req.srf.locals.logger.child({callid});
  const opts = {
    req,
    res,
    logger,
    callDetails: {
      'call-id': callid,
      'from-tag': from.params.tag
    }
  };

  logger.info(`received SIPREC invite: ${req.uri}`);

  parseSiprecPayload(req)
    .then(allocateEndpoint.bind(null, 'caller'))
    .then(allocateEndpoint.bind(null, 'callee'))
    .then(respondToInvite)
    .then((dlg) => {
      logger.info('call connected successfully');
      return dlg.on('destroy', onCallEnd.bind(null, opts));
    })
    .catch((err) => {
      logger.error(`Error connecting call: ${err}`);
    });
};

function allocateEndpoint(which, opts) {
  const args = Object.assign({}, opts.callDetails, {
    'sdp': which === 'caller' ? opts.sdp1 : opts.sdp2,
    'replace': ['origin', 'session-connection'],
    'ICE': 'remove',
    'record call': 'yes'
  });
  if (which === 'callee') Object.assign(args, {'to-tag': uuidv4()});

  return rtpengine[which === 'caller' ? 'offer' : 'answer'](rtpengineLocation, args)
    .then((response) => {
      if (response.result !== 'ok') {
        throw new Error('error connecting to rtpengine');
      }
      opts[which === 'caller' ? 'rtpengineCallerSdp' : 'rtpengineCalleeSdp'] = response.sdp;
      return opts;
    });
}

function respondToInvite(opts) {
  const srf = opts.req.srf;
  const payload = constructSiprecPayload(opts.rtpengineCallerSdp, opts.rtpengineCalleeSdp);
  return srf.createUAS(opts.req, opts.res, {localSdp: payload});
}

function onCallEnd(opts) {
  opts.logger.info('call ended');
  return rtpengine.delete(rtpengineLocation, opts.callDetails);
}
