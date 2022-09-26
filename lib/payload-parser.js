const xmlParser = require('xml2js').parseString;
const { v4 } = require('uuid');

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

      const arr = /^([^]+)(m=[^]+?)$/.exec(sdp) ;
      opts.sdp = `${arr[1]}${arr[2]}` ;

      resolve(opts) ;
    }) ;
  }) ;
};
