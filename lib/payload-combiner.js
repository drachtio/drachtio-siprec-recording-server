const debug = require('debug')('drachtio:siprec-recording-server');

module.exports = function(sdp1, sdp2) {
  const arr1 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(sdp1) ;
  const arr2 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(sdp2) ;

  debug(`combining sdp1: ${sdp1}`);
  debug(`with sdp2:      ${sdp2}`);

  if (!arr1) {
    throw new Error(`Error parsing sdp1 into component parts: ${sdp1}`);
  }
  else if (!arr2) {
    throw new Error(`Error parsing sdp2 into component parts: ${sdp2}`);
  }

  const aLabel = sdp1.includes('a=label:') ? '' : 'a=label:1\r\n';
  const bLabel = sdp2.includes('a=label:') ? '' : 'a=label:2\r\n';
  const combinedSdp = `${arr1[1]}t=0 0\r\n${arr1[2]}${arr1[3]}${arr1[4]}${aLabel}${arr2[3]}${arr2[4]}${bLabel}`
    .replace(/a=sendonly\r\n/g, '')
    .replace(/a=direction:both\r\n/g, '');

  return combinedSdp;
};

