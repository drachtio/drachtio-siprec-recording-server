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
const transform = require('sdp-transform');
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
  return payloadParser(opts)
    .then(storeUnusedSdp)
    .then((opts) => {
      const fsUri = getAvailableFreeswitch();
      debug(`handleIncomingSiprecInvite: sending to ${fsUri}`);

      // New headers logic
      //console.log(opts.recordingData['recording'].participant[0].extensiondata[0]);
      const rapidsosheaderscount = opts.recordingData['recording'].participant[0].extensiondata[0]['apkt:header'].length;
      if (rapidsosheaderscount > 0){
        console.log("Processing [" + rapidsosheaderscount + "] RapidSOS Headers.")
        console.log(opts.recordingData['recording'].participant[0].extensiondata[0]['apkt:header'][0]);
        console.log(opts.recordingData['recording'].participant[0].extensiondata[0]['apkt:header'][1]);
        if (opts.recordingData['recording'].participant[0].extensiondata[0]['apkt:header'][1]['$']['label'] == 'X-RapidSOS-Record'){
              if (opts.recordingData['recording'].participant[0].extensiondata[0]['apkt:header'][1]['value'][0] == 'False'){
                      console.log("Rejecting call. No need to send to Media Server for recording.");
                      res.send(503, 'Not recording call', { headers: {'X-RapidSOS-Record': 'False' }});
                      return;
              } else
                console.log("Forwarding call to Media Server for recording.");
        }
      }

      const headers = {
        'X-Return-Token': opts.sessionId,
        'X-SBC-Call-ID': opts.originalCallId,
        'X-RapidSOS-ID': opts.recordingData['recording'].participant[0].extensiondata[0]['apkt:header'][0]['value'][0],
        'X-RapidSOS-Record': 'True'
      };

      const callOpts = {
        callingNumber: opts.caller.number,
        calledNumber: opts.callee.number,
        passProvisionalResponses: false,
        headers,
        localSdpB: opts.sdp1,
        localSdpA: createSdpForResponse.bind(null, opts.sessionId)
      };

      return srf.createB2BUA(req, res, fsUri, callOpts);
    })
    .catch((err) => {
      opts.logger.error(err, 'Error connecting incoming SIPREC call to freeswitch');
      throw err;
    })
    .then(setDialogHandlers.bind(this, opts.logger));
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

function setDialogHandlers(logger, {uas, uac}) {
  uas
    .on('destroy', () => {
      logger.info('call ended normally');
      uac.destroy();
    })
    .on('refresh', () => logger.info('received refreshing re-INVITE from siprec client'))
    .on('modify', (req, res) => {
      logger.info('received re-INVITE from SBC');
      res.send(200, {
        body: uas.local.sdp
      });
    });

  uac
    .on('destroy', () => {
      logger.info('call ended unexpectedly with BYE from Freeswitch');
      uas.destroy();
    })
    .on('refresh', () => logger.info('received refreshing re-INVITE from Freeswitch'));
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

  // add a=recvonly
  let sdp = transform.parse(req.body);
  sdp.media[0].direction = 'recvonly';
  sdp = transform.write(sdp);
  exchangeSdp(sessionId, sdp)
    .then((sdp) => req.srf.createUAS(req, res, {localSdp: sdp}))
    .catch((err) => {
      logger.error(err, 'Error replying to leg2 INVITE from Freeswitch');
      res.send(480);
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
