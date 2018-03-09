const test = require('tape').test ;
const exec = require('child_process').exec ;

test('starting docker network for sip tests..', (t) => {
  t.timeoutAfter(180000);
  exec(`docker-compose -f ${__dirname}/docker-compose-testbed.yaml up -d`, (err, stdout, stderr) => {
    console.log(stdout);
    console.log(stderr);
    t.end(err) ;
  });
});

