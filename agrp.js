/*
   Audio Gesture Recognistion Prorotype

   Reads incoming MIDI events, segments and classifies them.

   This version handles the input and display.

   DDeR 2022-08-05
*/

// globals

var buffer = Array(1500);
var ptr = 0;

// size of canvas for "oscilloscope trace"

var scopeWidth = 1200;
var scopeHeight = 256;

var timeCount = 0; // time, increments indefinitely

var threshold = 5; // velocity threshold

// set up to use web page as dashboard

var thresholdElement = document.getElementById("threshold");
var lastNoteElement = document.getElementById("lastNote");
var timerElement = document.getElementById("timer");

var ctx = document.getElementById("canvas").getContext('2d');

thresholdElement.innerHTML = threshold.toString();
lastNoteElement.innerHTML = "none";
timerElement.innerHTML = "0";

// set timer running

window.onload = function() {
    function updateCounter() {

        // delete previous 2x4 cursor
        ctx.fillStyle = "white";
        ctx.fillRect(timeCount % scopeWidth, scopeHeight - 4, 2, 4);

        timerElement.innerHTML = timeCount++;;

        // clear column
        ctx.fillStyle = "white";
        ctx.fillRect(timeCount % scopeWidth, 0, 2, scopeHeight);

        // draw new 2x4 cursor
        ctx.fillStyle = "blue";
        ctx.fillRect(timeCount % scopeWidth, scopeHeight - 4, 2, 4);

        setTimeout(updateCounter, 20);
    }

    updateCounter();
}

// Test for MIDI capability

if (navigator.requestMIDIAccess) {
    console.log("WebMIDI is supported");
} else {
    console.error("WebMIDI is not supported");
    console.log(navigator.userAgent);
    console.log(navigator.platform);
}

// Request MIDI access promise

navigator.requestMIDIAccess()
    .then(onMIDISuccess, onMIDIFailure);

function onMIDIFailure(msg) {
    console.error("Failed to get MIDI access - " + msg);
}

// Success callback provides midiAccess.

function onMIDISuccess(midiAccess) {

    // Set up handler to report any connection changes to console

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

// Event handler handles note on and note off events

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

      case 0xA0: return; // "Polyphonic Pressure"
      case 0xB0: return; // "Control Change"
      case 0xC0: return; // "Program Change"
      case 0xD0: return; // "Channel Pressure"
      case 0xE0: return; // "Pitch Bend"
      case 0xF0: return; // "System Message"
      
    }
}

// display human readable MIDI event

function numberToName(note) {
    var names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

    return names[note % 12] + (Math.floor(note / 12) - 1); // assumes middle C = 60 = C4
}

function noteOn(channel, note, velocity) {
    if (velocity > threshold) {
        lastNoteElement.innerHTML = numberToName(note);
        buffer[ptr++] = note;
        if (ptr == 1500) {
            ptr = 0;
        }

        // show note on as green square
        ctx.fillStyle = "green";
        ctx.fillRect(timeCount % scopeWidth, scopeHeight - note, 2, 2);
    }
}

function noteOff(channel, note) {

        // show note off as red square
        ctx.fillStyle = "red";
        ctx.fillRect(timeCount % scopeWidth, scopeHeight - note, 2, 2);
}

// end of agrp.js
