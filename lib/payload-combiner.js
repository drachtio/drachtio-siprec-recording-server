module.exports = function(sdp1, sdp2) {
  const arr1 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(sdp1) ;
  const arr2 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(sdp2) ;

  const combinedSdp = `${arr1[1]}t=0 0\r\n${arr1[2]}${arr1[3]}${arr1[4]}${arr2[3]}${arr2[4]}`
    .replace(/a=sendonly\r\n/g, '')
    .replace(/a=direction:both\r\n/g, '');

  return combinedSdp;
};

