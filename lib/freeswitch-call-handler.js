const payloadParser = require('./payload-parser');
const payloadCombiner = require('./payload-combiner');
const Mrf = require('drachtio-fsmrf');
const config = require('config');

module.exports = handler;

async function connectMS(srf) {
  const mrf = new Mrf(srf);
  return await mrf.connect(config.get('freeswitch'));
}

function handler(logger) {
  let ms;

  return async function handler(req, res) {
    const callid = req.get('Call-ID');
    const logger = req.srf.locals.logger.child({callid});
    const srf = req.srf;
    const wsUrl = req.srf.locals.wsUrl;
    logger.info(`received incoming SIPREC invite to ${req.uri}`);

    try {
      ms = ms || await connectMS(req.srf);
    } catch (err) {
      logger.error(err, 'Error connecting to freeswitch');
      return res.send(480);
    }

    try {
      const opts = await payloadParser({req});
      const ep1 = await ms.createEndpoint({remoteSdp: opts.sdp1});
      const ep2 = await ms.createEndpoint({remoteSdp: opts.sdp2});
      await ep2.bridge(ep1);
      if (config.has('wsUrl')) {
        const metadata = {
          callid,
          from: opts.caller.aor,
          to: opts.callee.aor
        };
        const result = await ep1.forkAudioStart({
          mixType: 'stereo',
          sampling: '8k',
          wsUrl: config.get('wsUrl'),
          metadata
        });
        logger.info(`result from calling mod_audio_fork: ${JSON.stringify(result)}`);
      }
      const localSdp = payloadCombiner(ep1.local.sdp, ep2.local.sdp);
      const dlg = await srf.createUAS(req, res, {localSdp});
      logger.info('successfully answered call');
      dlg.on('destroy', () => {
        logger.info('call ended');
        ep1.destroy();
        ep2.destroy();
      });
    } catch (err) {
      logger.error(err, 'Error establishing call');
    }
  };
}
