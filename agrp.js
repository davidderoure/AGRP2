/*
  Audio Gesture Recognistion Prorotype
 
  Reads incoming MIDI events, segments and classifies them.

  This version handles the input and display, with some basic slope recognition.

  DDeR 2022-08-05

  Updated to support pitch bend and work in quarter tones DDeR 2022-08-25
  Updated to store & display subgesture history, for gesture recognition DDeR 2022-08-25
  Updated to read MIDI channels from URL DDeR 2022-11-13
  Updated to recognise some of the gestures in Tuba test audio DDeR 2022-11-13
  Updated to emit gesture codes via MIDI 2022-11-24
  Updated to tune specifically for Forager gestures 2022-11-25
*/

// globals

// timing parameters for subgesture recognisers

const minDownDuration = 10;
const minUpDuration = 10;
const minSameDuration = 10;
const minTrillDuration = 10;
const minRestDuration = 5;
const minLongDuration = 100;
const trillTolerance = 6;
const gradient = 6;

var thisSeq = [];

// state is R, X, U, D, S = rest, detected one note, up, down, same

var state = "R";

// size of canvas for "oscilloscope trace" (set in agrp.html)

const scopeWidth = 1200;
const scopeHeight = 512; // using 256 quartertone pitches, 2 dots each
tick = 20; // timeout

const buffer = Array(scopeWidth);
var ptr = 0;

// note tracking

const activeNotes = []; // the stack of actively-pressed keys

var timeCount = 0; // time, increments indefinitely

var subgestures = []; // list of subgestures detected

// used for mapping pitchbend to quartertones

var pitchBendRange = 400; // Set to 400 for normal bend of +-200 cents
// var pitchBendRange = 9600; // Set to 2400 for bend of +-octave for testing

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
var trillLength = 0;
var trillStartTime = 0;
var trillStartPitch = 0;
var restLength = 0;
var restStartTime = 0;
var lastNoteOffTime = 0; // used to measure long notes

// set up to use web page as dashboard

var midinElement = document.getElementById("midin");
var midoutElement = document.getElementById("midout");
var timerElement = document.getElementById("timer");
var thisNoteElement = document.getElementById("thisnote");
var stateElement = document.getElementById("state");
var upLengthElement = document.getElementById("uplength");
var downLengthElement = document.getElementById("downlength");
var sameLengthElement = document.getElementById("samelength");
var trillLengthElement = document.getElementById("trilllength");
var restLengthElement = document.getElementById("restlength");
var subgestureElement = document.getElementById("subgesture");
var subgestureargsElement = document.getElementById("subgestureargs");
var subgestureHistoryElement = document.getElementById("subgesturehistory");

var ctx = document.getElementById("canvas").getContext('2d');

// thresholdElement.innerHTML = threshold.toString();
thisNoteElement.innerHTML = "none";
timerElement.innerHTML = "0";

// Default MIDI input channel unless set in URL e.g. ?minin=1

var MIDIinChannel = -1; // -1 is omni in
var MIDIoutChannel = 0; // default to channel 1 (1-16)
var midiOutput = null; // global MIDI output

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

    setTimeout(updateCounter, tick);
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

// ascertain MIDI input and output channels

getChannelsFromURL(); // overides defaults if specified in URL SearchParams
midinElement.innerHTML = MIDIinChannel == "-1" ? "omni" : (MIDIinChannel + 1).toString();
midoutElement.innerHTML = MIDIoutChannel + 1;
console.log("Using MIDI input channel (0-15): " + MIDIinChannel);
console.log("Using MIDI output channel (0-15): " + MIDIoutChannel);

// use MIDI input channel from URL if present

function getChannelsFromURL() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);

  var midin = urlParams.get("midin");

  if (midin) {
    let c = parseInt(midin);
    if (!isNaN(c) && c > 0 && c <= 16) {
	  MIDIinChannel = c - 1; // channels are named 1-16, maps to 0-15
    } else {
      console.log("Invalid MIDI input channel in URL: " + midin);
    }
  }

  var midout = urlParams.get("midout");

  if (midout) {
    let c = parseInt(midout);
    if (!isNaN(c) && c > 0 && c <= 16) {
	  MIDIoutChannel = c - 1; // channels are named 1-16, maps to 0-15
    } else {
      console.log("Invalid MIDI output channel in URL: " + midout);
    }
  }
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
    if (output.name == "to Max 2") {
      console.log("Found", output.name);
      midiOutput = output;
    }
  }

  // let MIDI out know we're here

  if (midiOutput) {
    console.log("Sending 8 test messages");
    for (var i = 1; i <= 8; i++) {
      console.log([0xB0 + MIDIoutChannel, 0x00, i]);
      midiOutput.send([0xB0 + MIDIoutChannel, 0x00, i]);
    }
  }
}

// Event handler handles MIDI note on and note off events

