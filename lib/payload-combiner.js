module.exports = function(sdp1, sdp2) {
  const arr1 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(sdp1) ;
  const arr2 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(sdp2) ;

  const aLabel = sdp1.includes('a=label:') ? '' : 'a=label:1\r\n';
  const bLabel = sdp2.includes('a=label:') ? '' : 'a=label:2\r\n';
  const combinedSdp = `${arr1[1]}t=0 0\r\n${arr1[2]}${arr1[3]}${arr1[4]}${aLabel}${arr2[3]}${arr2[4]}${bLabel}`
    .replace(/a=sendonly\r\n/g, '')
    .replace(/a=direction:both\r\n/g, '');

  return combinedSdp;
};

