// web/flare.js — Eurorack visual patcher, ground-up rewrite
// Fully implements:
//   - HP Grid snapping (free placement anywhere on the rails)
//   - Slide-to-push rail collision physics (zero overlaps, sliding module pushing)
//   - Separate "WS IN" and "WS OUT" 6 HP hardware modules
//   - Right-click Context Menus:
//     - Right-click empty rail: categorized Add Module menu (places module exactly at clicked snapped HP position)
//     - Right-click module: Action menu (Delete, Move Row Up, Move Row Down)
//   - Exposes detents, cents fine-tune, CV inputs, and outputs
//   - Dynamic rail width calculation to trigger horizontal scroll and prevent overflow
//   - Category-based DOM tags for visual variety and panel styles
//   - Stacked IN and OUT port rows (span full width, centering 1-2 jacks, 2-column grid for 3+ jacks)
//   - 2-screw panels for slim modules (HP < 6)
//   - Always-visible knob values below parameter labels (no more hover-swapping)
//   - Centered vertically distributed jacks for empty/knobless modules (.mod-knobless)
//   - Clean faceplate titles (.module-title) centered below top screws with padding to prevent overflow/overlap
//   - Visual Patcher Macros (compiled from low-level nodes):
//     - `multi-div` (Multi Clock Divider): 4 output divisions simultaneously (/2, /4, /8, /16)
//     - `sub-osc` (Sub-Oscillator VCO): Saw wave with main, sub-1 (-12), and sub-2 (-24) octave outputs
//     - `quad-vca` (Quad VCA): 4 independent VCAs in a single 12 HP panel
//     - `lfo-delay` (Delay LFO): LFO with built-in triggerable fade-in envelope
//     - `score-player` (Score Player): Plays Loupe melody patterns from a text score input (generates notes + gate)
//     - `step-seq` (4-Step Sequencer): 4-step CV step sequencer using a hold-based counter and index lens
//   - Discrete/detented snap values for Mixer, Divider, Router, WT, Euclid, etc.
//   - Added missing modules from actual language (DX Voice, Wavetable, Shaper LUT, Random, Chance, Walk, Env Follower, Add, Mul)
//   - Custom generator for 4-channel Mixer (mix) using VCA scaling

"use strict";

const HP = 15; // 1 Eurorack HP = 15px

// Lens language expressions for hardware IO ports
const LENS_PORTS = {
  // Output ports from WS IN (source points in visual patcher)
  'knob-main':  '(knob :main)',
  'knob-x':     '(knob :x)',
  'knob-y':     '(knob :y)',
  'switch-z':   '(switch :z)',
  'audio-in-1': '(audio-in :1)',
  'audio-in-2': '(audio-in :2)',
  'cv-in-1':    '(cv-in :1)',
  'cv-in-2':    '(cv-in :2)',
  'pulse-in-1': '(pulse-in :1)',
  'pulse-in-2': '(pulse-in :2)',
  // Input ports to WS OUT (sink points in visual patcher)
  'audio-out-1': '(audio-out :1)',
  'audio-out-2': '(audio-out :2)',
  'cv-out-1':    '(cv-out :1)',
  'cv-out-2':    '(cv-out :2)',
  'pulse-out-1': '(pulse-out :1)',
  'pulse-out-2': '(pulse-out :2)',
};

const KNOB_PX = { large: 44, medium: 30, small: 24 };
const KNOB_ASSET = { large: 'largeKnob', medium: 'mediumKnob', small: 'mediumKnob' };

