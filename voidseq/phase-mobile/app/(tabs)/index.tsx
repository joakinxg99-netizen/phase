// Phase Groovebox - Complete Production-Ready Single File Implementation
// Expo React Native + TypeScript

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  GestureResponderEvent,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get("window");
const STEPS = 16;
const TRACKS = ["KICK", "HAT", "PERC", "BASS", "SYNTH"] as const;
type TrackId = (typeof TRACKS)[number];

const COLORS: Record<TrackId, { accent: string; glow: string; dim: string }> = {
  KICK: { accent: "#9b6cff", glow: "#7c4dffaa", dim: "#4a2da8" },
  HAT: { accent: "#83bdff", glow: "#3a80ffaa", dim: "#2255a0" },
  PERC: { accent: "#55e6d2", glow: "#00c9b1aa", dim: "#1a6b60" },
  BASS: { accent: "#ff788b", glow: "#ff3060aa", dim: "#8b2235" },
  SYNTH: { accent: "#efe36b", glow: "#d4c41eaa", dim: "#7a6c10" },
};


function hapticLight(){ try{ Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}catch{}}
function hapticMedium(){ try{ Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);}catch{}}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  active: boolean;
  velocity: number;
  probability: number;
  ratchet: number;
  note: number;
}

interface TrackState {
  steps: Step[];
  mute: boolean;
  solo: boolean;
  volume: number;
  length: number;
  density: number;
}

interface MacroState {
  filter: number;
  drive: number;
  space: number;
  chaos: number;
  swing: number;
  master: number;
}

interface SynthModState {
  lfoRate: number;
  lfoDepth: number;
  pluck: number;
  detune: number;
  movement: number;
  color: number;
}

interface SynthEqState {
  low: number;
  mid: number;
  high: number;
  cutoff: number;
}

interface XYState {
  x: number;
  y: number;
}

interface PresetSlot {
  name: string;
  tracks: Record<TrackId, TrackState>;
  macros: MacroState;
  bpm: number;
}

type PerformanceFx = "STUTTER" | "REPEAT" | "FILTER" | "TAPE" | "GLITCH" | null;

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_NOTES: Record<TrackId, number[]> = {
  KICK: Array(16).fill(36),
  HAT: Array(16).fill(42),
  PERC: Array(16).fill(48),
  BASS: [36, 36, 43, 36, 39, 36, 43, 36, 36, 36, 43, 36, 34, 36, 43, 36],
  SYNTH: [60, 63, 67, 70, 72, 70, 67, 63, 60, 63, 67, 70, 75, 72, 70, 67],
};

function makeStep(track: TrackId, index: number): Step {
  const active =
    track === "KICK"
      ? [0, 4, 8, 12].includes(index)
      : track === "HAT"
        ? index % 2 === 1
        : track === "PERC"
          ? [3, 7, 10, 14].includes(index)
          : track === "BASS"
            ? [0, 3, 6, 8, 11, 14].includes(index)
            : [2, 5, 9, 12, 15].includes(index);

  return {
    active,
    velocity: track === "HAT" ? 72 : 92,
    probability: 100,
    ratchet: 1,
    note: DEFAULT_NOTES[track][index] ?? 60,
  };
}

function makeTrack(track: TrackId): TrackState {
  return {
    steps: Array.from({ length: STEPS }, (_, i) => makeStep(track, i)),
    mute: false,
    solo: false,
    volume: track === "KICK" ? 1 : track === "BASS" ? 0.85 : 0.72,
    length: track === "KICK" ? 16 : track === "HAT" ? 16 : track === "PERC" ? 12 : track === "BASS" ? 8 : 16,
    density: 55,
  };
}

// ─── Audio DSP ────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function mapRange(v: number, a: number, b: number, c: number, d: number) {
  return c + ((d - c) * clamp((v - a) / (b - a), 0, 1));
}

function midiToHz(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function encode16(v: number) {
  const s = clamp(v, -1, 1);
  return s < 0 ? s * 32768 : s * 32767;
}

function makeWav(samples: Float32Array, sr = 44100): string {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const dv = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF");
  dv.setUint32(4, 36 + samples.length * 2, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ws(36, "data");
  dv.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) { dv.setInt16(off, encode16(samples[i]), true); off += 2; }
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return "data:audio/wav;base64," + btoa(bin);
}

function dspKick(sr = 44100, pitch = 52, decay = 0.46, click = 0.16, drive = 1.45): Float32Array {
  const len = Math.floor(sr * clamp(decay + 0.1, 0.2, 1.0));
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const pEnv = Math.exp(-t * 34);
    const aEnv = Math.exp(-t * (8.2 / (decay + 0.05)));
    const freq = pitch + 165 * pEnv;
    const body = Math.sin(2 * Math.PI * freq * t);
    const sub = Math.sin(2 * Math.PI * 46 * t) * Math.exp(-t * 4.8) * 0.7;
    const ck = Math.sin(2 * Math.PI * 2200 * t) * Math.exp(-t * 95) * click;
    out[i] = Math.tanh((body * drive + sub + ck) * aEnv * 2.8) * 0.97;
  }
  return out;
}

function dspHat(sr = 44100, decay = 0.11, tone = 1.0): Float32Array {
  const len = Math.floor(sr * clamp(decay, 0.02, 0.6));
  const out = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * (45 / (decay + 0.01)));
    const noise = Math.random() * 2 - 1;
    const hp = noise - last * (0.72 * tone);
    last = noise;
    out[i] = hp * env * 0.42;
  }
  return out;
}

function dspPerc(sr = 44100, tone = 210, decay = 0.22): Float32Array {
  const len = Math.floor(sr * clamp(decay, 0.04, 0.8));
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * (18 / (decay + 0.01)));
    const pitch = tone + 75 * Math.exp(-t * 18);
    const body = Math.sin(2 * Math.PI * pitch * t);
    const knock = Math.sin(2 * Math.PI * 760 * t) * Math.exp(-t * 60) * 0.28;
    out[i] = Math.tanh((body * 0.7 + knock) * env * 2.4) * 0.55;
  }
  return out;
}

function dspBass(note = 36, sr = 44100): Float32Array {
  const freq = midiToHz(note);
  const len = Math.floor(sr * 0.48);
  const out = new Float32Array(len);
  let lp = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const aEnv = clamp(t / 0.006, 0, 1) * Math.exp(-t * 4.8);
    const fEnv = Math.exp(-t * 8.5);
    const saw = 2 * ((freq * t) % 1) - 1;
    const sq = Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1;
    const sub = Math.sin(2 * Math.PI * freq * 0.5 * t);
    const raw = saw * 0.36 + sq * 0.12 + sub * 0.62;
    const cut = 0.045 + fEnv * 0.22;
    lp += (raw - lp) * cut;
    const hi = raw - prev; prev = raw;
    out[i] = Math.tanh((lp * 1.25 + hi * 0.06) * aEnv * 2.9) * 0.92;
  }
  return out;
}

function dspSynth(note = 60, sr = 44100): Float32Array {
  const freq = midiToHz(note);
  const len = Math.floor(sr * 0.56);
  const out = new Float32Array(len);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const aEnv = clamp(t / 0.01, 0, 1) * Math.exp(-t * 3.3);
    const fEnv = Math.exp(-t * 5.2);
    const a = Math.sin(2 * Math.PI * freq * t);
    const b = Math.sin(2 * Math.PI * (freq * 1.006) * t);
    const saw = 2 * ((freq * 0.5 * t) % 1) - 1;
    const h = Math.sin(2 * Math.PI * freq * 2.01 * t) * 0.22;
    const raw = a * 0.32 + b * 0.28 + saw * 0.2 + h;
    lp += (raw - lp) * (0.055 + fEnv * 0.18);
    out[i] = Math.tanh(lp * aEnv * 1.75) * 0.72;
  }
  return out;
}

