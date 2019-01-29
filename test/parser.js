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
      t.ok(obj.sdp1, 'parsed first SDP');
      t.ok(obj.sdp2, 'parsed second SDP');
      t.ok(obj.caller.aor, 'parsed caller aor');
      t.ok(obj.sessionId, `parsed session id ${obj.sessionId}`);
      t.ok(obj.recordingSessionId, `parsed recording session id: ${obj.recordingSessionId}`);
      t.end();
      return;
    })
    .catch((err) => {
      console.error(err.stack);
      t.error(err);
    });
}

test('parser: Promcomm SIPREC payload', (t) => {
  parseAndVerifyPayload('procomm-siprec-offer.txt', '--2CD2A2E9', t) ;
}) ;

test('parser: Sonus SIPREC payload', (t) => {
  parseAndVerifyPayload('sonus-siprec-offer.txt', '--sonus-content-delim', t) ;
}) ;

test('parser: Cisco SIPREC payload', (t) => {
  parseAndVerifyPayload('cisco-siprec-offer.txt', '--uniqueBoundary', t) ;
}) ;
test('parser: Connectel SIPREC payload', (t) => {
  parseAndVerifyPayload('connectel-offer.txt', '--OSS-unique-boundary-42', t) ;
}) ;
test('parser: Connectel SIPREC payload (2)', (t) => {
  parseAndVerifyPayload('connectel-offer2.txt', '--OSS-unique-boundary-42', t) ;
}) ;
test('parser: Connectel SIPREC payload (3)', (t) => {
  parseAndVerifyPayload('connectel-offer3.txt', '--OSS-unique-boundary-42', t) ;
}) ;
test('combiner: sample1)', (t) => {
  combineAndVerifyPayloads('sample-sdps.txt', '__split_here__', t) ;
}) ;
test('combiner: sample2)', (t) => {
  combineAndVerifyPayloads('sample-sdp2.txt', '__split_here__', t) ;
}) ;
