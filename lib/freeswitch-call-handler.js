/**
 * Call comes in and its a SIPREC call (multi-part content)
 * Parse the payload into two sdps
 * Creeate a uuid and store the uniused sdp by uuid
 * Srf#createB2BUA where localSdpA is the SDP we will use first,
 * and localSdpB is a function that pulls the sdp back out of redis
 * and creates a multipart SDP
 * Now, when the other INVITE comes in from freeswwitch
 * we pull the unused SDP out of redis and stick the one FS is offering back in there
 * we send 200 OK with the unused SDP and we are done
 */
const config = require('config');
const redis = require('redis') ;
let client;
const payloadParser = require('./payload-parser');
const payloadCombiner = require('./payload-combiner');
const {isFreeswitchSource, getAvailableFreeswitch} = require('./utils');
const debug = require('debug')('drachtio:siprec-recording-server');

module.exports = (logger) => {
  const redisOpts = Object.assign('test' === process.env.NODE_ENV ?
    {
      retry_strategy: () => {},
      disable_resubscribing: true,
    } : {}
  ) ;

  client = redis.createClient(config.get('redis.port'), config.get('redis.host'), redisOpts);
  client.on('connect', () => {
    logger.info(`successfully connected to redis at ${config.get('redis.host')}:${config.get('redis.port')}`);
  })
    .on('error', (err) => {
      logger.error(err, 'redis connection error') ;
    }) ;

  return handler;
};

const handler = (req, res) => {
  const callid = req.get('Call-ID');
  const logger = req.srf.locals.logger.child({callid});
  const opts = {req, res, logger};
  const ctype = req.get('Content-Type') || '';

  if (ctype.includes('multipart/mixed')) {
    logger.info(`received SIPREC invite: ${req.uri}`);
    handleIncomingSiprecInvite(req, res, opts);
  }
  else if (isFreeswitchSource(req)) {
    logger.info(`received leg2 invite from freeswitch: ${req.source_address} sessionID: ${req.get('X-Return-Token')}`);
    handleLeg2SiprecInvite(req, res, opts);
  }
  else {
    logger.info(`rejecting INVITE from ${req.source_address} because it is not a siprec INVITE`);
    res.send(488);
  }
};

/**
 * Retrieve the SDP from redis (which will be the one FS offered on the leg 2 INVITE), and
 * combine it with the SDP we just got in the 200 OK to the leg1 iNVITE
 * @param {*} sdp SDP offered by Freeswitch in leg2 INVITE
 * @param {*} res res SIP Response object
 */
function createSdpForResponse(sessionId, sdp, res) {
  return new Promise((resolve, reject) => {
    client.get(sessionId, (err, result) => {
      if (err) {
        return reject(err);
      }
      resolve(payloadCombiner(sdp, result));
    });
  });
}

function handleIncomingSiprecInvite(req, res, opts) {
  const srf = req.srf;
  payloadParser(opts)
    .then(storeUnusedSdp)
    .then((opts) => {
      const fsUri = getAvailableFreeswitch();
      debug(`handleIncomingSiprecInvite: sending to ${fsUri}`);
      return srf.createB2BUA(req, res, fsUri, {
        passProvisionalResponses: false,
        headers: {
          'X-Return-Token': `${opts.sessionId}`
        },
        localSdpB: opts.sdp1,
        localSdpA: createSdpForResponse.bind(null, opts.sessionId)
      });
    })
    .catch((err) => opts.logger.error(err, 'Error connecting incoming SIPREC call to freeswitch'));
}

function storeUnusedSdp(opts) {
  return new Promise((resolve) => {
    debug(`sessionId: ${opts.sessionId}: sdp ${opts.sdp2}`);
    client.set(opts.sessionId, opts.sdp2, 'EX', 10, (err, reply) => {
      if (err) throw err;
      resolve(opts) ;
    }) ;
  });
}

function exchangeSdp(sessionId, sdp) {
  return new Promise((resolve, reject) => {
    client.multi()
      .get(sessionId)
      .set(sessionId, sdp)
      .exec((err, replies) => {
        if (err) return reject(err);
        resolve(replies[0]);
      });
  });
}
/**
 * Get session-id from Subject header.  Lookup unused SDP by session id, and exchange the offered SDP back into redis.
 * Send 200 OK with the unused SDP from the original SIPREC INVITE.
 * @param {*} req
 * @param {*} res
 * @param {*} opts
 */
function handleLeg2SiprecInvite(req, res, opts) {
  const logger = opts.logger;
  const sessionId = req.get('X-Return-Token');
  debug(`handleLeg2SiprecInvite: sessionId is ${sessionId}`);
  exchangeSdp(sessionId, req.body)
    .then((sdp) => req.srf.createUAS(req, res, {localSdp: sdp}))
    .catch((err) => {
      logger.error(err, 'Error replying to leg2 INVITE from Freeswitch');
      res.send(480);
    });
}
