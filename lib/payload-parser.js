const xmlParser = require('xml2js').parseString;
const { v4 } = require('uuid');
const _ = require('lodash');
const parseUri = require('drachtio-srf').parseUri;
const debug = require('debug')('drachtio:siprec-recording-server');

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
      let content_type = req.payload[i].type;
      if (!content_type) {
        continue;
      }
      content_type = content_type.split(';')[0];
      switch (content_type) {
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
      opts.sessionId = v4() ;

      const arr = /^([^]+)(m=[^]+?)(m=[^]+?)$/.exec(sdp) ;
      opts.sdp1 = `${arr[1]}${arr[2]}` ;
      opts.sdp2 = `${arr[1]}${arr[3]}\r\n` ;
      //split SDP2
      const sdp2_lines = (opts.sdp2).split('\r\n');
      //get payload_type fo SDP2
      let codec_payload = "unknown";
      for (part in sdp2_lines){
        if ( sdp2_lines[part].startsWith("m=audio") ) {
          const line = sdp2_lines[part].split(' ');
          codec_payload = line[3];
        }
      }
      let new_sdp1 = "";
      if (codec_payload != "unknown") {
        sdp1_lines = (opts.sdp1).split("\r\n");
        for (part in sdp1_lines) {
          if ( sdp1_lines[part].startsWith("m=audio") ){
            let words = sdp1_lines[part].split(' ');
            m_line =  words[0] + " " + words[1] + " " + words[2] + " " + codec_payload + " " + words[words.length -1];
            new_sdp1 += m_line + "\r\n";

          }
          else if ( sdp1_lines[part].startsWith("a=rtpmap:") ) {
            if ( sdp1_lines[part].startsWith("a=rtpmap:" + codec_payload) || sdp1_lines[part].startsWith("a=rtpmap:10" ))  //covers 100 and 101
              new_sdp1 += sdp1_lines[part] + "\r\n";
            else
              continue;
          }
          else if ( sdp1_lines[part].startsWith("a=fmtp:") ) {
            if ( sdp1_lines[part].startsWith("a=fmtp:" + codec_payload) )
              new_sdp1 += sdp1_lines[part] + "\r\n";
            else if ( sdp1_lines[part].startsWith("a=fmtp:100") || sdp1_lines[part].startsWith("a=fmtp:101") )
              new_sdp1 += sdp1_lines[part] + "\r\n";
            else
              continue;
          }
          else {
            new_sdp1 += sdp1_lines[part] + "\r\n";
          }
        }
        opts.sdp1 = new_sdp1; //re-writing sdp1
      }
      try {
        if (typeof result === 'object' && Object.keys(result).length === 1) {
          const key = Object.keys(result)[0] ;
          const arr = /^(.*:)recording/.exec(key) ;
          const prefix = !arr ? '' : (arr[1]) ;
          const obj = opts.recordingData[`${prefix}recording`];
	  console.log(obj.participant[0].extensiondata[0]['apkt:header'][0]['value'][0]);

          // 1. collect participant data
          const participants = {} ;
          obj[`${prefix}participant`].forEach((p) => {
            const partDetails = {} ;
            // fix for acme packet xml participants
            if (p.$.id) {
              participants[p.$.id] = partDetails;
            }
            else {
              participants[p.$.participant_id] = partDetails;
            }
            // end of fix
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
              if (part && Array.isArray(ps[`${prefix}send`])) {
                part.send = ps[`${prefix}send`][0];
                //part.recv = ps[`${prefix}recv`][0];
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

            if (-1 !== ['1', 'a_leg', '10'].indexOf(sender.label)) {
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
            let user;
            const uri = parseUri(opts.caller.aor);
            if (uri) user = uri.user;
            else {
              const arr = /sip:(.*)@/.exec(opts.caller.aor);
              if (arr) {
                user = arr[1];
              }
            }
            debug(`parsed user ${user} from caller aor ${opts.caller.aor}`);
            opts.caller.number = user;
          }
          if (opts.callee.aor) {
            let user;
            const uri = parseUri(opts.callee.aor);
            if (uri) user = uri.user;
            else {
              const arr = /sip:(.*)@/.exec(opts.callee.aor);
              if (arr) {
                user = arr[1];
              }
            }
            debug(`parsed user ${user} from callee aor ${opts.callee.aor}`);
            opts.callee.number = user;
          }
          opts.recordingSessionId = opts.recordingData[`${prefix}recording`][`${prefix}session`][0].$.session_id;
        }
      }
      catch (err) {
        console.log(`Error parsing ${err}`);
        reject(err);
      }
      debug(opts, 'payload parser results');
      resolve(opts) ;
    }) ;
  }) ;

  function parseCallData(prefix, obj) {
    const ret = {};
    const group = obj[`${prefix}group`];
    if (group) {
      const o = _.find(group[0], (value, key) => /:?callData$/.test(key));
      if (o) {
        const callData = o[0];
        for (const key of Object.keys(callData)) {
          if (['fromhdr', 'tohdr', 'callid'].includes(key)) ret[key] = callData[key][0];
        }
      }
    }

    return ret;
  }
};
