const test = require('blue-tape');
const { exec } = require('child_process');
const debug = require('debug')('drachtio:siprec-recording-server');
const clearRequire = require('clear-require');

const execCmd = (cmd, opts) => {
  opts = opts || {} ;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      exec(cmd, opts, (err, stdout, stderr) => {
        if (stdout) debug(stdout);
        if (stderr) debug(stderr);
        if (err) return reject(err);
        resolve();
      });
    }, 750);
  });
};

test.skip('docker pull sipp', (t) => {
  t.timeoutAfter(120000);
  execCmd('docker pull drachtio/sipp:latest')
    .then(() => {
      t.pass('pulled drachtio/sipp:latest image');
      return ;
    })
    .then(() => {
      return execCmd('docker ps');
    })
    .then(() => {
      return t.end();
    })
    .catch((err) => {
      t.end(err);
    });
});

test('siprec with rtpengine recorder', (t) => {
  t.timeoutAfter(20000);

  const vmap = `-v ${__dirname}/scenarios:/tmp`;
  const args = 'drachtio/sipp sipp -m 1 -sf /tmp/uac_siprec_pcap.xml drachtio';
  const cmd = `docker run -t --rm --net test_siprec ${vmap} ${args}`;

  const srf = require('..');
  srf
    .on('connect', () => {

      console.log(`cmd: ${cmd}`);
      execCmd(cmd)
        .then(() => {
          t.pass('siprec with rtpengine passed');
          srf.disconnect();
          return t.end();
        })
        .catch((err) => {
          t.end(err, 'test failed');
        });
    })
    .on('error', (err) => {
      t.end(err, 'error connecting to drachtio');
    });
}) ;

test('siprec with multiple rtpengines', (t) => {
  t.timeoutAfter(20000);

  clearRequire('..');
  clearRequire('../lib/rtpengine-call-handler');
  clearRequire('../lib/utils');
  clearRequire('config');
  process.env.NODE_CONFIG_ENV = 'test3';

  const vmap = `-v ${__dirname}/scenarios:/tmp`;
  const args = 'drachtio/sipp sipp -m 2 -sf /tmp/uac_siprec_pcap.xml drachtio';
  const cmd = `docker run -t --rm --net test_siprec ${vmap} ${args}`;

  const srf = require('..');
  srf
    .on('connect', () => {

      console.log(`cmd: ${cmd}`);
      execCmd(cmd)
        .then(() => {
          t.pass('successfully connected two calls');
          srf.disconnect();
          return t.end();
        })
        .catch((err) => {
          t.end(err, 'test failed');
        });
    })
    .on('error', (err) => {
      t.end(err, 'error connecting to drachtio');
    });
  }) ;
  test('siprec with freeswitch recorder', (t) => {
    t.timeoutAfter(20000);
  
    clearRequire('..');
    clearRequire('../lib/utils');
    clearRequire('config');
    process.env.NODE_CONFIG_ENV = 'test2';
  
    const vmap = `-v ${__dirname}/scenarios:/tmp`;
    const args = 'drachtio/sipp sipp -m 1 -sf /tmp/uac_siprec_pcap.xml drachtio';
    const cmd = `docker run -t --rm --net test_siprec ${vmap} ${args}`;
  
    const srf = require('..');
    srf
      .on('connect', () => {
  
        console.log(`cmd: ${cmd}`);
        execCmd(cmd)
          .then(() => {
            t.pass('siprec with freeswitch passed');
            srf.disconnect();
            return t.end();
          })
          .catch((err) => {
            t.end(err, 'test failed');
          });
      })
      .on('error', (err) => {
        t.end(err, 'error connecting to drachtio');
      });
}) ;
