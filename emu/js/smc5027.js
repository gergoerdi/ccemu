// Copyright (c) 2013, Jim Battle
// All rights reserved.
// 
// Redistribution and use in source and binary forms, with or without modification,
// are permitted provided that the following conditions are met:
// 
//   Redistributions of source code must retain the above copyright notice, this
//   list of conditions and the following disclaimer.
// 
//   Redistributions in binary form must reproduce the above copyright notice, this
//   list of conditions and the following disclaimer in the documentation and/or
//   other materials provided with the distribution.
// 
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
// ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

//============================================================================
// SMC 5027 CRT controller chip
//============================================================================

// option flags for jslint:
/* global ccemu, crt, scheduler */

var smc5027 = (function () {

    'use strict';

    var blankingTimer;       // horizontal blanking timer
    var hBlank;              // horizontal blanking state
    var hBlankDuration;      // how long blank
    var hNonblankDuration;   // how long not blank

    // CRT controller register set
    var regState = [];

    function reset() {
        for (var i = 0; i < 16; i++) {
            regState[i] = 0x00;
        }
    }

    function cursorX() { return regState[0x9]; }
    function cursorY() { return regState[0x8]; }

    // read device register
    // the chip doesn't have a read/write select.  instead, the address
    // indicates the read or write.  Only two registers are readable:
    // cursor X and cursor Y, which are separate from the address to write
    // these values.  However, the compucolor doesn't select the chip on reads.
    function rd(port) {
        switch (port) {

        case 0x8: // read cursor X location
        case 0x9: // read cursor Y location
            return regState[port] || 0x00;
        }

        return 0x00;
    }

    // write device register
    // FIXME: model more of this?
    function wr(port, value) {
        switch (port) {

        // control registers -- set once just after reset.
        // the compucolor uses a mask-ROM 5027 anyway; these aren't writable
        case 0x0: // horizontal line count
        case 0x1: // hsync, interlace
        case 0x2: // scans/row, chars/row
        case 0x3: // data rows per frame
        case 0x4: // scan lines/frame
        case 0x5: // vertical data start
            break;

        // last displayed data row (scroll control)
        // the compucolor ROM doesn't touch it, but a program might
        case 0x6:
            regState[port] = value;
            break;

        // scroll up register
        case 0xB:
//          var rows = regState[0x3];    // #rows of chars/display - 1
            var rows = 32 - 1;           // hardcoded for now
            var curEnd = regState[0x6];  // last displayed row
            regState[0x6] = (curEnd + 1) % (rows + 1);
            break;

        // load cursor X
        case 0xC:
            regState[0x9] = value;         // bits [7:0]
            break;

        // load cursor Y
        case 0xD:
            regState[0x8] = value & 0x3F;  // bits [5:0]
            break;

        // the compucolor ROM does touch these shortly after reset
        // I don't believe their effects are software visible, so no
        // need to model them
        case 0xA: // issue reset command
            // this resets and freezes the counters until a subsequent
            // start command (0xE)
            break;
        case 0xE: // load start timing
            break;

        // other registers, not normaly used by the compucolor,
        // so not modeled
        case 0x7: // processor load command
        case 0xF: // self load command
            break;
        }

        crt.markDirty();  // in case we touched a cursor register
    }

    // report which row is the first to display (hw scrolling)
    function firstDisplayRow() {
//      var rows = regState[0x3];    // #rows of chars/display - 1
        var rows = 32 - 1;           // hardcoded for now
        var curEnd = regState[0x6];  // last displayed row
        return (curEnd + 1) % (rows + 1);
    }

    // initialize
    function init() {
        reset();

        // start horizontal blanking
        // TODO: the blanking period (63.5 uS) and blanking interval (4.7 uS)
        //       should be derived from how the 5027 registers are programmed,
        //       but until I know the actual parameters, these are hardcoded.
        var CPU_FREQ = ccemu.getCpuFreq();
        hBlankDuration    = Math.floor(CPU_FREQ *       4.7  / 1000000); // 4.7 uS
        hNonblankDuration = Math.floor(CPU_FREQ * (63.5-4.7) / 1000000);
        hBlank = 0;
        blankingTimer = scheduler.oneShot(hNonblankDuration, hBlankCallback, "hBlank");

        // horizontal blanking callback
        function hBlankCallback() {
            hBlank = !hBlank;
            var duration = (hBlank) ? hBlankDuration : hNonblankDuration;
            blankingTimer = scheduler.oneShot(duration, hBlankCallback, "hBlank");
        }
    }

    // expose public members:
    return {
        'init':             init,
        'reset':            reset,
        'rd':               rd,
        'wr':               wr,
        'cursorX':          cursorX,
        'cursorY':          cursorY,
        'hBlank':           function () { return hBlank; }, // FIXME: is the wrapper necessary?
        'firstDisplayRow':  firstDisplayRow
    };

}());  // smc5027

// vim:et:sw=4:
