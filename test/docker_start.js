const test = require('tape').test ;
const exec = require('child_process').exec ;
const fs = require('fs-extra');

test('starting docker network..', (t) => {
  t.timeoutAfter(180000);

  // clear log and output directores
  fs.emptyDir(`${__dirname}/tmp/log`)
    .then(fs.emptyDir(`${__dirname}/tmp/rtpengine`))
    .catch((err) => {
      console.log(`Error cleaning tmp folders: ${err}`);
      t.end(err);
    });
  exec(`docker compose -p test -f ${__dirname}/docker-compose-testbed.yaml up -d`, (err, stdout, stderr) => {
    if (-1 != stderr.indexOf('is up-to-date')) return t.end() ;
    console.log('docker network started, giving extra time for freeswitch to initialize...');
    setTimeout(() => {
      exec('docker exec freeswitch fs_cli -x "console loglevel debug"', (err, stdout, stderr) => {
        t.end(err) ;
      });
    }, 18000);
  });
});

