const xmlParser = require('xml2js').parseString;
const uuid = require('uuid/v4');
const _ = require('lodash');
/**
 * parse a SIPREC multiparty body
 * @param  {object} opts - options
 * @return {Promise}
 */
module.exports = function parseSiprecPayload(opts) {
  const req = opts.req;
  return new Promise((resolve, reject) => {
    let sdp, meta ;
    for (let i = 0; i < req.payload.length; i++) {
      switch (req.payload[i].type) {
        case 'application/sdp':
          sdp = req.payload[i].content ;
          break ;

        case 'application/rs-metadata+xml':
        case 'application/rs-metadata':
          meta = req.payload[i].content ;
          break ;

        default:
          break ;
      }
    }

    if (!sdp || !meta) {
      return reject(new Error('expected multipart SIPREC body'));
    }

    xmlParser(meta, (err, result) => {
      if (err) { throw err; }

      opts.recordingData = result ;
      opts.sessionId = uuid() ;

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
                part.send = ps[`${prefix}send`][0];
                part.recv = ps[`${prefix}recv`][0];
              }
            });
          }

          // 3. Retrieve stream data
          opts.caller = {} ;
          opts.callee = {} ;
          obj[`${prefix}stream`].forEach((s) => {
            const streamId = s.$.stream_id;
            const sender = _.find(participants, { 'send': streamId});

            if (!sender) return;

            sender.label = s[`${prefix}label`][0];

            if (-1 !== ['1', 'a_leg'].indexOf(sender.label)) {
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

          if (opts.caller.aor && 0 !== opts.caller.aor.indexOf('sip:')) {
            opts.caller.aor = 'sip:' + opts.caller.aor;
          }
          if (opts.callee.aor && 0 !== opts.callee.aor.indexOf('sip:')) {
            opts.callee.aor = 'sip:' + opts.callee.aor;
          }
          opts.recordingSessionId = opts.recordingData[`${prefix}recording`][`${prefix}session`][0].$.session_id;
        }
      }
      catch (err) {
        reject(err);
      }
      resolve(opts) ;
    }) ;
  }) ;
};
