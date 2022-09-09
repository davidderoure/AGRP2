/*
  Audio Gesture Recognistion Prorotype
 
  Reads incoming MIDI events, segments and classifies them.

  This version handles the input and display, with some basic slope recognition.

  DDeR 2022-08-05

  Updated to support pitch bend and work in quarter tones DDeR 2022-08-25

*/

// globals

// size of canvas for "oscilloscope trace" (set in agrp.html)

const scopeWidth = 1200;
const scopeHeight = 512; // using 256 quartertone pitches, 2 dots each

const buffer = Array(scopeWidth);
var ptr = 0;

// note tracking

const activeNotes = []; // the stack of actively-pressed keys

var timeCount = 0; // time, increments indefinitely
var restSince = 0; // time of last note off which left no notes sounding

// var threshold = 5; // velocity threshold (currently unused)

// used for mapping pitchbend to quartertones

var pitchBendRange = 400; // Set to 400 for normal bend of +-200 cents
// var pitchBendRange = 2400; // Set to 2400 for bend of +-octave for testing

var pitchBendCorrection = 0; // quartertone correction due to pitch bend wheel
var lastNote; // note from the last MIDI noteon, which pitch bend references
var lastAmplitude;// amplitude from the last MIDI noteon

// recogniser variables
var upLength = 0;
var downLength = 0;
var sameLength = 0;

// set up to use web page as dashboard

// var thresholdElement = document.getElementById("threshold");
var thisNoteElement = document.getElementById("thisnote");
var timerElement = document.getElementById("timer");
var upLengthElement = document.getElementById("uplength");
var downLengthElement = document.getElementById("downlength");
var sameLengthElement = document.getElementById("samelength");
var detectedElement = document.getElementById("detected");

var ctx = document.getElementById("canvas").getContext('2d');

// thresholdElement.innerHTML = threshold.toString();
thisNoteElement.innerHTML = "none";
timerElement.innerHTML = "0";

// set timer running

