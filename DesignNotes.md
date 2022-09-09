# Audio Gesture Recognition Prototype

## Design Notes

This is prototype code specifically to explore sonic gesture recognition
in real time, according to the spec provided by George E. Lewis to
PRiSM.

The specification is in the form of a score which notates the different
gestures. We also have a set of high quality digital audio recordings of
gestures which can be used for testing. The requirement is to be able to
recognise at least some of the gestures reliably in real time.

This prototype can then inform a full implementation of a gesture
recogniser, which should be reliable enough for use in performance.

This prototype is written in JavaScript using Web Audio and has been
tested in Chrome. The web page is a dashboard indicating the values in
the recognition algorithms, with a graphical display of pitch in the
style of an oscilloscope. The algorithm recognises "sub gestures" in
real time from note onsets and emits these. Rules describe how a gesture
is recognised from a sequence of sub-gestures (this feature is currently
under development).

We assume that pitch tracking occurs separately to this code, as it is a
well-researched area with code available and not the focus here. Hence
the input to this code is pitch events (which can be thought of like
CV/gate).  We do not assume chromatic input, and for the prototype we
work with quarter tones – each pitch onset event has a quarter tone note
number (0-255) and a percentage amplitude (0-100).

For testing we need pitch-tracked input from e.g. trombone. The test
harness involves an external hardware pitch tracker (Sonuus i2m) or
replayed output from different software trackers. For testing during
development, the code accepts realtime MIDI input (note on, note off and
pitch bend) so that it is possible to test it with MIDI playback from a
DAW (Logic Pro) in order to provide a reproducible realtime stream –
tracked versions of the test gestures have been created for replay. AGRP
can also be tested and demonstrated with a software or hardware MIDI
keyboard, but this doesn't demonstrate the sonic features well.

The separate program "browsertest" simply receives MIDI input and
displays it in the JavaScript console (not the web page), in
order to test the browser and MIDI setup. This is a useful test as AGRP
uses the same code for working with MIDI.  Reload the page to pick up 
changes to the available MIDI devices

_DDeR August 2022_

