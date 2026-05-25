"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
import {
  Activity,
  Disc3,
  Pause,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Waves,
} from "lucide-react";

const STEPS = 16;
const TRACKS = ["KICK", "HAT", "PERC", "BASS", "SYNTH"] as const;
type TrackId = (typeof TRACKS)[number];
type EngineMode = "tone" | "strudel";
type RootNote = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";
type ScaleName = "minor" | "dorian" | "phrygian" | "harmonic" | "pentatonic";
type MoodName = "noir" | "hypnotic" | "acid" | "ritual" | "aerial";
type PerformanceAction = "MORPH" | "BUILD" | "STRIP" | "HOLD" | "SHIFT" | "FRACTURE" | "BURST" | "INIT";

interface Step {
  active: boolean;
  probability: number;
  repeat: number;
  velocity: number;
  note?: string;
  locks?: StepLocks;
}

interface StepLocks {
  tone?: number;
  space?: number;
  drive?: number;
}

interface EuclideanLane {
  enabled: boolean;
  hits: number;
  rotate: number;
}

interface RhythmEngine {
  density: number;
  groove: number;
  swing: number;
  probability: number;
  repeat: number;
  chaos: number;
}

interface BassEngine {
  root: RootNote;
  motion: number;
  acid: number;
  drive: number;
  mutation: number;
  energy: number;
}

interface SynthEngine {
  scale: ScaleName;
  mood: MoodName;
  tension: number;
  movement: number;
  space: number;
  brightness: number;
}

interface TextureEngine {
  drone: number;
  noise: number;
  metallic: number;
  motion: number;
  width: number;
  darkness: number;
}

interface FxEngine {
  delay: number;
  reverb: number;
  distortion: number;
  feedback: number;
  freeze: number;
  glitch: number;
}

interface XYState {
  x: number;
  y: number;
  active: boolean;
  held: boolean;
}

interface AudioRig {
  kick: Tone.MembraneSynth;
  hat: Tone.NoiseSynth;
  hatFilter: Tone.Filter;
  perc: Tone.MembraneSynth;
  percFilter: Tone.Filter;
  bass: Tone.MonoSynth;
  bassFilter: Tone.Filter;
  bassDrive: Tone.Distortion;
  synth: Tone.PolySynth<Tone.Synth>;
  synthFilter: Tone.Filter;
  textureDrone: Tone.Oscillator;
  textureNoise: Tone.Noise;
  textureGain: Tone.Gain;
  textureFilter: Tone.Filter;
  delay: Tone.FeedbackDelay;
  reverb: Tone.Reverb;
  drive: Tone.Distortion;
  volume: Tone.Volume;
  trackVolumes: Record<TrackId, Tone.Volume>;
}

interface SampleEntry {
  player: Tone.Player;
  url: string;
  name: string;
}

interface PresetData {
  id: string;
  name: string;
  createdAt: number;
  pattern: Record<TrackId, Step[]>;
  bpm: number;
  engineMode: EngineMode;
  rhythm: RhythmEngine;
  bass: BassEngine;
  synth: SynthEngine;
  texture: TextureEngine;
  fx: FxEngine;
  xy: XYState;
  lengths: Record<TrackId, number>;
  euclidean: Record<TrackId, EuclideanLane>;
  volumes: Record<TrackId, number>;
  mutes: Record<TrackId, boolean>;
  solos: Record<TrackId, boolean>;
  sampleNames: Partial<Record<SampleTrack, string>>;
}

interface StrudelPattern {
  gain(value: number): StrudelPattern;
  distort(value: number): StrudelPattern;
  hpf(value: number): StrudelPattern;
  room(value: number): StrudelPattern;
  lpf(value: number): StrudelPattern;
  lpq(value: number): StrudelPattern;
  delay(value: number): StrudelPattern;
  s(value: string): StrudelPattern;
}

interface StrudelScheduler {
  setPattern(pattern: StrudelPattern): void;
  start(): void;
  stop(): void;
}

interface StrudelRepl {
  scheduler: StrudelScheduler;
}

interface StrudelModules {
  initAudioOnFirstClick?: () => void;
  getAudioContext?: () => AudioContext | undefined;
  repl: (options: { defaultOutput: unknown; getTime: () => number }) => StrudelRepl;
  webaudioOutput: unknown;
  sound: (pattern: string) => StrudelPattern;
  note: (pattern: string) => StrudelPattern;
  stack: (...patterns: StrudelPattern[]) => StrudelPattern;
}

interface PhaseDiagnostics {
  audioStartAttempts: number;
  audioStarted: boolean;
  toneContextState: string;
  triggerCount: number;
  lastTrigger?: TrackId;
  lastPerformanceAction?: PerformanceAction;
  xyMoves: number;
  lastXY: { x: number; y: number };
}

declare global {
  interface Window {
    __PHASE_DIAGNOSTICS__?: PhaseDiagnostics;
  }
}

function writePhaseDiagnostics(patch: Partial<PhaseDiagnostics>) {
  if (typeof window === "undefined") return;

  const current = window.__PHASE_DIAGNOSTICS__ || {
    audioStartAttempts: 0,
    audioStarted: false,
    toneContextState: "unknown",
    triggerCount: 0,
    xyMoves: 0,
    lastXY: { x: 0, y: 0 },
  };
  const next = { ...current, ...patch };
  window.__PHASE_DIAGNOSTICS__ = next;

  const dataset = document.documentElement.dataset;
  dataset.phaseAudioStartAttempts = String(next.audioStartAttempts);
  dataset.phaseAudioStarted = String(next.audioStarted);
  dataset.phaseToneContextState = next.toneContextState;
  dataset.phaseTriggerCount = String(next.triggerCount);
  dataset.phaseLastTrigger = next.lastTrigger || "";
  dataset.phaseLastPerformanceAction = next.lastPerformanceAction || "";
  dataset.phaseXyMoves = String(next.xyMoves);
  dataset.phaseLastX = String(next.lastXY.x);
  dataset.phaseLastY = String(next.lastXY.y);
}

const NOTE_NAMES: RootNote[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_INTERVALS: Record<ScaleName, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  pentatonic: [0, 3, 5, 7, 10],
};

const DEFAULT_RHYTHM: RhythmEngine = {
  density: 46,
  groove: 10,
  swing: 0,
  probability: 100,
  repeat: 0,
  chaos: 2,
};

const DEFAULT_BASS: BassEngine = {
  root: "D",
  motion: 22,
  acid: 42,
  drive: 34,
  mutation: 6,
  energy: 72,
};

const DEFAULT_SYNTH: SynthEngine = {
  scale: "phrygian",
  mood: "noir",
  tension: 14,
  movement: 12,
  space: 12,
  brightness: 16,
};

const DEFAULT_TEXTURE: TextureEngine = {
  drone: 3,
  noise: 0,
  metallic: 0,
  motion: 6,
  width: 18,
  darkness: 88,
};

const DEFAULT_FX: FxEngine = {
  delay: 5,
  reverb: 6,
  distortion: 8,
  feedback: 4,
  freeze: 0,
  glitch: 0,
};

const TRACK_COLORS: Record<TrackId, string> = {
  KICK: "#a779ff",
  HAT: "#39e7ff",
  PERC: "#c8ff36",
  BASS: "#ff4f91",
  SYNTH: "#78ffe5",
};

const SAMPLE_TRACKS = ["KICK", "HAT", "PERC"] as const;
type SampleTrack = (typeof SAMPLE_TRACKS)[number];
const PRESET_STORAGE_KEY = "phase.presets.v3";
const DEFAULT_LENGTHS: Record<TrackId, number> = { KICK: 16, HAT: 16, PERC: 16, BASS: 16, SYNTH: 16 };
const DEFAULT_VOLUMES: Record<TrackId, number> = { KICK: 0, HAT: -14, PERC: -16, BASS: -5, SYNTH: -17 };
const DEFAULT_BOOLEAN_TRACKS: Record<TrackId, boolean> = { KICK: false, HAT: false, PERC: false, BASS: false, SYNTH: false };
const DEFAULT_EUCLIDEAN: Record<TrackId, EuclideanLane> = {
  KICK: { enabled: false, hits: 4, rotate: 0 },
  HAT: { enabled: false, hits: 9, rotate: 1 },
  PERC: { enabled: false, hits: 5, rotate: 3 },
  BASS: { enabled: false, hits: 4, rotate: 0 },
  SYNTH: { enabled: false, hits: 4, rotate: 2 },
};

const PERFORMANCE_ACTIONS: PerformanceAction[] = ["MORPH", "BUILD", "STRIP", "HOLD", "SHIFT", "FRACTURE", "BURST", "INIT"];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = clamp01((value - inMin) / (inMax - inMin));
  return outMin + (outMax - outMin) * t;
}

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function pickWith<T>(items: readonly T[], random: () => number) {
  return items[Math.floor(random() * items.length)] || items[0];
}

function rootMidi(root: RootNote, octave: number) {
  return 12 * (octave + 1) + NOTE_NAMES.indexOf(root);
}