function MIDIMessageEventHandler(event) {
  var channel = event.data[0] & 0x0f;

  // ignore event if not on our specified input channel

  if (MIDIinChannel > -1 && MIDIinChannel != channel) {
    return;
  }

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
  thisSeq.push(note);

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
    trillLength = 1;
    startPitch = note;
    displayCounts();
    return;
  }

  if (state == "X" && note > previous && note - previous < gradient) {
    state = "U";
    upLength = 1;
    sameLength = 0;
    upStartTime = startTime;
    upStartPitch = previous;
    if (upLength > 4 && timeCount - upStartTime > minUpDuration) {
      detected("U", upStartTime, timeCount - upStartTime, upLength);
    } 
  }

  if (state == "X" && note < previous && previous - note < gradient) {
    state = "D";
    downLength = 1;
    sameLength = 0;
    downStartTime = startTime;
    downStartPitch = previous;
    if (downLength > 4 && timeCount - downStartTime > minDownDuration) {
      detected("D", downStartTime, timeCount - downStartTime, downLength);
    }
  }

  if (state == "X" && note == previous) {
    state = "S";
    sameLength = 1;
    sameStartTime = timeCount;
    sameStartPitch = previous;
    if (sameLength > 4 && timeCount - sameStartTime > minSameDuration) {
        detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
    }
  }

  if (state == "U" && note > previous && note - previous < gradient) {
    upLength++;
    if (upLength > 4 && timeCount - upStartTime > minUpDuration) {
      detected("U", upStartTime, timeCount - upStartTime, upLength);
    } else {
      let c = slope(1);
      if (c > 4) {
        detected("U", timeCount - c * tick, c * tick, c);
      }
    }
  }

  if (state == "D" && note < previous && previous - note < gradient) {
    downLength++;
    if (downLength > 4 && timeCount - downStartTime > minDownDuration) {
      detected("D", downStartTime, timeCount - downStartTime, downLength);
    } else {
      let c = slope(-1);
      if (c > 4) {
        detected("D", timeCount - c * tick, c * tick, c);
      }
    }
  }

  if (state == "S" && note == previous) {
    sameLength++;
    if (sameLength > 4 && timeCount - sameStartTime > minSameDuration) {
      detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
    }
  }

  // console.log("trill", Math.abs(note - startPitch), trillLength);
  if (trillLength > 0 && Math.abs(note - startPitch) < trillTolerance) {
    if (note != previous) { trillLength++; }
    if (trillLength > 10 && timeCount - trillStartTime > minTrillDuration) {
      detected("T", trillStartTime, timeCount - trillStartTime, trillLength);
      state = "X";
    }
  } else {
    trillLength = 0
  }

  if (state == "S" && note > previous) {
    if (sameLength > 4 && timeCount - sameStartTime > minSameDuration) {
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
    if (sameLength > 4 && timeCount - sameStartTime > minSameDuration) {
        detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
    }
    state = "D";
    downStartTime = timeCount;
    downStartPitch = previous;
    upLength = 0;
    downLength = 1;
    trillLength = 0;
    sameLength = 0;
  }

  if (state == "D" && note > previous) {
    if (downLength > 4 && timeCount - downStartTime > minDownDuration) {
        detected("D", downStartTime, timeCount - downStartTime, downLength);
    }
    state = "U";
    upStartTime = timeCount;
    upStartPitch = previous;
    upLength = 1;
    downLength = 0;
    if (trillLength == 0) { trillLength = 1; }
    sameLength = 0;
  }

  if (state == "U" && note < previous) {
    if (upLength > 4 && timeCount - upStartTime > minUpDuration) {
        detected("U", upStartTime, timeCount - upStartTime, upLength);
    }
    state = "D";
    downStartTime = timeCount;
    downStartPitch = previous;
    upLength = 0;
    downLength = 1;
    if (trillLength == 0) { trillLength = 1; }
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
  trillLengthElement.innerHTML = sameLength.toString();
  sameLengthElement.innerHTML = sameLength.toString();
  trillLengthElement.innerHTML = trillLength.toString();
  restLengthElement.innerHTML = restLength.toString();
}

// Check how many previous notes roughly follow this gradient

function slope(x) {
  let u = 0;
  let d = 0;
  for (var i = thisSeq.length; i > 0; i--) {
    if (thisSeq[i] == thisSeq[i-1]) {
      u++; d++;
    }
    if (thisSeq[i] > thisSeq[i-1]) {
      u++;
    } else {
      d++;
    }

    if (u + d > 6) {
      if (x > 0 && u <= d) { 
        // console.log("U", u, "d", d);
        return u; 
      }
      if (x < 0 && u <= d) { 
        // console.log("u", u, "D", d);
        return d; 
      } 
    } 
  }
  // console.log("u", u, "d", d);
  return x > 0 ? u : d;
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

  lastNoteOffTime = timeCount;

  timeout();
}

// convert pitchbend wheel position to quartertones (PitchBendCorrection)

function MIDIpitchBend(channel, lsb, msb) { // lsb, msb are 7 bit values
  var bend = event.data[1] + 128 * event.data[2];
  //var cents = bend * 400 / 16384 - 200; // assumes bend range is +- 2 semitones
  var cents = (bend - 8192) * pitchBendRange / 16384;
  // console.log("Pitch Bend " + bend + " (" + Math.round(cents) + ")");
 
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

// Gestures defined in "tuba shapes 002 - Score.pdf":

// A upward short runs, short spaces in between
// B downward short runs, short spaces in between
// C wider intervals
// D staccato calls
// E up-rips
// F down-rips
// G up-down runs, short spaces in between
// H down-up runs, short spaces in between
// I up runs, short spaces in between
// J down runs, short spaces in between
// J down runs, short spaces in between
// K long trills
// L long cresc-dim
// M forte-piano
// N long flz (flatterzunge == flutter tonguing)
// O short trills
// P random abandon

// Short run is 5 consecutive chromatic notes
// Rips are similar to runs - how do we distinguish?
// Staccato calls is 12 staccato notes
// up down is 6 plus 6 
// Long run is e.g. 8

// Subgestures are:
// upward short run of 5 or 6 notes
// downward short run of 5 or 6 notes
// up-down run of 5 or 6 up then same down
// down-up run of 5 or 6 down then same up
// 12 staccato notes
// short trill
// long trill

// Also
// one long sustained note

function timeout() {

  if (activeNotes.length > 0) {
    if (lastNoteOffTime < startTime && timeCount - startTime > minLongDuration) {
      detected("L", startTime, timeCount - startTime, 1);
    }
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

  thisSeq = [];

  if (state == "D" && downLength > 4 && timeCount - downStartTime > minDownDuration) {
      detected("D", downStartTime, timeCount - downStartTime, downLength);
  }

  if (state == "U" && upLength > 4 && timeCount - upStartTime > minUpDuration) {
      detected("U", upStartTime, timeCount - upStartTime, upLength);
  }

  if (state == "S" && sameLength > 4 && timeCount - sameStartTime > minSameDuration) {
      detected("S", sameStartTime, timeCount - sameStartTime, sameLength);
  }

  if (state == "X" && timeCount - startTime > minSameDuration) {
      detected("S", startTime, timeCount - startTime, 1);
  }

  if (trillLength > 10 && timeCount - startTime > minTrillDuration) {
      detected("T", startTime, timeCount - startTime, 1);
  }

  state = "R";

  detected("R", restStartTime, timeCount - restStartTime, restLength);

  downLength = 0;
  upLength = 0;
  sameLength = 0;
  trillLength = 0;
  restLength = 0;

  displayCounts();
}

function detected(subgesture, startTime, duration, n) {

  if (subgestures.length == 0) {
    subgestures.push(Array.of("START", 0, 0, 0));
  }

/*
1 (a); upward short runs
2 (b); downward short runs
3 (c); staccato calls
4 (d); up-rips 
5 (e); down-rips 
6 (f); long trills 
7 (h) flutter tongue 
8 (j) long cresc-dim 
*/

  last = subgestures.at(-1);

  if (last[0] == subgesture && last[1] == startTime) {
    last[2] = duration;
    last[3] = n;
  } else {
    subgestures.push(Array.of(subgesture, startTime, duration, n));
    switch (subgesture) {
      case "R": if (duration > 10) { subgestureElement.innerHTML = "&nbsp"; }
                break;
      case "U": subgestureElement.innerHTML = "Up"; 
                console.log(subgesture);
                midiOutput.send([0xB0 + MIDIoutChannel, 0x00, 1]);
                break;
      case "D": subgestureElement.innerHTML = "Down"; 
                console.log(subgesture);
                midiOutput.send([0xB0 + MIDIoutChannel, 0x00, 2]);
                break;
      case "S": subgestureElement.innerHTML = "Calls"; 
                console.log(subgesture);
                midiOutput.send([0xB0 + MIDIoutChannel, 0x00, 3]);
                break;
      case "T": subgestureElement.innerHTML = "Trill"; 
                console.log(subgesture);
                midiOutput.send([0xB0 + MIDIoutChannel, 0x00, 6]);
                break;
      case "L": subgestureElement.innerHTML = "Long"; 
                console.log(subgesture);
                midiOutput.send([0xB0 + MIDIoutChannel, 0x00, 8]);
                break;
      default: subgestureElement.innerHTML = "unknown";
    }

    subgestures = subgestures.slice(-20);
    subgestureHistoryElement.innerHTML = subgestures.map(x => x[0]);
  }

  subgestureargsElement.innerHTML = startTime.toString() + " " + duration.toString() + " " + n.toString();

  // Max sees incoming Channel, Number, Value
  // We're sending channel 1 (which is actually 0), number 0, value 1..8
/*
  if (midiOutput) {
    console.log("Sending", [0xB0 + MIDIoutChannel, 0x00, 0]);
    midiOutput.send([0xB0 + MIDIoutChannel, 0x00, 0]);
  }
*/
}
// end of agrp.js
