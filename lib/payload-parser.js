const xmlParser = require('xml2js').parseString;
const { v4 } = require('uuid');
const parseUri = require('drachtio-srf').parseUri;
const debug = require('debug')('drachtio:siprec-recording-server');

const parseCallData = (prefix, obj) => {
  const ret = {};
  const group = obj[`${prefix}group`];
  if (group) {
    const key = Object.keys(group[0]).find((k) => /:?callData$/.test(k));
    //const o = _.find(group[0], (value, key) => /:?callData$/.test(key));
    if (key) {
      //const callData = o[0];
      const callData = group[0][key];
      for (const key of Object.keys(callData)) {
        if (['fromhdr', 'tohdr', 'callid'].includes(key)) ret[key] = callData[key][0];
      }
    }
  }
  debug('parseCallData', prefix, obj, ret);
  return ret;
};

/**
 * parse a SIPREC multiparty body
 * @param  {object} opts - options
 * @return {Promise}
 */
module.exports = function parseSiprecPayload(req, logger) {
  const opts = {};
  return new Promise((resolve, reject) => {
    let sdp, meta ;
    for (let i = 0; i < req.payload.length; i++) {
      switch (req.payload[i].type) {
        case 'application/sdp':
          sdp = req.payload[i].content ;
          break ;

        case 'application/rs-metadata+xml':
        case 'application/rs-metadata':
          meta = opts.xml = req.payload[i].content ;
          break ;

        default:
          break ;
      }
    }


    if (!meta && sdp) {
      const arr = /^([^]+)(m=[^]+?)(m=[^]+?)$/.exec(sdp);
      opts.sdp1 = `${arr[1]}${arr[2]}`;
      opts.sdp2 = `${arr[1]}${arr[3]}\r\n`;
      opts.sessionId = v4();
      logger.info({ payload: req.payload }, 'SIPREC payload with no metadata (e.g. Cisco NBR)');
      resolve(opts);
    } else if (!sdp || !meta) {
      logger.info({ payload: req.payload }, 'invalid SIPREC payload');
      return reject(new Error('expected multipart SIPREC body'));
    }

    xmlParser(meta, (err, result) => {
      if (err) { throw err; }

      opts.recordingData = result ;
      opts.sessionId = v4() ;

      const arr = /^([^]+)(m=[^]+?)(m=[^]+?)$/.exec(sdp) ;
      opts.sdp1 = `${arr[1]}${arr[2]}` ;
      opts.sdp2 = `${arr[1]}${arr[3]}\r\n` ;

      try {
        if (typeof result === 'object' && Object.keys(result).length === 1) {
          const key = Object.keys(result)[0] ;
          const arr = /^(.*:)recording/.exec(key) ;
          const prefix = !arr ? '' : (arr[1]) ;
          const obj = opts.recordingData[`${prefix}recording`];

          // 1. collect participant data
          const participants = {} ;
          obj[`${prefix}participant`].forEach((p) => {
            const partDetails = {} ;
            participants[p.$.participant_id] = partDetails;
            if ((`${prefix}nameID` in p) && Array.isArray(p[`${prefix}nameID`])) {
              partDetails.aor = p[`${prefix}nameID`][0].$.aor;
              if ('name' in p[`${prefix}nameID`][0] && Array.isArray(p[`${prefix}nameID`][0].name)) {
                const name = p[`${prefix}nameID`][0].name[0];
                if (typeof name === 'string') partDetails.name = name ;
                else if (typeof name === 'object') partDetails.name = name._ ;
              }
            }
          });

          // 2. find the associated streams for each participant
          if (`${prefix}participantstreamassoc` in obj) {
            obj[`${prefix}participantstreamassoc`].forEach((ps) => {
              const part = participants[ps.$.participant_id];
              if (part) {
                if (ps.hasOwnProperty(`${prefix}send`)) {
                  part.send = ps[`${prefix}send`][0];
                }
                if (ps.hasOwnProperty(`${prefix}recv`)) {
                  part.recv = ps[`${prefix}recv`][0];
                }
              }
            });
          }

          // 3. Retrieve stream data
          opts.caller = {} ;
          opts.callee = {} ;
          obj[`${prefix}stream`].forEach((s) => {
            const streamId = s.$.stream_id;
            let sender;
            for (const [k, v] of Object.entries(participants)) {
              if (v.send === streamId) {
                sender = k;
                break;
              }
            }
            //const sender = _.find(participants, { 'send': streamId});

            if (!sender) return;

            sender.label = s[`${prefix}label`][0];

            if (-1 !== ['1', 'a_leg', 'inbound'].indexOf(sender.label)) {
              opts.caller.aor = sender.aor ;
              if (sender.name) opts.caller.name = sender.name;
            }
            else {
              opts.callee.aor = sender.aor ;
              if (sender.name) opts.callee.name = sender.name;
            }
          });

          // if we dont have a participantstreamassoc then assume the first participant is the caller
          if (!opts.caller.aor && !opts.callee.aor) {
            let i = 0;
            for (const part in participants) {
              const p = participants[part];
              if (0 === i && p.aor) {
                opts.caller.aor = p.aor;
                opts.caller.name = p.name;
              }
              else if (1 === i && p.aor) {
                opts.callee.aor = p.aor;
                opts.callee.name = p.name;
              }
              i++;
            }
          }

          // now for Sonus (at least) we get the original from, to and call-id headers in a <callData/> element
          // if so, this should take preference
          const callData = parseCallData(prefix, obj);
          if (callData) {
            debug(`callData: ${JSON.stringify(callData)}`);
            opts.originalCallId = callData.callid;

            // caller
            let r1 = /^(.*)(<sip.*)$/.exec(callData.fromhdr);
            if (r1) {
              const arr = /<(.*)>/.exec(r1[2]);
              if (arr) {
                const uri = parseUri(arr[1]);
                const user = uri.user || 'anonymous';
                opts.caller.aor = `sip:${user}@${uri.host}`;
              }
              const dname = r1[1].trim();
              const arr2 = /"(.*)"/.exec(dname);
              if (arr2) opts.caller.name = arr2[1];
              else opts.caller.name = dname;
            }
            // callee
            r1 = /^(.*)(<sip.*)$/.exec(callData.tohdr);
            if (r1) {
              const arr = /<(.*)>/.exec(r1[2]);
              if (arr) {
                const uri = parseUri(arr[1]);
                opts.callee.aor = `sip:${uri.user}@${uri.host}`;
              }
              const dname = r1[1].trim();
              const arr2 = /"(.*)"/.exec(dname);
              if (arr2) opts.callee.name = arr2[1];
              else opts.callee.name = dname;
            }
            debug(`opts.caller from callData: ${JSON.stringify(opts.caller)}`);
            debug(`opts.callee from callData: ${JSON.stringify(opts.callee)}`);
          }

          if (opts.caller.aor && 0 !== opts.caller.aor.indexOf('sip:')) {
            opts.caller.aor = 'sip:' + opts.caller.aor;
          }
          if (opts.callee.aor && 0 !== opts.callee.aor.indexOf('sip:')) {
            opts.callee.aor = 'sip:' + opts.callee.aor;
          }

          if (opts.caller.aor) {
            const uri = parseUri(opts.caller.aor);
            if (uri) opts.caller.number = uri.user;
            else {
              const arr = /sip:(.*)@/.exec(opts.callee.aor);
              opts.caller.number = arr[1];
            }
          }
          if (opts.callee.aor) {
            const uri = parseUri(opts.callee.aor);
            if (uri) opts.callee.number = uri.user;
            else {
              const arr = /sip:(.*)@/.exec(opts.callee.aor);
              opts.callee.number = arr[1];
            }
          }
          opts.recordingSessionId = opts.recordingData[`${prefix}recording`][`${prefix}session`][0].$.session_id;
        }
      }
      catch (err) {
        reject(err);
      }
      debug(opts, 'payload parser results');
      resolve(opts) ;
    }) ;
  }) ;
};
