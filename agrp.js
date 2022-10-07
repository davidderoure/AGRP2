/*
  Audio Gesture Recognistion Prorotype
 
  Reads incoming MIDI events, segments and classifies them.

  This version handles the input and display, with some basic slope recognition.

  DDeR 2022-08-05

  Updated to support pitch bend and work in quarter tones DDeR 2022-08-25
  Updated to store & display subgesture history, for gesture recognition DDeR 2022-08-25

*/

// globals

// timing parameters for subgesture recognisers

minDownDuration = 10;
minUpDuration = 10;
minSameDuration = 10;
minRestDuration = 10;

// state is R, X, U, D, S = rest, detected one note, up, down, same

var state = "R";

// size of canvas for "oscilloscope trace" (set in agrp.html)

const scopeWidth = 1200;
const scopeHeight = 512; // using 256 quartertone pitches, 2 dots each

const buffer = Array(scopeWidth);
var ptr = 0;

// note tracking

const activeNotes = []; // the stack of actively-pressed keys

var timeCount = 0; // time, increments indefinitely

var subgestures = []; // list of subgestures detected

// var threshold = 5; // velocity threshold (currently unused)

// used for mapping pitchbend to quartertones

var pitchBendRange = 400; // Set to 400 for normal bend of +-200 cents
// var pitchBendRange = 2400; // Set to 2400 for bend of +-octave for testing

var pitchBendCorrection = 0; // quartertone correction due to pitch bend wheel
var lastNote; // note from the last MIDI noteon, which pitch bend references
var lastAmplitude;// amplitude from the last MIDI noteon

// recogniser variables
var upLength = 0;
var upStartPitch = 0;
var upStartTime = 0;
var downLength = 0;
var downStartPitch = 0;
var downStartTime = 0;
var sameLength = 0;
var sameStartTime = 0;
var sameStartPitch = 0;
var restLength = 0;
var restStartTime = 0;

// set up to use web page as dashboard

var thisNoteElement = document.getElementById("thisnote");
var timerElement = document.getElementById("timer");
var stateElement = document.getElementById("state");
var upLengthElement = document.getElementById("uplength");
var downLengthElement = document.getElementById("downlength");
var sameLengthElement = document.getElementById("samelength");
var restLengthElement = document.getElementById("restlength");
var subgestureElement = document.getElementById("subgesture");
var subgestureHistoryElement = document.getElementById("subgesturehistory");
var gestureElement = document.getElementById("gesture");

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

    timeout();

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

  thisNoteElement.innerHTML = numberToName(note);

  buffer[ptr] = note;

  var previous = buffer[ (ptr > 0) ? ptr - 1 : scopeWidth - 1 ];

  if (++ptr == scopeWidth) {
    ptr = 0;
  }

// SUBGESTURE RECOGNISER STATE MACHINE
// see also timout()

