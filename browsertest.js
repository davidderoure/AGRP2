/*
   Test program to confirm that browser receives MIDI input

   Reports incoming MIDI events to console

   Based on https://webaudio.github.io/web-midi-api (26 October 2021)

   DDeR 2022-08-05
*/

// Report browser and platform

console.log(navigator.userAgent);
console.log(navigator.platform);

// Test for MIDI capability

if (navigator.requestMIDIAccess) {
    console.log("WebMIDI is supported");
} else {
    console.log("WebMIDI is not supported");
    throw "WebMIDI is not supported";
}

// Request MIDI access promise

navigator.requestMIDIAccess()
    .then(onMIDISuccess, onMIDIFailure);

function onMIDIFailure(msg) {
    console.log( "Failed to get MIDI access - " + msg );
}

// Success callback provides midiAccess.

function onMIDISuccess(midiAccess) {

    // Set up handler to report connection changes

    midiAccess.onstatechange = (event) => {
       console.log(event.port.name, event.port.state);
    }

    // List inputs and assign listeners

    console.log(midiAccess.inputs.size + " inputs:");

    for (var input of midiAccess.inputs.values()) {
        // console.log(input); // displays name, manufacturer etc
        console.log(input.name);
        input.onmidimessage = MIDIMessageEventHandler;
    }

    // List outputs

    console.log(midiAccess.outputs.size + " outputs:");

    for (var output of midiAccess.outputs.values()) {
        // console.log(output); // displays name, manufacturer etc
        console.log(output.name);
    }
}

// Event handler simply handles note on and note off events

function MIDIMessageEventHandler(event) {
    var channel = event.data[0] & 0x0f;

    // switch using MIDI command
  
    switch (event.data[0] & 0xf0) {  
      case 0x90: // note on
        if (event.data[2] != 0) { // fall through to note off if velocity zero
          noteOn(channel, event.data[1], event.data[2]);
          return;
        }
      case 0x80: // note off
        noteOff(channel, event.data[1]);
        return;

      // placeholders for other MIDI commands

      case 0xA0: console.log("Polyphonic Pressure " + event.data[0].toString(16)); return;
      case 0xB0: console.log("Control Change " + event.data[0].toString(16)); return;
      case 0xC0: console.log("Program Change " + event.data[0].toString(16)); return;
      case 0xD0: console.log("Channel Pressure " + event.data[0].toString(16)); return;
      case 0xE0: console.log("Pitch Bend " + event.data[0].toString(16)); return;
//    case 0xF0: console.log("System Message " + event.data[0].toString(16)); return;
      
    }
}

// display human readable MIDI event

function numberToName(note) {
    var names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb"];

    return names[note % 12] + (Math.floor(note / 12) - 1); // assumes middle C = 60 = C4
}

function noteOn(channel, note, velocity) {
    console.log("note on %d %d %d %s", channel + 1, note, velocity, numberToName(note));
}

function noteOff(channel, note) {
    console.log("note off %d %d %s", channel + 1, note, numberToName(note));
}

// end of browsertest.js