function midiToNote(midi: number) {
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function scaleNote(root: RootNote, scale: ScaleName, degree: number, octave = 2) {
  const intervals = SCALE_INTERVALS[scale];
  const normalized = ((degree % intervals.length) + intervals.length) % intervals.length;
  const octaveOffset = Math.floor(degree / intervals.length);
  return midiToNote(rootMidi(root, octave + octaveOffset) + intervals[normalized]);
}

function makeStep(active = false, track: TrackId = "KICK", index = 0): Step {
  return {
    active,
    probability: 100,
    repeat: 1,
    velocity: 96,
    note: track === "BASS" ? scaleNote(DEFAULT_BASS.root, DEFAULT_SYNTH.scale, index % 5, 1) : track === "SYNTH" ? scaleNote(DEFAULT_BASS.root, DEFAULT_SYNTH.scale, index % 7, 3) : undefined,
  };
}

function euclid(length: number, hits: number, rotate = 0) {
  const safeLength = Math.max(1, Math.min(STEPS, Math.round(length)));
  const safeHits = Math.max(0, Math.min(safeLength, Math.round(hits)));
  if (safeHits <= 0) return Array.from({ length: safeLength }, () => false);
  if (safeHits >= safeLength) return Array.from({ length: safeLength }, () => true);
  const raw = Array.from({ length: safeLength }, (_, i) => ((i * safeHits) % safeLength) < safeHits);
  return Array.from({ length: safeLength }, (_, i) => raw[(i - rotate + safeLength) % safeLength]);
}

function createPattern(rhythm = DEFAULT_RHYTHM, bass = DEFAULT_BASS, synth = DEFAULT_SYNTH, seed = 0x50484153) {
  const random = seededRandom(seed + rhythm.density * 17 + rhythm.chaos * 31 + bass.motion * 43 + bass.mutation * 59 + synth.movement * 71 + synth.tension * 89);
  const pattern: Record<TrackId, Step[]> = {
    KICK: Array.from({ length: STEPS }, (_, i) => makeStep(i % 4 === 0, "KICK", i)),
    HAT: Array.from({ length: STEPS }, (_, i) => makeStep(i % 4 === 2, "HAT", i)),
    PERC: Array.from({ length: STEPS }, (_, i) => makeStep([5, 13].includes(i), "PERC", i)),
    BASS: Array.from({ length: STEPS }, (_, i) => {
      const strong = [0, 6, 10, 14].includes(i);
      const support = bass.motion > 54 && [3, 15].includes(i) && random() < mapRange(bass.motion, 54, 100, 0.04, 0.24);
      const step = makeStep(strong || support, "BASS", i);
      step.note = scaleNote(bass.root, synth.scale, strong && i === 10 ? 1 : 0, 1);
      step.velocity = strong ? (i === 0 ? 106 : 92) : 68;
      step.repeat = bass.acid > 76 && random() < 0.16 ? 2 : 1;
      return step;
    }),
    SYNTH: Array.from({ length: STEPS }, (_, i) => {
      const active = [6, 14].includes(i) || (synth.movement > 72 && i % 8 === 4) || (synth.movement > 52 && random() < mapRange(synth.movement, 52, 100, 0.01, 0.07));
      const step = makeStep(active, "SYNTH", i);
      step.note = scaleNote(bass.root, synth.scale, i === 14 ? 4 : 2, 3);
      step.velocity = 72;
      step.probability = Math.round(mapRange(rhythm.probability, 0, 100, 48, 100));
      return step;
    }),
  };

  pattern.HAT.forEach((step) => {
    step.probability = Math.round(mapRange(rhythm.probability, 0, 100, 42, 100));
    step.repeat = rhythm.repeat > 64 && random() < 0.36 ? 2 : 1;
  });
  pattern.PERC.forEach((step) => {
    step.probability = Math.round(mapRange(rhythm.probability + rhythm.chaos, 0, 200, 46, 100));
    step.repeat = rhythm.repeat > 36 && random() < rhythm.repeat / 180 ? pickWith([1, 2, 3], random) : 1;
  });
  return pattern;
}

export default function Home() {
  const [pattern, setPattern] = useState<Record<TrackId, Step[]>>(() => createPattern());
  const [playing, setPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [bpm, setBpm] = useState(136);
  const [engineMode, setEngineMode] = useState<EngineMode>("tone");
  const [rhythm, setRhythm] = useState<RhythmEngine>(DEFAULT_RHYTHM);
  const [bass, setBass] = useState<BassEngine>(DEFAULT_BASS);
  const [synth, setSynth] = useState<SynthEngine>(DEFAULT_SYNTH);
  const [texture, setTexture] = useState<TextureEngine>(DEFAULT_TEXTURE);
  const [fx, setFx] = useState<FxEngine>(DEFAULT_FX);
  const [xy, setXy] = useState<XYState>({ x: 0.42, y: 0.3, active: false, held: true });
  const [held, setHeld] = useState(false);
  const [status, setStatus] = useState("PHASE initialized");
  const [lengths, setLengths] = useState<Record<TrackId, number>>(DEFAULT_LENGTHS);
  const [euclidean, setEuclidean] = useState<Record<TrackId, EuclideanLane>>(DEFAULT_EUCLIDEAN);
  const [volumes, setVolumes] = useState<Record<TrackId, number>>(DEFAULT_VOLUMES);
  const [mutes, setMutes] = useState<Record<TrackId, boolean>>(DEFAULT_BOOLEAN_TRACKS);
  const [solos, setSolos] = useState<Record<TrackId, boolean>>(DEFAULT_BOOLEAN_TRACKS);
  const [sampleNames, setSampleNames] = useState<Partial<Record<SampleTrack, string>>>({});
  const [presets, setPresets] = useState<PresetData[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("PHASE MEMORY 01");
  const [dragOverTrack, setDragOverTrack] = useState<SampleTrack | null>(null);

  const rigRef = useRef<AudioRig | null>(null);
  const sequenceRef = useRef<Tone.Sequence<number> | null>(null);
  const strudelSchedulerRef = useRef<StrudelScheduler | null>(null);
  const strudelModulesRef = useRef<StrudelModules | null>(null);
  const transportRunningRef = useRef(false);
  const patternRef = useRef(pattern);
  const rhythmRef = useRef(rhythm);
  const bassRef = useRef(bass);
  const synthRef = useRef(synth);
  const textureRef = useRef(texture);
  const fxRef = useRef(fx);
  const xyRef = useRef(xy);
  const lengthsRef = useRef(lengths);
  const euclideanRef = useRef(euclidean);
  const volumesRef = useRef(volumes);
  const mutesRef = useRef(mutes);
  const solosRef = useRef(solos);
  const samplesRef = useRef<Partial<Record<SampleTrack, SampleEntry>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSampleTrackRef = useRef<SampleTrack | null>(null);

  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { rhythmRef.current = rhythm; applyTransport(); }, [rhythm]);
  useEffect(() => { bassRef.current = bass; applyBassEngine(); rewriteMelodicNotes("BASS"); }, [bass]);
  useEffect(() => { synthRef.current = synth; applySynthEngine(); rewriteMelodicNotes("SYNTH"); }, [synth]);
  useEffect(() => { textureRef.current = texture; applyTextureEngine(); }, [texture]);
  useEffect(() => { fxRef.current = fx; applyFxEngine(); }, [fx]);
  useEffect(() => { xyRef.current = xy; applyXY(xy.x, xy.y); }, [xy]);
  useEffect(() => { Tone.Transport.bpm.value = bpm; }, [bpm]);
  useEffect(() => { lengthsRef.current = lengths; }, [lengths]);
  useEffect(() => { euclideanRef.current = euclidean; }, [euclidean]);
  useEffect(() => {
    volumesRef.current = volumes;
    const rig = rigRef.current;
    if (!rig) return;
    const soloActive = TRACKS.some((track) => solosRef.current[track]);
    TRACKS.forEach((track) => {
      rig.trackVolumes[track].volume.value = volumes[track];
      rig.trackVolumes[track].mute = soloActive ? !solosRef.current[track] : mutesRef.current[track];
    });
  }, [volumes]);
  useEffect(() => {
    mutesRef.current = mutes;
    const rig = rigRef.current;
    if (!rig) return;
    const soloActive = TRACKS.some((track) => solosRef.current[track]);
    TRACKS.forEach((track) => {
      rig.trackVolumes[track].mute = soloActive ? !solosRef.current[track] : mutes[track];
    });
  }, [mutes]);
  useEffect(() => {
    solosRef.current = solos;
    const rig = rigRef.current;
    if (!rig) return;
    const soloActive = TRACKS.some((track) => solos[track]);
    TRACKS.forEach((track) => {
      rig.trackVolumes[track].mute = soloActive ? !solos[track] : mutesRef.current[track];
    });
  }, [solos]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as PresetData[];
      if (Array.isArray(parsed)) {
        queueMicrotask(() => {
          setPresets(parsed);
          setSelectedPresetId(parsed[0]?.id || "");
        });
      }
    } catch {
      queueMicrotask(() => setStatus("Preset memory unavailable"));
    }
  }, []);

  useEffect(() => {
    writePhaseDiagnostics({
      audioStartAttempts: 0,
      audioStarted: false,
      toneContextState: Tone.context.state,
      triggerCount: 0,
      xyMoves: 0,
      lastXY: { x: xyRef.current.x, y: xyRef.current.y },
    });

    const sampleEntries = samplesRef.current;
    return () => {
      stopTone();
      try { strudelSchedulerRef.current?.stop?.(); } catch {}
      Object.values(sampleEntries).forEach((entry) => {
        try { entry?.player.dispose(); } catch {}
        if (entry?.url) URL.revokeObjectURL(entry.url);
      });
      disposeRig();
    };
  }, []);

  const engineReadout = useMemo(() => {
    const heat = Math.round((rhythm.density + bass.energy + synth.tension + fx.distortion) / 4);
    const space = Math.round((synth.space + texture.width + fx.reverb + xy.y * 100) / 4);
    return { heat, space };
  }, [rhythm.density, bass.energy, synth.tension, fx.distortion, synth.space, texture.width, fx.reverb, xy.y]);

  function applyTransport() {
    Tone.Transport.swing = mapRange(rhythmRef.current.swing, 0, 100, 0, 0.38);
    Tone.Transport.swingSubdivision = "16n";
  }

  function disposeRig() {
    const rig = rigRef.current;
    if (!rig) return;
    Object.values(rig.trackVolumes).forEach((node) => { try { node.dispose(); } catch {} });
    Object.values(rig).forEach((node) => {
      if (node && typeof node === "object" && "dispose" in node) {
        try { (node as { dispose: () => void }).dispose(); } catch {}
      }
    });
    rigRef.current = null;
  }

  function hasSolo() {
    return TRACKS.some((track) => solosRef.current[track]);
  }

  function isTrackAudible(track: TrackId) {
    const soloActive = hasSolo();
    return soloActive ? solosRef.current[track] : !mutesRef.current[track];
  }

  function applyMixerState() {
    const rig = rigRef.current;
    if (!rig) return;
    const soloActive = hasSolo();
    TRACKS.forEach((track) => {
      const node = rig.trackVolumes[track];
      node.volume.value = volumesRef.current[track];
      node.mute = soloActive ? !solosRef.current[track] : mutesRef.current[track];
    });
  }

  function ensureRig() {
    if (rigRef.current) return rigRef.current;

    const volume = new Tone.Volume(-4).toDestination();
    const drive = new Tone.Distortion({ distortion: 0.035, wet: 0.025 });
    const delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.035, wet: 0.015 });
    const reverb = new Tone.Reverb({ decay: 1.25, wet: 0.025 });
    drive.connect(delay);
    delay.connect(reverb);
    reverb.connect(volume);

    const makeVolume = (track: TrackId, db: number) => new Tone.Volume(db).connect(drive);
    const trackVolumes: Record<TrackId, Tone.Volume> = {
      KICK: makeVolume("KICK", volumesRef.current.KICK),
      HAT: makeVolume("HAT", volumesRef.current.HAT),
      PERC: makeVolume("PERC", volumesRef.current.PERC),
      BASS: makeVolume("BASS", volumesRef.current.BASS),
      SYNTH: makeVolume("SYNTH", volumesRef.current.SYNTH),
    };

    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.013,
      octaves: 9.5,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.19, sustain: 0, release: 0.018 },
    }).connect(trackVolumes.KICK);

    const hatFilter = new Tone.Filter({ type: "highpass", frequency: 7200, Q: 0.28 }).connect(trackVolumes.HAT);
    const hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.026, sustain: 0, release: 0.008 },
    }).connect(hatFilter);

    const percFilter = new Tone.Filter({ type: "bandpass", frequency: 720, Q: 5.2 }).connect(trackVolumes.PERC);
    const perc = new Tone.MembraneSynth({
      pitchDecay: 0.006,
      octaves: 2.4,
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.052, sustain: 0, release: 0.012 },
    }).connect(percFilter);

    const bassFilter = new Tone.Filter({ type: "lowpass", frequency: 620, rolloff: -24, Q: 1.7 });
    const bassDrive = new Tone.Distortion({ distortion: 0.16, wet: 0.22 });
    bassDrive.connect(bassFilter);
    bassFilter.connect(trackVolumes.BASS);
    const bassVoice = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.001, decay: 0.075, sustain: 0.18, release: 0.04 },
      filter: { type: "lowpass", Q: 2.4, rolloff: -24 },
      filterEnvelope: { attack: 0.001, decay: 0.085, sustain: 0.03, release: 0.035, baseFrequency: 42, octaves: 2.35 },
      portamento: 0.006,
    }).connect(bassDrive);

    const synthFilter = new Tone.Filter({ type: "lowpass", frequency: 980, rolloff: -24, Q: 0.55 }).connect(trackVolumes.SYNTH);
    const synthVoice = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.018, decay: 0.24, sustain: 0.035, release: 0.32 },
    }).connect(synthFilter);

    const textureGain = new Tone.Gain(0).connect(drive);
    const textureFilter = new Tone.Filter({ type: "lowpass", frequency: 140, Q: 0.25, rolloff: -24 }).connect(textureGain);
    const textureDrone = new Tone.Oscillator({ frequency: 55, type: "sine" }).connect(textureFilter).start();
    const textureNoise = new Tone.Noise({ type: "brown" }).connect(textureFilter).start();

    rigRef.current = {
      kick,
      hat,
      hatFilter,
      perc,
      percFilter,
      bass: bassVoice,
      bassFilter,
      bassDrive,
      synth: synthVoice,
      synthFilter,
      textureDrone,
      textureNoise,
      textureGain,
      textureFilter,
      delay,
      reverb,
      drive,
      volume,
      trackVolumes,
    };

    applyBassEngine();
    applySynthEngine();
    applyTextureEngine();
    applyFxEngine();
    applyXY(xyRef.current.x, xyRef.current.y);
    applyMixerState();
    return rigRef.current;
  }

  function applyBassEngine() {
    const rig = rigRef.current;
    if (!rig) return;
    const next = bassRef.current;
    rig.bassFilter.frequency.value = mapRange(next.energy, 0, 100, 160, 1850);
    rig.bassFilter.Q.value = mapRange(next.acid, 0, 100, 0.9, 7.6);
    rig.bassDrive.distortion = mapRange(next.drive, 0, 100, 0.04, 0.68);
    rig.bassDrive.wet.value = mapRange(next.drive, 0, 100, 0.1, 0.55);
    rig.bass.portamento = mapRange(next.acid + next.motion * 0.25, 0, 125, 0.001, 0.095);
  }

  function applySynthEngine() {
    const rig = rigRef.current;
    if (!rig) return;
    const next = synthRef.current;
    const x = xyRef.current.x;
    rig.synthFilter.frequency.value = mapRange(next.brightness * 0.7 + x * 100 * 0.5, 0, 120, 420, 5200);
    rig.synthFilter.Q.value = mapRange(next.tension, 0, 100, 0.35, 2.4);
    rig.trackVolumes.SYNTH.volume.value = mapRange(next.mood === "aerial" ? next.space : next.tension, 0, 100, -19, -9);
  }

  function applyTextureEngine() {
    const rig = rigRef.current;
    if (!rig) return;
    const next = textureRef.current;
    const freq = mapRange(100 - next.darkness + next.metallic * 0.15, 0, 115, 65, 520);
    rig.textureFilter.frequency.value = freq;
    rig.textureFilter.Q.value = mapRange(next.metallic, 0, 100, 0.18, 0.9);
    rig.textureGain.gain.value = transportRunningRef.current ? mapRange(next.drone * 0.18 + next.noise * 0.08, 0, 100, 0, 0.0018) : 0;
    rig.textureDrone.frequency.value = Tone.Frequency(`${bassRef.current.root}1`).toFrequency() * mapRange(next.motion, 0, 100, 0.36, 0.72);
    rig.textureNoise.type = "brown";
  }

  function applyFxEngine() {
    const rig = rigRef.current;
    if (!rig) return;
    const next = fxRef.current;
    rig.delay.wet.value = mapRange(next.delay, 0, 100, 0, 0.24);
    rig.delay.feedback.value = mapRange(next.feedback + next.freeze, 0, 200, 0.025, 0.58);
    rig.reverb.wet.value = mapRange(next.reverb + next.freeze * 0.45, 0, 145, 0.01, 0.38);
    rig.reverb.decay = mapRange(next.reverb + next.freeze, 0, 200, 0.7, 6.5);
    rig.drive.distortion = mapRange(next.distortion, 0, 100, 0.015, 0.42);
    rig.drive.wet.value = mapRange(next.distortion, 0, 100, 0.02, 0.28);
  }

  function restoreRunningFxAndTexture() {
    const rig = rigRef.current;
    if (!rig) return;

    const nextFx = fxRef.current;
    const nextTexture = textureRef.current;
    rig.delay.feedback.value = mapRange(nextFx.feedback + nextFx.freeze, 0, 200, 0.025, 0.58);
    rig.delay.wet.value = mapRange(nextFx.delay, 0, 100, 0, 0.24);
    rig.reverb.wet.value = mapRange(nextFx.reverb + nextFx.freeze * 0.45, 0, 145, 0.01, 0.38);
    rig.drive.wet.value = mapRange(nextFx.distortion, 0, 100, 0.02, 0.28);
    rig.textureGain.gain.value = transportRunningRef.current ? mapRange(nextTexture.drone * 0.18 + nextTexture.noise * 0.08, 0, 100, 0, 0.0018) : 0;
  }

  function applyXY(x: number, y: number) {
    const rig = rigRef.current;
    if (!rig) return;
    rig.synthFilter.frequency.value = mapRange(x, 0, 1, 420, 5600);
    rig.hatFilter.frequency.value = mapRange(x, 0, 1, 5600, 9800);
    rig.textureFilter.frequency.value = mapRange(x, 0, 1, 70, 520);
    rig.delay.wet.value = mapRange(y, 0, 1, 0.003, 0.18);
    rig.reverb.wet.value = mapRange(y, 0, 1, 0.006, 0.24);
  }

  function rewriteMelodicNotes(track: "BASS" | "SYNTH") {
    setPattern((prev) => ({
      ...prev,
      [track]: prev[track].map((step, index) => ({
        ...step,
        note: track === "BASS"
          ? scaleNote(bassRef.current.root, synthRef.current.scale, index === 10 ? 1 : 0, 1)
          : scaleNote(bassRef.current.root, synthRef.current.scale, index === 14 ? 4 : 2 + Math.round(synthRef.current.tension / 48), 3),
      })),
    }));
  }

  function triggerTrack(track: TrackId, step: Step, index: number, time: number) {
    const rig = rigRef.current;
    if (!rig || !step.active) return;
    if (!isTrackAudible(track)) return;
    if (!held && Math.random() * 100 > step.probability * (rhythmRef.current.probability / 100)) return;

    writePhaseDiagnostics({
      triggerCount: (window.__PHASE_DIAGNOSTICS__?.triggerCount || 0) + 1,
      lastTrigger: track,
      toneContextState: Tone.context.state,
    });

    const velocity = mapRange(step.velocity, 0, 127, 0.05, 1);
    const repeats = Math.max(1, Math.min(4, step.repeat || 1));
    const repeatWindow = Tone.Time("16n").toSeconds();

    for (let r = 0; r < repeats; r += 1) {
      const t = time + (repeatWindow / repeats) * r;
      if (fxRef.current.glitch > 68 && Math.random() < fxRef.current.glitch / 220) continue;
      applyStepLocks(track, step, t);
      const sample = SAMPLE_TRACKS.includes(track as SampleTrack) ? samplesRef.current[track as SampleTrack] : undefined;
      if (sample) {
        try {
          sample.player.volume.setValueAtTime(Tone.gainToDb(Math.max(0.05, velocity)), t);
          sample.player.start(t);
          continue;
        } catch {}
      }
      if (track === "KICK") rig.kick.triggerAttackRelease("C1", "32n", t, velocity * 1.08);
      if (track === "HAT") rig.hat.triggerAttackRelease("64n", t, velocity * 0.34);
      if (track === "PERC") {
        const notes = ["A#1", "C2", "D#2", "F2"];
        rig.perc.triggerAttackRelease(notes[index % notes.length], "64n", t, velocity * 0.46);
      }
      if (track === "BASS") {
        const gate = bassRef.current.acid > 64 ? "32n" : bassRef.current.energy > 66 ? "16n" : "32n";
        rig.bass.triggerAttackRelease(step.note || `${bassRef.current.root}1`, gate, t, velocity * 0.98);
      }
      if (track === "SYNTH") {
        const root = step.note || scaleNote(bassRef.current.root, synthRef.current.scale, index, 3);
        const chord = synthRef.current.tension > 72 ? [root, Tone.Frequency(root).transpose(3).toNote(), Tone.Frequency(root).transpose(10).toNote()] : [root, Tone.Frequency(root).transpose(7).toNote()];
        rig.synth.triggerAttackRelease(chord, synthRef.current.space > 68 ? "8n" : "16n", t, velocity * 0.22);
      }
    }
  }

  function applyStepLocks(track: TrackId, step: Step, time: number) {
    const rig = rigRef.current;
    if (!rig || !step.locks) return;
    const { tone, space, drive } = step.locks;
    try {
      if (track === "PERC") {
        if (typeof tone === "number") {
          rig.percFilter.frequency.setValueAtTime(mapRange(tone, 0, 100, 180, 4200), time);
          rig.percFilter.Q.setValueAtTime(mapRange(tone, 0, 100, 0.6, 7), time);
        }
      }
      if (track === "BASS") {
        if (typeof tone === "number") rig.bassFilter.frequency.setValueAtTime(mapRange(tone, 0, 100, 140, 3800), time);
        if (typeof drive === "number") {
          rig.bassDrive.distortion = mapRange(drive, 0, 100, 0.02, 0.82);
          rig.bassDrive.wet.setValueAtTime(mapRange(drive, 0, 100, 0.08, 0.7), time);
        }
      }
      if (track === "SYNTH") {
        if (typeof tone === "number") rig.synthFilter.frequency.setValueAtTime(mapRange(tone, 0, 100, 440, 9800), time);
        if (typeof drive === "number") {
          rig.drive.distortion = mapRange(drive, 0, 100, 0.02, 0.62);
          rig.drive.wet.setValueAtTime(mapRange(drive, 0, 100, 0.04, 0.52), time);
        }
      }
      if (typeof space === "number") {
        rig.delay.wet.setValueAtTime(mapRange(space, 0, 100, 0.02, 0.64), time);
        rig.reverb.wet.setValueAtTime(mapRange(space, 0, 100, 0.04, 0.78), time);
      }
    } catch {}
  }

  async function loadStrudelModules() {
    if (strudelModulesRef.current) return strudelModulesRef.current;
    if (typeof window === "undefined") return null;
    const core = await import("@strudel/core");
    const webaudio = await import("@strudel/webaudio");
    strudelModulesRef.current = { ...core, ...webaudio } as StrudelModules;
    return strudelModulesRef.current;
  }

  function strudelMiniFor(track: TrackId) {
    const length = lengthsRef.current[track] || STEPS;
    return patternRef.current[track].slice(0, length).map((step) => (step.active ? (track === "KICK" ? "bd" : track === "HAT" ? "hh" : track === "PERC" ? "rim" : step.note?.toLowerCase() || "d1") : "~")).join(" ");
  }

  async function playStrudel() {
    const strudel = await loadStrudelModules();
    if (!strudel) return;
    try {
      strudel.initAudioOnFirstClick?.();
      const ctx = strudel.getAudioContext?.();
      const repl = strudel.repl({
        defaultOutput: strudel.webaudioOutput,
        getTime: () => ctx?.currentTime ?? 0,
      });
      strudelSchedulerRef.current = repl.scheduler;
      const S = strudel.sound;
      const N = strudel.note;
      const Stack = strudel.stack;
      repl.scheduler.setPattern(Stack(
        S(strudelMiniFor("KICK")).gain(1.02).distort(mapRange(fxRef.current.distortion, 0, 100, 0.03, 0.42)),
        S(strudelMiniFor("HAT")).gain(0.22).hpf(mapRange(xyRef.current.x, 0, 1, 5200, 9800)),
        S(strudelMiniFor("PERC")).gain(0.24).room(mapRange(fxRef.current.reverb, 0, 100, 0, 0.34)),
        N(strudelMiniFor("BASS")).s("sawtooth").gain(0.62).lpf(mapRange(bassRef.current.energy, 0, 100, 180, 1900)).lpq(mapRange(bassRef.current.acid, 0, 100, 2, 12)),
        N(strudelMiniFor("SYNTH")).s("triangle").gain(0.15).room(mapRange(synthRef.current.space, 0, 100, 0.02, 0.34)).delay(mapRange(fxRef.current.delay, 0, 100, 0, 0.24))
      ));
      repl.scheduler.start();
      transportRunningRef.current = true;
      setPlaying(true);
      setStatus("Strudel engine playing");
    } catch (error) {
      console.error(error);
      setStatus("Strudel engine failed");
    }
  }

  async function togglePlay() {
    if (engineMode === "strudel") {
      if (playing) {
        stopTone();
      } else {
        await playStrudel();
      }
      return;
    }

    if (playing) {
      stopTone();
      return;
    }

    writePhaseDiagnostics({
      audioStartAttempts: (window.__PHASE_DIAGNOSTICS__?.audioStartAttempts || 0) + 1,
    });
    await Tone.start();
    writePhaseDiagnostics({
      audioStarted: Tone.context.state === "running",
      toneContextState: Tone.context.state,
    });
    ensureRig();
    transportRunningRef.current = true;
    restoreRunningFxAndTexture();
    applyTransport();
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.bpm.value = bpm;
    sequenceRef.current?.dispose();
    sequenceRef.current = new Tone.Sequence((time, index) => {
      const phaseOffset = Math.round(mapRange(rhythmRef.current.groove, 0, 100, 0, 3));
      const stepIndex = (index + phaseOffset) % STEPS;
      setActiveStep(stepIndex);
      TRACKS.forEach((track) => {
        const length = Math.max(1, Math.min(STEPS, lengthsRef.current[track] || STEPS));
        const laneStep = stepIndex % length;
        triggerTrack(track, patternRef.current[track][laneStep], laneStep, time);
      });
      maybeChaos(stepIndex);
    }, Array.from({ length: STEPS }, (_, i) => i), "16n");
    sequenceRef.current.start(0);
    Tone.Transport.start("+0.04");
    applyTextureEngine();
    applyFxEngine();
    setPlaying(true);
    setStatus("Tone scheduler locked");
  }

  function stopTone() {
    const now = Tone.now();
    transportRunningRef.current = false;

    try { strudelSchedulerRef.current?.stop(); } catch {}
    try { Tone.Transport.stop(); } catch {}
    try { Tone.Transport.cancel(); } catch {}
    try { sequenceRef.current?.stop(); } catch {}
    try { sequenceRef.current?.dispose(); } catch {}
    sequenceRef.current = null;

    Object.values(samplesRef.current).forEach((entry) => {
      try { entry?.player.stop(); } catch {}
    });

    const rig = rigRef.current;
    if (rig) {
      try { rig.kick.triggerRelease(now); } catch {}
      try { rig.hat.triggerRelease(now); } catch {}
      try { rig.perc.triggerRelease(now); } catch {}
      try { rig.bass.triggerRelease(now); } catch {}
      try { rig.synth.releaseAll(now); } catch {}

      try {
        rig.delay.feedback.cancelScheduledValues(now);
        rig.delay.feedback.setValueAtTime(0, now);
      } catch {
        rig.delay.feedback.value = 0;
      }
      try {
        rig.delay.wet.cancelScheduledValues(now);
        rig.delay.wet.setValueAtTime(0, now);
      } catch {
        rig.delay.wet.value = 0;
      }
      try {
        rig.reverb.wet.cancelScheduledValues(now);
        rig.reverb.wet.setValueAtTime(0, now);
      } catch {
        rig.reverb.wet.value = 0;
      }
      try {
        rig.drive.wet.cancelScheduledValues(now);
        rig.drive.wet.setValueAtTime(0, now);
      } catch {
        rig.drive.wet.value = 0;
      }
      try {
        rig.textureGain.gain.cancelScheduledValues(now);
        rig.textureGain.gain.setValueAtTime(0, now);
      } catch {
        rig.textureGain.gain.value = 0;
      }
    }

    setPlaying(false);
    setActiveStep(-1);
    setStatus("Transport stopped");
  }

  function maybeChaos(stepIndex: number) {
    const chaos = rhythmRef.current.chaos + fxRef.current.glitch * 0.35;
    if (held || chaos < 18 || Math.random() > chaos / 850) return;
    setPattern((prev) => ({
      ...prev,
      PERC: prev.PERC.map((step, i) => (i === stepIndex ? { ...step, active: !step.active } : step)),
      HAT: prev.HAT.map((step, i) => (i === (stepIndex + 2) % STEPS && Math.random() < 0.35 ? { ...step, active: !step.active } : step)),
    }));
  }

  function toggleStep(track: TrackId, index: number) {
    setPattern((prev) => ({
      ...prev,
      [track]: prev[track].map((step, i) => (i === index ? { ...step, active: !step.active } : step)),
    }));
  }

  function cycleStep(track: TrackId, index: number, event: React.MouseEvent) {
    event.preventDefault();
    setPattern((prev) => ({
      ...prev,
      [track]: prev[track].map((step, i) => {
        if (i !== index) return step;
        if (event.shiftKey) return { ...step, velocity: step.velocity > 72 ? 56 : 112, active: true };
        return { ...step, repeat: step.repeat >= 4 ? 1 : step.repeat + 1, probability: step.probability <= 50 ? 100 : step.probability - 25, active: true };
      }),
    }));
  }

  function nudgeNote(track: "BASS" | "SYNTH", index: number, direction: number) {
    setPattern((prev) => ({
      ...prev,
      [track]: prev[track].map((step, i) => i === index ? {
        ...step,
        active: true,
        note: scaleNote(bass.root, synth.scale, i + direction + (track === "SYNTH" ? Math.round(synth.tension / 24) : Math.round(bass.mutation / 32)), track === "BASS" ? 1 : 3),
      } : step),
    }));
  }

  function regenerate(nextRhythm = rhythm, nextBass = bass, nextSynth = synth) {
    setPattern(createPattern(nextRhythm, nextBass, nextSynth));
    setStatus("Pattern regenerated");
  }

  function updateEngine<T extends object>(setter: React.Dispatch<React.SetStateAction<T>>, key: keyof T, value: T[keyof T]) {
    setter((prev) => ({ ...prev, [key]: value }));
  }

  function setTrackLength(track: TrackId, value: number) {
    const length = Math.max(1, Math.min(STEPS, Math.round(value)));
    setLengths((prev) => ({ ...prev, [track]: length }));
    setEuclidean((prev) => ({
      ...prev,
      [track]: {
        ...prev[track],
        hits: Math.min(prev[track].hits, length),
        rotate: prev[track].rotate % length,
      },
    }));
  }

  function applyEuclidean(track: TrackId, lane = euclideanRef.current[track]) {
    const length = lengthsRef.current[track] || STEPS;
    const hits = Math.max(0, Math.min(length, lane.hits));
    const rotate = Math.max(0, Math.min(length - 1, lane.rotate));
    const hitsPattern = euclid(length, hits, rotate);
    setPattern((prev) => ({
      ...prev,
      [track]: prev[track].map((step, index) => ({
        ...step,
        active: index < length ? hitsPattern[index] : false,
      })),
    }));
  }

  function updateEuclidean(track: TrackId, patch: Partial<EuclideanLane>) {
    setEuclidean((prev) => {
      const length = lengthsRef.current[track] || STEPS;
      const nextLane = {
        ...prev[track],
        ...patch,
      };
      nextLane.hits = Math.max(0, Math.min(length, Math.round(nextLane.hits)));
      nextLane.rotate = Math.max(0, Math.min(length - 1, Math.round(nextLane.rotate)));
      const next = { ...prev, [track]: nextLane };
      euclideanRef.current = next;
      if (nextLane.enabled) setTimeout(() => applyEuclidean(track, nextLane), 0);
      return next;
    });
  }

  function cycleStepLock(track: TrackId, index: number) {
    setPattern((prev) => ({
      ...prev,
      [track]: prev[track].map((step, i) => {
        if (i !== index) return step;
        if (step.locks?.tone !== undefined && step.locks.space !== undefined && step.locks.drive !== undefined) {
          return { ...step, locks: undefined };
        }
        if (step.locks?.tone !== undefined && step.locks.space !== undefined) {
          return { ...step, active: true, locks: { ...step.locks, drive: Math.round(mapRange(Math.random(), 0, 1, 24, 84)) } };
        }
        if (step.locks?.tone !== undefined) {
          return { ...step, active: true, locks: { ...step.locks, space: Math.round(mapRange(Math.random(), 0, 1, 18, 92)) } };
        }
        return { ...step, active: true, locks: { tone: Math.round(mapRange(Math.random(), 0, 1, 12, 96)) } };
      }),
    }));
  }

  function randomizeLocks() {
    setPattern((prev) => Object.fromEntries(TRACKS.map((track) => [track, prev[track].map((step, index) => {
      if (!step.active || !["PERC", "BASS", "SYNTH"].includes(track) || index >= lengthsRef.current[track]) return step;
      if (Math.random() > 0.34) return { ...step, locks: undefined };
      return {
        ...step,
        locks: {
          tone: Math.round(mapRange(Math.random(), 0, 1, 8, 96)),
          space: Math.round(mapRange(Math.random(), 0, 1, 0, 94)),
          drive: Math.round(mapRange(Math.random(), 0, 1, 0, 86)),
        },
      };
    })])) as Record<TrackId, Step[]>);
  }

  function clearLocks() {
    setPattern((prev) => Object.fromEntries(TRACKS.map((track) => [track, prev[track].map((step) => ({ ...step, locks: undefined }))])) as Record<TrackId, Step[]>);
  }

  function toggleMute(track: TrackId) {
    setMutes((prev) => ({ ...prev, [track]: !prev[track] }));
  }

  function toggleSolo(track: TrackId) {
    setSolos((prev) => ({ ...prev, [track]: !prev[track] }));
  }

  function persistPresets(next: PresetData[]) {
    setPresets(next);
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
  }

  function savePreset() {
    const id = selectedPresetId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`);
    const name = presetName.trim() || "PHASE MEMORY";
    const preset: PresetData = {
      id,
      name,
      createdAt: Date.now(),
      pattern,
      bpm,
      engineMode,
      rhythm,
      bass,
      synth,
      texture,
      fx,
      xy,
      lengths,
      euclidean,
      volumes,
      mutes,
      solos,
      sampleNames,
    };
    const next = presets.some((item) => item.id === id)
      ? presets.map((item) => item.id === id ? preset : item)
      : [preset, ...presets];
    persistPresets(next);
    setSelectedPresetId(id);
    setPresetName(name);
    setStatus(`Saved ${name}`);
  }

  function loadPreset(id = selectedPresetId) {
    const preset = presets.find((item) => item.id === id);
    if (!preset) {
      setStatus("Select a memory first");
      return;
    }
    setPattern(preset.pattern);
    setBpm(preset.bpm);
    setEngineMode(preset.engineMode || "tone");
    setRhythm(preset.rhythm);
    setBass(preset.bass);
    setSynth(preset.synth);
    setTexture(preset.texture);
    setFx(preset.fx);
    setXy(preset.xy);
    setLengths(preset.lengths || DEFAULT_LENGTHS);
    setEuclidean(preset.euclidean || DEFAULT_EUCLIDEAN);
    setVolumes(preset.volumes || DEFAULT_VOLUMES);
    setMutes(preset.mutes || DEFAULT_BOOLEAN_TRACKS);
    setSolos(preset.solos || DEFAULT_BOOLEAN_TRACKS);
    setSampleNames(preset.sampleNames || {});
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    setStatus(`Loaded ${preset.name}`);
  }

  function deletePreset() {
    const next = presets.filter((item) => item.id !== selectedPresetId);
    persistPresets(next);
    setSelectedPresetId(next[0]?.id || "");
    setPresetName(next[0]?.name || "PHASE MEMORY 01");
    setStatus("Memory deleted");
  }

  function openSample(track: SampleTrack) {
    pendingSampleTrackRef.current = track;
    fileInputRef.current?.click();
  }

  function isAudioFile(file: File) {
    return file.type.startsWith("audio/") || /\.(wav|aif|aiff|mp3|m4a|ogg|flac)$/i.test(file.name);
  }

  async function loadSample(track: SampleTrack, file: File) {
    if (!isAudioFile(file)) return;
    await Tone.start();
    const rig = ensureRig();
    const previous = samplesRef.current[track];
    if (previous) {
      try { previous.player.dispose(); } catch {}
      URL.revokeObjectURL(previous.url);
    }
    const url = URL.createObjectURL(file);
    const player = new Tone.Player({ url, loop: false }).connect(rig.trackVolumes[track]);
    await Tone.loaded();
    samplesRef.current[track] = { player, url, name: file.name };
    setSampleNames((prev) => ({ ...prev, [track]: file.name }));
    setStatus(`${track} sample loaded`);
  }

  async function handleSampleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const track = pendingSampleTrackRef.current;
    if (file && track) await loadSample(track, file);
    event.target.value = "";
  }

  async function handleSampleDrop(event: React.DragEvent<HTMLElement>, track: SampleTrack) {
    event.preventDefault();
    setDragOverTrack(null);
    const file = event.dataTransfer.files?.[0];
    if (file) await loadSample(track, file);
  }

  function removeSample(track: SampleTrack) {
    const current = samplesRef.current[track];
    if (current) {
      try { current.player.dispose(); } catch {}
      URL.revokeObjectURL(current.url);
      delete samplesRef.current[track];
    }
    setSampleNames((prev) => {
      const next = { ...prev };
      delete next[track];
      return next;
    });
    setStatus(`${track} sample removed`);
  }

  function perform(action: PerformanceAction) {
    writePhaseDiagnostics({ lastPerformanceAction: action });

    if (action === "INIT") {
      setRhythm(DEFAULT_RHYTHM);
      setBass(DEFAULT_BASS);
      setSynth(DEFAULT_SYNTH);
      setTexture(DEFAULT_TEXTURE);
      setFx(DEFAULT_FX);
      setHeld(false);
      setXy({ x: 0.56, y: 0.42, active: false, held: true });
      setPattern(createPattern());
      setStatus("INIT recalled");
      return;
    }

    if (action === "HOLD") {
      setHeld((next) => !next);
      setStatus(!held ? "HOLD engaged" : "HOLD released");
      return;
    }

    if (action === "BUILD") {
      const nextRhythm = { ...rhythm, density: clamp(rhythm.density + 14), probability: clamp(rhythm.probability + 8), repeat: clamp(rhythm.repeat + 12) };
      const nextBass = { ...bass, energy: clamp(bass.energy + 12), drive: clamp(bass.drive + 8) };
      setRhythm(nextRhythm);
      setBass(nextBass);
      regenerate(nextRhythm, nextBass, synth);
    }

    if (action === "STRIP") {
      setPattern((prev) => ({
        ...prev,
        HAT: prev.HAT.map((step, i) => ({ ...step, active: i % 4 === 1 })),
        PERC: prev.PERC.map((step, i) => ({ ...step, active: i === 6 || i === 13 })),
        SYNTH: prev.SYNTH.map((step, i) => ({ ...step, active: i % 8 === 0 })),
      }));
      setStatus("Arrangement stripped");
    }

    if (action === "MORPH") {
      const nextBass = { ...bass, mutation: clamp(bass.mutation + 22), acid: clamp(bass.acid + 18), root: pick(NOTE_NAMES) };
      const nextSynth = { ...synth, scale: pick(Object.keys(SCALE_INTERVALS) as ScaleName[]), mood: pick(["noir", "hypnotic", "acid", "ritual", "aerial"] as const), tension: clamp(synth.tension + 12) };
      setBass(nextBass);
      setSynth(nextSynth);
      regenerate(rhythm, nextBass, nextSynth);
    }

    if (action === "SHIFT") {
      setPattern((prev) => Object.fromEntries(TRACKS.map((track, row) => {
        const amount = row + 1;
        const lane = prev[track];
        return [track, lane.map((_, i) => lane[(i - amount + STEPS) % STEPS])];
      })) as Record<TrackId, Step[]>);
      setStatus("Sequence shifted");
    }

    if (action === "FRACTURE") {
      setPattern((prev) => ({
        ...prev,
        HAT: prev.HAT.map((step, i) => ({ ...step, active: step.active || (i % 2 === 1 && Math.random() < 0.45), repeat: pick([1, 2, 3]) })),
        PERC: prev.PERC.map((step) => ({ ...step, active: Math.random() < 0.5 ? !step.active : step.active, repeat: pick([1, 1, 2, 4]) })),
      }));
      setFx((prev) => ({ ...prev, glitch: clamp(prev.glitch + 24), feedback: clamp(prev.feedback + 14) }));
      setStatus("FRACTURE injected");
    }

    if (action === "BURST") {
      setPattern((prev) => ({
        ...prev,
        KICK: prev.KICK.map((step, i) => ({ ...step, active: step.active || i === 14 })),
        BASS: prev.BASS.map((step, i) => ({ ...step, active: step.active || [3, 7, 11, 15].includes(i), repeat: i % 4 === 3 ? 2 : step.repeat })),
      }));
      setFx((prev) => ({ ...prev, delay: clamp(prev.delay + 18), distortion: clamp(prev.distortion + 12) }));
      setStatus("BURST armed");
    }
  }

  function handlePad(e: React.PointerEvent<HTMLElement>, active = true) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01(1 - (e.clientY - rect.top) / rect.height);
    writePhaseDiagnostics({
      xyMoves: (window.__PHASE_DIAGNOSTICS__?.xyMoves || 0) + 1,
      lastXY: { x, y },
    });
    setXy((prev) => ({ ...prev, x, y, active }));
    setSynth((prev) => ({ ...prev, brightness: Math.round(mapRange(x, 0, 1, 12, 96)), space: Math.round(mapRange(y, 0, 1, 8, 96)) }));
    setFx((prev) => ({ ...prev, delay: Math.round(mapRange(y, 0, 1, 8, 82)), reverb: Math.round(mapRange(y, 0, 1, 10, 94)) }));
  }

  function releasePad(e: React.PointerEvent<HTMLElement>) {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    setXy((prev) => prev.held ? { ...prev, active: false } : { ...prev, x: 0.5, y: 0.35, active: false });
  }

  return (
    <main className="phase-shell">
      <style>{`
        .engine-card {
          min-width: 0;
          padding: 18px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.018)),
            radial-gradient(circle at 50% -18%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 48%),
            rgba(4, 5, 12, 0.86);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.09),
            inset 0 -1px 0 rgba(0, 0, 0, 0.62),
            0 14px 34px rgba(0, 0, 0, 0.3);
        }

        .engine-card h2 {
          margin: 0 0 15px;
          color: #edf8ff;
          font-size: 13px;
          line-height: 1.1;
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }

        .engine-bank {
          display: grid;
          grid-template-columns: repeat(3, minmax(280px, 1fr));
          gap: 18px;
          align-items: stretch;
        }

        .engine-card .engine-controls {
          display: grid;
          grid-template-columns: repeat(3, minmax(108px, 1fr));
          gap: 14px;
          align-items: stretch;
        }

        .rotary-knob {
          position: relative;
          min-width: 0;
          min-height: 174px;
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 9px;
          justify-items: center;
          align-items: center;
          padding: 14px 12px 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 7px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.018)),
            radial-gradient(circle at 50% -20%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 58%),
            rgba(0, 0, 0, 0.3);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 -16px 28px rgba(0, 0, 0, 0.28);
          cursor: ns-resize;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          outline: none;
          overflow: hidden;
        }

        .rotary-knob::before {
          content: "";
          position: absolute;
          inset: 8px;
          border-radius: 6px;
          background:
            radial-gradient(circle at 50% 44%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(0, 0, 0, 0.04));
          opacity: 0.9;
          pointer-events: none;
        }

        .rotary-knob::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent);
          pointer-events: none;
        }

        .rotary-knob:hover,
        .rotary-knob:focus-visible {
          border-color: color-mix(in srgb, var(--accent) 54%, rgba(255, 255, 255, 0.16));
          box-shadow:
            0 0 22px color-mix(in srgb, var(--accent) 20%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            inset 0 -16px 28px rgba(0, 0, 0, 0.28);
        }

        .rotary-knob.disabled {
          opacity: 0.48;
          cursor: not-allowed;
        }

        .rotary-label,
        .rotary-face,
        .rotary-value {
          position: relative;
          z-index: 1;
        }

        .rotary-label {
          width: 100%;
          color: rgba(237, 248, 255, 0.72);
          font-size: 11px;
          line-height: 1.2;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          text-align: center;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .rotary-face {
          width: min(112px, 100%);
          aspect-ratio: 1;
          filter: drop-shadow(0 0 12px color-mix(in srgb, var(--accent) 20%, transparent));
        }

        .rotary-ring-track {
          fill: none;
          stroke: rgba(255, 255, 255, 0.13);
          stroke-width: 6;
          stroke-linecap: round;
        }

        .rotary-ring-value {
          fill: none;
          stroke: var(--accent);
          stroke-width: 6;
          stroke-linecap: round;
          filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 78%, transparent));
        }

        .rotary-body {
          fill: url(#phaseKnobBody);
          stroke: rgba(255, 255, 255, 0.16);
          stroke-width: 1.2;
        }

        .rotary-indicator {
          stroke: #edf8ff;
          stroke-width: 3.4;
          stroke-linecap: round;
          filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 82%, transparent));
        }

        .rotary-dot {
          fill: var(--accent);
          filter: drop-shadow(0 0 5px color-mix(in srgb, var(--accent) 78%, transparent));
        }

        .rotary-value {
          min-width: 48px;
          padding: 4px 8px;
          border: 1px solid rgba(255, 255, 255, 0.095);
          border-radius: 5px;
          color: #edf8ff;
          background: rgba(0, 0, 0, 0.32);
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
          font-size: 13px;
          line-height: 1;
          text-align: center;
          font-variant-numeric: tabular-nums;
          text-shadow: 0 0 12px color-mix(in srgb, var(--accent) 26%, transparent);
        }

        .engine-card .macro-select {
          min-height: 88px;
          padding: 12px;
          display: grid;
          gap: 8px;
          align-content: center;
          grid-column: span 1;
          border-radius: 7px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.018)),
            rgba(0, 0, 0, 0.26);
        }

        .engine-card .macro-select span {
          color: rgba(237, 248, 255, 0.68);
          font-size: 11px;
          line-height: 1.2;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .engine-card .macro-select select {
          min-width: 0;
          width: 100%;
          height: 34px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #edf8ff;
          background: rgba(0, 0, 0, 0.42);
          font: inherit;
          font-size: 13px;
        }

        .engine-card.bass-engine .macro-select {
          grid-column: 1 / -1;
        }

        .engine-card.synth-engine .macro-select {
          grid-column: span 1;
        }

        .master-card .engine-controls {
          grid-template-columns: minmax(128px, 1fr) minmax(128px, 1fr);
        }

        .master-readout,
        .master-action,
        .master-status {
          min-height: 174px;
          display: grid;
          align-content: center;
          justify-items: center;
          gap: 12px;
          padding: 16px 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 7px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.018)),
            radial-gradient(circle at 50% -20%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 58%),
            rgba(0, 0, 0, 0.3);
        }

        .master-readout {
          grid-column: span 1;
        }

        .master-status {
          grid-column: 1 / -1;
        }

        .master-readout span,
        .master-action span,
        .master-status span {
          color: rgba(237, 248, 255, 0.68);
          font-size: 11px;
          line-height: 1.2;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          text-align: center;
        }

        .master-readout b,
        .master-status b {
          color: #edf8ff;
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
          font-size: 25px;
          line-height: 1;
          text-shadow: 0 0 16px color-mix(in srgb, var(--accent) 34%, transparent);
        }

        .master-status b {
          font-size: 18px;
        }

        .master-action button {
          width: min(152px, 100%);
          min-height: 54px;
          border: 1px solid rgba(255, 79, 145, 0.54);
          border-radius: 7px;
          color: #fff;
          background:
            linear-gradient(180deg, rgba(255, 79, 145, 0.32), rgba(255, 79, 145, 0.12)),
            rgba(0, 0, 0, 0.36);
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
          font-size: 13px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 0 18px rgba(255, 79, 145, 0.16);
        }

        .phase-status-card {
          grid-column: 1 / -1;
          min-height: 74px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 14px;
          align-items: center;
          padding: 15px 18px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: rgba(237, 248, 255, 0.72);
          background: rgba(4, 5, 12, 0.68);
        }

        .phase-status-card button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 7px;
          color: #edf8ff;
          background: rgba(255, 255, 255, 0.045);
          font: inherit;
          font-size: 12px;
          cursor: pointer;
        }

        .phase-version {
          display: inline-block;
          margin-top: 5px;
          padding: 3px 7px;
          border: 1px solid rgba(120, 255, 229, 0.28);
          border-radius: 999px;
          color: #78ffe5;
          background: rgba(0, 0, 0, 0.24);
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
          font-size: 10px;
          letter-spacing: 0.06em;
        }

        @media (max-width: 1180px) {
          .engine-bank {
            grid-template-columns: repeat(2, minmax(280px, 1fr));
          }
        }

        @media (max-width: 900px) {
          .engine-card {
            padding: 16px;
          }

          .engine-card .engine-controls {
            grid-template-columns: repeat(2, minmax(116px, 1fr));
          }

          .engine-card.synth-engine .macro-select {
            grid-column: span 1;
          }

          .master-card .engine-controls {
            grid-template-columns: repeat(2, minmax(116px, 1fr));
          }
        }

        @media (max-width: 760px) {
          .engine-bank {
            grid-template-columns: 1fr;
          }

          .engine-card .engine-controls {
            grid-template-columns: repeat(2, minmax(124px, 1fr));
          }

          .rotary-knob {
            min-height: 164px;
            padding: 13px 10px 11px;
          }

          .rotary-face {
            width: min(100px, 100%);
          }

          .phase-status-card {
            grid-template-columns: auto 1fr;
          }

          .phase-status-card button {
            grid-column: 1 / -1;
            justify-content: center;
            width: 100%;
          }
        }

        @media (max-width: 480px) {
          .engine-card .engine-controls,
          .master-card .engine-controls {
            grid-template-columns: 1fr;
          }

          .master-readout,
          .master-action,
          .master-status {
            grid-column: 1 / -1;
            min-height: 132px;
          }
        }
      `}</style>
      <section className="phase-instrument">
        <header className="phase-top">
          <div className="phase-brand">
            <span className="phase-mark"><Disc3 size={24} /></span>
            <div>
              <h1>PHASE TEST 999</h1>
              <p>Hybrid generative techno instrument</p>
              <span className="phase-version">PHASE SOUND PRO v0.9</span>
            </div>
          </div>

          <div className="phase-transport" aria-label="Transport">
            <button className={`transport-play ${playing ? "on" : ""}`} onClick={togglePlay} aria-label={playing ? "Stop playback" : "Start playback"}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="transport-stop" onClick={stopTone} aria-label="Stop">
              <Square size={16} />
            </button>
            <label className="tempo">
              <span>BPM</span>
              <input value={bpm} min={88} max={176} type="number" onChange={(event) => setBpm(clamp(Number(event.target.value), 88, 176))} />
            </label>
            <div className="engine-switch">
              {(["tone", "strudel"] as EngineMode[]).map((mode) => (
                <button key={mode} className={engineMode === mode ? "selected" : ""} onClick={() => { setEngineMode(mode); setStatus(`${mode.toUpperCase()} engine selected`); }}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="phase-meter">
            <span>HEAT {engineReadout.heat}</span>
            <span>SPACE {engineReadout.space}</span>
            <span>{status}</span>
          </div>
        </header>

        <section className="phase-core">
          <div className="sequencer-panel">
            <div className="panel-title">
              <span><Activity size={16} /> Trigger Matrix</span>
              <button onClick={() => regenerate()}><RefreshCw size={14} /> GEN</button>
            </div>
            <div className="step-numbers">
              <span />
              {Array.from({ length: STEPS }, (_, i) => <span key={i}>{String(i + 1).padStart(2, "0")}</span>)}
            </div>
            {TRACKS.map((track) => (
              <div className="track-row" key={track} style={{ "--track": TRACK_COLORS[track] } as React.CSSProperties}>
                <div className="track-name">
                  <i />
                  <span>{track}</span>
                </div>
                {pattern[track].map((step, i) => (
                  <button
                    key={`${track}-${i}`}
                    className={`step ${step.active ? "on" : ""} ${activeStep === i ? "hot" : ""} ${i >= lengths[track] ? "outside" : ""} ${step.locks ? "locked" : ""}`}
                    onClick={() => toggleStep(track, i)}
                    onContextMenu={(event) => cycleStep(track, i, event)}
                    onDoubleClick={() => cycleStepLock(track, i)}
                    title="Click toggles. Right-click cycles probability/repeat. Double-click cycles parameter locks."
                    aria-label={`${track} step ${i + 1}`}
                  >
                    <span>{track === "BASS" || track === "SYNTH" ? step.note?.replace(/\d$/, "") : step.repeat > 1 ? step.repeat : ""}</span>
                  </button>
                ))}
              </div>
            ))}
            <div className="note-strip">
              {(["BASS", "SYNTH"] as const).map((track) => (
                <div key={track} className="note-lane" style={{ "--track": TRACK_COLORS[track] } as React.CSSProperties}>
                  <span>{track} PITCH</span>
                  {pattern[track].map((step, i) => (
                    <button key={`${track}-note-${i}`} onClick={() => nudgeNote(track, i, 1)} onContextMenu={(event) => { event.preventDefault(); nudgeNote(track, i, -1); }}>
                      {step.note}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="performance-panel">
            <div className="xy-head">
              <span><Waves size={16} /> XY Performance</span>
              <button className={xy.held ? "latched" : ""} onClick={() => setXy((prev) => ({ ...prev, held: !prev.held }))}>HOLD</button>
            </div>
            <div
              className={`xy-pad ${xy.active ? "touching" : ""}`}
              style={{ "--x": xy.x, "--y": xy.y } as React.CSSProperties}
              onPointerDown={(event) => { try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}; handlePad(event); }}
              onPointerMove={(event) => { if (xyRef.current.active) handlePad(event); }}
              onPointerUp={releasePad}
              onPointerCancel={releasePad}
            >
              <span className="xy-dot" />
              <b>DRY</b>
              <b>HUGE</b>
              <em>DARK</em>
              <em>BRIGHT</em>
            </div>
            <div className="xy-readout">
              <span>X dark to bright {Math.round(xy.x * 100)}</span>
              <span>Y dry to huge {Math.round(xy.y * 100)}</span>
            </div>
            <div className="performance-buttons">
              {PERFORMANCE_ACTIONS.map((action) => (
                <button key={action} className={held && action === "HOLD" ? "engaged" : ""} onClick={() => perform(action)}>
                  {action}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="restore-bank">
          <input ref={fileInputRef} type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.m4a,.ogg,.flac" hidden onChange={handleSampleChange} />

          <div className="restore-card mixer-card">
            <h2>Mixer</h2>
            {TRACKS.map((track) => (
              <div className="mixer-row" key={track} style={{ "--track": TRACK_COLORS[track] } as React.CSSProperties}>
                <span><i />{track}</span>
                <input type="range" min={-32} max={6} step={0.5} value={volumes[track]} onChange={(event) => setVolumes((prev) => ({ ...prev, [track]: Number(event.target.value) }))} />
                <b>{volumes[track].toFixed(1)}</b>
                <button className={mutes[track] ? "active" : ""} onClick={() => toggleMute(track)}>M</button>
                <button className={solos[track] ? "active solo" : ""} onClick={() => toggleSolo(track)}>S</button>
              </div>
            ))}
          </div>

          <div className="restore-card memory-card">
            <h2>Memory</h2>
            <input className="memory-name" value={presetName} onChange={(event) => setPresetName(event.target.value)} />
            <select value={selectedPresetId} onChange={(event) => { setSelectedPresetId(event.target.value); const preset = presets.find((item) => item.id === event.target.value); if (preset) setPresetName(preset.name); }}>
              <option value="">No memory selected</option>
              {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
            <div className="memory-actions">
              <button onClick={savePreset}>SAVE</button>
              <button onClick={() => loadPreset()}>LOAD</button>
              <button onClick={deletePreset}>DELETE</button>
            </div>
          </div>

          <div className="restore-card samples-card">
            <h2>Samples</h2>
            {SAMPLE_TRACKS.map((track) => (
              <div
                key={track}
                className={`sample-row ${dragOverTrack === track ? "dragging" : ""}`}
                onDragOver={(event) => { event.preventDefault(); setDragOverTrack(track); }}
                onDragLeave={() => setDragOverTrack(null)}
                onDrop={(event) => handleSampleDrop(event, track)}
                style={{ "--track": TRACK_COLORS[track] } as React.CSSProperties}
              >
                <span>{track}</span>
                <b>{sampleNames[track] || "factory voice"}</b>
                <button onClick={() => openSample(track)}>LOAD</button>
                <button onClick={() => removeSample(track)}>X</button>
              </div>
            ))}
          </div>

          <div className="restore-card structure-card">
            <h2>Polymeter + Euclid</h2>
            {TRACKS.map((track) => {
              const lane = euclidean[track];
              return (
                <div className="structure-row" key={track} style={{ "--track": TRACK_COLORS[track] } as React.CSSProperties}>
                  <span>{track}</span>
                  <button onClick={() => setTrackLength(track, lengths[track] - 1)}>-</button>
                  <b>{lengths[track]}</b>
                  <button onClick={() => setTrackLength(track, lengths[track] + 1)}>+</button>
                  <button className={lane.enabled ? "active" : ""} onClick={() => updateEuclidean(track, { enabled: !lane.enabled })}>E</button>
                  <input type="range" min={0} max={lengths[track]} value={lane.hits} onChange={(event) => updateEuclidean(track, { hits: Number(event.target.value), enabled: true })} />
                  <button onClick={() => updateEuclidean(track, { rotate: lane.rotate - 1, enabled: true })}>R-</button>
                  <button onClick={() => updateEuclidean(track, { rotate: lane.rotate + 1, enabled: true })}>R+</button>
                </div>
              );
            })}
          </div>

          <div className="restore-card locks-card">
            <h2>Locks</h2>
            <p>Double-click PERC, BASS, or SYNTH steps to cycle tone, space, and drive locks.</p>
            <div>
              <button onClick={randomizeLocks}>RANDOM LOCKS</button>
              <button onClick={clearLocks}>CLEAR LOCKS</button>
            </div>
          </div>
        </section>

        <section className="engine-bank">
          <EngineCard title="Rhythm Engine" accent="#a779ff">
            <RotaryKnob label="Density" value={rhythm.density} onChange={(value) => updateEngine(setRhythm, "density", value)} />
            <RotaryKnob label="Groove" value={rhythm.groove} onChange={(value) => updateEngine(setRhythm, "groove", value)} />
            <RotaryKnob label="Chaos" value={rhythm.chaos} onChange={(value) => updateEngine(setRhythm, "chaos", value)} />
            <RotaryKnob label="Probability" value={rhythm.probability} onChange={(value) => updateEngine(setRhythm, "probability", value)} />
            <RotaryKnob label="Repeat" value={rhythm.repeat} onChange={(value) => updateEngine(setRhythm, "repeat", value)} />
            <RotaryKnob label="Swing" value={rhythm.swing} onChange={(value) => updateEngine(setRhythm, "swing", value)} />
          </EngineCard>

          <EngineCard title="Bass Engine" accent="#ff4f91" className="bass-engine">
            <Select label="Root" value={bass.root} values={NOTE_NAMES} onChange={(value) => updateEngine(setBass, "root", value as RootNote)} />
            <RotaryKnob label="Motion" value={bass.motion} onChange={(value) => updateEngine(setBass, "motion", value)} />
            <RotaryKnob label="Acid" value={bass.acid} onChange={(value) => updateEngine(setBass, "acid", value)} />
            <RotaryKnob label="Drive" value={bass.drive} onChange={(value) => updateEngine(setBass, "drive", value)} />
            <RotaryKnob label="Mutate" value={bass.mutation} onChange={(value) => updateEngine(setBass, "mutation", value)} />
            <RotaryKnob label="Energy" value={bass.energy} onChange={(value) => updateEngine(setBass, "energy", value)} />
          </EngineCard>

          <EngineCard title="Synth Engine" accent="#78ffe5" className="synth-engine">
            <Select label="Scale" value={synth.scale} values={Object.keys(SCALE_INTERVALS)} onChange={(value) => updateEngine(setSynth, "scale", value as ScaleName)} />
            <Select label="Mood" value={synth.mood} values={["noir", "hypnotic", "acid", "ritual", "aerial"]} onChange={(value) => updateEngine(setSynth, "mood", value as MoodName)} />
            <RotaryKnob label="Tension" value={synth.tension} onChange={(value) => updateEngine(setSynth, "tension", value)} />
            <RotaryKnob label="Move" value={synth.movement} onChange={(value) => updateEngine(setSynth, "movement", value)} />
            <RotaryKnob label="Space" value={synth.space} onChange={(value) => updateEngine(setSynth, "space", value)} />
            <RotaryKnob label="Bright" value={synth.brightness} onChange={(value) => updateEngine(setSynth, "brightness", value)} />
          </EngineCard>

          <EngineCard title="Texture Engine" accent="#39e7ff">
            <RotaryKnob label="Drone" value={texture.drone} onChange={(value) => updateEngine(setTexture, "drone", value)} />
            <RotaryKnob label="Noise" value={texture.noise} onChange={(value) => updateEngine(setTexture, "noise", value)} />
            <RotaryKnob label="Metal" value={texture.metallic} onChange={(value) => updateEngine(setTexture, "metallic", value)} />
            <RotaryKnob label="Motion" value={texture.motion} onChange={(value) => updateEngine(setTexture, "motion", value)} />
            <RotaryKnob label="Width" value={texture.width} onChange={(value) => updateEngine(setTexture, "width", value)} />
            <RotaryKnob label="Dark" value={texture.darkness} onChange={(value) => updateEngine(setTexture, "darkness", value)} />
          </EngineCard>

          <EngineCard title="FX Engine" accent="#c8ff36">
            <RotaryKnob label="Delay" value={fx.delay} onChange={(value) => updateEngine(setFx, "delay", value)} />
            <RotaryKnob label="Reverb" value={fx.reverb} onChange={(value) => updateEngine(setFx, "reverb", value)} />
            <RotaryKnob label="Distort" value={fx.distortion} onChange={(value) => updateEngine(setFx, "distortion", value)} />
            <RotaryKnob label="Feedback" value={fx.feedback} onChange={(value) => updateEngine(setFx, "feedback", value)} />
            <RotaryKnob label="Freeze" value={fx.freeze} onChange={(value) => updateEngine(setFx, "freeze", value)} />
            <RotaryKnob label="Glitch" value={fx.glitch} onChange={(value) => updateEngine(setFx, "glitch", value)} />
          </EngineCard>

          <EngineCard title="Master" accent="#ffb454" className="master-card">
            <div className="master-readout">
              <span>Master Vol</span>
              <b>{Math.round(mapRange(Object.values(volumes).reduce((sum, value) => sum + value, 0) / TRACKS.length, -32, 6, 0, 100))}</b>
            </div>
            <div className="master-action">
              <span>Panic</span>
              <button onClick={stopTone}>Stop All</button>
            </div>
            <div className="master-status">
              <span>Limiter Status</span>
              <b>ARMED</b>
            </div>
          </EngineCard>

          <div className="phase-status-card">
            <Sparkles size={18} />
            <span>Editable lanes are the score. Engines bend probability, synthesis, texture, and effects in real time.</span>
            <button onClick={() => regenerate()}><SlidersHorizontal size={14} /> Regenerate</button>
          </div>
        </section>
      </section>
    </main>
  );
}

function EngineCard({ title, accent, children, className = "" }: { title: string; accent: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`engine-card ${className}`.trim()} style={{ "--accent": accent } as React.CSSProperties}>
      <h2>{title}</h2>
      <div className="engine-controls">{children}</div>
    </div>
  );
}

interface RotaryKnobProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  defaultValue?: number;
}

function RotaryKnob({ label, value, onChange, min = 0, max = 100, step = 1, disabled = false, defaultValue }: RotaryKnobProps) {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
  const range = Math.max(step, max - min);
  const safeValue = clamp(value, min, max);
  const normalized = clamp((safeValue - min) / range, 0, 1);
  const startAngle = -135;
  const endAngle = startAngle + normalized * 270;
  const trackStart = polarPoint(startAngle, 41);
  const trackEnd = polarPoint(135, 41);
  const valueEnd = polarPoint(endAngle, 41);
  const dot = polarPoint(endAngle, 28);
  const indicatorBase = polarPoint(endAngle, 10);
  const indicatorTip = polarPoint(endAngle, 29);
  const trackPath = arcPath(trackStart, trackEnd, 41, true);
  const valuePath = arcPath(trackStart, valueEnd, 41, normalized > 2 / 3);

  function commit(nextValue: number) {
    if (disabled) return;
    const stepped = min + Math.round((nextValue - min) / step) * step;
    const precision = step < 1 ? 3 : 0;
    onChange(Number(clamp(stepped, min, max).toFixed(precision)));
  }

  function reset() {
    commit(defaultValue ?? 50);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startValue: safeValue };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || disabled) return;
    const pixelsPerRange = 170;
    const delta = (dragRef.current.startY - event.clientY) / pixelsPerRange;
    commit(dragRef.current.startValue + delta * range);
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    commit(safeValue + (event.deltaY < 0 ? step : -step));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      commit(safeValue + step);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      commit(safeValue - step);
    }
    if (event.key === "Home") {
      event.preventDefault();
      commit(min);
    }
    if (event.key === "End") {
      event.preventDefault();
      commit(max);
    }
  }

  return (
    <div
      className={`rotary-knob${disabled ? " disabled" : ""}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={safeValue}
      aria-disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={handleWheel}
      onDoubleClick={reset}
      onKeyDown={handleKeyDown}
    >
      <span className="rotary-label">{label}</span>
      <svg className="rotary-face" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="phaseKnobBody" cx="35%" cy="28%" r="76%">
            <stop offset="0%" stopColor="#2b3144" />
            <stop offset="54%" stopColor="#11141f" />
            <stop offset="100%" stopColor="#05060b" />
          </radialGradient>
        </defs>
        <path className="rotary-ring-track" d={trackPath} />
        {normalized > 0 ? <path className="rotary-ring-value" d={valuePath} /> : null}
        <circle className="rotary-body" cx="50" cy="50" r="31" />
        <line className="rotary-indicator" x1={indicatorBase.x} y1={indicatorBase.y} x2={indicatorTip.x} y2={indicatorTip.y} />
        <circle className="rotary-dot" cx={dot.x} cy={dot.y} r="2.8" />
      </svg>
      <b className="rotary-value">{Math.round(safeValue)}</b>
    </div>
  );
}

function polarPoint(degrees: number, radius: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: roundSvgNumber(50 + radius * Math.cos(radians)),
    y: roundSvgNumber(50 + radius * Math.sin(radians)),
  };
}

function roundSvgNumber(value: number) {
  return Number(value.toFixed(2));
}

function arcPath(start: { x: number; y: number }, end: { x: number; y: number }, radius: number, largeArc: boolean) {
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc ? 1 : 0} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: readonly string[]; onChange: (value: string) => void }) {
  return (
    <label className="macro-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}
