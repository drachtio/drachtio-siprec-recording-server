const config = require('config');
const pino = require('pino');
const Srf = require('drachtio-srf');
const srf = new Srf() ;
const logger = srf.locals.logger = pino();
const callHandler = require('./lib/call-handler');

if (config.has('drachtio.host')) {
  logger.info(`attempting inbound connection to: ${JSON.stringify(config.get('drachtio'))}`);
  srf.connect(config.get('drachtio'));
  srf
    .on('connect', (err, hp) => { logger.info(`inbound connection to drachtio listening on ${hp}`);})
    .on('error', (err) => { logger.error(err, `Error connecting to drachtio server: ${err}`); });
}
else {
  logger.info(`listening for outbound connections on: ${config.get('drachtio.port')}`);
  srf.listen(config.get('drachtio'));
}

// we only want to deal with siprec invites (having multipart content) in this application
srf.use('invite', (req, res, next) => {
  const ctype = req.get('Content-Type');
  if (!ctype || -1 === ctype.indexOf('multipart/mixed')) {
    logger.info(`rejecting non-SIPREC INVITE with call-id ${req.get('Call-ID')}`);
    return res.send(488);
  }
  next();
});

srf.invite(callHandler);
