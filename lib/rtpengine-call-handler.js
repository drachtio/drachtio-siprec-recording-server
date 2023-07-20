const parseSiprecPayload = require('./payload-parser');
const constructSiprecPayload = require('./payload-combiner');
const { getAvailableRtpengine } = require('./utils');
const { v4 } = require('uuid');

module.exports = async(req, res) => {
  const callid = req.get('Call-ID');
  const from = req.getParsedHeader('From');
  const logger = req.srf.locals.logger.child({ callid });
  const {sdp1, sdp2} = await parseSiprecPayload(req, logger);

  logger.info(`received SIPREC invite: ${req.uri}`);
  const engine = getAvailableRtpengine();

  if (!engine) {
    this.logger.info('No available rtpengines, rejecting call!');
    return this.res.send(480);
  }

  const {
    offer,
    answer,
    del,
    subscribeDTMF,
    unsubscribeDTMF
  } = engine;

  const callDetails = {
    'call-id': req.get('Call-ID'),
    'from-tag': from.params.tag
  };

  const common = {
    ...callDetails,
    replace: ['origin', 'session-connection'],
    'record call': 'yes',
    'transport protocol': 'RTP/AVP',
    DTLS: 'off',
    SDES: 'off',
    ICE: 'remove',
    flags: ['media handover', 'port latching'],
    'rtcp-mux': ['accept'],
    direction:  ['public', 'public'],
  };


  const rtpengineCallerSdp = (await offer({...common, sdp: sdp1})).sdp;
  const rtpengineCalleeSdp = (await answer({...common, 'to-tag': v4(), sdp: sdp2})).sdp;
  const combindSdp = constructSiprecPayload(rtpengineCallerSdp, rtpengineCalleeSdp);
  const dlg = await req.srf.createUAS(req, res, { localSdp: combindSdp });
  subscribeDTMF(logger, callid, from.params.tag, _onDTMF.bind(null, dlg, logger));
  dlg.on('destroy', onCallEnd.bind(null, del, unsubscribeDTMF, callDetails, logger));
};

async function _onDTMF(dlg, logger, payload) {
  logger.info({payload}, '_onDTMF');
}

async function onCallEnd(del, unsubscribeDTMF, opts, logger) {
  logger.info('call ended');
  unsubscribeDTMF(logger, opts['call-id'], opts['from-tag']);
  del(opts)
    .then((response) => logger.info(`response to rtpengine delete: ${JSON.stringify(response)}`))
    .catch((error) => logger.error(error));
}
