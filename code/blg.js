inlets = 1;
outlets = 3;
autowatch = 1;

include("lm.js");

var _active_notes = []    // notes actually being held down
var _selected_notes = []  // notes being considered for inclusion
var _fold_notes = []      // note range for folding the live.grid

// steps generated by patternGenerator
var _steps = []

// steps currently in the live.step sequencer (may have originally been same as _steps,
// but user may have edited them)
var _live_steps = [];
var _live_steps_len = 0;

var _lock_note_selection = false;

var _pg = require('./patternGenerator.js')

var _pg_params = {
    'newRhythm': true,
    'newNoteAssignments': true,
    'newAccentPattern': true,
    'accentProbability': 50,
    'accentIntensity': 50,
    'maxNumAccents': 3,
    'noteProbability': 100,
    'frontWeight': 15,
    'slideProbability': 15
}

var _init = false;

function liveInit() {
    post("[liveInit] unchecking togLockSelectedNotes...\n")
    var o1 = this.patcher.getnamed("togLockSelectedNotes")
    o1.assign(0)
    post("[liveInit] done.\n")
    _init = true;
}

// called when user clicks new accents checkbox
function toggleLockNoteSelection(val) {
    _lock_note_selection = val;

    // when the lock is removed, we want the selected notes to immediately be set to the active notes
    if (!_lock_note_selection) {
        noteChange (0, 0);
    }
}

// called when user clicks new rhythm checkbox
function toggleNewRhythm(val) {
    _pg_params.newRhythm = val;

    var o1 = this.patcher.getnamed("togNewNoteAssign");
    var o2 = this.patcher.getnamed("pnlNewNoteAssign");
    if (val) {
        o1.ignoreclick = 1;
        o2.hidden = 0;
    } else {
        o1.ignoreclick = 0;
        o2.hidden = 1;
    }
}

// called when user clicks new note assignments checkbox
function toggleNewNoteAssignments(val) {
    _pg_params.newNoteAssignments = val;
}

// called when user clicks new accents checkbox
function toggleNewAccents(val) {
    _pg_params.newAccentPattern = val;
}

// called when user changes the note probability
function setNoteProb(val) {
    val = Math.floor(val)
    _pg_params.noteProbability = val;
}

// called when user changes front weighting
function setFrontWeight(val) {
    val = Math.floor(val);
    _pg_params.frontWeight = val;
}


// called when user changes the slide probability
function setSlideProb(val) {
    val = Math.floor(val)
    _pg_params.slideProbability = val;
}



// called when user changes accent probability
function setAccentProbability(val) {
    val = Math.floor(val);
    _pg_params.accentProbability = val;
}

// called when user changes accent intensity
function setAccentIntensity(val) {
    val = Math.floor(val);
    _pg_params.accentIntensity = val;
}

// called when user sets max num accents
function setMaxNumAccents(val) {
    _pg_params.maxNumAccents = val;
}

// called when user clicks regen
function regen() {
    generateSequence();
    sendSteps();
}

