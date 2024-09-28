const dgram = require('dgram');
const config = require('config');
let socket;

module.exports = (logger) => {

  const dtmf_log_port = config.has('rtpengine.localPort') ? config.get('rtpengine.localPort') : 22223;

  if (!socket) {
    logger.info(`creating socket listening on port ${dtmf_log_port}`);
    socket = dgram.createSocket('udp4');
    socket
      .on('listening', () => {
        const address = socket.address();
        logger.info(`dtmf-event-handler listening on ${address.address}:${address.port} for DTMF`);
      })
      .on('error', (err) => {
        logger.info({err}, 'dtmf-event-handler error');
        socket.close();
      })
      .on('message', (msg) => {
        try {
          const payload = JSON.parse(msg);
          logger.info({payload}, '_onDTMF');
        } catch (err) {
          logger.info({err}, 'dtmf-event-handler: error parsing DTMF event');
        }
      });
    socket.bind(dtmf_log_port);
  }
};
