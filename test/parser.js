const test = require('tape').test ;
const parsePayload = require('./../lib/payload-parser') ;
const combinePayloads = require('./../lib/payload-combiner') ;
const fs = require('fs-extra') ;

function combineAndVerifyPayloads(filename, delimiter, t) {
  fs.readFile(`${__dirname}/data/${filename}`, 'utf8')
    .then((data) => {
      const sdp = data.split('__split_here__');
      t.ok(sdp.length === 2, 'read two sdps');
      const full = combinePayloads(sdp[0], sdp[1]);
      t.pass('combined payloads');
      t.end();
    })
    .catch((err) => {
      console.error(err.stack);
      t.error(err);
    });
}

function parseAndVerifyPayload(filename, delimiter, t) {
  fs.readFile(`${__dirname}/data/${filename}`, 'utf8')
    .then((data) => {
      const segments = data.split(`\n${delimiter}`) ;
      const regex = /.*Content-Type:\s+(.*)\n.*\n([\s\S.]*)$/;
      const req = {payload: []} ;

      for (let i = 1; i < segments.length; i++) {
        const arr = regex.exec(segments[i]) ;
        if (!arr) {
          continue;
        }
        req.payload.push({type: arr[1], content: arr[2]}) ;
      }
      return parsePayload({req}) ;
    })
    .then((obj) => {
      t.ok(obj.sdp, 'parsed first SDP');
      t.end();
      return;
    })
    .catch((err) => {
      console.error(err.stack);
      t.error(err);
    });
}
test('parser: Intrado Viper SIPREC payload', (t) => {
  parseAndVerifyPayload('intrado-siprec-invite.txt', '--Itro-wXyZ-bdry', t) ;
}) ;
