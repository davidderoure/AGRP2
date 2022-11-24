// Testing MIDI communication to Voyager

let midiOutput = null;

navigator.requestMIDIAccess()
.then(function(midiAccess) {
  const outputs = midiAccess.outputs.values();
  console.log(outputs);
  for(const output of outputs) {
    console.log(output);
    if (output.name == "to Max 2") {
      console.log("Found", output.name);
      midiOutput = output;
    }
  }

  // Max sees incoming Channel, Number, Value
  // We're sending channel 1 (which is actually 0), number 0, value 1..8

  console.log("Sending 8 test messages");
  for (var i = 1; i <= 8; i++) {
    console.log([0xB0, 0x00, i]);
    midiOutput.send([0xB0, 0x00, i]);
  }
});

