# AGRP Concert Config

## Hardware

The device on each instrument channel is a Sonuus i2M. 

https://www.sonuus.com/products_i2m_mp.html

These have a 1/4inch jack instrument input (high impendence), and a USB output which presents both USB audio (16bit) and MIDI. These were configured to use pitchbend rather than chromatic midi, and for wind/voice input. 

## Software

The software is called Audio Gesture Recognition Prototype (AGRP) and was written in summer 2022 as a prototype to experiment with gesture recognition. It’s maintained on github

https://github.com/davidderoure/AGRP 

AGRP is written in JavaScript and is run by loading the agrp.html web page from a local file into a Chrome browser.  In my case this file is in my PRiSM folder and I open it like this:

file:///Users/davidderoure/PRiSM/George Lewis/AGRP/agrp.html 

It loads agrp.js. No other files are required.

The midi input and output channels can be specified in the URL:

file:///Users/davidderoure/PRiSM/George Lewis/AGRP/agrp.html?midin=1&midout=1

Note that if the available MIDI devices change while the program is running it will be necessary to reload the web page to find the new device configuration.

## Concert Configuration

Voyager “cooked” audio was patched through to focusrite outputs 1-5. Five i2m devices, configured to use MIDI channels 1-5, were connected via 1/4in TRS cables to these focusrite outputs. All five i2m devices were connected to a USB hub that was plugged into the M1, which therefore received each instrument on a separate MIDI channel. The i2m devices have preamps and configurable note ranges but we didn’t use these features.

For the concert we used a web page that automatically opened 5 tabs with a single click, using each one of the midi input channels 1-5. 

To integrate with Voyager, the program looks for a MIDI output called “to Max 2”, and emits CC events [0xB0, Ox00, 1-8] corresponding to gestures as follows:

1 (a); upward short runs
2 (b); downward short runs
3 (c); staccato calls
4 (d); up-rips 
5 (e); down-rips 
6 (f); long trills 
7 (h) flutter tongue 
8 (j) long cresc-dim 

NB When “Up” is detected, gestures 1 and 4 are reported as these aren’t currently distinguished by the software, similarly for “Down” reporting gestures 2 and 5, and “Trill” reporting gestures 6 and 7.

## Future development

1.	Currently 5 features are distinguished. It should be possible to extend this to 7 by distinguishing runs and rips.

2.	At the moment the software uses one chrome tab per channel, and five channels can be displayed visually simultaneously by breaking the tabs out into separate windows.  It could be updated to handle multiple channels in one tab.

3.	Currently it is “tuned” to specific hard-coded gestures. It could instead use a “gesture library” so that it is easier to configure to new gestures.

4.	The current pitch resolution is in quarter tones, and this could be changed to further divisions.

