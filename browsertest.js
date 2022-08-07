/*
  Test program to confirm that browser receives MIDI input

  Reports incoming MIDI events to console.

  Based on https://webaudio.github.io/web-midi-api (26 October 2021)

  Run using browsertest.html, which simply uses <script src="browsertest.js"></script>
  (there is no DOM manipulation).

  Reload page to find newly connected devices.

  DDeR 2022-08-05

  Sun  7 Aug 2022 14:49:57 BST
  Updated to report parameters for control change, program change, pitch bend.

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
  // NB will need to rerun script to get access to newly connected inputs

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
  var cmd = event.data[0].toString(16); // hex for printing

  // switch using MIDI command
  
  switch (event.data[0] & 0xf0) {  
    case 0x90: // note on, note number, velocity
      if (event.data[2] != 0) { // fall through to note off if velocity zero
        noteOn(channel, event.data[1], event.data[2]);
        return;
      }
    case 0x80: // note off, note number
      noteOff(channel, event.data[1]);
      return;

    // these commands are simply reported to console

    case 0xB0: // control change, controller number, controller value
      console.log("Control Change 0x" + cmd + " " + event.data[1] + " " + event.data[2]);
      return;

    case 0xC0: // program change, patch number
      console.log("Program Change 0x" + cmd + " " + event.data[1].toString(16));
      return;

    case 0xE0: // pitch bend, lsb, msb (7 bit values)
      var bend = event.data[1] + 128 * event.data[2]; 
      var cents = bend * 400 / 16384 - 200; // assumes bend range is +- 2 semitones
      console.log("Pitch Bend 0x" + cmd + " " + bend + " (" + Math.round(cents) + ")");
      return;

    // placeholders for other MIDI commands

    case 0xA0: console.log("Polyphonic Pressure 0x" + cmd); return;
    case 0xD0: console.log("Channel Pressure 0x" + cmd); return;

    // System exclusive is commented out to avoid data (e.g. clock) flooding console

//    case 0xF0: console.log("System Message 0x" + event.data[0].toString(16)); return;

  }
}

// Display human readable MIDI note event - modify here to do other things with notes

function numberToName(note) {
  var names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

  return names[note % 12] + (Math.floor(note / 12) - 1); // assumes middle C = 60 = C4
}

function noteOn(channel, note, velocity) {
  console.log("note on %d %d %d %s", channel + 1, note, velocity, numberToName(note));
}

function noteOff(channel, note) {
  console.log("note off %d %d %s", channel + 1, note, numberToName(note));
}

// end of browsertest.js