// ─── Sound Pool ───────────────────────────────────────────────────────────────

async function buildSoundPool() {
  const sr = 44100;
  const pool: Record<string, Audio.Sound[]> = {};

  const buildVoices = async (key: string, uri: string, count: number) => {
    pool[key] = [];
    for (let i = 0; i < count; i++) {
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
      pool[key].push(sound);
    }
  };

  await buildVoices("KICK", makeWav(dspKick(sr)), 6);
  await buildVoices("HAT", makeWav(dspHat(sr)), 5);
  await buildVoices("PERC", makeWav(dspPerc(sr)), 4);

  const bassNotes = [34, 36, 39, 43, 46, 48];
  for (const n of bassNotes) {
    await buildVoices(`BASS_${n}`, makeWav(dspBass(n, sr)), 3);
  }

  const synthNotes = [60, 62, 63, 65, 67, 70, 72, 75];
  for (const n of synthNotes) {
    await buildVoices(`SYNTH_${n}`, makeWav(dspSynth(n, sr)), 3);
  }

  return pool;
}

function closestNote(note: number, available: number[]): string {
  const closest = available.reduce((a, b) =>
    Math.abs(b - note) < Math.abs(a - note) ? b : a
  );
  return String(closest);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function App() {
  const [engineMode, setEngineMode] = useState<"STOPPED" | "PLAYING">("STOPPED");
  const [bpm, setBpm] = useState(138);
  const [activeStep, setActiveStep] = useState(-1);
  const [ready, setReady] = useState(false);
  const [tracks, setTracks] = useState<Record<TrackId, TrackState>>(
    () => ({
      KICK: makeTrack("KICK"),
      HAT: makeTrack("HAT"),
      PERC: makeTrack("PERC"),
      BASS: makeTrack("BASS"),
      SYNTH: makeTrack("SYNTH"),
    })
  );
  const [macros, setMacros] = useState<MacroState>({
    filter: 52,
    drive: 24,
    space: 18,
    chaos: 22,
    swing: 8,
    master: 86,
  });
  const [synthMod, setSynthMod] = useState<SynthModState>({
    lfoRate: 32,
    lfoDepth: 28,
    pluck: 54,
    detune: 12,
    movement: 38,
    color: 44,
  });
  const [synthEq, setSynthEq] = useState<SynthEqState>({
    low: 42,
    mid: 58,
    high: 62,
    cutoff: 68,
  });
  const [xy, setXy] = useState<XYState>({ x: 0.5, y: 0.5 });
  const [presets, setPresets] = useState<Record<string, PresetSlot | null>>({
    A: null, B: null, C: null,
  });
  const [selectedTrack, setSelectedTrack] = useState<TrackId>("KICK");
  const [selectedStep, setSelectedStep] = useState(0);
  const [regionStart, setRegionStart] = useState<number | null>(null);
  const [regionEnd, setRegionEnd] = useState<number | null>(null);
  const clipboardRef = useRef<Step[] | null>(null);
  const [activePanel, setActivePanel] = useState<"SEQ" | "MOD" | "EQ" | "FX" | "PERF">("SEQ");
  const [activeFx, setActiveFx] = useState<PerformanceFx>(null);
  const [fxIntensity, setFxIntensity] = useState(0);
  const [compactMode, setCompactMode] = useState(false);
  const [paintMode, setPaintMode] = useState<boolean | null>(null);

  // Refs for scheduler
  const tracksRef = useRef(tracks);
  const macrosRef = useRef(macros);
  const synthModRef = useRef(synthMod);
  const synthEqRef = useRef(synthEq);
  const poolRef = useRef<Record<string, Audio.Sound[]>>({});
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const nextTickRef = useRef(0);
  const mountedRef = useRef(true);
  const activeFxRef = useRef(activeFx);
  const fxIntensityRef = useRef(fxIntensity);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { macrosRef.current = macros; }, [macros]);
  useEffect(() => { synthModRef.current = synthMod; }, [synthMod]);
  useEffect(() => { synthEqRef.current = synthEq; }, [synthEq]);
  useEffect(() => { activeFxRef.current = activeFx; }, [activeFx]);
  useEffect(() => { fxIntensityRef.current = fxIntensity; }, [fxIntensity]);

  useEffect(() => {
    mountedRef.current = true;
    boot();
    return () => {
      mountedRef.current = false;
      stop(false);
      unloadPool();
    };
  }, []);

  async function boot() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      const pool = await buildSoundPool();
      poolRef.current = pool;
      if (mountedRef.current) setReady(true);
    } catch (e) {
      console.log("boot error", e);
    }
  }

  async function unloadPool() {
    for (const sounds of Object.values(poolRef.current)) {
      for (const s of sounds) { try { await s.unloadAsync(); } catch {} }
    }
  }

  const stepMs = useMemo(() => (60 / bpm / 4) * 1000, [bpm]);

  function getSoundKey(track: TrackId, note: number): string {
    if (track === "KICK") return "KICK";
    if (track === "HAT") return "HAT";
    if (track === "PERC") return "PERC";
    if (track === "BASS") return `BASS_${closestNote(note, [34, 36, 39, 43, 46, 48])}`;
    return `SYNTH_${closestNote(note, [60, 62, 63, 65, 67, 70, 72, 75])}`;
  }

  async function triggerSound(track: TrackId, step: Step, volumeOverride?: number) {
    const state = tracksRef.current[track];
    const anySolo = TRACKS.some((t) => tracksRef.current[t].solo);
    const audible = anySolo ? state.solo : !state.mute;
    if (!audible) return;
    if (Math.random() * 100 > step.probability) return;

    // Performance FX gate
    const fx = activeFxRef.current;
    const fxAmt = fxIntensityRef.current;
    if (fx === "TAPE" && Math.random() < fxAmt * 0.95) return;
    if (fx === "GLITCH" && Math.random() < fxAmt * 0.7) return;

    const key = getSoundKey(track, step.note);
    const sounds = poolRef.current[key];
    if (!sounds || !sounds.length) return;

    const sound = sounds[Math.floor(Math.random() * sounds.length)];
    const m = macrosRef.current;
    const eq = synthEqRef.current;
    const mod = synthModRef.current;

    let vol = (volumeOverride ?? step.velocity / 100) * state.volume * (m.master / 100);
    if (track === "SYNTH") {
      vol *= mapRange(eq.cutoff, 0, 100, 0.55, 1.22);
      vol *= mapRange(mod.pluck, 0, 100, 0.72, 1.18);
    }
    if (fx === "STUTTER") vol *= 0.82;
    vol = clamp(vol, 0, 1);

    try {
      await sound.stopAsync();
      await sound.setPositionAsync(0);
      await sound.setVolumeAsync(vol);
      await sound.playAsync();
    } catch {}
  }

  function schedulerLoop() {
    const now = Date.now();
    while (now + 20 >= nextTickRef.current) {
      tick(nextTickRef.current);
      if (Date.now() - now > 16) break;
    }
  }

  function tick(scheduledAt: number) {
    const step = stepRef.current;
    setActiveStep(step);

    const fx = activeFxRef.current;
    const fxAmt = fxIntensityRef.current;

    TRACKS.forEach((track) => {
      const lane = tracksRef.current[track];
      const laneIdx = step % lane.length;
      const s = lane.steps[laneIdx];
      if (!s.active) return;

      // Stutter: repeat current step rapidly
      if (fx === "STUTTER") {
        const repeats = Math.max(2, Math.round(fxAmt * 8));
        const spacing = stepMs / repeats;
        for (let r = 0; r < repeats; r++) {
          setTimeout(() => triggerSound(track, s), spacing * r);
        }
        return;
      }

      // Beat repeat: repeat from earlier
      if (fx === "REPEAT") {
        triggerSound(track, s);
        const extra = Math.round(fxAmt * 3);
        for (let r = 1; r <= extra; r++) {
          setTimeout(() => triggerSound(track, s, 0.6 - r * 0.1), (stepMs / 2) * r);
        }
        return;
      }

      const reps = clamp(Math.round(s.ratchet), 1, 4);
      triggerSound(track, s);
      if (reps > 1) {
        const sp = stepMs / reps;
        for (let r = 1; r < reps; r++) {
          setTimeout(() => triggerSound(track, s), sp * r);
        }
      }
    });

    stepRef.current = (step + 1) % STEPS;
    nextTickRef.current = scheduledAt + stepMs;
  }

  function start() {
    if (schedulerRef.current) return;
    setEngineMode("PLAYING");
    nextTickRef.current = Date.now();
    schedulerLoop();
    schedulerRef.current = setInterval(schedulerLoop, 12);
  }

  function stop(updateState = true) {
    if (schedulerRef.current) { clearInterval(schedulerRef.current); schedulerRef.current = null; }
    stepRef.current = 0;
    nextTickRef.current = 0;
    setActiveStep(-1);
    if (updateState) setEngineMode("STOPPED");
  }

  // ── Pattern editing ──────────────────────────────────────────────────────────

  const toggleStep = useCallback((track: TrackId, index: number) => {
    setTracks((prev) => {
      const steps = [...prev[track].steps];
      steps[index] = { ...steps[index], active: !steps[index].active };
      return { ...prev, [track]: { ...prev[track], steps } };
    });
  }, []);

  const paintStep = useCallback((track: TrackId, index: number, value: boolean) => {
    setTracks((prev) => {
      const steps = [...prev[track].steps];
      if (steps[index].active === value) return prev;
      steps[index] = { ...steps[index], active: value };
      return { ...prev, [track]: { ...prev[track], steps } };
    });
  }, []);

  const cycleVelocity = useCallback((track: TrackId, index: number) => {
    setTracks((prev) => {
      const steps = [...prev[track].steps];
      const v = steps[index].velocity;
      steps[index] = { ...steps[index], velocity: v >= 95 ? 55 : v >= 75 ? 95 : 75 };
      return { ...prev, [track]: { ...prev[track], steps } };
    });
  }, []);

  const cycleProbability = useCallback((track: TrackId, index: number) => {
    setTracks((prev) => {
      const steps = [...prev[track].steps];
      const p = steps[index].probability;
      steps[index] = { ...steps[index], probability: p >= 100 ? 75 : p >= 75 ? 50 : p >= 50 ? 25 : 100 };
      return { ...prev, [track]: { ...prev[track], steps } };
    });
  }, []);

  const cycleRatchet = useCallback((track: TrackId, index: number) => {
    setTracks((prev) => {
      const steps = [...prev[track].steps];
      const r = steps[index].ratchet;
      steps[index] = { ...steps[index], ratchet: r >= 4 ? 1 : r >= 2 ? 4 : 2 };
      return { ...prev, [track]: { ...prev[track], steps } };
    });
  }, []);

  const duplicatePattern = useCallback((track: TrackId) => {
    setTracks((prev) => {
      const lane = prev[track];
      const half = lane.steps.slice(0, 8);
      const steps = [...lane.steps];
      for (let i = 8; i < 16; i++) {
        steps[i] = { ...half[i - 8] };
      }
      return { ...prev, [track]: { ...prev[track], steps, length: 16 } };
    });
  }, []);

  function toggleMute(track: TrackId) {
    setTracks((prev) => ({ ...prev, [track]: { ...prev[track], mute: !prev[track].mute } }));
  }

  function toggleSolo(track: TrackId) {
    setTracks((prev) => ({ ...prev, [track]: { ...prev[track], solo: !prev[track].solo } }));
  }

  function setVolume(track: TrackId, delta: number) {
    setTracks((prev) => ({
      ...prev,
      [track]: { ...prev[track], volume: clamp(prev[track].volume + delta, 0, 1) },
    }));
  }

  function setTrackLength(track: TrackId, length: number) {
    setTracks((prev) => {
      const steps = prev[track].steps.map((s, i) => ({ ...s, active: i < length ? s.active : false }));
      return { ...prev, [track]: { ...prev[track], steps, length } };
    });
  }

  function nudgeLength(track: TrackId, d: number) {
    const opts = [4, 6, 8, 10, 12, 14, 16];
    const cur = tracksRef.current[track].length;
    const idx = clamp((opts.indexOf(cur) >= 0 ? opts.indexOf(cur) : 6) + d, 0, opts.length - 1);
    setTrackLength(track, opts[idx]);
  }

  function randomize() {
    setTracks((prev) => {
      const next = { ...prev };
      TRACKS.forEach((track) => {
        const steps = next[track].steps.map((old, i) => {
          let active = false;
          if (track === "KICK") active = i % 4 === 0 || (i % 4 === 2 && Math.random() < 0.15);
          else if (track === "HAT") active = i % 2 === 1 ? Math.random() < 0.85 : Math.random() < 0.2;
          else if (track === "PERC") active = [3, 7, 10, 14].includes(i) ? Math.random() < 0.8 : Math.random() < 0.2;
          else if (track === "BASS") active = [0, 3, 6, 8, 11, 14].includes(i) ? Math.random() < 0.75 : Math.random() < 0.15;
          else active = Math.random() < 0.3;
          return {
            ...old,
            active,
            velocity: Math.round(mapRange(Math.random(), 0, 1, track === "HAT" ? 48 : 60, 100)),
            probability: [100, 100, 100, 75, 75, 50][Math.floor(Math.random() * 6)],
            ratchet: track === "HAT" && Math.random() < 0.18 ? 2 : 1,
          };
        });
        next[track] = { ...next[track], steps };
      });
      return next;
    });
  }

  function clearPattern() {
    setTracks((prev) => {
      const next = { ...prev };
      TRACKS.forEach((t) => {
        next[t] = { ...next[t], steps: next[t].steps.map((s) => ({ ...s, active: false })) };
      });
      return next;
    });
  }

  function resetPattern() {
    setTracks({ KICK: makeTrack("KICK"), HAT: makeTrack("HAT"), PERC: makeTrack("PERC"), BASS: makeTrack("BASS"), SYNTH: makeTrack("SYNTH") });
  }

  function densityRandom(track: TrackId, delta: number) {
    setTracks((prev) => {
      const density = clamp((prev[track].density || 55) + delta, 0, 100);
      const d = density / 100;
      const steps = prev[track].steps.map((old, i) => {
        let chance = d;
        if (track === "KICK") chance = [0, 4, 8, 12].includes(i) ? 1 : d * 0.08;
        else if (track === "HAT") chance = i % 2 === 1 ? 0.45 + d * 0.5 : d * 0.22;
        else if (track === "PERC") chance = [3, 7, 10, 14].includes(i) ? 0.35 + d * 0.55 : d * 0.22;
        else if (track === "BASS") chance = [0, 3, 6, 8, 11, 14].includes(i) ? 0.3 + d * 0.5 : d * 0.14;
        else chance = d * 0.55;
        return { ...old, active: Math.random() < chance };
      });
      return { ...prev, [track]: { ...prev[track], steps, density } };
    });
  }

  function savePreset(slot: "A" | "B" | "C") {
    setPresets((p) => ({
      ...p,
      [slot]: {
        name: `PAT ${slot}`,
        tracks: cloneTracks(tracksRef.current),
        macros: { ...macrosRef.current },
        bpm,
      },
    }));
  }

  function loadPreset(slot: "A" | "B" | "C") {
    const preset = presets[slot];
    if (!preset) return;
    setTracks(cloneTracks(preset.tracks));
    setMacros({ ...preset.macros });
    setBpm(preset.bpm);
  }

  function cloneTracks(t: Record<TrackId, TrackState>): Record<TrackId, TrackState> {
    return TRACKS.reduce((acc, track) => {
      acc[track] = { ...t[track], steps: t[track].steps.map((s) => ({ ...s })) };
      return acc;
    }, {} as Record<TrackId, TrackState>);
  }

  function randomizeSynthPatch() {
    setSynthMod({
      lfoRate: Math.round(mapRange(Math.random(), 0, 1, 12, 82)),
      lfoDepth: Math.round(mapRange(Math.random(), 0, 1, 10, 76)),
      pluck: Math.round(mapRange(Math.random(), 0, 1, 28, 86)),
      detune: Math.round(mapRange(Math.random(), 0, 1, 0, 36)),
      movement: Math.round(mapRange(Math.random(), 0, 1, 18, 88)),
      color: Math.round(mapRange(Math.random(), 0, 1, 18, 92)),
    });
    setSynthEq({
      low: Math.round(mapRange(Math.random(), 0, 1, 24, 58)),
      mid: Math.round(mapRange(Math.random(), 0, 1, 42, 76)),
      high: Math.round(mapRange(Math.random(), 0, 1, 46, 88)),
      cutoff: Math.round(mapRange(Math.random(), 0, 1, 38, 96)),
    });
  }

  const xyFrameRef = useRef<number | null>(null);
  const xyLayoutRef = useRef({ width: SCREEN_W - 40, height: 220 });

  const commitXY = useCallback((x: number, y: number) => {
    setXy({ x, y });
    setMacros((prev) => ({
      ...prev,
      filter: Math.round(mapRange(x, 0, 1, 20, 100)),
      space: Math.round(mapRange(y, 0, 1, 0, 100)),
    }));
  }, []);

  function updateXY(e: GestureResponderEvent) {
    const { locationX, locationY } = e.nativeEvent;
    const width = xyLayoutRef.current.width || (SCREEN_W - 40);
    const height = xyLayoutRef.current.height || 220;

    const x = clamp(locationX / width, 0, 1);
    const y = clamp(1 - locationY / height, 0, 1);

    if (xyFrameRef.current) cancelAnimationFrame(xyFrameRef.current);
    xyFrameRef.current = requestAnimationFrame(() => {
      commitXY(x, y);
    });
  }

  const xyPanResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: updateXY,
      onPanResponderMove: updateXY,
      onPanResponderRelease: () => {
        if (xyFrameRef.current) {
          cancelAnimationFrame(xyFrameRef.current);
          xyFrameRef.current = null;
        }
      },
    }), [commitXY]);


  function getRegionBounds() {
    if (regionStart == null || regionEnd == null) return null;
    return [Math.min(regionStart, regionEnd), Math.max(regionStart, regionEnd)] as const;
  }

  function selectRegionPoint(i: number) {
    if (regionStart == null || (regionStart != null && regionEnd != null)) {
      setRegionStart(i);
      setRegionEnd(null);
    } else {
      setRegionEnd(i);
    }
    setSelectedStep(i);
  }

  function applyToRegion(fn: (s: Step) => Step) {
    const bounds = getRegionBounds();
    if (!bounds) return;
    const [a,b]=bounds;
    setTracks((prev)=>{
      const steps=[...prev[selectedTrack].steps];
      for(let i=a;i<=b;i++) steps[i]=fn({...steps[i]});
      return {...prev,[selectedTrack]:{...prev[selectedTrack],steps}};
    });
  }

  function copyRegion() {
    const bounds = getRegionBounds();
    if (!bounds) return;
    const [a,b]=bounds;
    clipboardRef.current = tracksRef.current[selectedTrack].steps.slice(a,b+1).map(s=>({...s}));
  }

  function pasteRegion() {
    const clip = clipboardRef.current;
    if (!clip) return;
    setTracks((prev)=>{
      const steps=[...prev[selectedTrack].steps];
      for(let i=0;i<clip.length && selectedStep+i<steps.length;i++) steps[selectedStep+i]={...clip[i]};
      return {...prev,[selectedTrack]:{...prev[selectedTrack],steps}};
    });
  }

  function fillRegion(interval:number){
    const bounds=getRegionBounds();
    if(!bounds) return;
    const [a,b]=bounds;
    setTracks((prev)=>{
      const steps=[...prev[selectedTrack].steps];
      for(let i=a;i<=b;i++) steps[i]={...steps[i], active: ((i-a)%interval)===0};
      return {...prev,[selectedTrack]:{...prev[selectedTrack],steps}};
    });
  }

  function randomizeRegion(){
    applyToRegion((s)=>({...s, active: Math.random()<0.6, probability:[25,50,75,100][Math.floor(Math.random()*4)], velocity:50+Math.floor(Math.random()*50)}));
  }

  const anySolo = useMemo(() => TRACKS.some((t) => tracks[t].solo), [tracks]);
  const selectedStepData = tracks[selectedTrack].steps[selectedStep];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={S.root}>
      {/* TOP BAR */}
      <View style={S.topBar}>
        <View style={S.brand}>
          <Text style={S.brandText}>PHASE</Text>
          <View style={[S.statusDot, { backgroundColor: ready ? (engineMode === "PLAYING" ? "#55e6d2" : "#9b6cff") : "#555" }]} />
        </View>

        <View style={S.bpmRow}>
          <TouchableOpacity style={S.nudgeBtn} onPress={() => setBpm((v) => clamp(v - 1, 60, 200))}>
            <Text style={S.nudgeTxt}>−</Text>
          </TouchableOpacity>
          <View style={S.bpmBox}>
            <Text style={S.bpmNum}>{bpm}</Text>
            <Text style={S.bpmLbl}>BPM</Text>
          </View>
          <TouchableOpacity style={S.nudgeBtn} onPress={() => setBpm((v) => clamp(v + 1, 60, 200))}>
            <Text style={S.nudgeTxt}>+</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[S.playBtn, engineMode === "PLAYING" && S.stopBtn]}
          onPress={engineMode === "PLAYING" ? () => stop() : start}
        >
          <Text style={S.playTxt}>{engineMode === "PLAYING" ? "■" : "▶"}</Text>
        </TouchableOpacity>
      </View>

      {/* PANEL TABS */}
      <View style={S.tabs}>
        {(["SEQ", "MOD", "EQ", "FX", "PERF"] as const).map((p) => (
          <TouchableOpacity key={p} style={[S.tab, activePanel === p && S.tabOn]} onPress={() => setActivePanel(p)}>
            <Text style={[S.tabTxt, activePanel === p && S.tabTxtOn]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── SEQUENCER PANEL ── */}
        {activePanel === "SEQ" && (
          <>
            {/* Track selector */}
            <View style={S.trackSelector}>
              {TRACKS.map((t) => {
                const col = COLORS[t];
                const active = selectedTrack === t;
                const muted = (anySolo && !tracks[t].solo) || tracks[t].mute;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[S.trackTab, active && { backgroundColor: col.dim, borderColor: col.accent }]}
                    onPress={() => setSelectedTrack(t)}
                  >
                    <View style={[S.trackTabDot, { backgroundColor: col.accent, opacity: muted ? 0.3 : 1 }]} />
                    <Text style={[S.trackTabTxt, active && { color: col.accent }]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Selected track header */}
            <View style={S.trackHeader}>
              <View style={S.trackHeaderLeft}>
                <View style={[S.trackDot, { backgroundColor: COLORS[selectedTrack].accent }]} />
                <Text style={S.trackName}>{selectedTrack}</Text>
              </View>
              <View style={S.trackHeaderRight}>
                <TouchableOpacity style={[S.ctrlBtn, tracks[selectedTrack].mute && S.muteOn]} onPress={() => toggleMute(selectedTrack)}>
                  <Text style={S.ctrlBtnTxt}>M</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.ctrlBtn, tracks[selectedTrack].solo && S.soloOn]} onPress={() => toggleSolo(selectedTrack)}>
                  <Text style={S.ctrlBtnTxt}>S</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.ctrlBtn} onPress={() => setVolume(selectedTrack, -0.05)}>
                  <Text style={S.ctrlBtnTxt}>−</Text>
                </TouchableOpacity>
                <Text style={S.volTxt}>{Math.round(tracks[selectedTrack].volume * 100)}</Text>
                <TouchableOpacity style={S.ctrlBtn} onPress={() => setVolume(selectedTrack, 0.05)}>
                  <Text style={S.ctrlBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Length */}
            <View style={S.lengthBar}>
              <Text style={S.lengthLbl}>STEPS</Text>
              <TouchableOpacity style={S.lengthNudge} onPress={() => nudgeLength(selectedTrack, -1)}>
                <Text style={S.lengthNudgeTxt}>−</Text>
              </TouchableOpacity>
              <Text style={S.lengthVal}>{tracks[selectedTrack].length}</Text>
              <TouchableOpacity style={S.lengthNudge} onPress={() => nudgeLength(selectedTrack, 1)}>
                <Text style={S.lengthNudgeTxt}>+</Text>
              </TouchableOpacity>
              {[4, 8, 12, 16].map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[S.lengthChip, tracks[selectedTrack].length === v && { backgroundColor: COLORS[selectedTrack].dim, borderColor: COLORS[selectedTrack].accent }]}
                  onPress={() => setTrackLength(selectedTrack, v)}
                >
                  <Text style={S.lengthChipTxt}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* STEP GRID with drag paint */}
            <StepGrid
              track={selectedTrack}
              trackState={tracks[selectedTrack]}
              activeStep={activeStep}
              selectedStep={selectedStep}
              onSelect={selectRegionPoint}
              onToggle={toggleStep}
              onPaint={paintStep}
              regionStart={regionStart}
              regionEnd={regionEnd}
            />

            {/* Step detail */}
            {selectedStepData && (
              <View style={S.stepDetail}>
                <Text style={S.stepDetailTitle}>STEP {selectedStep + 1} · {selectedTrack}</Text>
                <View style={S.stepDetailRow}>
                  <TouchableOpacity style={S.detailBtn} onPress={() => cycleVelocity(selectedTrack, selectedStep)}>
                    <Text style={S.detailBtnLbl}>VEL</Text>
                    <Text style={S.detailBtnVal}>{selectedStepData.velocity}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.detailBtn} onPress={() => cycleProbability(selectedTrack, selectedStep)}>
                    <Text style={S.detailBtnLbl}>PROB</Text>
                    <Text style={S.detailBtnVal}>{selectedStepData.probability}%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.detailBtn} onPress={() => cycleRatchet(selectedTrack, selectedStep)}>
                    <Text style={S.detailBtnLbl}>RATCH</Text>
                    <Text style={S.detailBtnVal}>×{selectedStepData.ratchet}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.detailBtn} onPress={() => triggerSound(selectedTrack, selectedStepData)}>
                    <Text style={S.detailBtnLbl}>TEST</Text>
                    <Text style={S.detailBtnVal}>▶</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* All tracks mini view */}
            <View style={S.allTracksWrap}>
              {TRACKS.filter((t) => t !== selectedTrack).map((t) => (
                <TouchableOpacity key={t} onPress={() => setSelectedTrack(t)}>
                  <MiniGrid track={t} trackState={tracks[t]} activeStep={activeStep} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Pattern actions */}
            <View style={S.actionRow}>
              <TouchableOpacity style={[S.actionBtn, S.actionPrimary]} onPress={randomize}>
                <Text style={S.actionTxt}>RANDOM</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.actionBtn} onPress={() => densityRandom(selectedTrack, 10)}>
                <Text style={S.actionTxt}>MORE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.actionBtn} onPress={() => densityRandom(selectedTrack, -10)}>
                <Text style={S.actionTxt}>LESS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.actionBtn} onPress={() => duplicatePattern(selectedTrack)}><Text style={S.actionTxt}>DUP</Text></TouchableOpacity><TouchableOpacity style={S.actionBtn} onPress={copyRegion}><Text style={S.actionTxt}>COPY</Text></TouchableOpacity><TouchableOpacity style={S.actionBtn} onPress={pasteRegion}><Text style={S.actionTxt}>PASTE</Text></TouchableOpacity><TouchableOpacity style={S.actionBtn} onPress={() => fillRegion(2)}><Text style={S.actionTxt}>FILL2</Text></TouchableOpacity><TouchableOpacity style={S.actionBtn} onPress={() => fillRegion(4)}><Text style={S.actionTxt}>FILL4</Text></TouchableOpacity><TouchableOpacity style={S.actionBtn} onPress={randomizeRegion}><Text style={S.actionTxt}>RAND REG</Text></TouchableOpacity>
              <TouchableOpacity style={S.actionBtn} onPress={clearPattern}>
                <Text style={S.actionTxt}>CLEAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.actionBtn} onPress={resetPattern}>
                <Text style={S.actionTxt}>RESET</Text>
              </TouchableOpacity>
            </View>

            {/* Presets */}
            <View style={S.presetRow}>
              {(["A", "B", "C"] as const).map((slot) => (
                <View key={slot} style={S.presetCard}>
                  <Text style={S.presetLbl}>SLOT {slot}</Text>
                  <View style={S.presetBtns}>
                    <TouchableOpacity style={S.presetBtn} onPress={() => savePreset(slot)}>
                      <Text style={S.presetBtnTxt}>SAVE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[S.presetBtn, !presets[slot] && S.presetBtnDim]}
                      onPress={() => loadPreset(slot)}
                    >
                      <Text style={S.presetBtnTxt}>LOAD</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── MOD PANEL ── */}
        {activePanel === "MOD" && (
          <View style={S.panelWrap}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionTitle}>SYNTH MODULATION</Text>
              <TouchableOpacity style={S.smallBtn} onPress={randomizeSynthPatch}>
                <Text style={S.smallBtnTxt}>RANDOM PATCH</Text>
              </TouchableOpacity>
            </View>
            <MacroGrid>
              {(Object.entries(synthMod) as Array<[keyof SynthModState, number]>).map(([k, v]) => (
                <MacroKnob
                  key={k}
                  label={k.toUpperCase().replace("LFO", "LFO ")}
                  value={v}
                  onMinus={() => setSynthMod((p) => ({ ...p, [k]: clamp(p[k] - 5, 0, 100) }))}
                  onPlus={() => setSynthMod((p) => ({ ...p, [k]: clamp(p[k] + 5, 0, 100) }))}
                />
              ))}
            </MacroGrid>
          </View>
        )}

        {/* ── EQ PANEL ── */}
        {activePanel === "EQ" && (
          <View style={S.panelWrap}>
            <Text style={S.sectionTitle}>SYNTH EQ</Text>
            <MacroGrid>
              {(Object.entries(synthEq) as Array<[keyof SynthEqState, number]>).map(([k, v]) => (
                <MacroKnob
                  key={k}
                  label={k.toUpperCase()}
                  value={v}
                  onMinus={() => setSynthEq((p) => ({ ...p, [k]: clamp(p[k] - 5, 0, 100) }))}
                  onPlus={() => setSynthEq((p) => ({ ...p, [k]: clamp(p[k] + 5, 0, 100) }))}
                />
              ))}
            </MacroGrid>

            <Text style={[S.sectionTitle, { marginTop: 24 }]}>MASTER</Text>
            <MacroGrid>
              {(Object.entries(macros) as Array<[keyof MacroState, number]>).map(([k, v]) => (
                <MacroKnob
                  key={k}
                  label={k.toUpperCase()}
                  value={v}
                  onMinus={() => setMacros((p) => ({ ...p, [k]: clamp(p[k] - 5, 0, 100) }))}
                  onPlus={() => setMacros((p) => ({ ...p, [k]: clamp(p[k] + 5, 0, 100) }))}
                />
              ))}
            </MacroGrid>
          </View>
        )}

        {/* ── FX PANEL ── */}
        {activePanel === "FX" && (
          <View style={S.panelWrap}>
            <Text style={S.sectionTitle}>PERFORMANCE FX</Text>
            <View style={S.fxGrid}>
              {([
                { id: "STUTTER", label: "STUTTER", desc: "Rapid repeats" },
                { id: "REPEAT", label: "BEAT REP", desc: "Beat repeat" },
                { id: "FILTER", label: "FILTER", desc: "Filter sweep" },
                { id: "TAPE", label: "TAPE STOP", desc: "Drop effect" },
                { id: "GLITCH", label: "GLITCH", desc: "Random drops" },
              ] as Array<{ id: PerformanceFx; label: string; desc: string }>).map((fx) => (
                <TouchableOpacity
                  key={fx.id}
                  style={[S.fxBtn, activeFx === fx.id && S.fxBtnOn]}
                  onPress={() => setActiveFx(activeFx === fx.id ? null : fx.id)}
                >
                  <Text style={[S.fxBtnLbl, activeFx === fx.id && S.fxBtnLblOn]}>{fx.label}</Text>
                  <Text style={S.fxBtnDesc}>{fx.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeFx && (
              <View style={S.fxIntensity}>
                <Text style={S.fxIntLbl}>INTENSITY · {Math.round(fxIntensity * 100)}%</Text>
                <View style={S.fxIntRow}>
                  <TouchableOpacity style={S.fxIntBtn} onPress={() => setFxIntensity((v) => clamp(v - 0.1, 0, 1))}>
                    <Text style={S.fxIntBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <View style={S.fxIntBar}>
                    <View style={[S.fxIntFill, { width: `${fxIntensity * 100}%` as any }]} />
                  </View>
                  <TouchableOpacity style={S.fxIntBtn} onPress={() => setFxIntensity((v) => clamp(v + 0.1, 0, 1))}>
                    <Text style={S.fxIntBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={[S.sectionTitle, { marginTop: 24 }]}>MASTER MACROS</Text>
            <MacroGrid>
              {(Object.entries(macros) as Array<[keyof MacroState, number]>).map(([k, v]) => (
                <MacroKnob
                  key={k}
                  label={k.toUpperCase()}
                  value={v}
                  onMinus={() => setMacros((p) => ({ ...p, [k]: clamp(p[k] - 5, 0, 100) }))}
                  onPlus={() => setMacros((p) => ({ ...p, [k]: clamp(p[k] + 5, 0, 100) }))}
                />
              ))}
            </MacroGrid>
          </View>
        )}

        {/* ── PERF PANEL ── */}
        {activePanel === "PERF" && (
          <View style={S.panelWrap}>
            <Text style={S.sectionTitle}>PERFORMANCE XY</Text>
            <View style={S.xyPad} onLayout={(e) => { xyLayoutRef.current = e.nativeEvent.layout; }} {...xyPanResponder.panHandlers}>
              <View style={S.xyGrid} pointerEvents="none">
                {Array.from({ length: 3 }, (_, i) => (
                  <View key={i} style={[S.xyGridLine, { left: `${(i + 1) * 25}%` as any }]} />
                ))}
                {Array.from({ length: 3 }, (_, i) => (
                  <View key={i} style={[S.xyGridLineH, { top: `${(i + 1) * 25}%` as any }]} />
                ))}
              </View>
              <View
                style={[
                  S.xyCursor,
                  {
                    left: `${xy.x * 100}%` as any,
                    top: `${(1 - xy.y) * 100}%` as any,
                  },
                ]}
              />
              <Text style={S.xyLabel}>FILTER {macros.filter}  ←→</Text>
              <Text style={S.xyLabelB}>SPACE {macros.space}  ↕</Text>
            </View>

            <View style={S.xyReadout}>
              <View style={S.xyReadCell}>
                <Text style={S.xyReadLbl}>FILTER</Text>
                <Text style={S.xyReadVal}>{macros.filter}</Text>
              </View>
              <View style={S.xyReadCell}>
                <Text style={S.xyReadLbl}>SPACE</Text>
                <Text style={S.xyReadVal}>{macros.space}</Text>
              </View>
              <View style={S.xyReadCell}>
                <Text style={S.xyReadLbl}>X</Text>
                <Text style={S.xyReadVal}>{Math.round(xy.x * 100)}</Text>
              </View>
              <View style={S.xyReadCell}>
                <Text style={S.xyReadLbl}>Y</Text>
                <Text style={S.xyReadVal}>{Math.round(xy.y * 100)}</Text>
              </View>
            </View>

            <Text style={[S.sectionTitle, { marginTop: 24 }]}>PERFORMANCE PADS</Text>
            <View style={S.perfPads}>
              {TRACKS.map((t) => {
                const col = COLORS[t];
                const muted = (anySolo && !tracks[t].solo) || tracks[t].mute;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[S.perfPad, { borderColor: col.accent, shadowColor: col.glow }, muted && { opacity: 0.35 }]}
                    onPress={() => triggerSound(t, tracks[t].steps[0])}
                  >
                    <View style={[S.perfPadDot, { backgroundColor: col.accent }]} />
                    <Text style={[S.perfPadTxt, { color: col.accent }]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── StepGrid ─────────────────────────────────────────────────────────────────

function StepGrid({
  track,
  trackState,
  activeStep,
  selectedStep,
  onSelect,
  onToggle,
  onPaint,
  regionStart,
  regionEnd,
}: {
  track: TrackId;
  trackState: TrackState;
  activeStep: number;
  selectedStep: number;
  onSelect: (i: number) => void;
  onToggle: (t: TrackId, i: number) => void;
  onPaint: (t: TrackId, i: number, v: boolean) => void;
  regionStart: number | null;
  regionEnd: number | null;
}) {
  const col = COLORS[track];
  const paintRef = useRef<boolean | null>(null);
  const laneActive = activeStep % trackState.length;
  const bounds = regionStart != null && regionEnd != null ? [Math.min(regionStart, regionEnd), Math.max(regionStart, regionEnd)] : null;

  const CELL_W = (SCREEN_W - 32) / 8 - 4;
  const CELL_H = 52;

  return (
    <View style={G.grid}>
      {Array.from({ length: STEPS }, (_, i) => {
        const step = trackState.steps[i];
        const outside = i >= trackState.length;
        const isPlaying = laneActive === i;
        const isSelected = selectedStep === i;
        const inRegion = bounds ? i >= bounds[0] && i <= bounds[1] : false;

        const probOpacity = step.probability === 100 ? 1 : step.probability === 75 ? 0.78 : step.probability === 50 ? 0.55 : 0.32;

        return (
          <TouchableOpacity
            key={i}
            activeOpacity={0.7}
            style={[
              G.cell,
              { width: CELL_W, height: CELL_H },
              outside && G.cellOutside,
              step.active && !outside && { backgroundColor: col.dim, borderColor: col.accent, opacity: probOpacity },
              isPlaying && G.cellPlaying,
              isSelected && { borderColor: "#fff", borderWidth: 2 }, inRegion && { borderColor:"#55e6d2", borderWidth:2 },
            ]}
            onPress={() => { onToggle(track, i); onSelect(i); }}
            onLongPress={() => onSelect(i)}
            onPressIn={() => { paintRef.current = !step.active; onPaint(track,i,!step.active); }}
          >
            <Text style={[G.beatNum, i % 4 === 0 && G.beatNumAccent]}>{i + 1}</Text>
            {step.active && !outside && (
              <>
                <View style={[G.velBar, { width: `${step.velocity}%` as any, backgroundColor: col.accent }]} />
                {step.ratchet > 1 && <Text style={G.badge}>×{step.ratchet}</Text>}
                {step.probability < 100 && (
                  <View style={G.probDots}>
                    {Array.from({ length: step.probability === 75 ? 1 : step.probability === 50 ? 2 : 3 }, (_, d) => (
                      <View key={d} style={G.probDot} />
                    ))}
                  </View>
                )}
              </>
            )}
            {isPlaying && <View style={[G.playhead, { backgroundColor: col.accent }]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── MiniGrid ─────────────────────────────────────────────────────────────────

function MiniGrid({ track, trackState, activeStep }: { track: TrackId; trackState: TrackState; activeStep: number }) {
  const col = COLORS[track];
  const laneActive = activeStep % trackState.length;
  const MINI_W = (SCREEN_W - 32 - 48) / 16 - 2;

  return (
    <View style={MG.row}>
      <Text style={[MG.lbl, { color: col.accent }]}>{track}</Text>
      <View style={MG.cells}>
        {Array.from({ length: STEPS }, (_, i) => {
          const step = trackState.steps[i];
          const outside = i >= trackState.length;
          const playing = laneActive === i;
          return (
            <View
              key={i}
              style={[
                MG.cell,
                { width: MINI_W },
                step.active && !outside && { backgroundColor: col.accent },
                outside && { opacity: 0.1 },
                playing && { borderColor: "#fff", borderWidth: 1 },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── MacroGrid / MacroKnob ────────────────────────────────────────────────────

function MacroGrid({ children }: { children: React.ReactNode }) {
  return <View style={MK.grid}>{children}</View>;
}

function MacroKnob({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  const pct = value / 100;
  return (
    <View style={MK.card}>
      <Text style={MK.lbl}>{label}</Text>
      <View style={MK.arc}>
        <View style={[MK.arcFill, { width: `${pct * 100}%` as any }]} />
      </View>
      <Text style={MK.val}>{Math.round(value)}</Text>
      <View style={MK.btns}>
        <TouchableOpacity style={MK.btn} onPress={onMinus}><Text style={MK.btnTxt}>−</Text></TouchableOpacity>
        <TouchableOpacity style={MK.btn} onPress={onPlus}><Text style={MK.btnTxt}>+</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050509" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a2a",
    backgroundColor: "#080810",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  bpmRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nudgeBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: "#151525", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#2a2a3a" },
  nudgeTxt: { color: "#fff", fontSize: 20, fontWeight: "900" },
  bpmBox: { backgroundColor: "#0d0d1a", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 4, alignItems: "center", borderWidth: 1, borderColor: "#2a2a3a" },
  bpmNum: { color: "#fff", fontSize: 20, fontWeight: "900" },
  bpmLbl: { color: "#666", fontSize: 9, letterSpacing: 2 },
  playBtn: { width: 54, height: 40, borderRadius: 12, backgroundColor: "#7c4dff", justifyContent: "center", alignItems: "center", shadowColor: "#7c4dff", shadowOpacity: 0.5, shadowRadius: 12 },
  stopBtn: { backgroundColor: "#ff3060", shadowColor: "#ff3060" },
  playTxt: { color: "#fff", fontSize: 20, fontWeight: "900" },

  tabs: { flexDirection: "row", backgroundColor: "#0a0a14", borderBottomWidth: 1, borderBottomColor: "#1a1a2a" },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabOn: { borderBottomWidth: 2, borderBottomColor: "#9b6cff" },
  tabTxt: { color: "#555", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  tabTxtOn: { color: "#9b6cff" },

  trackSelector: { flexDirection: "row", marginTop: 12, gap: 6 },
  trackTab: { flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "#2a2a3a", alignItems: "center", backgroundColor: "#101018", flexDirection: "row", justifyContent: "center", gap: 5 },
  trackTabDot: { width: 6, height: 6, borderRadius: 3 },
  trackTabTxt: { color: "#777", fontSize: 9, fontWeight: "900" },

  trackHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 8 },
  trackHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  trackDot: { width: 10, height: 10, borderRadius: 5 },
  trackName: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 3 },
  trackHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  ctrlBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#151525", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#2a2a3a" },
  ctrlBtnTxt: { color: "#fff", fontSize: 11, fontWeight: "900" },
  muteOn: { backgroundColor: "#ff3060", borderColor: "#ff90a0" },
  soloOn: { backgroundColor: "#48c78e", borderColor: "#9dffda" },
  volTxt: { color: "#aaa", fontSize: 11, fontWeight: "800", minWidth: 24, textAlign: "center" },

  lengthBar: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 },
  lengthLbl: { color: "#555", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  lengthNudge: { width: 26, height: 26, borderRadius: 6, backgroundColor: "#151525", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#2a2a3a" },
  lengthNudgeTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
  lengthVal: { color: "#fff", fontSize: 13, fontWeight: "900", minWidth: 22, textAlign: "center" },
  lengthChip: { paddingHorizontal: 8, height: 26, borderRadius: 6, backgroundColor: "#0f0f18", borderWidth: 1, borderColor: "#2a2a3a", justifyContent: "center", alignItems: "center" },
  lengthChipTxt: { color: "#777", fontSize: 11, fontWeight: "900" },

  stepDetail: { backgroundColor: "#0d0d1a", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#1e1e30" },
  stepDetailTitle: { color: "#777", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  stepDetailRow: { flexDirection: "row", gap: 8 },
  detailBtn: { flex: 1, backgroundColor: "#151525", borderRadius: 8, padding: 8, alignItems: "center", borderWidth: 1, borderColor: "#2a2a3a" },
  detailBtnLbl: { color: "#666", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  detailBtnVal: { color: "#fff", fontSize: 14, fontWeight: "900", marginTop: 2 },

  allTracksWrap: { gap: 5, marginBottom: 12 },

  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "center", marginBottom: 14 },
  actionBtn: { paddingHorizontal: 14, height: 34, borderRadius: 9, backgroundColor: "#151525", justifyContent: "center", borderWidth: 1, borderColor: "#2a2a3a" },
  actionPrimary: { backgroundColor: "#3a1fa8", borderColor: "#7c4dff" },
  actionTxt: { color: "#ddd", fontSize: 10, fontWeight: "900", letterSpacing: 1 },

  presetRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  presetCard: { flex: 1, backgroundColor: "#0d0d1a", borderRadius: 10, borderWidth: 1, borderColor: "#1e1e30", padding: 8, alignItems: "center" },
  presetLbl: { color: "#666", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  presetBtns: { flexDirection: "row", gap: 5 },
  presetBtn: { paddingHorizontal: 10, height: 26, borderRadius: 7, backgroundColor: "#1a1a2a", justifyContent: "center" },
  presetBtnDim: { opacity: 0.3 },
  presetBtnTxt: { color: "#ccc", fontSize: 9, fontWeight: "900" },

  panelWrap: { paddingTop: 14 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sectionTitle: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 4, marginBottom: 12 },
  smallBtn: { paddingHorizontal: 12, height: 30, borderRadius: 8, backgroundColor: "#1a1a2a", justifyContent: "center", borderWidth: 1, borderColor: "#3a3a52" },
  smallBtnTxt: { color: "#aaa", fontSize: 9, fontWeight: "900" },

  fxGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  fxBtn: { width: (SCREEN_W - 32 - 8) / 2 - 4, padding: 14, borderRadius: 14, backgroundColor: "#0f0f1a", borderWidth: 1, borderColor: "#2a2a3a" },
  fxBtnOn: { backgroundColor: "#2a1060", borderColor: "#9b6cff", shadowColor: "#9b6cff", shadowOpacity: 0.4, shadowRadius: 12 },
  fxBtnLbl: { color: "#888", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  fxBtnLblOn: { color: "#9b6cff" },
  fxBtnDesc: { color: "#444", fontSize: 10, marginTop: 3 },
  fxIntensity: { backgroundColor: "#0d0d1a", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#1e1e30", marginBottom: 14 },
  fxIntLbl: { color: "#777", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 10 },
  fxIntRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  fxIntBtn: { width: 36, height: 36, borderRadius: 9, backgroundColor: "#1a1a2a", justifyContent: "center", alignItems: "center" },
  fxIntBtnTxt: { color: "#fff", fontSize: 20, fontWeight: "900" },
  fxIntBar: { flex: 1, height: 8, backgroundColor: "#1a1a2a", borderRadius: 4, overflow: "hidden" },
  fxIntFill: { height: "100%", backgroundColor: "#9b6cff", borderRadius: 4 },

  xyPad: { height: 220, borderRadius: 18, backgroundColor: "#0a0a14", borderWidth: 1, borderColor: "#1e1e30", marginBottom: 12, overflow: "hidden", justifyContent: "flex-end", padding: 12 },
  xyGrid: { ...StyleSheet.absoluteFillObject },
  xyGridLine: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#1a1a2a" },
  xyGridLineH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#1a1a2a" },
  xyCursor: { position: "absolute", width: 28, height: 28, marginLeft: -14, marginTop: -14, borderRadius: 14, backgroundColor: "#9b6cff", borderWidth: 2, borderColor: "#fff", shadowColor: "#9b6cff", shadowOpacity: 0.7, shadowRadius: 14 },
  xyLabel: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  xyLabelB: { color: "#9b6cff", fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  xyReadout: { flexDirection: "row", gap: 8, marginBottom: 20 },
  xyReadCell: { flex: 1, backgroundColor: "#0d0d1a", borderRadius: 8, padding: 8, alignItems: "center", borderWidth: 1, borderColor: "#1e1e30" },
  xyReadLbl: { color: "#555", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  xyReadVal: { color: "#fff", fontSize: 16, fontWeight: "900" },

  perfPads: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  perfPad: { width: (SCREEN_W - 32 - 10) / 2 - 5, height: 80, borderRadius: 16, backgroundColor: "#0d0d1a", borderWidth: 1, justifyContent: "center", alignItems: "center", gap: 8, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  perfPadDot: { width: 14, height: 14, borderRadius: 7 },
  perfPadTxt: { fontSize: 12, fontWeight: "900", letterSpacing: 3 },
});

const G = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 12 },
  cell: {
    borderRadius: 8,
    backgroundColor: "#131320",
    borderWidth: 1,
    borderColor: "#252538",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  cellOutside: { opacity: 0.2, backgroundColor: "#0a0a14", borderStyle: "dashed" },
  cellPlaying: { shadowColor: "#fff", shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  beatNum: { color: "#444", fontSize: 10, fontWeight: "900" },
  beatNumAccent: { color: "#776622" },
  velBar: { position: "absolute", bottom: 0, left: 0, height: 3, borderRadius: 2, opacity: 0.7 },
  badge: { position: "absolute", top: 3, right: 3, color: "#fff", fontSize: 7, fontWeight: "900", backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 3, paddingHorizontal: 2 },
  probDots: { position: "absolute", bottom: 5, flexDirection: "row", gap: 2 },
  probDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.6)" },
  playhead: { position: "absolute", top: 0, left: 0, right: 0, height: 2, borderRadius: 1, opacity: 0.9 },
});

const MG = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  lbl: { width: 40, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  cells: { flex: 1, flexDirection: "row", gap: 2 },
  cell: { height: 14, borderRadius: 3, backgroundColor: "#1a1a28", borderWidth: 1, borderColor: "#252538" },
});

const MK = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  card: {
    width: (SCREEN_W - 32 - 10) / 2 - 5,
    backgroundColor: "#0d0d1a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e1e30",
    padding: 12,
    alignItems: "center",
  },
  lbl: { color: "#666", fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  arc: { width: "80%", height: 6, backgroundColor: "#1a1a2a", borderRadius: 3, overflow: "hidden", marginVertical: 8 },
  arcFill: { height: "100%", backgroundColor: "#9b6cff", borderRadius: 3 },
  val: { color: "#fff", fontSize: 26, fontWeight: "900", marginBottom: 8 },
  btns: { flexDirection: "row", gap: 10 },
  btn: { width: 36, height: 32, borderRadius: 9, backgroundColor: "#1a1a28", justifyContent: "center", alignItems: "center" },
  btnTxt: { color: "#fff", fontSize: 18, fontWeight: "900" },
});