// Module definitions with customized HP width, knobs, inputs, outputs, and knob layouts
const MODULE_DEFS = {
  // ── Hardware IO (Separate IN/OUT, 6 HP each) ──────────────────────────
  'ws-in': {
    title: 'HW INPUTS', hp: 6, category: 'io',
    deletable: false, isHW: true,
    knobs: [],
    inputs: [],
    outputs: [
      { id: 'knob-main',  label: 'MAIN' },
      { id: 'knob-x',     label: 'KNOB X' },
      { id: 'knob-y',     label: 'KNOB Y' },
      { id: 'switch-z',   label: 'SW Z' },
      { id: 'spacer-1',   label: '' },
      { id: 'spacer-2',   label: '' },
      { id: 'audio-in-1', label: 'AUD 1' },
      { id: 'audio-in-2', label: 'AUD 2' },
      { id: 'cv-in-1',    label: 'CV 1' },
      { id: 'cv-in-2',    label: 'CV 2' },
      { id: 'pulse-in-1', label: 'PLS 1' },
      { id: 'pulse-in-2', label: 'PLS 2' },
    ],
  },
  'ws-out': {
    title: 'HW OUTPUTS', hp: 6, category: 'io',
    deletable: false, isHW: true,
    knobs: [],
    inputs: [
      { id: 'audio-out-1', label: 'AUD 1' },
      { id: 'audio-out-2', label: 'AUD 2' },
      { id: 'cv-out-1',    label: 'CV 1' },
      { id: 'cv-out-2',    label: 'CV 2' },
      { id: 'pulse-out-1', label: 'PLS 1' },
      { id: 'pulse-out-2', label: 'PLS 2' },
    ],
    outputs: [],
  },

  // ── Oscillators ────────────────────────────────────────────────────────
  sine: {
    title: 'VCO (Sine)', hp: 6, category: 'oscillators', knobLayout: 'vertical',
    knobs: [
      { param: 'pitch', label: 'PITCH', size: 'large', def: 1935 },
      { param: 'cents', label: 'FINE TUNE', size: 'small', def: 2048 },
      { param: 'depth', label: 'FM DEPTH', size: 'small', def: 0 },
      { param: 'range', label: 'RANGE', size: 'small', def: 0, discrete: ['audio', 'lfo'] },
    ],
    inputs: [
      { id: 'note',  label: 'V/OCT' },
      { id: 'fm',    label: 'FM IN' },
      { id: 'pm',    label: 'PM IN' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  triangle: {
    title: 'VCO (Tri)', hp: 6, category: 'oscillators', knobLayout: 'vertical',
    knobs: [
      { param: 'pitch', label: 'PITCH', size: 'large', def: 1935 },
      { param: 'cents', label: 'FINE TUNE', size: 'small', def: 2048 },
      { param: 'depth', label: 'FM DEPTH', size: 'small', def: 0 },
      { param: 'range', label: 'RANGE', size: 'small', def: 0, discrete: ['audio', 'lfo'] },
    ],
    inputs: [
      { id: 'note', label: 'V/OCT' },
      { id: 'fm', label: 'FM IN' },
      { id: 'pm', label: 'PM IN' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  saw: {
    title: 'VCO (Saw)', hp: 6, category: 'oscillators', knobLayout: 'vertical',
    knobs: [
      { param: 'pitch', label: 'PITCH', size: 'large', def: 1935 },
      { param: 'cents', label: 'FINE TUNE', size: 'small', def: 2048 },
      { param: 'depth', label: 'FM DEPTH', size: 'small', def: 0 },
      { param: 'range', label: 'RANGE', size: 'small', def: 0, discrete: ['audio', 'lfo'] },
    ],
    inputs: [
      { id: 'note', label: 'V/OCT' },
      { id: 'fm', label: 'FM IN' },
      { id: 'pm', label: 'PM IN' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  square: {
    title: 'VCO (Square)', hp: 6, category: 'oscillators', knobLayout: 'vertical',
    knobs: [
      { param: 'pitch', label: 'PITCH', size: 'large', def: 1935 },
      { param: 'cents', label: 'FINE TUNE', size: 'small', def: 2048 },
      { param: 'depth', label: 'FM DEPTH', size: 'small', def: 0 },
      { param: 'range', label: 'RANGE', size: 'small', def: 0, discrete: ['audio', 'lfo'] },
    ],
    inputs: [
      { id: 'note', label: 'V/OCT' },
      { id: 'fm', label: 'FM IN' },
      { id: 'pm', label: 'PM IN' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  'sub-osc': {
    title: 'Sub-Osc VCO', hp: 6, category: 'oscillators', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'pitch', label: 'PITCH', size: 'large', def: 1935 },
      { param: 'cents', label: 'FINE TUNE', size: 'small', def: 2048 }
    ],
    inputs: [{ id: 'note', label: 'V/OCT' }],
    outputs: [
      { id: 'out', label: 'MAIN' },
      { id: 'sub1', label: 'SUB -1' },
      { id: 'sub2', label: 'SUB -2' }
    ]
  },
  phasor: {
    title: 'Phasor LFO', hp: 4, category: 'oscillators', knobLayout: 'vertical',
    knobs: [
      { param: 'hz', label: 'RATE', size: 'medium', def: 10 }
    ],
    inputs: [
      { id: 'hz',   label: 'CV RATE' },
      { id: 'sync', label: 'SYNC' }
    ],
    outputs: [{ id: 'phase', label: 'PHASE' }],
  },
  'lfo-delay': {
    title: 'Delay LFO', hp: 4, category: 'oscillators', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'hz',   label: 'RATE',      size: 'medium', def: 10 },
      { param: 'fade', label: 'FADE TIME', size: 'small',  def: 2048 }
    ],
    inputs: [
      { id: 'trig', label: 'FADE GATE' },
      { id: 'hz',   label: 'CV RATE' },
      { id: 'fade', label: 'CV FADE' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  wt: {
    title: 'WT Osc', hp: 8, category: 'oscillators', knobLayout: 'grid',
    knobs: [
      { param: 'pitch',  label: 'PITCH',       size: 'medium', def: 1935 },
      { param: 'table',  label: 'TABLE',       size: 'medium', def: 256, discrete: [0, 1, 2, 3, 4, 5, 6, 7] },
      { param: 'pos',    label: 'MORPH',       size: 'small',  def: 2048 },
      { param: 'posamt', label: 'MORPH CV AMT', size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'pitch', label: 'V/OCT' },
      { id: 'pos',   label: 'MORPH IN' },
      { id: 'pm',    label: 'PM IN' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  noise: {
    title: 'NOISE', hp: 2, category: 'oscillators',
    knobs: [],
    inputs: [],
    outputs: [{ id: 'out', label: 'OUT' }],
  },

  // ── Filters ────────────────────────────────────────────────────────────
  lpf: {
    title: 'LP Filter', hp: 4, category: 'filters', knobLayout: 'vertical',
    knobs: [
      { param: 'cut',    label: 'CUTOFF',   size: 'medium', def: 2048 },
      { param: 'cutamt', label: 'CUT CV AMT', size: 'small', def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'cut', label: 'CV CUT' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  hpf: {
    title: 'HP Filter', hp: 4, category: 'filters', knobLayout: 'vertical',
    knobs: [
      { param: 'cut',    label: 'CUTOFF',    size: 'medium', def: 2048 },
      { param: 'cutamt', label: 'CUT CV AMT', size: 'small', def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'cut', label: 'CV CUT' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  vcf: {
    title: 'SV Filter', hp: 8, category: 'filters', knobLayout: 'grid',
    knobs: [
      { param: 'cut',    label: 'CUTOFF',    size: 'medium', def: 2048 },
      { param: 'res',    label: 'Q-RES',     size: 'medium', def: 1000 },
      { param: 'cutamt', label: 'CUT CV AMT', size: 'small',  def: 4095 },
      { param: 'resamt', label: 'RES CV AMT', size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'cut', label: 'CV CUT' },
      { id: 'res', label: 'CV RES' }
    ],
    outputs: [
      { id: 'lp', label: 'LP' },
      { id: 'hp', label: 'HP' },
      { id: 'bp', label: 'BP' },
      { id: 'notch', label: 'NOTCH' }
    ],
  },
  lpf2: {
    title: 'LP Filter 2', hp: 8, category: 'filters', knobLayout: 'grid',
    knobs: [
      { param: 'cut',    label: 'CUTOFF',    size: 'medium', def: 2048 },
      { param: 'res',    label: 'Q-RES',     size: 'medium', def: 1000 },
      { param: 'cutamt', label: 'CUT CV AMT', size: 'small',  def: 4095 },
      { param: 'resamt', label: 'RES CV AMT', size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'cut', label: 'CV CUT' },
      { id: 'res', label: 'CV RES' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  hpf2: {
    title: 'HP Filter 2', hp: 8, category: 'filters', knobLayout: 'grid',
    knobs: [
      { param: 'cut',    label: 'CUTOFF',    size: 'medium', def: 2048 },
      { param: 'res',    label: 'Q-RES',     size: 'medium', def: 1000 },
      { param: 'cutamt', label: 'CUT CV AMT', size: 'small',  def: 4095 },
      { param: 'resamt', label: 'RES CV AMT', size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'cut', label: 'CV CUT' },
      { id: 'res', label: 'CV RES' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  bpf2: {
    title: 'BP Filter 2', hp: 8, category: 'filters', knobLayout: 'grid',
    knobs: [
      { param: 'cut',    label: 'CUTOFF',    size: 'medium', def: 2048 },
      { param: 'res',    label: 'Q-RES',     size: 'medium', def: 1000 },
      { param: 'cutamt', label: 'CUT CV AMT', size: 'small',  def: 4095 },
      { param: 'resamt', label: 'RES CV AMT', size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'cut', label: 'CV CUT' },
      { id: 'res', label: 'CV RES' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  lpg: {
    title: 'LP Gate', hp: 4, category: 'filters', knobLayout: 'vertical',
    knobs: [
      { param: 'ctrl',    label: 'LEVEL',      size: 'medium', def: 2048 },
      { param: 'ctrlamt', label: 'LEVEL CV AMT', size: 'small', def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'ctrl', label: 'CV LEVEL' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  slew: {
    title: 'Slew Limiter', hp: 4, category: 'filters', knobLayout: 'vertical',
    knobs: [
      { param: 'rate',    label: 'RISE/FALL',  size: 'medium', def: 1000 },
      { param: 'rateamt', label: 'RATE CV AMT', size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'rate', label: 'CV RATE' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  average: {
    title: 'Average', hp: 4, category: 'filters', knobLayout: 'vertical',
    knobs: [{ param: 'cut', label: 'SAMPLES', size: 'medium', def: 878, discrete: [2, 4, 8, 16, 32, 64, 128] }],
    inputs: [{ id: 'in', label: 'IN' }],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  envfollow: {
    title: 'Env Follow', hp: 4, category: 'filters', knobLayout: 'vertical',
    knobs: [{ param: 'cut', label: 'RESPONSE', size: 'medium', def: 1000 }],
    inputs: [{ id: 'in', label: 'IN' }],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
 
  // ── Shapers & Dynamics ─────────────────────────────────────────────────
  vca: {
    title: 'VCA Gain', hp: 4, category: 'envelopes', knobLayout: 'vertical',
    knobs: [{ param: 'amp', label: 'LEVEL', size: 'medium', def: 4095 }],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'amp', label: 'CV AMP' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  'quad-vca': {
    title: 'Quad VCA', hp: 12, category: 'envelopes', knobLayout: 'grid',
    isMacro: true,
    knobs: [
      { param: 'volA', label: 'LEVEL A', size: 'small', def: 4095 },
      { param: 'volB', label: 'LEVEL B', size: 'small', def: 4095 },
      { param: 'volC', label: 'LEVEL C', size: 'small', def: 4095 },
      { param: 'volD', label: 'LEVEL D', size: 'small', def: 4095 }
    ],
    inputs: [
      { id: 'inA', label: 'IN A' }, { id: 'cvA', label: 'CV A' },
      { id: 'inB', label: 'IN B' }, { id: 'cvB', label: 'CV B' },
      { id: 'inC', label: 'IN C' }, { id: 'cvC', label: 'CV C' },
      { id: 'inD', label: 'IN D' }, { id: 'cvD', label: 'CV D' }
    ],
    outputs: [
      { id: 'outA', label: 'OUT A' },
      { id: 'outB', label: 'OUT B' },
      { id: 'outC', label: 'OUT C' },
      { id: 'outD', label: 'OUT D' }
    ]
  },
  envelope: {
    title: 'AR Env', hp: 6, category: 'envelopes', knobLayout: 'grid',
    knobs: [
      { param: 'decay',    label: 'DECAY',       size: 'medium', def: 2048 },
      { param: 'peak',     label: 'PEAK',        size: 'small', def: 4095 },
      { param: 'decayamt', label: 'DEC CV AMT',  size: 'small', def: 4095 },
      { param: 'peakamt',  label: 'PEAK CV AMT', size: 'small', def: 4095 },
    ],
    inputs: [
      { id: 'trig',  label: 'TRIG' },
      { id: 'gate',  label: 'GATE' },
      { id: 'decay', label: 'CV DEC' },
      { id: 'peak',  label: 'CV PEAK' },
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  adsr: {
    title: 'ADSR Env', hp: 8, category: 'envelopes', knobLayout: 'grid',
    knobs: [
      { param: 'attack',  label: 'ATTACK',  size: 'small', def: 512  },
      { param: 'decay',   label: 'DECAY',   size: 'small', def: 1024 },
      { param: 'sustain', label: 'SUSTAIN', size: 'small', def: 4095 },
      { param: 'release', label: 'RELEASE', size: 'small', def: 1024 },
    ],
    inputs: [
      { id: 'gate',    label: 'GATE' },
      { id: 'attack',  label: 'CV ATT' },
      { id: 'decay',   label: 'CV DEC' },
      { id: 'sustain', label: 'CV SUS' },
      { id: 'release', label: 'CV REL' },
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  mix: {
    title: '4-Ch Mixer', hp: 6, category: 'envelopes', knobLayout: 'grid',
    knobs: [
      { param: 'volA', label: 'VOL A', size: 'small', def: 2048 },
      { param: 'volB', label: 'VOL B', size: 'small', def: 2048 },
      { param: 'volC', label: 'VOL C', size: 'small', def: 2048 },
      { param: 'volD', label: 'VOL D', size: 'small', def: 2048 },
    ],
    inputs: [
      { id: 'a', label: 'IN A' }, { id: 'b', label: 'IN B' },
      { id: 'c', label: 'IN C' }, { id: 'd', label: 'IN D' },
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  ring: {
    title: 'Ring Mod', hp: 2, category: 'shapers',
    knobs: [],
    inputs: [{ id: 'a', label: 'CARRIER' }, { id: 'b', label: 'MODULATOR' }],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  wavefold: {
    title: 'Wave Folder', hp: 4, category: 'shapers', knobLayout: 'vertical',
    knobs: [
      { param: 'drive',    label: 'FOLD',      size: 'medium', def: 1000 },
      { param: 'driveamt', label: 'FOLD CV AMT', size: 'small', def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'drive', label: 'CV FOLD' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  delay: {
    title: 'Tape Delay', hp: 8, category: 'shapers', knobLayout: 'grid',
    isMacro: true,
    knobs: [
      { param: 'time',        label: 'TIME',        size: 'medium', def: 2048 },
      { param: 'feedback',    label: 'FEEDBACK',    size: 'medium', def: 1024 },
      { param: 'mix',         label: 'MIX WET',     size: 'small',  def: 2048 },
      { param: 'timeamt',     label: 'TIME CV AMT', size: 'small',  def: 4095 },
      { param: 'feedbackamt', label: 'FEED CV AMT', size: 'small',  def: 4095 },
      { param: 'mixamt',      label: 'MIX CV AMT',  size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'in',       label: 'IN' },
      { id: 'time',     label: 'CV TIME' },
      { id: 'feedback', label: 'CV FEED' },
      { id: 'mix',      label: 'CV MIX' },
    ],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  reverb: {
    title: 'Space Reverb', hp: 8, category: 'shapers', knobLayout: 'grid',
    isMacro: true,
    knobs: [
      { param: 'decay',    label: 'DECAY',      size: 'medium', def: 2048 },
      { param: 'mix',      label: 'MIX',        size: 'medium', def: 1024 },
      { param: 'decayamt', label: 'DEC CV AMT', size: 'small',  def: 4095 },
      { param: 'mixamt',   label: 'MIX CV AMT', size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'in',    label: 'IN' },
      { id: 'decay', label: 'CV DEC' },
      { id: 'mix',   label: 'CV MIX' },
    ],
    outputs: [
      { id: 'outL', label: 'OUT L' },
      { id: 'outR', label: 'OUT R' }
    ]
  },
  chorus: {
    title: 'Stereo Chorus', hp: 6, category: 'shapers', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'rate',        label: 'RATE',        size: 'medium', def: 1000 },
      { param: 'depth',       label: 'DEPTH',       size: 'medium', def: 2048 },
      { param: 'feedback',    label: 'FEEDBACK',    size: 'medium', def: 2048 },
      { param: 'rateamt',     label: 'RATE CV AMT', size: 'small',  def: 4095 },
      { param: 'depthamt',    label: 'DEP CV AMT',  size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'in',    label: 'IN' },
      { id: 'rate',  label: 'CV RATE' },
      { id: 'depth', label: 'CV DEPTH' },
    ],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  flanger: {
    title: 'Flanger', hp: 6, category: 'shapers', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'rate',        label: 'RATE',        size: 'medium', def: 500 },
      { param: 'depth',       label: 'DEPTH',       size: 'medium', def: 1024 },
      { param: 'feedback',    label: 'FEEDBACK',    size: 'medium', def: 3000 },
      { param: 'rateamt',     label: 'RATE CV AMT', size: 'small',  def: 4095 },
      { param: 'depthamt',    label: 'DEP CV AMT',  size: 'small',  def: 4095 },
    ],
    inputs: [
      { id: 'in',    label: 'IN' },
      { id: 'rate',  label: 'CV RATE' },
      { id: 'depth', label: 'CV DEPTH' },
    ],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  compressor: {
    title: 'Compressor', hp: 8, category: 'shapers', knobLayout: 'grid',
    isMacro: true,
    knobs: [
      { param: 'threshold', label: 'THRESHOLD', size: 'medium', def: 3000 },
      { param: 'ratio',     label: 'RATIO',     size: 'medium', def: 2048 },
      { param: 'attack',    label: 'ATTACK',    size: 'small',  def: 100 },
      { param: 'release',   label: 'RELEASE',   size: 'small',  def: 1000 },
    ],
    inputs: [
      { id: 'in', label: 'IN' }
    ],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  logic: {
    title: 'Logic Gate', hp: 2, category: 'math', knobLayout: 'vertical',
    isMacro: true,
    knobs: [],
    inputs: [
      { id: 'a', label: 'IN A' },
      { id: 'b', label: 'IN B' }
    ],
    outputs: [
      { id: 'and', label: 'AND' },
      { id: 'or',  label: 'OR' },
      { id: 'xor', label: 'XOR' },
      { id: 'not', label: 'NOT A' }
    ]
  },
  math: {
    title: 'Math Unit', hp: 2, category: 'math', knobLayout: 'vertical',
    isMacro: true,
    knobs: [],
    inputs: [
      { id: 'a', label: 'IN A' },
      { id: 'b', label: 'IN B' }
    ],
    outputs: [
      { id: 'add', label: 'ADD' },
      { id: 'sub', label: 'SUB' },
      { id: 'mul', label: 'MUL' },
      { id: 'div', label: 'DIV' },
      { id: 'min', label: 'MIN' },
      { id: 'max', label: 'MAX' }
    ]
  },
  quantizer: {
    title: 'Scale Quantizer', hp: 4, category: 'math', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'scale', label: 'SCALE', size: 'large', def: 0,
        discrete: ['minor', 'major', 'minor-pent', 'major-pent', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'chromatic'] }
    ],
    inputs: [
      { id: 'in', label: 'IN V/OCT' }
    ],
    outputs: [
      { id: 'out', label: 'OUT V/OCT' }
    ]
  },
  attenuverter: {
    title: 'Attenuverter', hp: 4, category: 'math', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'gain',   label: 'GAIN',   size: 'large', def: 2048 },
      { param: 'offset', label: 'OFFSET', size: 'medium', def: 2048 }
    ],
    inputs: [
      { id: 'in', label: 'IN' }
    ],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  morph: {
    title: 'Morph Scanner', hp: 6, category: 'math', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'pos', label: 'POSITION', size: 'large', def: 0 }
    ],
    inputs: [
      { id: 'in1', label: 'IN 1' },
      { id: 'in2', label: 'IN 2' },
      { id: 'in3', label: 'IN 3' },
      { id: 'in4', label: 'IN 4' },
      { id: 'pos', label: 'POS CV' }
    ],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  saturate: {
    title: 'Saturator', hp: 8, category: 'shapers', knobLayout: 'grid',
    knobs: [
      { param: 'drive',    label: 'DRIVE',      size: 'large', def: 2048 },
      { param: 'bias',     label: 'BIAS',       size: 'small', def: 0 },
      { param: 'mix',      label: 'WET',        size: 'small', def: 4095 },
      { param: 'level',    label: 'LEVEL',      size: 'small', def: 4095 },
      { param: 'driveamt', label: 'DRV CV AMT', size: 'small', def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'drive', label: 'CV DRV' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  shape: {
    title: 'Shaper LUT', hp: 6, category: 'shapers', knobLayout: 'vertical',
    knobs: [
      { param: 'drive', label: 'DRIVE', size: 'large', def: 2048 },
      { param: 'curve', label: 'CURVE', size: 'medium', def: 0, discrete: [0, 1, 2, 3] },
      { param: 'oversample', label: 'OVERSAMPLE', size: 'small', def: 0, discrete: [0, 1] }
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'drive', label: 'CV DRV' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  crush: {
    title: 'Bit Crusher', hp: 6, category: 'shapers', knobLayout: 'vertical',
    knobs: [
      { param: 'rate',    label: 'RATE',       size: 'large', def: 4095 },
      { param: 'rateamt', label: 'RATE CV AMT', size: 'small', def: 4095 },
    ],
    inputs: [
      { id: 'in', label: 'IN' },
      { id: 'rate', label: 'CV RATE' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  add: {
    title: 'CV Adder', hp: 2, category: 'math',
    knobs: [],
    inputs: [{ id: 'a', label: 'IN A' }, { id: 'b', label: 'IN B' }],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  mul: {
    title: 'Attenuator', hp: 2, category: 'math', knobLayout: 'vertical',
    knobs: [{ param: 'gain', label: 'GAIN', size: 'medium', def: 4095 }],
    inputs: [{ id: 'a', label: 'IN' }],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  constant: {
    title: 'Constant Val', hp: 2, category: 'math', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'val', label: 'VOLTAGE', size: 'large', def: 2048 }
    ],
    inputs: [],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  'signal-switch': {
    title: '3-Way Switch', hp: 2, category: 'math', knobLayout: 'vertical',
    isMacro: true,
    knobs: [],
    inputs: [
      { id: 'cond', label: 'CONTROL' },
      { id: 'a', label: 'IN A (DN)' },
      { id: 'b', label: 'IN B (MID)' },
      { id: 'c', label: 'IN C (UP)' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  'seq-switch': {
    title: 'Seq Switch', hp: 6, category: 'math', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'steps', label: 'STEPS', size: 'medium', def: 4095, discrete: [2, 3, 4] }
    ],
    inputs: [
      { id: 'trig', label: 'CLOCK' },
      { id: 'in1', label: 'IN 1' },
      { id: 'in2', label: 'IN 2' },
      { id: 'in3', label: 'IN 3' },
      { id: 'in4', label: 'IN 4' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }]
  },

  // ── Voices ─────────────────────────────────────────────────────────────
  kick: {
    title: 'Kick Synth', hp: 6, category: 'voices', knobLayout: 'grid',
    knobs: [
      { param: 'note',  label: 'PITCH', size: 'medium', def: 1161 },
      { param: 'decay', label: 'DECAY', size: 'medium', def: 2048 },
      { param: 'drive', label: 'DRIVE', size: 'small',  def: 0    },
    ],
    inputs: [
      { id: 'trig', label: 'TRIG' },
      { id: 'note', label: 'PITCH CV' },
      { id: 'decay', label: 'CV DEC' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  snare: {
    title: 'Snare Synth', hp: 6, category: 'voices', knobLayout: 'grid',
    knobs: [
      { param: 'note',   label: 'PITCH',  size: 'medium', def: 1451 },
      { param: 'decay',  label: 'DECAY',  size: 'medium', def: 2048 },
      { param: 'snappy', label: 'NOISE',  size: 'small',  def: 2048 },
    ],
    inputs: [
      { id: 'trig',   label: 'TRIG' },
      { id: 'note',   label: 'PITCH CV' },
      { id: 'decay',  label: 'CV DEC' },
      { id: 'snappy', label: 'CV NOISE' },
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  hat: {
    title: 'Hi-Hat', hp: 6, category: 'voices', knobLayout: 'vertical',
    knobs: [
      { param: 'note',  label: 'TENSION', size: 'medium', def: 2580 },
      { param: 'decay', label: 'DECAY', size: 'medium', def: 1024 },
    ],
    inputs: [
      { id: 'trig', label: 'TRIG' },
      { id: 'note', label: 'PITCH CV' },
      { id: 'decay', label: 'CV DEC' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  pluck: {
    title: 'Plucked String', hp: 6, category: 'voices', knobLayout: 'vertical',
    knobs: [
      { param: 'pitch', label: 'PITCH', size: 'medium', def: 1935 },
      { param: 'damp',  label: 'DECAY', size: 'medium', def: 2048 },
    ],
    inputs: [
      { id: 'trig',  label: 'STRIKE' },
      { id: 'pitch', label: 'V/OCT' },
      { id: 'damp',  label: 'CV DAMP' },
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  dx: {
    title: 'DX FM Voice', hp: 6, category: 'voices', knobLayout: 'grid',
    knobs: [
      { param: 'bank',   label: 'BANK',   size: 'small', def: 0, discrete: [0, 1, 2] },
      { param: 'preset', label: 'PRESET', size: 'medium', def: 0, discrete: Array.from({length: 32}, (_, i) => i) },
      { param: 'decay',  label: 'DECAY',  size: 'medium', def: 2048 },
      { param: 'tone',   label: 'TONE',   size: 'small', def: 2048 }
    ],
    inputs: [
      { id: 'pitch', label: 'V/OCT' },
      { id: 'gate',  label: 'GATE' },
      { id: 'decay', label: 'CV DEC' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  'tape-looper': {
    title: 'Tape Sampler', hp: 8, category: 'voices', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'speed', label: 'PLAY SPEED', size: 'large', def: 2048 },
      { param: 'len',   label: 'MAX SECS',   size: 'medium', def: 2048, discrete: [1, 2, 3, 4] }
    ],
    inputs: [
      { id: 'in',    label: 'AUDIO IN' },
      { id: 'rec',   label: 'REC GATE' },
      { id: 'speed', label: 'CV SPEED' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  benjolin: {
    title: 'Benjolin Chaos', hp: 12, category: 'voices', knobLayout: 'grid',
    isMacro: true,
    knobs: [
      { param: 'freq1',   label: 'VCO 1 FREQ', size: 'large',  def: 1935 },
      { param: 'freq2',   label: 'VCO 2 FREQ', size: 'large',  def: 1935 },
      { param: 'rungler', label: 'RUNG DEPT',  size: 'medium', def: 1024 },
      { param: 'lock',    label: 'LOOP LOCK',  size: 'small',  def: 0, discrete: ['run', 'lock'] }
    ],
    inputs: [
      { id: 'pitch1', label: 'VCO1 PITCH' },
      { id: 'pitch2', label: 'VCO2 PITCH' }
    ],
    outputs: [
      { id: 'out1',     label: 'VCO 1 OUT' },
      { id: 'out2',     label: 'VCO 2 OUT' },
      { id: 'rungle',   label: 'STEP RUNG' },
      { id: 'runglesm', label: 'SMOOTH RG' }
    ]
  },

  // ── Clocks & Sequencing ────────────────────────────────────────────────
  clock: {
    title: 'Clock Gen', hp: 4, category: 'clocks', knobLayout: 'vertical',
    knobs: [
      { param: 'bpm',   label: 'BPM',   size: 'medium', def: 1638 },
      { param: 'fm',    label: 'FM DEPTH', size: 'small', def: 0 },
      { param: 'width', label: 'WIDTH', size: 'small', def: 2048 }
    ],
    inputs: [
      { id: 'sync', label: 'SYNC' },
      { id: 'fm',   label: 'FM CV' }
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  'multi-div': {
    title: 'Multi Div', hp: 4, category: 'clocks',
    isMacro: true,
    knobs: [],
    inputs: [{ id: 'trig', label: 'CLOCK' }],
    outputs: [
      { id: 'div2',  label: '/2' },
      { id: 'div4',  label: '/4' },
      { id: 'div8',  label: '/8' },
      { id: 'div16', label: '/16' }
    ]
  },
  rhythm: {
    title: 'Rhythm Player', hp: 6, category: 'clocks', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'pattern', label: 'PATTERN', size: 'large', def: 0,
        discrete: ['four-on-floor', 'backbeat', 'eighths', 'offbeat', 'sixteenths', 'downbeat', 'tresillo', 'cinquillo', 'habanera', 'son-clave', 'rumba-clave', 'bossa'] },
      { param: 'mode', label: 'MODE', size: 'medium', def: 0,
        discrete: ['onsets', 'gates', 'hits'] }
    ],
    inputs: [
      { id: 'trig', label: 'CLOCK' }
    ],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  turing: {
    title: 'Turing Machine', hp: 6, category: 'clocks', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'prob', label: 'MUTATION', size: 'large', def: 4095 },
      { param: 'len',  label: 'LENGTH',   size: 'medium', def: 4095, discrete: [1, 2, 3, 4, 5, 6, 7, 8, 12, 16] }
    ],
    inputs: [
      { id: 'trig', label: 'CLOCK' },
      { id: 'prob', label: 'CV MUT' },
    ],
    outputs: [
      { id: 'out',  label: 'V/OCT' },
      { id: 'trig', label: 'TRIG' }
    ]
  },
  'score-player': {
    title: 'Score Player', hp: 8, category: 'clocks', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'speed', label: 'PLAY SPEED', size: 'medium', def: 2048 }
    ],
    inputs: [
      { id: 'trig', label: 'CLOCK' },
      { id: 'speed', label: 'CV SPEED' }
    ],
    outputs: [
      { id: 'note', label: 'V/OCT' },
      { id: 'gate', label: 'GATE' }
    ]
  },
  'step-seq': {
    title: 'Step Sequencer', hp: 12, category: 'clocks', knobLayout: 'grid',
    isMacro: true,
    knobs: [
      { param: 'val1',  label: 'STEP 1', size: 'small', def: 0 },
      { param: 'val2',  label: 'STEP 2', size: 'small', def: 512 },
      { param: 'val3',  label: 'STEP 3', size: 'small', def: 1024 },
      { param: 'val4',  label: 'STEP 4', size: 'small', def: 1536 },
      { param: 'val5',  label: 'STEP 5', size: 'small', def: 2048 },
      { param: 'val6',  label: 'STEP 6', size: 'small', def: 2560 },
      { param: 'val7',  label: 'STEP 7', size: 'small', def: 3072 },
      { param: 'val8',  label: 'STEP 8', size: 'small', def: 3584 },
      { param: 'steps', label: 'STEPS',  size: 'small', def: 4095, discrete: [1, 2, 3, 4, 5, 6, 7, 8] },
      { param: 'dir',   label: 'DIR',    size: 'small', def: 0, discrete: ['forward', 'backward', 'random'] }
    ],
    inputs: [
      { id: 'trig', label: 'CLOCK' }
    ],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  'drum-seq': {
    title: 'Drum Sequencer', hp: 14, category: 'clocks', knobLayout: 'vertical',
    isMacro: true,
    knobs: [],
    inputs: [
      { id: 'trig', label: 'CLOCK' }
    ],
    outputs: [
      { id: 'kick',  label: 'KICK' },
      { id: 'snare', label: 'SNARE' },
      { id: 'hat',   label: 'HAT' },
      { id: 'perc',  label: 'PERC' }
    ]
  },
  'midi-sync': {
    title: 'MIDI Clock', hp: 4, category: 'clocks', knobLayout: 'vertical',
    isMacro: true,
    knobs: [],
    inputs: [],
    outputs: [
      { id: 'clock', label: 'CLOCK' },
      { id: 'run',   label: 'RUN' }
    ]
  },
  trig: {
    title: 'Trig Delay', hp: 2, category: 'clocks', knobLayout: 'vertical',
    knobs: [{ param: 'rate', label: 'DELAY TIME', size: 'medium', def: 1000 }],
    inputs: [
      { id: 'trig', label: 'IN' },
      { id: 'rate', label: 'CV RATE' },
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  every: {
    title: 'Clock Div', hp: 2, category: 'gates', knobLayout: 'vertical',
    knobs: [{ param: 'n', label: 'DIVISOR', size: 'large', def: 1103, discrete: [1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 24, 32, 64] }],
    inputs: [{ id: 'trig', label: 'IN' }],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  euclid: {
    title: 'Euclid Gen', hp: 4, category: 'gates', knobLayout: 'vertical',
    knobs: [
      { param: 'steps',  label: 'STEPS',  size: 'medium', def: 1984, discrete: Array.from({length: 32}, (_, i) => i + 1) },
      { param: 'pulses', label: 'PULSES', size: 'medium', def: 448, discrete: Array.from({length: 32}, (_, i) => i + 1) },
    ],
    inputs: [{ id: 'trig', label: 'CLOCK' }],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  hold: {
    title: 'S & H', hp: 2, category: 'gates',
    knobs: [],
    inputs: [{ id: 'val', label: 'SIGNAL' }, { id: 'on', label: 'CLOCK' }],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  turns: {
    title: 'Turns Router', hp: 2, category: 'gates', knobLayout: 'vertical',
    knobs: [{ param: 'n', label: 'CHANNELS', size: 'large', def: 1138, discrete: [2, 3, 4, 5, 6, 7, 8, 12, 16] }],
    inputs: [{ id: 'trig', label: 'CLOCK' }],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  'shift-register': {
    title: 'Shift Register', hp: 4, category: 'gates', knobLayout: 'vertical',
    isMacro: true,
    knobs: [],
    inputs: [
      { id: 'in',   label: 'CV IN' },
      { id: 'trig', label: 'CLOCK' }
    ],
    outputs: [
      { id: 'out1', label: 'STAGE 1' },
      { id: 'out2', label: 'STAGE 2' },
      { id: 'out3', label: 'STAGE 3' },
      { id: 'out4', label: 'STAGE 4' }
    ]
  },
  gate: {
    title: 'Gate Gen', hp: 6, category: 'gates', knobLayout: 'vertical',
    knobs: [
      { param: 'thresh', label: 'THRESHOLD', size: 'medium', def: 2048 },
      { param: 'len',    label: 'LENGTH',    size: 'medium', def: 100 }
    ],
    inputs: [
      { id: 'in',     label: 'IN' },
      { id: 'thresh', label: 'CV THR' },
      { id: 'len',    label: 'CV LEN' },
    ],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  schmitt: {
    title: 'Comparator', hp: 2, category: 'gates', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'lo', label: 'LOW THR',  size: 'medium', def: 1024 },
      { param: 'hi', label: 'HIGH THR', size: 'medium', def: 3072 }
    ],
    inputs: [
      { id: 'in', label: 'IN' }
    ],
    outputs: [
      { id: 'out', label: 'OUT' }
    ]
  },
  toggle: {
    title: 'Toggle Flip', hp: 2, category: 'gates',
    knobs: [],
    inputs: [{ id: 'in', label: 'IN' }],
    outputs: [{ id: 'out', label: 'OUT' }],
  },
  random: {
    title: 'Random Volt', hp: 2, category: 'gates', knobLayout: 'vertical',
    knobs: [],
    inputs: [{ id: 'trig', label: 'TRIG' }],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  chance: {
    title: 'Chance Gate', hp: 4, category: 'gates', knobLayout: 'vertical',
    knobs: [{ param: 'p', label: 'PROBABILITY', size: 'medium', def: 2048 }],
    inputs: [
      { id: 'trig', label: 'IN' },
      { id: 'p',    label: 'CV PROB' },
    ],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  walk: {
    title: 'Rand Walk', hp: 4, category: 'gates', knobLayout: 'vertical',
    knobs: [{ param: 'step', label: 'STEP SIZE', size: 'medium', def: 1000 }],
    inputs: [
      { id: 'trig', label: 'CLOCK' },
      { id: 'step', label: 'CV STEP' },
    ],
    outputs: [{ id: 'out', label: 'OUT' }]
  },

  // ── MIDI ───────────────────────────────────────────────────────────────
  'midi-note': {
    title: 'MIDI Keyboard', hp: 6, category: 'midi', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'ch', label: 'MIDI CH', size: 'medium', def: 0, discrete: Array.from({length: 16}, (_, i) => i + 1) }
    ],
    inputs: [],
    outputs: [
      { id: 'note', label: 'V/OCT' },
      { id: 'gate', label: 'GATE' },
      { id: 'vel', label: 'VELOCITY' },
      { id: 'press', label: 'PRESSURE' },
      { id: 'bend', label: 'PITCH BEND' }
    ]
  },
  'midi-cc': {
    title: 'MIDI CC In', hp: 4, category: 'midi', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'ch', label: 'MIDI CH', size: 'small', def: 0, discrete: Array.from({length: 17}, (_, i) => i) },
      { param: 'cc', label: 'CC NUM', size: 'medium', def: 1, discrete: Array.from({length: 128}, (_, i) => i) }
    ],
    inputs: [],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  'midi-trig': {
    title: 'MIDI Note Trig', hp: 4, category: 'midi', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'ch', label: 'MIDI CH', size: 'small', def: 0, discrete: Array.from({length: 17}, (_, i) => i) },
      { param: 'note', label: 'NOTE NUM', size: 'medium', def: 60, discrete: Array.from({length: 128}, (_, i) => i) }
    ],
    inputs: [],
    outputs: [{ id: 'out', label: 'OUT' }]
  },
  'midi-clock': {
    title: 'MIDI Clock In', hp: 2, category: 'midi',
    isMacro: true,
    knobs: [],
    inputs: [],
    outputs: [
      { id: 'clk', label: 'CLOCK' },
      { id: 'play', label: 'RUNNING' }
    ]
  },
  'midi-note-out': {
    title: 'MIDI Keyb Out', hp: 6, category: 'midi', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'ch', label: 'MIDI CH', size: 'medium', def: 1, discrete: Array.from({length: 16}, (_, i) => i + 1) }
    ],
    inputs: [
      { id: 'pitch', label: 'V/OCT' },
      { id: 'gate', label: 'GATE' },
      { id: 'vel', label: 'VELOCITY' }
    ],
    outputs: []
  },
  'midi-cc-out': {
    title: 'MIDI CC Out', hp: 4, category: 'midi', knobLayout: 'vertical',
    isMacro: true,
    knobs: [
      { param: 'ch', label: 'MIDI CH', size: 'small', def: 1, discrete: Array.from({length: 16}, (_, i) => i + 1) },
      { param: 'cc', label: 'CC NUM', size: 'medium', def: 1, discrete: Array.from({length: 128}, (_, i) => i) }
    ],
    inputs: [
      { id: 'val', label: 'SIGNAL' }
    ],
    outputs: []
  },
  'midi-clock-out': {
    title: 'MIDI Clock Out', hp: 2, category: 'midi',
    isMacro: true,
    knobs: [],
    inputs: [
      { id: 'clk', label: 'CLOCK' }
    ],
    outputs: []
  },
};

const CATEGORY_ORDER  = [
  'io',
  'oscillators',
  'voices',
  'filters',
  'envelopes',
  'shapers',
  'math',
  'clocks',
  'gates',
  'midi'
];
const CATEGORY_LABELS = {
  io: 'Hardware I/O',
  oscillators: 'Oscillators',
  voices: 'Sound Generators',
  filters: 'Filters & LPGs',
  envelopes: 'VCAs & Envelopes',
  shapers: 'Waveshapers & Effects',
  math: 'Math & Logic',
  clocks: 'Clocks & Sequencers',
  gates: 'Gate & Random Utilities',
  midi: 'MIDI Utility',
};

// ═══════════════════════════════════════════════════════════════════════
// 2. STATE & POSITION VARIABLES
// ═══════════════════════════════════════════════════════════════════════

const state = {
  rows: [[], []], // rows[rowIdx] = [{ id, type, left: px, params: {} }]
  cables: [],     // { fromId, fromPort, toId, toPort, color }
  nextId: 1,
};

let lastActiveRow = 0; // tracks which row the user last interacted with

let nodesCount = 0;
let liveUpdateTimer = null;
let isSendingLive = false;
let liveUpdatePending = false;
let lastUploadedSnapshot = null;

function getConstantsMetadata(bytes) {
  const r = {
    _b: bytes,
    _p: 0,
    u8() { return this._b[this._p++]; },
    u16() { const v = this._b[this._p] | (this._b[this._p+1]<<8); this._p+=2; return v; },
    u32() { const v = (this._b[this._p]|(this._b[this._p+1]<<8)|(this._b[this._p+2]<<16)|((this._b[this._p+3]<<24)>>>0)); this._p+=4; return v>>>0; },
    i32() { return this.u32() | 0; },
    str(n) { const s = String.fromCharCode(...this._b.slice(this._p, this._p+n)); this._p+=n; return s; },
    pos() { return this._p; }
  };

  // Header (19 bytes)
  const magic = [r.u8(), r.u8(), r.u8(), r.u8(), r.u8()];
  const version = r.u16();
  r.u16(); // flags
  const slot_count = r.u16();
  r.u16(); // reserved
  r.u16(); // reserved
  const buffer_count = r.u8();
  const terminal_count = r.u8();
  const kernel_id_count = r.u8();
  r.u8(); // reserved

  // Kernel Registry
  for (let i = 0; i < kernel_id_count; i++) {
    const len = r.u8();
    r.str(len);
  }

  const constants = [];
  let constIdx = 0;

  // Slot Table
  for (let i = 0; i < slot_count; i++) {
    const kid = r.u8();
    const core = r.u8();
    const in_count = r.u8();
    for (let j = 0; j < in_count; j++) {
      const tag = r.u8();
      if (tag === 0 || tag === 4) { // TAG_SLOT = 0, TAG_SLOT_OUT2 = 4
        r.u16();
      } else if (tag === 1) { // TAG_BUFFER = 1
        r.u16();
      } else if (tag === 2) { // TAG_CONST_U8 = 2
        const valOffset = r.pos();
        const val = r.u8();
        constants.push({
          const_idx: constIdx++,
          tag: tag,
          byte_offset: valOffset,
          value: val,
          size: 1
        });
      } else if (tag === 3) { // TAG_CONST_I32 = 3
        const valOffset = r.pos();
        const val = r.i32();
        constants.push({
          const_idx: constIdx++,
          tag: tag,
          byte_offset: valOffset,
          value: val,
          size: 4
        });
      }
    }
    r.u16(); // out_offset
    r.u32(); // param0
  }
  return constants;
}

function getConstantValueForKnob(m, paramName, rawVal) {
  const prevVal = m.params[paramName];
  m.params[paramName] = rawVal;

  let result;
  if (m.type === 'sine' || m.type === 'triangle' || m.type === 'saw' || m.type === 'square' || m.type === 'sub-osc') {
    if (paramName === 'pitch' || paramName === 'cents') {
      const pitchKnob = getKnobValue(m.type, 'pitch', m.params.pitch ?? 1935);
      const centsVal  = (getKnobValue(m.type, 'cents', m.params.cents ?? 2048) - 2048) / 204.8;
      const noteCable = state.cables.find(c => c.toId === m.id && c.toPort === 'note');
      if (noteCable) {
        result = Math.round(pitchKnob - 60 + centsVal);
      } else {
        result = Math.round(pitchKnob + centsVal);
      }
    }
  }

  if (result === undefined) {
    result = getKnobValue(m.type, paramName, rawVal);
  }

  m.params[paramName] = prevVal;
  return result;
}

function rebuildKnobConstantMap() {
  knobConstantMap = {};
  if (!compiledSnapshot) return;

  const allMods = state.rows.flat();
  const baseSnapshot = new Uint8Array(compiledSnapshot);
  let baseConsts;
  try {
    baseConsts = getConstantsMetadata(baseSnapshot);
  } catch (e) {
    console.warn('Failed to parse base constants:', e);
    return;
  }

  for (const m of allMods) {
    const def = MODULE_DEFS[m.type];
    if (!def || def.isHW) continue;
    for (const k of (def.knobs || [])) {
      const paramName = k.param;
      const originalVal = m.params[paramName] ?? k.def;
      
      const tempVal = originalVal >= 2048 ? originalVal - 1000 : originalVal + 1000;
      m.params[paramName] = tempVal;

      try {
        const code = generateCode(true); // textOnly = true
        const ast = Lens.read(code);
        const expanded = Lens.expand(ast, { loadFile: __webLoadFile });
        const lowered = Lens.lower(expanded);
        const sched = Lens.schedule(lowered);
        const tempSnapshot = Lens.encode(sched, lowered);

        if (tempSnapshot.length === baseSnapshot.length) {
          const tempConsts = getConstantsMetadata(tempSnapshot);
          if (tempConsts.length === baseConsts.length) {
            const diffs = [];
            for (let i = 0; i < baseConsts.length; i++) {
              if (baseConsts[i].value !== tempConsts[i].value) {
                diffs.push({ baseEntry: baseConsts[i], tempEntry: tempConsts[i] });
              }
            }
            if (diffs.length === 1) {
              knobConstantMap[`${m.id}.${paramName}`] = {
                const_idx: diffs[0].baseEntry.const_idx,
                byte_offset: diffs[0].baseEntry.byte_offset,
                size: diffs[0].baseEntry.size
              };
            }
          }
        }
      } catch (err) {
        console.warn(`[Knob Map] Error mapping ${m.id}.${paramName}:`, err);
      } finally {
        m.params[paramName] = originalVal;
      }
    }
  }
  console.log('[Knob Map] Rebuilt knobConstantMap:', knobConstantMap);
}

function triggerLiveUpdate() {
  if (!midiOut || !compiledSnapshot) return;
  if (isSendingLive) {
    liveUpdatePending = true;
    return;
  }
  if (liveUpdateTimer) clearTimeout(liveUpdateTimer);
  liveUpdateTimer = setTimeout(async () => {
    isSendingLive = true;
    liveUpdatePending = false;

    let didUpdateConst = false;
    if (lastUploadedSnapshot && lastUploadedSnapshot.length === compiledSnapshot.length) {
      try {
        const oldConsts = getConstantsMetadata(lastUploadedSnapshot);
        const newConsts = getConstantsMetadata(compiledSnapshot);
        if (oldConsts.length === newConsts.length) {
          const diffs = [];
          for (let i = 0; i < oldConsts.length; i++) {
            if (oldConsts[i].value !== newConsts[i].value) {
              diffs.push({ oldEntry: oldConsts[i], newEntry: newConsts[i] });
            }
          }
          let allBytesMatch = true;
          for (let i = 0; i < compiledSnapshot.length; i++) {
            if (lastUploadedSnapshot[i] !== compiledSnapshot[i]) {
              allBytesMatch = false;
              break;
            }
          }

          if (allBytesMatch) {
            didUpdateConst = true;
            const statusEl = $('status');
            statusEl.textContent = `${nodesCount} nodes · ${compiledSnapshot.length} B · live updated!`;
            statusEl.className = 'ok';
          } else if (diffs.length === 1) {
            const targetOffset = diffs[0].newEntry.byte_offset;
            const targetSize = diffs[0].newEntry.size;
            let otherBytesMatch = true;
            for (let i = 0; i < compiledSnapshot.length - 4; i++) {
              if (i >= targetOffset && i < targetOffset + targetSize) continue;
              if (lastUploadedSnapshot[i] !== compiledSnapshot[i]) {
                otherBytesMatch = false;
                break;
              }
            }
            if (otherBytesMatch && targetSize === 4) {
              const constIdx = diffs[0].newEntry.const_idx;
              const newValue = diffs[0].newEntry.value;
              const newCrc32 = compiledSnapshot[compiledSnapshot.length - 4] |
                               (compiledSnapshot[compiledSnapshot.length - 3] << 8) |
                               (compiledSnapshot[compiledSnapshot.length - 2] << 16) |
                               ((compiledSnapshot[compiledSnapshot.length - 1] << 24) >>> 0);

              const payload = new Uint8Array(11);
              payload[0] = constIdx;
              payload[1] = newValue & 0xFF;
              payload[2] = (newValue >> 8) & 0xFF;
              payload[3] = (newValue >> 16) & 0xFF;
              payload[4] = (newValue >> 24) & 0xFF;
              payload[5] = targetOffset & 0xFF;
              payload[6] = (targetOffset >> 8) & 0xFF;
              payload[7] = newCrc32 & 0xFF;
              payload[8] = (newCrc32 >> 8) & 0xFF;
              payload[9] = (newCrc32 >> 16) & 0xFF;
              payload[10] = (newCrc32 >> 24) & 0xFF;

              midiOut.send([...Lens.frame(Lens.CMD.UPDATE_CONST, payload)]);
              const m = await recvAck();
              if (m.cmd === Lens.CMD.ACK) {
                lastUploadedSnapshot = new Uint8Array(compiledSnapshot);
                didUpdateConst = true;
                const statusEl = $('status');
                statusEl.textContent = `${nodesCount} nodes · ${compiledSnapshot.length} B · live updated!`;
                statusEl.className = 'ok';
              }
            }
          }
        }
      } catch (e) {
        console.warn('Real-time constant update detection/execution failed, falling back to full upload:', e);
      }
    }

    if (!didUpdateConst) {
      try {
        await writeSnapshot();
        lastUploadedSnapshot = new Uint8Array(compiledSnapshot);
        const statusEl = $('status');
        statusEl.textContent = `${nodesCount} nodes · ${compiledSnapshot.length} B · playing live!`;
        statusEl.className = 'ok';
      } catch (e) {
        console.warn('Live update failed:', e.message);
      }
    }
    isSendingLive = false;
    if (liveUpdatePending) {
      triggerLiveUpdate();
    }
  }, 100);
}
let midiOut = null, midiIn = null, ackWaiter = null;
let compiledSnapshot = null;
let currentContextMenu = null;
let hoveredJack = null;
let knobConstantMap = {};
let lastGeneratedCode = '';

// ═══════════════════════════════════════════════════════════════════════
// 3. CORE UTILS
// ═══════════════════════════════════════════════════════════════════════

const $  = id => document.getElementById(id);
const el = (tag, cls, attrs) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) Object.assign(e, attrs);
  return e;
};

function valToAngle(v) { return -135 + (Math.max(0, Math.min(4095, v)) / 4095) * 270; }

function getModuleData(id) {
  for (const row of state.rows) {
    const m = row.find(m => m.id === id);
    if (m) return m;
  }
  return null;
}
function getModuleRowIndex(id) {
  return state.rows.findIndex(row => row.some(m => m.id === id));
}

function snapToHP(val) {
  return Math.round(val / HP) * HP;
}

function findFreePosition(rowIndex, hpWidth) {
  const widthPx = hpWidth * HP;
  const rowMods = state.rows[rowIndex] || [];
  let candidate = 0;
  while (true) {
    let clash = false;
    for (const m of rowMods) {
      const def = MODULE_DEFS[m.type];
      const mWidth = (def ? def.hp : 6) * HP;
      const left = m.left || 0;
      if (candidate < left + mWidth && candidate + widthPx > left) {
        clash = true;
        candidate = snapToHP(left + mWidth + 15);
        break;
      }
    }
    if (!clash) return candidate;
  }
}

// Convert semitones/MIDI notes to clean readable text (e.g. C4, A#3)
function formatNote(val) {
  const noteNum = Math.round(val);
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  let idx = noteNum % 12;
  if (idx < 0) idx += 12;
  const octave = Math.floor(noteNum / 12) - 1;
  const noteName = names[idx];
  return `${noteName}${octave} (${noteNum})`;
}

// Helper to get formatted or snap value of a parameter
function scaleNote(rawVal) {
  return Math.round((rawVal / 4095) * 127);
}

function scaleBpm(rawVal) {
  return Math.round(40 + (rawVal / 4095) * 200);
}

function getKnobValue(type, paramName, rawVal) {
  if (rawVal === undefined || rawVal === null || Number.isNaN(rawVal)) {
    return undefined;
  }
  const def = MODULE_DEFS[type];
  if (!def) return rawVal;
  const kDef = def.knobs.find(k => k.param === paramName);
  if (kDef && kDef.discrete) {
    const idx = Math.max(0, Math.min(kDef.discrete.length - 1, Math.floor((rawVal / 4096) * kDef.discrete.length)));
    return kDef.discrete[idx];
  }
  if (paramName === 'pitch' || paramName === 'note') {
    return scaleNote(rawVal);
  }
  if (paramName === 'bpm') {
    return scaleBpm(rawVal);
  }
  return rawVal;
}

const DX7_PRESETS = {
  0: ["SOLID BASS", "S.BAS 27.7", "LeaderTape", "ANALOG  4", "ANALOG  6", "GASHAUS", "WINTRHODES", "*Mark III", "SYNDM 25.8", "JX-33-P", "Etherial5a", "ICE PAD  2", "M1 PADS", "Bounce 4", "CARLOS   2", "'Airy'", "SOFT TOUCH", "CIRRUS", "ENTRIX", "BORON A", "Textures 6", "Mooger Low", "*Hammond 1", "Mooger Low", "Mooger Low", "Mooger Low", "Mooger Low", "Mooger Low", "Mooger Low", "Mooger Low", "Mooger Low", "Mooger Low"],
  1: ["PICCOLO", "FLUTE   2", "OBOE", "CLARINET", "SAX BC", "BASSOON", "STRINGS 4", "STRINGS 5", "STRINGS 6", "STRINGS 7", "STRINGS 8", "BRASS   4", "BRASS   5", "BRASS 6 BC", "BRASS   7", "BRASS   8", "RECORDER", "HARMONICA1", "HRMNCA2 BC", "VOICE   2", "VOICE   3", "GLOKENSPL", "VIBE    2", "XYLOPHONE", "CHIMES", "GONG    1", "GONG    2", "BELLS", "COW BELL", "BLOCK", "FLEXATONE", "LOG DRUM"],
  2: ["BRASS   1", "BRASS   2", "BRASS   3", "STRINGS 1", "STRINGS 2", "STRINGS 3", "ORCHESTRA", "PIANO   1", "PIANO   2", "PIANO   3", "E.PIANO 1", "GUITAR  1", "GUITAR  2", "SYN-LEAD 1", "BASS    1", "BASS    2", "E.ORGAN 1", "PIPES   1", "HARPSICH 1", "CLAV    1", "VIBE    1", "MARIMBA", "KOTO", "FLUTE   1", "ORCH-CHIME", "TUB BELLS", "STEEL DRUM", "TIMPANI", "REFS WHISL", "VOICE   1", "TRAIN", "TAKE OFF"]
};

function getDisplayValueStr(type, paramName, rawVal, instanceId) {
  const def = MODULE_DEFS[type];
  if (!def) return '';
  const kDef = def.knobs.find(k => k.param === paramName);
  if (!kDef) return '';

  if (type === 'dx' && paramName === 'preset') {
    let bankIdx = 0;
    if (instanceId) {
      const mData = getModuleData(instanceId);
      if (mData) {
        const bankRaw = mData.params.bank ?? 0;
        bankIdx = Math.max(0, Math.min(2, Math.floor((bankRaw / 4096) * 3)));
      }
    }
    const voiceList = DX7_PRESETS[bankIdx] || [];
    const voiceIdx = Math.max(0, Math.min(voiceList.length - 1, Math.floor((rawVal / 4096) * voiceList.length)));
    return voiceList[voiceIdx] || '';
  }

  if (kDef.discrete) {
    const idx = Math.max(0, Math.min(kDef.discrete.length - 1, Math.floor((rawVal / 4096) * kDef.discrete.length)));
    const val = kDef.discrete[idx];
    if (kDef.param.startsWith('vol')) {
      return `${val}`;
    } else if (kDef.param === 'n' && type === 'every') {
      return `/${val}`;
    }
    return `${val}`;
  } else {
    if (kDef.param === 'pitch' || kDef.param === 'note') {
      return formatNote(scaleNote(rawVal));
    } else if (kDef.param === 'bpm') {
      return `${scaleBpm(rawVal)} BPM`;
    } else if (kDef.param === 'hz') {
      return `${rawVal} Hz`;
    } else if (kDef.param === 'cents') {
      const semitones = (rawVal - 2048) / 204.8;
      return semitones === 0 ? '0.0 ST' : `${semitones > 0 ? '+' : ''}${semitones.toFixed(1)} ST`;
    } else if (kDef.param === 'ch') {
      return rawVal === 0 ? 'OMNI' : `CH ${rawVal}`;
    } else {
      return `${Math.round(rawVal / 40.95)}%`;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. DOM BUILDER
// ═══════════════════════════════════════════════════════════════════════

function buildModuleEl(type, instanceId, params, leftPx) {
  const def = MODULE_DEFS[type];
  if (!def) return null;

  const hasKnobs = def.knobs && def.knobs.length > 0;
  const isIO = def.category === 'io';
  const mod = el('div', 'module' + (isIO ? ' mod-io' : '') + (hasKnobs ? '' : ' mod-knobless') + (def.hp === 2 ? ' mod-2hp' : ''));
  mod.id = `mod-${instanceId}`;
  mod.dataset.instanceId = instanceId;
  mod.dataset.type = type;
  mod.dataset.category = def.category; // Tag category for visual panel variations
  mod.style.width = (def.hp * HP) + 'px';
  mod.style.left = leftPx + 'px';

  // Screws: slim modules (HP < 6) only get 2 screws per Eurorack standard
  const isSlim = def.hp < 6;
  const screws = isSlim ? ['tl', 'br'] : ['tl', 'tr', 'bl', 'br'];
  for (const pos of screws) {
    const screwEl = el('div', `screw screw-${pos}`);
    const randRot = Math.floor(Math.random() * 360);
    screwEl.style.transform = `rotate(${randRot}deg)`;
    mod.appendChild(screwEl);
  }

  // Header Title on faceplate (positioned below top screws to avoid overlap)
  const title = el('div', 'module-title');
  if (type === 'dx' && params.customVoiceName) {
    title.textContent = `DX: ${params.customVoiceName}`;
    title.title = `DX FM Voice: ${params.customVoiceName}`;
  } else {
    title.textContent = def.title;
    title.title = def.title;
  }

  // Delete
  if (def.deletable !== false) {
    const delBtn = el('button', 'module-del-btn'); delBtn.textContent = '×';
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteModule(instanceId); });
    mod.appendChild(delBtn);
  }

  mod.appendChild(title);
  setupModuleDrag(title, mod, instanceId);

  // Score Player pattern input directly on faceplate
  if (type === 'score-player') {
    const wrap = el('div', 'pattern-input-wrap');
    const label = el('div', 'pattern-input-lbl', { textContent: 'SCORE PATTERN' });
    const input = el('textarea', 'module-pattern-input');
    input.value = params.pattern || '[c4 e4 g4 c5]';
    // Prevent typing from dragging module
    input.addEventListener('pointerdown', e => e.stopPropagation());
    input.addEventListener('mousedown', e => e.stopPropagation());
    input.addEventListener('change', e => {
      const mData = getModuleData(instanceId);
      if (mData) {
        mData.params.pattern = e.target.value;
      }
      generateCode();
    });
    wrap.appendChild(label);
    wrap.appendChild(input);
    mod.appendChild(wrap);
  }

  // Drum Sequencer step grid directly on faceplate
  if (type === 'drum-seq') {
    const gridWrap = el('div', 'drum-seq-grid-wrap');
    const channels = [
      { key: 'kickPat',  label: 'K', def: [1,0,0,0,1,0,0,0] },
      { key: 'snarePat', label: 'S', def: [0,0,1,0,0,0,1,0] },
      { key: 'hatPat',   label: 'H', def: [1,0,1,0,1,0,1,0] },
      { key: 'percPat',  label: 'P', def: [0,1,0,1,0,1,0,1] }
    ];
    for (const chan of channels) {
      const row = el('div', 'drum-seq-row');
      const lbl = el('span', 'drum-seq-row-lbl'); lbl.textContent = chan.label;
      row.appendChild(lbl);

      const pat = params[chan.key] || [...chan.def];
      params[chan.key] = pat;

      for (let stepIdx = 0; stepIdx < 8; stepIdx++) {
        const btn = el('button', 'drum-seq-step-btn' + (pat[stepIdx] ? ' active' : ''));
        btn.dataset.step = stepIdx;
        btn.dataset.channel = chan.key;
        btn.addEventListener('pointerdown', e => e.stopPropagation());
        btn.addEventListener('mousedown', e => e.stopPropagation());
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const mData = getModuleData(instanceId);
          if (mData) {
            if (!mData.params[chan.key]) {
              mData.params[chan.key] = [...chan.def];
            }
            mData.params[chan.key][stepIdx] = mData.params[chan.key][stepIdx] ? 0 : 1;
            btn.classList.toggle('active');
            generateCode();
          }
        });
        row.appendChild(btn);
      }
      gridWrap.appendChild(row);
    }
    mod.appendChild(gridWrap);
  }

  // Knobs: Layout class chosen dynamically (vertical vs grid vs hybrid)
  if (hasKnobs) {
    const layoutType = def.knobLayout || 'vertical';
    if (def.knobs.length === 3 && layoutType === 'vertical') {
      const knobArea = el('div', 'module-knobs knob-layout-hybrid');
      const k1 = def.knobs[0];
      const v1 = params[k1.param] !== undefined ? params[k1.param] : k1.def;
      knobArea.appendChild(buildKnobEl(type, instanceId, k1, v1));

      const row = el('div', 'knob-layout-hybrid-row');
      for (let i = 1; i < 3; i++) {
        const k = def.knobs[i];
        const v = params[k.param] !== undefined ? params[k.param] : k.def;
        row.appendChild(buildKnobEl(type, instanceId, k, v));
      }
      knobArea.appendChild(row);
      mod.appendChild(knobArea);
    } else {
      const isCompact = def.knobs.length > 6;
      const knobArea = el('div', `module-knobs knob-layout-${layoutType}${isCompact ? ' knobs-compact' : ''}`);
      for (const kDef of def.knobs) {
        const val = params[kDef.param] !== undefined ? params[kDef.param] : kDef.def;
        knobArea.appendChild(buildKnobEl(type, instanceId, kDef, val));
      }
      mod.appendChild(knobArea);
    }
  }

  // Ports: Unified grid of input and output jacks
  if (def.inputs.length > 0 || def.outputs.length > 0) {
    const ports = el('div', 'module-ports');
    const totalJacks = def.inputs.length + def.outputs.length;
    const useGrid4 = def.hp >= 10 && totalJacks >= 4;
    const useGrid2 = totalJacks > 2 && def.hp > 2;
    const gridClass = useGrid4 ? ' ports-grid-4' : (useGrid2 ? ' ports-grid-2' : '');
    const inner = el('div', 'ports-col-inner' + gridClass);

    for (const p of def.inputs) {
      inner.appendChild(buildJackEl(instanceId, p.id, p.label, 'input'));
    }
    for (const p of def.outputs) {
      inner.appendChild(buildJackEl(instanceId, p.id, p.label, 'output'));
    }

    ports.appendChild(inner);
    mod.appendChild(ports);
  }

  return mod;
}

function buildKnobEl(type, instanceId, kDef, val) {
  const wrap = el('div', 'knob-wrap');
  const px   = KNOB_PX[kDef.size]  || 30;
  const asset = KNOB_ASSET[kDef.size] || 'mediumKnob';

  const knob = el('div', 'knob');
  knob.id = `knob-${instanceId}-${kDef.param}`;
  knob.dataset.instanceId = instanceId;
  knob.dataset.param = kDef.param;
  knob.dataset.val = val;
  knob.style.width  = px + 'px';
  knob.style.height = px + 'px';
  knob.innerHTML = (typeof FLARE_ASSETS !== 'undefined' && FLARE_ASSETS[asset]) || '';

  const svg = knob.querySelector('svg');
  if (svg) {
    svg.style.width = '100%'; svg.style.height = '100%';
    svg.style.transform = `rotate(${valToAngle(val)}deg)`;
  }

  knob.addEventListener('pointerdown', handleKnobDown);

  const lbl = el('div', 'knob-lbl');
  
  const nameEl = el('span', 'knob-lbl-name'); nameEl.textContent = kDef.label;
  const valEl  = el('span', 'knob-lbl-val'); valEl.textContent = getDisplayValueStr(type, kDef.param, val, instanceId);
  
  lbl.appendChild(nameEl);
  lbl.appendChild(valEl);

  wrap.title = `${kDef.label}: ${valEl.textContent}`;

  wrap.appendChild(knob);
  wrap.appendChild(lbl);
  return wrap;
}

function buildJackEl(instanceId, portId, label, direction) {
  if (portId.startsWith('spacer')) {
    const wrap = el('div', 'jack-wrap spacer-jack');
    wrap.style.visibility = 'hidden';
    wrap.style.pointerEvents = 'none';
    return wrap;
  }
  const wrap = el('div', 'jack-wrap');
  wrap.title = label;
  const lbl  = el('div', 'jack-lbl'); lbl.textContent = label;

  const jack = el('div', `jack jack-${direction}`);
  jack.id = `jack-${instanceId}-${portId}`;
  jack.dataset.instanceId = instanceId;
  jack.dataset.portId     = portId;
  jack.dataset.direction  = direction;
  jack.addEventListener('pointerdown', handleJackDown);

  jack.addEventListener('pointerenter', () => {
    hoveredJack = { instanceId, portId };
    redrawCables();
  });
  jack.addEventListener('pointerleave', () => {
    hoveredJack = null;
    redrawCables();
  });

  wrap.appendChild(lbl);
  wrap.appendChild(jack);
  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════
// 5. RACK ROWS & INITIAL PLACEMENT
// ═══════════════════════════════════════════════════════════════════════

function buildRowEl(rowIndex) {
  const row = el('div', 'rack-row'); row.dataset.rowIndex = rowIndex;
  const railTop = el('div', 'rail top');
  const bay     = el('div', 'module-bay'); bay.id = `bay-${rowIndex}`; bay.dataset.row = rowIndex;
  const railBot = el('div', 'rail bottom');
  row.appendChild(railTop); row.appendChild(bay); row.appendChild(railBot);
  return row;
}

function addRow() {
  const rowIndex = state.rows.length;
  state.rows.push([]);
  const rowEl = buildRowEl(rowIndex);
  $('rackCase').appendChild(rowEl);
  refreshRowButtons();
  updateRowWidths();
  return rowIndex;
}

function getBay(rowIndex) { return $(`bay-${rowIndex}`); }

// Recalculates rail width to expand with added modules, triggering scrollbars
function updateRowWidths() {
  for (let i = 0; i < state.rows.length; i++) {
    const row = state.rows[i];
    const maxRight = row.reduce((max, m) => {
      const def = MODULE_DEFS[m.type];
      const mWidth = (def ? def.hp : 6) * HP;
      return Math.max(max, m.left + mWidth);
    }, 0);
    const bay = getBay(i);
    if (bay) {
      // 120px padding at the end of the rail for spacious visual padding
      bay.style.width = Math.max(1200, maxRight + 120) + 'px';
    }
  }
}

function addModuleToRow(type, rowIndex = 0, params = {}, opts = {}) {
  const def = MODULE_DEFS[type];
  if (!def) return null;

  const id = opts.id || (type.replace(/-/g, '') + (state.nextId++));

  const finalParams = {};
  for (const k of (def.knobs || [])) finalParams[k.param] = k.def;
  // Set default pattern for Score Player
  if (type === 'score-player') finalParams.pattern = '[c4 e4 g4 c5]';
  Object.assign(finalParams, params);

  const leftPx = opts.left !== undefined ? snapToHP(opts.left) : findFreePosition(rowIndex, def.hp);

  if (!state.rows[rowIndex]) state.rows[rowIndex] = [];
  state.rows[rowIndex].push({ id, type, left: leftPx, params: finalParams });

  const modEl = buildModuleEl(type, id, finalParams, leftPx);
  if (modEl) getBay(rowIndex)?.appendChild(modEl);

  // Resolve overlaps immediately on addition
  resolveCollisions(rowIndex, id);

  updateRowWidths();
  generateCode();
  return id;
}

function deleteModule(instanceId) {
  state.cables = state.cables.filter(c => c.fromId !== instanceId && c.toId !== instanceId);
  for (let i = 0; i < state.rows.length; i++) {
    state.rows[i] = state.rows[i].filter(m => m.id !== instanceId);
  }
  $(`mod-${instanceId}`)?.remove();
  updateRowWidths();
  redrawCables(); generateCode();
}

function moveModuleRow(instanceId, delta) {
  const ri = getModuleRowIndex(instanceId);
  if (ri === -1) return;
  const targetRow = ri + delta;
  if (targetRow < 0 || targetRow >= state.rows.length) return;

  const mIdx = state.rows[ri].findIndex(m => m.id === instanceId);
  const [mData] = state.rows[ri].splice(mIdx, 1);
  
  const def = MODULE_DEFS[mData.type];
  mData.left = findFreePosition(targetRow, def ? def.hp : 6);
  state.rows[targetRow].push(mData);

  const modEl = $(`mod-${instanceId}`);
  if (modEl) {
    modEl.style.left = mData.left + 'px';
    getBay(targetRow)?.appendChild(modEl);
  }

  // Resolve overlaps in target row immediately
  resolveCollisions(targetRow, instanceId);

  refreshRowButtons(); updateRowWidths(); redrawCables(); generateCode();
}

function refreshRowButtons() {
  const multiRow = state.rows.length > 1;
  document.querySelectorAll('.module-row-btns').forEach(b => {
    b.style.display = multiRow ? '' : 'none';
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 6. MODULE DRAGGING, COLLISION RESOLUTION, & RAIL PHYSICS
// ═══════════════════════════════════════════════════════════════════════

let activeDrag = null;

function setupModuleDrag(handleEl, modEl, instanceId) {
  handleEl.addEventListener('pointerdown', e => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    e.preventDefault();
    handleEl.setPointerCapture(e.pointerId);

    const mData = getModuleData(instanceId);
    const rowIdx = getModuleRowIndex(instanceId);
    const def = MODULE_DEFS[mData.type];

    modEl.classList.add('is-dragging');

    activeDrag = {
      instanceId,
      modEl,
      startX: e.clientX,
      startLeft: mData ? (mData.left || 0) : 0,
      rowIdx,
      hpWidth: def ? def.hp : 6,
      startPositions: state.rows[rowIdx].reduce((map, m) => {
        map[m.id] = m.left || 0;
        return map;
      }, {})
    };

    document.addEventListener('pointermove', handleModuleMove);
    document.addEventListener('pointerup',   handleModuleUp);
  });
}

function handleModuleMove(e) {
  if (!activeDrag) return;

  // Find which row the mouse is hovering over using their client bounds
  let targetRow = activeDrag.rowIdx;
  const rowElements = document.querySelectorAll('.rack-row');
  for (const rowEl of rowElements) {
    const rect = rowEl.getBoundingClientRect();
    if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
      const idxAttr = parseInt(rowEl.dataset.rowIndex);
      if (!isNaN(idxAttr)) {
        targetRow = idxAttr;
      }
      break;
    }
  }

  if (targetRow !== activeDrag.rowIdx) {
    // Remove from old row
    const currentRi = activeDrag.rowIdx;
    const idx = state.rows[currentRi].findIndex(m => m.id === activeDrag.instanceId);
    if (idx !== -1) {
      const mData = state.rows[currentRi].splice(idx, 1)[0];
      // Clean up old row alignment
      packRowTightly(currentRi);

      // Place in new row and reset the drag reference point so the module
      // doesn't teleport — it stays under the pointer after the row switch.
      const newLeft = findFreePosition(targetRow, activeDrag.hpWidth);
      mData.left = newLeft;
      state.rows[targetRow].push(mData);
      activeDrag.startPositions = state.rows[targetRow].reduce((map, m) => {
        map[m.id] = m.left || 0;
        return map;
      }, {});
      activeDrag.rowIdx = targetRow;
      activeDrag.startX = e.clientX;
      activeDrag.startLeft = newLeft;

      const bay = getBay(targetRow);
      if (bay) bay.appendChild(activeDrag.modEl);
    }
  }

  // Get the current bay's width to clamp visual dragging
  const bay = getBay(activeDrag.rowIdx);
  const bayWidth = bay ? (parseInt(bay.style.width) || bay.getBoundingClientRect().width) : 1200;
  const dragWidthPx = activeDrag.hpWidth * HP;
  const maxLeft = Math.max(0, bayWidth - dragWidthPx);

  const dx = e.clientX - activeDrag.startX;
  let newLeft = activeDrag.startLeft + dx;
  newLeft = Math.max(0, Math.min(maxLeft, newLeft));

  // Update DOM style immediately so the module follows the pointer smoothly
  activeDrag.modEl.style.left = newLeft + 'px';

  // Resolve collisions in the current row (slide physics)
  resolveCollisions(activeDrag.rowIdx, activeDrag.instanceId);

  updateRowWidths();
  redrawCables();
  // NOTE: No generateCode() here — module positions do NOT affect the graph.
}

function handleModuleUp(e) {
  if (!activeDrag) return;
  document.removeEventListener('pointermove', handleModuleMove);
  document.removeEventListener('pointerup',   handleModuleUp);

  activeDrag.modEl.classList.remove('is-dragging');

  const mData = getModuleData(activeDrag.instanceId);
  if (mData) {
    mData.left = snapToHP(parseInt(activeDrag.modEl.style.left) || 0);
    activeDrag.modEl.style.left = mData.left + 'px';
  }

  // Resolve overlaps globally for the row to clean up any snapping overlaps
  resolveCollisions(activeDrag.rowIdx, null);

  activeDrag = null;
  updateRowWidths();
  redrawCables();
  generateCode(); // Only fires on drop — positions are now final
}

// Solid-box slide collision avoidance physics on Eurorack rails (allows gaps)

function packRowTightly(rowIndex) {
  resolveCollisions(rowIndex, null);
}

function resolveCollisions(rowIndex, draggedId) {
  const row = state.rows[rowIndex];
  if (!row) return;

  const draggedM = row.find(m => m.id === draggedId);
  if (!draggedM) {
    // No active drag: only push apart modules that actually overlap.
    // Modules that don't overlap keep their existing positions (gaps preserved).
    const sorted = [...row].sort((a, b) => (a.left || 0) - (b.left || 0));
    let minLeft = 0; // the minimum allowed left edge for the next module
    for (const m of sorted) {
      const mDef = MODULE_DEFS[m.type];
      const mWidth = (mDef ? mDef.hp : 6) * HP;
      // Snap to HP grid but never overlap the previous module's right edge
      m.left = Math.max(minLeft, snapToHP(m.left || 0));
      const el = $('mod-' + m.id);
      if (el) el.style.left = m.left + 'px';
      minLeft = m.left + mWidth; // next module must start at least here
    }
    state.rows[rowIndex] = sorted;
    return;
  }

  const dragDef = MODULE_DEFS[draggedM.type];
  const dragWidth = (dragDef ? dragDef.hp : 6) * HP;
  const rawLeft = (activeDrag && activeDrag.modEl && activeDrag.instanceId === draggedId)
    ? (parseInt(activeDrag.modEl.style.left) || 0)
    : (draggedM.left || 0);

  const startPos = (activeDrag && activeDrag.instanceId === draggedId && activeDrag.startPositions)
    ? activeDrag.startPositions
    : {};

  // Sort by center-X using the static startPositions for stationary modules
  const sorted = [...row].sort((a, b) => {
    const aDef = MODULE_DEFS[a.type];
    const bDef = MODULE_DEFS[b.type];
    const aWidth = (aDef ? aDef.hp : 6) * HP;
    const bWidth = (bDef ? bDef.hp : 6) * HP;
    const aLeft = (a.id === draggedId) ? rawLeft : (startPos[a.id] ?? a.left ?? 0);
    const bLeft = (b.id === draggedId) ? rawLeft : (startPos[b.id] ?? b.left ?? 0);
    return (aLeft + aWidth / 2) - (bLeft + bWidth / 2);
  });

  state.rows[rowIndex] = sorted;

  // Find target dragged index
  const k = sorted.findIndex(m => m.id === draggedId);

  // Position the dragged module
  draggedM.left = rawLeft;
  const draggedEl = $('mod-' + draggedId);
  if (draggedEl) draggedEl.style.left = rawLeft + 'px';

  // Push modules to the left of the dragged module (right-to-left processing)
  for (let i = k - 1; i >= 0; i--) {
    const m = sorted[i];
    const mDef = MODULE_DEFS[m.type];
    const mWidth = (mDef ? mDef.hp : 6) * HP;
    const rightBound = sorted[i + 1].left;
    const origLeft = startPos[m.id] ?? m.left ?? 0;
    m.left = Math.max(0, Math.min(origLeft, rightBound - mWidth));
    const el = $('mod-' + m.id);
    if (el) el.style.left = m.left + 'px';
  }

  // Push modules to the right of the dragged module (left-to-right processing)
  for (let i = k + 1; i < sorted.length; i++) {
    const m = sorted[i];
    const prevM = sorted[i - 1];
    const prevDef = MODULE_DEFS[prevM.type];
    const prevWidth = (prevDef ? prevDef.hp : 6) * HP;
    const leftBound = prevM.left + prevWidth;
    const origLeft = startPos[m.id] ?? m.left ?? 0;
    m.left = Math.max(leftBound, origLeft);
    const el = $('mod-' + m.id);
    if (el) el.style.left = m.left + 'px';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 8. CONTEXT MENUS (Right-click handling)
// ═══════════════════════════════════════════════════════════════════════

function closeContextMenu() {
  if (currentContextMenu) {
    currentContextMenu.remove();
    currentContextMenu = null;
  }
}

function openDx7ImportForModule(instanceId) {
  const mData = getModuleData(instanceId);
  if (!mData) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.syx';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) {
      fileInput.remove();
      return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
      const buf = new Uint8Array(evt.target.result);
      try {
        const voices = parseDx7Bank(buf);
        showVoiceSelectionModal(voices, (voice, voiceIdx) => {
          // Store voice data in this module instance params!
          mData.params.customVoiceData = Array.from(voice.data);
          mData.params.customVoiceName = voice.name.trim();

          // Refresh the module faceplate to display the voice name!
          const oldDom = $(`mod-${instanceId}`);
          if (oldDom) {
            const newDom = buildModuleEl('dx', instanceId, mData.params, parseInt(oldDom.style.left));
            oldDom.replaceWith(newDom);
          }
          
          redrawCables();
          generateCode();
        });
      } catch (err) {
        alert('Failed to parse DX7 bank: ' + err.message);
      }
      fileInput.remove();
    };
    reader.readAsArrayBuffer(file);
  });
  fileInput.click();
}

function showContextMenu(e) {
  e.preventDefault();
  closeContextMenu();

  const jackEl = e.target.closest('.jack');
  if (jackEl) {
    const instanceId = jackEl.dataset.instanceId;
    const portId = jackEl.dataset.portId;
    const allMods = state.rows.flat();

    // Find all cables touching this jack (either end)
    const touchingCables = state.cables.filter(c =>
      (c.fromId === instanceId && c.fromPort === portId) ||
      (c.toId   === instanceId && c.toPort   === portId)
    );

    if (touchingCables.length === 0) return; // nothing to disconnect

    const menu = el('div', 'context-menu');
    menu.style.left = e.clientX + 'px';
    menu.style.top  = e.clientY + 'px';

    const header = el('div', 'context-menu-header', { textContent: 'Disconnect:' });
    menu.appendChild(header);

    for (const cable of touchingCables) {
      // Describe the other end of the cable
      const otherId   = cable.fromId === instanceId && cable.fromPort === portId ? cable.toId   : cable.fromId;
      const otherPort = cable.fromId === instanceId && cable.fromPort === portId ? cable.toPort : cable.fromPort;
      const otherMod  = allMods.find(m => m.id === otherId);
      const otherDef  = otherMod ? MODULE_DEFS[otherMod.type] : null;
      const otherLabel = otherDef ? otherDef.title : otherId;
      const portLabel  = otherPort.replace(/-/g, ' ').toUpperCase();

      const item = el('div', 'context-menu-item');
      item.textContent = `→ ${otherLabel} · ${portLabel}`;
      item.addEventListener('click', () => {
        state.cables = state.cables.filter(c =>
          !(c.fromId === cable.fromId && c.fromPort === cable.fromPort &&
            c.toId   === cable.toId   && c.toPort   === cable.toPort));
        redrawCables(); generateCode();
        closeContextMenu();
      });
      menu.appendChild(item);
    }

    if (touchingCables.length > 1) {
      const sep = el('div', 'context-menu-sep');
      menu.appendChild(sep);
      const allItem = el('div', 'context-menu-item context-menu-item-danger', { textContent: 'Disconnect All' });
      allItem.addEventListener('click', () => {
        state.cables = state.cables.filter(c =>
          !((c.fromId === instanceId && c.fromPort === portId) ||
            (c.toId   === instanceId && c.toPort   === portId)));
        redrawCables(); generateCode();
        closeContextMenu();
      });
      menu.appendChild(allItem);
    }

    document.body.appendChild(menu);
    currentContextMenu = menu;
    return;
  }

  const modEl = e.target.closest('.module');
  const bayEl = e.target.closest('.module-bay');

  if (modEl) {
    // Module Right-click Context Menu
    const instanceId = modEl.dataset.instanceId;
    const def = MODULE_DEFS[modEl.dataset.type];

    const menu = el('div', 'context-menu');
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    if (modEl.dataset.type === 'dx') {
      const importItem = el('div', 'context-menu-item', { textContent: 'Import DX7 Voice (.syx)...' });
      importItem.addEventListener('click', () => {
        openDx7ImportForModule(instanceId);
        closeContextMenu();
      });
      menu.appendChild(importItem);

      const mData = getModuleData(instanceId);
      if (mData && mData.params.customVoiceData) {
        const clearItem = el('div', 'context-menu-item context-menu-item-danger', { textContent: 'Clear Custom Voice' });
        clearItem.addEventListener('click', () => {
          delete mData.params.customVoiceData;
          delete mData.params.customVoiceName;
          const oldDom = $(`mod-${instanceId}`);
          if (oldDom) {
            const newDom = buildModuleEl('dx', instanceId, mData.params, parseInt(oldDom.style.left));
            oldDom.replaceWith(newDom);
          }
          redrawCables(); generateCode(); closeContextMenu();
        });
        menu.appendChild(clearItem);
      }
      const sep = el('div', 'context-menu-sep');
      menu.appendChild(sep);
    }

    if (def?.deletable !== false) {
      const delItem = el('div', 'context-menu-item', { textContent: 'Delete Module' });
      delItem.addEventListener('click', () => { deleteModule(instanceId); closeContextMenu(); });
      menu.appendChild(delItem);
    }

    if (state.rows.length > 1) {
      const upItem = el('div', 'context-menu-item', { textContent: 'Move Row Up' });
      upItem.addEventListener('click', () => { moveModuleRow(instanceId, -1); closeContextMenu(); });
      const dnItem = el('div', 'context-menu-item', { textContent: 'Move Row Down' });
      dnItem.addEventListener('click', () => { moveModuleRow(instanceId, 1); closeContextMenu(); });
      menu.appendChild(upItem);
      menu.appendChild(dnItem);
    }

    document.body.appendChild(menu);
    currentContextMenu = menu;
  } else if (bayEl) {
    // Empty Bay Right-click Context Menu (Place module directly at snapped clicked position)
    const rowIndex = parseInt(bayEl.dataset.row);
    lastActiveRow = rowIndex; // Track which row the user is working in
    const rect = bayEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left + $('rackViewport').scrollLeft;
    const hpX = snapToHP(clickX);

    const menu = el('div', 'context-menu');
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    for (const cat of CATEGORY_ORDER) {
      const mods = Object.entries(MODULE_DEFS).filter(([k, v]) => v.category === cat);
      if (mods.length === 0) continue;

      const catItem = el('div', 'context-menu-item');
      catItem.textContent = CATEGORY_LABELS[cat];

      const arrow = el('span', '', { textContent: '▶', style: 'font-size: 8px; opacity: 0.5;' });
      catItem.appendChild(arrow);

      const submenu = el('div', 'context-menu-submenu');
      for (const [key, def] of mods) {
        const modItem = el('div', 'context-menu-item', { textContent: def.title });
        modItem.addEventListener('click', () => {
          addModuleToRow(key, rowIndex, {}, { left: hpX });
        });
        submenu.appendChild(modItem);
      }
      catItem.appendChild(submenu);
      menu.appendChild(catItem);
    }

    document.body.appendChild(menu);
    currentContextMenu = menu;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 9. KNOBS & INTERACTION
// ═══════════════════════════════════════════════════════════════════════

let knobState = null;

function handleKnobDown(e) {
  e.stopPropagation();
  e.preventDefault();
  const knob = e.currentTarget;
  knob.setPointerCapture(e.pointerId);

  const modData = getModuleData(knob.dataset.instanceId);
  const param   = knob.dataset.param;
  const startVal = modData ? (modData.params[param] ?? 2048) : 2048;

  knobState = {
    knob, svg: knob.querySelector('svg'),
    instanceId: knob.dataset.instanceId,
    param, startVal, startY: e.clientY,
    val: startVal,
  };

  knob.addEventListener('pointermove', handleKnobMove);
  knob.addEventListener('pointerup',   handleKnobUp);
}

function handleKnobMove(e) {
  if (!knobState || e.currentTarget !== knobState.knob) return;
  const dy = knobState.startY - e.clientY;
  const sensitivity = e.shiftKey ? 1 : 8;
  const val = Math.max(0, Math.min(4095, knobState.startVal + dy * sensitivity));
  knobState.val = val;
  knobState.knob.dataset.val = val;
  if (knobState.svg) knobState.svg.style.transform = `rotate(${valToAngle(val)}deg)`;

  const modData = getModuleData(knobState.instanceId);
  if (modData) modData.params[knobState.param] = val;

  // Real-time parameter value display updates
  const valEl = knobState.knob.parentNode.querySelector('.knob-lbl-val');
  if (valEl) {
    const displayVal = getDisplayValueStr(modData.type, knobState.param, val, knobState.instanceId);
    valEl.textContent = displayVal;
    
    // Update wrapper tooltip
    const wrap = knobState.knob.parentNode;
    const nameEl = wrap.querySelector('.knob-lbl-name');
    const labelText = nameEl ? nameEl.textContent : knobState.param;
    wrap.title = `${labelText}: ${displayVal}`;
  }

  // Reactive DX7 bank/preset updates
  if (knobState.param === 'bank' && modData.type === 'dx') {
    const moduleEl = knobState.knob.closest('.module');
    if (moduleEl) {
      const presetKnob = moduleEl.querySelector('[data-param="preset"]');
      if (presetKnob) {
        const pValEl = presetKnob.parentNode.querySelector('.knob-lbl-val');
        const rawPreset = modData.params.preset ?? 0;
        if (pValEl) {
          pValEl.textContent = getDisplayValueStr('dx', 'preset', rawPreset, knobState.instanceId);
        }
      }
    }
  }

  const mapKey = `${knobState.instanceId}.${knobState.param}`;
  const map = knobConstantMap[mapKey];
  const scaledVal = getConstantValueForKnob(modData, knobState.param, val);

  console.log('[Knob Drag]', {
    mapKey,
    val,
    scaledVal,
    hasMap: !!map,
    constIdx: map ? map.const_idx : null,
    hasMidiOut: !!midiOut,
    hasLastUploadedSnapshot: !!lastUploadedSnapshot
  });

  if (midiOut && lastUploadedSnapshot && map && map.size === 4) {
    const constIdx = map.const_idx;
    const targetOffset = map.byte_offset;
    
    lastUploadedSnapshot[targetOffset] = scaledVal & 0xFF;
    lastUploadedSnapshot[targetOffset + 1] = (scaledVal >> 8) & 0xFF;
    lastUploadedSnapshot[targetOffset + 2] = (scaledVal >> 16) & 0xFF;
    lastUploadedSnapshot[targetOffset + 3] = (scaledVal >> 24) & 0xFF;

    const newCrc32 = Lens.crc32(lastUploadedSnapshot.slice(0, lastUploadedSnapshot.length - 4));
    
    lastUploadedSnapshot[lastUploadedSnapshot.length - 4] = newCrc32 & 0xFF;
    lastUploadedSnapshot[lastUploadedSnapshot.length - 3] = (newCrc32 >> 8) & 0xFF;
    lastUploadedSnapshot[lastUploadedSnapshot.length - 2] = (newCrc32 >> 16) & 0xFF;
    lastUploadedSnapshot[lastUploadedSnapshot.length - 1] = (newCrc32 >> 24) & 0xFF;

    const payload = new Uint8Array(11);
    payload[0] = constIdx;
    payload[1] = scaledVal & 0xFF;
    payload[2] = (scaledVal >> 8) & 0xFF;
    payload[3] = (scaledVal >> 16) & 0xFF;
    payload[4] = (scaledVal >> 24) & 0xFF;
    payload[5] = targetOffset & 0xFF;
    payload[6] = (targetOffset >> 8) & 0xFF;
    payload[7] = newCrc32 & 0xFF;
    payload[8] = (newCrc32 >> 8) & 0xFF;
    payload[9] = (newCrc32 >> 16) & 0xFF;
    payload[10] = (newCrc32 >> 24) & 0xFF;

    midiOut.send([...Lens.frame(Lens.CMD.UPDATE_CONST, payload)]);
  }
}

function handleKnobUp(e) {
  if (!knobState) return;
  const knob = knobState.knob;
  knob.removeEventListener('pointermove', handleKnobMove);
  knob.removeEventListener('pointerup',   handleKnobUp);
  knobState = null;
  generateCode();
}

// ═══════════════════════════════════════════════════════════════════════
// 10. CABLE OVERLAY (Fixed SVG Screen Space)
// ═══════════════════════════════════════════════════════════════════════

let cableDrag = null;

function cableColor(fromType, fromPort, toType, toPort) {
  const fType = (fromType || '').toLowerCase();
  const fPort = (fromPort || '').toLowerCase();
  const tType = (toType || '').toLowerCase();
  const tPort = (toPort || '').toLowerCase();
  const all = [fType, fPort, tType, tPort].join(' ');

  // Pitch / V/OCT -> Green
  if (all.includes('v-oct') || all.includes('pitch') || fPort === 'note' || tPort === 'note') {
    return '#4cd137';
  }
  // Clocks / Gates / Triggers -> Gold/Yellow
  if (all.includes('trig') || all.includes('gate') || all.includes('clock') || all.includes('sync') || all.includes('pulse') || fPort === 'euclid' || fPort === 'every') {
    return '#ffb900';
  }
  // Audio -> Coral Red
  const audioModules = ['sine', 'triangle', 'saw', 'square', 'phasor', 'wt', 'noise', 'pluck', 'kick', 'snare', 'hat', 'dx', 'delay', 'reverb', 'lpf', 'hpf', 'vcf', 'lpg', 'tape-looper'];
  if (all.includes('audio') || fPort === 'out' || fPort === 'out1' || fPort === 'out2' || fPort === 'lp' || fPort === 'hp' || fPort === 'bp' || fPort === 'notch' || audioModules.includes(fType) || audioModules.includes(tType)) {
    return '#ff4d4d';
  }
  // Modulations / CV -> Neon Cyan
  return '#00d2ff';
}

function handleJackDown(e) {
  if (e.button !== 0) return; // Only trigger for left clicks

  e.stopPropagation();
  e.preventDefault();
  const jack = e.currentTarget;
  jack.setPointerCapture(e.pointerId);

  const iId   = jack.dataset.instanceId;
  const pId   = jack.dataset.portId;
  const dir   = jack.dataset.direction;

  // Clicking an occupied INPUT lifts the cable, holding the output end free for re-patch
  if (dir === 'input') {
    const cIdx = state.cables.findIndex(c => c.toId === iId && c.toPort === pId);
    if (cIdx !== -1) {
      const removed = state.cables.splice(cIdx, 1)[0];
      const fromJack = $(`jack-${removed.fromId}-${removed.fromPort}`);
      if (fromJack) {
        cableDrag = {
          fromId: removed.fromId, fromPort: removed.fromPort,
          fromEl: fromJack, curX: e.clientX, curY: e.clientY,
        };
        fromJack.classList.add('active');
        document.addEventListener('pointermove', handleJackMove);
        document.addEventListener('pointerup',   handleJackUp);
        redrawCables(); generateCode();
      }
      return;
    }
  }

  // Clicking an occupied OUTPUT with exactly one cable: lift it, holding the output end
  if (dir === 'output') {
    const existingCables = state.cables.filter(c => c.fromId === iId && c.fromPort === pId);
    if (existingCables.length === 1) {
      const removed = existingCables[0];
      state.cables = state.cables.filter(c =>
        !(c.fromId === removed.fromId && c.fromPort === removed.fromPort &&
          c.toId   === removed.toId   && c.toPort   === removed.toPort));
      cableDrag = { fromId: iId, fromPort: pId, fromEl: jack, curX: e.clientX, curY: e.clientY };
      jack.classList.add('active');
      document.addEventListener('pointermove', handleJackMove);
      document.addEventListener('pointerup',   handleJackUp);
      redrawCables(); generateCode();
      return;
    }
  }

  // Default: start a new cable from this jack
  cableDrag = { fromId: iId, fromPort: pId, fromEl: jack, curX: e.clientX, curY: e.clientY };
  jack.classList.add('active');
  document.addEventListener('pointermove', handleJackMove);
  document.addEventListener('pointerup',   handleJackUp);
}

function handleJackMove(e) {
  if (!cableDrag) return;
  cableDrag.curX = e.clientX; cableDrag.curY = e.clientY;

  document.querySelectorAll('.jack.snap-target').forEach(j => j.classList.remove('snap-target'));
  document.querySelectorAll('.jack.drag-incompatible').forEach(j => j.classList.remove('drag-incompatible'));
  const snap = findSnapJack(e.clientX, e.clientY);
  if (snap) snap.classList.add('snap-target');

  // Dim jacks that cannot be connected to from the current drag source
  document.querySelectorAll('.jack').forEach(j => {
    if (j === cableDrag.fromEl) return;
    if (!canConnect(cableDrag.fromEl, j)) {
      j.classList.add('drag-incompatible');
    }
  });

  redrawCables();
}

function handleJackUp(e) {
  if (!cableDrag) return;
  document.removeEventListener('pointermove', handleJackMove);
  document.removeEventListener('pointerup',   handleJackUp);

  try {
    if (cableDrag.fromEl) cableDrag.fromEl.releasePointerCapture(e.pointerId);
  } catch (err) {}

  if (cableDrag.fromEl) cableDrag.fromEl.classList.remove('active');
  document.querySelectorAll('.jack.snap-target').forEach(j => j.classList.remove('snap-target'));
  document.querySelectorAll('.jack.drag-incompatible').forEach(j => j.classList.remove('drag-incompatible'));

  const snap = findSnapJack(e.clientX, e.clientY);
  if (snap && canConnect(cableDrag.fromEl, snap)) {
    const srcJack  = cableDrag.fromEl.dataset.direction === 'output' ? cableDrag.fromEl : snap;
    const destJack = cableDrag.fromEl.dataset.direction === 'input'  ? cableDrag.fromEl : snap;

    state.cables = state.cables.filter(c => !(c.toId === destJack.dataset.instanceId && c.toPort === destJack.dataset.portId));

    state.cables.push({
      fromId: srcJack.dataset.instanceId,  fromPort: srcJack.dataset.portId,
      toId:   destJack.dataset.instanceId, toPort:   destJack.dataset.portId,
      color: cableColor(srcJack.dataset.instanceId, srcJack.dataset.portId,
                        destJack.dataset.instanceId, destJack.dataset.portId),
    });
  }

  cableDrag = null;
  redrawCables(); generateCode();
}

function canConnect(j1, j2) {
  if (j1.dataset.direction === j2.dataset.direction) return false;
  if (j1.dataset.instanceId === j2.dataset.instanceId) return false;
  return true;
}

// Find closest jack socket to screen coordinate
function findSnapJack(x, y) {
  let best = null, bestDist = 35; // Increased snap target range to 35px for easier magnetic patching
  document.querySelectorAll('.jack').forEach(j => {
    if (cableDrag && j === cableDrag.fromEl) return;
    const r = j.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestDist) { bestDist = d; best = j; }
  });
  return best;
}

// Fixed canvas screen space render
function redrawCables() {
  const svg = $('cableSvg');
  while (svg.firstChild) svg.firstChild.remove();

  // Count connections per jack to distribute stacked endpoints and sags
  const jackCounts = {};
  for (const c of state.cables) {
    const fromKey = `${c.fromId}-${c.fromPort}`;
    const toKey = `${c.toId}-${c.toPort}`;
    jackCounts[fromKey] = (jackCounts[fromKey] || 0) + 1;
    jackCounts[toKey] = (jackCounts[toKey] || 0) + 1;
  }

  const jackCurrentIndex = {};

  for (const c of state.cables) {
    const fromEl = $(`jack-${c.fromId}-${c.fromPort}`);
    const toEl   = $(`jack-${c.toId}-${c.toPort}`);
    if (fromEl && toEl) {
      const fromKey = `${c.fromId}-${c.fromPort}`;
      const toKey = `${c.toId}-${c.toPort}`;

      const fromCount = jackCounts[fromKey] || 1;
      const toCount = jackCounts[toKey] || 1;

      const fromIdx = jackCurrentIndex[fromKey] || 0;
      jackCurrentIndex[fromKey] = fromIdx + 1;

      const toIdx = jackCurrentIndex[toKey] || 0;
      jackCurrentIndex[toKey] = toIdx + 1;

      let dim = false;
      let glow = false;
      if (hoveredJack) {
        const matchesFrom = (c.fromId === hoveredJack.instanceId && c.fromPort === hoveredJack.portId);
        const matchesTo   = (c.toId === hoveredJack.instanceId && c.toPort === hoveredJack.portId);
        if (matchesFrom || matchesTo) {
          glow = true;
        } else {
          dim = true;
        }
      }

      drawCablePath(svg, fromEl, toEl, c.color, false, fromIdx, fromCount, toIdx, toCount, dim, glow);
    }
  }

  if (cableDrag) {
    const r  = cableDrag.fromEl.getBoundingClientRect();
    const x1 = r.left + r.width/2, y1 = r.top + r.height/2;
    drawCablePathXY(svg, x1, y1, cableDrag.curX, cableDrag.curY, '#666', true, 0);
  }
}

function drawCablePath(svg, fromEl, toEl, color, dashed, fromIdx = 0, fromCount = 1, toIdx = 0, toCount = 1, dim = false, glow = false) {
  const r1 = fromEl.getBoundingClientRect();
  const r2 = toEl.getBoundingClientRect();

  const x1_ctr = r1.left + r1.width/2;
  const y1_ctr = r1.top + r1.height/2;
  const x2_ctr = r2.left + r2.width/2;
  const y2_ctr = r2.top + r2.height/2;

  // Offset stacked plugs circularly around the jack center
  let x1 = x1_ctr, y1 = y1_ctr;
  if (fromCount > 1) {
    const angle = (fromIdx * 2 * Math.PI) / fromCount;
    x1 += Math.cos(angle) * 3.5;
    y1 += Math.sin(angle) * 3.5;
  }

  let x2 = x2_ctr, y2 = y2_ctr;
  if (toCount > 1) {
    const angle = (toIdx * 2 * Math.PI) / toCount;
    x2 += Math.cos(angle) * 3.5;
    y2 += Math.sin(angle) * 3.5;
  }

  // Vary sag to fan out paths in the middle
  const sagOffset = (fromIdx - (fromCount - 1) / 2) * 12;

  drawCablePathXY(svg, x1, y1, x2, y2, color, dashed, sagOffset, dim, glow);
}

function drawCablePathXY(svg, x1, y1, x2, y2, color, dashed, sagOffset = 0, dim = false, glow = false) {
  const dist = Math.hypot(x2-x1, y2-y1);
  const sag  = Math.max(30, dist * 0.28) + sagOffset;
  const d    = `M${x1},${y1} C${x1},${y1+sag} ${x2},${y2+sag} ${x2},${y2}`;
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', glow ? '5.5' : '4');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  
  if (dashed) {
    path.setAttribute('stroke-dasharray', '6 4');
    path.style.filter = 'drop-shadow(0 3px 5px rgba(0,0,0,.6))';
    svg.appendChild(path);
  } else {
    // 1. Base glow path (adds depth)
    const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glowPath.setAttribute('d', d);
    glowPath.setAttribute('stroke', color);
    glowPath.setAttribute('stroke-width', glow ? '11' : '7');
    glowPath.setAttribute('fill', 'none');
    glowPath.setAttribute('stroke-linecap', 'round');
    glowPath.style.opacity = dim ? '0.05' : (glow ? '0.6' : '0.3');
    glowPath.style.filter = 'blur(2px)';
    svg.appendChild(glowPath);

    // 2. Core colored cable path
    path.style.opacity = dim ? '0.15' : '1.0';
    path.style.filter = glow ? 'drop-shadow(0 3px 6px rgba(0,0,0,.4))' : 'drop-shadow(0 3px 5px rgba(0,0,0,.5))';
    svg.appendChild(path);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 11. MODULE BROWSER
// ═══════════════════════════════════════════════════════════════════════

function buildBrowser() {
  const grid = $('browserGrid');
  grid.innerHTML = '';

  const query = ($('browserSearch')?.value || '').toLowerCase();

  for (const cat of CATEGORY_ORDER) {
    const mods = Object.entries(MODULE_DEFS)
      .filter(([k, v]) => v.category === cat && (
        !query || k.includes(query) || v.title.toLowerCase().includes(query)
      ));
    if (mods.length === 0) continue;

    const catEl = el('div', 'browser-cat');
    const title = el('div', 'browser-cat-title'); title.textContent = CATEGORY_LABELS[cat];
    catEl.appendChild(title);

    const modsEl = el('div', 'browser-cat-modules');
    for (const [key, def] of mods) {
      const btn = el('button', 'browser-mod-btn');
      btn.textContent = def.title;
      btn.title = `${def.hp} HP`;
      btn.addEventListener('click', () => {
        addModuleToRow(key, lastActiveRow);
        closeBrowser();
      });
      modsEl.appendChild(btn);
    }

    catEl.appendChild(modsEl);
    grid.appendChild(catEl);
  }
}

function openBrowser()  {
  $('browserPanel').classList.add('open');
  $('browserSearch').focus();
  buildBrowser();
}
function closeBrowser() { $('browserPanel').classList.remove('open'); }

// ═══════════════════════════════════════════════════════════════════════
// 12. CODE GENERATION
// ═══════════════════════════════════════════════════════════════════════


function getPitchCenter(type, param) {
  if (param === 'pitch') return 60; // default raw 1935 is C4 (60)
  if (param === 'note') {
    if (type === 'kick') return 36;   // default raw 1161 is C2 (36)
    if (type === 'snare') return 45;  // default raw 1451 is A2 (45)
    if (type === 'hat') return 80;    // default raw 2580 is G#5 (80)
    return 60;
  }
  return 0;
}

function getCabledSourceExpr(cable, allMods) {
  if (!cable) return '0';
  const fromMod = allMods.find(m => m.id === cable.fromId);
  if (!fromMod) return '0';
  
  // Scale raw CV signals (0..4095) to pitch semitones (0..127) using spread when cabled to V/OCT or FM.
  // Do NOT scale sources that already output MIDI note integers.
  const isPitchInput = cable.toPort === 'note' || cable.toPort === 'pitch' || cable.toPort === 'fm' || cable.toPort === 'pitch1' || cable.toPort === 'pitch2';
  const isPitchSource = (fromMod.type === 'score-player' && cable.fromPort === 'note') ||
                        (fromMod.type === 'midi-note'    && cable.fromPort === 'note') ||
                        (fromMod.type === 'turing'       && cable.fromPort === 'out')  ||
                        (fromMod.type === 'step-seq'     && cable.fromPort === 'out');  // lens stores MIDI notes directly

  let expr;
  if (MODULE_DEFS[fromMod.type]?.isHW) {
    if (isPitchInput && (cable.fromPort === 'cv-in-1' || cable.fromPort === 'cv-in-2')) {
      const num = cable.fromPort === 'cv-in-1' ? '1' : '2';
      expr = `(cv-in :${num} :v-oct)`;
    } else {
      expr = LENS_PORTS[cable.fromPort] || '0';
    }
  } else {
    const fromDef = MODULE_DEFS[fromMod.type];
    if (fromDef?.isMacro) {
      expr = `${cable.fromId}${cable.fromPort}`;
    } else {
      const fromPorts = fromDef?.outputs || [];
      const isDefaultOut = fromPorts.length === 1 || cable.fromPort === 'out';
      expr = isDefaultOut ? cable.fromId : `(${cable.fromId} :${cable.fromPort})`;
    }
  }

  const isDirectPitchSource = isPitchSource || (fromMod.type === 'ws-in' && (cable.fromPort === 'cv-in-1' || cable.fromPort === 'cv-in-2'));
  if (isPitchInput && !isDirectPitchSource) {
    return `(spread ${expr} 128)`;
  }
  if (!isPitchInput && isPitchSource) {
    return `(spread ${expr} 132071)`;
  }
  return expr;
}

function generateCode(textOnly = false) {
  const lines  = ['; generated by flare', '(patch'];
  const allMods = state.rows.flat();

  // 1. Trace active modules backward from output sinks and MIDI outputs (Unconnected Modules Skip Pass)
  const activeIds = new Set();
  const sinks = allMods.filter(m => {
    const d = MODULE_DEFS[m.type];
    return d?.isHW || m.type === 'midi-note-out' || m.type === 'midi-cc-out' || m.type === 'midi-clock-out';
  });

  const activeQueue = [];
  for (const s of sinks) {
    activeIds.add(s.id);
    activeQueue.push(s.id);
  }

  while (activeQueue.length > 0) {
    const currentId = activeQueue.shift();
    const incoming = state.cables.filter(c => c.toId === currentId);
    for (const c of incoming) {
      if (!activeIds.has(c.fromId)) {
        activeIds.add(c.fromId);
        activeQueue.push(c.fromId);
      }
    }
  }

  // Kahn's Topological Sort
  const adj = {}, indeg = {};
  for (const m of allMods) { adj[m.id] = []; indeg[m.id] = 0; }
  for (const c of state.cables) {
    if (c.fromId && c.toId && adj[c.fromId] && indeg[c.toId] !== undefined) {
      const toMod = allMods.find(m => m.id === c.toId);
      if (toMod && toMod.type === 'delay' && c.toPort === 'in') {
        const hasMixCV = state.cables.some(cc => cc.toId === toMod.id && cc.toPort === 'mix');
        if (!hasMixCV) {
          const mixVal = getKnobValue(toMod.type, 'mix', toMod.params.mix ?? 2048);
          if (mixVal === 4095) {
            continue;
          }
        }
      }
      if (toMod && toMod.type === 'reverb' && c.toPort === 'in') {
        const hasMixCV = state.cables.some(cc => cc.toId === toMod.id && cc.toPort === 'mix');
        if (!hasMixCV) {
          const mixVal = getKnobValue(toMod.type, 'mix', toMod.params.mix ?? 1024);
          if (mixVal === 4095) {
            continue;
          }
        }
      }
      adj[c.fromId].push(c.toId);
      indeg[c.toId]++;
    }
  }
  const queue   = allMods.filter(m => indeg[m.id] === 0).map(m => m.id);
  const ordered = [];
  while (queue.length) {
    const id = queue.shift(); ordered.push(id);
    for (const nb of (adj[id] || [])) { if (--indeg[nb] === 0) queue.push(nb); }
  }
  for (const m of allMods) if (!ordered.includes(m.id)) ordered.push(m.id);

  const sinkLines = [];

  for (const id of ordered) {
    const m = allMods.find(m => m.id === id);
    if (!m) continue;

    // Skip unconnected modules
    if (!activeIds.has(m.id)) continue;

    const def = MODULE_DEFS[m.type];
    if (!def || def.isHW) continue;

    let expr;
    if (m.type === 'mix') {
      // Special 4-channel Mixer S-expression generation using VCA multiplication
      const channels = ['a', 'b', 'c', 'd'];
      const mixedSigs = channels.map(ch => {
        const paramName = `vol${ch.toUpperCase()}`;
        const volVal = getKnobValue(m.type, paramName, m.params[paramName] ?? 2048);
        const cable = state.cables.find(c => c.toId === id && c.toPort === ch);
        if (cable) {
          const src = getCabledSourceExpr(cable, allMods);
          if (volVal === 4095) return src;
          if (volVal === 0) return null;
          return `(vca ${src} ${volVal})`;
        }
        return null;
      }).filter(Boolean);

      if (mixedSigs.length === 0) {
        expr = '0';
      } else if (mixedSigs.length === 1) {
        expr = mixedSigs[0];
      } else {
        let nested = mixedSigs[0];
        for (let i = 1; i < mixedSigs.length; i++) {
          nested = `(add ${nested} ${mixedSigs[i]})`;
        }
        expr = `(clip ${nested})`;
      }
    } else if (m.type === 'clock') {
      // Clock: only ONE rate kwarg allowed by the Lens phasor lowerer.
      // BPM is the primary rate; fm/width are safe extra kwargs.
      const bpmVal   = getKnobValue(m.type, 'bpm',   m.params.bpm   ?? 1638);
      const fmVal    = getKnobValue(m.type, 'fm',    m.params.fm    ?? 0);
      const widthVal = getKnobValue(m.type, 'width', m.params.width ?? 2048);

      const syncCable = state.cables.find(c => c.toId === id && c.toPort === 'sync');
      const fmCable   = state.cables.find(c => c.toId === id && c.toPort === 'fm');

      let args = `:bpm ${bpmVal}`;
      if (widthVal !== 2048) args += ` :width ${widthVal}`;
      if (syncCable) {
        const syncSrc = getCabledSourceExpr(syncCable, allMods);
        args += ` :sync ${syncSrc}`;
      }
      if (fmCable) {
        const fmSrc = getCabledSourceExpr(fmCable, allMods);
        if (fmVal === 4095) {
          args += ` :fm ${fmSrc}`;
        } else if (fmVal > 0) {
          args += ` :fm (vca ${fmSrc} ${fmVal})`;
        }
      } else if (fmVal !== 0) {
        args += ` :fm ${fmVal}`;
      }

      if (state.cables.some(c => c.fromId === id)) {
        lines.push(`  (def ${id} (clock ${args}))`);
      }
      continue;
    } else if (m.type === 'multi-div') {
      // Macro Clock divider: compiles to low-level clock division blocks for connected lines
      const divisions = { div2: 2, div4: 4, div8: 8, div16: 16 };
      for (const [port, divVal] of Object.entries(divisions)) {
        const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === port);
        if (hasCable) {
          const clockInCable = state.cables.find(c => c.toId === id && c.toPort === 'trig');
          const clockSrc = getCabledSourceExpr(clockInCable, allMods);
          lines.push(`  (def ${id}${port} (every :n ${divVal} :trig ${clockSrc}))`);
        }
      }
      continue;
    } else if (m.type === 'sub-osc') {
      // Macro Sub-Oscillator VCO: Saw wave with main pitch, sub-1 (-12), and sub-2 (-24) octave outputs
      const noteInCable = state.cables.find(c => c.toId === id && c.toPort === 'note');
      const pitchKnob = getKnobValue(m.type, 'pitch', m.params.pitch ?? 1935);
      const centsVal  = (getKnobValue(m.type, 'cents', m.params.cents ?? 2048) - 2048) / 204.8;
      
      let basePitchStr;
      if (noteInCable) {
        const noteSrc = getCabledSourceExpr(noteInCable, allMods);
        // When cabled, pitch knob = semitone transpose offset centred at default (60).
        const transpose = Math.round(pitchKnob - 60 + centsVal);
        basePitchStr = transpose !== 0 ? `(add ${noteSrc} ${transpose})` : noteSrc;
      } else {
        basePitchStr = `${pitchKnob + centsVal}`;
      }

      if (state.cables.some(c => c.fromId === id && c.fromPort === 'out')) {
        lines.push(`  (def ${id}out (saw :note ${basePitchStr}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'sub1')) {
        lines.push(`  (def ${id}sub1 (saw :note (sub ${basePitchStr} 12)))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'sub2')) {
        lines.push(`  (def ${id}sub2 (saw :note (sub ${basePitchStr} 24)))`);
      }
    } else if (m.type === 'sine' || m.type === 'triangle' || m.type === 'saw' || m.type === 'square') {
      const noteCable = state.cables.find(c => c.toId === id && c.toPort === 'note');
      const fmCable   = state.cables.find(c => c.toId === id && c.toPort === 'fm');
      
      const pitchKnob = getKnobValue(m.type, 'pitch', m.params.pitch ?? 1935);
      const centsVal  = (getKnobValue(m.type, 'cents', m.params.cents ?? 2048) - 2048) / 204.8;
      const basePitch = pitchKnob + centsVal;

      let pitchExpr = `${basePitch}`;
      if (noteCable) {
        const noteSrc = getCabledSourceExpr(noteCable, allMods);
        // When cabled, pitch knob = semitone transpose offset centred at default (60).
        const transpose = Math.round(pitchKnob - 60 + centsVal);
        pitchExpr = transpose !== 0 ? `(add ${noteSrc} ${transpose})` : noteSrc;
      }

      const isLfo = (m.params.range ?? 0) > 2000;
      if (isLfo) {
        pitchExpr = `(sub ${pitchExpr} 84)`;
      }

      if (fmCable) {
        const fmSrc = getCabledSourceExpr(fmCable, allMods);
        const depthVal = getKnobValue(m.type, 'depth', m.params.depth ?? 0);
        if (depthVal === 4095) {
          pitchExpr = `(add ${pitchExpr} ${fmSrc})`;
        } else if (depthVal > 0) {
          pitchExpr = `(add ${pitchExpr} (vca ${fmSrc} ${depthVal}))`;
        }
      }

      expr = `(${m.type} :note ${pitchExpr}`;

      if (m.type === 'sine') {
        const pmCable = state.cables.find(c => c.toId === id && c.toPort === 'pm');
        if (pmCable) {
          const pmSrc = getCabledSourceExpr(pmCable, allMods);
          expr += ` :pm ${pmSrc}`;
        }
      }

      const syncCable = state.cables.find(c => c.toId === id && c.toPort === 'sync');
      if (syncCable) {
        const syncSrc = getCabledSourceExpr(syncCable, allMods);
        expr += ` :sync ${syncSrc}`;
      }

      expr += ')';
      lines.push(`  (def ${id} ${expr})`);
      continue;
    } else if (m.type === 'quad-vca') {
      // Macro Quad VCA: compiles to 4 low-level independent VCA blocks
      const channels = ['a', 'b', 'c', 'd'];
      for (const ch of channels) {
        const outPort = `out${ch.toUpperCase()}`;
        const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === outPort);
        if (hasCable) {
          const inPort = `in${ch.toUpperCase()}`;
          const cvPort = `cv${ch.toUpperCase()}`;
          const volParam = `vol${ch.toUpperCase()}`;

          const inCable = state.cables.find(c => c.toId === id && c.toPort === inPort);
          const inSig = getCabledSourceExpr(inCable, allMods);

          const cvCable = state.cables.find(c => c.toId === id && c.toPort === cvPort);
          const levelVal = getKnobValue(m.type, volParam, m.params[volParam] ?? 4095);
          
          if (cvCable) {
            const cvSig = getCabledSourceExpr(cvCable, allMods);
            if (levelVal === 4095) {
              lines.push(`  (def ${id}${outPort} (vca ${inSig} ${cvSig}))`);
            } else if (levelVal === 0) {
              lines.push(`  (def ${id}${outPort} 0)`);
            } else {
              lines.push(`  (def ${id}${outPort} (vca ${inSig} (vca ${cvSig} ${levelVal})))`);
            }
          } else {
            if (levelVal === 4095) {
              lines.push(`  (def ${id}${outPort} ${inSig})`);
            } else if (levelVal === 0) {
              lines.push(`  (def ${id}${outPort} 0)`);
            } else {
              lines.push(`  (def ${id}${outPort} (vca ${inSig} ${levelVal}))`);
            }
          }
        }
      }
      continue;
    } else if (m.type === 'lfo-delay') {
      // Macro Delay LFO: combines LFO, Envelope and VCA
      const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === 'out');
      if (hasCable) {
        const trigCable  = state.cables.find(c => c.toId === id && c.toPort === 'trig');
        const hzCvCable  = state.cables.find(c => c.toId === id && c.toPort === 'hz');
        const fadeCvCable = state.cables.find(c => c.toId === id && c.toPort === 'fade');
        const trigSig = getCabledSourceExpr(trigCable, allMods);

        const knobHz   = getKnobValue(m.type, 'hz',   m.params.hz   ?? 10);
        const knobFade = getKnobValue(m.type, 'fade', m.params.fade ?? 2048);

        const hzExpr = hzCvCable
          ? `(add ${getCabledSourceExpr(hzCvCable, allMods)} ${knobHz} :sat)`
          : `${knobHz}`;
        const fadeExpr = fadeCvCable
          ? `(add ${getCabledSourceExpr(fadeCvCable, allMods)} ${knobFade} :sat)`
          : `${knobFade}`;

        lines.push(`  (def ${id}lfo (phasor :hz ${hzExpr}))`);
        lines.push(`  (def ${id}env (envelope :gate ${trigSig} :decay ${fadeExpr}))`);
        lines.push(`  (def ${id}out (vca ${id}lfo ${id}env))`);
      }
      continue;
    } else if (m.type === 'rhythm') {
      // Macro Rhythm Player: Compiles to onsets/gates/hits over a built-in rhythm pattern
      const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === 'out');
      if (hasCable) {
        const trigCable = state.cables.find(c => c.toId === id && c.toPort === 'trig');
        const trigSig = trigCable ? getCabledSourceExpr(trigCable, allMods) : 'master';
        
        const patDef = def.knobs.find(k => k.param === 'pattern');
        const patIdx = Math.max(0, Math.min(patDef.discrete.length - 1, Math.floor((m.params.pattern ?? 0) / 4096 * patDef.discrete.length)));
        const patName = patDef.discrete[patIdx];
        
        const modeDef = def.knobs.find(k => k.param === 'mode');
        const modeIdx = Math.max(0, Math.min(modeDef.discrete.length - 1, Math.floor((m.params.mode ?? 0) / 4096 * modeDef.discrete.length)));
        const modeName = modeDef.discrete[modeIdx];
        
        lines.push(`  (def ${id}out (${modeName} ${patName} ${trigSig}))`);
      }
      continue;
    } else if (m.type === 'turing') {
      // Macro Turing Machine: Evolving shift register randomizer
      const hasNoteCable = state.cables.some(c => c.fromId === id && c.fromPort === 'out');
      const hasTrigCable = state.cables.some(c => c.fromId === id && c.fromPort === 'trig');
      if (hasNoteCable || hasTrigCable) {
        const trigCable  = state.cables.find(c => c.toId === id && c.toPort === 'trig');
        const probCvCable = state.cables.find(c => c.toId === id && c.toPort === 'prob');
        const trigSig = trigCable ? getCabledSourceExpr(trigCable, allMods) : 'master';

        const knobProb = getKnobValue(m.type, 'prob', m.params.prob ?? 4095);
        const probExpr = probCvCable
          ? `(add ${getCabledSourceExpr(probCvCable, allMods)} ${knobProb} :sat)`
          : `${knobProb}`;

        const lenDef = def.knobs.find(k => k.param === 'len');
        const lenIdx = Math.max(0, Math.min(lenDef.discrete.length - 1, Math.floor((m.params.len ?? 4095) / 4096 * lenDef.discrete.length)));
        const lenVal = lenDef.discrete[lenIdx];

        lines.push(`  (def ${id}loop (tape '(C3 Eb3 G3 Bb3 C4 Bb3 G3 Eb3)))`);
        lines.push(`  (<- ${id}loop (if (chance ${probExpr} :trig ${trigSig}) (step ${id}loop :len ${lenVal} :trig ${trigSig}) (snap (add C3 (spread (random :trig ${trigSig}) 25)) :scale minor)) :len ${lenVal} :trig ${trigSig})`);

        if (hasNoteCable) {
          lines.push(`  (def ${id}out (step ${id}loop :len ${lenVal} :trig ${trigSig}))`);
        }
        if (hasTrigCable) {
          lines.push(`  (def ${id}trig (trig ${trigSig}))`);
        }
      }
      continue;
    } else if (m.type === 'signal-switch') {
      const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === 'out');
      if (hasCable) {
        const condCable = state.cables.find(c => c.toId === id && c.toPort === 'cond');
        const aCable = state.cables.find(c => c.toId === id && c.toPort === 'a');
        const bCable = state.cables.find(c => c.toId === id && c.toPort === 'b');
        const cCable = state.cables.find(c => c.toId === id && c.toPort === 'c');

        const condSig = condCable ? getCabledSourceExpr(condCable, allMods) : '(switch :z)';
        const aSig = aCable ? getCabledSourceExpr(aCable, allMods) : '0';
        const bSig = bCable ? getCabledSourceExpr(bCable, allMods) : '0';
        const cSig = cCable ? getCabledSourceExpr(cCable, allMods) : '0';

        lines.push(`  (def ${id}out (if (up ${condSig}) ${cSig} (if (mid ${condSig}) ${bSig} ${aSig})))`);
      }
      continue;
    } else if (m.type === 'seq-switch') {
      const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === 'out');
      if (hasCable) {
        const trigCable = state.cables.find(c => c.toId === id && c.toPort === 'trig');
        const in1Cable = state.cables.find(c => c.toId === id && c.toPort === 'in1');
        const in2Cable = state.cables.find(c => c.toId === id && c.toPort === 'in2');
        const in3Cable = state.cables.find(c => c.toId === id && c.toPort === 'in3');
        const in4Cable = state.cables.find(c => c.toId === id && c.toPort === 'in4');

        const trigSig = trigCable ? getCabledSourceExpr(trigCable, allMods) : '0';
        const in1Sig = in1Cable ? getCabledSourceExpr(in1Cable, allMods) : '0';
        const in2Sig = in2Cable ? getCabledSourceExpr(in2Cable, allMods) : '0';
        const in3Sig = in3Cable ? getCabledSourceExpr(in3Cable, allMods) : '0';
        const in4Sig = in4Cable ? getCabledSourceExpr(in4Cable, allMods) : '0';

        const stepsVal = m.params.steps ?? 4;

        lines.push(`  (def ${id}idx (counter :bars ${stepsVal} :trig ${trigSig}))`);
        lines.push(`  (def ${id}out (thru (lens ${in1Sig} ${in2Sig} ${in3Sig} ${in4Sig}) ${id}idx))`);
      }
      continue;
    } else if (m.type === 'drum-seq') {
      const hasAnyCable = state.cables.some(c => c.fromId === id && ['kick', 'snare', 'hat', 'perc'].includes(c.fromPort));
      if (hasAnyCable) {
        const trigCable = state.cables.find(c => c.toId === id && c.toPort === 'trig');
        const trigSig = trigCable ? getCabledSourceExpr(trigCable, allMods) : '0';

        const getBeatStr = (arr) => {
          const steps = arr || [0,0,0,0,0,0,0,0];
          return steps.map(s => s ? 'x' : '.').join(' ');
        };

        lines.push(`  (def ${id}kickPat (beat '(${getBeatStr(m.params.kickPat)})))`);
        lines.push(`  (def ${id}kick (onsets ${id}kickPat ${trigSig}))`);
        lines.push(`  (def ${id}snarePat (beat '(${getBeatStr(m.params.snarePat)})))`);
        lines.push(`  (def ${id}snare (onsets ${id}snarePat ${trigSig}))`);
        lines.push(`  (def ${id}hatPat (beat '(${getBeatStr(m.params.hatPat)})))`);
        lines.push(`  (def ${id}hat (onsets ${id}hatPat ${trigSig}))`);
        lines.push(`  (def ${id}percPat (beat '(${getBeatStr(m.params.percPat)})))`);
        lines.push(`  (def ${id}perc (onsets ${id}percPat ${trigSig}))`);
      }
      continue;
    } else if (m.type === 'score-player') {
      // Macro Score Player: Compiles Loupe melody pattern string to notes/rhythm tapes swept at speed
      const pat = m.params.pattern || '[c4 e4 g4 c5]';
      const trigCable = state.cables.find(c => c.toId === id && c.toPort === 'trig');
      const speedCable = state.cables.find(c => c.toId === id && c.toPort === 'speed');
      const knobSpeed = m.params.speed ?? 2048;

      let speedExpr;
      if (speedCable) {
        const speedSrc = getCabledSourceExpr(speedCable, allMods);
        // varispeed: maps 0..VMAX control to 0..2801 phasor rate; use add of CV + knob
        speedExpr = `(varispeed :knob (add ${speedSrc} ${knobSpeed} :sat))`;
      } else {
        speedExpr = `(varispeed :knob ${knobSpeed})`;
      }

      const noteCabled = state.cables.some(c => c.fromId === id && c.fromPort === 'note');
      const gateCabled = state.cables.some(c => c.fromId === id && c.fromPort === 'gate');

      if (noteCabled || gateCabled) {
        const cleanPat = pat.replace(/\[/g, '(').replace(/\]/g, ')');
        lines.push(`  (def ${id}score (score :pat '${cleanPat}))`);
      }

      if (trigCable) {
        const trigSig = getCabledSourceExpr(trigCable, allMods);
        if (noteCabled) {
          lines.push(`  (def ${id}note (step :tape (${id}score :notes) :trig ${trigSig}))`);
        }
        if (gateCabled) {
          lines.push(`  (def ${id}gate (onsets :tape (${id}score :rhythm) :trig ${trigSig}))`);
        }
      } else {
        if (noteCabled) {
          lines.push(`  (def ${id}note (play :tape (${id}score :notes) :speed ${speedExpr}))`);
        }
        if (gateCabled) {
          lines.push(`  (def ${id}gate (play :tape (${id}score :rhythm) :speed ${speedExpr}))`);
        }
      }
      continue;
    } else if (m.type === 'step-seq') {
      // Macro Step Sequencer: 1..8 steps indexed by a trigger counter, forward/backward/random
      const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === 'out');
      if (hasCable) {
        const trigCable = state.cables.find(c => c.toId === id && c.toPort === 'trig');
        const trigSig = getCabledSourceExpr(trigCable, allMods);

        // Use 'note' param name so getKnobValue applies scaleNote → 0..127 MIDI
        const note = (raw, def) => getKnobValue(m.type, 'note', raw ?? def);
        const val1 = note(m.params.val1, 0);
        const val2 = note(m.params.val2, 512);
        const val3 = note(m.params.val3, 1024);
        const val4 = note(m.params.val4, 1536);
        const val5 = note(m.params.val5, 2048);
        const val6 = note(m.params.val6, 2560);
        const val7 = note(m.params.val7, 3072);
        const val8 = note(m.params.val8, 3584);

        const stepsDef = def.knobs.find(k => k.param === 'steps');
        const stepsVal = Math.max(1, Math.min(8, Math.floor((m.params.steps ?? 4095) / 4096 * 8) + 1));
        
        const dirDef = def.knobs.find(k => k.param === 'dir');
        const dirIdx = Math.max(0, Math.min(dirDef.discrete.length - 1, Math.floor((m.params.dir ?? 0) / 4096 * dirDef.discrete.length)));
        const dirVal = dirDef.discrete[dirIdx];

        let idxExpr;
        if (dirVal === 'random') {
          idxExpr = `(spread (random :trig ${trigSig}) ${stepsVal})`;
        } else if (dirVal === 'backward') {
          idxExpr = `(sub ${stepsVal - 1} (counter :bars ${stepsVal} :trig ${trigSig}))`;
        } else {
          idxExpr = `(counter :bars ${stepsVal} :trig ${trigSig})`;
        }

        lines.push(`  (def ${id}count ${idxExpr})`);
        lines.push(`  (def ${id}out (thru (lens ${val1} ${val2} ${val3} ${val4} ${val5} ${val6} ${val7} ${val8}) ${id}count))`);
      }
      continue;
    } else if (m.type === 'midi-note') {
      const chVal = getKnobValue(m.type, 'ch', m.params.ch ?? 1);
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'note')) {
        lines.push(`  (def ${id}note (midi-note :ch ${chVal}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'gate')) {
        lines.push(`  (def ${id}gate (midi-gate :ch ${chVal}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'vel')) {
        lines.push(`  (def ${id}vel (midi-velocity :ch ${chVal}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'press')) {
        lines.push(`  (def ${id}press (midi-pressure :ch ${chVal}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'bend')) {
        lines.push(`  (def ${id}bend (midi-bend :ch ${chVal}))`);
      }
      continue;
    } else if (m.type === 'midi-cc') {
      const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === 'out');
      if (hasCable) {
        const chVal = getKnobValue(m.type, 'ch', m.params.ch ?? 0);
        const ccVal = getKnobValue(m.type, 'cc', m.params.cc ?? 1);
        const chArg = chVal > 0 ? ` :ch ${chVal}` : '';
        lines.push(`  (def ${id}out (midi-cc :${ccVal}${chArg}))`);
      }
      continue;
    } else if (m.type === 'midi-trig') {
      const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === 'out');
      if (hasCable) {
        const chVal = getKnobValue(m.type, 'ch', m.params.ch ?? 0);
        const noteVal = getKnobValue(m.type, 'note', m.params.note ?? 60);
        const chArg = chVal > 0 ? ` :ch ${chVal}` : '';
        lines.push(`  (def ${id}out (midi-trig :note ${noteVal}${chArg}))`);
      }
      continue;
    } else if (m.type === 'midi-clock') {
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'clk')) {
        lines.push(`  (def ${id}clk (midi-clock))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'play')) {
        lines.push(`  (def ${id}play (midi-playing))`);
      }
      continue;
    } else if (m.type === 'midi-note-out') {
      const chVal = getKnobValue(m.type, 'ch', m.params.ch ?? 1);
      const pitchCable = state.cables.find(c => c.toId === id && c.toPort === 'pitch');
      const pitchSig = getCabledSourceExpr(pitchCable, allMods) !== '0' ? getCabledSourceExpr(pitchCable, allMods) : '60';

      const gateCable = state.cables.find(c => c.toId === id && c.toPort === 'gate');
      const gateSig = getCabledSourceExpr(gateCable, allMods);

      const velCable = state.cables.find(c => c.toId === id && c.toPort === 'vel');
      const velSig = getCabledSourceExpr(velCable, allMods) !== '0' ? getCabledSourceExpr(velCable, allMods) : '100';

      sinkLines.push(`  (<- (midi-note-out :ch ${chVal}) ${pitchSig} :gate ${gateSig} :vel ${velSig})`);
      continue;
    } else if (m.type === 'midi-cc-out') {
      const chVal = getKnobValue(m.type, 'ch', m.params.ch ?? 1);
      const ccVal = getKnobValue(m.type, 'cc', m.params.cc ?? 1);
      const valCable = state.cables.find(c => c.toId === id && c.toPort === 'val');
      const valSig = getCabledSourceExpr(valCable, allMods);

      sinkLines.push(`  (<- (midi-cc-out :ch ${chVal} :cc ${ccVal}) ${valSig})`);
      continue;
    } else if (m.type === 'midi-clock-out') {
      const clkCable = state.cables.find(c => c.toId === id && c.toPort === 'clk');
      const clkSig = getCabledSourceExpr(clkCable, allMods);

      sinkLines.push(`  (<- (midi-clock-out) ${clkSig})`);
      continue;
    } else if (m.type === 'attenuverter') {
      const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'out')) {
        const inSrc = getCabledSourceExpr(inCable, allMods);
        const gainRaw   = m.params.gain   ?? 2048;
        const offsetRaw = m.params.offset ?? 2048;

        let gainExpr;
        if (gainRaw === 2048) {
          gainExpr = '0';
        } else if (gainRaw === 4095) {
          gainExpr = inSrc;
        } else if (gainRaw === 0) {
          gainExpr = `(sub 0 ${inSrc})`;
        } else {
          gainExpr = `(ring ${inSrc} (bipolar ${gainRaw}))`;
        }

        let outExpr;
        if (offsetRaw === 2048) {
          outExpr = gainExpr;
        } else {
          if (gainExpr === '0') {
            outExpr = `(bipolar ${offsetRaw})`;
          } else {
            outExpr = `(add ${gainExpr} (bipolar ${offsetRaw}) :sat)`;
          }
        }
        lines.push(`  (def ${id}out ${outExpr})`);
      }
      continue;
    } else if (m.type === 'delay') {
      // Macro Tape Delay feedback loop
      const hasCable = state.cables.some(c => c.fromId === id && c.fromPort === 'out');
      if (hasCable) {
        const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
        const inSig = getCabledSourceExpr(inCable, allMods);

        const timeCable = state.cables.find(c => c.toId === id && c.toPort === 'time');
        const knobTime  = getKnobValue(m.type, 'time', m.params.time ?? 2048);
        let timeExpr;
        if (timeCable) {
          const timeSrc = getCabledSourceExpr(timeCable, allMods);
          timeExpr = `(add ${timeSrc} ${knobTime} :sat)`;
        } else {
          timeExpr = `${knobTime}`;
        }

        const feedCable = state.cables.find(c => c.toId === id && c.toPort === 'feedback');
        const knobFeed  = getKnobValue(m.type, 'feedback', m.params.feedback ?? 1024);
        let feedExpr;
        if (feedCable) {
          const feedSrc = getCabledSourceExpr(feedCable, allMods);
          if (knobFeed === 4095) {
            feedExpr = feedSrc;
          } else {
            feedExpr = `(vca ${feedSrc} ${knobFeed})`;
          }
        } else {
          if (knobFeed === 4095) {
            feedExpr = `1`;
          } else {
            feedExpr = `${knobFeed}`;
          }
        }

        // Resolve mix — either a static knob value or a knob + CV expression
        const mixCvCable  = state.cables.find(c => c.toId === id && c.toPort === 'mix');
        const knobMixRaw  = m.params.mix ?? 2048;
        const mixAmtVal   = getKnobValue(m.type, 'mixamt', m.params.mixamt ?? 4095);
        const mixVal      = getKnobValue(m.type, 'mix', knobMixRaw);
        let mixCvExpr = null;
        if (mixCvCable) {
          const mixSrc = getCabledSourceExpr(mixCvCable, allMods);
          const attSrc = mixAmtVal >= 4095 ? mixSrc : `(vca ${mixSrc} ${mixAmtVal})`;
          mixCvExpr = `(clip (add ${attSrc} ${mixVal} :sat))`;
        }

        lines.push(`  (def ${id}tape (audio :seconds 0.75))`);
        lines.push(`  (def ${id}tap (tap ${id}tape ${timeExpr} :span))`);

        if (mixCvExpr) {
          // CV present: always compute wet/dry blend dynamically
          lines.push(`  (def ${id}out (clip (add ${inSig} (vca ${id}tap ${mixCvExpr}))))`);
        } else if (mixVal === 4095) {
          lines.push(`  (def ${id}out (clip ${id}tap))`);
        } else if (mixVal === 0) {
          lines.push(`  (def ${id}out ${inSig})`);
        } else {
          lines.push(`  (def ${id}out (clip (add ${inSig} (vca ${id}tap ${mixVal}))))`);
        }

        if (feedExpr === '0') {
          sinkLines.push(`  (<- ${id}tape ${inSig})`);
        } else if (feedExpr === '1' || feedExpr === '4095') {
          sinkLines.push(`  (<- ${id}tape (clip (add ${inSig} ${id}tap)))`);
        } else {
          sinkLines.push(`  (<- ${id}tape (clip (add ${inSig} (vca ${id}tap ${feedExpr}))))`);
        }
      }
      continue;
    } else if (m.type === 'reverb') {
      const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
      const inSig = getCabledSourceExpr(inCable, allMods);

      const decayCvCable = state.cables.find(c => c.toId === id && c.toPort === 'decay');
      const decayVal = getKnobValue(m.type, 'decay', m.params.decay ?? 2048);
      const decayAmt = getKnobValue(m.type, 'decayamt', m.params.decayamt ?? 4095);
      let decayExpr = decayVal;
      if (decayCvCable) {
        const decaySrc = getCabledSourceExpr(decayCvCable, allMods);
        const att = decayAmt >= 4095 ? decaySrc : `(vca ${decaySrc} ${decayAmt})`;
        decayExpr = `(clip (add ${att} ${decayVal} :sat))`;
      }

      const mixCvCable = state.cables.find(c => c.toId === id && c.toPort === 'mix');
      const mixVal = getKnobValue(m.type, 'mix', m.params.mix ?? 1024);
      const mixAmt = getKnobValue(m.type, 'mixamt', m.params.mixamt ?? 4095);
      let mixExpr = mixVal;
      if (mixCvCable) {
        const mixSrc = getCabledSourceExpr(mixCvCable, allMods);
        const att = mixAmt >= 4095 ? mixSrc : `(vca ${mixSrc} ${mixAmt})`;
        mixExpr = `(clip (add ${att} ${mixVal} :sat))`;
      }

      lines.push(`  (def ${id} (reverb :in ${inSig} :decay ${decayExpr} :mix ${mixExpr}))`);
      lines.push(`  (def ${id}outL ${id})`);
      lines.push(`  (def ${id}outR (${id} :outR))`);
      continue;
    } else if (m.type === 'chorus') {
      const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
      const inSig = getCabledSourceExpr(inCable, allMods);

      const rateCable = state.cables.find(c => c.toId === id && c.toPort === 'rate');
      const rateVal = getKnobValue(m.type, 'rate', m.params.rate ?? 1000);
      const rateAmt = getKnobValue(m.type, 'rateamt', m.params.rateamt ?? 4095);
      let rateExpr = rateVal;
      if (rateCable) {
        const rateSrc = getCabledSourceExpr(rateCable, allMods);
        const att = rateAmt >= 4095 ? rateSrc : `(vca ${rateSrc} ${rateAmt})`;
        rateExpr = `(clip (add ${att} ${rateVal} :sat))`;
      }

      const depthCable = state.cables.find(c => c.toId === id && c.toPort === 'depth');
      const depthVal = getKnobValue(m.type, 'depth', m.params.depth ?? 2048);
      const depthAmt = getKnobValue(m.type, 'depthamt', m.params.depthamt ?? 4095);
      let depthExpr = depthVal;
      if (depthCable) {
        const depthSrc = getCabledSourceExpr(depthCable, allMods);
        const att = depthAmt >= 4095 ? depthSrc : `(vca ${depthSrc} ${depthAmt})`;
        depthExpr = `(clip (add ${att} ${depthVal} :sat))`;
      }

      const fbVal = getKnobValue(m.type, 'feedback', m.params.feedback ?? 2048);

      lines.push(`  (def ${id}out (chorus :in ${inSig} :rate ${rateExpr} :depth ${depthExpr} :feedback ${fbVal}))`);
      continue;
    } else if (m.type === 'flanger') {
      const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
      const inSig = getCabledSourceExpr(inCable, allMods);

      const rateCable = state.cables.find(c => c.toId === id && c.toPort === 'rate');
      const rateVal = getKnobValue(m.type, 'rate', m.params.rate ?? 500);
      const rateAmt = getKnobValue(m.type, 'rateamt', m.params.rateamt ?? 4095);
      let rateExpr = rateVal;
      if (rateCable) {
        const rateSrc = getCabledSourceExpr(rateCable, allMods);
        const att = rateAmt >= 4095 ? rateSrc : `(vca ${rateSrc} ${rateAmt})`;
        rateExpr = `(clip (add ${att} ${rateVal} :sat))`;
      }

      const depthCable = state.cables.find(c => c.toId === id && c.toPort === 'depth');
      const depthVal = getKnobValue(m.type, 'depth', m.params.depth ?? 1024);
      const depthAmt = getKnobValue(m.type, 'depthamt', m.params.depthamt ?? 4095);
      let depthExpr = depthVal;
      if (depthCable) {
        const depthSrc = getCabledSourceExpr(depthCable, allMods);
        const att = depthAmt >= 4095 ? depthSrc : `(vca ${depthSrc} ${depthAmt})`;
        depthExpr = `(clip (add ${att} ${depthVal} :sat))`;
      }

      const fbVal = getKnobValue(m.type, 'feedback', m.params.feedback ?? 3000);

      lines.push(`  (def ${id}out (flanger :in ${inSig} :rate ${rateExpr} :depth ${depthExpr} :feedback ${fbVal}))`);
      continue;
    } else if (m.type === 'compressor') {
      const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
      const inSig = getCabledSourceExpr(inCable, allMods);

      const threshVal = getKnobValue(m.type, 'threshold', m.params.threshold ?? 3000);
      const ratioVal  = getKnobValue(m.type, 'ratio', m.params.ratio ?? 2048);
      const attVal    = getKnobValue(m.type, 'attack', m.params.attack ?? 100);
      const relVal    = getKnobValue(m.type, 'release', m.params.release ?? 1000);

      lines.push(`  (def ${id}out (compressor :in ${inSig} :threshold ${threshVal} :ratio ${ratioVal} :attack ${attVal} :release ${relVal}))`);
      continue;
      } else if (m.type === 'logic') {
      const aCable = state.cables.find(c => c.toId === id && c.toPort === 'a');
      const bCable = state.cables.find(c => c.toId === id && c.toPort === 'b');
      const aSrc = getCabledSourceExpr(aCable, allMods);
      const bSrc = getCabledSourceExpr(bCable, allMods);
      
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'and')) {
        lines.push(`  (def ${id}and (and ${aSrc} ${bSrc}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'or')) {
        lines.push(`  (def ${id}or (or ${aSrc} ${bSrc}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'xor')) {
        lines.push(`  (def ${id}xor (xor ${aSrc} ${bSrc}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'not')) {
        lines.push(`  (def ${id}not (not ${aSrc}))`);
      }
      continue;
    } else if (m.type === 'quantizer') {
      const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
      const inSig = getCabledSourceExpr(inCable, allMods);
      const scaleDef = def.knobs.find(k => k.param === 'scale');
      const scaleIdx = Math.max(0, Math.min(scaleDef.discrete.length - 1, Math.floor((m.params.scale ?? 0) / 4096 * scaleDef.discrete.length)));
      const scaleVal = scaleDef.discrete[scaleIdx];
      lines.push(`  (def ${id}out (snap ${inSig} :scale ${scaleVal}))`);
      continue;
    } else if (m.type === 'math') {
      const aCable = state.cables.find(c => c.toId === id && c.toPort === 'a');
      const bCable = state.cables.find(c => c.toId === id && c.toPort === 'b');
      const aSrc = getCabledSourceExpr(aCable, allMods);
      const bSrc = getCabledSourceExpr(bCable, allMods);
      
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'add')) {
        lines.push(`  (def ${id}add (add ${aSrc} ${bSrc}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'sub')) {
        lines.push(`  (def ${id}sub (sub ${aSrc} ${bSrc}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'mul')) {
        lines.push(`  (def ${id}mul (mul ${aSrc} ${bSrc}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'div')) {
        lines.push(`  (def ${id}div (div ${aSrc} ${bSrc}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'min')) {
        lines.push(`  (def ${id}min (min ${aSrc} ${bSrc}))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'max')) {
        lines.push(`  (def ${id}max (max ${aSrc} ${bSrc}))`);
      }
      continue;
    } else if (m.type === 'constant') {
      const valKnob = getKnobValue(m.type, 'val', m.params.val ?? 2048);
      lines.push(`  (def ${id}out ${valKnob})`);
      continue;
    } else if (m.type === 'benjolin') {
      const pitch1Cable = state.cables.find(c => c.toId === id && c.toPort === 'pitch1');
      const pitch2Cable = state.cables.find(c => c.toId === id && c.toPort === 'pitch2');
      const p1Sig = pitch1Cable ? getCabledSourceExpr(pitch1Cable, allMods) : '0';
      const p2Sig = pitch2Cable ? getCabledSourceExpr(pitch2Cable, allMods) : '0';

      const f1Knob = getKnobValue(m.type, 'freq1', m.params.freq1 ?? 1935);
      const f2Knob = getKnobValue(m.type, 'freq2', m.params.freq2 ?? 1935);
      const runglerKnob = getKnobValue(m.type, 'rungler', m.params.rungler ?? 1024);
      
      const lockDef = def.knobs.find(k => k.param === 'lock');
      const lockIdx = Math.max(0, Math.min(lockDef.discrete.length - 1, Math.floor((m.params.lock ?? 0) / 4096 * lockDef.discrete.length)));
      const isLocked = lockDef.discrete[lockIdx] === 'lock' ? 1 : 0;

      lines.push(`  (def ${id}reg (tape '(0 1 1 0 1 0 0 1)))`);
      lines.push(`  (def ${id}r3 (add (add (mul (tap ${id}reg 1) 4) (mul (tap ${id}reg 2) 2)) (tap ${id}reg 3)))`);
      lines.push(`  (def ${id}rungle (div (mul ${id}r3 VMAX) 7))`);
      lines.push(`  (def ${id}runglesm (slew ${id}rungle 2048))`);
      lines.push(`  (def ${id}fm (mul ${id}r3 (spread ${runglerKnob} 13)))`);
      lines.push(`  (def ${id}pitch1 (add (add 30 (spread ${f1Knob} 49)) (add ${p1Sig} ${id}fm)))`);
      lines.push(`  (def ${id}pitch2 (add (spread ${f2Knob} 73) (add ${p2Sig} ${id}fm)))`);
      lines.push(`  (def ${id}out1 (triangle :note ${id}pitch1))`);
      lines.push(`  (def ${id}out2 (square :note ${id}pitch2))`);
      
      lines.push(`  (def ${id}c1 (gt ${id}out1 VMID))`);
      if (isLocked) {
        sinkLines.push(`  (<- ${id}reg ${id}c1 :trig ${id}out2)`);
      } else {
        lines.push(`  (def ${id}fb (xor ${id}c1 (tap ${id}reg 8)))`);
        sinkLines.push(`  (<- ${id}reg ${id}fb :trig ${id}out2)`);
      }
      continue;
    } else if (m.type === 'morph') {
      const in1 = getCabledSourceExpr(state.cables.find(c => c.toId === id && c.toPort === 'in1'), allMods);
      const in2 = getCabledSourceExpr(state.cables.find(c => c.toId === id && c.toPort === 'in2'), allMods);
      const in3 = getCabledSourceExpr(state.cables.find(c => c.toId === id && c.toPort === 'in3'), allMods);
      const in4 = getCabledSourceExpr(state.cables.find(c => c.toId === id && c.toPort === 'in4'), allMods);
      
      const posCable = state.cables.find(c => c.toId === id && c.toPort === 'pos');
      const posKnob = getKnobValue(m.type, 'pos', m.params.pos ?? 0);
      let posExpr = `${posKnob}`;
      if (posCable) {
        posExpr = `(add ${posExpr} ${getCabledSourceExpr(posCable, allMods)} :sat)`;
      }
      lines.push(`  (def ${id}out (morph (lens ${in1} ${in2} ${in3} ${in4}) ${posExpr}))`);
      continue;
    } else if (m.type === 'midi-sync') {
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'clock')) {
        lines.push(`  (def ${id}clock (midi-clock))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'run')) {
        lines.push(`  (def ${id}run (midi-playing))`);
      }
      continue;
    } else if (m.type === 'schmitt') {
      const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
      const inSig = getCabledSourceExpr(inCable, allMods);
      const loVal = getKnobValue(m.type, 'lo', m.params.lo ?? 1024);
      const hiVal = getKnobValue(m.type, 'hi', m.params.hi ?? 3072);
      lines.push(`  (def ${id}out (schmitt ${inSig} :lo ${loVal} :hi ${hiVal}))`);
      continue;
    } else if (m.type === 'shift-register') {
      const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
      const trigCable = state.cables.find(c => c.toId === id && c.toPort === 'trig');
      const inSig = getCabledSourceExpr(inCable, allMods);
      const trigSig = getCabledSourceExpr(trigCable, allMods);

      lines.push(`  (def ${id}reg (tape '(0 0 0 0 0)))`);
      sinkLines.push(`  (<- ${id}reg ${inSig} :trig ${trigSig})`);

      if (state.cables.some(c => c.fromId === id && c.fromPort === 'out1')) {
        lines.push(`  (def ${id}out1 (tap ${id}reg 1))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'out2')) {
        lines.push(`  (def ${id}out2 (tap ${id}reg 2))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'out3')) {
        lines.push(`  (def ${id}out3 (tap ${id}reg 3))`);
      }
      if (state.cables.some(c => c.fromId === id && c.fromPort === 'out4')) {
        lines.push(`  (def ${id}out4 (tap ${id}reg 4))`);
      }
      continue;
    } else if (m.type === 'turns') {
      const trigCable = state.cables.find(c => c.toId === id && c.toPort === 'trig');
      const trigSig = getCabledSourceExpr(trigCable, allMods);
      const nVal = getKnobValue(m.type, 'n', m.params.n ?? 4);
      lines.push(`  (def ${id} (counter :bars ${nVal} :trig ${trigSig}))`);
      continue;
    } else if (m.type === 'hold') {
      // hold expander expects positional form: (hold VAL GATE)
      // keyword :val is NOT supported by the expander — must use positional args.
      const valCable = state.cables.find(c => c.toId === id && c.toPort === 'val');
      const onCable  = state.cables.find(c => c.toId === id && c.toPort === 'on');
      const valSrc = valCable ? getCabledSourceExpr(valCable, allMods) : '0';
      const onSrc  = onCable  ? getCabledSourceExpr(onCable, allMods)  : '0';
      lines.push(`  (def ${id} (hold ${valSrc} ${onSrc}))`);
      continue;
    } else if (m.type === 'tape-looper') {
      const inCable = state.cables.find(c => c.toId === id && c.toPort === 'in');
      const recCable = state.cables.find(c => c.toId === id && c.toPort === 'rec');
      const speedCable = state.cables.find(c => c.toId === id && c.toPort === 'speed');

      const inSig = getCabledSourceExpr(inCable, allMods);
      const recSig = recCable ? getCabledSourceExpr(recCable, allMods) : '0';
      
      const speedKnob = getKnobValue(m.type, 'speed', m.params.speed ?? 2048);
      const speedScale = (speedKnob - 2048) / 2048 * 2.0 + 1.0;
      let speedExpr = `${speedScale.toFixed(3)}`;
      if (speedCable) {
        const speedSrc = getCabledSourceExpr(speedCable, allMods);
        speedExpr = `(add ${speedExpr} (spread ${speedSrc} 2))`;
      }

      const lenKnob = m.params.len ?? 2048;
      const seconds = Math.max(1, Math.min(4, Math.floor(lenKnob / 4096 * 4) + 1));

      lines.push(`  (def ${id}buf (audio :seconds ${seconds.toFixed(2)}))`);
      sinkLines.push(`  (<- ${id}buf ${inSig} :per-sample :when ${recSig})`);
      lines.push(`  (def ${id}out (play ${id}buf ${speedExpr}))`);
      continue;
    } else if (m.type === 'dx' && m.params.customVoiceData) {
      const pitchCable = state.cables.find(c => c.toId === id && c.toPort === 'pitch');
      const gateCable  = state.cables.find(c => c.toId === id && c.toPort === 'gate');
      const decayCable = state.cables.find(c => c.toId === id && c.toPort === 'decay');

      const pitchSig = pitchCable ? getCabledSourceExpr(pitchCable, allMods) : '69';
      const gateSig  = gateCable  ? getCabledSourceExpr(gateCable, allMods)  : '0';

      const decayVal = getKnobValue(m.type, 'decay', m.params.decay ?? 2048);
      const decaySig = decayCable ? getCabledSourceExpr(decayCable, allMods) : decayVal;

      const toneVal = getKnobValue(m.type, 'tone', m.params.tone ?? 2048);
      const toneSig = toneVal;

      const tapeSig = `(tape 128 [${m.params.customVoiceData.join(' ')}])`;
      expr = `(dx :voice ${tapeSig} :pitch ${pitchSig} :gate ${gateSig} :decay ${decaySig} :tone ${toneSig})`;
    } else {
      expr = `(${m.type}`;
      for (const p of (def.inputs || [])) {
        const cable = state.cables.find(c => c.toId === id && c.toPort === p.id);
        if (cable) {
          const src = getCabledSourceExpr(cable, allMods);
          
          // Sum the cabled CV signal with the corresponding knob parameter (if any) with saturation clamping.
          // If there is a matching `${portId}amt` knob, scale the CV through it first.
          const kDef = (def.knobs || []).find(k => k.param === p.id);
          const amtDef = (def.knobs || []).find(k => k.param === `${p.id}amt`);
          let attSrc = src;
          if (amtDef) {
            const amtRaw = m.params[amtDef.param] !== undefined ? m.params[amtDef.param] : amtDef.def;
            const amtVal = getKnobValue(m.type, amtDef.param, amtRaw);
            if (amtVal <= 0) {
              attSrc = null; // CV depth zero — ignore CV entirely
            } else if (amtVal < 4095) {
              attSrc = `(vca ${src} ${amtVal})`;
            }
            // amtVal >= 4095 → full depth, attSrc stays as src
          }
          if (kDef) {
            const knobVal = getKnobValue(m.type, kDef.param, m.params[kDef.param] ?? kDef.def);
            if (attSrc) {
              const isPitch = p.id === 'note' || p.id === 'pitch';
              if (isPitch) {
                const center = getPitchCenter(m.type, kDef.param);
                const centsVal = (p.id === 'pitch' && (def.knobs || []).some(k => k.param === 'cents'))
                  ? ((getKnobValue(m.type, 'cents', m.params.cents ?? 2048) - 2048) / 204.8)
                  : 0;
                const transpose = Math.round(knobVal - center + centsVal);
                expr += ` :${p.id} ${transpose !== 0 ? `(add ${attSrc} ${transpose})` : attSrc}`;
              } else {
                expr += ` :${p.id} (add ${knobVal} ${attSrc} :sat)`;
              }
            } else {
              expr += ` :${p.id} ${knobVal}`; // CV fully attenuated, knob only
            }
          } else if (attSrc) {
            expr += ` :${p.id} ${attSrc}`;
          } else {
            expr += ` :${p.id} 0`; // CV zero, no knob
          }
        } else {
          const kDef = (def.knobs || []).find(k => k.param === p.id);
          const rawVal = m.params[p.id] !== undefined ? m.params[p.id] : (kDef ? kDef.def : undefined);
          if (rawVal !== undefined) {
            const val = getKnobValue(m.type, p.id, rawVal);
            if (val !== undefined && !Number.isNaN(val)) {
              expr += ` :${p.id} ${val}`;
            }
          } else {
            // No knob, no cable, no param — emit safe default 0 so required
            // inputs (like hold's :on gate) don't cause a compile error.
            expr += ` :${p.id} 0`;
          }
        }
      }
      // Knob variables not wired by inputs — skip amt attenuator knobs, they only
      // affect codegen when their corresponding CV input port is cabled.
      for (const k of (def.knobs || [])) {
        const isAmtKnob = k.param.endsWith('amt') &&
          (def.inputs || []).some(i => i.id === k.param.slice(0, -3));
        if (isAmtKnob) continue;
        if (!(def.inputs || []).some(i => i.id === k.param)) {
          const val = getKnobValue(m.type, k.param, m.params[k.param] ?? k.def);
          expr += ` :${k.param} ${val}`;
        }
      }
      expr += ')';
    }
    lines.push(`  (def ${id} ${expr})`);
  }

  // Cable links to Hardware Sinks
  for (const c of state.cables) {
    const toDef = allMods.find(m => m.id === c.toId);
    if (!toDef || !MODULE_DEFS[toDef.type]?.isHW) continue;
    let hw = LENS_PORTS[c.toPort];
    if (!hw) continue;

    const fromMod = allMods.find(m => m.id === c.fromId);
    if (fromMod && MODULE_DEFS[fromMod.type]?.isHW) continue;

    if (c.toPort === 'cv-out-1' || c.toPort === 'cv-out-2') {
      const isPitchSource = (fromMod.type === 'score-player' && c.fromPort === 'note') ||
                            (fromMod.type === 'midi-note'    && c.fromPort === 'note') ||
                            (fromMod.type === 'turing'       && c.fromPort === 'out')  ||
                            (fromMod.type === 'step-seq'     && c.fromPort === 'out')  ||
                            (fromMod.type === 'ws-in'        && (c.fromPort === 'cv-in-1' || c.fromPort === 'cv-in-2'));
      if (isPitchSource) {
        const num = c.toPort === 'cv-out-1' ? '1' : '2';
        hw = `(cv-out :${num} :v-oct)`;
      }
    }

    const fromPorts = MODULE_DEFS[fromMod?.type]?.outputs || [];
    let src;
    
    // Check if source is a macro module
    if (fromMod && MODULE_DEFS[fromMod.type]?.isMacro) {
      src = `${c.fromId}${c.fromPort}`;
    } else {
      const isDefaultOut = fromPorts.length === 1 || c.fromPort === 'out';
      src = isDefaultOut ? c.fromId : `(${c.fromId} :${c.fromPort})`;
    }
    sinkLines.push(`  (<- ${hw} ${src})`);
  }

  if (sinkLines.length) { lines.push(''); lines.push(...sinkLines); }
  lines.push(')');

  // Append visual state layout metadata as comment at the bottom
  const layoutMetadata = {
    rows: state.rows,
    cables: state.cables,
    nextId: state.nextId
  };
  lines.push(`\n; flare_layout: ${JSON.stringify(layoutMetadata)}`);

  const code = lines.join('\n');
  if (textOnly) return code;

  const lastCodeFunc = lastGeneratedCode.split('; flare_layout:')[0] || '';
  const currentCodeFunc = code.split('; flare_layout:')[0] || '';
  const hasCodeChanged = (currentCodeFunc !== lastCodeFunc);
  
  lastGeneratedCode = code;

  $('codeArea').value = code;
  if (hasCodeChanged) {
    compileAndStatus(code);
  }

  // Autosave current patch state to localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('flare_autosave', JSON.stringify({ state: layoutMetadata }));
    } catch (e) {
      console.error('Autosave failed:', e);
    }
  }
  return code;
}

// ═══════════════════════════════════════════════════════════════════════
// 13. COMPILE & MIDI
// ═══════════════════════════════════════════════════════════════════════

function compileAndStatus(code) {
  const statusEl = $('status');
  try {
    const ast      = Lens.read(code);
    const expanded = Lens.expand(ast, { loadFile: __webLoadFile });
    const lowered  = Lens.lower(expanded);
    const sched    = Lens.schedule(lowered);
    compiledSnapshot = Lens.encode(sched, lowered);
    rebuildKnobConstantMap();

    nodesCount = lowered.slots?.length ?? 0;
    statusEl.textContent = `${nodesCount} nodes · ${compiledSnapshot.length} B${midiOut ? ' · ' + midiOut.name : ''}`;
    statusEl.className = 'ok';
    $('sendBtn').disabled = $('saveCardBtn').disabled = $('perfBtn').disabled = !compiledSnapshot;
    triggerLiveUpdate();
  } catch (e) {
    compiledSnapshot = null;
    statusEl.textContent = e.message;
    statusEl.className = 'err';
    $('sendBtn').disabled = $('saveCardBtn').disabled = $('perfBtn').disabled = true;
  }
}

async function measurePerf() {
  const btn = $('perfBtn');
  const statusEl = $('status');
  if (!midiOut) {
    alert('MIDI not connected. Please click "Connect MIDI" to connect your Eurorack card first.');
    return;
  }
  btn.textContent = 'Measuring...';
  try {
    midiOut.send([...Lens.frame(6, [])]);
    const m = await recvAck();
    if (m.cmd === 0x01) {
      throw new Error('Profiler disabled (rebuild firmware with LENS_PERF_PROBE=ON)');
    }
    if (m.cmd !== 0x11) {
      throw new Error(`expected PERF_DUMP, got 0x${m.cmd.toString(16)}`);
    }
    const payload = new Uint8Array(m.payload);
    const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const total_avg = v.getUint32(24, true);
    const sysclk    = v.getUint32(8, true);
    const budget    = sysclk / 48000 | 0;
    const load_pct  = budget ? (total_avg / budget * 100) : 0;
    
    btn.textContent = `Measure CPU (${load_pct.toFixed(1)}% Load)`;
    statusEl.textContent = `CPU Load: ${load_pct.toFixed(1)}% (Avg cycles: ${total_avg} / Budget: ${budget})`;
    statusEl.className = 'ok';
  } catch(e) {
    btn.textContent = 'Measure CPU';
    statusEl.textContent = 'Perf Error: ' + e.message;
    statusEl.className = 'err';
  }
}

async function connectMidi() {
  const s = $('status');
  if (!navigator.requestMIDIAccess) { s.textContent = 'WebMIDI not supported'; s.className = 'err'; return; }
  try {
    const midi = await navigator.requestMIDIAccess({ sysex: true });
    midiOut = [...midi.outputs.values()].find(p => /lens|workshop|music thing/i.test(p.name)) || null;
    midiIn  = [...midi.inputs.values()].find(p => /lens|workshop|music thing/i.test(p.name)) || null;
    if (!midiOut || !midiIn) { s.textContent = 'Workshop card not found'; s.className = 'err'; return; }
    midiIn.onmidimessage = ev => { const m = Lens.parse([...ev.data]); if (m && ackWaiter) { const w = ackWaiter; ackWaiter = null; w(m); } };
    $('connectMidiBtn').textContent = 'Connected';
    lastUploadedSnapshot = null;
    generateCode();
  } catch(e) { s.textContent = 'MIDI: ' + e.message; s.className = 'err'; }
}

const recvAck = (ms=1500) => new Promise((res,rej) => {
  const t = setTimeout(()=>{ ackWaiter=null; rej(new Error('ACK timeout')); }, ms);
  ackWaiter = m => { clearTimeout(t); res(m); };
});

async function writeSnapshot() {
  for (let t=0; t<4; t++) {
    midiOut.send([...Lens.frame(Lens.CMD.WRITE_STATE, compiledSnapshot)]);
    const m = await recvAck();
    if (m.cmd === Lens.CMD.ACK) return;
    if (m.cmd === Lens.CMD.NACK && m.payload[1] === 0x06) { await new Promise(r=>setTimeout(r,150)); continue; }
    throw new Error(`NACK ${m.payload[1]}`);
  }
  throw new Error('Card busy');
}

async function sendPatch() {
  if (!compiledSnapshot) return;
  if (!midiOut) {
    alert('MIDI not connected. Please click "Connect MIDI" to connect your Eurorack card first.');
    return;
  }
  const s = $('status'); $('sendBtn').disabled = true;
  s.textContent = 'sending…';
  try {
    await writeSnapshot();
    lastUploadedSnapshot = new Uint8Array(compiledSnapshot);
    s.textContent = 'playing!';
    s.className = 'ok';
  }
  catch(e) { s.textContent = e.message; s.className = 'err'; }
  $('sendBtn').disabled = !compiledSnapshot;
}

async function saveToFlash() {
  if (!compiledSnapshot) return;
  if (!midiOut) {
    alert('MIDI not connected. Please click "Connect MIDI" to connect your Eurorack card first.');
    return;
  }
  const s = $('status'); $('saveCardBtn').disabled = true;
  s.textContent = 'writing to flash…';
  try {
    await writeSnapshot();
    lastUploadedSnapshot = new Uint8Array(compiledSnapshot);
    await new Promise(r=>setTimeout(r,700));
    midiOut.send([...Lens.frame(Lens.CMD.SAVE_STATE)]);
    const m = await recvAck(3000);
    if (m.cmd !== Lens.CMD.ACK) throw new Error('flash save failed');
    s.textContent = 'saved! rebooting…'; s.className = 'ok';
    $('connectMidiBtn').textContent = 'Connect MIDI';
    midiOut = midiIn = null;
    lastUploadedSnapshot = null;
  } catch(e) { s.textContent = e.message; s.className = 'err'; }
  generateCode();
}

// ═══════════════════════════════════════════════════════════════════════
// 14. INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════


let isResizingCodePane = false;
let codePaneWidth = 270;
let codePaneMaximized = false;

function toggleCode() {
  const pane = $('codePane');
  const btn = $('toggleCodeBtn');
  if (pane.style.display === 'none') {
    pane.style.display = 'flex';
    pane.style.width = codePaneMaximized ? '100%' : `${codePaneWidth}px`;
    btn.textContent = 'Hide Code';
  } else {
    pane.style.display = 'none';
    btn.textContent = 'Show Code';
  }
  // Recalculate layout and redraw cables immediately after styles apply
  setTimeout(redrawCables, 50);
}

function setupCodePaneResizeAndControls() {
  const pane = $('codePane');
  const resizer = $('codePaneResizer');
  const maxBtn = $('codeMaximizeBtn');
  const closeBtn = $('codeCloseBtn');

  if (!pane || !resizer || !maxBtn || !closeBtn) return;

  maxBtn.addEventListener('click', () => {
    if (codePaneMaximized) {
      pane.style.width = `${codePaneWidth}px`;
      maxBtn.textContent = '⛶';
      codePaneMaximized = false;
    } else {
      pane.style.width = '100%';
      maxBtn.textContent = '❐';
      codePaneMaximized = true;
    }
    redrawCables();
  });

  closeBtn.addEventListener('click', () => {
    pane.style.display = 'none';
    const btn = $('toggleCodeBtn');
    if (btn) btn.textContent = 'Show Code';
    redrawCables();
  });

  resizer.addEventListener('mousedown', initResize);
  resizer.addEventListener('touchstart', initResize);

  function initResize(e) {
    e.preventDefault();
    isResizingCodePane = true;
    resizer.classList.add('active');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleResize);
    window.addEventListener('touchmove', handleResize);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchend', stopResize);
  }

  function handleResize(e) {
    if (!isResizingCodePane) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const newWidth = window.innerWidth - clientX;
    
    if (newWidth > 180 && newWidth < window.innerWidth - 100) {
      codePaneWidth = newWidth;
      codePaneMaximized = false;
      pane.style.width = `${newWidth}px`;
      maxBtn.textContent = '⛶';
      redrawCables();
    }
  }

  function stopResize() {
    isResizingCodePane = false;
    resizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('touchmove', handleResize);
    window.removeEventListener('mouseup', stopResize);
    window.removeEventListener('touchend', stopResize);
  }
}

// ── DX7 SysEx Parser & Importer ──────────────────────────────────────
const DX7_ALGORITHMS = {
  1: { carriers:[1,3], edges:[[2,1],[4,3],[5,4],[6,5]], feedback:[6,6] },
  2: { carriers:[1,3], edges:[[2,1],[4,3],[5,4],[6,5]], feedback:[2,2] },
  3: { carriers:[1,4], edges:[[2,1],[3,2],[5,4],[6,5]], feedback:[6,6] },
  4: { carriers:[1,4], edges:[[2,1],[3,2],[5,4],[6,5]], feedback:[4,6] },
  5: { carriers:[1,3,5], edges:[[2,1],[4,3],[6,5]], feedback:[6,6] },
  6: { carriers:[1,3,5], edges:[[2,1],[4,3],[6,5]], feedback:[5,6] },
  7: { carriers:[1,3], edges:[[2,1],[4,3],[5,3],[6,5]], feedback:[6,6] },
  8: { carriers:[1,3], edges:[[2,1],[4,3],[5,3],[6,5]], feedback:[4,4] },
  9: { carriers:[1,3], edges:[[2,1],[4,3],[5,3],[6,5]], feedback:[2,2] },
  10: { carriers:[1,4], edges:[[2,1],[3,2],[5,4],[6,4]], feedback:[3,3] },
  11: { carriers:[1,4], edges:[[2,1],[3,2],[5,4],[6,4]], feedback:[6,6] },
  12: { carriers:[1,3], edges:[[2,1],[4,3],[5,3],[6,3]], feedback:[2,2] },
  13: { carriers:[1,3], edges:[[2,1],[4,3],[5,3],[6,3]], feedback:[6,6] },
  14: { carriers:[1,3], edges:[[2,1],[4,3],[5,4],[6,4]], feedback:[6,6] },
  15: { carriers:[1,3], edges:[[2,1],[4,3],[5,4],[6,4]], feedback:[2,2] },
  16: { carriers:[1], edges:[[2,1],[3,1],[5,1],[4,3],[6,5]], feedback:[6,6] },
  17: { carriers:[1], edges:[[2,1],[3,1],[5,1],[4,3],[6,5]], feedback:[2,2] },
  18: { carriers:[1], edges:[[2,1],[3,1],[4,1],[5,4],[6,5]], feedback:[3,3] },
  19: { carriers:[1,4,5], edges:[[2,1],[3,2],[6,4],[6,5]], feedback:[6,6] },
  20: { carriers:[1,2,4], edges:[[3,1],[3,2],[5,4],[6,4]], feedback:[3,3] },
  21: { carriers:[1,2,4,5], edges:[[3,1],[3,2],[6,4],[6,5]], feedback:[3,3] },
  22: { carriers:[1,3,4,5], edges:[[2,1],[6,3],[6,4],[6,5]], feedback:[6,6] },
  23: { carriers:[1,2,4,5], edges:[[3,2],[6,4],[6,5]], feedback:[6,6] },
  24: { carriers:[1,2,3,4,5], edges:[[6,3],[6,4],[6,5]], feedback:[6,6] },
  25: { carriers:[1,2,3,4,5], edges:[[6,4],[6,5]], feedback:[6,6] },
  26: { carriers:[1,2,4], edges:[[3,2],[5,4],[6,4]], feedback:[6,6] },
  27: { carriers:[1,2,4], edges:[[3,2],[5,4],[6,4]], feedback:[3,3] },
  28: { carriers:[1,3,6], edges:[[2,1],[4,3],[5,4]], feedback:[5,5] },
  29: { carriers:[1,2,3,5], edges:[[4,3],[6,5]], feedback:[6,6] },
  30: { carriers:[1,2,3,6], edges:[[4,3],[5,4]], feedback:[5,5] },
  31: { carriers:[1,2,3,4,5], edges:[[6,5]], feedback:[6,6] },
  32: { carriers:[1,2,3,4,5,6], edges:[], feedback:[6,6] },
};

function unpackDx7Op(b, o) {
  return {
    r:[b[o],b[o+1],b[o+2],b[o+3]],
    l:[b[o+4],b[o+5],b[o+6],b[o+7]],
    outLevel: b[o+14],
    mode:     b[o+15] & 1,
    coarse:  (b[o+15] >> 1) & 31,
    fine:     b[o+16],
    detune:  (b[o+12] >> 3) & 15,
  };
}

function parseDx7Voice(b128) {
  const ops = [];
  for (let i = 0; i < 6; i++) ops[5-i] = unpackDx7Op(b128, i*17);
  return {
    ops,
    algorithm: (b128[110] & 31) + 1,
    feedback:   b128[111] & 7,
    transpose:  b128[117],
    name: Array.from(b128.slice(118,128)).map(c => String.fromCharCode(c)).join('').replace(/[^\x20-\x7e]/g,' ').trim(),
    data: Array.from(b128)
  };
}

function parseDx7Bank(buf) {
  let body = buf;
  if (buf[0] === 0xF0) body = buf.slice(6, 6 + 4096);
  const voices = [];
  for (let v = 0; v < 32; v++) voices.push(parseDx7Voice(body.slice(v*128, v*128+128)));
  return voices;
}

const DX7_LEVELLUT = [0,5,9,13,17,20,23,25,27,29,31,33,35,37,39,41,42,43,45,46];
const scaleDx7Out = x => x >= 20 ? 28 + x : DX7_LEVELLUT[x < 0 ? 0 : (x > 19 ? 19 : x)];

function opDx7Gain(egL, outLevel) {
  const outlevel_ = Math.min(127, scaleDx7Out(outLevel)) << 5;
  let act = ((scaleDx7Out(egL) >> 1) << 6) + outlevel_ - 4256;
  if (act < 16) act = 16;
  return Math.pow(2, (act - 3584) / 256);
}

function dx7egLevel(egL, outLevel) {
  const outlevel_ = Math.min(127, scaleDx7Out(outLevel)) << 5;
  let act = ((scaleDx7Out(egL) >> 1) << 6) + outlevel_ - 4256;
  if (act < 16) act = 16;
  return Math.max(0, Math.min(255, act >> 4));
}

function dx7RatioOf(op) {
  const base = op.coarse === 0 ? 0.5 : op.coarse;
  return base * (1 + op.fine/100);
}

function dx7PitchOffset(op) {
  const oct = Math.log2(dx7RatioOf(op));
  const semisF = 12*oct;
  const semi = Math.round(semisF);
  let cents = Math.round((semisF-semi)*100) + Math.round((op.detune-7)*2.7);
  return { semi, cents };
}

function emitDx7VoiceFn(voice, name) {
  const alg = DX7_ALGORITHMS[voice.algorithm];
  if(!alg) throw new Error('algorithm '+voice.algorithm+' not in table yet');
  const fbTarget = alg.feedback ? alg.feedback[1] : null;
  const L=[];
  L.push('; DX7 voice "'+voice.name+'"  algorithm '+voice.algorithm+'  feedback '+voice.feedback);
  L.push('(def '+name+' (fn (:gate :pitch => :out)');
  const done=new Set();
  const emit = n => {
    if(done.has(n)) return;
    done.add(n);
    const mods=(alg.edges||[]).filter(e=>e[1]===n && e[0]!==n).map(e=>e[0]);
    mods.forEach(emit);
    const op=voice.ops[n-1];
    const {semi,cents}=dx7PitchOffset(op);
    const note = semi===0 ? 'pitch' : '(add pitch '+semi+')';
    const centsArg = cents!==0 ? ' :cents '+cents : '';
    const Le=op.l.map(l=>dx7egLevel(l, op.outLevel));
    const env='(dxeg :gate gate :r1 '+op.r[0]+' :r2 '+op.r[1]+' :r3 '+op.r[2]+' :r4 '+op.r[3]+
              ' :l1 '+Le[0]+' :l2 '+Le[1]+' :l3 '+Le[2]+' :l4 '+Le[3]+')';
    const pmParts = mods.map(m => 'op'+m);
    const pmSrc = pmParts.length>1 ? '(mix '+pmParts.join(' ')+')' : pmParts[0];
    const pm = pmParts.length ? ' :pm '+pmSrc : '';
    if (n === fbTarget && voice.feedback > 0) {
      const FBSCALE = Math.round(4095 * voice.feedback / 7);
      L.push('  (def op'+n+'env '+env+')');
      L.push('  (def op'+n+' (vca (sine :note '+note+centsArg+pm+
             ' :fb (vca op'+n+'env '+FBSCALE+')) op'+n+'env))');
    } else {
      const body='(vca (sine :note '+note+centsArg+pm+') '+env+')';
      L.push('  (def op'+n+' '+body+')');
    }
  };
  alg.carriers.forEach(emit);
  const sum = alg.carriers.length===1 ? 'op'+alg.carriers[0]
            : '(mix '+alg.carriers.map(c=>'op'+c).join(' ')+')';
  L.push('  (<- out (vca '+sum+' 2047))))');
  return L.join('\n')+'\n';
}

function showVoiceSelectionModal(voices, onSelect) {
  const modal = el('div', 'voice-modal-overlay', {
    style: 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 10000; font-family: sans-serif;'
  });
  const box = el('div', 'voice-modal-box', {
    style: 'background: #1e1d1b; border: 1px solid #3a3835; border-radius: 6px; padding: 20px; width: 360px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.5);'
  });
  const title = el('h3', '', {
    textContent: 'Select DX7 Preset to Import',
    style: 'margin: 0 0 15px 0; color: #9fd08a; font-size: 16px; border-bottom: 1px solid #3a3835; padding-bottom: 8px;'
  });
  box.appendChild(title);

  const list = el('div', 'voice-modal-list', {
    style: 'overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 4px; padding-right: 4px;'
  });

  voices.forEach((v, idx) => {
    const btn = el('button', 'voice-modal-item', {
      textContent: `${idx + 1}: ${v.name || 'UNNAMED'}`,
      style: 'background: #2b2927; border: 1px solid #3c3a38; color: #ddd; padding: 8px 12px; text-align: left; border-radius: 4px; cursor: pointer; font-family: monospace; font-size: 12px; transition: all 0.1s;'
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.borderColor = '#9fd08a';
      btn.style.background = '#32302e';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = '#3c3a38';
      btn.style.background = '#2b2927';
    });
    btn.addEventListener('click', () => {
      document.body.removeChild(modal);
      onSelect(v, idx);
    });
    list.appendChild(btn);
  });
  box.appendChild(list);

  const cancel = el('button', '', {
    textContent: 'Cancel',
    style: 'margin-top: 15px; background: #4a1d1d; border: 1px solid #6a2525; color: #fff; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold;'
  });
  cancel.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  box.appendChild(cancel);

  modal.appendChild(box);
  document.body.appendChild(modal);
}

function init() {
  const rackCase = $('rackCase');
  for (let i = 0; i < 2; i++) {
    state.rows[i] = [];
    rackCase.appendChild(buildRowEl(i));
  }

  // Load autosave if available, else initialize default empty patch
  let hasAutosave = false;
  if (typeof localStorage !== 'undefined') {
    try {
      const autosave = localStorage.getItem('flare_autosave');
      if (autosave) {
        const parsed = JSON.parse(autosave);
        if (parsed && parsed.state && parsed.state.rows) {
          hasAutosave = true;
        }
      }
    } catch (e) {
      console.error('Failed checking autosave:', e);
    }
  }

  if (hasAutosave) {
    loadPatch('flare_autosave');
  } else {
    // Initialize WS IN on row 0 and WS OUT on row 1 (both 6 HP, snap alignment)
    addModuleToRow('ws-in',  0, {}, { id: 'wsIn', left: 0 });
    addModuleToRow('ws-out', 1, {}, { id: 'wsOut', left: 0 });
  }

  $('toggleCodeBtn').addEventListener('click', toggleCode);
  setupCodePaneResizeAndControls();
  $('browserBtn').addEventListener('click', openBrowser);
  $('closeBrowserBtn').addEventListener('click', closeBrowser);
  $('addRowBtn').addEventListener('click', () => { addRow(); });
  $('connectMidiBtn').addEventListener('click', connectMidi);
  $('sendBtn').addEventListener('click', sendPatch);
  $('saveCardBtn').addEventListener('click', saveToFlash);
  $('perfBtn').addEventListener('click', measurePerf);

  // Local storage save/load presets
  const savePatchBtn = $('savePatchBtn');
  if (savePatchBtn) savePatchBtn.addEventListener('click', savePatch);
  const deletePatchBtn = $('deletePatchBtn');
  if (deletePatchBtn) deletePatchBtn.addEventListener('click', deletePatch);
  const patchSelect = $('patchSelect');
  if (patchSelect) patchSelect.addEventListener('change', e => loadPatch(e.target.value));

  $('clearBtn').addEventListener('click', () => {
    for (let i = 0; i < state.rows.length; i++) {
      state.rows[i] = state.rows[i].filter(m => MODULE_DEFS[m.type]?.deletable === false);
    }
    state.cables = [];
    document.querySelectorAll('.module:not(.mod-io)').forEach(m => m.remove());
    redrawCables(); updateRowWidths(); generateCode();
  });

  $('exportBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([$('codeArea').value], { type: 'text/plain' }));
    a.download = 'patch.loupe'; a.click();
  });

  $('browserSearch').addEventListener('input', buildBrowser);

  $('rackViewport').addEventListener('scroll', redrawCables);
  window.addEventListener('resize', redrawCables);

  // Right-click Context Menus
  $('rackViewport').addEventListener('contextmenu', showContextMenu);
  window.addEventListener('click', closeContextMenu);

  // Code import interactions
  let cachedGeneratedCode = '';
  const startImport = () => {
    cachedGeneratedCode = $('codeArea').value;
    $('codeArea').readOnly = false;
    $('codeArea').value = '';
    $('codeArea').placeholder = 'Paste your Loupe S-expression script here, then click Apply...';
    $('codeArea').focus();
    $('codePaneTitle').textContent = 'Paste Loupe Script';
    $('importCodeBtn').style.display = 'none';
    $('applyImportBtn').style.display = 'inline-block';
    $('cancelImportBtn').style.display = 'inline-block';
    // Make sure code pane is visible
    const pane = $('codePane');
    const btn = $('toggleCodeBtn');
    if (pane.style.display === 'none') {
      pane.style.display = 'flex';
      btn.textContent = 'Hide Code';
      setTimeout(redrawCables, 50);
    }
  };

  $('importBtn').addEventListener('click', startImport);
  $('importCodeBtn').addEventListener('click', startImport);

  $('importDx7Btn').addEventListener('click', () => {
    $('dx7FileInput').click();
  });

  $('dx7FileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      const buf = new Uint8Array(evt.target.result);
      try {
        const voices = parseDx7Bank(buf);
        showVoiceSelectionModal(voices, (voice, voiceIdx) => {
          const name = 'dxvoice_' + voice.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const composedCode = emitDx7VoiceFn(voice, name);
          const demoPatch = [
            composedCode,
            '(patch',
            '  (def g (clock :bpm 60 :width 2048))',
            `  (<- (audio-out :1) (${name} :gate g :pitch C3))`,
            `  (<- (audio-out :2) (${name} :gate g :pitch C3)))`
          ].join('\n');
          
          DX7_PRESETS[3] = voices.map(v => v.name);
          const bankKnobDef = MODULE_DEFS.dx.knobs.find(k => k.param === 'bank');
          if (bankKnobDef && !bankKnobDef.discrete.includes(3)) {
            bankKnobDef.discrete.push(3);
          }
          
          loadLoupePatch(demoPatch);
          const pane = $('codePane');
          const btn = $('toggleCodeBtn');
          if (pane.style.display === 'none') {
            pane.style.display = 'flex';
            btn.textContent = 'Hide Code';
            setTimeout(redrawCables, 50);
          }
        });
      } catch (err) {
        alert('Failed to parse DX7 bank: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  });

  $('applyImportBtn').addEventListener('click', () => {
    const code = $('codeArea').value.trim();
    if (code) {
      loadLoupePatch(code);
    } else {
      $('codeArea').value = cachedGeneratedCode;
    }
    // Restore default state
    $('codeArea').readOnly = true;
    $('codePaneTitle').textContent = 'Generated Loupe Code';
    $('importCodeBtn').style.display = 'inline-block';
    $('applyImportBtn').style.display = 'none';
    $('cancelImportBtn').style.display = 'none';
  });

  $('cancelImportBtn').addEventListener('click', () => {
    $('codeArea').value = cachedGeneratedCode;
    $('codeArea').readOnly = true;
    $('codePaneTitle').textContent = 'Generated Loupe Code';
    $('importCodeBtn').style.display = 'inline-block';
    $('applyImportBtn').style.display = 'none';
    $('cancelImportBtn').style.display = 'none';
  });

  updateRowWidths();
  updatePatchDropdown();
  generateCode();
}

window.addEventListener('DOMContentLoaded', init);

// ═══════════════════════════════════════════════════════════════════════
// 15. LOCAL STORAGE SAVE / LOAD
// ═══════════════════════════════════════════════════════════════════════

const FACTORY_PATCHES = {
  'factory_drum': {
    name: '🥁 Preset: Drum Machine',
    state: {
      rows: [
        [
          { id: 'wsIn', type: 'ws-in', left: 0, params: {} },
          { id: 'clock1', type: 'clock', left: 120, params: { bpm: 1638, fm: 0, width: 2048 } },
          { id: 'multidiv1', type: 'multi-div', left: 240, params: {} },
          { id: 'kick1', type: 'kick', left: 390, params: { note: 1161, decay: 2048, drive: 1000 } },
          { id: 'snare1', type: 'snare', left: 570, params: { note: 1451, decay: 1500, snappy: 2048 } },
          { id: 'hat1', type: 'hat', left: 750, params: { note: 2580, decay: 800 } }
        ],
        [
          { id: 'wsOut', type: 'ws-out', left: 0, params: {} },
          { id: 'mix1', type: 'mix', left: 120, params: { volA: 3500, volB: 3000, volC: 2500, volD: 2048 } },
          { id: 'vca1', type: 'vca', left: 270, params: { amp: 4095 } }
        ]
      ],
      cables: [
        { fromId: 'clock1', fromPort: 'out', toId: 'multidiv1', toPort: 'trig', color: '#ff5e57' },
        { fromId: 'multidiv1', fromPort: 'div2', toId: 'kick1', toPort: 'trig', color: '#ffaa00' },
        { fromId: 'multidiv1', fromPort: 'div4', toId: 'snare1', toPort: 'trig', color: '#ffea00' },
        { fromId: 'multidiv1', fromPort: 'div2', toId: 'hat1', toPort: 'trig', color: '#00ff66' },
        { fromId: 'kick1', fromPort: 'out', toId: 'mix1', toPort: 'a', color: '#00ffff' },
        { fromId: 'snare1', fromPort: 'out', toId: 'mix1', toPort: 'b', color: '#0088ff' },
        { fromId: 'hat1', fromPort: 'out', toId: 'mix1', toPort: 'c', color: '#cc00ff' },
        { fromId: 'mix1', fromPort: 'out', toId: 'vca1', toPort: 'in', color: '#ff00ff' },
        { fromId: 'vca1', fromPort: 'out', toId: 'wsOut', toPort: 'audio-out-1', color: '#ff5e57' },
        { fromId: 'vca1', fromPort: 'out', toId: 'wsOut', toPort: 'audio-out-2', color: '#ff5e57' }
      ],
      nextId: 100
    }
  },
  'factory_bass': {
    name: '🎸 Preset: Acid Bassline',
    state: {
      rows: [
        [
          { id: 'wsIn', type: 'ws-in', left: 0, params: {} },
          { id: 'clock1', type: 'clock', left: 120, params: { bpm: 1638, fm: 0, width: 2048 } },
          { id: 'seq1', type: 'step-seq', left: 240, params: { val1: 1161, val2: 1258, val3: 1161, val4: 1548, val5: 1161, val6: 1258, val7: 1548, val8: 1838 } },
          { id: 'saw1', type: 'saw', left: 420, params: { pitch: 1161, cents: 2048, depth: 0 } },
          { id: 'lpf1', type: 'lpf2', left: 600, params: { cut: 1200, res: 2800 } }
        ],
        [
          { id: 'wsOut', type: 'ws-out', left: 0, params: {} },
          { id: 'env1', type: 'envelope', left: 120, params: { decay: 1500, peak: 4095 } },
          { id: 'vca1', type: 'vca', left: 240, params: { amp: 4095 } }
        ]
      ],
      cables: [
        { fromId: 'clock1', fromPort: 'out', toId: 'seq1', toPort: 'trig', color: '#ff5e57' },
        { fromId: 'clock1', fromPort: 'out', toId: 'env1', toPort: 'trig', color: '#ffaa00' },
        { fromId: 'seq1', fromPort: 'out', toId: 'saw1', toPort: 'note', color: '#00ff66' },
        { fromId: 'saw1', fromPort: 'out', toId: 'lpf1', toPort: 'in', color: '#00ffff' },
        { fromId: 'env1', fromPort: 'out', toId: 'lpf1', toPort: 'cut', color: '#cc00ff' },
        { fromId: 'lpf1', fromPort: 'out', toId: 'vca1', toPort: 'in', color: '#0088ff' },
        { fromId: 'vca1', fromPort: 'out', toId: 'wsOut', toPort: 'audio-out-1', color: '#ff5e57' },
        { fromId: 'vca1', fromPort: 'out', toId: 'wsOut', toPort: 'audio-out-2', color: '#ff5e57' }
      ],
      nextId: 100
    }
  },
  'factory_melody': {
    name: '🎶 Preset: Score Melody',
    state: {
      rows: [
        [
          { id: 'wsIn', type: 'ws-in', left: 0, params: {} },
          { id: 'clock1', type: 'clock', left: 120, params: { bpm: 1638 } },
          { id: 'score1', type: 'score-player', left: 240, params: { speed: 1638, pattern: '[c4 e4 g4 c5 b4 g4 e4 c4]' } },
          { id: 'sine1', type: 'sine', left: 420, params: { pitch: 1935, cents: 2048, depth: 1000 } },
          { id: 'delay1', type: 'delay', left: 600, params: { time: 2048, feedback: 2048, mix: 1500 } }
        ],
        [
          { id: 'wsOut', type: 'ws-out', left: 0, params: {} },
          { id: 'vca1', type: 'vca', left: 120, params: { amp: 4095 } }
        ]
      ],
      cables: [
        { fromId: 'clock1', fromPort: 'out', toId: 'score1', toPort: 'speed', color: '#ff5e57' },
        { fromId: 'score1', fromPort: 'note', toId: 'sine1', toPort: 'note', color: '#00ff66' },
        { fromId: 'sine1', fromPort: 'out', toId: 'delay1', toPort: 'in', color: '#00ffff' },
        { fromId: 'delay1', fromPort: 'out', toId: 'vca1', toPort: 'in', color: '#0088ff' },
        { fromId: 'vca1', fromPort: 'out', toId: 'wsOut', toPort: 'audio-out-1', color: '#ff5e57' },
        { fromId: 'vca1', fromPort: 'out', toId: 'wsOut', toPort: 'audio-out-2', color: '#ff5e57' }
      ],
      nextId: 100
    }
  }
};

function updatePatchDropdown() {
  const select = $('patchSelect');
  if (!select) return;
  select.innerHTML = '<option value="">-- Load Patch --</option>';
  
  // Add Factory Presets
  const factoryGroup = el('optgroup', '', { label: 'Factory Presets' });
  for (const [key, patch] of Object.entries(FACTORY_PATCHES)) {
    const opt = el('option');
    opt.value = key;
    opt.textContent = patch.name;
    factoryGroup.appendChild(opt);
  }
  select.appendChild(factoryGroup);

  // Add Loupe Presets from patches/
  if (typeof LOUPE_PRESETS !== 'undefined') {
    const loupeGroup = el('optgroup', '', { label: 'Test Patches (.loupe)' });
    for (const key of Object.keys(LOUPE_PRESETS)) {
      const opt = el('option');
      opt.value = 'loupe_' + key;
      const title = key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      opt.textContent = `📄 ${title}`;
      loupeGroup.appendChild(opt);
    }
    select.appendChild(loupeGroup);
  }

  // Add User Presets
  const userGroup = el('optgroup', '', { label: 'My Saved Patches' });
  let hasUserPatches = false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('flare_patch_')) {
      const name = key.substring('flare_patch_'.length);
      const opt = el('option');
      opt.value = key;
      opt.textContent = name;
      userGroup.appendChild(opt);
      hasUserPatches = true;
    }
  }
  if (hasUserPatches) {
    select.appendChild(userGroup);
  }
}

function savePatch() {
  const name = prompt('Enter a name for this patch:', '');
  if (!name) return;
  const key = 'flare_patch_' + name.trim();
  const patchData = {
    state: {
      rows: state.rows,
      cables: state.cables,
      nextId: state.nextId
    }
  };
  localStorage.setItem(key, JSON.stringify(patchData));
  updatePatchDropdown();
  const select = $('patchSelect');
  if (select) select.value = key;
}

function deletePatch() {
  const select = $('patchSelect');
  const key = select.value;
  if (!key) {
    alert('Please select a saved patch to delete.');
    return;
  }
  if (key.startsWith('factory_') || key.startsWith('loupe_')) {
    alert('Factory and Loupe presets cannot be deleted!');
    return;
  }
  if (confirm(`Are you sure you want to delete "${key.substring('flare_patch_'.length)}"?`)) {
    localStorage.removeItem(key);
    updatePatchDropdown();
    generateCode();
  }
}

const NOTE_OFFSETS = {
  'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'FB': 4, 'F': 5, 'F#': 6, 'GB': 6,
  'G': 7, 'G#': 8, 'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11, 'CB': 11
};

function parseParamValue(valStr) {
  if (typeof valStr !== 'string') {
    if (typeof valStr === 'number') return valStr;
    return 0;
  }
  if (/^\d+$/.test(valStr)) {
    return parseInt(valStr);
  }
  const match = valStr.match(/^([A-G]#?|D[b-g]?|E[b-g]?|F[b-g]?|G[b-g]?|A[b-g]?|B[b-g]?|C[b-g]?)(-?\d+)$/i);
  if (match) {
    const name = match[1].toUpperCase();
    const octave = parseInt(match[2]);
    const semitones = NOTE_OFFSETS[name];
    if (semitones !== undefined) {
      const noteNum = (octave + 1) * 12 + semitones;
      return Math.round((noteNum / 127) * 4095);
    }
  }
  return 0;
}

function loadLoupePatch(loupeCode) {
  try {
    // Check if the script contains a saved layout comment
    const layoutMatch = loupeCode.match(/;\s*flare_layout:\s*(\{.*\})/);
    if (layoutMatch) {
      try {
        const layoutData = JSON.parse(layoutMatch[1]);
        if (layoutData && layoutData.rows && layoutData.cables) {
          state.rows = layoutData.rows;
          state.cables = layoutData.cables;
          state.nextId = layoutData.nextId || 100;
          
          // Re-render visual patcher directly from metadata
          const rackCase = $('rackCase');
          rackCase.innerHTML = '';
          for (let i = 0; i < state.rows.length; i++) {
            const rowEl = buildRowEl(i);
            rackCase.appendChild(rowEl);
            const bay = rowEl.querySelector('.module-bay');
            for (const m of state.rows[i]) {
              const modEl = buildModuleEl(m.type, m.id, m.params, m.left);
              bay.appendChild(modEl);
            }
          }
          setTimeout(redrawCables, 50);
          updateRowWidths();
          generateCode();
          return;
        }
      } catch (err) {
        console.warn("Failed to parse visual layout comment, falling back to AST parser:", err);
      }
    }

    const lines = loupeCode.split('\n').map(line => {
      const idx = line.indexOf(';');
      return idx === -1 ? line : line.substring(0, idx);
    });
    const cleanCode = lines.join(' ');
    const spaced = cleanCode.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ');
    const tokens = spaced.trim().split(/\s+/).filter(Boolean);

    function parseTokens(tks) {
      if (tks.length === 0) return null;
      const t = tks.shift();
      if (t === '(') {
        const list = [];
        while (tks.length > 0 && tks[0] !== ')') {
          list.push(parseTokens(tks));
        }
        tks.shift(); // remove ')'
        return list;
      } else if (t === ')') {
        throw new Error('Unexpected )');
      } else {
        return t;
      }
    }

    const astList = [];
    while (tokens.length > 0) {
      astList.push(parseTokens(tokens));
    }

    const patchAst = astList.find(node => Array.isArray(node) && node[0] === 'patch');
    if (!patchAst) throw new Error('No (patch ...) block found');

    const modules = [];
    const cables = [];
    const env = {};
    let nextAutoId = 1;
    function getAutoId(type) {
      return `${type}${nextAutoId++}`;
    }

    const LOUPE_OP_MAP = {
      sine: 'sine',
      triangle: 'triangle',
      saw: 'saw',
      square: 'square',
      phasor: 'phasor',
      'lfo-delay': 'lfo-delay',
      lpf: 'lpf',
      hpf: 'hpf',
      vcf: 'vcf',
      lpg: 'lpg',
      vca: 'vca',
      wavefold: 'wavefold',
      wavefolder: 'wavefold',
      'lopass-gate': 'lpg',
      crush: 'crush',
      saturate: 'saturate',
      slew: 'slew',
      attenuverter: 'attenuverter',
      clock: 'clock',
      trig: 'trig',
      gate: 'gate',
      chance: 'chance',
      walk: 'walk',
      mix: 'mix',
      add: 'add',
      mul: 'mul',
      toggle: 'toggle',
      gt: 'schmitt',
      lt: 'schmitt',
      eq: 'schmitt',
      ne: 'schmitt',
      ge: 'schmitt',
      le: 'schmitt',
      abs: 'math',
      rect: 'math',
      invert: 'attenuverter',
      'signal-switch': 'signal-switch',
      'seq-switch': 'seq-switch',
      logic: 'logic',
      math: 'math',
      'midi-note': 'midi-note',
      'midi-cc': 'midi-cc',
      'midi-trig': 'midi-trig',
      'midi-clock': 'midi-clock',
      'midi-note-out': 'midi-note-out',
      'midi-cc-out': 'midi-cc-out',
      'midi-clock-out': 'midi-clock-out',
      
      sub: 'math',
      min: 'math',
      max: 'math',
      and: 'logic',
      or: 'logic',
      xor: 'logic',
      not: 'logic',
      
      score: 'score-player',
      step: 'step-seq',
      tape: 'step-seq',
      follow: 'multi-div',
      delay: 'delay',
      reverb: 'reverb',
      wt: 'wt',
      wavetable: 'wt',
      quantizer: 'quantizer',
      snap: 'quantizer',
      quantise: 'quantizer',
      'tape-looper': 'tape-looper',
      'shift-register': 'shift-register',
      benjolin: 'benjolin',
      morph: 'morph',
      'midi-sync': 'midi-sync',
      schmitt: 'schmitt'
    };

    const POSITIONAL_MAPPINGS = {
      sine: ['note', 'fm', 'pm', 'cents', 'depth'],
      triangle: ['note', 'fm', 'pm', 'cents', 'depth'],
      saw: ['note', 'fm', 'pm', 'cents', 'depth'],
      square: ['note', 'fm', 'pm', 'cents', 'depth'],
      phasor: ['hz', 'sync'],
      'lfo-delay': ['trig', 'hz', 'fade'],
      'sub-osc': ['note'],
      quantizer: ['in'],
      snap: ['in'],
      quantise: ['in'],
      'tape-looper': ['in', 'rec', 'speed'],
      'shift-register': ['in', 'trig'],
      benjolin: ['pitch1', 'pitch2'],
      morph: ['in1', 'in2', 'in3', 'in4', 'pos'],
      'midi-sync': [],
      schmitt: ['in'],
      toggle: ['in'],
      gt: ['in'],
      lt: ['in'],
      eq: ['in'],
      ne: ['in'],
      ge: ['in'],
      le: ['in'],
      abs: ['a'],
      rect: ['a'],
      invert: ['in'],
      wt: ['table', 'pitch', 'pos', 'pm'],
      wavetable: ['table', 'pitch', 'pos', 'pm'],
      dx: ['bank', 'preset', 'pitch', 'gate', 'decay', 'tone'],
      delay: ['in', 'time', 'feedback', 'mix'],
      reverb: ['in', 'decay', 'mix'],
      lpf: ['in', 'cut'],
      hpf: ['in', 'cut'],
      vcf: ['in', 'cut', 'res'],
      lpg: ['in', 'ctrl'],
      vca: ['in', 'amp'],
      wavefold: ['in', 'drive'],
      crush: ['in', 'rate'],
      saturate: ['in', 'drive', 'bias', 'mix', 'level'],
      slew: ['in', 'rate'],
      attenuverter: ['in'],
      clock: ['bpm', 'fm', 'width', 'sync'],
      'multi-div': ['trig'],
      rhythm: ['trig'],
      turing: ['trig', 'prob'],
      'score-player': ['speed'],
      'step-seq': ['trig'],
      'drum-seq': ['trig'],
      trig: ['trig', 'rate'],
      gate: ['in', 'thresh', 'len'],
      chance: ['p', 'trig'],
      walk: ['step', 'trig'],
      add: ['a', 'b'],
      mul: ['a', 'gain'],
      'signal-switch': ['cond', 'a', 'b', 'c'],
      'seq-switch': ['trig', 'in1', 'in2', 'in3', 'in4'],
      logic: ['a', 'b'],
      math: ['a', 'b'],
      mix: ['a', 'b', 'c', 'd'],
      'midi-note': ['ch'],
      'midi-cc': ['cc', 'ch'],
      'midi-trig': ['note', 'ch'],
      'midi-note-out': ['pitch', 'gate', 'vel', 'ch'],
      'midi-cc-out': ['val', 'cc', 'ch'],
      'midi-clock-out': ['clk']
    };

    const resolveSource = (childExpr) => {
      if (!childExpr) return null;
      if (typeof childExpr === 'string') {
        if (env[childExpr]) {
          return env[childExpr];
        }
        if (modules.some(m => m.id === childExpr)) {
          return { fromId: childExpr, fromPort: 'out' };
        }
        return null;
      }
      if (Array.isArray(childExpr)) {
        const op = childExpr[0];
        if (op === 'normal' || op === 'or') {
          const aSrc = resolveSource(childExpr[1]);
          if (aSrc) return aSrc;
          const bSrc = resolveSource(childExpr[2]);
          if (bSrc) return bSrc;
        }

        if (childExpr[0] === 'step' || childExpr[0] === 'onsets') {
          const tapeVar = childExpr[1];
          if (typeof tapeVar === 'string' && env[tapeVar] && env[tapeVar].type === 'tape') {
            const isTuring = tapeVar === 'loop' || modules.some(m => m.id === tapeVar && m.type === 'turing');
            const targetType = isTuring ? 'turing' : 'step-seq';
            
            if (!modules.some(m => m.id === tapeVar)) {
              const params = {};
              if (targetType === 'step-seq') {
                const list = env[tapeVar].list || [];
                for (let i = 0; i < Math.min(8, list.length); i++) {
                  params[`val${i+1}`] = parseParamValue(list[i]);
                }
                params['steps'] = Math.round((list.length / 8) * 4095);
              }
              modules.push({ id: tapeVar, type: targetType, params });
            }
            
            let trigSrc = null;
            for (let i = 2; i < childExpr.length; i += 2) {
              if (childExpr[i] === ':trig') trigSrc = resolveSource(childExpr[i+1]);
            }
            if (trigSrc) {
              cables.push({ fromId: trigSrc.fromId, fromPort: trigSrc.fromPort, toId: tapeVar, toPort: 'trig' });
            }
            
            return { fromId: tapeVar, fromPort: 'out' };
          } else if (Array.isArray(tapeVar)) {
            const resolvedTape = resolveSource(tapeVar);
            if (resolvedTape && resolvedTape.fromId) {
              let trigSrc = null;
              for (let i = 2; i < childExpr.length; i += 2) {
                if (childExpr[i] === ':trig') trigSrc = resolveSource(childExpr[i+1]);
              }
              if (trigSrc) {
                cables.push({ fromId: trigSrc.fromId, fromPort: trigSrc.fromPort, toId: resolvedTape.fromId, toPort: 'trig' });
              }
              return resolvedTape;
            }
          }
        }

        const childId = parseNode(childExpr);
        if (childId) {
          if (typeof childId === 'object') {
            return childId;
          }
          if (childId.startsWith('wsIn-')) {
            const parts = childId.split('-');
            return { fromId: 'wsIn', fromPort: parts.slice(1).join('-') };
          }
          return { fromId: childId, fromPort: 'out' };
        }
      }
      return null;
    };

    function parseNode(expr) {
      if (!expr) return null;
      if (typeof expr === 'string') {
        if (env[expr]) return env[expr];
        if (modules.some(m => m.id === expr)) return expr;
        return null;
      }
      if (Array.isArray(expr)) {
        const op = expr[0];

        if (typeof op === 'string' && env[op] && env[op].type === 'fn') {
          const fnDef = env[op];
          const substMap = {};
          
          const callPosArgs = [];
          const callKeyArgs = {};
          for (let i = 1; i < expr.length; i++) {
            const arg = expr[i];
            if (typeof arg === 'string' && arg.startsWith(':')) {
              callKeyArgs[arg.substring(1)] = expr[i+1];
              i++;
            } else {
              callPosArgs.push(arg);
            }
          }
          
          for (let i = 0; i < fnDef.params.length; i++) {
            const paramName = fnDef.params[i];
            const argVal = callKeyArgs[paramName] !== undefined ? callKeyArgs[paramName] : callPosArgs[i];
            substMap[paramName] = argVal;
            substMap[':' + paramName] = argVal;
          }
          
          function substitute(bodyExpr, map) {
            if (typeof bodyExpr === 'string') {
              if (map[bodyExpr] !== undefined) return map[bodyExpr];
              const clean = bodyExpr.startsWith(':') ? bodyExpr.substring(1) : bodyExpr;
              if (map[clean] !== undefined) return map[clean];
              return bodyExpr;
            }
            if (Array.isArray(bodyExpr)) {
              return bodyExpr.map(child => substitute(child, map));
            }
            return bodyExpr;
          }
          
          let lastResult = null;
          for (const bodyForm of fnDef.body) {
            const expandedForm = substitute(bodyForm, substMap);
            lastResult = parseNode(expandedForm);
          }
          return lastResult;
        }
        
        if (typeof op === 'string' && (env[op] || modules.some(m => m.id === op))) {
          const mod = modules.find(m => m.id === op);
          if (mod) {
            const port = expr[1];
            if (typeof port === 'string' && port.startsWith(':')) {
              let portName = port.substring(1);
              if (mod.type === 'score-player') {
                if (portName === 'notes') portName = 'note';
                if (portName === 'rhythm') portName = 'gate';
              }
              return { fromId: op, fromPort: portName };
            }
          }
        }

        if (op === 'trig') {
          const positionalArgs = [];
          const keywordArgs = {};
          for (let i = 1; i < expr.length; i++) {
            const arg = expr[i];
            if (typeof arg === 'string' && arg.startsWith(':')) {
              keywordArgs[arg.substring(1)] = expr[i+1];
              i++;
            } else {
              positionalArgs.push(arg);
            }
          }
          if (positionalArgs.length === 0) {
            const defaultClock = modules.find(m => m.id === 'master') || modules.find(m => m.type === 'clock');
            const clkExpr = keywordArgs.trig || (defaultClock ? defaultClock.id : null);
            if (clkExpr) {
              return resolveSource(clkExpr);
            }
          }
        }

        if (op === 'groove') {
          // Parse a groove DSL block into a drum-seq, individual voices, and a mixer
          const keywordArgs = {};
          const voices = [];
          for (let i = 1; i < expr.length; i++) {
            const arg = expr[i];
            if (typeof arg === 'string' && arg.startsWith(':')) {
              keywordArgs[arg.substring(1)] = expr[i+1];
              i++;
            } else if (Array.isArray(arg)) {
              voices.push(arg);
            }
          }

          const drumSeqId = getAutoId('drum-seq');
          const drumSeqParams = {
            kickPat: [0,0,0,0,0,0,0,0],
            snarePat: [0,0,0,0,0,0,0,0],
            hatPat: [0,0,0,0,0,0,0,0],
            percPat: [0,0,0,0,0,0,0,0]
          };

          modules.push({ id: drumSeqId, type: 'drum-seq', params: drumSeqParams });

          const trigSrc = resolveSource(keywordArgs.trig);
          if (trigSrc) {
            cables.push({ fromId: trigSrc.fromId, fromPort: trigSrc.fromPort, toId: drumSeqId, toPort: 'trig' });
          }

          const mixId = getAutoId('mix');
          const mixParams = {};
          modules.push({ id: mixId, type: 'mix', params: mixParams });

          const RHYTHMS = {
            'four-on-floor': [1,0,0,0,1,0,0,0],
            'backbeat': [0,0,1,0,0,0,1,0],
            'eighths': [1,0,1,0,1,0,1,0],
            'offbeat': [0,1,0,1,0,1,0,1],
            'sixteenths': [1,1,1,1,1,1,1,1],
            'downbeat': [1,0,0,0,0,0,0,0]
          };

          const voiceChannels = ['a', 'b', 'c', 'd'];
          let activeChans = 0;

          for (const vExpr of voices) {
            const voiceOp = vExpr[0];
            const isSupported = ['kick', 'snare', 'hat', 'perc', 'tom'].includes(voiceOp);
            if (!isSupported) continue;

            const voiceType = (voiceOp === 'tom' || voiceOp === 'perc') ? 'snare' : voiceOp;
            const voiceModId = getAutoId(voiceType);
            const voiceParams = {};

            const vPosArgs = [];
            const vKeyArgs = {};
            for (let i = 1; i < vExpr.length; i++) {
              const arg = vExpr[i];
              if (typeof arg === 'string' && arg.startsWith(':')) {
                vKeyArgs[arg.substring(1)] = vExpr[i+1];
                i++;
              } else {
                vPosArgs.push(arg);
              }
            }

            // Set rhythm pattern on drum-seq
            const rhythmName = vKeyArgs.on;
            let pat = [0,0,0,0,0,0,0,0];
            if (typeof rhythmName === 'string' && RHYTHMS[rhythmName]) {
              pat = RHYTHMS[rhythmName];
            } else if (Array.isArray(rhythmName)) {
              if (rhythmName[0] === 'euclid') {
                const pulses = parseInt(rhythmName[1]) || 5;
                const steps = parseInt(rhythmName[2]) || 8;
                for (let s = 0; s < Math.min(8, steps); s++) {
                  if (((s * pulses) % steps) < pulses) pat[s] = 1;
                }
              }
            }

            const targetTrack = voiceOp === 'tom' ? 'perc' : voiceOp;
            drumSeqParams[targetTrack + 'Pat'] = pat;

            // Map other parameters to the voice module
            const def = MODULE_DEFS[voiceType];
            const mapping = POSITIONAL_MAPPINGS[voiceType] || [];
            for (let i = 0; i < Math.min(vPosArgs.length, mapping.length); i++) {
              const key = mapping[i];
              if (vKeyArgs[key] === undefined) {
                vKeyArgs[key] = vPosArgs[i];
              }
            }

            for (const [paramName, argVal] of Object.entries(vKeyArgs)) {
              if (paramName === 'on') continue;
              const src = resolveSource(argVal);
              if (src) {
                cables.push({ fromId: src.fromId, fromPort: src.fromPort, toId: voiceModId, toPort: paramName });
              } else {
                if (typeof argVal === 'string' && env[argVal] && env[argVal].value !== undefined) {
                  voiceParams[paramName] = env[argVal].value;
                } else {
                  voiceParams[paramName] = parseParamValue(argVal);
                }
              }
            }

            modules.push({ id: voiceModId, type: voiceType, params: voiceParams });

            // Connect trigger from sequencer to voice
            cables.push({
              fromId: drumSeqId,
              fromPort: targetTrack,
              toId: voiceModId,
              toPort: 'trig'
            });

            // Connect audio out of voice to mixer
            if (activeChans < 4) {
              cables.push({
                fromId: voiceModId,
                fromPort: 'out',
                toId: mixId,
                toPort: voiceChannels[activeChans]
              });
              activeChans++;
            }
          }

          return { fromId: mixId, fromPort: 'out' };
        }

        if (op === 'def') {
          const name = expr[1];
          const valExpr = expr[2];

          if (Array.isArray(valExpr) && valExpr[0] === 'fn') {
            const paramsList = valExpr[1] || [];
            const params = paramsList.filter(p => typeof p === 'string' && p !== '=>').map(p => p.startsWith(':') ? p.substring(1) : p);
            env[name] = { type: 'fn', params, body: valExpr.slice(2) };
            return name;
          }
          
          if (Array.isArray(valExpr) && valExpr[0] === 'tape') {
            const list = valExpr.find(Array.isArray) || [];
            env[name] = { type: 'tape', list: list };
            return name;
          }
          
          const src = resolveSource(valExpr);
          if (src) {
            env[name] = src;
            const mod = modules.find(m => m.id === src.fromId);
            if (mod && src.fromPort === 'out') {
              const oldId = mod.id;
              mod.id = name;
              env[name].fromId = name;
              for (const c of cables) {
                if (c.fromId === oldId) c.fromId = name;
                if (c.toId === oldId) c.toId = name;
              }
            }
          } else {
            if (typeof valExpr === 'string') {
              if (!isNaN(parseFloat(valExpr))) {
                env[name] = { value: parseFloat(valExpr) };
              } else {
                env[name] = { value: parseParamValue(valExpr) };
              }
            }
          }
          return name;
        }

        if (op === '<-') {
          const sink = expr[1];
          const source = expr[2];
          
          if (typeof sink === 'string' && env[sink] && env[sink].type === 'tape') {
            const tapeName = sink;
            const id = tapeName;
            if (!modules.some(m => m.id === id)) {
              modules.push({ id, type: 'turing', params: {} });
            }
            
            let trigSrc = null;
            const keywordArgs = {};
            for (let i = 3; i < expr.length; i += 2) {
              if (typeof expr[i] === 'string' && expr[i].startsWith(':')) {
                keywordArgs[expr[i].substring(1)] = expr[i+1];
              }
            }
            if (keywordArgs.trig) {
              trigSrc = resolveSource(keywordArgs.trig);
            }
            
            if (Array.isArray(source) && source[0] === 'if') {
              const cond = source[1];
              if (Array.isArray(cond) && cond[0] === 'chance') {
                const probExpr = cond[1];
                const probSrc = resolveSource(probExpr);
                if (probSrc) {
                  cables.push({ fromId: probSrc.fromId, fromPort: probSrc.fromPort, toId: id, toPort: 'prob' });
                }
                if (!trigSrc) {
                  for (let i = 2; i < cond.length; i += 2) {
                    if (cond[i] === ':trig') trigSrc = resolveSource(cond[i+1]);
                  }
                }
              }
            }
            
            if (trigSrc) {
              cables.push({ fromId: trigSrc.fromId, fromPort: trigSrc.fromPort, toId: id, toPort: 'trig' });
            }
            return null;
          }

          const src = resolveSource(source);
          const sinkId = parseNode(sink);
          if (src && sinkId) {
            if (typeof sinkId === 'object') {
              cables.push({
                fromId: src.fromId,
                fromPort: src.fromPort,
                toId: sinkId.fromId,
                toPort: sinkId.fromPort
              });
            } else if (sinkId.startsWith('wsOut-')) {
              const parts = sinkId.split('-');
              const toPort = parts.slice(1).join('-');
              cables.push({
                fromId: src.fromId,
                fromPort: src.fromPort,
                toId: 'wsOut',
                toPort: toPort
              });
            }
          }
          return src;
        }

        if (op === 'if') {
          const id = getAutoId('signal-switch');
          const params = {};
          
          let condExpr = expr[1];
          let cExpr = null;
          let bExpr = null;
          let aExpr = null;

          if (Array.isArray(condExpr) && condExpr[0] === 'up' && Array.isArray(expr[3]) && expr[3][0] === 'if') {
            condExpr = condExpr[1];
            cExpr = expr[2];
            const nestedIf = expr[3];
            const nestedCond = nestedIf[1];
            if (Array.isArray(nestedCond) && nestedCond[0] === 'mid') {
              bExpr = nestedIf[2];
              aExpr = nestedIf[3];
            } else {
              bExpr = nestedIf[2];
              aExpr = nestedIf[3];
            }
          } else {
            aExpr = expr[2];
            bExpr = expr[3];
          }

          modules.push({ id, type: 'signal-switch', params });

          const wireInput = (targetPort, childExpr) => {
            const src = resolveSource(childExpr);
            if (src) {
              cables.push({ fromId: src.fromId, fromPort: src.fromPort, toId: id, toPort: targetPort });
            }
          };

          wireInput('cond', condExpr);
          wireInput('a', aExpr);
          wireInput('b', bExpr);
          wireInput('c', cExpr);

          return id;
        }

        const mappedType = LOUPE_OP_MAP[op];
        if (mappedType && MODULE_DEFS[mappedType]) {
          const id = getAutoId(mappedType);
          const params = {};
          
          const positionalArgs = [];
          const keywordArgs = {};
          for (let i = 1; i < expr.length; i++) {
            const arg = expr[i];
            if (typeof arg === 'string' && arg.startsWith(':')) {
              keywordArgs[arg.substring(1)] = expr[i+1];
              i++;
            } else {
              positionalArgs.push(arg);
            }
          }
          
          const mapping = POSITIONAL_MAPPINGS[op] || POSITIONAL_MAPPINGS[mappedType] || [];
          for (let i = 0; i < Math.min(positionalArgs.length, mapping.length); i++) {
            const key = mapping[i];
            if (keywordArgs[key] === undefined) {
              keywordArgs[key] = positionalArgs[i];
            }
          }
          
          if (mappedType === 'score-player') {
            let patVal = keywordArgs['pat'] || keywordArgs['pattern'] || positionalArgs[0];
            if (patVal === "'" && positionalArgs[1]) {
              patVal = positionalArgs[1];
            }
            if (patVal) {
              if (Array.isArray(patVal)) {
                const list = patVal.find(Array.isArray) || patVal;
                params['pattern'] = '[' + list.join(' ').toLowerCase() + ']';
              } else if (typeof patVal === 'string') {
                params['pattern'] = patVal.toLowerCase();
              }
            }
          }

          if (['sine', 'triangle', 'saw', 'square'].includes(mappedType)) {
            if (keywordArgs.hz) {
              keywordArgs['note'] = keywordArgs['hz'];
              delete keywordArgs['hz'];
              params['range'] = 4095; // Set to LFO range (discrete knob index 1)
            }
          }

          for (const [paramName, argVal] of Object.entries(keywordArgs)) {
            const src = resolveSource(argVal);
            if (src) {
              cables.push({ fromId: src.fromId, fromPort: src.fromPort, toId: id, toPort: paramName });
            } else {
              if (typeof argVal === 'string' && env[argVal] && env[argVal].value !== undefined) {
                params[paramName] = env[argVal].value;
              } else {
                params[paramName] = parseParamValue(argVal);
              }
            }
          }
          
          modules.push({ id, type: mappedType, params });
          
          if (op === 'sub' || op === 'min' || op === 'max' || op === 'and' || op === 'or' || op === 'xor' || op === 'not') {
            return { fromId: id, fromPort: op };
          }
          if (mappedType === 'multi-div') {
            return { fromId: id, fromPort: 'div2' };
          }
          
          return id;
        }

        if (op === 'audio-out' || op === 'cv-out' || op === 'pulse-out') {
          const label = expr[1];
          const portNum = (label && label.startsWith(':')) ? label.substring(1) : (label || '1');
          return `wsOut-${op}-${portNum}`;
        }
        if (op === 'cv-in' || op === 'knob' || op === 'audio-in' || op === 'pulse-in') {
          const label = expr[1];
          const portName = (label && label.startsWith(':')) ? label.substring(1) : (label || 'main');
          return `wsIn-${op}-${portName}`;
        }

        for (const child of expr) {
          if (Array.isArray(child)) parseNode(child);
        }
      }
      return null;
    }

    for (let i = 1; i < patchAst.length; i++) {
      parseNode(patchAst[i]);
    }

    state.rows = [[], []];
    state.cables = [];
    state.nextId = nextAutoId + 100;

    state.rows[0].push({ id: 'wsIn', type: 'ws-in', left: 0, params: {} });
    state.rows[1].push({ id: 'wsOut', type: 'ws-out', left: 0, params: {} });

    let leftRow0 = 120;
    let leftRow1 = 120;

    for (const m of modules) {
      const def = MODULE_DEFS[m.type];
      const hp = def ? def.hp : 6;
      const width = hp * HP;
      
      let rowIdx = 1;
      if (def?.category === 'clocks' || def?.category === 'gates' || def?.category === 'midi' || m.type === 'lfo') {
        rowIdx = 0;
      }
      
      let left;
      if (rowIdx === 0) {
        left = leftRow0;
        leftRow0 += width + 15;
      } else {
        left = leftRow1;
        leftRow1 += width + 15;
      }

      state.rows[rowIdx].push({
        id: m.id,
        type: m.type,
        left: left,
        params: m.params
      });
    }

    // Auto-patch default clock to unconnected trig inputs
    const defaultClock = modules.find(m => m.id === 'master') || modules.find(m => m.type === 'clock');
    if (defaultClock) {
      for (const m of modules) {
        const def = MODULE_DEFS[m.type];
        if (def && def.inputs && def.inputs.some(i => i.id === 'trig')) {
          const hasTrigCable = cables.some(c => c.toId === m.id && c.toPort === 'trig');
          if (!hasTrigCable) {
            cables.push({
              fromId: defaultClock.id,
              fromPort: 'out',
              toId: m.id,
              toPort: 'trig'
            });
          }
        }
      }
    }

    for (const c of cables) {
      c.color = cableColor(c.fromId, c.fromPort, c.toId, c.toPort);
    }
    state.cables = cables;

    const rackCase = $('rackCase');
    rackCase.innerHTML = '';
    
    for (let i = 0; i < state.rows.length; i++) {
      const rowEl = buildRowEl(i);
      rackCase.appendChild(rowEl);
      const bay = rowEl.querySelector('.module-bay');
      for (const m of state.rows[i]) {
        const modEl = buildModuleEl(m.type, m.id, m.params, m.left);
        bay.appendChild(modEl);
      }
    }
    
    setTimeout(redrawCables, 50);
    updateRowWidths();
    generateCode();
  } catch (err) {
    alert('Error loading Loupe patch: ' + err.message);
  }
}

function loadPatch(key) {
  if (!key) return;
  if (key.startsWith('loupe_')) {
    const patchName = key.substring('loupe_'.length);
    const loupeCode = LOUPE_PRESETS[patchName];
    if (loupeCode) {
      loadLoupePatch(loupeCode);
    }
    return;
  }

  let data;
  if (key.startsWith('factory_')) {
    // Load deep copy of factory preset to prevent mutation
    data = JSON.parse(JSON.stringify(FACTORY_PATCHES[key]));
  } else {
    const dataStr = localStorage.getItem(key);
    if (!dataStr) return;
    try {
      data = JSON.parse(dataStr);
    } catch (e) {
      alert('Error loading patch: ' + e.message);
      return;
    }
  }
  
  try {
    if (!data || !data.state) throw new Error('Invalid patch format');
    
    state.rows = data.state.rows;
    state.cables = data.state.cables;
    state.nextId = data.state.nextId;
    
    const rackCase = $('rackCase');
    rackCase.innerHTML = '';
    
    for (let i = 0; i < state.rows.length; i++) {
      const rowEl = buildRowEl(i);
      rackCase.appendChild(rowEl);
      const bay = rowEl.querySelector('.module-bay');
      for (const m of state.rows[i]) {
        const modEl = buildModuleEl(m.type, m.id, m.params, m.left);
        bay.appendChild(modEl);
      }
    }
    
    setTimeout(redrawCables, 50);
    updateRowWidths();
    generateCode();
  } catch (e) {
    alert('Error loading patch: ' + e.message);
  }
}
