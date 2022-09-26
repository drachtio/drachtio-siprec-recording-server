const parseSiprecPayload = require('./payload-parser');
const constructSiprecPayload = require('./payload-combiner');
const {getAvailableRtpengine} = require('./utils');
const { v4 } = require('uuid');
const debug = require('debug')('drachtio:siprec-recording-server');

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
  const rtpEngine = getAvailableRtpengine();

  parseSiprecPayload(opts)
    .then(allocateEndpoint.bind(null, 'caller', rtpEngine))
    .then(respondToInvite)
    .then((dlg) => {
      logger.info(`call connected successfully, using rtpengine at ${JSON.stringify(rtpEngine.remote)}`);
      return dlg.on('destroy', onCallEnd.bind(null, rtpEngine, opts));
    })
    .catch((err) => {
      logger.error(`Error connecting call: ${err}`);
    });
};

function allocateEndpoint(which, rtpEngine, opts) {
  const args = Object.assign({}, opts.callDetails, {
    'sdp': opts.sdp,
    'replace': ['origin', 'session-connection'],
    'ICE': 'remove',
    'record call': 'yes'
  });

  debug(`callDetails: ${opts.callDetails}`);
  debug(`rtpengine args for ${which}: ${JSON.stringify(args)}, sending to ${JSON.stringify(rtpEngine.remote)}`);
  return rtpEngine['offer'](rtpEngine.remote, args)
    .then((response) => {
      if (response.result !== 'ok') {
        throw new Error('error connecting to rtpengine');
      }
      opts['rtpengineCallerSdp'] = response.sdp;
      return opts;
    });
}

function respondToInvite(opts) {
  const srf = opts.req.srf;
  const payload = constructSiprecPayload(opts.rtpengineCallerSdp, opts.rtpengineCalleeSdp);
  return srf.createUAS(opts.req, opts.res, {localSdp: payload});
}

function onCallEnd(rtpEngine, opts) {
  opts.logger.info('call ended');
  return rtpEngine.delete(rtpEngine.remote, opts.callDetails)
    .then((response) => {
      return debug(`response to rtpengine delete: ${JSON.stringify(response)}`);
    });
}
