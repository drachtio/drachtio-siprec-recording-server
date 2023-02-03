# drachtio-siprec-recording-server ![Build Status](https://github.com/drachtio/drachtio-siprec-recording-server/workflows/CI/badge.svg)

An open source implementation of a SIPREC recording server based on [dractio](https://drachtio.org) and using either
* [rtpengine](https://github.com/sipwise/rtpengine) or
* [Freeswitch](https://freeswitch.com/)
* [Asterisk](https://asterisk.org)
as the back-end recording system.

## Install

This application requires a [drachtio SIP server](https://github.com/drachtio/drachtio-server) to be installed in your network.  Please refer to [the build and installation instructions here](https://drachtio.org/docs/drachtio-server), or [here](https://github.com/drachtio/drachtio-server).

* Copy either `config/default.json.example-rtpengine` or `config/default.json.example-freeswitch` depending on which back-end media server you want to use (it is an either-or choice: you can't mix them) to `config/local.json` and edit to provide the IP  addresses/ports for your configuration (i.e., location of the drachtio server, and either the rtpengine or freeswitch/asterisk media server). 
* Run `npm install`
* Run `node app` to run.
* Configure your SBC to send SIPREC invites to your drachtio server.

## Using rtpengine as the media server
When using rtpengine as the recorder, there is minimal configuration you will need to do on the rtpengine server -- a vanilla install will do.  The application will use the [ng control protocol](https://github.com/sipwise/rtpengine#the-ng-control-protocol), so you will need to open the UDP port on the rtpengine server to allow commands from the server running the drachtio-siprec-recording-server application.

Also, rtpengine generates recordings in pcap file format, so you will need to do some post-processing to deliver a flac, wav, mp3 or whatever final format you prefer.

## Using Freeswitch as the media server
When using Freeswitch, a bit of configuration is needed on the Freeswitch server.  Specifically, you must implement a dialplan that:
* allows unauthenticated INVITEs from the drachtio server
* hairpins incoming calls back to the sender, by using the Freeswitch [bridge application](https://freeswitch.org/confluence/display/FREESWITCH/mod_dptools%3A+bridge) to send the B leg INVITE back to the source of the A leg INVITE
* exports the custom 'X-Return-Token' header from the A leg to the B leg, and finally
* makes a recording of the call.

An example snippet of a dialplan that does the trick looks like this:
```xml
  <extension name="hairpin_and_record">
    <condition field="${sip_h_X-Return-Token}" expression="^(.+)$">
      <action application="export" data="sip_h_X-Return-Token=${sip_h_X-Return-Token}" />
      <action application="export" data="_nolocal_jitterbuffer_msec=100"/>
      <action application="set" data="RECORD_STEREO=true"/>
      <action application="set" data="call_id=${strftime(%Y%m%d_%H%M%S)}_${sip_from_tag}"/>
      <action application="set" data="outfile=$${base_dir}/recordings/${call_id}.wav"/> 
      <action application="record_session" data="${outfile}"/>
      <action application="set" data="hangup_after_bridge=true"/> 
      <action application="bridge" data="sofia/external/${destination_number}@${network_addr}"/>
    </condition>
  </extension>
```
For an example docker image that implements, see [davehorton/freeswitch-hairpin](https://hub.docker.com/r/davehorton/freeswitch-hairpin/).

> Note: when using Freeswitch, the application requires access to a redis server.  redis is used to track and correlate the A and B call legs, using the X-Return-Token header mentioned above.  When using rtpengine as the back-end, redis not required.

## Using Asterisk as media server instead of Freeswitch
We can mimic the same behavior with Asterisk. For this to work we need to leave the 'config/local.json' as it is for freeswitch. Asterisk will receive a call and send another one back to drachtio sip server. The same steps described above can be done in Asterisk by modifying the pjsip.conf and extensions.conf files:
1- Allows authenticated INVITEs from drachtio server. Add these settings to your 'pjsip.conf' file:

[drachtio_in]
type=endpoint
context=siprec
disallow=all
allow=ulaw
allow=alaw
allow=g729
transport=transport-udp

[drachtio_out]
type=endpoint
context=siprec
disallow=all
allow=ulaw
allow=alaw
allow=g729
transport=transport-udp
aors=drachtio_out

[drachtio_in]
type=identify
endpoint=drachtio_in
match=<IP HERE>

[drachtio_out]
type=aor
contact=sip:<IP HERE>:5060

2- Hairpin the incoming call back to the server. Add these setings to your 'extensions.conf" file:

[siprec]
exten => _[+*#0-9]!,1,NoOp(Receiving call from drachtio)
exten => _[+*#0-9]!,n,Set(XReturnHeader=${PJSIP_HEADER(read,X-Return-Token)})
exten => _[+*#0-9]!,n,Progress()
;exten => _[+*#0-9]!,n,MixMonitor(${UNIQUEID}.wav)
;exten => _[+*#0-9]!,n,Monitor(wav,myfilename)
exten => _[+*#0-9]!,n,MixMonitor(${UNIQUEID}-mixed.wav,r(${UNIQUEID}-in.wav)t(${UNIQUEID}-out.wav))
exten => _[+*#0-9]!,n,Dial(PJSIP/${EXTEN}@drachtio_out,,b(addHeaders^addHeaderXRetHdr^1(${XReturnHeader})))
exten => _[+*#0-9]!,n,HangUp()


[addHeaders]
exten => addHeaderXRetHdr,1,Set(PJSIP_HEADER(add,X-Return-Token)=${ARG1})
same => n,Return()

### Using dockerized versions of drachtio and rtpengine

If you haven't built the [drachtio server](https://github.com/drachtio/drachtio-server) and rtpengine processes (and don't want to), you can run using these docker images:
* [rtpengine](https://cloud.docker.com/swarm/davehorton/repository/docker/davehorton/rtpengine)
* [drachtio-server](https://cloud.docker.com/swarm/drachtio/repository/docker/drachtio/drachtio-server)

For guidance, have a look at the test suite, which uses docker-compose to create a test environment, as an example [test/docker-compose-testbed.yaml](test/docker-compose-testbed.yaml).

## Interoperability
This application has been tested with the following SIPREC clients:
* Ribbon SBC 5200 (tested with Freeswitch back-end media server)
* OpenSIPS (tested with rtpengine and Freeswitch back-end media servers)
* Cisco Unified Border element (tested with rtpengine back-end media server)
## Test

`npm test` 

Note: docker is required to run the test cases

## How it works

The application receives the SIPREC INVITE from the SBC (or other SIPREC recording client), which will contain the multipart body with both SDP and XML metadata.  The application parses the SDP to retrieve the two media endpoints that will be streaming from the SDP.  What happens next is different depending on whether rtpengine or Freeswitch is being used.

When using rtpengine, the application creates two associated media endpoints on rtpengine (using the 'offer' and 'answer' commands in the ng protocol).  The two media endpoints created by rtpengine are then combined into a multipart body 200 OK response that is returned to the SBC.  The end result is that the caller media flows are directed to one of the rtpengin endpoints and the callee media flows to the other. The result is a recording made by rtpengine as if the caller and callee media flows were part of a call setup with rtpengine as a media proxy.

When using Freeswitch/Asterisk the same basic approach of sending the two media flows through Freeswitch/Asterisk as if it were a normal bridged call applies.  In this case, the application sends an INVITE to the Freeswitch/Asterisk with one of the SDPs parsed from the SIPREC body and Freeswitch/Asterisk is responsible for generating a B leg back towards the drachtio server.  Upon receving this B leg INVITE, the application answers 200 OK with remaining SDP parsed from the SIPREC body.  A final 200 OK answer back to the SIPREC client is then generated, using the two media endpoints allocated on the Freeswitch/Asterisk.  Media flows through the bridge connection and is recorded, as if caller were talking to callee through the Freeswitch/Asterisk.