// triggered via a message when midi notes change
function noteChange(note, velocity) {
    var i;

    if (note === null) {
        return;
    }

    post ("[noteChange] note received: " + note + ", " + velocity + "\n");

    _active_notes = _active_notes.filter(function(item) { 
        return item !== note
    })

    if (velocity > 0) {
        _active_notes.push(note)
    }

    post ("[noteChange] active notes: " + _active_notes.join(', ') + "\n")

    if (_lock_note_selection && velocity == 0) {
        post ("[noteChange] note selection locked; ignoring note off\n");
        post ("[noteChange] selected notes: " + _selected_notes.join(', ') + "\n")
        return;
    }

    var num_selected_before = _selected_notes.length;
    if (_lock_note_selection) {
        _selected_notes = _selected_notes.filter(function(item) { 
            return item !== note
        })
        _selected_notes.push(note)
    } else {
        _selected_notes = []
        for (i = 0; i < _active_notes.length; i++) {
            _selected_notes.push(_active_notes[i]);
        }
    }
    var num_selected_after = _selected_notes.length;

    post ("[noteChange] selected notes: " + _selected_notes.join(', ') + "\n")

    if (_selected_notes.length == 0) {
        o = this.patcher.getnamed("togLockSelectedNotes");
        o.hidden = 1;
        o = this.patcher.getnamed("cmtLockSelectedNotes");
        o.hidden = 1;
        o = this.patcher.getnamed("pnlInstructions");
        o.hidden = 0;
        o = this.patcher.getnamed("cmtInstructions");
        o.hidden = 0;
        o = this.patcher.getnamed("txtRegen");
        o.hidden = 1;
        o = this.patcher.getnamed("sldAccentProb");
        o.hidden = 1;
        o = this.patcher.getnamed("sldAccentIntensity");
        o.hidden = 1;
        o = this.patcher.getnamed("sldNoteProb");
        o.hidden = 1;
        o = this.patcher.getnamed("sldFrontWeight");
        o.hidden = 1;
        o = this.patcher.getnamed("sldSlideProb");
        o.hidden = 1;
    }
    else {
        o = this.patcher.getnamed("txtRegen");
        o.hidden = 0;
        o = this.patcher.getnamed("sldSlideProb");
        o.hidden = 0;
        o = this.patcher.getnamed("sldAccentProb");
        o.hidden = 0;
        o = this.patcher.getnamed("sldAccentIntensity");
        o.hidden = 0;
        o = this.patcher.getnamed("sldFrontWeight");
        o.hidden = 0;
        o = this.patcher.getnamed("sldNoteProb");
        o.hidden = 0;
        o = this.patcher.getnamed("togLockSelectedNotes");
        o.hidden = 0;
        o = this.patcher.getnamed("cmtLockSelectedNotes");
        o.hidden = 0;
        o = this.patcher.getnamed("cmtInstructions");
        o.hidden = 1;
        o = this.patcher.getnamed("pnlInstructions");
        o.hidden = 1;
    }

    if (num_selected_after > num_selected_before) {
        post ("[noteChange] sending message << fold_pitch " + _selected_notes.join(', ') + " >>\n");

        // find the full range of selected notes; we're going to fold to that range
        var min = 999999;
        var max = -999999;

        var n = 0;
        for (i = 0; i < _selected_notes.length; i++) {
            n = _selected_notes[i];
            if (n < min) {
                min = n;
            }
            if (n > max) {
                max = n;
            }
        }

        // never fold to smaller than 1 octave
        if (max - min < 12) {
            max = min + 12
        }

        _fold_notes = [];
        for (n = min; n <= max; n++) {
            _fold_notes.push(n);
        }

        //post ("[noteChange] min: " + min);
        //post ("[noteChange] max: " + max);
        //post ("[noteChange] folding to (" + fold_notes.join(',')  + ")...\n");
        
        outlet(2, 1);
        outlet(1, _fold_notes);
    }
}

// triggered in response to the bang message received when user clicks the "Generate" text object 
function generateSequence() {

    // TODO - remove this -- it's just for debugging without a MIDI keyboard
    //_selectedNotes = [60, 64, 67];

    if (_selected_notes.length < 1) {
        // if user hasn't selected any notes, bail out -- would be nicer to show 
        // the user a message so he knows how to use the generator
        return;
    }

    _steps = [];

    _steps = _pg.generateSteps(_selected_notes, _pg_params)

    //var stepstr = JSON.stringify (_steps);
    //var step_store = this.patcher.getnamed("stepStore");
    //step_store.message(1, stepstr)

    post("Generated sequence with " + _steps.length + " steps\n");
    
}

