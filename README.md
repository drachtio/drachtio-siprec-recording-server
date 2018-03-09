# drachtio-siprec-recording-server [![Build Status](https://secure.travis-ci.org/davehorton/drachtio-siprec-recording-server.png)](http://travis-ci.org/davehorton/drachtio-siprec-recording-server)

A SIPREC recording server based on [dractio](https://github.com/davehorton/drachtio-srf) and [rtpengine](https://github.com/sipwise/rtpengine).

This node.js application implements a siprec recording server solution, using the dractio SIP server framework to manage signaling and the rtpengine media engine  to record the media.  Note that the recordings are generated in pcap format, so post-processing of the files may be required to generate final recordings if a different format (e.g flac, wav, etc) is desired.

## Install

* Copy `config/default.json.example` to `config/local.json` and edit to provide the IP addresses/ports for your configuration (i.e., location of drachtio and rtpengine servers). 
* Run `npm install`
* Run `node app` to run.

### Using dockerized versions of drachtio and rtpengine

If you haven't built the [drachtio server](https://github.com/davehorton/drachtio-server) and rtpengine processes (and don't want to), you can run using these docker images:
* [rtpengine](https://cloud.docker.com/swarm/davehorton/repository/docker/davehorton/rtpengine)
* [drachtio-server](https://cloud.docker.com/swarm/drachtio/repository/docker/drachtio/drachtio-server)

For guidance, have a look at the test suite, which uses docker-compose to create a test environment, as an example [test/docker-compose-testbed.yaml](test/docker-compose-testbed.yaml).

## Test

`npm test` note: docker is required

## How it works

The application receives the SIPREC INVITE from the SBC (or other SIPREC recording client), which will contain the multipart body with both SDP and XML metadata.  The application parses the SDP to retrieve the two media endpoints that will be streaming from the SDP and creates two associated media endpoints on rtpengine (an 'offer' and an 'answer').  The two media endpoints created by rtpengine are stitched back into a 200 OK response to the SBC, such that caller media flows to one endpoint and callee media flows to the other. rtpenine thus generates a recording that includes both media streams.




