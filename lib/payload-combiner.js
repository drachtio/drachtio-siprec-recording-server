const transform = require('sdp-transform');
const debug = require('debug')('drachtio:siprec-recording-server');

module.exports = function createSipRecPayload(sdp1, sdp2) {
  const sdpObj = [];
  sdpObj.push(transform.parse(sdp1));
  sdpObj.push(transform.parse(sdp2));

  //const arr1 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(sdp1) ;
  //const arr2 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(sdp2) ;

  debug(`sdp1:      ${sdp1}`);
  debug(`objSdp[0]: ${JSON.stringify(sdpObj[0])}`);
  debug(`sdp2:      ${sdp2}`);
  debug(`objSdp[1]: ${JSON.stringify(sdpObj[1])}`);

  if (!sdpObj[0] || !sdpObj[0].media.length) {
    throw new Error(`Error parsing sdp1 into component parts: ${sdp1}`);
  }
  else if (!sdpObj[1] || !sdpObj[1].media.length)  {
    throw new Error(`Error parsing sdp2 into component parts: ${sdp2}`);
  }

  if (!sdpObj[0].media[0].label) sdpObj[0].media[0].label = 1;
  if (!sdpObj[1].media[0].label) sdpObj[1].media[0].label = 2;

  //const aLabel = sdp1.includes('a=label:') ? '' : 'a=label:1\r\n';
  //const bLabel = sdp2.includes('a=label:') ? '' : 'a=label:2\r\n';

  sdpObj[0].media = sdpObj[0].media.concat(sdpObj[1].media);
  const combinedSdp = transform.write(sdpObj[0])
    .replace(/a=sendonly\r\n/g, '')
    .replace(/a=direction:both\r\n/g, '');

  debug(`combined ${combinedSdp}`);
  /*
  const combinedSdp = `${arr1[1]}t=0 0\r\n${arr1[2]}${arr1[3]}${arr1[4]}${aLabel}${arr2[3]}${arr2[4]}${bLabel}`
    .replace(/a=sendonly\r\n/g, '')
    .replace(/a=direction:both\r\n/g, '');
  */

  return combinedSdp.replace(/sendrecv/g, 'recvonly');
};