// called from the +12 -12 buttons
function transpose (value) {
    var i;
    for (i = 0; i < _steps.length; i++) {
        if (_steps[i].note > 0) {
            _steps[i].note += value;
        }
    }

    sendSteps();

    for (i = 0; i < _fold_notes.length; i++) {
        _fold_notes[i] += value
    }
    
    outlet(2, 1);
    outlet(1, _fold_notes);
}

// loads the steps into the sequencer
function sendSteps() {
    outlet(0, "nstep", _steps.length)
    outlet(0, "loop", 0, _steps.length)
    for (var i = 0; i < _steps.length; i++) {
        var step = _steps[i];
        outlet(0, "step", i + 1, step.note, step.velocity, step.duration, step.probability)
    }
}

function clipOut() {
    var track = new LiveAPI("this_device canonical_parent");
    var clipSlots = track.getcount("clip_slots");
    var clipSlot;

    var firstClip = null;

    for (var clipSlotNum = 0; clipSlotNum < clipSlots; clipSlotNum++) {
        clipSlot = new LiveAPI("this_device canonical_parent clip_slots " + clipSlotNum);
        var hasClip = clipSlot.get("has_clip").toString() !== "0";
        if (!hasClip) break;
    }

    if (clipSlotNum === clipSlots) {
        // have to create new clip slot (scene)
        var set = new LiveAPI("live_set");
        set.call("create_scene", -1);
        clipSlot = new LiveAPI("this_device canonical_parent clip_slots " + clipSlotNum);
    }

    post("Creating clip in slot " + clipSlotNum + "\n")

    post("Setting notes in clip; num notes: " + _live_steps_len + "\n")

    var beats = Math.ceil(_live_steps_len / 4);
    post("num beats: " + beats + "\n")

    clipSlot.call("create_clip", beats);
    var clip = new LiveAPI("this_device canonical_parent clip_slots " + clipSlotNum + " clip");
    //var notes = generateMidi();

    post("Setting notes in clip...\n")

    setClipNotes(clip);
}

// called once for each note output by the live.step when it receives the "dump" message;
// dump starts when user clicks the "clip" button
function dumpStep(s, i, pitch, velocity, duration) {
    if (s !== 'step') {
        return;
    }
    post("received dump step " + i + "/" + _steps.length + ", " + pitch + ", " + velocity + "\n");
    if (i === 1) {
        _live_steps = [];
    }

    _live_steps[i - 1] = {
        pitch: pitch,
        velocity: velocity,
        duration: duration,
    }
    _live_steps_len = i;

    if (i === _steps.length) {
        clipOut();
    }
}

function setClipNotes(clip) {
    clip.call("set_notes");

    nonZeroCount = 0;
    for (var i = 0; i < _live_steps_len; i++) {
        var step = _live_steps[i];
        if (step.velocity > 0) {
            nonZeroCount++;
        }
    }

    post("clip.call(notes, " + nonZeroCount + ")")
    clip.call("notes", nonZeroCount);

    for (var i = 0; i < _live_steps_len; i++) {
        var step = _live_steps[i];
        if (step.velocity === 0) {
            continue;
        }
        post(JSON.stringify(step) + "\n")
        var start = (i / 4).toFixed(4);
        var duration = (step.duration / 480).toFixed(4);
        clip.call("note", step.pitch, start, duration, step.velocity);
    }

    clip.call("done");
}


function replaceAllNotes(clip, notes) {
    clip.call("select_all_notes");
    clip.call("replace_selected_notes");
    clip.call("notes", notes.length);

    post(" --- replacing all notes...\n");
    for (var i = 0; i < notes.length; i++) {
        var note = notes[i];
        post(JSON.stringify(note) + "\n")
        callNote(clip, note);
    }

    clip.call("done");
}

function callNote(clip, note) {
    clip.call("note", note.Pitch, note.Start.toFixed(4), note.Duration.toFixed(4), note.Velocity, note.Muted);
}

function callPatternStepDump() {
    var patternStep = this.patcher.getnamed("patternStep");
    patternStep.message("dump");
}
