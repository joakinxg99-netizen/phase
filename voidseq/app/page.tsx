"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import * as Tone from "tone";
import {
  Play,
  Square,
  Shuffle,
  Zap,
  Skull,
  RotateCcw,
  Upload,
  X,
  RefreshCw,
  Settings,
  Download,
  Volume2,
  Moon,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepLock {
  tone?: number;     // 0-100 tonal brightness / pitch / cutoff
  space?: number;    // 0-100 reverb / feedback / ambience
  drive?: number;    // 0-100 saturation / grit
  decay?: number;    // 0-100 envelope length
}

interface Step {
  active: boolean;
  probability: number; // 25 | 50 | 75 | 100
  ratchet: number;     // 1 | 2 | 4
  velocity: number;    // 40 | 70 | 100
  note?: string;       // BASS / SYNTH note sequencer
  gate?: string;       // 32n | 16n | 8n
  chord?: ChordMode;   // SYNTH chord mode
  locks?: StepLock;   // parameter locks per step
}

interface MasterFxState {
  filter: number; // 0 lowpass dark, 50 neutral, 100 highpass bright
  reverb: number; // 0-100
  delay: number;  // 0-100
  drive: number;  // 0-100
}

interface SynthModState {
  lfoRate: number;    // 0-100 mapped to 0.1-20 Hz
  lfoDepth: number;   // 0-100 mapped to modulation depth
  filterEnv: number;  // 0-100 extra filter brightness / movement
  pluckDecay: number; // 0-100 mapped to short/long decay
  fmAmount: number;   // 0-100 mapped to warm color / harmonic brightness
  detune: number;     // 0-100 mapped to cents
  delaySend: number;  // 0-100
  reverbSend: number; // 0-100
}

type SynthWaveform = "sine" | "triangle" | "sawtooth" | "square" | "fatsawtooth";
type SynthFilterType = "lowpass" | "bandpass" | "highpass" | "notch";
type SynthLfoTarget = "filter" | "pitch" | "fm" | "volume"; // "fm" is used as COLOR target for the warm synth engine
type ChordMode = "SINGLE" | "MINOR" | "SUS2" | "SUS4" | "MIN7" | "OCTAVE" | "POWER";
type ArpMode = "OFF" | "UP" | "DOWN" | "UPDOWN" | "RANDOM" | "OCTAVE" | "RATCHET";
type ArpRate = "8n" | "16n" | "32n" | "16t";

interface SynthVoiceState {
  waveform: SynthWaveform;
  octave: number; // -2 to +2
  glide: number;  // 0-100 mapped to portamento
  filterType: SynthFilterType;
  lfoTarget: SynthLfoTarget;
}

interface ArpState {
  mode: ArpMode;
  rate: ArpRate;
  gate: number;   // 0-100 note length inside each arp step
  octaves: number; // 1-3
}

type SidechainTarget = "SYNTH" | "BASS" | "BOTH" | "TEXTURE";

interface SidechainState {
  pump: number;    // 0-100 ducking amount
  tight: number;   // 0-100 attack / snap
  release: number; // 0-100 recovery time
  target: SidechainTarget;
}

interface BassPerformanceState {
  sub: number;    // 0-100 sub layer amount
  punch: number;  // 0-100 attack snap / transient
  cutoff: number; // 0-100 bass lowpass range
  drive: number;  // 0-100 bass saturation
  decay: number;  // 0-100 note length / release
  glide: number;  // 0-100 portamento
}

interface DrumDesignerState {
  kick: { pitch: number; decay: number; click: number; body: number; drive: number };
  hat: { brightness: number; decay: number; air: number; texture: number };
  perc: { tone: number; resonance: number; snap: number; space: number };
  fx: { size: number; feedback: number; tone: number; noise: number };
}

type EuclideanTrackId = "HAT" | "PERC A" | "PERC B" | "TEXTURE";

interface EuclideanLaneState {
  enabled: boolean;
  hits: number;
  rotate: number;
}

type EuclideanState = Record<EuclideanTrackId, EuclideanLaneState>;

type PerformancePadMode = "SYNTH" | "ATMOS" | "MASTER";

interface PerformancePadState {
  x: number;      // 0-1 left to right
  y: number;      // 0-1 bottom to top
  mode: PerformancePadMode;
  hold: boolean;
  active: boolean;
}

type ToneTrackId = "BASS" | "SYNTH";

interface TrackEqState {
  low: number;    // 0-100, neutral at 50
  mid: number;    // 0-100, neutral at 50
  high: number;   // 0-100, neutral at 50
  cutoff: number; // 0-100
}

type ToneEqState = Record<ToneTrackId, TrackEqState>;

interface PresetData {
  id: string;
  name: string;
  createdAt: number;
  pattern: Step[][];
  bpm: number;
  knobs: { groove: number; chaos: number; density: number; phase: number };
  volumes: Record<TrackId, number>;
  mutes: Record<TrackId, boolean>;
  solos: Record<TrackId, boolean>;
  sampleNames: Partial<Record<SampleTrack, string>>;
  masterFx?: MasterFxState;
  masterVolume?: number;
  synthMod?: SynthModState;
  synthVoice?: SynthVoiceState;
  arp?: ArpState;
  sidechain?: SidechainState;
  bassPerformance?: BassPerformanceState;
  drumDesigner?: DrumDesignerState;
  euclidean?: EuclideanState;
  toneEq?: ToneEqState;
  trackLengths?: Record<TrackId, number>;
}

const PROB_CYCLE  = [100, 75, 50, 25] as const;
const RATCH_CYCLE = [1, 2, 4] as const;
const VELOCITY_CYCLE = [100, 70, 40] as const;
const GATE_CYCLE = ["16n", "8n", "32n"] as const;
const BASS_NOTE_CYCLE = ["D1", "F1", "A1", "C2", "G1", "A#1"] as const;
const SYNTH_NOTE_CYCLE = ["D3", "F3", "A3", "C4", "G3", "A#3"] as const;
const CHORD_MODE_CYCLE = ["SINGLE", "MINOR", "SUS2", "SUS4", "MIN7", "OCTAVE", "POWER"] as const;
const ARP_MODES = ["OFF", "UP", "DOWN", "UPDOWN", "RANDOM", "OCTAVE", "RATCHET"] as const;
const ARP_RATES = ["8n", "16n", "32n", "16t"] as const;
const CHORD_LABELS: Record<ChordMode, string> = {
  SINGLE: "1",
  MINOR: "MIN",
  SUS2: "SUS2",
  SUS4: "SUS4",
  MIN7: "M7",
  OCTAVE: "OCT",
  POWER: "PWR",
};
const CHORD_INTERVALS: Record<ChordMode, number[]> = {
  SINGLE: [0],
  MINOR: [0, 3, 7],
  SUS2: [0, 2, 7],
  SUS4: [0, 5, 7],
  MIN7: [0, 3, 7, 10],
  OCTAVE: [0, 12],
  POWER: [0, 7, 12],
};
const POLY_LENGTH_CYCLE = [16, 14, 12, 10, 8, 6, 4] as const;
const TRACK_LENGTH_PRESETS = [4, 6, 8, 10, 12, 14, 16] as const;

function nextProb(p: number): number {
  const i = PROB_CYCLE.indexOf(p as typeof PROB_CYCLE[number]);
  return PROB_CYCLE[(i + 1) % PROB_CYCLE.length];
}
function nextRatch(r: number): number {
  const i = RATCH_CYCLE.indexOf(r as typeof RATCH_CYCLE[number]);
  return RATCH_CYCLE[(i + 1) % RATCH_CYCLE.length];
}
function nextVelocity(v: number): number {
  const i = VELOCITY_CYCLE.indexOf(v as typeof VELOCITY_CYCLE[number]);
  return VELOCITY_CYCLE[(i + 1) % VELOCITY_CYCLE.length];
}
function nextGate(g?: string): string {
  const i = GATE_CYCLE.indexOf((g || "16n") as typeof GATE_CYCLE[number]);
  return GATE_CYCLE[(i + 1) % GATE_CYCLE.length];
}
function nextNote(track: TrackId, note?: string): string {
  const cycle: readonly string[] = track === "BASS" ? BASS_NOTE_CYCLE : SYNTH_NOTE_CYCLE;
  const fallback = cycle[0] || "D1";
  const i = cycle.indexOf(note || fallback);
  return cycle[(i + 1) % cycle.length] || fallback;
}
function nextTrackLength(length: number): number {
  const i = POLY_LENGTH_CYCLE.indexOf(length as typeof POLY_LENGTH_CYCLE[number]);
  return POLY_LENGTH_CYCLE[(i + 1) % POLY_LENGTH_CYCLE.length];
}
function nextChordMode(chord?: ChordMode): ChordMode {
  const i = CHORD_MODE_CYCLE.indexOf((chord || "SINGLE") as typeof CHORD_MODE_CYCLE[number]);
  return CHORD_MODE_CYCLE[(i + 1) % CHORD_MODE_CYCLE.length];
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const BASS_RANDOM_NOTES = ["D1", "F1", "G1", "A1", "A#1", "C2"] as const;
const SYNTH_RANDOM_NOTES = ["D3", "F3", "G3", "A3", "A#3", "C4"] as const;

function parseNote(note?: string) {
  const fallback = { name: "D", octave: 1 };
  if (!note) return fallback;
  const match = note.match(/^([A-G]#?)(-?\d)$/);
  if (!match) return fallback;
  return { name: match[1], octave: Number(match[2]) };
}

function transposeNote(note: string | undefined, semitones: number, fallback = "D1") {
  const parsed = parseNote(note || fallback);
  const idx = NOTE_NAMES.indexOf(parsed.name as typeof NOTE_NAMES[number]);
  const base = idx >= 0 ? idx : NOTE_NAMES.indexOf("D");
  const midi = parsed.octave * 12 + base + semitones;
  const nextName = NOTE_NAMES[((midi % 12) + 12) % 12];
  const nextOctave = Math.max(0, Math.min(6, Math.floor(midi / 12)));
  return `${nextName}${nextOctave}`;
}

function buildChordNotes(note: string | undefined, chord: ChordMode = "SINGLE", octaveShift = 0) {
  const baseNote = transposeNote(note || "D3", octaveShift * 12, "D3");
  return (CHORD_INTERVALS[chord] || CHORD_INTERVALS.SINGLE).map((semitones) =>
    transposeNote(baseNote, semitones, "D3")
  );
}

function buildArpNotes(notes: string[], arp: ArpState, stepIndex = 0) {
  const base = notes.length ? notes : ["D3"];
  if (arp.mode === "OFF") return base;
  const octaves = Math.max(1, Math.min(3, arp.octaves || 1));
  const expanded = Array.from({ length: octaves }, (_, octave) =>
    base.map((note) => transposeNote(note, octave * 12, "D3"))
  ).flat();
  if (arp.mode === "DOWN") return [...expanded].reverse();
  if (arp.mode === "UPDOWN") {
    const down = expanded.length > 2 ? expanded.slice(1, -1).reverse() : expanded.slice().reverse();
    return [...expanded, ...down];
  }
  if (arp.mode === "RANDOM") {
    return Array.from({ length: Math.max(6, expanded.length * 2) }, (_, i) => {
      const idx = Math.abs((stepIndex * 7 + i * 5 + 3) % expanded.length);
      return expanded[idx] || expanded[0];
    });
  }
  if (arp.mode === "OCTAVE") return expanded;
  if (arp.mode === "RATCHET") return expanded.flatMap((note, i) => i % 2 === 0 ? [note, note, note] : [note, note]);
  return expanded;
}

function arpRateLabel(rate: ArpRate) {
  if (rate === "8n") return "1/8";
  if (rate === "16n") return "1/16";
  if (rate === "32n") return "1/32";
  return "1/16T";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const tracks = ["KICK", "HAT", "PERC A", "PERC B", "TEXTURE", "BASS", "SYNTH"] as const;
type TrackId = (typeof tracks)[number];
const LITE_PLAYBACK_TRACKS: TrackId[] = ["KICK", "HAT", "BASS", "SYNTH"];
const RATCHET_TRACKS = new Set<TrackId>(["HAT", "PERC A", "PERC B", "TEXTURE"]);
const steps = 16;
const DEFAULT_TRACK_LENGTHS: Record<TrackId, number> = {
  KICK: 4,
  HAT: 14,
  "PERC A": 12,
  "PERC B": 10,
  TEXTURE: 8,
  BASS: 8,
  SYNTH: 12,
};

const EUCLIDEAN_TRACKS = ["HAT", "PERC A", "PERC B", "TEXTURE"] as const;
const DEFAULT_EUCLIDEAN: EuclideanState = {
  HAT: { enabled: false, hits: 7, rotate: 1 },
  "PERC A": { enabled: false, hits: 5, rotate: 2 },
  "PERC B": { enabled: false, hits: 4, rotate: 3 },
  TEXTURE: { enabled: false, hits: 2, rotate: 1 },
};

const SAMPLE_TRACKS = ["KICK", "HAT", "PERC A", "PERC B", "TEXTURE"] as const;
type SampleTrack = (typeof SAMPLE_TRACKS)[number];

interface SampleEntry {
  player: Tone.Player;
  url: string;
}

const PRESET_STORAGE_KEY = "phase.presets.v2";
const MASTER_FX_NEUTRAL: MasterFxState = { filter: 50, reverb: 0, delay: 0, drive: 0 };
const DEFAULT_SYNTH_MOD: SynthModState = {
  lfoRate: 20,
  lfoDepth: 24,
  filterEnv: 34,
  pluckDecay: 32,
  fmAmount: 18,
  detune: 6,
  delaySend: 16,
  reverbSend: 22,
};
const DEFAULT_SYNTH_VOICE: SynthVoiceState = {
  waveform: "triangle",
  octave: 0,
  glide: 8,
  filterType: "lowpass",
  lfoTarget: "filter",
};
const DEFAULT_ARP: ArpState = {
  mode: "OFF",
  rate: "16n",
  gate: 58,
  octaves: 1,
};
const DEFAULT_SIDECHAIN: SidechainState = {
  pump: 45,
  tight: 65,
  release: 35,
  target: "BOTH",
};
const DEFAULT_BASS_PERFORMANCE: BassPerformanceState = {
  // Bass v4 default: more present / rolling melodic techno.
  sub: 58,
  punch: 72,
  cutoff: 64,
  drive: 32,
  decay: 42,
  glide: 10,
};
const DEFAULT_DRUM_DESIGNER: DrumDesignerState = {
  kick: { pitch: 48, decay: 38, click: 68, body: 72, drive: 28 },
  hat: { brightness: 62, decay: 42, air: 54, texture: 46 },
  perc: { tone: 48, resonance: 44, snap: 62, space: 28 },
  fx: { size: 58, feedback: 42, tone: 52, noise: 34 },
};
const DEFAULT_PERFORMANCE_PAD: PerformancePadState = {
  x: 0.5,
  y: 0.5,
  mode: "SYNTH",
  hold: true,
  active: false,
};
const DEFAULT_TONE_EQ: ToneEqState = {
  BASS: { low: 58, mid: 46, high: 42, cutoff: 46 },
  SYNTH: { low: 45, mid: 52, high: 54, cutoff: 56 },
};

const TRACK_META: Record<TrackId, { dot: string; glow: string; step: string; stepBorder: string; text: string }> = {
  KICK:  { dot: "#9b6cff", glow: "rgba(155,108,255,0.55)", step: "linear-gradient(180deg, #9b70ff 0%, #6c42d8 100%)", stepBorder: "rgba(190,160,255,0.85)", text: "#d7c8ff" },
  HAT:   { dot: "#83bdff", glow: "rgba(131,189,255,0.45)", step: "linear-gradient(180deg, #9ccbff 0%, #5f95d8 100%)", stepBorder: "rgba(160,205,255,0.78)", text: "#cce3ff" },
  "PERC A": { dot: "#91efba", glow: "rgba(145,239,186,0.38)", step: "linear-gradient(180deg, #a7efc4 0%, #67b889 100%)", stepBorder: "rgba(170,245,200,0.72)", text: "#d1ffe3" },
  "PERC B": { dot: "#55e6d2", glow: "rgba(85,230,210,0.34)", step: "linear-gradient(180deg, #74f1df 0%, #3aaea2 100%)", stepBorder: "rgba(130,245,230,0.70)", text: "#c9fff8" },
  TEXTURE: { dot: "#ffbd54", glow: "rgba(255,189,84,0.42)",  step: "linear-gradient(180deg, #ffc45d 0%, #d38a2d 100%)", stepBorder: "rgba(255,207,120,0.74)", text: "#ffe2ad" },
  BASS:  { dot: "#ff788b", glow: "rgba(255,120,139,0.45)", step: "linear-gradient(180deg, #ff8797 0%, #d75368 100%)", stepBorder: "rgba(255,158,170,0.78)", text: "#ffc4cb" },
  SYNTH: { dot: "#efe36b", glow: "rgba(239,227,107,0.36)", step: "linear-gradient(180deg, #eee279 0%, #b5a943 100%)", stepBorder: "rgba(250,238,130,0.70)", text: "#fff6ad" },
};

// ─── Pattern helpers ──────────────────────────────────────────────────────────

function defaultNoteForTrack(track: TrackId, index = 0) {
  if (track === "BASS") return BASS_NOTE_CYCLE[index % BASS_NOTE_CYCLE.length];
  if (track === "SYNTH") return SYNTH_NOTE_CYCLE[index % SYNTH_NOTE_CYCLE.length];
  return undefined;
}

function makeStep(active: boolean, track: TrackId = "KICK", index = 0): Step {
  return { active, probability: 100, ratchet: 1, velocity: 100, note: defaultNoteForTrack(track, index), gate: "16n", chord: track === "SYNTH" ? "SINGLE" : undefined };
}

function normalizeStep(step: Partial<Step> | boolean, track: TrackId = "KICK", index = 0): Step {
  if (typeof step === "boolean") return makeStep(step, track, index);
  return {
    active: Boolean(step.active),
    probability: step.probability ?? 100,
    ratchet: step.ratchet ?? 1,
    velocity: step.velocity ?? 100,
    note: step.note || defaultNoteForTrack(track, index),
    gate: step.gate || "16n",
    chord: track === "SYNTH" ? ((step.chord as ChordMode) || "SINGLE") : undefined,
    locks: step.locks && typeof step.locks === "object" ? step.locks : undefined,
  };
}

function normalizePattern(input: unknown): Step[][] {
  if (!Array.isArray(input)) return generatePattern();
  return tracks.map((track, row) => {
    const lane = Array.isArray(input[row]) ? input[row] : [];
    return Array.from({ length: steps }, (_, col) => normalizeStep(lane[col] as Partial<Step> | boolean, track, col));
  });
}

function isEuclideanTrack(track: TrackId): track is EuclideanTrackId {
  return (EUCLIDEAN_TRACKS as readonly string[]).includes(track);
}

function normalizeEuclidean(input: unknown): EuclideanState {
  const raw = input && typeof input === "object" ? input as Partial<Record<EuclideanTrackId, Partial<EuclideanLaneState>>> : {};
  return EUCLIDEAN_TRACKS.reduce((acc, track) => {
    const lane = raw[track] || {};
    const maxLength = DEFAULT_TRACK_LENGTHS[track] || steps;
    acc[track] = {
      enabled: Boolean(lane.enabled),
      hits: Math.max(0, Math.min(maxLength, Math.round(lane.hits ?? DEFAULT_EUCLIDEAN[track].hits))),
      rotate: Math.max(0, Math.min(steps - 1, Math.round(lane.rotate ?? DEFAULT_EUCLIDEAN[track].rotate))),
    };
    return acc;
  }, {} as EuclideanState);
}

function euclideanPattern(length: number, hits: number, rotate = 0) {
  const safeLength = Math.max(1, Math.min(steps, Math.round(length)));
  const safeHits = Math.max(0, Math.min(safeLength, Math.round(hits)));
  const safeRotate = ((Math.round(rotate) % safeLength) + safeLength) % safeLength;
  if (safeHits <= 0) return Array.from({ length: safeLength }, () => false);
  if (safeHits >= safeLength) return Array.from({ length: safeLength }, () => true);

  // Bucket method: compact, stable and musical enough for techno-style Euclidean patterns.
  const base = Array.from({ length: safeLength }, (_, i) => ((i * safeHits) % safeLength) < safeHits);
  return Array.from({ length: safeLength }, (_, i) => base[(i - safeRotate + safeLength) % safeLength]);
}


function countStepLocks(step?: Step) {
  if (!step?.locks) return 0;
  return Object.values(step.locks).filter((value) => typeof value === "number").length;
}

function hasStepLocks(step?: Step) {
  return countStepLocks(step) > 0;
}

function randomStepLocks(track: TrackId, intensity = 1): StepLock {
  const strong = (min: number, max: number) => Math.round(mapRange(Math.random(), 0, 1, min, max));
  if (track === "SYNTH") {
    return {
      tone: strong(18, 96),
      space: strong(0, 92),
      drive: strong(0, 72),
      decay: strong(14, 88),
    };
  }
  if (track === "BASS") {
    return {
      tone: strong(18, 90),
      drive: strong(0, 80),
      decay: strong(16, 84),
    };
  }
  if (track === "PERC A" || track === "PERC B") {
    return {
      tone: strong(5, 98),
      space: strong(0, 84),
      drive: strong(8, 92),
      decay: strong(8, 86),
    };
  }
  if (track === "TEXTURE") {
    return {
      tone: strong(0, 100),
      space: strong(38, 100),
      drive: strong(0, 86),
      decay: strong(24, 100),
    };
  }
  return {
    tone: strong(15, 85),
    drive: strong(0, 65),
  };
}

function nextStepLockPreset(track: TrackId, current?: StepLock): StepLock | undefined {
  const count = current ? Object.values(current).filter((value) => typeof value === "number").length : 0;
  if (count >= 4) return undefined;
  if (count === 0) return randomStepLocks(track, 0.55);
  if (count === 1) return { ...current, space: Math.round(mapRange(Math.random(), 0, 1, 18, 92)) };
  if (count === 2) return { ...current, drive: Math.round(mapRange(Math.random(), 0, 1, 18, 88)) };
  return { ...current, decay: Math.round(mapRange(Math.random(), 0, 1, 12, 90)) };
}

function normalizeTrackLengths(input: unknown): Record<TrackId, number> {
  const raw = input && typeof input === "object" ? input as Partial<Record<TrackId, number>> : {};
  return tracks.reduce((acc, track) => {
    const value = raw[track];
    acc[track] = typeof value === "number" && value >= 1 && value <= steps ? Math.round(value) : DEFAULT_TRACK_LENGTHS[track];
    return acc;
  }, {} as Record<TrackId, number>);
}

function velocityToGain(velocity: number) {
  return Math.max(0.05, Math.min(1, velocity / 100));
}

function velocityToDb(velocity: number) {
  return Tone.gainToDb(velocityToGain(velocity));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = (value - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * Math.max(0, Math.min(1, t));
}

function eqKnobToDb(value: number) {
  return mapRange(value, 0, 100, -12, 12);
}

function cutoffForTrack(track: ToneTrackId, value: number) {
  return track === "BASS"
    ? mapRange(value, 0, 100, 120, 1200)
    : mapRange(value, 0, 100, 520, 6200);
}

function normalizeToneEq(input: unknown): ToneEqState {
  const raw = input && typeof input === "object" ? input as Partial<Record<ToneTrackId, Partial<TrackEqState>>> : {};
  return {
    BASS: { ...DEFAULT_TONE_EQ.BASS, ...(raw.BASS || {}) },
    SYNTH: { ...DEFAULT_TONE_EQ.SYNTH, ...(raw.SYNTH || {}) },
  };
}

function generatePattern(density = 58): Step[][] {
  const d = density / 100;
  return tracks.map((track) =>
    Array.from({ length: steps }, (_, i): Step => {
      let active = false;
      if (track === "KICK") active = i === 0;
      else if (track === "HAT") active = i % 2 === 1 ? Math.random() < 0.32 + d * 0.34 : Math.random() < d * 0.10;
      else if (track === "PERC A") active = [2, 5, 7, 10, 13, 15].includes(i) ? Math.random() < 0.32 + d * 0.42 : Math.random() < d * 0.16;
      else if (track === "PERC B") active = [3, 6, 11, 14].includes(i) ? Math.random() < 0.24 + d * 0.36 : Math.random() < d * 0.12;
      else if (track === "TEXTURE") active = Math.random() < 0.035 + d * 0.10;
      else if (track === "BASS") active = i % 4 === 0 || Math.random() < d * 0.20;
      else if (track === "SYNTH") active = Math.random() < d * 0.28;
      return makeStep(active, track, i);
    })
  );
}

const LIVE_CODE_DEFAULT = `// PHASE LIVE CODE
// x = on · . or ~ = off · notes write directly to BASS/SYNTH
bpm 138
swing 42
kick x...x...x...x...
hat .x.x.x.x.x.x.x.x
percA ..x...x...x...x.
percB ....x.....x...x.
texture .......x.......x
bass D1 ~ D1 ~ F1 ~ A1 ~ C2 ~ A1 ~ G1 ~
synth D3:min7 ~ F3:sus2 ~ A3:min ~ C4:oct ~`;

const LIVE_CODE_RANDOMS = [
  `bpm 138
swing 46
chaos 22
kick x...x...x...x...
hat .x.x.x.x.x.x.x.x
percA ..x...x...x...x.
percB .....x...x....x.
texture ........x.......
bass D1 ~ D1 ~ F1 ~ A1 ~ C2 ~ A1 ~ G1 ~
synth D3:min7 ~ ~ ~ F3:sus2 ~ ~ ~ A3:min ~ ~ ~ C4:oct ~ ~ ~`,
  `bpm 142
swing 54
chaos 34
kick x...x...x...x...
hat x.xx.xx.x.xx.xx.
percA ..x.x...x...x...
percB ....x.....x.x...
texture .......x.......x
bass D1 D1 ~ F1 A1 ~ C2 ~ A1 ~ G1 ~ F1 ~ A1 ~
synth A3:min ~ C4:sus4 ~ G3:power ~ F3:min7 ~`,
  `bpm 136
swing 38
phase 72
kick x...x...x...x...
hat .x..xx.x.x..xx.x
percA euclid 5 16 2
percB euclid 3 16 5
texture ....x.......x...
bass D1 ~ A1 ~ C2 ~ A1 ~ G1 ~ F1 ~ D1 ~ A1 ~
synth F3:sus2 ~ ~ A3:min ~ ~ C4:min7 ~ ~ G3:power ~ ~`
];

function liveAliasToTrack(alias: string): TrackId | null {
  const key = alias.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (["k", "kick", "bd"].includes(key)) return "KICK";
  if (["h", "hat", "hh", "hihat", "hiHat".toLowerCase()].includes(key)) return "HAT";
  if (["pa", "perca", "perc", "percussion", "snare", "snr", "clap"].includes(key)) return "PERC A";
  if (["pb", "percb", "perc2", "rim", "rimshot"].includes(key)) return "PERC B";
  if (["fx", "texture", "tex", "noise", "atmos"].includes(key)) return "TEXTURE";
  if (["b", "bass", "sub"].includes(key)) return "BASS";
  if (["s", "synth", "lead", "pad", "chord", "chords"].includes(key)) return "SYNTH";
  return null;
}

function liveChordFromToken(token: string): ChordMode {
  const t = token.toLowerCase();
  if (t.includes("min7") || t.includes("m7") || t.includes("minor7")) return "MIN7";
  if (t.includes("sus2")) return "SUS2";
  if (t.includes("sus4")) return "SUS4";
  if (t.includes("oct")) return "OCTAVE";
  if (t.includes("power") || t.includes("pwr") || t.includes(":5")) return "POWER";
  if (t.includes("min") || /[a-g]#?m\b/i.test(t)) return "MINOR";
  return "SINGLE";
}

function liveNoteFromToken(token: string, track: TrackId, index: number) {
  const clean = token.trim().replace(/[,;]+$/g, "");
  const noteMatch = clean.match(/^([A-Ga-g]#?)(-?\d)?(?::?([A-Za-z0-9]+))?$/);
  if (!noteMatch) return defaultNoteForTrack(track, index);
  const name = noteMatch[1].toUpperCase();
  const octave = noteMatch[2] ?? (track === "BASS" ? "1" : "3");
  return `${name}${octave}`;
}

function expandLiveTokens(raw: string) {
  const compact = raw.trim();
  if (/^[xXoO1*._~\-\s]+$/.test(compact) && !compact.includes(" ")) {
    return compact.split("");
  }
  return raw.split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

function buildLiveEuclideanTrack(track: TrackId, hits: number, length = steps, rotate = 0) {
  const safeLength = Math.max(1, Math.min(steps, Math.round(length || steps)));
  const flags = euclideanPattern(safeLength, hits, rotate);
  return Array.from({ length: steps }, (_, i) => ({
    ...makeStep(i < safeLength && Boolean(flags[i]), track, i),
    probability: 100,
    ratchet: RATCHET_TRACKS.has(track) && i % 4 === 3 ? 2 : 1,
    velocity: i % 4 === 0 ? 100 : 70,
  }));
}

function buildLiveTrack(track: TrackId, body: string, previousLane: Step[]) {
  const tokens = expandLiveTokens(body);
  const lane = Array.from({ length: steps }, (_, i) => normalizeStep(previousLane[i] || makeStep(false, track, i), track, i));
  if (!tokens.length) return { lane, length: trackLengthsFallback(track) };

  const safeLength = Math.max(1, Math.min(steps, tokens.length));
  for (let i = 0; i < steps; i++) {
    const token = tokens[i % safeLength] || ".";
    const rest = token === "." || token === "~" || token === "-" || token === "_" || token === "0";
    const hit = ["x", "X", "o", "O", "1", "*"].includes(token);
    const noteLike = /^[A-Ga-g]#?-?\d?(?::?[A-Za-z0-9]+)?$/.test(token);

    if (i >= safeLength) {
      lane[i] = { ...lane[i], active: false };
    } else if (track === "BASS" || track === "SYNTH") {
      lane[i] = {
        ...lane[i],
        active: !rest && (hit || noteLike),
        note: noteLike ? liveNoteFromToken(token, track, i) : lane[i].note,
        gate: token.includes("_") ? "8n" : "16n",
        chord: track === "SYNTH" ? liveChordFromToken(token) : lane[i].chord,
        probability: 100,
        velocity: hit ? 90 : 100,
      };
    } else {
      lane[i] = {
        ...lane[i],
        active: hit || noteLike,
        probability: 100,
        ratchet: RATCHET_TRACKS.has(track) && token === "*" ? 4 : lane[i].ratchet,
        velocity: token === "o" || token === "O" ? 70 : 100,
      };
    }
  }

  return { lane, length: safeLength };
}

function trackLengthsFallback(track: TrackId) {
  return DEFAULT_TRACK_LENGTHS[track] || steps;
}

function parsePhaseLiveCode(
  code: string,
  currentPattern: Step[][],
  currentLengths: Record<TrackId, number>
): {
  pattern: Step[][];
  lengths: Record<TrackId, number>;
  bpm?: number;
  knobs: Partial<{ groove: number; chaos: number; density: number; phase: number }>;
  status: string;
} {
  let nextPattern = normalizePattern(currentPattern);
  let nextLengths = { ...currentLengths };
  const knobUpdates: Partial<{ groove: number; chaos: number; density: number; phase: number }> = {};
  let nextBpm: number | undefined;
  let touched = 0;
  const messages: string[] = [];

  const lines = code
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/g, "").replace(/#.*$/g, "").trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const parts = line.split(/\s+/);
    const head = parts[0]?.toLowerCase();
    if (!head) return;

    if (["bpm", "tempo"].includes(head)) {
      const value = Number(parts[1]);
      if (Number.isFinite(value)) nextBpm = Math.max(80, Math.min(180, value));
      return;
    }

    if (["swing", "groove", "chaos", "density", "phase"].includes(head)) {
      const value = Number(parts[1]);
      if (Number.isFinite(value)) {
        const key = head === "swing" ? "groove" : head as keyof typeof knobUpdates;
        knobUpdates[key] = Math.max(0, Math.min(100, value));
      }
      return;
    }

    if (head === "euclid" || head === "euclidean") {
      const track = liveAliasToTrack(parts[1] || "");
      if (!track) return;
      const hits = Number(parts[2]);
      const length = Number(parts[3] || steps);
      const rotate = Number(parts[4] || 0);
      const row = tracks.indexOf(track);
      if (row >= 0 && Number.isFinite(hits)) {
        nextPattern[row] = buildLiveEuclideanTrack(track, hits, length, rotate);
        nextLengths[track] = Math.max(1, Math.min(steps, Math.round(length || steps)));
        touched += 1;
      }
      return;
    }

    const track = liveAliasToTrack(parts[0] || "");
    if (!track) return;

    const row = tracks.indexOf(track);
    if (row < 0) return;

    if (parts[1]?.toLowerCase() === "euclid" || parts[1]?.toLowerCase() === "euclidean") {
      const hits = Number(parts[2]);
      const length = Number(parts[3] || steps);
      const rotate = Number(parts[4] || 0);
      if (Number.isFinite(hits)) {
        nextPattern[row] = buildLiveEuclideanTrack(track, hits, length, rotate);
        nextLengths[track] = Math.max(1, Math.min(steps, Math.round(length || steps)));
        touched += 1;
      }
      return;
    }

    const body = line.slice(parts[0].length).trim();
    const built = buildLiveTrack(track, body, nextPattern[row]);
    nextPattern[row] = built.lane;
    nextLengths[track] = built.length;
    touched += 1;
  });

  if (typeof nextBpm === "number") messages.push(`BPM ${nextBpm}`);
  const knobKeys = Object.keys(knobUpdates);
  if (knobKeys.length) messages.push(`${knobKeys.join(" / ")} updated`);
  messages.push(`${touched} lane${touched === 1 ? "" : "s"} compiled`);

  return {
    pattern: nextPattern,
    lengths: nextLengths,
    bpm: nextBpm,
    knobs: knobUpdates,
    status: `PHASE LIVE: ${messages.join(" · ")}`,
  };
}

// ─── Mixer helper ─────────────────────────────────────────────────────────────

function getEffectiveMute(id: TrackId, mutes: Record<TrackId, boolean>, solos: Record<TrackId, boolean>) {
  const anySoloed = tracks.some((t) => solos[t]);
  return anySoloed ? !solos[id] : mutes[id];
}


function isAndroidDevice() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function isLowPowerAudioDevice() {
  if (isAndroidDevice()) return true;
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  const lowCpu = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
  return lowMemory || lowCpu;
}

function getPerformanceMode() {
  return isLowPowerAudioDevice() ? "lite" : "full";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [pattern, setPattern]         = useState<Step[][]>(generatePattern());
  const [playing, setPlaying]         = useState(false);
  const [activeStep, setActiveStep]   = useState(-1);
  const [bpm, setBpm]                 = useState(138);
  const [knobs, setKnobs]             = useState({ groove: 42, chaos: 28, density: 58, phase: 71 });
  const [masterFx, setMasterFx]       = useState<MasterFxState>({ filter: 50, reverb: 14, delay: 10, drive: 8 });
  const [masterVolume, setMasterVolume] = useState(-3);
  const [synthMod, setSynthMod]       = useState<SynthModState>(DEFAULT_SYNTH_MOD);
  const [synthVoice, setSynthVoice]   = useState<SynthVoiceState>(DEFAULT_SYNTH_VOICE);
  const [arp, setArp]                   = useState<ArpState>(DEFAULT_ARP);
  const [sidechain, setSidechain]     = useState<SidechainState>(DEFAULT_SIDECHAIN);
  const [bassPerformance, setBassPerformance] = useState<BassPerformanceState>(DEFAULT_BASS_PERFORMANCE);
  const [drumDesigner, setDrumDesigner] = useState<DrumDesignerState>(DEFAULT_DRUM_DESIGNER);
  const [euclidean, setEuclidean] = useState<EuclideanState>(DEFAULT_EUCLIDEAN);
  const [performancePad, setPerformancePad] = useState<PerformancePadState>(DEFAULT_PERFORMANCE_PAD);
  const [toneEq, setToneEq]           = useState<ToneEqState>(DEFAULT_TONE_EQ);
  const [trackLengths, setTrackLengths] = useState<Record<TrackId, number>>(DEFAULT_TRACK_LENGTHS);
  const [sampleNames, setSampleNames] = useState<Partial<Record<SampleTrack, string>>>({});
  const [dragOverTrack, setDragOverTrack] = useState<SampleTrack | null>(null);
  const [volumes, setVolumes]         = useState<Record<TrackId, number>>({ KICK: -3, HAT: -3, "PERC A": -2, "PERC B": -4, TEXTURE: -7, BASS: -2, SYNTH: -4 });
  const [mutes, setMutes]             = useState<Record<TrackId, boolean>>({ KICK: false, HAT: false, "PERC A": false, "PERC B": false, TEXTURE: false, BASS: false, SYNTH: false });
  const [solos, setSolos]             = useState<Record<TrackId, boolean>>({ KICK: false, HAT: false, "PERC A": false, "PERC B": false, TEXTURE: false, BASS: false, SYNTH: false });
  const [presets, setPresets]         = useState<PresetData[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName]   = useState("Dark Pattern 01");
  const [presetStatus, setPresetStatus] = useState("No preset loaded");
  const [liveCode, setLiveCode]       = useState(LIVE_CODE_DEFAULT);
  const [liveStatus, setLiveStatus]   = useState("PHASE LIVE ready");

  const synths       = useRef<any>(null);
  const sequenceRef  = useRef<Tone.Sequence | null>(null);
  const patternRef   = useRef(pattern);
  const knobsRef     = useRef(knobs);
  const masterFxRef  = useRef(masterFx);
  const masterVolumeRef = useRef(masterVolume);
  const synthModRef  = useRef(synthMod);
  const synthVoiceRef = useRef(synthVoice);
  const arpRef = useRef(arp);
  const sidechainRef = useRef(sidechain);
  const bassPerformanceRef = useRef(bassPerformance);
  const drumDesignerRef = useRef(drumDesigner);
  const euclideanRef = useRef(euclidean);
  const performancePadRef = useRef(performancePad);
  const toneEqRef    = useRef(toneEq);
  const trackLengthsRef = useRef(trackLengths);
  const volNodesRef  = useRef<Partial<Record<TrackId, Tone.Volume>>>({});
  const duckNodesRef = useRef<Partial<Record<TrackId, Tone.Gain>>>({});
  const masterNodesRef = useRef<{
    filter?: Tone.Filter;
    drive?: Tone.Distortion;
    delay?: Tone.FeedbackDelay;
    reverb?: Tone.Reverb;
    limiter?: Tone.Limiter;
    volume?: Tone.Volume;
  }>({});
  const synthModNodesRef = useRef<{
    synth?: Tone.MonoSynth;
    synthVoices?: Tone.MonoSynth[];
    filter?: Tone.Filter;
    lfo?: Tone.LFO;
    amp?: Tone.Gain;
    colorDrive?: Tone.Distortion;
    delay?: Tone.PingPongDelay;
    reverb?: Tone.Reverb;
  }>({});
  const toneNodesRef = useRef<Partial<Record<ToneTrackId, { eq: Tone.EQ3; filter: Tone.Filter }>>>({});
  const bassNodesRef = useRef<{
    sub?: Tone.MonoSynth;
    body?: Tone.MonoSynth;
    subLevel?: Tone.Gain;
    bodyLevel?: Tone.Gain;
    filter?: Tone.Filter;
    drive?: Tone.Distortion;
    glue?: Tone.Compressor;
  }>({});
  const drumNodesRef = useRef<{
    kick?: Tone.MembraneSynth;
    kickClick?: Tone.NoiseSynth;
    kickClickFilter?: Tone.Filter;
    kickClickGain?: Tone.Gain;
    kickDrive?: Tone.Distortion;
    kickEq?: Tone.EQ3;
    hat?: Tone.NoiseSynth;
    hatHighpass?: Tone.Filter;
    hatLowpass?: Tone.Filter;
    hatGain?: Tone.Gain;
    perc?: Tone.MembraneSynth;
    percBand?: Tone.Filter;
    percDrive?: Tone.Distortion;
    percReverb?: Tone.Reverb;
    percB?: Tone.MembraneSynth;
    percBBand?: Tone.Filter;
    percBDrive?: Tone.Distortion;
    percBReverb?: Tone.Reverb;
    fx?: Tone.MonoSynth;
    fxFilter?: Tone.Filter;
    fxDelay?: Tone.FeedbackDelay;
    fxReverb?: Tone.Reverb;
    fxDrive?: Tone.Distortion;
  }>({});
  const samplesRef   = useRef<Partial<Record<SampleTrack, SampleEntry>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTrack = useRef<SampleTrack | null>(null);
  const volumesRef   = useRef(volumes);
  const mutesRef     = useRef(mutes);
  const solosRef     = useRef(solos);
  const synthLfoFrameRef = useRef<number | null>(null);
  const synthLfoPhaseRef = useRef(0);
  const lastSynthLfoTsRef = useRef<number | null>(null);
  const performanceModeRef = useRef<"full" | "lite">("full");
  const lastUiStepRef = useRef(-1);

  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { knobsRef.current = knobs; if (playing) Tone.Transport.swing = knobs.groove / 160; }, [knobs, playing]);
  useEffect(() => { masterFxRef.current = masterFx; applyMasterFx(masterFx); }, [masterFx]);
  useEffect(() => {
    masterVolumeRef.current = masterVolume;
    const node = masterNodesRef.current.volume;
    if (node) node.volume.value = masterVolume;
  }, [masterVolume]);
  useEffect(() => { synthModRef.current = synthMod; applySynthMod(synthMod); }, [synthMod]);
  useEffect(() => { synthVoiceRef.current = synthVoice; applySynthVoice(synthVoice); applySynthMod(synthModRef.current); }, [synthVoice]);
  useEffect(() => { arpRef.current = arp; }, [arp]);
  useEffect(() => { sidechainRef.current = sidechain; }, [sidechain]);
  useEffect(() => { bassPerformanceRef.current = bassPerformance; applyBassPerformance(bassPerformance); }, [bassPerformance]);
  useEffect(() => { drumDesignerRef.current = drumDesigner; applyDrumDesigner(drumDesigner); }, [drumDesigner]);
  useEffect(() => { euclideanRef.current = euclidean; }, [euclidean]);
  useEffect(() => { performancePadRef.current = performancePad; }, [performancePad]);
  useEffect(() => { toneEqRef.current = toneEq; applyToneEq(toneEq); }, [toneEq]);
  useEffect(() => { trackLengthsRef.current = trackLengths; }, [trackLengths]);
  useEffect(() => { volumesRef.current = volumes; }, [volumes]);
  useEffect(() => { mutesRef.current = mutes; applyMixerState(mutes, solosRef.current); }, [mutes]);
  useEffect(() => { solosRef.current = solos; applyMixerState(mutesRef.current, solos); }, [solos]);
  useEffect(() => { Tone.Transport.bpm.value = bpm; }, [bpm]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as PresetData[];
      if (Array.isArray(parsed)) {
        setPresets(parsed);
        if (parsed[0]) {
          setSelectedPresetId(parsed[0].id);
          setPresetStatus(`${parsed.length} preset${parsed.length === 1 ? "" : "s"} saved`);
        }
      }
    } catch {
      setPresetStatus("Could not read presets");
    }
  }, []);

  useEffect(() => {
    tracks.forEach((id) => {
      const node = volNodesRef.current[id];
      if (node) node.volume.value = volumes[id];
    });
  }, [volumes]);

  useEffect(() => {
    applyMixerState(mutes, solos);
  }, [mutes, solos]);

  useEffect(() => {
    return () => {
      Tone.Transport.stop();
      Tone.Transport.cancel();
      sequenceRef.current?.dispose();
      if (synthLfoFrameRef.current !== null) {
        cancelAnimationFrame(synthLfoFrameRef.current);
        synthLfoFrameRef.current = null;
      }
      (Object.values(samplesRef.current) as SampleEntry[]).forEach((e) => { e?.player.dispose(); if (e?.url) URL.revokeObjectURL(e.url); });
      (Object.values(volNodesRef.current) as Tone.Volume[]).forEach((v) => { try { v?.dispose(); } catch (_) {} });
      (Object.values(duckNodesRef.current) as Tone.Gain[]).forEach((g) => { try { g?.dispose(); } catch (_) {} });
      (Object.values(masterNodesRef.current) as Array<{ dispose: () => void }>).forEach((node) => { try { node?.dispose(); } catch (_) {} });
      (Object.values(synthModNodesRef.current) as Array<{ dispose?: () => void }>).forEach((node) => { try { node?.dispose?.(); } catch (_) {} });
      (Object.values(toneNodesRef.current) as Array<{ eq: Tone.EQ3; filter: Tone.Filter }>).forEach((nodes) => {
        try { nodes?.eq.dispose(); } catch (_) {}
        try { nodes?.filter.dispose(); } catch (_) {}
      });
    };
  }, []);

  // ── Audio setup ─────────────────────────────────────────────────────────────

  function applyMixerState(m: Record<TrackId, boolean>, s: Record<TrackId, boolean>) {
    const anySoloed = tracks.some((id) => s[id]);

    tracks.forEach((id) => {
      const shouldMute = anySoloed ? !s[id] : m[id];
      const node = volNodesRef.current[id];
      const duck = duckNodesRef.current[id];

      if (node) {
        node.mute = shouldMute;
      }

      // Keep pump automation independent and safe when solo/mute changes.
      // This prevents a ducked gain from making mute/solo feel inconsistent.
      if (duck && shouldMute) {
        try {
          duck.gain.cancelScheduledValues(Tone.now());
          duck.gain.value = 1;
        } catch (_) {}
      }
    });
  }

  function isTrackAudible(id: TrackId) {
    return !getEffectiveMute(id, mutesRef.current, solosRef.current);
  }

  function triggerSidechain(time: number) {
    // Performance v2: sidechain automation is expensive on low-power Android.
    if (performanceModeRef.current === "lite") return;

    const sc = sidechainRef.current;
    if (!sc || sc.pump <= 0) return;

    const targets: TrackId[] =
      sc.target === "BOTH" ? ["BASS", "SYNTH"] :
      sc.target === "BASS" ? ["BASS"] :
      sc.target === "SYNTH" ? ["SYNTH"] :
      ["TEXTURE"];

    // IMPORTANT:
    // Sidechain now automates a dedicated Gain node, not the track Volume node.
    // This keeps mute/solo and user volume stable while the pump moves independently.
    const minGain = mapRange(sc.pump, 0, 100, 1, 0.12);
    const attack = mapRange(sc.tight, 0, 100, 0.055, 0.006);
    const release = mapRange(sc.release, 0, 100, 0.08, 0.72);

    targets.forEach((id) => {
      if (!isTrackAudible(id)) return;

      const duck = duckNodesRef.current[id];
      if (!duck) return;

      try {
        duck.gain.cancelScheduledValues(time);
        duck.gain.setValueAtTime(1, time);
        duck.gain.linearRampToValueAtTime(minGain, time + attack);
        duck.gain.linearRampToValueAtTime(1, time + attack + release);
        duck.gain.setValueAtTime(1, time + attack + release + 0.01);
      } catch (_) {
        duck.gain.value = 1;
      }
    });
  }

  function applyMasterFx(fx: MasterFxState) {
    const { filter, drive, delay, reverb } = masterNodesRef.current;

    if (filter) {
      if (fx.filter < 48) {
        filter.type = "lowpass";
        filter.frequency.value = mapRange(fx.filter, 0, 48, 220, 20000);
        filter.Q.value = mapRange(fx.filter, 0, 48, 1.15, 0.2);
      } else if (fx.filter > 52) {
        filter.type = "highpass";
        filter.frequency.value = mapRange(fx.filter, 52, 100, 35, 2400);
        filter.Q.value = mapRange(fx.filter, 52, 100, 0.2, 1.35);
      } else {
        filter.type = "lowpass";
        filter.frequency.value = 20000;
        filter.Q.value = 0.2;
      }
    }

    if (drive) {
      drive.distortion = mapRange(fx.drive, 0, 100, 0.0, 0.62);
      drive.wet.value = clamp01(mapRange(fx.drive, 0, 100, 0.0, 0.42));
    }
    if (delay) delay.wet.value = clamp01(mapRange(fx.delay, 0, 100, 0.0, 0.36));
    if (reverb) reverb.wet.value = clamp01(mapRange(fx.reverb, 0, 100, 0.0, 0.42));
  }


  function applySynthVoice(voice: SynthVoiceState) {
    const nodes = synthModNodesRef.current;
    const synth = nodes.synth as any;
    const filter = nodes.filter;

    if (filter) filter.type = voice.filterType;

    const voices = [synth, ...(nodes.synthVoices || [])].filter(Boolean);
    voices.forEach((voiceSynth: any) => {
      if (voiceSynth.oscillator) voiceSynth.oscillator.type = voice.waveform as any;
      if ("portamento" in voiceSynth) voiceSynth.portamento = mapRange(voice.glide, 0, 100, 0, 0.32);
    });
  }

  function applySynthMod(mod: SynthModState) {
    const nodes = synthModNodesRef.current;
    const synth = nodes.synth as any;
    const filter = nodes.filter;
    const lfo = nodes.lfo;
    const amp = nodes.amp;
    const colorDrive = nodes.colorDrive;
    const delay = nodes.delay;
    const reverb = nodes.reverb;
    const voice = synthVoiceRef.current;

    // Warmer, friendlier melodic techno synth mapping.
    // fmAmount is kept in the data model for preset compatibility, but it now behaves as COLOR.
    const baseCutoff = cutoffForTrack("SYNTH", toneEqRef.current.SYNTH.cutoff);
    const envBoost = mapRange(mod.filterEnv, 0, 100, 0, 1750);
    const color = mapRange(mod.fmAmount, 0, 100, 0, 1);
    const targetCutoff = Math.min(7600, baseCutoff + envBoost + color * 950);
    const detune = mapRange(mod.detune, 0, 100, -18, 18);

    if (filter) {
      filter.frequency.value = targetCutoff;
      filter.Q.value = mapRange(mod.filterEnv, 0, 100, 0.45, 1.65);
      filter.type = voice.filterType;
    }

    if (colorDrive) {
      colorDrive.distortion = mapRange(mod.fmAmount, 0, 100, 0.015, 0.24);
      colorDrive.wet.value = clamp01(mapRange(mod.fmAmount, 0, 100, 0.03, 0.24));
    }

    const voices = [synth, ...(nodes.synthVoices || [])].filter(Boolean);
    voices.forEach((voiceSynth: any) => {
      voiceSynth.detune.value = detune;
      if (voiceSynth.oscillator) voiceSynth.oscillator.type = voice.waveform as any;
      if (voiceSynth.filter) voiceSynth.filter.type = "lowpass";
      if ("portamento" in voiceSynth) voiceSynth.portamento = mapRange(voice.glide, 0, 100, 0, 0.26);

      const decay = mapRange(mod.pluckDecay, 0, 100, 0.11, 1.15);
      voiceSynth.envelope.attack = 0.008;
      voiceSynth.envelope.decay = decay;
      voiceSynth.envelope.sustain = mapRange(mod.pluckDecay, 0, 100, 0.035, 0.16);
      voiceSynth.envelope.release = mapRange(mod.pluckDecay, 0, 100, 0.10, 0.92);

      if (voiceSynth.filterEnvelope) {
        voiceSynth.filterEnvelope.attack = 0.006;
        voiceSynth.filterEnvelope.decay = Math.max(0.08, decay * 0.82);
        voiceSynth.filterEnvelope.sustain = mapRange(mod.pluckDecay, 0, 100, 0.03, 0.14);
        voiceSynth.filterEnvelope.release = mapRange(mod.pluckDecay, 0, 100, 0.10, 0.72);
        voiceSynth.filterEnvelope.baseFrequency = mapRange(mod.filterEnv, 0, 100, 260, 980);
        voiceSynth.filterEnvelope.octaves = mapRange(mod.fmAmount, 0, 100, 1.2, 4.6);
      }
    });

    if (amp) amp.gain.value = 1;

    // LFO target is handled by a dedicated realtime engine below.
    // Do NOT reconnect Tone.LFO dynamically here: with MonoSynth some targets are
    // inaudible or unreliable after reconnect. The manual engine writes directly
    // to the active audio params every animation frame.
    if (lfo) {
      try { lfo.disconnect(); } catch (_) {}
      lfo.frequency.value = mapRange(mod.lfoRate, 0, 100, 0.08, 12);
    }

    if (delay) delay.wet.value = clamp01(mapRange(mod.delaySend, 0, 100, 0, 0.34));
    if (reverb) reverb.wet.value = clamp01(mapRange(mod.reverbSend, 0, 100, 0, 0.40));
  }


  function startSynthLfoEngine() {
    // Android Lite: continuous RAF modulation is too heavy on many Android browsers.
    if (isAndroidDevice()) return;
    if (synthLfoFrameRef.current !== null) return;

    const tick = (ts: number) => {
      const nodes = synthModNodesRef.current;
      const synth = nodes.synth as any;
      const synthVoices = [synth, ...(nodes.synthVoices || [])].filter(Boolean) as any[];
      const filter = nodes.filter;
      const amp = nodes.amp;
      const colorDrive = nodes.colorDrive;
      const mod = synthModRef.current;
      const voice = synthVoiceRef.current;
      const eq = toneEqRef.current;

      const last = lastSynthLfoTsRef.current ?? ts;
      const dt = Math.min(0.08, Math.max(0, (ts - last) / 1000));
      lastSynthLfoTsRef.current = ts;

      const rateHz = mapRange(mod.lfoRate, 0, 100, 0.08, 12);
      const depth01 = clamp01(mod.lfoDepth / 100);
      synthLfoPhaseRef.current = (synthLfoPhaseRef.current + dt * rateHz * Math.PI * 2) % (Math.PI * 2);
      const wave = Math.sin(synthLfoPhaseRef.current);
      const uni = (wave + 1) / 2;

      const baseCutoff = cutoffForTrack("SYNTH", eq.SYNTH.cutoff);
      const envBoost = mapRange(mod.filterEnv, 0, 100, 0, 1750);
      const color = mapRange(mod.fmAmount, 0, 100, 0, 1);
      const targetCutoff = Math.min(7600, baseCutoff + envBoost + color * 950);
      const baseDetune = mapRange(mod.detune, 0, 100, -18, 18);
      const baseQ = mapRange(mod.filterEnv, 0, 100, 0.45, 1.65);
      const baseWet = clamp01(mapRange(mod.fmAmount, 0, 100, 0.03, 0.24));
      const baseDist = mapRange(mod.fmAmount, 0, 100, 0.015, 0.24);

      try {
        if (voice.lfoTarget === "filter" && filter) {
          const depthHz = mapRange(mod.lfoDepth, 0, 100, 0, 2400);
          filter.frequency.value = Math.max(120, Math.min(10500, targetCutoff + wave * depthHz));
          filter.Q.value = baseQ;
          synthVoices.forEach((v) => { if (v?.detune) v.detune.value = baseDetune; });
          if (amp) amp.gain.value = 1;
          if (colorDrive) {
            colorDrive.wet.value = baseWet;
            colorDrive.distortion = baseDist;
          }
        } else if (voice.lfoTarget === "pitch") {
          // Deliberately exaggerated vibrato so the target is clearly audible.
          const depthCents = mapRange(mod.lfoDepth, 0, 100, 0, 220);
          synthVoices.forEach((v) => { if (v?.detune) v.detune.value = baseDetune + wave * depthCents; });
          if (filter) {
            filter.frequency.value = targetCutoff;
            filter.Q.value = baseQ;
          }
          if (amp) amp.gain.value = 1;
          if (colorDrive) {
            colorDrive.wet.value = baseWet;
            colorDrive.distortion = baseDist;
          }
        } else if (voice.lfoTarget === "fm") {
          // COLOR target: modulate several warm-color points at once so it is obvious.
          if (colorDrive) {
            colorDrive.wet.value = clamp01(baseWet + uni * depth01 * 0.55);
            colorDrive.distortion = Math.max(0.01, Math.min(0.85, baseDist + uni * depth01 * 0.55));
          }
          if (filter) {
            filter.frequency.value = Math.max(180, Math.min(9500, targetCutoff + wave * depth01 * 1800));
            filter.Q.value = Math.max(0.2, Math.min(5.5, baseQ + uni * depth01 * 3.2));
          }
          synthVoices.forEach((v) => { if (v?.detune) v.detune.value = baseDetune; });
          if (amp) amp.gain.value = 1;
        } else if (voice.lfoTarget === "volume") {
          // Tremolo. Use a wide range so it is impossible to miss.
          const minGain = mapRange(mod.lfoDepth, 0, 100, 1, 0.04);
          if (amp) amp.gain.value = minGain + uni * (1 - minGain);
          if (filter) {
            filter.frequency.value = targetCutoff;
            filter.Q.value = baseQ;
          }
          synthVoices.forEach((v) => { if (v?.detune) v.detune.value = baseDetune; });
          if (colorDrive) {
            colorDrive.wet.value = baseWet;
            colorDrive.distortion = baseDist;
          }
        }
      } catch (_) {}

      synthLfoFrameRef.current = requestAnimationFrame(tick);
    };

    lastSynthLfoTsRef.current = null;
    synthLfoFrameRef.current = requestAnimationFrame(tick);
  }

  function applyDrumDesigner(design: DrumDesignerState) {
    const nodes = drumNodesRef.current;
    const kick = nodes.kick as any;
    const hat = nodes.hat as any;
    const perc = nodes.perc as any;
    const fx = nodes.fx as any;
    const percB = nodes.percB as any;

    if (kick) {
      // 909-style kick: shorter punch, defined transient, less boomy tail.
      kick.pitchDecay = mapRange(design.kick.click, 0, 100, 0.012, 0.040);
      kick.octaves = mapRange(design.kick.pitch, 0, 100, 3.9, 7.2);
      kick.envelope.attack = 0.001;
      kick.envelope.decay = mapRange(design.kick.decay, 0, 100, 0.18, 0.48);
      kick.envelope.release = mapRange(design.kick.decay, 0, 100, 0.035, 0.16);
    }
    if (nodes.kickClick) {
      nodes.kickClick.envelope.attack = 0.001;
      nodes.kickClick.envelope.decay = mapRange(design.kick.click, 0, 100, 0.006, 0.024);
      nodes.kickClick.envelope.release = 0.006;
    }
    if (nodes.kickClickFilter) {
      nodes.kickClickFilter.frequency.value = mapRange(design.kick.click, 0, 100, 2400, 9200);
      nodes.kickClickFilter.Q.value = mapRange(design.kick.click, 0, 100, 0.45, 2.2);
    }
    if (nodes.kickClickGain) {
      nodes.kickClickGain.gain.value = mapRange(design.kick.click, 0, 100, 0.025, 0.18);
    }
    if (nodes.kickDrive) {
      nodes.kickDrive.distortion = mapRange(design.kick.drive, 0, 100, 0.04, 0.42);
      nodes.kickDrive.wet.value = clamp01(mapRange(design.kick.drive, 0, 100, 0.08, 0.38));
    }
    if (nodes.kickEq) {
      nodes.kickEq.low.value = mapRange(design.kick.body, 0, 100, 0.5, 4.4);
      nodes.kickEq.mid.value = mapRange(design.kick.body, 0, 100, -3.8, -0.4);
      nodes.kickEq.high.value = mapRange(design.kick.click, 0, 100, -4.5, 2.6);
    }

    if (hat) {
      hat.envelope.attack = mapRange(design.hat.texture, 0, 100, 0.003, 0.018);
      hat.envelope.decay = mapRange(design.hat.decay, 0, 100, 0.035, 0.22);
      hat.envelope.release = mapRange(design.hat.decay, 0, 100, 0.025, 0.13);
      if (hat.noise) hat.noise.type = design.hat.texture > 66 ? "white" : design.hat.texture < 34 ? "brown" : "pink";
    }
    if (nodes.hatHighpass) nodes.hatHighpass.frequency.value = mapRange(design.hat.brightness, 0, 100, 2600, 12800);
    if (nodes.hatLowpass) nodes.hatLowpass.frequency.value = mapRange(design.hat.air, 0, 100, 5200, 20000);
    if (nodes.hatGain) nodes.hatGain.gain.value = mapRange(design.hat.air, 0, 100, 0.34, 1.10);

    if (perc) {
      perc.pitchDecay = mapRange(design.perc.snap, 0, 100, 0.006, 0.035);
      perc.octaves = mapRange(design.perc.tone, 0, 100, 1.4, 5.8);
      perc.envelope.attack = mapRange(design.perc.snap, 0, 100, 0.006, 0.001);
      perc.envelope.decay = mapRange(design.perc.snap, 0, 100, 0.22, 0.055);
      perc.envelope.release = mapRange(design.perc.snap, 0, 100, 0.11, 0.026);
    }
    if (nodes.percBand) {
      nodes.percBand.frequency.value = mapRange(design.perc.tone, 0, 100, 120, 4200);
      nodes.percBand.Q.value = mapRange(design.perc.resonance, 0, 100, 0.28, 9.5);
    }
    if (percB) {
      percB.pitchDecay = mapRange(design.perc.snap, 0, 100, 0.004, 0.026);
      percB.octaves = mapRange(design.perc.tone, 0, 100, 2.4, 7.6);
      percB.envelope.attack = mapRange(design.perc.snap, 0, 100, 0.005, 0.001);
      percB.envelope.decay = mapRange(design.perc.snap, 0, 100, 0.16, 0.038);
      percB.envelope.release = mapRange(design.perc.snap, 0, 100, 0.075, 0.018);
    }
    if (nodes.percBBand) {
      nodes.percBBand.frequency.value = mapRange(design.perc.tone, 0, 100, 640, 4200);
      nodes.percBBand.Q.value = mapRange(design.perc.resonance, 0, 100, 0.65, 6.4);
    }
    if (nodes.percBDrive) {
      nodes.percBDrive.distortion = mapRange(design.perc.snap, 0, 100, 0.05, 0.34);
      nodes.percBDrive.wet.value = clamp01(mapRange(design.perc.snap, 0, 100, 0.04, 0.26));
    }
    if (nodes.percBReverb) {
      nodes.percBReverb.decay = mapRange(design.perc.space, 0, 100, 0.22, 1.8);
      nodes.percBReverb.wet.value = clamp01(mapRange(design.perc.space, 0, 100, 0.01, 0.24));
    }
    if (nodes.percDrive) {
      nodes.percDrive.distortion = mapRange(design.perc.snap, 0, 100, 0.02, 0.78);
      nodes.percDrive.wet.value = clamp01(mapRange(design.perc.snap, 0, 100, 0.02, 0.52));
    }
    if (nodes.percReverb) {
      nodes.percReverb.decay = mapRange(design.perc.space, 0, 100, 0.18, 4.8);
      nodes.percReverb.wet.value = clamp01(mapRange(design.perc.space, 0, 100, 0.0, 0.52));
    }

    if (fx) {
      fx.envelope.decay = mapRange(design.fx.size, 0, 100, 0.18, 1.2);
      fx.envelope.release = mapRange(design.fx.size, 0, 100, 0.08, 0.62);
      if (fx.filterEnvelope) {
        fx.filterEnvelope.decay = mapRange(design.fx.size, 0, 100, 0.16, 1.0);
        fx.filterEnvelope.octaves = mapRange(design.fx.noise, 0, 100, 1.2, 5.4);
        fx.filterEnvelope.baseFrequency = mapRange(design.fx.tone, 0, 100, 180, 1200);
      }
    }
    if (nodes.fxFilter) {
      nodes.fxFilter.frequency.value = mapRange(design.fx.tone, 0, 100, 420, 5200);
      nodes.fxFilter.Q.value = mapRange(design.fx.noise, 0, 100, 0.65, 4.4);
    }
    if (nodes.fxDelay) {
      nodes.fxDelay.feedback.value = clamp01(mapRange(design.fx.feedback, 0, 100, 0.02, 0.88));
      nodes.fxDelay.wet.value = clamp01(mapRange(design.fx.feedback, 0, 100, 0.0, 0.62));
    }
    if (nodes.fxReverb) {
      nodes.fxReverb.decay = mapRange(design.fx.size, 0, 100, 0.55, 9.5);
      nodes.fxReverb.wet.value = clamp01(mapRange(design.fx.size, 0, 100, 0.0, 0.64));
    }
    if (nodes.fxDrive) {
      nodes.fxDrive.distortion = mapRange(design.fx.noise, 0, 100, 0.0, 0.72);
      nodes.fxDrive.wet.value = clamp01(mapRange(design.fx.noise, 0, 100, 0.0, 0.46));
    }
  }

  function applyBassPerformance(perf: BassPerformanceState) {
    const nodes = bassNodesRef.current;
    const sub = nodes.sub as any;
    const body = nodes.body as any;
    const subLevel = nodes.subLevel;
    const bodyLevel = nodes.bodyLevel;
    const filter = nodes.filter;
    const drive = nodes.drive;
    const glue = nodes.glue as any;

    // Bass v4: less dark-sub, more rolling melodic techno presence.
    // SUB now balances sub weight vs. the harmonic body instead of simply making everything darker.
    if (subLevel) subLevel.gain.value = mapRange(perf.sub, 0, 100, 0.24, 0.92);
    if (bodyLevel) bodyLevel.gain.value = mapRange(perf.sub, 0, 100, 0.86, 0.48);

    if (filter) {
      const toneCutoff = cutoffForTrack("BASS", toneEqRef.current.BASS.cutoff);
      const perfCutoff = mapRange(perf.cutoff, 0, 100, 160, 3600);
      filter.frequency.value = Math.max(120, Math.min(4200, (toneCutoff * 0.46) + (perfCutoff * 0.86)));
      filter.Q.value = mapRange(perf.punch, 0, 100, 0.55, 2.35);
    }

    if (drive) {
      drive.distortion = mapRange(perf.drive, 0, 100, 0.018, 0.52);
      drive.wet.value = clamp01(mapRange(perf.drive, 0, 100, 0.06, 0.52));
    }

    if (glue) {
      glue.threshold.value = mapRange(perf.punch, 0, 100, -16, -26);
      glue.ratio.value = mapRange(perf.punch, 0, 100, 2.0, 4.4);
      glue.attack.value = mapRange(perf.punch, 0, 100, 0.012, 0.002);
      glue.release.value = mapRange(perf.decay, 0, 100, 0.055, 0.18);
    }

    const attack = mapRange(perf.punch, 0, 100, 0.009, 0.001);
    const subDecay = mapRange(perf.decay, 0, 100, 0.10, 0.46);
    const bodyDecay = mapRange(perf.decay, 0, 100, 0.075, 0.34);
    const sustain = mapRange(perf.decay, 0, 100, 0.12, 0.40);
    const release = mapRange(perf.decay, 0, 100, 0.045, 0.26);
    const glide = mapRange(perf.glide, 0, 100, 0, 0.16);

    [sub, body].filter(Boolean).forEach((voiceSynth: any) => {
      if ("portamento" in voiceSynth) voiceSynth.portamento = glide;
      if (voiceSynth.envelope) {
        voiceSynth.envelope.attack = attack;
        voiceSynth.envelope.sustain = sustain;
        voiceSynth.envelope.release = release;
      }
    });

    if (sub?.envelope) sub.envelope.decay = subDecay;
    if (body?.envelope) body.envelope.decay = bodyDecay;

    if (sub?.filterEnvelope) {
      sub.filterEnvelope.attack = attack;
      sub.filterEnvelope.decay = mapRange(perf.punch, 0, 100, 0.16, 0.045);
      sub.filterEnvelope.octaves = mapRange(perf.punch, 0, 100, 0.9, 2.7);
      sub.filterEnvelope.baseFrequency = mapRange(perf.cutoff, 0, 100, 44, 92);
    }
    if (body?.filterEnvelope) {
      body.filterEnvelope.attack = attack;
      body.filterEnvelope.decay = mapRange(perf.punch, 0, 100, 0.18, 0.052);
      body.filterEnvelope.octaves = mapRange(perf.punch, 0, 100, 1.6, 4.2);
      body.filterEnvelope.baseFrequency = mapRange(perf.cutoff, 0, 100, 120, 340);
    }
  }

  function applyToneEq(eqState: ToneEqState) {
    (["BASS", "SYNTH"] as ToneTrackId[]).forEach((track) => {
      const nodes = toneNodesRef.current[track];
      const values = eqState[track];
      if (!nodes || !values) return;
      nodes.eq.low.value = eqKnobToDb(values.low);
      nodes.eq.mid.value = eqKnobToDb(values.mid);
      nodes.eq.high.value = eqKnobToDb(values.high);
      nodes.filter.frequency.value = cutoffForTrack(track, values.cutoff);
    });
    applyBassPerformance(bassPerformanceRef.current);
    applySynthMod(synthModRef.current);
  }

  function setupAudio() {
    if (synths.current) return;

    const androidSafeOutput = isAndroidDevice();
    const androidLite = getPerformanceMode() === "lite";
    performanceModeRef.current = androidLite ? "lite" : "full";

    const masterVolumeNode = new Tone.Volume(masterVolumeRef.current).toDestination();

    let masterInput: Tone.ToneAudioNode = masterVolumeNode;

    if (androidSafeOutput) {
      // Android Chrome fallback:
      // bypass the master FX chain because some Android WebAudio builds can run
      // Tone.Transport while keeping a complex FX chain silent.
      masterNodesRef.current = {
        volume: masterVolumeNode,
      };
    } else {
      const masterFilter = new Tone.Filter({ frequency: 20000, type: "lowpass", rolloff: -24, Q: 0.2 });
      const masterDrive  = new Tone.Distortion({ distortion: 0.05, wet: 0.08 });
      const masterDelay  = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.24, wet: 0.10 });
      const masterReverb = new Tone.Reverb({ decay: 3.4, wet: 0.14 });
      const masterLimiter = new Tone.Limiter(-1.2);

      masterFilter.connect(masterDrive);
      masterDrive.connect(masterDelay);
      masterDelay.connect(masterReverb);
      masterReverb.connect(masterLimiter);
      masterLimiter.connect(masterVolumeNode);

      masterInput = masterFilter;

      masterNodesRef.current = {
        filter: masterFilter,
        drive: masterDrive,
        delay: masterDelay,
        reverb: masterReverb,
        limiter: masterLimiter,
        volume: masterVolumeNode,
      };
      applyMasterFx(masterFxRef.current);
    }

    const makeVol = (id: TrackId) => {
      const duck = new Tone.Gain(1).connect(masterInput);
      const v = new Tone.Volume(volumesRef.current[id]).connect(duck);
      v.mute = getEffectiveMute(id, mutesRef.current, solosRef.current);
      duckNodesRef.current[id] = duck;
      volNodesRef.current[id] = v;
      return v;
    };
    const kickVol  = makeVol("KICK");
    const hatVol   = makeVol("HAT");
    const percAVol = makeVol("PERC A");
    const percBVol = makeVol("PERC B");
    const textureVol = makeVol("TEXTURE");
    const bassVol  = makeVol("BASS");
    const synthVol = makeVol("SYNTH");

    if (androidLite) {
      // Performance v2: true Ultra Lite engine for Android / low-power phones.
      // Do not create the heavy fallback drum/texture FX chains at all.
      const kick = new Tone.MembraneSynth({
        pitchDecay: 0.018,
        octaves: 4.4,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.04 },
      }).connect(kickVol);

      const hat = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.003, decay: 0.045, sustain: 0, release: 0.018 },
      }).connect(hatVol);

      const bassEq = new Tone.EQ3({ low: 1.8, mid: -1.5, high: -5 });
      const bassFilter = new Tone.Filter({ frequency: 720, type: "lowpass", rolloff: -12, Q: 0.6 }).connect(bassVol);
      bassEq.connect(bassFilter);
      const bass = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { type: "lowpass", Q: 0.7, rolloff: -12 },
        envelope: { attack: 0.002, decay: 0.12, sustain: 0.12, release: 0.045 },
        filterEnvelope: { attack: 0.002, decay: 0.08, sustain: 0.05, release: 0.035, baseFrequency: 80, octaves: 2.2 },
        portamento: 0.005,
      }).connect(bassEq);

      const synthEq = new Tone.EQ3({ low: -5, mid: 0.5, high: -1.5 });
      const synthFilter = new Tone.Filter({ frequency: 2400, type: "lowpass", rolloff: -12, Q: 0.55 }).connect(synthVol);
      synthEq.connect(synthFilter);
      const synth = new Tone.MonoSynth({
        oscillator: { type: "triangle" },
        filter: { type: "lowpass", Q: 0.5, rolloff: -12 },
        envelope: { attack: 0.006, decay: 0.16, sustain: 0.05, release: 0.08 },
        filterEnvelope: { attack: 0.004, decay: 0.12, sustain: 0.04, release: 0.06, baseFrequency: 360, octaves: 1.8 },
        portamento: 0.006,
      }).connect(synthEq);

      toneNodesRef.current.BASS = { eq: bassEq, filter: bassFilter };
      toneNodesRef.current.SYNTH = { eq: synthEq, filter: synthFilter };
      bassNodesRef.current = { body: bass, filter: bassFilter };
      synthModNodesRef.current = { synth, synthVoices: [], filter: synthFilter };
      drumNodesRef.current = { kick, hat };
      synths.current = { kick, hat, perc: null, percB: null, bass, synth, synthVoices: [], texture: null, fx: null };

      applyMixerState(mutesRef.current, solosRef.current);
      return;
    }

    // 909-style kick fallback: punchy transient, tight body, club-friendly decay.
    const kickDrive = new Tone.Distortion({ distortion: androidLite ? 0.04 : 0.13, wet: androidLite ? 0.06 : 0.20 });
    const kickLowShelf = new Tone.EQ3({ low: 3.2, mid: -2.4, high: -1.6 }).connect(kickVol);
    kickDrive.connect(kickLowShelf);
    const kickBody = new Tone.MembraneSynth({
      pitchDecay: 0.022,
      octaves: 5.2,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.30, sustain: 0, release: 0.075 },
    }).connect(kickDrive);
    const kickClickGain = new Tone.Gain(0.08);
    const kickClickFilter = new Tone.Filter({ frequency: 5200, type: "bandpass", Q: 1.2 });
    const kickClick = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.012, sustain: 0, release: 0.004 },
    }).connect(kickClickFilter);
    kickClickFilter.connect(kickClickGain);
    kickClickGain.connect(kickLowShelf);
    const kick = {
      triggerAttackRelease(note: string, duration: string, time?: Tone.Unit.Time, velocity?: number) {
        const vel = typeof velocity === "number" ? velocity : 1;
        kickBody.triggerAttackRelease(note || "C1", duration || "16n", time, Math.min(1, vel * 0.98));
        kickClick.triggerAttackRelease("64n", time, Math.min(1, vel * 0.72));
      },
      triggerRelease(time?: Tone.Unit.Time) {
        kickBody.triggerRelease(time);
      },
      dispose() {
        kickBody.dispose();
        kickClick.dispose();
        kickClickFilter.dispose();
        kickClickGain.dispose();
        kickDrive.dispose();
        kickLowShelf.dispose();
      },
    };

    // Softer open-air techno hat: filtered noise, less transient punch, more texture.
    const hatHighpass = new Tone.Filter({ frequency: 7200, type: "highpass", rolloff: -12, Q: 0.18 });
    const hatLowpass = new Tone.Filter({ frequency: 12600, type: "lowpass", rolloff: -12, Q: 0.12 });
    const hatGain = new Tone.Gain(0.72).connect(hatVol);
    hatHighpass.connect(hatLowpass);
    hatLowpass.connect(hatGain);
    const hat = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.012, decay: 0.105, sustain: 0, release: 0.055 },
    }).connect(hatHighpass);

    // Dark modular perc: short tuned body with filtered grit, not hat-like.
    const percReverb = new Tone.Reverb({ decay: androidLite ? 0.12 : 0.82, wet: androidLite ? 0 : 0.065 });
    const percDrive = new Tone.Distortion({ distortion: androidLite ? 0.06 : 0.24, wet: androidLite ? 0.04 : 0.18 });
    const percBand = new Tone.Filter({ frequency: 760, type: "bandpass", Q: 1.05 });
    percBand.connect(percDrive);
    percDrive.connect(percReverb);
    percReverb.connect(percAVol);
    const perc = new Tone.MembraneSynth({
      pitchDecay: 0.018,
      octaves: 3.3,
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.125, sustain: 0, release: 0.045 },
    }).connect(percBand);

    // Perc B: counter-rhythm / syncopated layer, slightly higher and tighter than Perc A.
    const percBReverb = new Tone.Reverb({ decay: androidLite ? 0.1 : 0.58, wet: androidLite ? 0 : 0.045 });
    const percBDrive = new Tone.Distortion({ distortion: androidLite ? 0.05 : 0.18, wet: androidLite ? 0.03 : 0.12 });
    const percBBand = new Tone.Filter({ frequency: 1280, type: "bandpass", Q: 1.55 });
    percBBand.connect(percBDrive);
    percBDrive.connect(percBReverb);
    percBReverb.connect(percBVol);
    const percB = new Tone.MembraneSynth({
      pitchDecay: 0.012,
      octaves: 4.6,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.075, sustain: 0, release: 0.028 },
    }).connect(percBBand);

    // TEXTURE fallback v2: darker tonal laser / texture hit, less noisy and more musical for techno transitions.
    const fxDrive = new Tone.Distortion({ distortion: androidLite ? 0.04 : 0.16, wet: androidLite ? 0.03 : 0.12 });
    const fxFilter = new Tone.Filter({ frequency: 1850, type: "bandpass", rolloff: -24, Q: 1.45 });
    const fxDelay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: androidLite ? 0.02 : 0.32, wet: androidLite ? 0 : 0.28 });
    const fxReverb = new Tone.Reverb({ decay: androidLite ? 0.15 : 3.2, wet: androidLite ? 0 : 0.22 });
    fxDrive.connect(fxFilter);
    if (androidLite) {
      fxFilter.connect(textureVol);
    } else {
      fxFilter.connect(fxDelay);
      fxDelay.connect(fxReverb);
      fxReverb.connect(textureVol);
    }
    const fx = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      filter: { type: "bandpass", Q: 1.2 },
      envelope: { attack: 0.008, decay: 0.42, sustain: 0.0, release: 0.18 },
      filterEnvelope: { attack: 0.004, decay: 0.36, sustain: 0, release: 0.16, baseFrequency: 420, octaves: 3.2 },
    }).connect(fxDrive);

    drumNodesRef.current = {
      kick: kickBody,
      kickClick,
      kickClickFilter,
      kickClickGain,
      kickDrive,
      kickEq: kickLowShelf,
      hat,
      hatHighpass,
      hatLowpass,
      hatGain,
      perc,
      percBand,
      percDrive,
      percReverb,
      percB,
      percBBand,
      percBDrive,
      percBReverb,
      fx,
      fxFilter,
      fxDelay,
      fxReverb,
      fxDrive,
    };
    applyDrumDesigner(drumDesignerRef.current);

    // Bass v4: rolling melodic techno bass.
    // More harmonic body and mid presence than v3, without losing the sub foundation.
    const bassInputGain = new Tone.Gain(0.92);
    const bassGlue = new Tone.Compressor({ threshold: androidLite ? -18 : -22, ratio: androidLite ? 2.0 : 3.5, attack: 0.003, release: 0.11 });
    const bassDrive = new Tone.Distortion({ distortion: androidLite ? 0.035 : 0.12, wet: androidLite ? 0.05 : 0.18 });
    const bassFilter = new Tone.Filter({
      frequency: mapRange(DEFAULT_BASS_PERFORMANCE.cutoff, 0, 100, 260, 3200),
      type: "lowpass",
      rolloff: -24,
      Q: 1.05,
    });
    const bassEq = new Tone.EQ3({
      low: eqKnobToDb(toneEqRef.current.BASS.low) + 2.2,
      mid: eqKnobToDb(toneEqRef.current.BASS.mid) + 1.6,
      high: eqKnobToDb(toneEqRef.current.BASS.high) - 2.8,
    });
    toneNodesRef.current.BASS = { eq: bassEq, filter: bassFilter };

    bassInputGain.connect(bassGlue);
    bassGlue.connect(bassDrive);
    bassDrive.connect(bassFilter);
    bassFilter.connect(bassEq);
    bassEq.connect(bassVol);

    const bassSubLevel = new Tone.Gain(0.62).connect(bassInputGain);
    const bassBodyLevel = new Tone.Gain(0.72).connect(bassInputGain);

    const bassSub = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.002,
        decay: 0.15,
        sustain: 0.32,
        release: 0.10,
      },
      filter: {
        type: "lowpass",
        rolloff: -24,
        Q: 0.52,
      },
      filterEnvelope: {
        attack: 0.002,
        decay: 0.12,
        sustain: 0.18,
        release: 0.10,
        baseFrequency: 58,
        octaves: 1.8,
      },
      portamento: 0.012,
    }).connect(bassSubLevel);

    const bassBody = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      envelope: {
        attack: 0.002,
        decay: 0.13,
        sustain: 0.18,
        release: 0.075,
      },
      filter: {
        type: "lowpass",
        rolloff: -24,
        Q: 1.15,
      },
      filterEnvelope: {
        attack: 0.002,
        decay: 0.16,
        sustain: 0.055,
        release: 0.08,
        baseFrequency: 145,
        octaves: 3.1,
      },
      portamento: 0.014,
    }).connect(bassBodyLevel);

    bassNodesRef.current = { sub: bassSub, body: bassBody, subLevel: bassSubLevel, bodyLevel: bassBodyLevel, filter: bassFilter, drive: bassDrive, glue: bassGlue };
    applyBassPerformance(bassPerformanceRef.current);

    const bass = {
      triggerAttackRelease(note: string, duration: string, time?: Tone.Unit.Time, velocity?: number) {
        const vel = typeof velocity === "number" ? velocity : 1;
        const subNote = Tone.Frequency(note).transpose(-12).toNote();
        bassSub.triggerAttackRelease(subNote, duration, time, Math.min(1, vel * 0.78));
        if (!androidLite) {
          bassBody.triggerAttackRelease(note, duration, time, Math.min(1, vel * 0.92));
        }
      },
      triggerRelease(time?: Tone.Unit.Time) {
        bassSub.triggerRelease(time);
        bassBody.triggerRelease(time);
      },
      dispose() {
        bassSub.dispose();
        bassBody.dispose();
        bassSubLevel.dispose();
        bassBodyLevel.dispose();
        bassInputGain.dispose();
        bassGlue.dispose();
        bassDrive.dispose();
      },
    };

    // Warm dark melodic pluck: friendlier, less metallic and more usable for melodic techno.
    const synthColorDrive = new Tone.Distortion({ distortion: androidLite ? 0.015 : 0.05, wet: androidLite ? 0.02 : 0.08 });
    const synthFilter = new Tone.Filter({ frequency: cutoffForTrack("SYNTH", toneEqRef.current.SYNTH.cutoff), type: "lowpass", rolloff: -24, Q: 0.82 });
    const synthEq = new Tone.EQ3({
      low: eqKnobToDb(toneEqRef.current.SYNTH.low) - 1.2,
      mid: eqKnobToDb(toneEqRef.current.SYNTH.mid) + 0.8,
      high: eqKnobToDb(toneEqRef.current.SYNTH.high) - 2.0,
    });
    const synthDelay  = new Tone.PingPongDelay({ delayTime: "8n", feedback: androidLite ? 0.02 : 0.20, wet: androidLite ? 0 : 0.12 });
    const synthReverb = new Tone.Reverb({ decay: androidLite ? 0.15 : 2.8, wet: androidLite ? 0 : 0.18 });
    const synthAmp = new Tone.Gain(0.92);
    const synthLfo = new Tone.LFO({ frequency: 2.4, min: 700, max: 2200 });
    if (!androidLite) synthLfo.start();
    toneNodesRef.current.SYNTH = { eq: synthEq, filter: synthFilter };
    synthColorDrive.connect(synthFilter);
    synthFilter.connect(synthEq);
    if (androidLite) {
      synthEq.connect(synthAmp);
    } else {
      synthEq.connect(synthDelay);
      synthDelay.connect(synthReverb);
      synthReverb.connect(synthAmp);
    }
    synthAmp.connect(synthVol);
    const makeSynthVoice = () => new Tone.MonoSynth({
      oscillator: { type: synthVoiceRef.current.waveform as any },
      filter: { type: "lowpass", rolloff: -12, Q: 0.7 },
      envelope: { attack: 0.008, decay: 0.32, sustain: 0.07, release: 0.32 },
      filterEnvelope: { attack: 0.006, decay: 0.28, sustain: 0.06, release: 0.22, baseFrequency: 420, octaves: 2.6 },
      portamento: mapRange(synthVoiceRef.current.glide, 0, 100, 0, 0.26),
    }).connect(synthColorDrive);
    const synth = makeSynthVoice();
    const synthVoices = androidLite ? [] : [makeSynthVoice(), makeSynthVoice()];
    synthModNodesRef.current = { synth, synthVoices, filter: synthFilter, lfo: synthLfo, amp: synthAmp, colorDrive: synthColorDrive, delay: synthDelay, reverb: synthReverb };
    startSynthLfoEngine();
    applySynthVoice(synthVoiceRef.current);
    applySynthMod(synthModRef.current);
    synths.current = { kick, hat, perc, percB, bass, synth, synthVoices, texture: fx, fx };
    applyMixerState(mutesRef.current, solosRef.current);
  }

  // ── Sequencer ───────────────────────────────────────────────────────────────

  function getPhasedStep(step: number) {
    return (step + Math.floor((knobsRef.current.phase / 100) * 4)) % steps;
  }

  function maybeLiveChaos(step: number) {
    if (Math.random() > (knobsRef.current.chaos / 100) * 0.22) return;
    setPattern((prev) => prev.map((lane, row) => lane.map((s, col) => {
      if (row === 0 || col !== step) return s;
      const thresholds = [, , 0.35, 0.5, 0.8, 0.65, 0.75];
      const thresh = thresholds[row] ?? 0.5;
      return { ...s, active: Math.random() > thresh };
    })));
  }


  function applyStepLocksForTrigger(trackId: TrackId, row: number, stepIndex: number, time: number, gate = "16n") {
    // Performance v1: parameter-lock automation is expensive on low-power mobile.
    // Keep the musical gate variation but skip continuous FX/filter automation there.
    const lowPowerMode = performanceModeRef.current === "lite";
    const step = patternRef.current?.[row]?.[stepIndex];
    if (lowPowerMode) {
      const decay = typeof step?.locks?.decay === "number" ? step.locks.decay : undefined;
      if (decay === undefined) return gate;
      return decay > 70 ? "8n" : decay < 28 ? "32n" : gate;
    }
    const locks = step?.locks;
    if (!locks || !hasStepLocks(step)) return gate;

    const tone = typeof locks.tone === "number" ? locks.tone : undefined;
    const space = typeof locks.space === "number" ? locks.space : undefined;
    const drive = typeof locks.drive === "number" ? locks.drive : undefined;
    const decay = typeof locks.decay === "number" ? locks.decay : undefined;

    try {
      if (trackId === "PERC A" || trackId === "PERC B") {
        const design = drumDesignerRef.current;
        const source = design.perc;
        const targetTone = tone ?? source.tone;
        const targetSpace = space ?? source.space;
        const targetDrive = drive ?? source.snap;
        const targetDecay = decay ?? source.snap;
        const nodes = drumNodesRef.current;
        if (nodes.percBand) {
          nodes.percBand.frequency.setValueAtTime(mapRange(targetTone, 0, 100, 220, 2800), time);
          nodes.percBand.Q.setValueAtTime(mapRange(targetDrive, 0, 100, 0.5, 6.4), time);
        }
        if (nodes.percDrive) {
          nodes.percDrive.distortion = mapRange(targetDrive, 0, 100, 0.06, 0.62);
          nodes.percDrive.wet.setValueAtTime(clamp01(mapRange(targetDrive, 0, 100, 0.06, 0.42)), time);
        }
        if (nodes.percReverb) {
          nodes.percReverb.wet.setValueAtTime(clamp01(mapRange(targetSpace, 0, 100, 0.0, 0.42)), time);
        }
        if (synths.current?.percB?.filterEnvelope && trackId === "PERC B") {
          synths.current.percB.filterEnvelope.baseFrequency = mapRange(targetTone, 0, 100, 180, 1500);
          synths.current.percB.filterEnvelope.octaves = mapRange(targetDrive, 0, 100, 1.2, 5.2);
        }
        return decay !== undefined ? (decay > 70 ? "8n" : decay < 28 ? "32n" : gate) : gate;
      }

      if (trackId === "TEXTURE") {
        const nodes = drumNodesRef.current;
        if (nodes.fxFilter && tone !== undefined) {
          nodes.fxFilter.frequency.setValueAtTime(mapRange(tone, 0, 100, 260, 6800), time);
          nodes.fxFilter.Q.setValueAtTime(mapRange(drive ?? 40, 0, 100, 0.5, 5.4), time);
        }
        if (nodes.fxDelay && space !== undefined) {
          nodes.fxDelay.feedback.setValueAtTime(clamp01(mapRange(space, 0, 100, 0.08, 0.82)), time);
          nodes.fxDelay.wet.setValueAtTime(clamp01(mapRange(space, 0, 100, 0.04, 0.58)), time);
        }
        if (nodes.fxDrive && drive !== undefined) {
          nodes.fxDrive.distortion = mapRange(drive, 0, 100, 0.02, 0.58);
          nodes.fxDrive.wet.setValueAtTime(clamp01(mapRange(drive, 0, 100, 0.03, 0.40)), time);
        }
        return decay !== undefined ? (decay > 66 ? "4n" : decay > 38 ? "8n" : "16n") : gate;
      }

      if (trackId === "BASS") {
        const nodes = bassNodesRef.current;
        if (nodes.filter && tone !== undefined) {
          nodes.filter.frequency.setValueAtTime(mapRange(tone, 0, 100, 120, 4300), time);
          nodes.filter.Q.setValueAtTime(mapRange(drive ?? bassPerformanceRef.current.drive, 0, 100, 0.55, 2.7), time);
        }
        if (nodes.drive && drive !== undefined) {
          nodes.drive.distortion = mapRange(drive, 0, 100, 0.02, 0.62);
          nodes.drive.wet.setValueAtTime(clamp01(mapRange(drive, 0, 100, 0.06, 0.58)), time);
        }
        return decay !== undefined ? (decay > 72 ? "8n" : decay < 30 ? "32n" : gate) : gate;
      }

      if (trackId === "SYNTH") {
        const nodes = synthModNodesRef.current;
        if (nodes.filter && tone !== undefined) {
          nodes.filter.frequency.setValueAtTime(mapRange(tone, 0, 100, 360, 9800), time);
          nodes.filter.Q.setValueAtTime(mapRange(drive ?? 35, 0, 100, 0.45, 4.5), time);
        }
        if (nodes.colorDrive && drive !== undefined) {
          nodes.colorDrive.distortion = mapRange(drive, 0, 100, 0.02, 0.66);
          nodes.colorDrive.wet.setValueAtTime(clamp01(mapRange(drive, 0, 100, 0.03, 0.55)), time);
        }
        if (nodes.delay && space !== undefined) nodes.delay.wet.setValueAtTime(clamp01(mapRange(space, 0, 100, 0, 0.56)), time);
        if (nodes.reverb && space !== undefined) nodes.reverb.wet.setValueAtTime(clamp01(mapRange(space, 0, 100, 0.02, 0.72)), time);
        return decay !== undefined ? (decay > 70 ? "8n" : decay < 24 ? "32n" : gate) : gate;
      }
    } catch (_) {}

    return gate;
  }

  // Trigger one sound for a given track at a given Tone time
  function triggerTrack(trackId: TrackId, row: number, time: number, stepIndex: number, velocity = 100, note?: string, gate = "16n") {
    // Hard solo/mute gate:
    // do not even trigger muted/non-solo tracks.
    // This prevents samples, synth envelopes and FX tails from new hits when solo is active.
    if (!isTrackAudible(trackId)) return;

    const androidLite = performanceModeRef.current === "lite";

    // Performance v2 / Android Ultra Lite:
    // Keep the groove stable by allowing only essential voices through.
    // Extra percussion and texture were the main cause of underruns on Android.
    if (androidLite && (trackId === "PERC A" || trackId === "PERC B" || trackId === "TEXTURE")) return;

    const sampleDb = velocityToDb(androidLite ? Math.min(velocity, 84) : velocity);
    const synthVelocity = velocityToGain(androidLite ? Math.min(velocity, 68) : velocity);
    const s = samplesRef.current;

    function startSample(player?: Tone.Player) {
      if (!player) return false;
      try {
        player.volume.setValueAtTime(sampleDb, time);
        player.start(time);
        return true;
      } catch (_) {
        return false;
      }
    }

    const effectiveGate = applyStepLocksForTrigger(trackId, row, stepIndex, time, gate);

    switch (row) {
      case 0:
        if (!startSample(s.KICK?.player)) synths.current.kick.triggerAttackRelease("C1", effectiveGate, time, synthVelocity);
        triggerSidechain(time);
        break;
      case 1:
        if (androidLite && stepIndex % 2 === 0) break;
        if (!startSample(s.HAT?.player)) synths.current.hat.triggerAttackRelease("32n", time, synthVelocity * 0.72);
        break;
      case 2:
        if (!startSample(s["PERC A"]?.player)) synths.current.perc.triggerAttackRelease("C2", effectiveGate === "16n" ? "32n" : effectiveGate, time, synthVelocity);
        break;
      case 3:
        if (androidLite && stepIndex % 2 !== 0) break;
        if (!startSample(s["PERC B"]?.player)) {
          const percBNotes = ["G2", "A#2", "D3", "F3"];
          synths.current.percB.triggerAttackRelease(percBNotes[stepIndex % percBNotes.length], effectiveGate === "16n" ? "32n" : effectiveGate, time, synthVelocity * 0.84);
        }
        break;
      case 4:
        if (androidLite && stepIndex % 4 !== 0) break;
        if (!startSample(s.TEXTURE?.player)) {
          const textureNotes = ["D4", "F4", "A3", "C4", "G4"];
          synths.current.texture.triggerAttackRelease(textureNotes[stepIndex % textureNotes.length], effectiveGate === "16n" ? "8n" : effectiveGate, time, synthVelocity * 0.82);
        }
        break;
      case 5: {
        const playNote = note || BASS_NOTE_CYCLE[stepIndex % BASS_NOTE_CYCLE.length] || "D1";
        synths.current.bass.triggerAttackRelease(playNote, androidLite ? "32n" : effectiveGate, time, synthVelocity);
        break;
      }
      case 6: {
        const baseNote = note || SYNTH_NOTE_CYCLE[stepIndex % SYNTH_NOTE_CYCLE.length] || "D3";
        if (androidLite && stepIndex % 2 !== 0) break;
        const chord = patternRef.current?.[row]?.[stepIndex]?.chord || "SINGLE";
        const chordNotes = (androidLite
          ? [baseNote]
          : buildChordNotes(baseNote, chord as ChordMode, synthVoiceRef.current.octave));
        const voices = [synths.current.synth, ...(androidLite ? [] : (synths.current.synthVoices || []))].filter(Boolean);
        const arpState = androidLite ? { ...arpRef.current, mode: "OFF" as ArpMode } : arpRef.current;

        if (!arpState || arpState.mode === "OFF") {
          chordNotes.forEach((playNote, i) => {
            const voice = voices[i] || voices[0];
            voice?.triggerAttackRelease(playNote, effectiveGate, time, Math.max(0.08, synthVelocity * (i === 0 ? 1 : 0.72)));
          });
          break;
        }

        const arpNotes = buildArpNotes(chordNotes, arpState, stepIndex);
        const windowSec = Math.max(Tone.Time("8n").toSeconds(), Tone.Time(effectiveGate || "16n").toSeconds());
        const rateSec = Math.max(0.018, Tone.Time(arpState.rate).toSeconds());
        const maxHits = androidLite
          ? Math.max(1, Math.min(2, Math.floor(windowSec / rateSec) || 1))
          : Math.max(2, Math.min(24, Math.floor(windowSec / rateSec) || 2));
        const noteDur = Math.max(0.018, Math.min(rateSec * clamp01(arpState.gate / 100), rateSec * 0.96));

        for (let i = 0; i < maxHits; i++) {
          const playNote = arpNotes[(i + stepIndex) % arpNotes.length] || chordNotes[0] || baseNote;
          const voice = voices[i % voices.length] || voices[0];
          const accent = i % 4 === 0 ? 1 : i % 2 === 0 ? 0.82 : 0.68;
          voice?.triggerAttackRelease(playNote, noteDur, time + i * rateSec, Math.max(0.06, synthVelocity * accent));
        }
        break;
      }
    }
  }

  function stopPlayback() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    sequenceRef.current?.dispose();
    sequenceRef.current = null;
    (Object.values(duckNodesRef.current) as Tone.Gain[]).forEach((duck) => {
      try {
        duck.gain.cancelScheduledValues(Tone.now());
        duck.gain.value = 1;
      } catch (_) {}
    });
    applyMixerState(mutesRef.current, solosRef.current);
    setPlaying(false);
    lastUiStepRef.current = -1;
    setActiveStep(-1);
  }

  async function unlockAndroidAudio() {
    try {
      await Tone.start();
    } catch (_) {}

    try {
      const context = Tone.getContext();
      const rawContext = context.rawContext as AudioContext | undefined;

      if (rawContext?.state !== "running") {
        await rawContext?.resume();
      }

      if (Tone.context.state !== "running") {
        await Tone.context.resume();
      }
    } catch (_) {}

    try {
      Tone.Destination.mute = false;
      Tone.Destination.volume.value = 0;
      const destination = Tone.getDestination() as any;
      if (destination?.volume) destination.volume.value = 0;
    } catch (_) {}

    // Chrome Android sometimes needs an actual audio node started from the tap event.
    // This silent click unlocks the output without making noise.
    try {
      const gain = new Tone.Gain(0).toDestination();
      const osc = new Tone.Oscillator(440, "sine").connect(gain);
      const now = Tone.now();
      osc.start(now);
      osc.stop(now + 0.03);
      setTimeout(() => {
        try { osc.dispose(); } catch (_) {}
        try { gain.dispose(); } catch (_) {}
      }, 120);
    } catch (_) {}
  }

  async function togglePlay() {
    await unlockAndroidAudio();

    if (playing) {
      stopPlayback();
      return;
    }

    performanceModeRef.current = getPerformanceMode();
    setupAudio();
    await unlockAndroidAudio();

    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.bpm.value = bpm;
    Tone.Transport.swing = knobsRef.current.groove / 160;
    sequenceRef.current?.dispose();

    const stepDuration = Tone.Time("16n").toSeconds();
    const isLitePlayback = performanceModeRef.current === "lite";

    sequenceRef.current = new Tone.Sequence(
      (time, step) => {
        const transportStep = getPhasedStep(step);
        // Performance v1: throttle UI playhead updates on Lite devices.
        if (!isLitePlayback || transportStep % 4 === 0 || transportStep === 0) {
          if (lastUiStepRef.current !== transportStep) {
            lastUiStepRef.current = transportStep;
            setActiveStep(transportStep);
          }
        }
        // Disabled to prevent random steps from being generated during playback.
        // Use the MUTATE / GENERATE / DESTROY buttons for intentional changes.
        // maybeLiveChaos(step);
        const current = patternRef.current;
        const lengths = trackLengthsRef.current;

        const playbackTracks = isLitePlayback ? LITE_PLAYBACK_TRACKS : tracks;
        playbackTracks.forEach((trackId) => {
          const row = tracks.indexOf(trackId);
          const laneLength = Math.max(1, Math.min(steps, lengths[trackId] || steps));
          const laneStep = transportStep % laneLength;
          const cell = current[row][laneStep];
          if (!cell?.active) return;

          // Probability gate — roll once per step
          if (Math.random() * 100 > cell.probability) return;

          const ratchet = isLitePlayback ? 1 : (RATCHET_TRACKS.has(trackId) ? cell.ratchet : 1);
          const gate = trackId === "BASS" || trackId === "SYNTH" ? (cell.gate || "16n") : "16n";
          const note = trackId === "BASS" || trackId === "SYNTH" ? cell.note : undefined;

          if (ratchet <= 1) {
            triggerTrack(trackId, row, time, laneStep, cell.velocity, note, gate);
          } else {
            // Schedule each ratchet hit evenly within the 16n window
            const interval = stepDuration / ratchet;
            for (let r = 0; r < ratchet; r++) {
              triggerTrack(trackId, row, time + r * interval, laneStep, cell.velocity, note, gate);
            }
          }
        });
      },
      Array.from({ length: steps }, (_, i) => i),
      "16n"
    );

    sequenceRef.current.start(0);
    Tone.Transport.start("+0.05");
    setPlaying(true);
  }

  // ── Pattern mutations ────────────────────────────────────────────────────────

  function toggleStep(row: number, col: number) {
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((s, c) => r === row && c === col ? { ...s, active: !s.active } : s)
    ));
  }

  function cycleProb(row: number, col: number) {
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((s, c) => r === row && c === col ? { ...s, probability: nextProb(s.probability) } : s)
    ));
  }

  function cycleRatch(row: number, col: number) {
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((s, c) => r === row && c === col ? { ...s, ratchet: nextRatch(s.ratchet) } : s)
    ));
  }

  function cycleVelocity(row: number, col: number) {
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((s, c) => r === row && c === col ? { ...s, velocity: nextVelocity(s.velocity ?? 100) } : s)
    ));
  }

  function cycleNote(row: number, col: number) {
    const track = tracks[row];
    if (track !== "BASS" && track !== "SYNTH") return;
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((s, c) => r === row && c === col ? { ...s, note: nextNote(track, s.note) } : s)
    ));
  }

  function cycleGate(row: number, col: number) {
    const track = tracks[row];
    if (track !== "BASS" && track !== "SYNTH") return;
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((s, c) => r === row && c === col ? { ...s, gate: nextGate(s.gate) } : s)
    ));
  }

  function cycleChord(row: number, col: number) {
    const track = tracks[row];
    if (track !== "SYNTH") return;
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((s, c) => r === row && c === col ? { ...s, active: true, chord: nextChordMode(s.chord as ChordMode) } : s)
    ));
  }


  function cycleStepLocks(row: number, col: number) {
    const track = tracks[row];
    if (!track || track === "KICK" || track === "HAT") return;
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((step, c) => r === row && c === col
        ? { ...step, active: true, locks: nextStepLockPreset(track, step.locks) }
        : step
      )
    ));
  }

  function randomizeStepLocks() {
    const lockTracks = new Set<TrackId>(["PERC A", "PERC B", "TEXTURE", "BASS", "SYNTH"] as TrackId[]);
    setPattern((prev) => prev.map((lane, row) => {
      const track = tracks[row];
      if (!lockTracks.has(track)) return lane;
      const length = trackLengthsRef.current[track] || steps;
      return lane.map((step, col) => {
        if (col >= length) return { ...step, locks: undefined };
        if (!step.active && Math.random() > 0.10) return step;
        const chance = track === "SYNTH" ? 0.34 : track === "TEXTURE" ? 0.46 : 0.30;
        return Math.random() < chance ? { ...step, locks: randomStepLocks(track) } : step;
      });
    }));
  }

  function clearStepLocks() {
    setPattern((prev) => prev.map((lane) => lane.map((step) => ({ ...step, locks: undefined }))));
  }

  function pickSynthChord(col: number, isActive = true): ChordMode {
    const position = col % 16;

    // Keep chord random musical, but do NOT decide whether the step is active here.
    // This function only chooses chord color.
    const weighted: ChordMode[] =
      [0, 4, 8, 12].includes(position)
        ? ["MINOR", "MINOR", "MIN7", "SUS2", "SUS4", "POWER", "OCTAVE"]
        : isActive
          ? ["MINOR", "MIN7", "SUS2", "SUS2", "SUS4", "POWER", "OCTAVE", "SINGLE"]
          : ["SINGLE", "SINGLE", "OCTAVE", "POWER", "SUS2"];

    return weighted[Math.floor(Math.random() * weighted.length)] || "SINGLE";
  }

  function randomizeChords() {
    const row = tracks.indexOf("SYNTH");
    const length = trackLengthsRef.current.SYNTH || steps;

    // IMPORTANT: Rand Chords must NOT add/activate steps.
    // It only rewrites chord modes for the existing synth lane.
    setPattern((prev) => prev.map((lane, r) => {
      if (r !== row) return lane;
      return lane.map((step, col) => {
        if (col >= length) return { ...step, chord: "SINGLE" as ChordMode };
        return {
          ...step,
          active: step.active,
          note: step.note || defaultNoteForTrack("SYNTH", col),
          chord: pickSynthChord(col, step.active),
        };
      });
    }));
  }

  function resetChords() {
    const row = tracks.indexOf("SYNTH");
    setPattern((prev) => prev.map((lane, r) =>
      r === row ? lane.map((step) => ({ ...step, chord: "SINGLE" as ChordMode })) : lane
    ));
  }

  function setTrackLength(track: TrackId, length: number) {
    const safeLength = Math.max(1, Math.min(steps, Math.round(length)));
    setTrackLengths((prev) => ({ ...prev, [track]: safeLength }));
    if (isEuclideanTrack(track) && euclideanRef.current[track]?.enabled) {
      const current = euclideanRef.current[track];
      const nextLane = { ...current, hits: Math.min(current.hits, safeLength), rotate: current.rotate % safeLength };
      setEuclidean((prev) => ({ ...prev, [track]: nextLane }));
      euclideanRef.current = { ...euclideanRef.current, [track]: nextLane };
      setTimeout(() => applyEuclideanLane(track, nextLane, safeLength), 0);
    }
  }

  function changeTrackLength(track: TrackId, delta: number) {
    // +/- moves one step at a time. Preset buttons below jump directly to musical lengths.
    const current = trackLengthsRef.current[track] || steps;
    setTrackLength(track, Math.max(1, Math.min(steps, current + delta)));
  }

  function cycleTrackLength(track: TrackId) {
    setTrackLength(track, nextTrackLength(trackLengthsRef.current[track] || steps));
  }

  function applyEuclideanLane(track: EuclideanTrackId, laneState = euclideanRef.current[track], length = trackLengthsRef.current[track] || DEFAULT_TRACK_LENGTHS[track]) {
    const row = tracks.indexOf(track);
    if (row < 0) return;

    const safeLength = Math.max(1, Math.min(steps, Math.round(length)));
    const rhythm = euclideanPattern(safeLength, laneState.hits, laneState.rotate);

    setPattern((prev) => prev.map((lane, r) => {
      if (r !== row) return lane;
      return lane.map((step, col) => ({
        ...step,
        active: col < safeLength ? rhythm[col] : false,
        note: step.note || defaultNoteForTrack(track, col),
        gate: step.gate || "16n",
      }));
    }));
  }

  function applyAllEuclideanLanes(source = euclideanRef.current) {
    EUCLIDEAN_TRACKS.forEach((track) => {
      if (source[track]?.enabled) applyEuclideanLane(track, source[track]);
    });
  }

  function updateEuclideanLane(track: EuclideanTrackId, patch: Partial<EuclideanLaneState>, shouldApply = true) {
    setEuclidean((prev) => {
      const length = trackLengthsRef.current[track] || DEFAULT_TRACK_LENGTHS[track];
      const nextLane: EuclideanLaneState = {
        ...prev[track],
        ...patch,
      };
      nextLane.hits = Math.max(0, Math.min(length, Math.round(nextLane.hits)));
      nextLane.rotate = Math.max(0, Math.min(length - 1, Math.round(nextLane.rotate)));
      const next = { ...prev, [track]: nextLane };
      euclideanRef.current = next;
      if (shouldApply && nextLane.enabled) {
        setTimeout(() => applyEuclideanLane(track, nextLane, length), 0);
      }
      return next;
    });
  }

  function toggleEuclideanTrack(track: EuclideanTrackId) {
    const nextEnabled = !euclideanRef.current[track].enabled;
    updateEuclideanLane(track, { enabled: nextEnabled }, nextEnabled);
  }

  function randomizeEuclideanTrack(track: EuclideanTrackId) {
    const length = trackLengthsRef.current[track] || DEFAULT_TRACK_LENGTHS[track];
    const ranges: Record<EuclideanTrackId, [number, number]> = {
      HAT: [5, Math.min(11, length)],
      "PERC A": [3, Math.min(8, length)],
      "PERC B": [2, Math.min(7, length)],
      TEXTURE: [1, Math.min(4, length)],
    };
    const [minHits, maxHits] = ranges[track];
    const hits = Math.max(1, Math.min(length, Math.round(mapRange(Math.random(), 0, 1, minHits, maxHits))));
    const rotate = Math.floor(Math.random() * length);
    updateEuclideanLane(track, { enabled: true, hits, rotate }, true);
  }

  function randomizeEuclideanAll() {
    EUCLIDEAN_TRACKS.forEach((track) => randomizeEuclideanTrack(track));
  }

  function clearEuclideanAll() {
    setEuclidean(DEFAULT_EUCLIDEAN);
    euclideanRef.current = DEFAULT_EUCLIDEAN;
  }

  function randomizeTrack(track: TrackId, row: number) {
    if (isEuclideanTrack(track) && euclideanRef.current[track]?.enabled) {
      randomizeEuclideanTrack(track);
      return;
    }
    const densityFactor = knobsRef.current.density / 100;
    const laneLength = Math.max(1, Math.min(steps, trackLengthsRef.current[track] || steps));

    setPattern((prev) =>
      prev.map((lane, r) => {
        if (r !== row) return lane;

        return lane.map((step, col) => {
          if (col >= laneLength) return { ...step, active: false };

          let active = false;
          if (track === "KICK") active = col === 0;
          else if (track === "HAT") active = col % 2 === 1 ? Math.random() < 0.28 + densityFactor * 0.42 : Math.random() < densityFactor * 0.12;
          else if (track === "PERC A") active = [2, 5, 7, 10, 13, 15].includes(col) ? Math.random() < 0.28 + densityFactor * 0.46 : Math.random() < densityFactor * 0.16;
          else if (track === "PERC B") active = [3, 6, 11, 14].includes(col) ? Math.random() < 0.22 + densityFactor * 0.38 : Math.random() < densityFactor * 0.13;
          else if (track === "TEXTURE") active = Math.random() < 0.03 + densityFactor * 0.12;
          else if (track === "BASS") active = col % 4 === 0 || Math.random() < densityFactor * 0.24;
          else if (track === "SYNTH") active = Math.random() < densityFactor * 0.30;

          return {
            ...step,
            active,
            note: step.note || defaultNoteForTrack(track, col),
            gate: step.gate || "16n",
          };
        });
      })
    );
  }

  function mutate(amount = 0.16) {
    const ca = amount + knobs.chaos / 400;
    setPattern((prev) => prev.map((lane, row) => lane.map((s, col) => {
      if (row === 0 && col % 4 === 0) return { ...s, active: true };
      return Math.random() < ca ? { ...s, active: !s.active } : s;
    })));
  }

  function destroy() {
    setPattern((prev) => prev.map((lane, row) => lane.map((s, col) => ({
      ...s,
      active: row === 0 ? col % 4 === 0 || Math.random() > 0.82 : Math.random() > 0.45,
    }))));
  }

  function generate() {
    setPattern(generatePattern(knobs.density));
    setTimeout(() => applyAllEuclideanLanes(), 0);
  }

  function clearPattern() {
    setPattern(
      tracks.map((track) =>
        Array.from({ length: steps }, (_, index) => ({
          active: false,
          probability: 100,
          ratchet: 1,
          velocity: 100,
          note: defaultNoteForTrack(track, index),
          gate: "16n",
          chord: track === "SYNTH" ? "SINGLE" as ChordMode : undefined,
        }))
      )
    );
  }

  function persistPresets(next: PresetData[]) {
    setPresets(next);
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
  }

  function savePreset() {
    const cleanName = presetName.trim() || `PHASE ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const preset: PresetData = {
      id: selectedPresetId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      name: cleanName,
      createdAt: Date.now(),
      pattern,
      bpm,
      knobs,
      volumes,
      mutes,
      solos,
      sampleNames,
      masterFx,
      masterVolume,
      synthMod,
      synthVoice,
      arp,
      sidechain,
      bassPerformance,
      drumDesigner,
      euclidean,
      toneEq,
      trackLengths,
    };

    const exists = presets.some((p) => p.id === preset.id);
    const next = exists
      ? presets.map((p) => (p.id === preset.id ? preset : p))
      : [preset, ...presets];

    persistPresets(next);
    setSelectedPresetId(preset.id);
    setPresetName(cleanName);
    setPresetStatus(exists ? `Updated ${cleanName}` : `Saved ${cleanName}`);
  }

  function loadPreset(id = selectedPresetId) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) {
      setPresetStatus("Select a preset first");
      return;
    }

    stopPlayback();
    setPattern(normalizePattern(preset.pattern));
    setBpm(preset.bpm);
    setKnobs(preset.knobs);
    setVolumes(preset.volumes);
    setMutes(preset.mutes);
    setSolos(preset.solos);
    setMasterFx(preset.masterFx || { filter: 50, reverb: 14, delay: 10, drive: 8 });
    setMasterVolume(typeof preset.masterVolume === "number" ? preset.masterVolume : -3);
    setSynthMod(preset.synthMod || DEFAULT_SYNTH_MOD);
    setSynthVoice(preset.synthVoice || DEFAULT_SYNTH_VOICE);
    setArp(preset.arp || DEFAULT_ARP);
    setSidechain(preset.sidechain || DEFAULT_SIDECHAIN);
    setBassPerformance(preset.bassPerformance || DEFAULT_BASS_PERFORMANCE);
    setDrumDesigner(preset.drumDesigner || DEFAULT_DRUM_DESIGNER);
    const normalizedEuclidean = normalizeEuclidean(preset.euclidean);
    setEuclidean(normalizedEuclidean);
    euclideanRef.current = normalizedEuclidean;
    setToneEq(normalizeToneEq(preset.toneEq));
    const normalizedLengths = normalizeTrackLengths(preset.trackLengths);
    setTrackLengths(normalizedLengths);
    trackLengthsRef.current = normalizedLengths;
    setTimeout(() => applyAllEuclideanLanes(normalizedEuclidean), 0);
    setSampleNames(preset.sampleNames || {});
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    setPresetStatus(`Loaded ${preset.name}`);
  }

  function deletePreset() {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) {
      setPresetStatus("Select a preset first");
      return;
    }

    const next = presets.filter((p) => p.id !== selectedPresetId);
    persistPresets(next);
    const nextSelected = next[0]?.id || "";
    setSelectedPresetId(nextSelected);
    setPresetName(next[0]?.name || "Dark Pattern 01");
    setPresetStatus(`Deleted ${preset.name}`);
  }

  function updateKnob(name: keyof typeof knobs, value: number) {
    setKnobs((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "density") setPattern(generatePattern(value));
      return next;
    });
  }

  function updateMasterFx(name: keyof MasterFxState, value: number) {
    setMasterFx((prev) => ({ ...prev, [name]: value }));
  }

  function resetMasterFilter() {
    setMasterFx(MASTER_FX_NEUTRAL);
  }

  function resetMasterVolume() {
    setMasterVolume(-3);
  }

  function updateSynthMod(name: keyof SynthModState, value: number) {
    setSynthMod((prev) => ({ ...prev, [name]: value }));
  }

  function resetSynthMod() {
    setSynthMod(DEFAULT_SYNTH_MOD);
  }

  function randomizeSynthMod() {
    setSynthMod({
      lfoRate: Math.round(mapRange(Math.random(), 0, 1, 8, 72)),
      lfoDepth: Math.round(mapRange(Math.random(), 0, 1, 12, 74)),
      filterEnv: Math.round(mapRange(Math.random(), 0, 1, 18, 72)),
      pluckDecay: Math.round(mapRange(Math.random(), 0, 1, 14, 76)),
      fmAmount: Math.round(mapRange(Math.random(), 0, 1, 0, 58)),
      detune: Math.round(mapRange(Math.random(), 0, 1, 0, 32)),
      delaySend: Math.round(mapRange(Math.random(), 0, 1, 0, 54)),
      reverbSend: Math.round(mapRange(Math.random(), 0, 1, 8, 62)),
    });
  }

  function updateSynthVoice<K extends keyof SynthVoiceState>(name: K, value: SynthVoiceState[K]) {
    setSynthVoice((prev) => ({ ...prev, [name]: value }));
  }

  function resetSynthVoice() {
    setSynthVoice(DEFAULT_SYNTH_VOICE);
  }

  function updateArp<K extends keyof ArpState>(name: K, value: ArpState[K]) {
    setArp((prev) => ({ ...prev, [name]: value }));
  }

  function resetArp() {
    setArp(DEFAULT_ARP);
  }

  function randomizeArp() {
    const modes: ArpMode[] = ["UP", "DOWN", "UPDOWN", "RANDOM", "OCTAVE", "RATCHET"];
    const rates: ArpRate[] = ["8n", "16n", "32n", "16t"];
    setArp({
      mode: modes[Math.floor(Math.random() * modes.length)],
      rate: rates[Math.floor(Math.random() * rates.length)],
      gate: Math.round(mapRange(Math.random(), 0, 1, 34, 86)),
      octaves: Math.round(mapRange(Math.random(), 0, 1, 1, 3)),
    });
  }

  function updateSidechain<K extends keyof SidechainState>(name: K, value: SidechainState[K]) {
    setSidechain((prev) => ({ ...prev, [name]: value }));
  }

  function resetSidechain() {
    setSidechain(DEFAULT_SIDECHAIN);
  }

  function updateBassPerformance<K extends keyof BassPerformanceState>(name: K, value: BassPerformanceState[K]) {
    setBassPerformance((prev) => ({ ...prev, [name]: value }));
  }

  function resetBassPerformance() {
    setBassPerformance(DEFAULT_BASS_PERFORMANCE);
  }

  function randomizeBassPerformance() {
    setBassPerformance({
      sub: Math.round(mapRange(Math.random(), 0, 1, 42, 78)),
      punch: Math.round(mapRange(Math.random(), 0, 1, 52, 92)),
      cutoff: Math.round(mapRange(Math.random(), 0, 1, 44, 88)),
      drive: Math.round(mapRange(Math.random(), 0, 1, 18, 68)),
      decay: Math.round(mapRange(Math.random(), 0, 1, 24, 66)),
      glide: Math.round(mapRange(Math.random(), 0, 1, 0, 38)),
    });
  }

  function updateDrumDesigner(section: keyof DrumDesignerState, name: string, value: number) {
    setDrumDesigner((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as Record<string, number>), [name]: value },
    }));
  }

  function resetDrumDesigner() {
    setDrumDesigner(DEFAULT_DRUM_DESIGNER);
  }

  function randomizeDrumDesigner() {
    const pick = (a: number, b: number) => Math.round(mapRange(Math.random(), 0, 1, a, b));
    const extreme = () => Math.random() > 0.5 ? pick(72, 100) : pick(0, 28);
    setDrumDesigner({
      kick: {
        pitch: pick(24, 92),
        decay: pick(18, 92),
        click: extreme(),
        body: pick(26, 100),
        drive: pick(0, 92),
      },
      hat: {
        brightness: pick(8, 100),
        decay: pick(8, 92),
        air: extreme(),
        texture: pick(0, 100),
      },
      perc: {
        tone: pick(0, 100),
        resonance: Math.random() > 0.35 ? pick(62, 100) : pick(0, 36),
        snap: pick(0, 100),
        space: Math.random() > 0.55 ? pick(68, 100) : pick(0, 34),
      },
      fx: {
        size: pick(12, 100),
        feedback: Math.random() > 0.45 ? pick(66, 100) : pick(0, 34),
        tone: pick(0, 100),
        noise: pick(0, 100),
      },
    });
  }

  function updatePerformancePad<K extends keyof PerformancePadState>(name: K, value: PerformancePadState[K]) {
    setPerformancePad((prev) => {
      const next = { ...prev, [name]: value };
      performancePadRef.current = next;
      return next;
    });
  }

  function applyPerformancePad(x: number, y: number, mode = performancePadRef.current.mode) {
    const safeX = clamp01(x);
    const safeY = clamp01(y);
    // More dramatic, performance-friendly curves.
    const xCurve = safeX < 0.5
      ? 0.5 * Math.pow(safeX * 2, 1.65)
      : 1 - 0.5 * Math.pow((1 - safeX) * 2, 1.65);
    const yCurve = Math.pow(safeY, 0.72);

    if (mode === "SYNTH") {
      // X = extreme synth filter sweep, Y = huge space.
      setToneEq((prev) => ({
        ...prev,
        SYNTH: {
          ...prev.SYNTH,
          cutoff: Math.round(mapRange(xCurve, 0, 1, 2, 100)),
          high: Math.round(mapRange(xCurve, 0, 1, 24, 86)),
        },
      }));
      setSynthMod((prev) => ({
        ...prev,
        filterEnv: Math.round(mapRange(xCurve, 0, 1, 6, 94)),
        reverbSend: Math.round(mapRange(yCurve, 0, 1, 0, 96)),
      }));
      return;
    }

    if (mode === "ATMOS") {
      // X = much stronger color/saturation, Y = dubby delay + reverb wash.
      setSynthMod((prev) => ({
        ...prev,
        fmAmount: Math.round(mapRange(xCurve, 0, 1, 0, 100)),
        delaySend: Math.round(mapRange(yCurve, 0, 1, 0, 100)),
        reverbSend: Math.round(mapRange(yCurve, 0, 1, 4, 98)),
        lfoDepth: Math.round(mapRange(Math.max(xCurve, yCurve), 0, 1, prev.lfoDepth, 92)),
      }));
      return;
    }

    // MASTER mode: dramatic DJ filter sweep + stronger drive.
    setMasterFx((prev) => ({
      ...prev,
      filter: Math.round(mapRange(xCurve, 0, 1, 0, 100)),
      drive: Math.round(mapRange(yCurve, 0, 1, 0, 92)),
      delay: Math.round(mapRange(yCurve, 0, 1, 0, 58)),
      reverb: Math.round(mapRange(yCurve, 0, 1, 0, 52)),
    }));
  }

  function setPerformancePadPositionFromEvent(e: React.PointerEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01(1 - (e.clientY - rect.top) / rect.height);

    setPerformancePad((prev) => {
      const next = { ...prev, x, y, active: true };
      performancePadRef.current = next;
      return next;
    });
    applyPerformancePad(x, y);
  }

  function handlePerformancePadDown(e: React.PointerEvent<HTMLElement>) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    setPerformancePadPositionFromEvent(e);
  }

  function handlePerformancePadMove(e: React.PointerEvent<HTMLElement>) {
    if (!performancePadRef.current.active) return;
    setPerformancePadPositionFromEvent(e);
  }

  function handlePerformancePadUp(e: React.PointerEvent<HTMLElement>) {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}

    const current = performancePadRef.current;
    if (current.hold) {
      setPerformancePad((prev) => {
        const next = { ...prev, active: false };
        performancePadRef.current = next;
        return next;
      });
      return;
    }

    const next = { ...current, x: 0.5, y: 0.5, active: false };
    performancePadRef.current = next;
    setPerformancePad(next);
    applyPerformancePad(0.5, 0.5, current.mode);
  }

  function resetPerformancePad() {
    const next = { ...DEFAULT_PERFORMANCE_PAD, mode: performancePadRef.current.mode, hold: performancePadRef.current.hold };
    performancePadRef.current = next;
    setPerformancePad(next);
    applyPerformancePad(next.x, next.y, next.mode);
  }

  function setStepNote(track: TrackId, col: number, note: string) {
    const row = tracks.indexOf(track);
    if (row < 0) return;
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((step, c) => r === row && c === col ? { ...step, note, active: true } : step)
    ));
  }

  function setStepGate(track: TrackId, col: number, gate: string) {
    const row = tracks.indexOf(track);
    if (row < 0) return;
    setPattern((prev) => prev.map((lane, r) =>
      lane.map((step, c) => r === row && c === col ? { ...step, gate, active: true } : step)
    ));
  }

  function transposeTrackNotes(track: TrackId, semitones: number) {
    const row = tracks.indexOf(track);
    const fallback = track === "BASS" ? "D1" : "D3";
    setPattern((prev) => prev.map((lane, r) =>
      r === row ? lane.map((step) => ({ ...step, note: transposeNote(step.note, semitones, fallback) })) : lane
    ));
  }

  function randomizeMelody(track: TrackId) {
    const row = tracks.indexOf(track);
    const pool = track === "BASS" ? BASS_RANDOM_NOTES : SYNTH_RANDOM_NOTES;
    const length = trackLengthsRef.current[track] || steps;
    setPattern((prev) => prev.map((lane, r) => {
      if (r !== row) return lane;
      return lane.map((step, col) => col < length ? {
        ...step,
        active: Math.random() > (track === "BASS" ? 0.48 : 0.58),
        note: pool[Math.floor(Math.random() * pool.length)],
        gate: Math.random() > 0.68 ? "8n" : "16n",
        velocity: VELOCITY_CYCLE[Math.floor(Math.random() * VELOCITY_CYCLE.length)],
        chord: track === "SYNTH" ? pickSynthChord(col, true) : step.chord,
      } : step);
    }));
  }

  function resetMelody(track: TrackId) {
    const row = tracks.indexOf(track);
    setPattern((prev) => prev.map((lane, r) =>
      r === row ? lane.map((step, col) => ({ ...step, note: defaultNoteForTrack(track, col), gate: "16n", velocity: 100, chord: track === "SYNTH" ? "SINGLE" as ChordMode : step.chord })) : lane
    ));
  }

  function updateToneEq(track: ToneTrackId, name: keyof TrackEqState, value: number) {
    setToneEq((prev) => ({
      ...prev,
      [track]: { ...prev[track], [name]: value },
    }));
  }

  function resetToneEq(track: ToneTrackId) {
    setToneEq((prev) => ({ ...prev, [track]: DEFAULT_TONE_EQ[track] }));
  }

  // ── Mixer ────────────────────────────────────────────────────────────────────

  function setTrackVolume(id: TrackId, db: number) {
    setVolumes((prev) => ({ ...prev, [id]: db }));
  }

  function toggleMute(id: TrackId) {
    setMutes((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      mutesRef.current = next;
      applyMixerState(next, solosRef.current);
      if (next[id]) silenceNonAudibleTracks(solosRef.current, next);
      return next;
    });
  }

  function silenceNonAudibleTracks(nextSolos: Record<TrackId, boolean>, nextMutes = mutesRef.current) {
    tracks.forEach((track) => {
      if (!getEffectiveMute(track, nextMutes, nextSolos)) return;

      try {
        const sample = SAMPLE_TRACKS.includes(track as SampleTrack)
          ? samplesRef.current[track as SampleTrack]?.player
          : undefined;
        sample?.stop();
      } catch (_) {}

      try {
        if (track === "BASS") synths.current?.bass?.triggerRelease?.();
        if (track === "SYNTH") {
          synths.current?.synth?.triggerRelease?.();
          (synths.current?.synthVoices || []).forEach((voice: Tone.MonoSynth) => voice?.triggerRelease?.());
        }
        if (track === "TEXTURE") synths.current?.texture?.triggerRelease?.();
      } catch (_) {}
    });
  }

  function toggleSolo(id: TrackId) {
    setSolos((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      solosRef.current = next;
      applyMixerState(mutesRef.current, next);
      silenceNonAudibleTracks(next);
      return next;
    });
  }

  // ── Samples ──────────────────────────────────────────────────────────────────

  function openSamplePicker(track: SampleTrack) {
    pendingTrack.current = track;
    fileInputRef.current?.click();
  }

  function isSupportedAudioFile(file: File) {
    const lower = file.name.toLowerCase();
    return file.type.startsWith("audio/") || /\.(wav|aif|aiff|mp3|m4a|ogg|flac)$/i.test(lower);
  }

  async function loadSampleFile(track: SampleTrack, file: File) {
    if (!isSupportedAudioFile(file)) return;

    await Tone.start();
    setupAudio();

    const prev = samplesRef.current[track];
    if (prev) {
      try { prev.player.dispose(); } catch (_) {}
      URL.revokeObjectURL(prev.url);
    }

    const url = URL.createObjectURL(file);
    const volNode = volNodesRef.current[track]!;
    const player = new Tone.Player({ url, loop: false }).connect(volNode);

    await Tone.loaded();
    samplesRef.current[track] = { player, url };
    setSampleNames((p) => ({ ...p, [track]: file.name }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file  = e.target.files?.[0];
    const track = pendingTrack.current;
    if (!file || !track) return;
    await loadSampleFile(track, file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSampleDrop(e: React.DragEvent<HTMLElement>, track: SampleTrack) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTrack(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await loadSampleFile(track, file);
  }

  function handleSampleDragOver(e: React.DragEvent<HTMLElement>, track: SampleTrack) {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverTrack !== track) setDragOverTrack(track);
  }

  function handleSampleDragLeave(e: React.DragEvent<HTMLElement>, track: SampleTrack) {
    e.preventDefault();
    e.stopPropagation();
    const nextTarget = e.relatedTarget as Node | null;
    if (nextTarget && e.currentTarget.contains(nextTarget)) return;
    if (dragOverTrack === track) setDragOverTrack(null);
  }

  function removeSample(track: SampleTrack) {
    const entry = samplesRef.current[track];
    if (entry) { try { entry.player.dispose(); } catch (_) {} URL.revokeObjectURL(entry.url); delete samplesRef.current[track]; }
    setSampleNames((prev) => { const next = { ...prev }; delete next[track]; return next; });
  }

  const anySoloed = tracks.some((id) => solos[id]);

  // ── PHASE LIVE CODE ─────────────────────────────────────────────────────────

  function runLiveCode() {
    const result = parsePhaseLiveCode(liveCode, patternRef.current, trackLengthsRef.current);

    setPattern(result.pattern);
    patternRef.current = result.pattern;

    setTrackLengths(result.lengths);
    trackLengthsRef.current = result.lengths;

    if (typeof result.bpm === "number") setBpm(result.bpm);

    if (Object.keys(result.knobs).length) {
      setKnobs((prev) => ({ ...prev, ...result.knobs }));
      knobsRef.current = { ...knobsRef.current, ...result.knobs };
    }

    setLiveStatus(result.status);
  }

  function clearLiveCode() {
    setLiveCode("");
    setLiveStatus("PHASE LIVE cleared");
  }

  function randomLiveCode() {
    const next = LIVE_CODE_RANDOMS[Math.floor(Math.random() * LIVE_CODE_RANDOMS.length)] || LIVE_CODE_DEFAULT;
    setLiveCode(next);
    const result = parsePhaseLiveCode(next, patternRef.current, trackLengthsRef.current);

    setPattern(result.pattern);
    patternRef.current = result.pattern;

    setTrackLengths(result.lengths);
    trackLengthsRef.current = result.lengths;

    if (typeof result.bpm === "number") setBpm(result.bpm);

    if (Object.keys(result.knobs).length) {
      setKnobs((prev) => ({ ...prev, ...result.knobs }));
      knobsRef.current = { ...knobsRef.current, ...result.knobs };
    }

    setLiveStatus(result.status);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="ph-main">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::selection { background: rgba(145,110,255,0.32); color: #fff; }

        .ph-main {
          min-height: 100vh; overflow: auto; font-size: 12px;
          background:
            radial-gradient(circle at 50% -25%, rgba(91,65,155,0.34) 0%, rgba(17,24,32,0.2) 33%, transparent 58%),
            linear-gradient(180deg, #071017 0%, #05090d 50%, #030406 100%);
          color: #eef2f7;
          font-family: 'DM Mono', 'Fira Mono', monospace;
          position: relative;
        }
        .ph-main::before {
          content: ''; position: fixed; inset: 0; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.7'/%3E%3C/svg%3E");
          opacity: 0.038; mix-blend-mode: screen; z-index: 0;
        }
        .ph-page { position: relative; z-index: 1; max-width: 1880px; margin: 0 auto; padding: 0 10px 10px; }

        /* ── Topbar ── */
        .ph-topbar {
          height: 58px; display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center; gap: 8px; padding: 0 14px;
          background: linear-gradient(180deg, rgba(22,32,42,0.96), rgba(12,18,26,0.96));
          border: 1px solid rgba(255,255,255,0.055); border-top: 0;
          border-radius: 0 0 12px 12px;
          box-shadow: 0 20px 70px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .ph-brand { display: flex; align-items: center; gap: 8px; min-width: 210px; }
        .ph-logo { font-size: 24px; line-height: 1; letter-spacing: 0.11em; font-weight: 600; color: #f4f7fb; font-family: 'Inter', system-ui, sans-serif; }
        .ph-brand-sub { font-size: 10px; letter-spacing: 0.38em; color: #7c8492; text-transform: uppercase; white-space: nowrap; }
        .ph-transport-top { display: flex; align-items: center; justify-content: center; gap: 8px; }
        .ph-round-btn {
          width: 42px; height: 42px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.04); color: #f4f0ff;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; transition: 140ms ease;
        }
        .ph-round-btn.play {
          background: radial-gradient(circle at 35% 25%, #b193ff 0%, #7b50e8 55%, #4a2db2 100%);
          border-color: rgba(198,174,255,0.7);
          box-shadow: 0 0 35px rgba(132,83,255,0.55), inset 0 1px 0 rgba(255,255,255,0.35);
        }
        .ph-round-btn.stop-state { background: rgba(255,120,120,0.12); border-color: rgba(255,140,140,0.35); color: #ffb7b7; }
        .ph-small-icon {
          width: 28px; height: 28px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.075);
          background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018));
          color: #a8b0bd; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .ph-bpm-box {
          height: 46px; min-width: 166px; border-radius: 11px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(2,6,10,0.42);
          display: grid; grid-template-columns: 28px 1fr 28px;
          align-items: center; padding: 0 8px;
          box-shadow: inset 0 1px 10px rgba(0,0,0,0.45);
        }
        .ph-bpm-value { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .ph-bpm-label { font-size: 10px; color: #7f8795; letter-spacing: 0.28em; text-transform: uppercase; }
        .ph-bpm-number { font-size: 20px; color: #eef2f7; font-variant-numeric: tabular-nums; letter-spacing: 0.08em; }
        .ph-tap { height: 30px; padding: 0 12px; border-radius: 11px; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.045); color: #e7ebf2; letter-spacing: 0.18em; font-size: 12px; cursor: pointer; }
        .ph-top-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 220px; }
        .ph-sync { display: flex; align-items: center; gap: 9px; color: #8a92a0; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; }
        .ph-sync-dot { width: 11px; height: 11px; border-radius: 999px; background: #9b6cff; box-shadow: 0 0 16px rgba(155,108,255,0.7); }
        .ph-export { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.085); background: rgba(255,255,255,0.045); color: #e1e6ef; font-size: 11px; letter-spacing: 0.18em; cursor: pointer; }

        /* ── Layout ── */
        .ph-layout { display: grid; grid-template-columns: minmax(760px,1fr) 390px; gap: 10px; margin-top: 12px; align-items: start; }
        .ph-card { background: linear-gradient(180deg, rgba(18,29,39,0.88), rgba(9,16,23,0.9)); border: 1px solid rgba(255,255,255,0.085); border-radius: 9px; box-shadow: 0 28px 80px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.06); overflow: hidden; }
        .ph-card-head { height: 48px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .ph-title-wrap { display: flex; align-items: baseline; gap: 10px; }
        .ph-card-title { margin: 0; font-size: 14px; letter-spacing: 0.18em; text-transform: uppercase; color: #f1f4f8; font-weight: 600; font-family: 'Inter', system-ui, sans-serif; }
        .ph-card-subtitle { margin: 0; font-size: 10px; letter-spacing: 0.16em; color: #8d96a5; text-transform: uppercase; }
        .ph-card-actions { display: flex; align-items: center; gap: 10px; }
        .ph-outline-btn { height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.025); color: #d8dde6; font-size: 11px; letter-spacing: 0.14em; cursor: pointer; text-transform: uppercase; }

        /* ── Probability legend ── */
        .ph-prob-legend {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 22px 4px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 9px; letter-spacing: 0.18em; color: #5a6272; text-transform: uppercase;
        }
        .ph-prob-legend-item { display: flex; align-items: center; gap: 5px; }
        .ph-prob-swatch {
          width: 12px; height: 12px; border-radius: 3px;
          border: 1px solid rgba(255,255,255,0.15);
        }

        /* ── Step numbers ── */
        .ph-step-numbers { display: grid; grid-template-columns: 132px 1fr; gap: 6px; padding: 8px 12px 4px 12px; }
        .ph-step-number-grid { display: grid; grid-template-columns: repeat(16, minmax(0,1fr)); gap: 5px; }
        .ph-num { height: 20px; display: flex; align-items: center; justify-content: center; color: #9aa3b1; font-size: 11px; font-variant-numeric: tabular-nums; }
        .ph-num.active-num { color: #eaddff; text-shadow: 0 0 12px rgba(155,108,255,0.72); }

        /* ── Track rows ── */
        .ph-rows { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 0 12px 12px; }
        .ph-playhead-line {
          position: absolute; top: -6px; bottom: 18px; width: 2px;
          background: linear-gradient(180deg, rgba(155,108,255,0.35), rgba(155,108,255,0.95), rgba(155,108,255,0.2));
          box-shadow: 0 0 18px rgba(155,108,255,0.65); border-radius: 999px;
          pointer-events: none; z-index: 3; transition: left 70ms linear;
        }
        .ph-track-row { display: grid; grid-template-columns: 132px 1fr; gap: 6px; align-items: center; min-height: 58px; }
        .ph-lane-label { display: grid; grid-template-columns: 14px 1fr 28px 30px; align-items: center; gap: 6px; }
        .ph-index { color: var(--track-color); font-size: 11px; text-align: center; opacity: 0.95; text-shadow: 0 0 10px var(--track-glow); }
        .ph-name-block { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .ph-name-line { display: flex; align-items: center; gap: 10px; }
        .ph-dot { width: 11px; height: 11px; border-radius: 999px; background: var(--track-color); box-shadow: 0 0 18px var(--track-glow); }
        .ph-track-name { color: #f3f5f8; font-size: 12px; letter-spacing: 0.12em; font-weight: 600; font-family: 'Inter', system-ui, sans-serif; }
        .ph-sample-mini { height: 23px; max-width: 96px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.15); color: #aeb7c5; border-radius: 5px; padding: 0 8px; font-size: 9px; letter-spacing: 0.14em; cursor: pointer; text-transform: uppercase; }
        .ph-solo-mini { width: 28px; height: 28px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.04); color: #c8ced8; cursor: pointer; }
        .ph-solo-mini.on { background: rgba(155,108,255,0.22); border-color: rgba(155,108,255,0.68); color: #fff; box-shadow: 0 0 14px rgba(155,108,255,0.28); }
        .ph-random-mini {
          width: 26px; height: 28px; border-radius: 7px; border: 1px solid rgba(155,108,255,0.28);
          background: rgba(155,108,255,0.08); color: #d9d0ff; cursor: pointer;
          font-size: 11px; font-family: 'DM Mono', monospace; font-weight: 500; text-transform: uppercase;
          transition: 140ms ease;
        }
        .ph-random-mini:hover { background: rgba(155,108,255,0.18); border-color: rgba(155,108,255,0.58); color: #fff; box-shadow: 0 0 14px rgba(155,108,255,0.22); }
        .ph-random-mini:active { transform: translateY(1px); }

        .ph-drum-section { border-top: 1px solid rgba(255,255,255,0.055); padding-top: 10px; margin-top: 10px; }
        .ph-drum-section:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
        .ph-drum-section-title { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #aeb7c5; margin-bottom: 8px; }

        /* ── Step buttons ── */
        .ph-grid { display: grid; grid-template-columns: repeat(16, minmax(0,1fr)); gap: 5px; }
        .ph-step {
          height: 32px; border-radius: 5px; position: relative;
          border: 1px solid rgba(255,255,255,0.095);
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.25);
          cursor: pointer; transition: 100ms ease; padding: 0; overflow: visible;
        }
        .ph-step:hover { border-color: rgba(255,255,255,0.22); transform: translateY(-1px); }
        .ph-step.downbeat { background: linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.018)); }
        .ph-step.round { border-radius: 999px; }
        .ph-step.active {
          background: var(--step-bg);
          border-color: var(--step-border);
          box-shadow: 0 0 22px var(--track-glow), inset 0 1px 0 rgba(255,255,255,0.42), 0 7px 16px rgba(0,0,0,0.3);
        }
        .ph-step.playhead:not(.active) { border-color: rgba(155,108,255,0.55); box-shadow: inset 0 0 0 1px rgba(155,108,255,0.25), 0 0 12px rgba(155,108,255,0.22); }

        /* Probability tint — reduces opacity and adds dots at bottom */
        .ph-step.prob75 { opacity: 0.82; }
        .ph-step.prob50 { opacity: 0.60; }
        .ph-step.prob25 { opacity: 0.38; }

        /* Probability dot row — bottom of step */
        .ph-prob-dots {
          position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 2px; pointer-events: none; z-index: 2;
        }
        .ph-prob-dot {
          width: 3px; height: 3px; border-radius: 50%;
          background: rgba(255,255,255,0.85);
          box-shadow: 0 0 3px rgba(255,255,255,0.5);
        }
        /* On active steps, dots show in track colour */
        .ph-step.active .ph-prob-dot {
          background: rgba(255,255,255,0.95);
        }

        /* Ratchet badge — top-right corner */
        .ph-ratch-badge {
          position: absolute; top: 3px; right: 3px;
          font-size: 7px; line-height: 1;
          color: rgba(255,255,255,0.72);
          font-family: 'DM Mono', monospace;
          letter-spacing: 0;
          pointer-events: none; z-index: 2;
          background: rgba(0,0,0,0.35);
          border-radius: 2px; padding: 1px 2px;
        }
        .ph-step.active .ph-ratch-badge {
          color: rgba(255,255,255,0.90);
          background: rgba(0,0,0,0.28);
        }
        /* Round steps: tuck badge inside */
        .ph-step.round .ph-ratch-badge { top: 6px; right: 6px; }

        /* Velocity bar — Alt+click cycles 100 → 70 → 40 */
        .ph-velocity-bar {
          position: absolute; left: 5px; right: 5px; bottom: -7px; height: 3px;
          border-radius: 999px; background: rgba(255,255,255,0.14); overflow: hidden;
          pointer-events: none; z-index: 2;
        }
        .ph-velocity-fill {
          display: block; height: 100%; border-radius: 999px;
          background: rgba(255,255,255,0.82);
          box-shadow: 0 0 7px var(--track-glow);
        }
        .ph-step:not(.active) .ph-velocity-bar { opacity: 0.28; }
        .ph-step.round .ph-velocity-bar { left: 9px; right: 9px; bottom: -7px; }
        .ph-note-badge {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-family: 'Inter', system-ui, sans-serif; font-weight: 700;
          letter-spacing: 0.02em; color: rgba(255,255,255,0.92); text-shadow: 0 1px 8px rgba(0,0,0,0.45);
          pointer-events: none; z-index: 1;
        }
        .ph-gate-badge {
          position: absolute; left: 4px; top: 4px; font-size: 7px; line-height: 1;
          color: rgba(255,255,255,0.72); background: rgba(0,0,0,0.32);
          border-radius: 2px; padding: 1px 2px; pointer-events: none; z-index: 2;
        }
        .ph-chord-badge {
          position: absolute; right: 4px; top: 4px; font-size: 7px; line-height: 1;
          color: rgba(15,12,8,0.92); background: rgba(255,238,140,0.90);
          border-radius: 2px; padding: 1px 3px; pointer-events: none; z-index: 2;
          font-family: 'DM Mono', monospace; font-weight: 800;
        }
        .ph-note-chord { font-size: 8px; color: #efe36b; letter-spacing: 0.05em; font-weight: 800; }
        .ph-length-controls {
          display: grid; grid-template-columns: auto 1fr; gap: 6px; align-items: center; max-width: 124px;
        }
        .ph-length-stepper {
          height: 24px; display: grid; grid-template-columns: 24px 1fr 24px; align-items: center;
          border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; overflow: hidden;
          background: rgba(155,108,255,0.10);
        }
        .ph-length-btn {
          height: 24px; border: 0; background: rgba(255,255,255,0.035); color: #d9d0ff;
          cursor: pointer; font-size: 13px; line-height: 1; font-family: 'DM Mono', monospace;
        }
        .ph-length-btn:hover { background: rgba(155,108,255,0.18); color: #fff; }
        .ph-length-value {
          min-width: 34px; text-align: center; color: #f0ecff; font-size: 9px; letter-spacing: 0.08em;
          font-family: 'DM Mono', monospace; font-variant-numeric: tabular-nums;
        }
        .ph-length-presets {
          grid-column: 1 / -1; display: flex; gap: 3px; flex-wrap: wrap;
        }
        .ph-length-preset {
          height: 17px; min-width: 18px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.025); color: #7f8795; font-size: 7px;
          font-family: 'DM Mono', monospace; cursor: pointer; padding: 0 4px;
        }
        .ph-length-preset:hover, .ph-length-preset.active {
          border-color: rgba(155,108,255,0.56); background: rgba(155,108,255,0.20); color: #f0ecff;
        }
        .ph-euclidean-mini {
          grid-column: 1 / -1; display: grid; grid-template-columns: 34px 18px 34px 18px 34px; gap: 3px;
          align-items: center; margin-top: 4px; opacity: 0.70;
        }
        .ph-euclidean-mini.on { opacity: 1; }
        .ph-euc-toggle, .ph-euc-btn, .ph-euc-value, .ph-euc-rot {
          height: 18px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.025); color: #7f8795; font-size: 7px;
          font-family: 'DM Mono', monospace; cursor: pointer; padding: 0 3px;
        }
        .ph-euclidean-mini.on .ph-euc-toggle, .ph-euc-value:hover, .ph-euc-rot:hover, .ph-euc-btn:hover {
          border-color: rgba(85,230,210,0.58); background: rgba(85,230,210,0.16); color: #d8fffa;
        }


        /* ── Right sidebar ── */
        .ph-right { display: flex; flex-direction: column; gap: 8px; }
        .ph-side-card { padding: 14px; }
        .ph-side-title { margin: 0 0 12px; font-size: 12px; color: #f5f7fb; letter-spacing: 0.2em; text-transform: uppercase; font-family: 'Inter', system-ui, sans-serif; font-weight: 600; }
        .ph-master-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 24px; }
        .ph-master-title-row .ph-side-title { margin: 0; }
        .ph-filter-reset {
          height: 30px; border-radius: 7px; border: 1px solid rgba(155,108,255,0.32);
          background: rgba(155,108,255,0.10); color: #ded6ff; cursor: pointer;
          font-size: 9px; letter-spacing: 0.10em; text-transform: uppercase; padding: 0 10px;
          font-family: 'DM Mono', monospace;
        }
        .ph-filter-reset:hover { background: rgba(155,108,255,0.18); border-color: rgba(155,108,255,0.52); color: #fff; }
        .ph-knob-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
        .ph-synth-mod-card { padding-bottom: 12px; }
        .ph-synth-mod-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .ph-synth-mod-head .ph-side-title { margin: 0; }
        .ph-synth-mod-actions { display: flex; align-items: center; gap: 7px; }
        .ph-synth-mod-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ph-mod-group {
          border: 1px solid rgba(255,255,255,0.075);
          background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.014));
          border-radius: 10px;
          padding: 10px 8px 9px;
          min-width: 0;
        }
        .ph-mod-title {
          display: block;
          margin-bottom: 8px;
          color: rgba(238,242,247,0.62);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .ph-mod-knobs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-items: start; }
        .ph-synth-engine { margin-top: 10px; }
        .ph-engine-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .ph-engine-control { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .ph-engine-label { color: rgba(238,242,247,0.55); font-size: 8px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; font-family: 'Inter', system-ui, sans-serif; }
        .ph-engine-select {
          width: 100%; height: 30px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.10);
          background: rgba(2,6,10,0.42); color: #eef2f7; padding: 0 8px;
          font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.06em; outline: none;
        }
        .ph-engine-stepper { height: 30px; display: grid; grid-template-columns: 30px 1fr 30px; border: 1px solid rgba(255,255,255,0.10); border-radius: 8px; overflow: hidden; background: rgba(2,6,10,0.42); }
        .ph-engine-stepper button { border: 0; background: rgba(255,255,255,0.035); color: #d9d0ff; cursor: pointer; font-family: 'DM Mono', monospace; }
        .ph-engine-stepper button:hover { background: rgba(155,108,255,0.18); color: #fff; }
        .ph-engine-value { display: flex; align-items: center; justify-content: center; color: #eef2f7; font-size: 10px; font-variant-numeric: tabular-nums; }
        .ph-master-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 12px; }
        .ph-master-note { margin-top: 16px; color: #7f8795; font-size: 10px; line-height: 1.55; letter-spacing: 0.08em; }
        .ph-master-value { color: #eef2f7; }
        .ph-xy-card { min-height: 278px; }
        .ph-xy-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
        .ph-xy-head .ph-side-title { margin: 0; }
        .ph-xy-actions { display: flex; align-items: center; gap: 6px; }
        .ph-xy-toggle {
          height: 28px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.035); color: #cfd6e2; cursor: pointer;
          font-size: 9px; letter-spacing: 0.10em; text-transform: uppercase; padding: 0 9px;
          font-family: 'DM Mono', monospace;
        }
        .ph-xy-toggle.on { border-color: rgba(155,108,255,0.62); background: rgba(155,108,255,0.18); color: #fff; box-shadow: 0 0 16px rgba(155,108,255,0.20); }
        .ph-xy-pad {
          position: relative; height: 178px; border-radius: 14px; overflow: hidden; touch-action: none; cursor: crosshair;
          border: 1px solid rgba(255,255,255,0.115);
          background:
            radial-gradient(circle at calc(var(--pad-x, 50) * 1%) calc((100 - var(--pad-y, 50)) * 1%), rgba(155,108,255,0.30), transparent 28%),
            linear-gradient(90deg, rgba(50,60,78,0.18), rgba(155,108,255,0.18)),
            linear-gradient(0deg, rgba(2,6,10,0.76), rgba(16,24,34,0.84));
          box-shadow: inset 0 1px 22px rgba(0,0,0,0.55), 0 12px 28px rgba(0,0,0,0.22);
          user-select: none;
        }
        .ph-xy-pad::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px);
          background-size: 25% 25%; opacity: 0.42;
        }
        .ph-xy-pad::after {
          content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; transform: translateX(-50%);
          background: rgba(255,255,255,0.08); box-shadow: 0 89px 0 rgba(255,255,255,0.08);
        }
        .ph-xy-dot {
          position: absolute; left: calc(var(--pad-x, 50) * 1%); top: calc((100 - var(--pad-y, 50)) * 1%);
          width: 24px; height: 24px; border-radius: 999px; transform: translate(-50%, -50%);
          background: radial-gradient(circle at 35% 30%, #ffffff, #d9d0ff 42%, #8c62ff 100%);
          border: 1px solid rgba(255,255,255,0.75); box-shadow: 0 0 24px rgba(155,108,255,0.72), 0 8px 18px rgba(0,0,0,0.36);
          pointer-events: none; z-index: 2;
        }
        .ph-xy-labels { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; color: #7f8795; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; }
        .ph-xy-readout { margin-top: 8px; color: #cfd6e2; font-size: 10px; letter-spacing: 0.09em; line-height: 1.5; }
        .ph-tone-card { border: 1px solid rgba(255,255,255,0.07); background: rgba(0,0,0,0.12); border-radius: 10px; padding: 14px; margin-bottom: 12px; }
        .ph-tone-card:last-child { margin-bottom: 0; }
        .ph-tone-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; }
        .ph-tone-title { display: flex; align-items: center; gap: 10px; color: #eef2f7; font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; font-family: 'Inter', system-ui, sans-serif; }
        .ph-tone-reset { height: 28px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.035); color: #cfd6e2; cursor: pointer; font-size: 9px; letter-spacing: 0.10em; text-transform: uppercase; padding: 0 9px; }
        .ph-tone-reset:hover { border-color: rgba(155,108,255,0.45); background: rgba(155,108,255,0.12); color: #fff; }
        .ph-tone-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }

        /* ── Bottom panels ── */
        .ph-bottom { display: grid; grid-template-columns: minmax(760px,1fr) 390px; gap: 10px; margin-top: 6px; align-items: start; }
        .ph-performance { padding: 14px 16px; }
        .ph-performance-title, .ph-macro-title { margin: 0 0 12px; font-size: 13px; color: #f4f7fb; letter-spacing: 0.22em; text-transform: uppercase; font-family: 'Inter', system-ui, sans-serif; font-weight: 600; }
        .ph-bass-performance-card .ph-master-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .ph-bass-performance-card { border-color: rgba(255,120,139,0.20); box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 55px rgba(255,80,110,0.05); }
        .ph-action-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
        .ph-action { height: 32px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.085); background: rgba(255,255,255,0.025); color: #ccd3de; display: inline-flex; align-items: center; justify-content: center; gap: 10px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: 140ms ease; }
        .ph-action.primary { background: linear-gradient(90deg,#7854dc,#9b6cff); border-color: rgba(198,174,255,0.6); color: white; box-shadow: 0 0 28px rgba(155,108,255,0.42), inset 0 1px 0 rgba(255,255,255,0.25); }
        .ph-action:hover { border-color: rgba(255,255,255,0.18); background-color: rgba(255,255,255,0.055); }
        .ph-macro-card { padding: 14px; margin-top: 12px; }
        .ph-macro-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; padding: 2px 12px 0; }

        /* ── Mixer ── */
        .ph-mixer-head { display: grid; grid-template-columns: 95px 1fr 52px 42px 42px; gap: 10px; align-items: center; color: #99a2b0; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; }
        .ph-mixer-row { display: grid; grid-template-columns: 95px 1fr 52px 42px 42px; gap: 10px; align-items: center; min-height: 34px; }
        .ph-mix-name { display: flex; align-items: center; gap: 10px; color: #eef2f7; font-size: 12px; font-weight: 600; font-family: 'Inter', system-ui, sans-serif; }
        .ph-mix-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--track-color); box-shadow: 0 0 14px var(--track-glow); }
        .ph-db { color: #d5dae2; font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
        .ph-range { -webkit-appearance: none; appearance: none; width: 100%; height: 3px; border-radius: 999px; background: linear-gradient(90deg, #9b6cff 0%, #9b6cff 50%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.12) 100%); outline: none; cursor: pointer; }
        .ph-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #cdd3dd; border: 1px solid rgba(255,255,255,0.4); box-shadow: 0 0 8px rgba(255,255,255,0.18); cursor: ew-resize; }
        .ph-range::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: #cdd3dd; cursor: ew-resize; }
        .ph-pill { width: 34px; height: 34px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.105); background: rgba(255,255,255,0.035); color: #d7dce5; font-size: 11px; cursor: pointer; }
        .ph-pill.muted  { color: #ffc0c0; border-color: rgba(255,120,120,0.42); background: rgba(255,100,100,0.12); }
        .ph-pill.soloed { color: #fff; border-color: rgba(155,108,255,0.72); background: rgba(155,108,255,0.24); box-shadow: 0 0 13px rgba(155,108,255,0.26); }

        /* ── Bass / Synth note modulation panel ── */
        .ph-note-mod-card { padding: 14px; margin-top: 12px; }
        .ph-note-mod-wrap { display: grid; gap: 18px; }
        .ph-note-editor { border: 1px solid rgba(255,255,255,0.07); background: rgba(0,0,0,0.14); border-radius: 9px; padding: 14px; }
        .ph-note-editor-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
        .ph-note-editor-title { display: flex; align-items: center; gap: 9px; color: #f4f7fb; font-family: 'Inter', system-ui, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.16em; }
        .ph-note-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
        .ph-note-action { height: 28px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.035); color: #d7dce5; cursor: pointer; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; padding: 0 9px; }
        .ph-note-action:hover { border-color: rgba(155,108,255,0.45); color: #fff; background: rgba(155,108,255,0.12); }
        .ph-note-grid { display: grid; grid-template-columns: repeat(16, minmax(0, 1fr)); gap: 5px; }
        .ph-note-cell { min-height: 52px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.095); background: rgba(255,255,255,0.028); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; color: #eef2f7; }
        .ph-note-cell:hover { border-color: var(--track-color); box-shadow: 0 0 14px var(--track-glow); }
        .ph-note-cell.off { opacity: 0.38; }
        .ph-note-cell.outside { opacity: 0.18; pointer-events: none; }
        .ph-note-name { font-size: 12px; font-family: 'Inter', system-ui, sans-serif; font-weight: 800; letter-spacing: 0.02em; }
        .ph-note-gate { font-size: 8px; color: #9aa3b1; }
        .ph-note-number { font-size: 7px; color: #5f6876; }
        .ph-note-lane-controls { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 6px; }
        .ph-note-lane-btn { height: 28px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.026); color: #adb6c4; cursor: pointer; font-size: 9px; letter-spacing: 0.06em; }
        .ph-note-lane-btn:hover { color: #fff; border-color: rgba(155,108,255,0.45); background: rgba(155,108,255,0.12); }

        /* ── Samples panel ── */
        .ph-samples-list { display: flex; flex-direction: column; gap: 10px; }
        .ph-sample-row { display: grid; grid-template-columns: 62px 1fr 74px 34px; gap: 6px; align-items: center; }
        .ph-sample-name { min-height: 30px; display: flex; align-items: center; padding: 0 12px; border-radius: 6px; background: rgba(255,255,255,0.026); border: 1px solid rgba(255,255,255,0.075); color: #c7cdd7; font-size: 11px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .ph-change, .ph-remove { height: 30px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.035); color: #eef2f7; cursor: pointer; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
        .ph-remove { width: 34px; color: #b9c0cc; }
        .ph-drop { margin-top: 6px; height: 48px; border-radius: 7px; border: 1px dashed rgba(255,255,255,0.22); display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 4px; color: #b7bec9; font-size: 11px; letter-spacing: 0.08em; cursor: pointer; }

        /* ── Presets panel ── */
        .ph-preset-grid { display: grid; grid-template-columns: 1fr 112px; gap: 10px; align-items: center; }
        .ph-preset-input, .ph-preset-select {
          height: 32px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.22); color: #eef2f7; padding: 0 12px;
          font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.08em; outline: none;
        }
        .ph-preset-select { width: 100%; color: #c7cdd7; }
        .ph-preset-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; }
        .ph-preset-btn {
          height: 30px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.035); color: #eef2f7; cursor: pointer;
          font-size: 10px; letter-spacing: 0.10em; text-transform: uppercase;
        }
        .ph-preset-btn.save {
          background: linear-gradient(90deg,#7854dc,#9b6cff); border-color: rgba(198,174,255,0.58);
          box-shadow: 0 0 22px rgba(155,108,255,0.28); color: white;
        }
        .ph-preset-btn.delete { color: #ffc0c0; border-color: rgba(255,120,120,0.26); background: rgba(255,100,100,0.08); }
        .ph-preset-status { margin-top: 6px; color: #8e97a6; font-size: 10px; letter-spacing: 0.10em; min-height: 14px; }
        .ph-preset-note { margin-top: 8px; color: #596270; font-size: 9px; line-height: 1.5; letter-spacing: 0.08em; }

        /* ── Interaction hint ── */
        .ph-hint { font-size: 9px; letter-spacing: 0.16em; color: #4a5260; text-transform: uppercase; padding: 6px 22px 0; }

        .ph-footer { display: flex; justify-content: space-between; align-items: center; padding: 10px 6px 0; color: #7a8290; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; }


        /* ── Compact workstation layout override ── */
        .ph-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          margin-top: 16px;
          align-items: start;
        }
        .ph-stage-grid {
          display: grid;
          grid-template-columns: minmax(260px, 0.95fr) minmax(340px, 1.25fr) minmax(280px, 1fr);
          gap: 8px;
          align-items: stretch;
          margin-top: 0;
        }
        .ph-stage-grid .ph-card { min-height: 0; }
        .ph-right {
          display: grid;
          grid-template-columns: minmax(360px, 1.25fr) minmax(320px, 1fr) minmax(380px, 1.15fr);
          gap: 8px;
          align-items: start;
        }
        .ph-bottom {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          margin-top: 12px;
          align-items: start;
        }
        .ph-bottom > div {
          display: grid;
          grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr);
          gap: 8px;
        }
        .ph-card-head { height: 58px; }
        .ph-side-card,
        .ph-performance,
        .ph-macro-card,
        .ph-note-mod-card { padding: 14px 16px; }
        .ph-macro-card { margin-top: 0; }
        .ph-side-title,
        .ph-performance-title,
        .ph-macro-title {
          margin-bottom: 10px;
          font-size: 12px;
          letter-spacing: 0.18em;
        }
        .ph-note-mod-card { margin-top: 0; }
        .ph-note-mod-wrap {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .ph-note-editor {
          padding: 12px;
          border-radius: 8px;
        }
        .ph-note-editor-head {
          align-items: flex-start;
          margin-bottom: 10px;
        }
        .ph-note-actions { gap: 5px; }
        .ph-note-action {
          height: 26px;
          padding: 0 7px;
          font-size: 8px;
        }
        .ph-note-grid {
          grid-template-columns: repeat(16, minmax(0, 1fr));
          gap: 4px;
        }
        .ph-note-cell {
          min-height: 42px;
          border-radius: 6px;
          gap: 2px;
        }
        .ph-note-name { font-size: 11px; }
        .ph-note-gate { font-size: 7px; }
        .ph-note-lane-controls {
          margin-top: 8px;
          gap: 4px;
        }
        .ph-note-lane-btn {
          height: 24px;
          font-size: 8px;
        }
        .ph-tone-card {
          padding: 10px;
          margin-bottom: 8px;
          border-radius: 8px;
        }
        .ph-tone-head {
          margin-bottom: 6px;
        }
        .ph-tone-title {
          font-size: 11px;
          letter-spacing: 0.12em;
        }
        .ph-tone-reset,
        .ph-filter-reset {
          height: 26px;
          font-size: 8px;
          padding: 0 8px;
        }
        .ph-tone-grid,
        .ph-knob-grid,
        .ph-master-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }
        .ph-master-title-row { margin-bottom: 10px; }
        .ph-master-note {
          margin-top: 8px;
          font-size: 8px;
          line-height: 1.35;
        }
        .ph-action-row {
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }
        .ph-action {
          height: 30px;
          font-size: 10px;
        }
        .ph-samples-list { gap: 6px; }
        .ph-sample-row {
          grid-template-columns: 56px 1fr 66px 30px;
          gap: 6px;
        }
        .ph-sample-name,
        .ph-change,
        .ph-remove {
          min-height: 0;
          height: 32px;
        }
        .ph-drop {
          height: 48px;
          margin-top: 6px;
          font-size: 9px;
        }
        .ph-macro-grid {
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          padding: 0;
        }
        .ph-preset-grid {
          grid-template-columns: 1fr 92px;
          gap: 6px;
        }
        .ph-preset-input,
        .ph-preset-select {
          height: 30px;
        }
        .ph-preset-btn {
          height: 34px;
        }
        .ph-preset-note {
          font-size: 8px;
          line-height: 1.35;
        }
        .ph-mixer-row {
          min-height: 30px;
        }
        .ph-mixer-head,
        .ph-mixer-row {
          grid-template-columns: 80px 1fr 48px 34px 34px;
          gap: 6px;
        }
        .ph-pill {
          width: 30px;
          height: 30px;
        }
        @media (max-width: 1200px) {
          .ph-stage-grid,
          .ph-right,
          .ph-bottom > div,
          .ph-note-mod-wrap {
            grid-template-columns: 1fr;
          }
          .ph-page { padding: 0 12px 18px; }
        }



        /* ─────────────────────────────────────────────────────────────
           PHASE HARDWARE COMPACT LAYOUT OVERRIDE
           Full-width sequencer + stacked modulation + compact modules
        ───────────────────────────────────────────────────────────── */
        .ph-page {
          max-width: 1680px;
          padding: 0 14px 16px;
        }
        .ph-topbar {
          height: 66px;
          grid-template-columns: 220px minmax(520px, 1fr) 310px;
          gap: 8px;
          padding: 0 14px;
          border-radius: 0 0 10px 10px;
        }
        .ph-logo { font-size: 24px; letter-spacing: 0.14em; }
        .ph-brand-sub { font-size: 8px; letter-spacing: 0.28em; }
        .ph-transport-top { gap: 6px; }
        .ph-round-btn { width: 42px; height: 42px; }
        .ph-small-icon { width: 28px; height: 28px; border-radius: 8px; }
        .ph-bpm-box {
          height: 44px;
          min-width: 154px;
          grid-template-columns: 28px 1fr 28px;
          border-radius: 9px;
        }
        .ph-bpm-number { font-size: 19px; }
        .ph-bpm-label { font-size: 8px; }
        .ph-tap { height: 30px; padding: 0 12px; font-size: 10px; border-radius: 8px; }
        .ph-top-actions { min-width: 0; gap: 6px; }
        .ph-sync { font-size: 9px; letter-spacing: 0.16em; }
        .ph-export { height: 34px; padding: 0 10px; font-size: 9px; border-radius: 8px; }

        .ph-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-top: 6px;
          align-items: start;
        }
        .ph-card {
          border-radius: 10px;
          box-shadow: 0 18px 48px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.055);
        }
        .ph-card-head {
          height: 46px;
          padding: 0 14px;
        }
        .ph-card-title, .ph-side-title, .ph-performance-title, .ph-macro-title {
          font-size: 11px;
          letter-spacing: 0.18em;
        }
        .ph-card-subtitle { font-size: 8px; }
        .ph-outline-btn { height: 30px; padding: 0 10px; font-size: 9px; border-radius: 7px; }
        .ph-hint { padding: 6px 14px 0; font-size: 8px; color: #697282; }

        /* Sequencer full width and shorter */
        .ph-step-numbers {
          grid-template-columns: 128px 1fr;
          gap: 10px;
          padding: 8px 12px 3px;
        }
        .ph-step-number-grid { gap: 5px; }
        .ph-num { height: 14px; font-size: 9px; }
        .ph-rows { gap: 6px; padding: 0 12px 12px; }
        .ph-track-row {
          grid-template-columns: 128px 1fr;
          gap: 10px;
          min-height: 48px;
        }
        .ph-lane-label {
          grid-template-columns: 14px minmax(0,1fr) 24px 26px;
          gap: 6px;
        }
        .ph-track-name { font-size: 12px; letter-spacing: 0.10em; }
        .ph-name-block { gap: 3px; }
        .ph-name-line { gap: 5px; }
        .ph-dot { width: 8px; height: 8px; }
        .ph-sample-mini { height: 18px; max-width: 70px; font-size: 7px; padding: 0 5px; }
        .ph-random-mini, .ph-solo-mini { width: 24px; height: 26px; font-size: 9px; border-radius: 6px; }
        .ph-length-controls { max-width: 108px; gap: 4px; }
        .ph-length-stepper { height: 20px; grid-template-columns: 20px 1fr 20px; }
        .ph-length-btn { height: 20px; font-size: 11px; }
        .ph-length-value { font-size: 8px; min-width: 28px; }
        .ph-length-presets { gap: 2px; }
        .ph-length-preset { height: 14px; min-width: 16px; font-size: 6px; padding: 0 3px; }
        .ph-euclidean-mini { grid-template-columns: 30px 16px 30px 16px 30px; gap: 2px; }
        .ph-euc-toggle, .ph-euc-btn, .ph-euc-value, .ph-euc-rot { height: 16px; font-size: 6px; padding: 0 2px; }
        .ph-grid { gap: 5px; }
        .ph-step { height: 30px; border-radius: 5px; }
        .ph-step.round { border-radius: 999px; }
        .ph-note-badge { font-size: 8px; }
        .ph-gate-badge, .ph-ratch-badge, .ph-chord-badge { font-size: 6px; }
        .ph-velocity-bar { bottom: -5px; height: 2px; }
        .ph-playhead-line { bottom: 12px; }

        /* Bass / Synth modulation as a compact 2-column row directly below sequencer */
        .ph-note-mod-card {
          padding: 12px;
        }
        .ph-note-mod-card .ph-macro-title {
          margin: 0 0 10px;
        }
        .ph-note-mod-wrap {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .ph-note-editor {
          padding: 10px;
          border-radius: 9px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
        }
        .ph-note-editor-head {
          margin-bottom: 8px;
          gap: 6px;
        }
        .ph-note-editor-title { font-size: 11px; }
        .ph-note-actions { gap: 5px; flex-wrap: wrap; }
        .ph-note-action {
          height: 24px;
          padding: 0 8px;
          font-size: 8px;
          border-radius: 6px;
        }
        .ph-note-grid {
          gap: 5px;
        }
        .ph-note-cell {
          min-height: 30px;
          padding: 5px 4px;
          border-radius: 7px;
        }
        .ph-note-number { font-size: 7px; }
        .ph-note-name { font-size: 11px; }
        .ph-note-gate { font-size: 7px; }
        .ph-note-lane-controls { gap: 5px; margin-top: 8px; }
        .ph-note-lane-btn { height: 24px; min-width: 40px; font-size: 9px; border-radius: 6px; }

        /* Three compact hardware rows: Performance / Master FX / Samples */
        .ph-stage-grid {
          display: grid;
          grid-template-columns: 1.05fr 1.2fr 1.05fr 1fr;
          gap: 10px;
          align-items: stretch;
        }
        .ph-performance, .ph-side-card, .ph-macro-card {
          padding: 12px;
        }
        .ph-performance-title, .ph-side-title, .ph-macro-title {
          margin: 0 0 10px;
        }
        .ph-action-row {
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
        }
        .ph-action {
          height: 34px;
          font-size: 9px;
          border-radius: 7px;
          gap: 6px;
        }
        .ph-master-title-row { margin-bottom: 10px; }
        .ph-filter-reset { height: 26px; padding: 0 8px; font-size: 8px; }
        .ph-master-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }
        .ph-master-note {
          margin-top: 8px;
          font-size: 8px;
          line-height: 1.35;
        }
        .ph-samples-list { gap: 6px; }
        .ph-sample-row {
          grid-template-columns: 54px 1fr 54px 28px;
          gap: 6px;
        }
        .ph-sample-name { min-height: 28px; font-size: 9px; padding: 0 8px; }
        .ph-change, .ph-remove { height: 28px; font-size: 8px; border-radius: 6px; }
        .ph-remove { width: 28px; }
        .ph-drop { display: none; }

        /* Right side becomes a horizontal module strip, not a sidebar */
        .ph-right {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr 1.3fr;
          gap: 10px;
        }
        .ph-tone-card {
          margin-bottom: 8px;
          padding: 8px;
          border-radius: 8px;
          background: rgba(255,255,255,0.022);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .ph-tone-head { margin-bottom: 6px; }
        .ph-tone-title { font-size: 10px; }
        .ph-tone-reset { height: 22px; font-size: 7px; padding: 0 7px; }
        .ph-tone-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }
        .ph-knob-grid {
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap: 6px;
        }
        .ph-mixer-head, .ph-mixer-row {
          grid-template-columns: 70px 1fr 45px 30px 30px;
          gap: 6px;
        }
        .ph-mixer-head { font-size: 8px; margin-bottom: 6px; }
        .ph-mixer-row { min-height: 32px; }
        .ph-mix-name { font-size: 10px; gap: 6px; }
        .ph-mix-dot { width: 7px; height: 7px; }
        .ph-db { font-size: 9px; }
        .ph-pill { width: 28px; height: 28px; font-size: 9px; border-radius: 6px; }

        /* Bottom as compact preset/macro strip */
        .ph-bottom {
          display: block;
          margin-top: 6px;
        }
        .ph-bottom > div {
          display: grid;
          grid-template-columns: 1.3fr 0.9fr;
          gap: 10px;
        }
        .ph-preset-grid {
          grid-template-columns: 1fr 84px;
          gap: 6px;
        }
        .ph-preset-input, .ph-preset-select {
          height: 30px;
          font-size: 9px;
          border-radius: 6px;
        }
        .ph-preset-actions {
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin-top: 8px;
        }
        .ph-preset-btn {
          height: 30px;
          font-size: 8px;
          border-radius: 6px;
        }
        .ph-preset-status { margin-top: 6px; font-size: 8px; }
        .ph-preset-note { display: none; }
        .ph-macro-grid {
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap: 6px;
          padding: 0;
        }
        .ph-footer {
          padding: 10px 2px 0;
          font-size: 9px;
        }

        @media (max-width: 1250px) {
          .ph-topbar { grid-template-columns: 1fr; height: auto; padding: 12px; }
          .ph-stage-grid,
          .ph-right,
          .ph-bottom > div,
          .ph-note-mod-wrap { grid-template-columns: 1fr; }
          .ph-track-row, .ph-step-numbers { grid-template-columns: 118px 1fr; }
          .ph-master-grid, .ph-tone-grid, .ph-knob-grid, .ph-macro-grid { grid-template-columns: repeat(2, 1fr); }
        }


        /* ─────────────────────────────────────────────────────────────
           PHASE DENSITY PASS v2
           Compact spacing while preserving responsive anti-overflow rules
        ───────────────────────────────────────────────────────────── */
        .ph-page {
          max-width: 1680px;
          padding: 0 10px 10px;
        }
        .ph-layout {
          gap: 6px;
          margin-top: 4px;
        }
        .ph-card {
          border-radius: 8px;
        }
        .ph-card-head {
          height: 40px;
          padding: 0 10px;
        }
        .ph-title-wrap {
          gap: 6px;
        }
        .ph-card-actions {
          gap: 6px;
        }
        .ph-card-title,
        .ph-side-title,
        .ph-performance-title,
        .ph-macro-title {
          font-size: 10px;
          letter-spacing: 0.14em;
        }
        .ph-card-subtitle,
        .ph-hint {
          font-size: 7px;
        }
        .ph-hint {
          padding: 4px 10px 0;
        }
        .ph-outline-btn {
          height: 26px;
          padding: 0 8px;
          font-size: 8px;
        }

        /* top transport: less height, same hit targets */
        .ph-topbar {
          height: 58px;
          padding: 0 10px;
          gap: 8px;
        }
        .ph-logo { font-size: 21px; }
        .ph-brand { min-width: 190px; }
        .ph-round-btn { width: 38px; height: 38px; }
        .ph-small-icon { width: 26px; height: 26px; }
        .ph-bpm-box {
          height: 38px;
          min-width: 138px;
          grid-template-columns: 24px 1fr 24px;
        }
        .ph-bpm-number { font-size: 17px; }
        .ph-tap { height: 28px; padding: 0 10px; }
        .ph-export { height: 30px; padding: 0 8px; }

        /* sequencer: tighter rows but still tappable */
        .ph-step-numbers {
          grid-template-columns: 112px 1fr;
          gap: 6px;
          padding: 5px 8px 2px;
        }
        .ph-rows {
          gap: 4px;
          padding: 0 8px 8px;
        }
        .ph-track-row {
          grid-template-columns: 112px 1fr;
          gap: 6px;
          min-height: 42px;
        }
        .ph-lane-label {
          grid-template-columns: 12px minmax(0,1fr) 22px 24px;
          gap: 4px;
        }
        .ph-track-name { font-size: 10px; }
        .ph-sample-mini { height: 16px; max-width: 60px; }
        .ph-random-mini,
        .ph-solo-mini {
          width: 22px;
          height: 24px;
        }
        .ph-length-controls { max-width: 94px; }
        .ph-length-stepper {
          height: 18px;
          grid-template-columns: 18px 1fr 18px;
        }
        .ph-length-btn { height: 18px; }
        .ph-length-preset { height: 13px; min-width: 14px; }
        .ph-euclidean-mini {
          grid-template-columns: 26px 14px 26px 14px 26px;
        }
        .ph-euc-toggle,
        .ph-euc-btn,
        .ph-euc-value,
        .ph-euc-rot { height: 15px; }
        .ph-grid,
        .ph-step-number-grid { gap: 4px; }
        .ph-step {
          height: 27px;
          min-height: 27px;
          border-radius: 5px;
        }
        .ph-playhead-line { bottom: 10px; }

        /* note modulation: closer but no clipping */
        .ph-note-mod-card {
          padding: 8px;
          margin-top: 6px;
        }
        .ph-note-mod-card .ph-macro-title {
          margin-bottom: 6px;
        }
        .ph-note-mod-wrap {
          gap: 6px;
        }
        .ph-note-editor {
          padding: 8px;
        }
        .ph-note-editor-head {
          margin-bottom: 6px;
        }
        .ph-note-editor-title { font-size: 10px; }
        .ph-note-action {
          height: 22px;
          padding: 0 6px;
          font-size: 7px;
        }
        .ph-note-grid { gap: 3px; }
        .ph-note-cell {
          min-height: 28px;
          padding: 3px 2px;
        }
        .ph-note-lane-controls {
          margin-top: 6px;
          gap: 4px;
        }
        .ph-note-lane-btn {
          height: 22px;
          min-width: 34px;
          font-size: 8px;
        }

        /* module rows: reduce card separation */
        .ph-stage-grid,
        .ph-right,
        .ph-bottom > div {
          gap: 6px;
        }
        .ph-performance,
        .ph-side-card,
        .ph-macro-card {
          padding: 8px;
        }
        .ph-performance-title,
        .ph-side-title,
        .ph-macro-title {
          margin-bottom: 6px;
        }
        .ph-action-row { gap: 4px; }
        .ph-action {
          height: 30px;
          font-size: 8px;
          gap: 4px;
        }
        .ph-master-title-row {
          margin-bottom: 6px;
        }
        .ph-master-grid,
        .ph-tone-grid,
        .ph-knob-grid,
        .ph-macro-grid {
          gap: 4px;
        }
        .ph-master-note,
        .ph-preset-status {
          margin-top: 5px;
        }
        .ph-tone-card {
          padding: 6px;
          margin-bottom: 6px;
        }
        .ph-tone-head {
          margin-bottom: 4px;
        }
        .ph-tone-title { font-size: 9px; }
        .ph-tone-reset,
        .ph-filter-reset {
          height: 22px;
          padding: 0 6px;
          font-size: 7px;
        }
        .ph-synth-mod-card { padding-bottom: 8px; }
        .ph-synth-mod-head { margin-bottom: 6px; }
        .ph-synth-mod-grid { gap: 6px; }
        .ph-mod-card { padding: 7px 6px; }
        .ph-mod-knobs { gap: 4px; }
        .ph-engine-grid { gap: 5px; }
        .ph-engine-control { gap: 4px; }
        .ph-engine-select,
        .ph-engine-button { height: 26px; }

        /* mixer and samples: denser lists */
        .ph-mixer-head,
        .ph-mixer-row {
          grid-template-columns: 62px 1fr 40px 28px 28px;
          gap: 4px;
        }
        .ph-mixer-head { margin-bottom: 4px; }
        .ph-mixer-row { min-height: 28px; }
        .ph-mix-name { font-size: 9px; gap: 4px; }
        .ph-pill { width: 26px; height: 26px; }
        .ph-samples-list { gap: 4px; }
        .ph-sample-row {
          grid-template-columns: 48px 1fr 48px 26px;
          gap: 4px;
        }
        .ph-sample-name,
        .ph-change,
        .ph-remove {
          height: 26px;
          min-height: 26px;
        }
        .ph-drop { height: 40px; }

        /* bottom: closer to the rest */
        .ph-bottom {
          margin-top: 4px;
        }
        .ph-preset-grid,
        .ph-preset-actions {
          gap: 4px;
        }
        .ph-preset-actions { margin-top: 6px; }
        .ph-preset-input,
        .ph-preset-select,
        .ph-preset-btn {
          height: 28px;
        }
        .ph-footer {
          padding-top: 6px;
        }

        /* keep compact mobile safe: stack modules, keep sequencer scrollable */
        @media (max-width: 1250px) {
          .ph-page { padding: 0 8px 10px; }
          .ph-topbar {
            height: auto;
            padding: 8px;
            gap: 8px;
          }
          .ph-stage-grid,
          .ph-right,
          .ph-bottom > div,
          .ph-note-mod-wrap {
            gap: 6px;
          }
          .ph-track-row,
          .ph-step-numbers {
            grid-template-columns: 104px 1fr;
          }
          .ph-step { height: 30px; min-height: 30px; }
          .ph-master-grid,
          .ph-tone-grid,
          .ph-knob-grid,
          .ph-macro-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .ph-page { padding: 0 6px 8px; }
          .ph-card-head { height: 38px; padding: 0 8px; }
          .ph-card-title { font-size: 9px; }
          .ph-layout { gap: 5px; }
          .ph-track-row,
          .ph-step-numbers {
            grid-template-columns: 96px 1fr;
            gap: 5px;
          }
          .ph-rows { padding: 0 6px 6px; }
          .ph-step-numbers { padding: 5px 6px 2px; }
          .ph-grid,
          .ph-step-number-grid,
          .ph-note-grid {
            gap: 3px;
          }
          .ph-step {
            height: 31px;
            min-height: 31px;
          }
          .ph-note-cell {
            min-height: 32px;
          }
          .ph-performance,
          .ph-side-card,
          .ph-macro-card,
          .ph-note-mod-card {
            padding: 7px;
          }
          .ph-master-grid,
          .ph-tone-grid,
          .ph-knob-grid,
          .ph-macro-grid {
            gap: 4px;
          }
          .ph-mixer-head,
          .ph-mixer-row {
            grid-template-columns: 58px 1fr 36px 28px 28px;
          }
        }


        .ph-sample-row.drag-over,
        .ph-drop.drag-over {
          border-color: rgba(155,108,255,0.62) !important;
          background: rgba(155,108,255,0.13) !important;
          box-shadow: inset 0 0 0 1px rgba(155,108,255,0.25), 0 0 18px rgba(155,108,255,0.18);
        }
        .ph-sample-row.drag-over .ph-sample-name {
          border-color: rgba(155,108,255,0.58);
          color: #f1ecff;
        }

        @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.38; } }
        .ph-pulse { animation: pulse-dot 1.8s ease-in-out infinite; }


        /* ── PHASE compact safety overrides ── */
        .ph-topbar { height: 68px !important; gap: 10px !important; }
        .ph-transport-top { gap: 8px !important; }
        .ph-card-head { height: 46px !important; }
        .ph-card-title { font-size: 12px !important; }
        .ph-card-subtitle { font-size: 8px !important; }
        .ph-layout, .ph-bottom { gap: 10px !important; }
        .ph-rows { gap: 7px !important; }
        .ph-track-row { min-height: 54px !important; }
        .ph-step { height: 30px !important; }
        .ph-step-numbers { padding-top: 7px !important; }
        .ph-num { height: 16px !important; font-size: 9px !important; }
        .ph-name-block { gap: 4px !important; }
        .ph-track-name { font-size: 12px !important; }
        .ph-sample-mini { height: 18px !important; font-size: 7px !important; }
        .ph-length-stepper { height: 20px !important; grid-template-columns: 20px 1fr 20px !important; }
        .ph-length-btn { height: 20px !important; }
        .ph-length-preset { height: 14px !important; min-width: 16px !important; font-size: 6px !important; }
        .ph-side-card, .ph-performance, .ph-macro-card { padding: 12px !important; }
        .ph-side-title, .ph-performance-title, .ph-macro-title { margin-bottom: 10px !important; font-size: 12px !important; }
        .ph-knob-grid { gap: 12px 14px !important; }
        .ph-master-grid { gap: 10px !important; }
        .ph-action { height: 34px !important; font-size: 10px !important; }
        .ph-mixer-row { min-height: 32px !important; }
        .ph-pill { width: 28px !important; height: 28px !important; }
        .ph-sample-row { grid-template-columns: 54px 1fr 64px 30px !important; gap: 6px !important; }
        .ph-sample-name, .ph-change, .ph-remove { height: 28px !important; min-height: 28px !important; }
        .ph-preset-input, .ph-preset-select { height: 30px !important; }
        .ph-preset-btn { height: 30px !important; }
        .ph-footer { padding-top: 8px !important; }
        @media (max-width: 1180px) {
          .ph-layout, .ph-bottom { grid-template-columns: 1fr !important; }
          .ph-topbar { grid-template-columns: 1fr !important; height: auto !important; padding: 10px !important; }
          .ph-brand, .ph-top-actions { min-width: 0 !important; justify-content: center !important; }
        }

        .ph-lock-badge {
          position: absolute;
          left: 4px;
          bottom: 4px;
          z-index: 4;
          border-radius: 999px;
          padding: 1px 4px;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .03em;
          color: #05040a;
          background: linear-gradient(180deg, #fff38a, #ff9f43);
          box-shadow: 0 0 10px rgba(255, 196, 77, .42);
          pointer-events: none;
        }


        /* ── Compact visual refactor v1 ── */
        .ph-page { max-width: 1560px; padding: 0 10px 10px; }
        .ph-topbar { height: 56px; padding: 0 10px; gap: 10px; border-radius: 0 0 10px 10px; }
        .ph-brand { min-width: 150px; gap: 6px; }
        .ph-logo { font-size: 19px; letter-spacing: 0.09em; }
        .ph-brand-sub { font-size: 8px; letter-spacing: 0.24em; }
        .ph-round-btn { width: 34px; height: 34px; }
        .ph-small-icon { width: 25px; height: 25px; border-radius: 8px; }
        .ph-bpm-box { height: 38px; min-width: 136px; border-radius: 9px; padding: 0 6px; }
        .ph-bpm-number { font-size: 16px; }
        .ph-bpm-label { font-size: 8px; }
        .ph-tap { height: 26px; padding: 0 9px; font-size: 10px; }
        .ph-sync, .ph-export { font-size: 9px; letter-spacing: 0.12em; }
        .ph-export { height: 28px; padding: 0 8px; }
        .ph-top-actions { min-width: 170px; gap: 4px; }

        .ph-layout { grid-template-columns: minmax(820px,1fr) 350px; gap: 8px; margin-top: 8px; }
        .ph-bottom { grid-template-columns: minmax(820px,1fr) 350px; gap: 8px; margin-top: 6px; }
        .ph-card { border-radius: 8px; box-shadow: 0 18px 48px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.05); }
        .ph-card-head { height: 38px; padding: 0 10px; }
        .ph-card-title { font-size: 12px; letter-spacing: 0.13em; }
        .ph-card-subtitle { font-size: 8px; letter-spacing: 0.10em; }
        .ph-card-actions { gap: 6px; }
        .ph-outline-btn { height: 25px; padding: 0 8px; border-radius: 6px; font-size: 9px; letter-spacing: 0.08em; }

        .ph-prob-legend { gap: 9px; padding: 6px 14px 2px; font-size: 8px; }
        .ph-prob-swatch { width: 9px; height: 9px; border-radius: 2px; }
        .ph-hint { padding: 6px 12px !important; font-size: 9px !important; }
        .ph-step-numbers { grid-template-columns: 116px 1fr; gap: 5px; padding: 5px 9px 2px 9px; }
        .ph-step-number-grid { gap: 4px; }
        .ph-num { height: 16px; font-size: 9px; }
        .ph-rows { gap: 4px; padding: 0 9px 9px; }
        .ph-track-row { grid-template-columns: 116px 1fr; gap: 5px; min-height: 45px; }
        .ph-lane-label { grid-template-columns: 12px 1fr 24px 25px; gap: 4px; }
        .ph-index { font-size: 9px; }
        .ph-name-block { gap: 3px; }
        .ph-name-line { gap: 6px; }
        .ph-dot { width: 8px; height: 8px; }
        .ph-track-name { font-size: 10px; letter-spacing: 0.08em; }
        .ph-sample-mini { height: 19px; max-width: 78px; padding: 0 5px; font-size: 7px; border-radius: 4px; }
        .ph-solo-mini, .ph-random-mini { width: 23px; height: 23px; border-radius: 5px; font-size: 9px; }
        .ph-length-controls { gap: 3px !important; }
        .ph-length-stepper { height: 18px !important; }
        .ph-length-btn, .ph-length-value { height: 18px !important; min-height: 18px !important; font-size: 8px !important; }
        .ph-length-presets { gap: 3px !important; }
        .ph-length-preset { height: 16px !important; min-width: 18px !important; font-size: 7px !important; padding: 0 3px !important; }
        .ph-euc-toggle, .ph-euc-btn, .ph-euc-value { height: 17px !important; min-width: 20px !important; font-size: 7px !important; padding: 0 3px !important; border-radius: 4px !important; }

        .ph-step-grid { gap: 4px !important; }
        .ph-step { min-height: 39px !important; border-radius: 6px !important; }
        .ph-step-main { width: 100% !important; height: 100% !important; }
        .ph-step-badge, .ph-prob-badge, .ph-ratch-badge, .ph-vel-badge, .ph-lock-badge { font-size: 7px !important; transform: scale(0.9); }

        .ph-side { gap: 8px !important; }
        .ph-side-card, .ph-performance, .ph-macro-card, .ph-note-mod-card { padding: 10px !important; margin-top: 8px !important; }
        .ph-performance-title, .ph-macro-title { margin-bottom: 8px; font-size: 11px; letter-spacing: 0.15em; }
        .ph-master-grid, .ph-mod-knobs, .ph-macro-grid, .ph-tone-grid { gap: 8px !important; }
        .ph-master-grid { grid-template-columns: repeat(4, minmax(0,1fr)) !important; }
        .ph-bass-performance-card .ph-master-grid { grid-template-columns: repeat(3, minmax(0,1fr)) !important; }
        .ph-action-row { gap: 5px; }
        .ph-action { height: 27px; border-radius: 6px; font-size: 9px; letter-spacing: 0.08em; gap: 5px; }
        .ph-master-note, .ph-preset-note, .ph-preset-status { font-size: 9px !important; line-height: 1.35 !important; }

        .ph-tone-card { padding: 10px; margin-bottom: 8px; border-radius: 8px; }
        .ph-tone-head { margin-bottom: 8px; }
        .ph-tone-title { font-size: 10px; gap: 6px; letter-spacing: 0.11em; }
        .ph-tone-reset { height: 23px; padding: 0 7px; font-size: 8px; }
        .ph-engine-grid { gap: 6px !important; }
        .ph-engine-control { gap: 4px !important; }
        .ph-engine-label { font-size: 8px !important; }
        .ph-engine-value, .ph-engine-select { min-height: 24px !important; height: 24px !important; font-size: 9px !important; }
        .ph-engine-stepper button { height: 24px !important; }

        .ph-mixer-head { grid-template-columns: 78px 1fr 42px 31px 31px; gap: 6px; margin-bottom: 6px; font-size: 8px; }
        .ph-mixer-row { grid-template-columns: 78px 1fr 42px 31px 31px; gap: 6px; min-height: 27px; }
        .ph-mix-name { gap: 6px; font-size: 10px; }
        .ph-mix-dot { width: 8px; height: 8px; }
        .ph-db { font-size: 9px; }
        .ph-pill { width: 27px; height: 27px; border-radius: 6px; font-size: 9px; }
        .ph-range::-webkit-slider-thumb { width: 11px; height: 11px; }
        .ph-range::-moz-range-thumb { width: 11px; height: 11px; }

        .ph-note-mod-wrap { gap: 10px; }
        .ph-note-editor { padding: 10px; border-radius: 8px; }
        .ph-note-editor-head { margin-bottom: 8px; }
        .ph-note-editor-title { font-size: 10px; letter-spacing: 0.10em; }
        .ph-note-action, .ph-note-lane-btn { height: 23px; font-size: 7px; padding: 0 6px; }
        .ph-note-grid { gap: 4px; }
        .ph-note-cell { min-height: 41px; border-radius: 6px; gap: 2px; }
        .ph-note-name { font-size: 10px; }
        .ph-note-gate { font-size: 7px; }
        .ph-note-number { font-size: 6px; }
        .ph-note-lane-controls { gap: 4px; }

        .ph-samples-list { gap: 6px; }
        .ph-sample-row { grid-template-columns: 52px 1fr 58px 28px; gap: 5px; }
        .ph-sample-name, .ph-change, .ph-remove { min-height: 24px; height: 24px; font-size: 8px; padding: 0 7px; }
        .ph-remove { width: 28px; }
        .ph-drop { height: 36px; font-size: 9px; gap: 2px; }

        .ph-preset-grid { grid-template-columns: 1fr 82px; gap: 6px; }
        .ph-preset-actions { gap: 5px !important; margin-top: 6px !important; }
        .ph-preset-input, .ph-preset-select, .ph-preset-btn { height: 27px !important; font-size: 9px !important; border-radius: 6px !important; }
        .ph-footer { padding: 8px 2px 0 !important; font-size: 9px !important; }

        .ph-xy-pad { min-height: 145px !important; border-radius: 8px !important; }
        .ph-xy-dot { width: 19px; height: 19px; }
        .ph-xy-labels, .ph-xy-readout { margin-top: 5px; font-size: 8px; }

        @media (max-width: 1180px) {
          .ph-layout, .ph-bottom { grid-template-columns: 1fr !important; }
          .ph-topbar { grid-template-columns: 1fr; height: auto; padding: 8px; }
          .ph-brand, .ph-top-actions { min-width: 0; justify-content: center; }
        }


        /* ─────────────────────────────────────────────────────────────
           RESPONSIVE / INTERACTION PATCH v3
           Fixes clipped panels, horizontal overflow, cramped controls,
           and makes cards usable on narrow screens.
        ───────────────────────────────────────────────────────────── */

        html, body {
          max-width: 100%;
          overflow-x: hidden;
          overscroll-behavior-x: none;
        }

        .ph-main {
          width: 100%;
          max-width: 100vw;
          overflow-x: hidden;
        }

        .ph-page {
          width: 100%;
          max-width: min(1440px, 100vw);
          min-width: 0;
          overflow-x: hidden;
          padding-left: clamp(8px, 2vw, 14px);
          padding-right: clamp(8px, 2vw, 14px);
        }

        .ph-layout,
        .ph-stage-grid,
        .ph-right,
        .ph-bottom,
        .ph-bottom > div,
        .ph-note-mod-wrap,
        .ph-synth-mod-grid,
        .ph-tone-grid,
        .ph-master-grid,
        .ph-macro-grid,
        .ph-preset-grid,
        .ph-engine-grid,
        .ph-action-row {
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }

        .ph-layout {
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
        }

        .ph-stage-grid {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
          gap: 10px;
        }

        .ph-right {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
          gap: 10px;
          align-items: start;
        }

        .ph-bottom {
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
        }

        .ph-bottom > div {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
          gap: 10px;
        }

        .ph-card,
        .ph-side-card,
        .ph-performance,
        .ph-note-mod-card,
        .ph-macro-card,
        .ph-tone-card,
        .ph-synth-mod-card,
        .ph-bass-performance-card,
        .ph-drum-designer-card,
        .ph-xy-card {
          min-width: 0;
          max-width: 100%;
        }

        .ph-card {
          overflow: hidden;
        }

        .ph-card-head,
        .ph-note-editor-head,
        .ph-synth-mod-head,
        .ph-tone-head,
        .ph-master-title-row,
        .ph-xy-head {
          min-width: 0;
          flex-wrap: wrap;
          height: auto;
          min-height: 48px;
          row-gap: 8px;
          padding-top: 10px;
          padding-bottom: 10px;
        }

        .ph-title-wrap,
        .ph-card-actions,
        .ph-note-actions,
        .ph-synth-mod-actions,
        .ph-xy-actions {
          min-width: 0;
          flex-wrap: wrap;
        }

        .ph-card-title,
        .ph-side-title,
        .ph-performance-title,
        .ph-macro-title,
        .ph-note-editor-title,
        .ph-tone-title,
        .ph-mod-title,
        .ph-track-name,
        .ph-mix-name {
          overflow-wrap: anywhere;
        }

        .ph-synth-mod-grid {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
          gap: 10px;
        }

        .ph-mod-knobs {
          grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
          gap: 8px;
        }

        .ph-tone-grid {
          grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
          gap: 8px;
        }

        .ph-master-grid {
          grid-template-columns: repeat(auto-fit, minmax(68px, 1fr));
          gap: 12px;
        }

        .ph-bass-performance-card .ph-master-grid {
          grid-template-columns: repeat(auto-fit, minmax(68px, 1fr));
        }

        .ph-macro-grid {
          grid-template-columns: repeat(auto-fit, minmax(58px, 1fr));
        }

        .ph-engine-grid {
          grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
        }

        .ph-preset-grid {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
        }

        .ph-action-row {
          grid-template-columns: repeat(auto-fit, minmax(68px, 1fr));
        }

        .ph-note-editor {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
        }

        .ph-note-grid,
        .ph-step-number-grid {
          min-width: 620px;
        }

        .ph-grid {
          min-width: 620px;
        }

        .ph-track-row {
          min-width: 0;
          overflow-x: auto;
          overflow-y: visible;
          -webkit-overflow-scrolling: touch;
        }

        .ph-mixer-row {
          grid-template-columns: minmax(70px, 95px) minmax(88px, 1fr) 48px 38px 38px;
          gap: 8px;
        }

        .ph-range {
          min-width: 72px;
        }

        .ph-topbar {
          grid-template-columns: 1fr;
          height: auto;
          min-height: 70px;
          gap: 10px;
          padding-top: 12px;
          padding-bottom: 12px;
        }

        .ph-brand {
          min-width: 0;
        }

        .ph-transport-top,
        .ph-top-actions {
          flex-wrap: wrap;
          justify-content: flex-start;
          min-width: 0;
        }

        .ph-bpm-box {
          min-width: 0;
        }

        .ph-engine-select,
        .ph-preset-select,
        .ph-preset-input,
        button,
        input,
        select {
          max-width: 100%;
          touch-action: manipulation;
        }

        .ph-range,
        .ph-xy-pad {
          touch-action: none;
        }

        @media (min-width: 900px) {
          .ph-topbar {
            grid-template-columns: auto minmax(0, 1fr) auto;
          }

          .ph-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .ph-stage-grid {
            grid-template-columns: minmax(260px, 0.95fr) minmax(340px, 1.25fr) minmax(280px, 1fr);
          }

          .ph-right {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (min-width: 1280px) {
          .ph-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .ph-right {
            grid-template-columns: minmax(300px, 1fr) minmax(300px, 1fr) minmax(320px, 1fr);
          }

          .ph-bottom > div {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }
        }

        @media (max-width: 760px) {
          .ph-page {
            padding-left: 8px;
            padding-right: 8px;
          }

          .ph-card-head {
            padding-left: 10px;
            padding-right: 10px;
          }

          .ph-side-card,
          .ph-performance,
          .ph-macro-card,
          .ph-note-mod-card {
            padding: 12px;
          }

          .ph-card-title,
          .ph-performance-title,
          .ph-macro-title {
            font-size: 12px;
            letter-spacing: 0.14em;
          }

          .ph-side-title {
            font-size: 11px;
            letter-spacing: 0.14em;
          }

          .ph-mixer-row {
            grid-template-columns: minmax(72px, 1fr) 82px 44px 34px 34px;
            gap: 6px;
          }

          .ph-mix-name {
            font-size: 11px;
            gap: 7px;
          }

          .ph-db {
            font-size: 11px;
          }
        }



        /* ── Responsive hardening ── */
        html, body { max-width: 100%; overflow-x: hidden; }
        .ph-main, .ph-page { width: 100%; max-width: 100%; overflow-x: hidden; }
        button, select, input { touch-action: manipulation; }
        .ph-card, .ph-side-card, .ph-mod-group, .ph-step-grid, .ph-step-number-grid { min-width: 0; }
        .ph-step-grid, .ph-rows, .ph-prob-legend { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media (max-width: 1279px) {
          .ph-layout { grid-template-columns: 1fr; }
          .ph-right { order: 2; }
        }
        @media (max-width: 1024px) {
          .ph-topbar {
            height: auto;
            grid-template-columns: 1fr;
            gap: 10px;
            padding: 12px;
          }
          .ph-brand, .ph-top-actions, .ph-transport-top {
            min-width: 0;
            width: 100%;
            justify-content: center;
            flex-wrap: wrap;
          }
          .ph-layout { margin-top: 10px; gap: 10px; }
          .ph-step-numbers, .ph-track-row { grid-template-columns: 110px minmax(640px,1fr); }
          .ph-knob-grid, .ph-synth-mod-grid, .ph-engine-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
        }
        @media (max-width: 768px) {
          .ph-page { padding: 0 8px 12px; }
          .ph-card-head { height: auto; min-height: 48px; padding: 10px; flex-wrap: wrap; gap: 8px; }
          .ph-title-wrap, .ph-card-actions { width: 100%; justify-content: space-between; flex-wrap: wrap; }
          .ph-step-numbers, .ph-track-row { grid-template-columns: 92px minmax(720px,1fr); gap: 8px; }
          .ph-lane-label { grid-template-columns: 12px 1fr 26px; }
          .ph-random-mini { display: none; }
          .ph-track-name { font-size: 10px; }
          .ph-sample-mini { max-width: 72px; font-size: 8px; }
          .ph-knob-grid, .ph-synth-mod-grid, .ph-engine-grid { grid-template-columns: 1fr; }
          .ph-master-title-row, .ph-synth-mod-head { flex-wrap: wrap; }
          .ph-bpm-box { min-width: 140px; }
          .ph-export, .ph-tap { min-height: 40px; }
          .ph-round-btn { width: 48px; height: 48px; }
        }
        @media (max-width: 520px) {
          .ph-brand-sub, .ph-sync { display: none; }
          .ph-step-numbers, .ph-track-row { grid-template-columns: 82px minmax(760px,1fr); }
          .ph-prob-legend { padding: 8px 10px 4px; gap: 8px; font-size: 8px; flex-wrap: wrap; }
        }


        /* ──────────────────────────────────────────────────────────────
           FINAL HARDWARE DENSITY PASS
           Real layout refactor: sequencer full width + compact module grid.
           This intentionally overrides previous responsive experiments.
        ────────────────────────────────────────────────────────────── */
        .ph-main { font-size: 10px !important; overflow-x: hidden !important; }
        .ph-page { max-width: 1600px !important; padding: 0 8px 8px !important; }

        .ph-topbar {
          height: 48px !important;
          min-height: 48px !important;
          grid-template-columns: minmax(148px, auto) minmax(360px, 1fr) minmax(190px, auto) !important;
          gap: 8px !important;
          padding: 0 8px !important;
          border-radius: 0 0 9px 9px !important;
        }
        .ph-brand { min-width: 0 !important; gap: 6px !important; }
        .ph-logo { font-size: 18px !important; letter-spacing: .10em !important; }
        .ph-brand-sub { font-size: 8px !important; letter-spacing: .22em !important; }
        .ph-transport-top { gap: 5px !important; }
        .ph-round-btn { width: 34px !important; height: 34px !important; }
        .ph-small-icon { width: 25px !important; height: 25px !important; border-radius: 7px !important; }
        .ph-bpm-box { height: 34px !important; min-width: 118px !important; grid-template-columns: 24px 1fr 24px !important; padding: 0 4px !important; border-radius: 8px !important; }
        .ph-bpm-label { font-size: 7px !important; letter-spacing: .18em !important; }
        .ph-bpm-number { font-size: 15px !important; letter-spacing: .05em !important; }
        .ph-tap { height: 26px !important; padding: 0 8px !important; border-radius: 7px !important; font-size: 9px !important; }
        .ph-top-actions { gap: 4px !important; min-width: 0 !important; }
        .ph-sync { font-size: 8px !important; gap: 5px !important; letter-spacing: .14em !important; }
        .ph-sync-dot { width: 8px !important; height: 8px !important; }
        .ph-export { height: 27px !important; padding: 0 8px !important; border-radius: 7px !important; font-size: 9px !important; gap: 4px !important; }

        /* Main architecture: no sidebar. One dense hardware surface. */
        .ph-layout {
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 6px !important;
          margin-top: 6px !important;
          align-items: start !important;
          min-width: 0 !important;
        }
        .ph-card {
          border-radius: 7px !important;
          box-shadow: 0 14px 36px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.055) !important;
          min-width: 0 !important;
        }
        .ph-card-head {
          height: 34px !important;
          padding: 0 8px !important;
        }
        .ph-title-wrap { gap: 6px !important; }
        .ph-card-title, .ph-side-title, .ph-performance-title, .ph-macro-title {
          font-size: 10px !important;
          letter-spacing: .14em !important;
          margin: 0 0 7px !important;
          line-height: 1.1 !important;
        }
        .ph-card-subtitle { font-size: 8px !important; letter-spacing: .10em !important; }
        .ph-card-actions { gap: 5px !important; }
        .ph-outline-btn { height: 24px !important; padding: 0 7px !important; border-radius: 6px !important; font-size: 9px !important; }
        .ph-hint { display: none !important; }

        /* Sequencer: compact groovebox grid, still horizontally safe. */
        .ph-step-numbers {
          grid-template-columns: 108px minmax(720px, 1fr) !important;
          gap: 4px !important;
          padding: 5px 7px 2px !important;
          min-width: 850px !important;
        }
        .ph-step-number-grid { gap: 3px !important; }
        .ph-num { height: 16px !important; font-size: 8px !important; }
        .ph-rows {
          gap: 3px !important;
          padding: 0 7px 7px !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          -webkit-overflow-scrolling: touch !important;
          scrollbar-width: thin !important;
        }
        .ph-track-row {
          grid-template-columns: 108px minmax(720px, 1fr) !important;
          gap: 4px !important;
          min-height: 39px !important;
          width: 100% !important;
          min-width: 850px !important;
        }
        .ph-lane-label { grid-template-columns: 12px 1fr 23px 24px !important; gap: 3px !important; }
        .ph-index { font-size: 8px !important; }
        .ph-name-block { gap: 2px !important; }
        .ph-name-line { gap: 5px !important; }
        .ph-dot, .ph-mix-dot { width: 7px !important; height: 7px !important; }
        .ph-track-name { font-size: 9px !important; letter-spacing: .08em !important; }
        .ph-sample-mini { height: 17px !important; max-width: 70px !important; padding: 0 4px !important; font-size: 7px !important; border-radius: 4px !important; }
        .ph-random-mini, .ph-solo-mini { width: 22px !important; height: 22px !important; min-width: 22px !important; border-radius: 5px !important; font-size: 9px !important; }
        .ph-length-controls, .ph-euclidean-mini { transform: scale(.78) !important; transform-origin: left center !important; margin-top: -2px !important; }
        .ph-length-presets { display: none !important; }
        .ph-grid { gap: 3px !important; }
        .ph-step {
          min-height: 36px !important;
          height: 36px !important;
          border-radius: 6px !important;
          padding: 2px !important;
          font-size: 8px !important;
        }
        .ph-note-badge, .ph-gate-badge, .ph-chord-badge, .ph-lock-badge, .ph-ratch-badge {
          font-size: 7px !important;
          line-height: 1 !important;
          padding: 1px 2px !important;
          border-radius: 3px !important;
        }
        .ph-prob-dots { gap: 1px !important; }
        .ph-prob-dot { width: 3px !important; height: 3px !important; }
        .ph-velocity-bar { height: 2px !important; }

        /* Bass/Synth note editor: two compact columns on desktop. */
        .ph-note-mod-card {
          padding: 8px !important;
          margin-top: 0 !important;
        }
        .ph-note-mod-wrap {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 6px !important;
        }
        .ph-note-editor { padding: 7px !important; border-radius: 7px !important; min-width: 0 !important; overflow: hidden !important; }
        .ph-note-editor-head { min-height: 24px !important; margin-bottom: 5px !important; gap: 5px !important; }
        .ph-note-editor-title { font-size: 9px !important; letter-spacing: .12em !important; }
        .ph-note-actions { gap: 3px !important; flex-wrap: wrap !important; }
        .ph-note-action { height: 20px !important; padding: 0 5px !important; font-size: 7px !important; border-radius: 5px !important; }
        .ph-note-grid { gap: 3px !important; grid-template-columns: repeat(16, minmax(36px, 1fr)) !important; overflow-x: auto !important; }
        .ph-note-cell { min-height: 44px !important; border-radius: 5px !important; padding: 3px 2px !important; }
        .ph-note-number { font-size: 7px !important; }
        .ph-note-name { font-size: 10px !important; }
        .ph-note-gate, .ph-note-chord { font-size: 7px !important; }
        .ph-note-lane-controls { gap: 3px !important; margin-top: 5px !important; }
        .ph-note-lane-btn { height: 21px !important; padding: 0 6px !important; font-size: 8px !important; border-radius: 5px !important; }

        /* True module grid: all tools sit close together, no giant sidebar feel. */
        .ph-stage-grid,
        .ph-right,
        .ph-bottom > div {
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 6px !important;
          margin-top: 6px !important;
          align-items: stretch !important;
          min-width: 0 !important;
        }
        .ph-stage-grid .ph-card,
        .ph-right .ph-card,
        .ph-bottom .ph-card { min-height: 0 !important; }
        .ph-side-card, .ph-performance, .ph-macro-card {
          padding: 8px !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
        .ph-drum-designer-card { grid-column: span 2 !important; }
        .ph-synth-mod-card { grid-column: span 2 !important; }
        .ph-xy-card { min-height: 0 !important; }
        .ph-performance { grid-column: span 1 !important; }

        .ph-master-title-row, .ph-synth-mod-head, .ph-xy-head {
          min-height: 20px !important;
          margin-bottom: 5px !important;
          padding: 0 !important;
          gap: 5px !important;
        }
        .ph-synth-mod-actions { gap: 4px !important; }
        .ph-filter-reset, .ph-action, .ph-preset-btn {
          height: 22px !important;
          padding: 0 6px !important;
          border-radius: 5px !important;
          font-size: 7px !important;
          letter-spacing: .08em !important;
          white-space: nowrap !important;
        }
        .ph-action-row { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 4px !important; }
        .ph-master-grid, .ph-macro-grid {
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(50px, 1fr)) !important;
          gap: 4px !important;
          align-items: start !important;
        }
        .ph-drum-section { padding: 5px 0 !important; margin: 0 !important; border-top: 1px solid rgba(255,255,255,.04) !important; }
        .ph-drum-section-title, .ph-mod-title {
          font-size: 7px !important;
          letter-spacing: .14em !important;
          margin-bottom: 4px !important;
        }
        .ph-master-note, .ph-preset-note, .ph-preset-status {
          font-size: 7px !important;
          line-height: 1.25 !important;
          margin-top: 5px !important;
          opacity: .68 !important;
        }
        .ph-synth-mod-grid {
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 5px !important;
        }
        .ph-mod-group {
          padding: 5px !important;
          border-radius: 6px !important;
          min-width: 0 !important;
        }
        .ph-mod-knobs { gap: 3px !important; justify-content: space-evenly !important; }
        .ph-engine-grid { grid-template-columns: repeat(4, minmax(0,1fr)) !important; gap: 4px !important; }
        .ph-engine-control { gap: 2px !important; min-width: 0 !important; }
        .ph-engine-label { font-size: 7px !important; letter-spacing: .10em !important; }
        .ph-engine-select, .ph-engine-value, .ph-engine-stepper {
          min-height: 22px !important;
          height: 22px !important;
          font-size: 8px !important;
          border-radius: 5px !important;
          padding: 0 5px !important;
        }
        .ph-engine-stepper button { width: 22px !important; height: 22px !important; }

        /* Mixer as slim hardware strips. */
        .ph-mixer-head { grid-template-columns: 74px 1fr 42px 26px 26px !important; gap: 4px !important; font-size: 7px !important; margin-bottom: 4px !important; }
        .ph-mixer-row { grid-template-columns: 74px 1fr 42px 26px 26px !important; gap: 4px !important; min-height: 25px !important; padding: 2px 0 !important; }
        .ph-mix-name { font-size: 8px !important; gap: 4px !important; letter-spacing: .04em !important; }
        .ph-range { height: 14px !important; }
        .ph-db { font-size: 7px !important; text-align: right !important; }
        .ph-pill { width: 24px !important; height: 21px !important; border-radius: 5px !important; font-size: 8px !important; }

        /* Samples/presets inputs compact. */
        .ph-sample-row { min-height: 30px !important; padding: 4px 0 !important; gap: 5px !important; }
        .ph-sample-name { font-size: 8px !important; }
        .ph-upload-btn { height: 22px !important; padding: 0 6px !important; font-size: 7px !important; }
        .ph-preset-grid { gap: 5px !important; }
        .ph-preset-input, .ph-preset-select { height: 24px !important; font-size: 8px !important; border-radius: 5px !important; }
        .ph-preset-actions { gap: 4px !important; margin-top: 5px !important; }
        .ph-bottom { display: block !important; margin-top: 6px !important; }
        .ph-footer { margin: 8px 0 0 !important; padding: 6px 2px !important; font-size: 8px !important; }

        /* XY pad compact. */
        .ph-xy-pad { height: 120px !important; min-height: 120px !important; border-radius: 7px !important; }
        .ph-xy-mode-row { gap: 4px !important; margin-bottom: 5px !important; }
        .ph-xy-mode, .ph-xy-hold { height: 22px !important; padding: 0 6px !important; font-size: 7px !important; border-radius: 5px !important; }

        @media (max-width: 1280px) {
          .ph-topbar { grid-template-columns: 1fr !important; height: auto !important; padding: 7px !important; gap: 6px !important; }
          .ph-transport-top, .ph-top-actions { justify-content: flex-start !important; flex-wrap: wrap !important; }
          .ph-stage-grid, .ph-right, .ph-bottom > div { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .ph-note-mod-wrap { grid-template-columns: 1fr !important; }
          .ph-drum-designer-card, .ph-synth-mod-card { grid-column: span 1 !important; }
        }
        @media (max-width: 720px) {
          .ph-page { padding: 0 5px 8px !important; }
          .ph-stage-grid, .ph-right, .ph-bottom > div { grid-template-columns: 1fr !important; gap: 5px !important; }
          .ph-side-card, .ph-performance, .ph-macro-card, .ph-note-mod-card { padding: 7px !important; }
          .ph-card-head { height: 32px !important; }
          .ph-step-numbers, .ph-track-row { grid-template-columns: 96px minmax(650px, 1fr) !important; min-width: 760px !important; }
          .ph-lane-label { grid-template-columns: 10px 1fr 21px 22px !important; }
          .ph-track-row { min-height: 38px !important; }
          .ph-step { height: 35px !important; min-height: 35px !important; }
          .ph-synth-mod-grid, .ph-engine-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .ph-master-grid, .ph-macro-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
          .ph-note-grid { grid-template-columns: repeat(16, 38px) !important; }
        }



        /* ── Patch: clean row length controls, no overlap ── */
        .ph-track-row,
        .ph-step-numbers {
          grid-template-columns: 164px 1fr !important;
        }
        .ph-lane-label {
          grid-template-columns: 14px minmax(0, 1fr) 28px 28px !important;
          align-items: center !important;
          gap: 5px !important;
          min-width: 0 !important;
        }
        .ph-name-block {
          min-width: 0 !important;
          overflow: visible !important;
        }
        .ph-length-controls {
          display: block !important;
          width: 86px !important;
          max-width: 86px !important;
          min-width: 86px !important;
          overflow: visible !important;
        }
        .ph-length-stepper {
          height: 22px !important;
          width: 86px !important;
          min-width: 86px !important;
          grid-template-columns: 24px 38px 24px !important;
          overflow: hidden !important;
        }
        .ph-length-btn,
        .ph-length-value {
          height: 22px !important;
          min-height: 22px !important;
          line-height: 22px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }
        .ph-length-btn {
          min-width: 24px !important;
          width: 24px !important;
          font-size: 13px !important;
          font-weight: 800 !important;
        }
        .ph-length-value {
          min-width: 38px !important;
          width: 38px !important;
          font-size: 9px !important;
          border-left: 1px solid rgba(255,255,255,0.08) !important;
          border-right: 1px solid rgba(255,255,255,0.08) !important;
        }
        .ph-length-presets {
          display: none !important;
        }
        .ph-euclidean-mini {
          margin-top: 3px !important;
          transform: none !important;
          transform-origin: left center !important;
          max-width: 148px !important;
        }
        .ph-random-mini,
        .ph-solo-mini {
          position: relative !important;
          z-index: 2 !important;
          flex-shrink: 0 !important;
        }
        .ph-playhead-line {
          left: calc(18px + 164px + 12px + ((100% - 18px - 18px - 164px - 12px) / 16) * var(--active-step, 0) + ((100% - 18px - 18px - 164px - 12px) / 32)) !important;
        }

        @media (max-width: 900px) {
          .ph-track-row,
          .ph-step-numbers {
            grid-template-columns: 132px minmax(650px, 1fr) !important;
          }
          .ph-lane-label {
            grid-template-columns: 12px minmax(0, 1fr) 24px !important;
          }
          .ph-solo-mini {
            display: none !important;
          }
          .ph-length-controls {
            width: 76px !important;
            min-width: 76px !important;
            max-width: 76px !important;
          }
          .ph-length-stepper {
            width: 76px !important;
            min-width: 76px !important;
            grid-template-columns: 22px 32px 22px !important;
          }
          .ph-length-btn { width: 22px !important; min-width: 22px !important; }
          .ph-length-value { width: 32px !important; min-width: 32px !important; }
        }


        /* ── Patch: step length control v2 ─────────────────────────────
           +/- changes by 1. Preset chips stay visible below: 4/6/8/10/12/14/16. */
        .ph-track-row,
        .ph-step-numbers {
          grid-template-columns: 238px minmax(720px, 1fr) !important;
        }
        .ph-lane-label {
          grid-template-columns: 14px minmax(0, 1fr) 28px 28px !important;
          gap: 6px !important;
          align-items: start !important;
        }
        .ph-name-block {
          min-width: 0 !important;
          width: 100% !important;
          overflow: visible !important;
        }
        .ph-length-controls {
          display: flex !important;
          flex-direction: column !important;
          gap: 4px !important;
          width: 154px !important;
          min-width: 154px !important;
          max-width: 154px !important;
          overflow: visible !important;
          transform: none !important;
          margin-top: 2px !important;
        }
        .ph-length-stepper {
          width: 112px !important;
          min-width: 112px !important;
          height: 24px !important;
          display: grid !important;
          grid-template-columns: 30px 52px 30px !important;
          border-radius: 7px !important;
          overflow: hidden !important;
        }
        .ph-length-btn,
        .ph-length-value {
          height: 24px !important;
          min-height: 24px !important;
          line-height: 24px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .ph-length-btn {
          width: 30px !important;
          min-width: 30px !important;
          font-size: 14px !important;
          font-weight: 900 !important;
        }
        .ph-length-value {
          width: 52px !important;
          min-width: 52px !important;
          font-size: 10px !important;
          font-weight: 900 !important;
          border-left: 1px solid rgba(255,255,255,0.08) !important;
          border-right: 1px solid rgba(255,255,255,0.08) !important;
        }
        .ph-length-presets {
          grid-column: auto !important;
          display: flex !important;
          flex-wrap: nowrap !important;
          gap: 3px !important;
          width: 154px !important;
          max-width: 154px !important;
          overflow: visible !important;
        }
        .ph-length-preset {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          height: 16px !important;
          min-width: 18px !important;
          padding: 0 3px !important;
          font-size: 7px !important;
          line-height: 1 !important;
        }
        .ph-euclidean-mini {
          max-width: 154px !important;
          transform: none !important;
          margin-top: 3px !important;
        }
        .ph-playhead-line {
          left: calc(18px + 238px + 12px + ((100% - 18px - 18px - 238px - 12px) / 16) * var(--active-step, 0) + ((100% - 18px - 18px - 238px - 12px) / 32)) !important;
        }

        @media (max-width: 900px) {
          .ph-track-row,
          .ph-step-numbers {
            grid-template-columns: 206px minmax(650px, 1fr) !important;
          }
          .ph-lane-label {
            grid-template-columns: 12px minmax(0, 1fr) 24px 24px !important;
            gap: 4px !important;
          }
          .ph-length-controls {
            width: 138px !important;
            min-width: 138px !important;
            max-width: 138px !important;
          }
          .ph-length-stepper {
            width: 100px !important;
            min-width: 100px !important;
            grid-template-columns: 26px 48px 26px !important;
          }
          .ph-length-btn { width: 26px !important; min-width: 26px !important; }
          .ph-length-value { width: 48px !important; min-width: 48px !important; }
          .ph-length-presets {
            display: flex !important;
            width: 138px !important;
            max-width: 138px !important;
          }
          .ph-length-preset {
            min-width: 16px !important;
            font-size: 6.5px !important;
            padding: 0 2px !important;
          }
        }



        /* Patch v3: restore visible master volume in top bar */
        .ph-master-volume {
          height: 34px !important;
          min-width: 190px !important;
          display: inline-flex !important;
          align-items: center !important;
          gap: 7px !important;
          padding: 0 10px !important;
          border: 1px solid rgba(255,255,255,0.16) !important;
          border-radius: 11px !important;
          background: rgba(255,255,255,0.045) !important;
          color: #edf1ff !important;
          font-size: 9px !important;
          font-weight: 800 !important;
          letter-spacing: .12em !important;
          text-transform: uppercase !important;
          white-space: nowrap !important;
        }
        .ph-master-volume input {
          width: 70px !important;
          accent-color: #9b6cff !important;
        }
        .ph-master-volume b {
          width: 42px !important;
          font-size: 8px !important;
          color: #bfc7d8 !important;
          text-align: right !important;
        }

        /* Patch v3: step length = +/- by 1, preset blocks below, no overlap */
        .ph-length-controls {
          width: 142px !important;
          max-width: 142px !important;
          min-width: 142px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 3px !important;
          overflow: visible !important;
        }
        .ph-length-stepper {
          width: 96px !important;
          min-width: 96px !important;
          height: 22px !important;
          display: grid !important;
          grid-template-columns: 24px 48px 24px !important;
          overflow: hidden !important;
        }
        .ph-length-presets {
          display: flex !important;
          gap: 2px !important;
          width: 142px !important;
          max-width: 142px !important;
          overflow: visible !important;
        }
        .ph-length-preset {
          width: 18px !important;
          min-width: 18px !important;
          height: 15px !important;
          padding: 0 !important;
          font-size: 6.5px !important;
          line-height: 15px !important;
          border-radius: 4px !important;
        }
        .ph-track-row,
        .ph-step-numbers {
          grid-template-columns: 196px 1fr !important;
        }
        .ph-playhead-line {
          left: calc(18px + 196px + 12px + ((100% - 18px - 18px - 196px - 12px) / 16) * var(--active-step, 0)) !important;
        }

        .ph-step.outside-length,
        .ph-step.outside-length.active,
        .ph-step.outside-length.playhead {
          opacity: 0.12 !important;
          pointer-events: none !important;
          filter: grayscale(1) !important;
          background: rgba(255, 255, 255, 0.025) !important;
          border-color: rgba(255, 255, 255, 0.06) !important;
          box-shadow: none !important;
          cursor: not-allowed !important;
        }
        .ph-step.outside-length::before,
        .ph-step.outside-length::after {
          display: none !important;
          opacity: 0 !important;
        }
      `}
        /* ── PHASE LIVE CODE ── */
        .ph-live-card {
          margin-top: 8px;
          border: 1px solid rgba(155,108,255,0.22);
          background:
            linear-gradient(180deg, rgba(13,18,26,0.96), rgba(5,8,12,0.98)),
            radial-gradient(circle at 12% 0%, rgba(155,108,255,0.20), transparent 42%);
          box-shadow: 0 18px 60px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.055);
          overflow: hidden;
        }
        .ph-live-head {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.065);
          background: linear-gradient(90deg, rgba(155,108,255,0.12), rgba(131,189,255,0.04), transparent);
        }
        .ph-live-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .20em;
          color: #f4efff;
        }
        .ph-live-cursor {
          width: 7px;
          height: 14px;
          border-radius: 2px;
          background: #9b6cff;
          box-shadow: 0 0 16px rgba(155,108,255,0.9);
          animation: phBlink 1s steps(2, start) infinite;
        }
        @keyframes phBlink { 50% { opacity: .18; } }
        .ph-live-sub {
          margin-top: 4px;
          font-size: 9px;
          color: #788292;
          letter-spacing: .10em;
          text-transform: uppercase;
        }
        .ph-live-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .ph-live-run, .ph-live-secondary {
          height: 28px;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 8px;
          padding: 0 10px;
          cursor: pointer;
          color: #f5f7fb;
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .12em;
          transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
        }
        .ph-live-run {
          border-color: rgba(155,108,255,0.62);
          background: linear-gradient(180deg, rgba(155,108,255,0.38), rgba(82,53,170,0.82));
          box-shadow: 0 0 24px rgba(155,108,255,0.20), inset 0 1px 0 rgba(255,255,255,0.14);
        }
        .ph-live-secondary {
          background: rgba(255,255,255,0.045);
        }
        .ph-live-run:hover, .ph-live-secondary:hover {
          transform: translateY(-1px);
          border-color: rgba(205,187,255,0.72);
          box-shadow: 0 0 22px rgba(155,108,255,0.22);
        }
        .ph-live-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 260px;
          gap: 10px;
          padding: 10px;
        }
        .ph-live-editor-wrap {
          position: relative;
          min-width: 0;
          border: 1px solid rgba(255,255,255,0.065);
          border-radius: 10px;
          background:
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px) 0 0 / 16px 16px,
            linear-gradient(180deg, rgba(255,255,255,0.022) 1px, transparent 1px) 0 0 / 16px 16px,
            rgba(0,0,0,0.26);
          overflow: hidden;
        }
        .ph-live-editor {
          width: 100%;
          min-height: 190px;
          resize: vertical;
          outline: none;
          border: 0;
          padding: 12px 13px;
          background: transparent;
          color: #dfffe9;
          caret-color: #efe36b;
          font-family: 'DM Mono', 'Fira Mono', monospace;
          font-size: 12px;
          line-height: 1.55;
          tab-size: 2;
        }
        .ph-live-editor::placeholder { color: rgba(223,255,233,0.34); }
        .ph-live-panel {
          min-width: 0;
          border: 1px solid rgba(255,255,255,0.065);
          border-radius: 10px;
          padding: 10px;
          background: rgba(255,255,255,0.035);
        }
        .ph-live-status {
          margin-bottom: 9px;
          color: #cdbbff;
          font-size: 10px;
          line-height: 1.35;
          letter-spacing: .06em;
        }
        .ph-live-help {
          display: grid;
          gap: 6px;
          color: #9aa4b4;
          font-size: 9px;
          line-height: 1.35;
        }
        .ph-live-help code {
          color: #efe36b;
          background: rgba(0,0,0,0.28);
          border: 1px solid rgba(255,255,255,0.055);
          border-radius: 5px;
          padding: 1px 5px;
        }
        @media (max-width: 920px) {
          .ph-live-body { grid-template-columns: 1fr; }
          .ph-live-head { grid-template-columns: 1fr; }
          .ph-live-actions { justify-content: flex-start; }
        }

        </style>

      <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={handleFileChange} />

      <section className="ph-page">
        {/* ── Topbar ── */}
        <header className="ph-topbar">
          <div className="ph-brand">
            <div className="ph-logo">PHASE</div>
            <div className="ph-brand-sub">Step Matrix</div>
          </div>

          <div className="ph-transport-top">
            <button className={`ph-round-btn ${playing ? "stop-state" : "play"}`} onClick={togglePlay} title={playing ? "Stop" : "Play"}>
              {playing ? <Square size={18} fill="currentColor" /> : <Play size={23} fill="currentColor" />}
            </button>
            <button className="ph-small-icon" onClick={stopPlayback} title="Stop"><Square size={14} fill="currentColor" /></button>
            <button className="ph-small-icon" title="Preview"><Volume2 size={16} /></button>
            <button className="ph-small-icon" onClick={() => mutate(0.16)} title="Mutate"><Shuffle size={16} /></button>

            <div className="ph-bpm-box">
              <button className="ph-small-icon" style={{ width: 32, height: 32 }} onClick={() => setBpm((v) => Math.max(80, v - 1))}><ChevronLeft size={16} /></button>
              <div className="ph-bpm-value">
                <div className="ph-bpm-label">BPM</div>
                <div className="ph-bpm-number">{bpm.toFixed(1)}</div>
              </div>
              <button className="ph-small-icon" style={{ width: 32, height: 32 }} onClick={() => setBpm((v) => Math.min(160, v + 1))}><ChevronRight size={16} /></button>
            </div>
            <button className="ph-tap" onClick={() => setBpm(138)}>TAP</button>
          </div>

          <div className="ph-top-actions">
            <div className="ph-sync"><span className={`ph-sync-dot ${playing ? "ph-pulse" : ""}`} /> Sync</div>
            <label className="ph-master-volume" title={`Master volume: ${masterVolume.toFixed(1)} dB`}>
              <Volume2 size={15} />
              <span>Master</span>
              <input
                type="range"
                min="-36"
                max="6"
                step="0.5"
                value={masterVolume}
                onChange={(e) => setMasterVolume(Number(e.target.value))}
                onDoubleClick={resetMasterVolume}
              />
              <b>{masterVolume.toFixed(1)} dB</b>
            </label>
            <button className="ph-small-icon"><Moon size={16} /></button>
            <button className="ph-export">Export <Download size={15} /></button>
            <button className="ph-small-icon"><Settings size={17} /></button>
          </div>
        </header>

        {/* ── PHASE LIVE CODE ── */}
        <section className="ph-card ph-live-card">
          <div className="ph-live-head">
            <div>
              <div className="ph-live-title"><span className="ph-live-cursor" /> PHASE LIVE CODE</div>
              <div className="ph-live-sub">tracker syntax · code to matrix · techno performance layer</div>
            </div>
            <div className="ph-live-actions">
              <button className="ph-live-run" onClick={runLiveCode}>Run</button>
              <button className="ph-live-secondary" onClick={randomLiveCode}>Random</button>
              <button className="ph-live-secondary" onClick={clearLiveCode}>Clear</button>
            </div>
          </div>
          <div className="ph-live-body">
            <div className="ph-live-editor-wrap">
              <textarea
                className="ph-live-editor"
                value={liveCode}
                onChange={(e) => setLiveCode(e.target.value)}
                spellCheck={false}
                placeholder="kick x...x...x...x...&#10;hat .x.x.x.x.x.x.x.x&#10;bass D1 ~ F1 ~ A1 ~ C2 ~"
              />
            </div>
            <aside className="ph-live-panel">
              <div className="ph-live-status">{liveStatus}</div>
              <div className="ph-live-help">
                <span><code>x</code> active step · <code>.</code>/<code>~</code> rest</span>
                <span><code>bpm 140</code> · <code>swing 48</code> · <code>chaos 30</code></span>
                <span><code>hat euclid 7 16 1</code> generates Euclidean rhythm</span>
                <span><code>bass D1 ~ F1 ~ A1 ~</code> writes notes into the bass lane</span>
                <span><code>synth A3:min7</code> · <code>F3:sus2</code> · <code>G3:power</code></span>
              </div>
            </aside>
          </div>
        </section>

        {/* ── Main layout ── */}
        <div className="ph-layout">
          <section className="ph-card">
            <div className="ph-card-head">
              <div className="ph-title-wrap">
                <h2 className="ph-card-title">Step Matrix</h2>
                <p className="ph-card-subtitle">polymeter · notes · probability</p>
              </div>
              <div className="ph-card-actions">
                <button className="ph-outline-btn" onClick={clearPattern}>Clear</button>
                <button className="ph-outline-btn">Poly</button>
                <button className="ph-small-icon"><MoreVertical size={17} /></button>
              </div>
            </div>

            {/* Interaction hint */}
            <div className="ph-hint">
              Left-click: toggle · Right-click: probability · Shift+click: ratchet/gate · Alt+click: velocity · Double-click BASS/SYNTH: note · Focus: perc + synth, kick is foundation
            </div>

            {/* Step numbers */}
            <div className="ph-step-numbers">
              <div />
              <div className="ph-step-number-grid">
                {Array.from({ length: steps }, (_, i) => (
                  <div key={i} className={`ph-num${activeStep === i && playing ? " active-num" : ""}`}>{i + 1}</div>
                ))}
              </div>
            </div>

            {/* Track rows */}
            <div className="ph-rows">
              {playing && activeStep >= 0 && (
                <div
                  className="ph-playhead-line"
                  style={{ "--active-step": activeStep } as React.CSSProperties}
                />
              )}

              {tracks.map((track, row) => {
                const meta         = TRACK_META[track];
                const isSampleable = (SAMPLE_TRACKS as readonly string[]).includes(track);
                const sampleName   = isSampleable ? sampleNames[track as SampleTrack] : undefined;

                return (
                  <div
                    key={track}
                    className="ph-track-row"
                    style={{ "--track-color": meta.dot, "--track-glow": meta.glow } as React.CSSProperties}
                  >
                    <div className="ph-lane-label">
                      <span className="ph-index">{row + 1}</span>
                      <div className="ph-name-block">
                        <div className="ph-name-line">
                          <span className="ph-dot" />
                          <span className="ph-track-name">{track}</span>
                        </div>
                        {isSampleable && (
                          <button className="ph-sample-mini" onClick={() => openSamplePicker(track as SampleTrack)} title={sampleName || `Load sample for ${track}`}>
                            {sampleName ? "Loaded" : "Sample"}
                          </button>
                        )}
                        <div className="ph-length-controls" title={`Polymeter length: ${trackLengths[track]}`}>
                          <div className="ph-length-stepper">
                            <button
                              type="button"
                              className="ph-length-btn"
                              onClick={() => changeTrackLength(track, -1)}
                              aria-label={`Decrease ${track} length`}
                            >
                              −
                            </button>
                            <button
                              type="button"
                              className="ph-length-value"
                              onClick={() => setTrackLength(track, DEFAULT_TRACK_LENGTHS[track])}
                              onDoubleClick={() => setTrackLength(track, DEFAULT_TRACK_LENGTHS[track])}
                              title={`Reset ${track} length to ${DEFAULT_TRACK_LENGTHS[track]}`}
                              style={{ border: 0, background: "transparent", cursor: "pointer" }}
                            >
                              {trackLengths[track]}
                            </button>
                            <button
                              type="button"
                              className="ph-length-btn"
                              onClick={() => changeTrackLength(track, 1)}
                              aria-label={`Increase ${track} length`}
                            >
                              +
                            </button>
                          </div>
                          <div className="ph-length-presets">
                            {TRACK_LENGTH_PRESETS.map((length) => (
                              <button
                                key={length}
                                type="button"
                                className={`ph-length-preset${trackLengths[track] === length ? " active" : ""}`}
                                onClick={() => setTrackLength(track, length)}
                              >
                                {length}
                              </button>
                            ))}
                          </div>
                        </div>
                        {isEuclideanTrack(track) && (
                          <div className={`ph-euclidean-mini${euclidean[track].enabled ? " on" : ""}`} title="Euclidean rhythm: distributed hits + rotation">
                            <button type="button" className="ph-euc-toggle" onClick={() => toggleEuclideanTrack(track)}>EUC</button>
                            <button type="button" className="ph-euc-btn" onClick={() => updateEuclideanLane(track, { hits: euclidean[track].hits - 1 })}>−</button>
                            <button type="button" className="ph-euc-value" onClick={() => randomizeEuclideanTrack(track)}>H{euclidean[track].hits}</button>
                            <button type="button" className="ph-euc-btn" onClick={() => updateEuclideanLane(track, { hits: euclidean[track].hits + 1 })}>+</button>
                            <button type="button" className="ph-euc-rot" onClick={() => updateEuclideanLane(track, { rotate: euclidean[track].rotate + 1 })}>R{euclidean[track].rotate}</button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="ph-random-mini"
                        onClick={() => randomizeTrack(track, row)}
                        title={`Randomize only ${track} steps`}
                      >
                        R
                      </button>
                      <button className={`ph-solo-mini${solos[track] ? " on" : ""}`} onClick={() => toggleSolo(track)}>S</button>
                    </div>

                    <div className="ph-grid">
                      {Array.from({ length: steps }, (_, col) => {
                        const cell = pattern[row]?.[col] ?? makeStep(false, track, col);
                        const laneLength = Math.max(1, Math.min(steps, trackLengths[track] || steps));
                        const isOutsideLength = col >= laneLength;

                        const laneActiveStep =
                          playing && laneLength > 0 ? activeStep % laneLength : -1;

                        const isCurrent = !isOutsideLength && laneActiveStep === col && playing;
                        const isDownbeat = col % 4 === 0;
                        const isRound = row >= 4;
                        const isNoteTrack = track === "BASS" || track === "SYNTH";
                        const isActive = Boolean(cell.active) && !isOutsideLength;

                        const probClass =
                          !isActive ? "" :
                          cell.probability === 75 ? "prob75" :
                          cell.probability === 50 ? "prob50" :
                          cell.probability === 25 ? "prob25" : "";

                        const probDots =
                          isActive && cell.probability === 75 ? 1 :
                          isActive && cell.probability === 50 ? 2 :
                          isActive && cell.probability === 25 ? 3 : 0;

                        const showRatch = isActive && RATCHET_TRACKS.has(track) && cell.ratchet > 1;
                        const velocity = cell.velocity ?? 100;

                        return (
                          <button
                            key={`${track}-${col}`}
                            type="button"
                            className={[
                              "ph-step",
                              isRound ? "round" : "",
                              isDownbeat ? "downbeat" : "",
                              isActive ? "active" : "",
                              isCurrent ? "playhead" : "",
                              isOutsideLength ? "outside-length" : "",
                              probClass,
                            ].filter(Boolean).join(" ")}
                            style={{
                              "--track-glow": meta.glow,
                              "--step-bg": meta.step,
                              "--step-border": meta.stepBorder,
                            } as React.CSSProperties}
                            onClick={(e) => {
                              if (isOutsideLength) return;

                              if (e.metaKey || e.ctrlKey) {
                                cycleStepLocks(row, col);
                              } else if (e.altKey) {
                                cycleVelocity(row, col);
                              } else if (e.shiftKey && RATCHET_TRACKS.has(track)) {
                                cycleRatch(row, col);
                              } else if (e.shiftKey && isNoteTrack) {
                                cycleGate(row, col);
                              } else {
                                toggleStep(row, col);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (!isOutsideLength) cycleProb(row, col);
                            }}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              if (!isOutsideLength && isNoteTrack) cycleNote(row, col);
                            }}
                            title={
                              isOutsideLength
                                ? "Outside track length"
                                : "Click: on/off · Ctrl/Cmd+click: step lock · Right-click: probability · Alt: velocity · Shift: ratchet/gate"
                            }
                            disabled={isOutsideLength}
                          >
                            {isActive && isNoteTrack && (
                              <span className="ph-note-badge">{cell.note}</span>
                            )}

                            {isActive && isNoteTrack && cell.gate && cell.gate !== "16n" && (
                              <span className="ph-gate-badge">{cell.gate}</span>
                            )}

                            {isActive && track === "SYNTH" && cell.chord && cell.chord !== "SINGLE" && (
                              <span className="ph-chord-badge">
                                {CHORD_LABELS[cell.chord as ChordMode]}
                              </span>
                            )}

                            {hasStepLocks(cell) && !isOutsideLength && (
                              <span
                                className="ph-lock-badge"
                                title={`${countStepLocks(cell)} step lock${countStepLocks(cell) === 1 ? "" : "s"}`}
                              >
                                L{countStepLocks(cell)}
                              </span>
                            )}

                            {probDots > 0 && (
                              <span className="ph-prob-dots">
                                {Array.from({ length: probDots }, (_, i) => (
                                  <span key={i} className="ph-prob-dot" />
                                ))}
                              </span>
                            )}

                            {showRatch && (
                              <span className="ph-ratch-badge">{cell.ratchet}×</span>
                            )}

                            {isActive && (
                              <span className="ph-velocity-bar" title={`Velocity ${velocity}`}>
                                <span
                                  className="ph-velocity-fill"
                                  style={{ width: `${velocity}%` }}
                                />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        {/* ── Bass / Synth Modulation ── */}
        <section className="ph-card ph-note-mod-card">
          <h2 className="ph-macro-title">Bass / Synth Modulation</h2>
          <div className="ph-note-mod-wrap">
            {(["BASS", "SYNTH"] as TrackId[]).map((track) => {
              const row = tracks.indexOf(track);
              const meta = TRACK_META[track];
              const pool = track === "BASS" ? BASS_NOTE_CYCLE : SYNTH_NOTE_CYCLE;
              const length = trackLengths[track] || steps;
              return (
                <div key={track} className="ph-note-editor" style={{ "--track-color": meta.dot, "--track-glow": meta.glow } as React.CSSProperties}>
                  <div className="ph-note-editor-head">
                    <div className="ph-note-editor-title"><span className="ph-mix-dot" /> {track}</div>
                    <div className="ph-note-actions">
                      <button className="ph-note-action" onClick={() => transposeTrackNotes(track, -12)}>-12</button>
                      <button className="ph-note-action" onClick={() => transposeTrackNotes(track, -7)}>-7</button>
                      <button className="ph-note-action" onClick={() => transposeTrackNotes(track, 7)}>+7</button>
                      <button className="ph-note-action" onClick={() => transposeTrackNotes(track, 12)}>+12</button>
                      <button className="ph-note-action" onClick={() => randomizeMelody(track)}>Random</button>
                      <button className="ph-note-action" onClick={() => resetMelody(track)}>Reset</button>
                      {track === "SYNTH" && (
                        <>
                          <button className="ph-note-action" onClick={randomizeChords}>Rand Chords</button>
                          <button className="ph-note-action" onClick={resetChords}>Single</button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="ph-note-grid">
                    {pattern[row].map((cell, col) => {
                      const outside = col >= length;
                      return (
                        <button
                          key={`${track}-note-${col}`}
                          className={`ph-note-cell${cell.active ? "" : " off"}${outside ? " outside" : ""}`}
                          style={{ "--track-color": meta.dot, "--track-glow": meta.glow } as React.CSSProperties}
                          onClick={(e) => {
                            if (outside) return;
                            if (track === "SYNTH" && e.shiftKey) {
                              cycleChord(row, col);
                              return;
                            }
                            setStepNote(track, col, nextNote(track, cell.note));
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (!outside) setStepGate(track, col, nextGate(cell.gate));
                          }}
                          title={track === "SYNTH" ? "Click: note · Shift+click: chord · Right-click: gate" : "Click: note · Right-click: gate"}
                        >
                          <span className="ph-note-number">{col + 1}</span>
                          <span className="ph-note-name">{cell.note || pool[col % pool.length]}</span>
                          <span className="ph-note-gate">{cell.gate || "16n"} · {cell.velocity ?? 100}</span>
                          {track === "SYNTH" && (
                            <span className="ph-note-chord">{CHORD_LABELS[(cell.chord || "SINGLE") as ChordMode]}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="ph-note-lane-controls">
                    {pool.map((note) => (
                      <button key={`${track}-${note}`} className="ph-note-lane-btn" onClick={() => {
                        const firstStep = pattern[row].findIndex((step, index) => step.active && index < length);
                        setStepNote(track, firstStep >= 0 ? firstStep : 0, note);
                      }}>
                        {note}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

          {/* ── Compact performance / FX / samples ── */}
          <div className="ph-stage-grid">
            <section className="ph-card ph-performance">
              <h2 className="ph-performance-title">Performance</h2>
              <div className="ph-action-row">
                <button className="ph-action primary" onClick={generate}><Shuffle size={15} /> Generate</button>
                <button className="ph-action" onClick={() => mutate(0.16)}><Zap size={15} /> Mutate</button>
                <button className="ph-action" onClick={destroy}><Skull size={15} /> Destroy</button>
                <button className="ph-action" onClick={randomizeStepLocks}><Zap size={15} /> Locks</button>
                <button className="ph-action" onClick={clearStepLocks}><X size={15} /> Clear Locks</button>
                <button className="ph-action" onClick={randomizeEuclideanAll}><Shuffle size={15} /> Euclid</button>
                <button className="ph-action" onClick={clearEuclideanAll}><X size={15} /> Clear Euclid</button>
                <button className="ph-action" onClick={generate}><RotateCcw size={15} /> Reset</button>
              </div>
            </section>

            <section className="ph-card ph-side-card ph-drum-designer-card">
              <div className="ph-master-title-row">
                <h2 className="ph-side-title">Percussion Designer</h2>
                <div className="ph-synth-mod-actions">
                  <button type="button" className="ph-filter-reset" onClick={randomizeDrumDesigner}>Random Kit</button>
                  <button type="button" className="ph-filter-reset" onClick={resetDrumDesigner}>Reset Kit</button>
                </div>
              </div>

              {([
                ["kick", "KICK"],
                ["hat", "HAT"],
                ["perc", "PERC A / B"],
                ["fx", "TEXTURE"],
              ] as Array<[keyof DrumDesignerState, string]>).map(([section, label]) => (
                <div key={`drum-${section}`} className="ph-drum-section">
                  <div className="ph-drum-section-title">{label}</div>
                  <div className="ph-master-grid">
                    {(Object.entries(drumDesigner[section]) as Array<[string, number]>).map(([name, value]) => (
                      <Knob
                        key={`drum-${section}-${name}`}
                        label={name}
                        value={value}
                        onChange={(v) => updateDrumDesigner(section, name, v)}
                        compact
                        doubleClickValue={(DEFAULT_DRUM_DESIGNER[section] as any)[name]}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="ph-master-note">
                Edits the internal percussion synths. Uploaded samples still replace each fallback track.
              </div>
            </section>

            <section className="ph-card ph-side-card ph-bass-performance-card">
              <div className="ph-master-title-row">
                <h2 className="ph-side-title">Bass Performance</h2>
                <div className="ph-synth-mod-actions">
                  <button type="button" className="ph-filter-reset" onClick={randomizeBassPerformance}>Random</button>
                  <button type="button" className="ph-filter-reset" onClick={resetBassPerformance}>Reset</button>
                </div>
              </div>
              <div className="ph-master-grid">
                {(Object.entries(bassPerformance) as Array<[keyof BassPerformanceState, number]>).map(([name, value]) => (
                  <Knob
                    key={`bass-perf-${String(name)}`}
                    label={String(name)}
                    value={value}
                    onChange={(v) => updateBassPerformance(name, v)}
                    compact
                    doubleClickValue={DEFAULT_BASS_PERFORMANCE[name]}
                  />
                ))}
              </div>
              <div className="ph-master-note">
                SUB controls the sine layer, PUNCH shapes the transient, CUTOFF/DRIVE sculpt tone, DECAY changes note length and GLIDE adds slide.
              </div>
            </section>

            <section className="ph-card ph-side-card">
              <div className="ph-master-title-row">
                <h2 className="ph-side-title">Master FX</h2>
                <button type="button" className="ph-filter-reset" onClick={resetMasterFilter}>
                  Reset FX
                </button>
              </div>
              <div className="ph-master-grid">
                {(Object.entries(masterFx) as Array<[keyof MasterFxState, number]>).map(([name, value]) => (
                  <Knob
                    key={`master-${String(name)}`}
                    label={String(name)}
                    value={value}
                    onChange={(v) => updateMasterFx(name, v)}
                    compact
                    doubleClickValue={name === "filter" ? 50 : 0}
                  />
                ))}
              </div>
              <div className="ph-master-note">
                RESET FX normalizes the full master section: filter 50, reverb 0, delay 0 and drive 0. Double-click an individual knob to reset only that parameter.
              </div>
            </section>

            <section className="ph-card ph-side-card">
              <div className="ph-master-title-row">
                <h2 className="ph-side-title">Sidechain</h2>
                <button type="button" className="ph-filter-reset" onClick={resetSidechain}>Reset Pump</button>
              </div>
              <div className="ph-master-grid">
                <Knob label="Pump" value={sidechain.pump} onChange={(v) => updateSidechain("pump", v)} compact />
                <Knob label="Tight" value={sidechain.tight} onChange={(v) => updateSidechain("tight", v)} compact />
                <Knob label="Release" value={sidechain.release} onChange={(v) => updateSidechain("release", v)} compact />
                <label className="ph-engine-control">
                  <span className="ph-engine-label">Target</span>
                  <select className="ph-engine-select" value={sidechain.target} onChange={(e) => updateSidechain("target", e.target.value as SidechainTarget)}>
                    <option value="BOTH">Bass + Synth</option>
                    <option value="SYNTH">Synth</option>
                    <option value="BASS">Bass</option>
                    <option value="TEXTURE">TEXTURE</option>
                  </select>
                </label>
              </div>
              <div className="ph-master-note">
                Pump ducks the selected target whenever the kick hits. Tight controls the snap; Release controls how long the groove breathes back.
              </div>
            </section>

            <section className="ph-card ph-side-card ph-xy-card">
              <div className="ph-xy-head">
                <h2 className="ph-side-title">XY Pad</h2>
                <div className="ph-xy-actions">
                  <button
                    type="button"
                    className={`ph-xy-toggle${performancePad.hold ? " on" : ""}`}
                    onClick={() => updatePerformancePad("hold", !performancePad.hold)}
                  >
                    Hold
                  </button>
                  <button type="button" className="ph-xy-toggle" onClick={resetPerformancePad}>Center</button>
                </div>
              </div>

              <label className="ph-engine-control" style={{ marginBottom: 10 }}>
                <span className="ph-engine-label">Mode</span>
                <select
                  className="ph-engine-select"
                  value={performancePad.mode}
                  onChange={(e) => {
                    const mode = e.target.value as PerformancePadMode;
                    updatePerformancePad("mode", mode);
                    applyPerformancePad(performancePad.x, performancePad.y, mode);
                  }}
                >
                  <option value="SYNTH">Synth: X Filter / Y Reverb</option>
                  <option value="ATMOS">Atmos: X Color / Y Delay</option>
                  <option value="MASTER">Master: X Filter / Y Drive</option>
                </select>
              </label>

              <div
                className="ph-xy-pad"
                style={{ "--pad-x": performancePad.x * 100, "--pad-y": performancePad.y * 100 } as React.CSSProperties}
                onPointerDown={handlePerformancePadDown}
                onPointerMove={handlePerformancePadMove}
                onPointerUp={handlePerformancePadUp}
                onPointerCancel={handlePerformancePadUp}
              >
                <span className="ph-xy-dot" />
              </div>
              <div className="ph-xy-labels">
                <span>Dark / Dry</span>
                <span>Bright / Wet</span>
              </div>
              <div className="ph-xy-readout">
                X {Math.round(performancePad.x * 100)} · Y {Math.round(performancePad.y * 100)} · {performancePad.mode}
              </div>
            </section>

          <section className="ph-card ph-side-card">
            <h2 className="ph-side-title">Samples</h2>
            <div className="ph-samples-list">
              {SAMPLE_TRACKS.map((track) => {
                const meta       = TRACK_META[track];
                const sampleName = sampleNames[track];
                return (
                  <div
                    key={track}
                    className={`ph-sample-row${dragOverTrack === track ? " drag-over" : ""}`}
                    style={{ "--track-color": meta.dot, "--track-glow": meta.glow } as React.CSSProperties}
                    onDragEnter={(e) => handleSampleDragOver(e, track)}
                    onDragOver={(e) => handleSampleDragOver(e, track)}
                    onDragLeave={(e) => handleSampleDragLeave(e, track)}
                    onDrop={(e) => handleSampleDrop(e, track)}
                  >
                    <div className="ph-mix-name"><span className="ph-mix-dot" /> {track}</div>
                    <div className="ph-sample-name" title={sampleName || "Drop or load audio"}>{sampleName || "Drop audio here"}</div>
                    <button className="ph-change" onClick={() => openSamplePicker(track)}>{sampleName ? "Change" : "Load"}</button>
                    <button className="ph-remove" onClick={() => removeSample(track)}><X size={15} /></button>
                  </div>
                );
              })}
            </div>
            <div
              className={`ph-drop${dragOverTrack === "KICK" ? " drag-over" : ""}`}
              onClick={() => openSamplePicker("KICK")}
              onDragEnter={(e) => handleSampleDragOver(e, "KICK")}
              onDragOver={(e) => handleSampleDragOver(e, "KICK")}
              onDragLeave={(e) => handleSampleDragLeave(e, "KICK")}
              onDrop={(e) => handleSampleDrop(e, "KICK")}
            >
              <Upload size={18} />
              <span>Drop on each lane to replace its sample</span>
              <span style={{ color: "#7e8795" }}>drop here or click to load KICK</span>
            </div>
          </section>
          </div>

          {/* ── Right sidebar ── */}
          <aside className="ph-right">
            <section className="ph-card ph-side-card">
              <h2 className="ph-side-title">Bass / Synth EQ</h2>
              {(["BASS", "SYNTH"] as ToneTrackId[]).map((track) => {
                const meta = TRACK_META[track];
                const eq = toneEq[track];
                return (
                  <div key={track} className="ph-tone-card" style={{ "--track-color": meta.dot, "--track-glow": meta.glow } as React.CSSProperties}>
                    <div className="ph-tone-head">
                      <div className="ph-tone-title"><span className="ph-mix-dot" /> {track}</div>
                      <button type="button" className="ph-tone-reset" onClick={() => resetToneEq(track)}>Reset EQ</button>
                    </div>
                    <div className="ph-tone-grid">
                      {(Object.entries(eq) as Array<[keyof TrackEqState, number]>).map(([name, value]) => (
                        <Knob
                          key={`${track}-${String(name)}`}
                          label={String(name)}
                          value={value}
                          onChange={(v) => updateToneEq(track, name, v)}
                          compact
                          doubleClickValue={name === "cutoff" ? DEFAULT_TONE_EQ[track].cutoff : 50}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
            <section className="ph-card ph-side-card ph-synth-mod-card">
              <div className="ph-synth-mod-head">
                <h2 className="ph-side-title">Synth Modulation</h2>
                <div className="ph-synth-mod-actions">
                  <button type="button" className="ph-filter-reset" onClick={randomizeSynthMod}>Random</button>
                  <button type="button" className="ph-filter-reset" onClick={resetSynthMod}>Reset</button>
                </div>
              </div>

              <div className="ph-synth-mod-grid">
                <div className="ph-mod-group">
                  <span className="ph-mod-title">LFO</span>
                  <div className="ph-mod-knobs">
                    <Knob label="Rate" value={synthMod.lfoRate} onChange={(v) => updateSynthMod("lfoRate", v)} compact />
                    <Knob label="Depth" value={synthMod.lfoDepth} onChange={(v) => updateSynthMod("lfoDepth", v)} compact />
                  </div>
                </div>

                <div className="ph-mod-group">
                  <span className="ph-mod-title">Envelope</span>
                  <div className="ph-mod-knobs">
                    <Knob label="Filter Env" value={synthMod.filterEnv} onChange={(v) => updateSynthMod("filterEnv", v)} compact />
                    <Knob label="Pluck" value={synthMod.pluckDecay} onChange={(v) => updateSynthMod("pluckDecay", v)} compact />
                  </div>
                </div>

                <div className="ph-mod-group">
                  <span className="ph-mod-title">Timbre</span>
                  <div className="ph-mod-knobs">
                    <Knob label="Color" value={synthMod.fmAmount} onChange={(v) => updateSynthMod("fmAmount", v)} compact />
                    <Knob label="Width" value={synthMod.detune} onChange={(v) => updateSynthMod("detune", v)} compact />
                  </div>
                </div>

                <div className="ph-mod-group">
                  <span className="ph-mod-title">FX Send</span>
                  <div className="ph-mod-knobs">
                    <Knob label="Delay" value={synthMod.delaySend} onChange={(v) => updateSynthMod("delaySend", v)} compact />
                    <Knob label="Reverb" value={synthMod.reverbSend} onChange={(v) => updateSynthMod("reverbSend", v)} compact />
                  </div>
                </div>
              </div>

              <div className="ph-mod-group ph-synth-engine">
                <span className="ph-mod-title">Synth Engine</span>
                <div className="ph-engine-grid">
                  <label className="ph-engine-control">
                    <span className="ph-engine-label">Wave</span>
                    <select className="ph-engine-select" value={synthVoice.waveform} onChange={(e) => updateSynthVoice("waveform", e.target.value as SynthWaveform)}>
                      <option value="sine">Sine</option>
                      <option value="triangle">Triangle</option>
                      <option value="sawtooth">Saw</option>
                      <option value="square">Square</option>
                      <option value="fatsawtooth">Fat Saw</option>
                    </select>
                  </label>

                  <label className="ph-engine-control">
                    <span className="ph-engine-label">Filter</span>
                    <select className="ph-engine-select" value={synthVoice.filterType} onChange={(e) => updateSynthVoice("filterType", e.target.value as SynthFilterType)}>
                      <option value="lowpass">Lowpass</option>
                      <option value="bandpass">Bandpass</option>
                      <option value="highpass">Highpass</option>
                      <option value="notch">Notch</option>
                    </select>
                  </label>

                  <label className="ph-engine-control">
                    <span className="ph-engine-label">LFO Target</span>
                    <select className="ph-engine-select" value={synthVoice.lfoTarget} onChange={(e) => updateSynthVoice("lfoTarget", e.target.value as SynthLfoTarget)}>
                      <option value="filter">Filter</option>
                      <option value="pitch">Pitch</option>
                      <option value="fm">Color</option>
                      <option value="volume">Volume</option>
                    </select>
                  </label>

                  <label className="ph-engine-control">
                    <span className="ph-engine-label">Octave</span>
                    <div className="ph-engine-stepper">
                      <button type="button" onClick={() => updateSynthVoice("octave", Math.max(-2, synthVoice.octave - 1))}>−</button>
                      <span className="ph-engine-value">{synthVoice.octave > 0 ? `+${synthVoice.octave}` : synthVoice.octave}</span>
                      <button type="button" onClick={() => updateSynthVoice("octave", Math.min(2, synthVoice.octave + 1))}>+</button>
                    </div>
                  </label>
                </div>

                <div className="ph-mod-knobs" style={{ marginTop: 10 }}>
                  <Knob label="Glide" value={synthVoice.glide} onChange={(v) => updateSynthVoice("glide", v)} compact />
                  <button type="button" className="ph-filter-reset" onClick={resetSynthVoice} style={{ alignSelf: "end", height: 30 }}>Reset Voice</button>
                </div>
              </div>

              <div className="ph-mod-group ph-synth-engine">
                <div className="ph-synth-mod-head" style={{ padding: 0, marginBottom: 8 }}>
                  <span className="ph-mod-title">Arpeggiator</span>
                  <div className="ph-synth-mod-actions">
                    <button type="button" className="ph-filter-reset" onClick={randomizeArp}>Random</button>
                    <button type="button" className="ph-filter-reset" onClick={resetArp}>Reset</button>
                  </div>
                </div>

                <div className="ph-engine-grid">
                  <label className="ph-engine-control">
                    <span className="ph-engine-label">Mode</span>
                    <select className="ph-engine-select" value={arp.mode} onChange={(e) => updateArp("mode", e.target.value as ArpMode)}>
                      {ARP_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                  </label>

                  <label className="ph-engine-control">
                    <span className="ph-engine-label">Rate</span>
                    <select className="ph-engine-select" value={arp.rate} onChange={(e) => updateArp("rate", e.target.value as ArpRate)}>
                      {ARP_RATES.map((rate) => <option key={rate} value={rate}>{arpRateLabel(rate)}</option>)}
                    </select>
                  </label>

                  <label className="ph-engine-control">
                    <span className="ph-engine-label">Oct Range</span>
                    <div className="ph-engine-stepper">
                      <button type="button" onClick={() => updateArp("octaves", Math.max(1, arp.octaves - 1))}>−</button>
                      <span className="ph-engine-value">{arp.octaves}</span>
                      <button type="button" onClick={() => updateArp("octaves", Math.min(3, arp.octaves + 1))}>+</button>
                    </div>
                  </label>

                  <label className="ph-engine-control">
                    <span className="ph-engine-label">Status</span>
                    <span className="ph-engine-value" style={{ justifyContent: "center", minHeight: 30 }}>{arp.mode === "OFF" ? "CHORD" : "ARP"}</span>
                  </label>
                </div>

                <div className="ph-mod-knobs" style={{ marginTop: 10 }}>
                  <Knob label="Arp Gate" value={arp.gate} onChange={(v) => updateArp("gate", v)} compact />
                  <div className="ph-master-note" style={{ alignSelf: "end" }}>OFF plays chords. UP/DOWN/RANDOM/OCTAVE/RATCHET turns each chord step into a melodic arp.</div>
                </div>
              </div>
            </section>



            <section className="ph-card ph-side-card">
              <div className="ph-mixer-head">
                <span>Mixer</span><span /><span style={{ textAlign: "right" }}>Vol</span><span>Mute</span><span>Solo</span>
              </div>
              {tracks.map((id) => {
                const meta     = TRACK_META[id];
                const isDimmed = anySoloed && !solos[id];
                const volumeFill = Math.max(0, Math.min(100, ((volumes[id] + 30) / 36) * 100));
                return (
                  <div key={id} className="ph-mixer-row" style={{ opacity: isDimmed ? 0.48 : 1, "--track-color": meta.dot, "--track-glow": meta.glow } as React.CSSProperties}>
                    <div className="ph-mix-name"><span className="ph-mix-dot" /> {id}</div>
                    <input
                      type="range"
                      min={-30}
                      max={6}
                      step={0.5}
                      value={volumes[id]}
                      onChange={(e) => setTrackVolume(id, Number(e.target.value))}
                      className="ph-range"
                      title={`${id}: ${volumes[id].toFixed(1)} dB`}
                      style={{
                        background: `linear-gradient(90deg, ${meta.dot} 0%, ${meta.dot} ${volumeFill}%, rgba(255,255,255,0.12) ${volumeFill}%, rgba(255,255,255,0.12) 100%)`,
                      } as React.CSSProperties}
                    />
                    <div className="ph-db">{volumes[id].toFixed(1)}dB</div>
                    <button className={`ph-pill${mutes[id] ? " muted" : ""}`}  onClick={() => toggleMute(id)}>M</button>
                    <button className={`ph-pill${solos[id] ? " soloed" : ""}`} onClick={() => toggleSolo(id)}>S</button>
                  </div>
                );
              })}
            </section>
          </aside>
        </div>

        {/* ── Bottom panels ── */}
        <div className="ph-bottom">
          <div>


            <section className="ph-card ph-macro-card">
              <h2 className="ph-macro-title">Presets</h2>
              <div className="ph-preset-grid">
                <input
                  className="ph-preset-input"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name"
                />
                <button className="ph-preset-btn save" onClick={savePreset}>Save</button>
              </div>

              <div className="ph-preset-grid" style={{ marginTop: 10 }}>
                <select
                  className="ph-preset-select"
                  value={selectedPresetId}
                  onChange={(e) => {
                    setSelectedPresetId(e.target.value);
                    const preset = presets.find((p) => p.id === e.target.value);
                    if (preset) setPresetName(preset.name);
                  }}
                >
                  <option value="">No preset selected</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
                <button className="ph-preset-btn" onClick={() => loadPreset()}>Load</button>
              </div>

              <div className="ph-preset-actions">
                <button className="ph-preset-btn" onClick={() => setPresetName(`Dark Pattern ${String(presets.length + 1).padStart(2, "0")}`)}>New Name</button>
                <button className="ph-preset-btn" onClick={savePreset}>Overwrite</button>
                <button className="ph-preset-btn delete" onClick={deletePreset}>Delete</button>
              </div>
              <div className="ph-preset-status">{presetStatus}</div>
              <div className="ph-preset-note">Presets save patterns, polymeter lengths, notes, gates, BPM, probability, ratchets, velocity, mixer, synth, arp, bass, percussion designer and sidechain. Audio files are not stored by the browser.</div>
            </section>

            <section className="ph-card ph-macro-card">
              <h2 className="ph-macro-title">Macro Controls</h2>
              <div className="ph-macro-grid">
                {(Object.entries(knobs) as Array<[keyof typeof knobs, number]>).map(([name, value]) => (
                  <Knob key={`macro-${String(name)}`} label={String(name)} value={value} onChange={(v) => updateKnob(name, v)} compact />
                ))}
              </div>
            </section>
          </div>


        </div>

        <footer className="ph-footer">
          <span>PHASE v1.0.0</span>
          <span>Built with Tone.js • Made for Techno 💜</span>
        </footer>
      </section>
    </main>
  );
}

// ─── Knob ─────────────────────────────────────────────────────────────────────

function Knob({
  label,
  value,
  onChange,
  compact,
  doubleClickValue,
  onDoubleClickAction,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
  doubleClickValue?: number;
  onDoubleClickAction?: () => void;
}) {
  const isDragging = useRef(false);
  const startY     = useRef(0);
  const startVal   = useRef(0);

  function updateFromPointer(clientY: number) {
    if (!isDragging.current) return;
    onChange(Math.min(100, Math.max(0, Math.round(startVal.current + (startY.current - clientY) * 0.75))));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    updateFromPointer(e.clientY);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  const SIZE = compact ? 42 : 60;
  const CX   = SIZE / 2, CY = SIZE / 2;
  const ARC_R     = compact ? 15 : 22;
  const DOT_ORBIT = compact ? 13 : 18;
  const START_DEG = -225;
  const SWEEP     = (value / 100) * 270;
  const END_DEG   = START_DEG + SWEEP;

  function polar(deg: number, r: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  const a0      = polar(START_DEG, ARC_R);
  const a1      = polar(END_DEG,   ARC_R);
  const bigArc  = SWEEP > 180 ? 1 : 0;
  const arcPath = `M ${a0.x.toFixed(2)} ${a0.y.toFixed(2)} A ${ARC_R} ${ARC_R} 0 ${bigArc} 1 ${a1.x.toFixed(2)} ${a1.y.toFixed(2)}`;
  const dot     = polar(END_DEG, DOT_ORBIT);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 1 : 5, userSelect: "none" }}>
      <div
        style={{ position: "relative", width: SIZE, height: SIZE, cursor: "ns-resize", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onDoubleClickAction) onDoubleClickAction();
          else if (typeof doubleClickValue === "number") onChange(doubleClickValue);
        }}
      >
        <svg width={SIZE} height={SIZE} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <circle cx={CX} cy={CY} r={ARC_R} fill="none" stroke="rgba(255,255,255,0.23)" strokeWidth="1.4" strokeDasharray="2 5" />
          {value > 0 && <path d={arcPath} fill="none" stroke="#9b6cff" strokeWidth="3" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 7px rgba(155,108,255,0.7))" }} />}
          <circle cx={dot.x} cy={dot.y} r="2.3" fill="#cdbbff" style={{ filter: "drop-shadow(0 0 5px rgba(155,108,255,0.85))" }} />
        </svg>
        <div style={{
          position: "absolute", inset: compact ? "11px" : "15px", borderRadius: "50%",
          background: "radial-gradient(circle at 35% 28%, #263040 0%, #111923 58%, #070b10 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.13)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: compact ? 7 : 9, color: "#eef2f7", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        </div>
      </div>
      <p style={{ fontSize: compact ? 7 : 9, letterSpacing: "0.10em", color: "#f0f3f8", textTransform: "uppercase", margin: 0, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif" }}>{label}</p>
      {false && compact && <span style={{ fontSize: 12, color: "#aab2c0" }}>{value}</span>}
    </div>
  );
}
