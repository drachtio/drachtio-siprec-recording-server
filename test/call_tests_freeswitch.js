const test = require('blue-tape');
const { exec } = require('child_process');
const debug = require('debug')('drachtio:siprec-recording-server');
const clearRequire = require('clear-require');
//const test = require('tape').test ;
//const exec = require('child_process').exec ;
const fs = require('fs-extra');


const execCmd = (cmd, opts) => {
  opts = opts || {} ;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      exec(cmd, opts, (err, stdout, stderr) => {
        if (stdout) debug(stdout);
        if (stderr) console.log(stderr);
        if (err) return reject(err);
        resolve();
      });
    }, 7500);
  });
};

test('starting docker network..', (t) => {
  t.timeoutAfter(180000);

  // clear log and output directories
  fs.emptyDir(`${__dirname}/tmp/log`)
    .then(fs.emptyDir(`${__dirname}/tmp/rtpengine`))
    .catch((err) => {
      console.log(`Error cleaning tmp folders: ${err}`);
      t.end(err);
    });
  exec(`docker-compose -p test -f ${__dirname}/docker-compose-freeswitch.yaml up -d`, (err, stdout, stderr) => {
    if (-1 != stderr.indexOf('is up-to-date')) return t.end() ;
    console.log('docker network started, giving extra time for freeswitch to initialize...');
    setTimeout(() => {
      exec('docker exec freeswitch fs_cli -x "console loglevel debug"', (err, stdout, stderr) => {
        t.end(err) ;
      });
    }, 18000);
  });
});

test('siprec with freeswitch recorder', (t) => {
  t.timeoutAfter(20000);

  clearRequire('..');
  clearRequire('../lib/utils');
  clearRequire('config');
  process.env.NODE_CONFIG_ENV = 'test2';

  const vmap = `-v ${__dirname}/scenarios:/tmp`;
  const args = 'drachtio/sipp sipp -m 1 -sf /tmp/uac_siprec_pcap2.xml drachtio';
  const cmd = `docker run -t --rm --name sipp1 --net test_siprec ${vmap} ${args}`;

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
          srf.disconnect();
          t.end(err, 'test failed');
        });
    })
    .on('error', (err) => {
      t.end(err, 'error connecting to drachtio');
    });
}) ;

test('stopping docker network..', (t) => {
  t.timeoutAfter(20000);
  exec(`docker-compose -p test -f ${__dirname}/docker-compose-freeswitch.yaml down`, (err, stdout, stderr) => {
    console.log(stdout);
    //console.log(stderr);
    t.pass('Stopped docker compose') ;
  });
  exec('docker rm -f sipp1', (err, stdout) => {
    console.log(stdout);
    t.pass('Forced down sipp1');
  });
  setTimeout(() => {
    console.log("Give docker time to stop the images");
    t.end() ;
  }, 10000);
});