window.onload = function() {
  function updateCounter() {

    // delete previous 1x1 cursor
    ctx.fillStyle = "white";
    ctx.fillRect(timeCount % scopeWidth, scopeHeight / 2, 1, 1);

    timerElement.innerHTML = timeCount++;;

    // clear column
    ctx.fillStyle = "white";
    ctx.fillRect(timeCount % scopeWidth, 0, 2, scopeHeight);

    // draw new 1x1 cursor
    ctx.fillStyle = "blue";
    ctx.fillRect(timeCount % scopeWidth, scopeHeight / 2, 1, 1);

    // draw any active notes
    activeNotes.forEach(function (note) {
      ctx.fillStyle = "gray";
      ctx.fillRect(timeCount % scopeWidth, scopeHeight - note, 2, 2);
    });

    if (activeNotes.length == 0 && timeCount > restSince + 10) {
        timeout();
    }

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
  // NB need to reload page to pick up new connections

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

// Event handler handles MIDI note on and note off events

function MIDIMessageEventHandler(event) {
  var channel = event.data[0] & 0x0f;

  // switch using MIDI command
 
  switch (event.data[0] & 0xf0) { 
    case 0x90: // note on
      if (event.data[2] != 0) { // fall through to note off if velocity zero
       MIDInoteOn(channel, event.data[1], event.data[2]);
       return;
    }
   case 0x80: // note off
     MIDInoteOff(channel, event.data[1]);
     return;
   case 0xE0: // pitch bend, lsb, msb (7 bit values)
     MIDIpitchBend(channel, event.data[1], event.data[2]);
     return;

   // placeholders for other MIDI commands

   case 0xA0: return; // "Polyphonic Pressure"
   case 0xB0: return; // "Control Change"
   case 0xC0: return; // "Program Change"
   case 0xD0: return; // "Channel Pressure"
   case 0xF0: return; // "System Message"
   
  }
}

// display human readable MIDI event

function numberToName(note) {
//  var names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var names = ["C", "C+", "C#", "D-", "D", "D+", "Eb", "E-", "E", "E+", "F", "F+", "F#", "G-", "G", "G+", "Ab", "A-", "A", "A+", "Bb", "B-", "B", "B+"];

//  return names[note % 12] + (Math.floor(note / 12) - 1); // assumes middle C = 60 = C4
  return names[note % 24] + (Math.floor(note / 24) - 1);
}

// convert MIDI events into internal quatertone representation.
// Pitchbend changes generate quartertone notes. The pitchbend wheel 
// position (pitchBendCorrection) is held independently of note events.

function MIDInoteOn(channel, note, velocity) {
  var amplitude = Math.floor(velocity * 100 / 127);
  noteOn(note * 2 + pitchBendCorrection, amplitude); 
  lastNote = note * 2; // used for pitch bend
  lastAmplitude = note; // used for pitch bend
}

function MIDInoteOff(channel, note) {
//  noteOff(note * 2 + pitchBendCorrection);
  noteOff(lastNote + pitchBendCorrection);
}

// note is in quartertones, amplitude is a percentage
function noteOn(note, amplitude) {

  // enforce monophonic for now - new note ends previous if still sounding

  if (activeNotes.length == 1) {
    noteOff(activeNotes[0]);
  }

  // add note to active notes (for later use if we need polyphonic)
  if (activeNotes.indexOf(note) == -1) {
    activeNotes.push(note);
  } else {
    console.log("Note " + note + " already in activeNotes " + activeNotes);
  }

  // show note on as green square
  ctx.fillStyle = "#00" + (155 + amplitude).toString(16) + "00";
  ctx.fillRect(timeCount % scopeWidth, scopeHeight - note, 2, 2);

  var previous = buffer[ptr++];

  thisNoteElement.innerHTML = numberToName(note);

  if (ptr == scopeWidth) {
    ptr = 0;
  }

  buffer[ptr] = note;

  // recognisers

  if (note > previous) {
    upLength++;
    if (downLength > 4) {
      // detectedDown(downLength);
      detectedElement.innerHTML = "down" + downLength;
      downLength = 0;
    }
    downLength = 0;
    sameLength = 0;
  }

  if (note < previous) {
    downLength++;
    if (upLength > 4) {
      // detectedUp(upLength);
      detectedElement.innerHTML = "up" + upLength;
      upLength = 0;
    }
    upLength = 0;
    sameLength = 0;
  }

  if (note == previous) {
    sameLength++;
  }

  upLengthElement.innerHTML = upLength.toString();
  downLengthElement.innerHTML = downLength.toString();
  sameLengthElement.innerHTML = sameLength.toString();
}

// note is in quartertones
function noteOff(note) {

  // remove note from active notes
  var position = activeNotes.indexOf(note);
  if (position == -1) {
//    console.log("Couldn't find note " + note + " in activeNotes " + activeNotes);
  } else {
    activeNotes.splice(position, 1);
  }

  if (activeNotes.length == 0) {
    restSince = timeCount;
  }

  // show note off as red square
  ctx.fillStyle = "red";
  ctx.fillRect(timeCount % scopeWidth, scopeHeight - note, 2, 2);
}

// convert pitchbend wheel position to quartertones (PitchBendCorrection)

function MIDIpitchBend(channel, lsb, msb) { // lsb, msb are 7 bit values
  var bend = event.data[1] + 128 * event.data[2];
  //var cents = bend * 400 / 16384 - 200; // assumes bend range is +- 2 semitones
  var cents = (bend - 8192) * pitchBendRange / 16384;
  console.log("Pitch Bend " + bend + " (" + Math.round(cents) + ")");
 
  if (activeNotes.length == 0) return;
 
  // pitch bend is in cents
  // If bend is between 25 and 74 we want +1 quartertone
  // If bend is between -25 and -74 we want -1 quartertone
  // etc

  var newPitchBendCorrection; // number of quartertones for wheel position

  if (cents >= 0 ) {
    newPitchBendCorrection = Math.floor((25 + cents) / 50);
  } else {
    newPitchBendCorrection = - Math.floor((25 - cents) / 50);
  }

  if (newPitchBendCorrection == pitchBendCorrection) return;

  // generate artifical quartertone note event
 
  if (activeNotes.indexOf(lastNote + newPitchBendCorrection) == -1) {
    noteOff(lastNote + pitchBendCorrection);
    pitchBendCorrection = newPitchBendCorrection
    noteOn(lastNote + pitchBendCorrection, lastAmplitude);
  }
}

// sub gestures

function timeout() {
  if (downLength > 4) {
    // detectedDown(downLength);
    detectedElement.innerHTML = "DOWN" + downLength;
  }

  if (upLength > 4) {
    // detectedUp(upLength);
    detectedElement.innerHTML = "UP" + upLength;
  }

  if (sameLength > 4) {
    // detectedSame(sameLength);
    detectedElement.innerHTML = "SAME" + sameLength;
  }

  downLength = 0;
  upLength = 0;
  sameLength = 0;
}

// end of agrp.js