// state is R, X, U, D, S = rest, detected one note, up, down, same

  restLength = 0;

  if (state == "R") {
    state = "X";
    startTime = timeCount;
    upLength = 0;
    downLength = 0;
    sameLength = 0;
    displayCounts();
    return;
  }

  if (state == "X" && note > previous) {
    state = "U";
    upLength = 1;
    sameLength = 0;
    upStartTime = startTime;
    upStartPitch = previous;
    if (timeCount - upStartTime > minUpDuration) {
      detected("U", upStartTime, timeCount - upStartTime, upLength);
    }
  }

  if (state == "X" && note < previous) {
    state = "D";
    downLength = 1;
    sameLength = 0;
    downStartTime = startTime;
    downStartPitch = previous;
    if (timeCount - downStartTime > minDownDuration) {
      detected("D", downStartTime, timeCount - downStartTime, downLength);
    }
  }

  if (state == "X" && note == previous) {
    state = "S";
    sameLength = 1;
    sameStartTime = timeCount;
    sameStartPitch = previous;
    if (timeCount - sameStartTime > minSameDuration) {
        detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
    }
  }

  if (state == "U" && note > previous) {
    upLength++;
    if (timeCount - upStartTime > minUpDuration) {
      detected("U", upStartTime, timeCount - upStartTime, upLength);
    }
  }

  if (state == "D" && note < previous) {
    downLength++;
    if (timeCount - downStartTime > minDownDuration) {
      detected("D", downStartTime, timeCount - downStartTime, downLength);
    }
  }

  if (state == "S" && note == previous) {
    sameLength++;
    if (timeCount - sameStartTime > minSameDuration) {
      detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
    }
  }

  if (state == "S" && note > previous) {
    if (timeCount - sameStartTime > minSameDuration) {
        detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
    }
    state = "U";
    upStartTime = timeCount;
    upStartPitch = previous;
    upLength = 1;
    downLength = 0;
    sameLength = 0;
  }

  if (state == "S" && note < previous) {
    if (timeCount - sameStartTime > minSameDuration) {
        detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
    }
    state = "D";
    downStartTime = timeCount;
    downStartPitch = previous;
    upLength = 0;
    downLength = 1;
    sameLength = 0;
  }

  if (state == "D" && note > previous) {
    if (timeCount - downStartTime > minDownDuration) {
        detected("D", downStartTime, timeCount - downStartTime, downLength);
    }
    state = "U";
    upStartTime = timeCount;
    upStartPitch = previous;
    upLength = 1;
    downLength = 0;
    sameLength = 0;
  }

  if (state == "U" && note < previous) {
    if (timeCount - upStartTime > minUpDuration) {
        detected("U", upStartTime, timeCount - upStartTime, upLength);
    }
    state = "D";
    downStartTime = timeCount;
    downStartPitch = previous;
    upLength = 0;
    downLength = 1;
    sameLength = 0;
  }

  if (state == "U" && note == previous) {
    if (sameLength == 0) {
      sameLength = 1;
      sameStartTime = timeCount;
      sameStartPitch = previous;
    } else {
      sameLength++;
    }

    if (sameLength > 0 && timeCount - sameStartTime > minSameDuration) {
      if (timeCount - upStartTime > minUpDuration) {
          detected("U", upStartTime, timeCount - upStartTime, upLength);
      }
      upLength = 0;
      downLength = 0;
      detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
      state = "S";
    }
  }

  if (state == "D" && note == previous) {
    if (sameLength == 0) {
      sameLength = 1;
      sameStartTime = timeCount;
      sameStartPitch = previous;
    } else {
      sameLength++;
    }

    if (sameLength > 0 && timeCount - sameStartTime > minSameDuration) {
      if (timeCount - downStartTime > minDownDuration) {
          detected("D", downStartTime, timeCount - downStartTime, downLength);
      }
      upLength = 0;
      downLength = 0;
      detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
      state = "S";
    }
  }
  displayCounts();
}

  // show live counts on dashboard

function displayCounts() {
  stateElement.innerHTML = state;
  upLengthElement.innerHTML = upLength.toString();
  downLengthElement.innerHTML = downLength.toString();
  sameLengthElement.innerHTML = sameLength.toString();
  restLengthElement.innerHTML = restLength.toString();
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

  // show note off as red square
  ctx.fillStyle = "red";
  ctx.fillRect(timeCount % scopeWidth, scopeHeight - note, 2, 2);

  timeout();
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
// silence is subgesture end and the beginning of a rest

function timeout() {

  if (activeNotes.length > 0) {
    return;
  } 

  if (state == "R") {
    if (timeCount - restStartTime > minRestDuration) {
          detected("R", restStartTime, timeCount - restStartTime, restLength);
    }
    restLength++;
    displayCounts();
    return;
  }

  if (restLength == 0) {
    restStartTime = timeCount;
    restLength = 1;
    displayCounts();
    return;
  }

  restLength++;
    
  if (timeCount < restStartTime + 20) {
    return;
  }

  // now we have a proper rest

  if (state == "D" && timeCount - downStartTime > minDownDuration) {
      detected("D", downStartTime, timeCount - downStartTime, downLength);
  }

  if (state == "U" && timeCount - upStartTime > minUpDuration) {
      detected("U", upStartTime, timeCount - upStartTime, upLength);
  }

  if (state == "S" && timeCount - sameStartTime > minSameDuration) {
      detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
  }

  if (state == "X" && timeCount - startTime > minSameDuration) {
      detected("S", startTime, timeCount - startTime, 1);
  }

  state = "R";

  detected("R", restStartTime, timeCount - restStartTime, restLength);

  downLength = 0;
  upLength = 0;
  sameLength = 0;
  restLength = 0;

  displayCounts();
}

function detected(subgesture, startTime, duration, n) {
  subgestureElement.innerHTML = subgesture + " " + startTime.toString() + " " + duration.toString() + " " + n.toString();

  if (subgestures.length == 0) {
    subgestures.push(Array.of(subgesture, startTime, duration, n));
  } else {
    last = subgestures.at(-1);
    if (last[0] == subgesture && last[1] == startTime) {
      last[2] = duration;
      last[3] = n;
    } else {
      subgestures.push(Array.of(subgesture, startTime, duration, n));
    }
  }

  subgestureHistoryElement.innerHTML = subgestures.slice(-20).map(x => x[0]);
}
  
// end of agrp.js
