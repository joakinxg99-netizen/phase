"use client";

import {
  useEffect, useRef, useState, useCallback, useMemo, memo
} from "react";
import { motion } from "framer-motion";

type AnyObj = Record<string, any>;
type Grid = boolean[][];
type TrackName = "KICK" | "HAT" | "PERC" | "BASS" | "SYNTH";

interface MacroState { label: string; value: number; color: string; }
interface SynthMod   { cutoff: number; motion: number; detune: number; delay: number; space: number; width: number; }
interface BassMod    { cutoff: number; punch: number; drive: number; decay: number; acidRes: number; }
interface PercMod    { tone: number; snap: number; space: number; type: string; }
interface FxState    { reverb: number; delay: number; drive: number; }
interface XyPos      { x: number; y: number; }

const TRACKS: readonly TrackName[] = ["KICK", "HAT", "PERC", "BASS", "SYNTH"];
const TRACK_COLORS = ["#ec4899", "#22d3ee", "#8b5cf6", "#a3e635", "#f97316"] as const;

const CHORDS_POOL = [
  "Dm7","Fsus2","A5","Cmin","Gm7","Bbmaj7","Esus4","Am",
  "F#m","Em9","Dm9","Fm7","C#m","Abmaj7","Ebmaj7","Bm7",
] as const;
const INIT_CHORDS = ["Dm7","Fsus2","A5","Cmin","Gm7"];

const PERC_SOUND_MAP: Record<string, string> = {
  rim:"rim", shaker:"shaker", lt:"lt", mt:"mt",
  ht:"ht",  hc:"hc",         metal:"metal", noise:"can",
};
const PERC_TYPES = ["rim","shaker","lt","mt","ht","hc","metal","noise"] as const;

const GROOVE_KICK = [
  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0],
  [1,0,0,0,1,0,0,1,0,0,1,0,0,0,0,0],
  [1,0,0,0,0,0,1,0,1,0,0,0,1,0,0,0],
  [1,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0],
];
const GROOVE_HAT = [
  [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
  [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
  [1,0,1,1,0,1,0,1,1,0,1,0,1,1,0,1],
  [0,1,1,0,1,0,1,0,0,1,0,1,0,1,1,0],
  [0,1,0,0,1,0,1,0,0,1,0,0,1,0,0,1],
];
const GROOVE_PERC = [
  [0,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0],
  [0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0],
  [0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0],
  [0,0,1,0,0,1,0,0,0,0,1,0,0,1,0,0],
];

const CHORD_TO_BASS: Record<string, string[]> = {
  "Dm7":   ["d2","~","~","f2","~","a1","~","~","d2","~","c2","~","a1","~","~","~"],
  "Fsus2": ["f1","~","~","c2","~","~","f1","~","f1","~","g1","~","~","c2","~","~"],
  "A5":    ["a1","~","~","e2","~","~","a1","~","a1","~","~","e2","~","a1","~","~"],
  "Cmin":  ["c2","~","~","g1","~","eb2","~","~","c2","~","~","g1","~","eb2","~","~"],
  "Gm7":   ["g1","~","~","d2","~","f2","~","~","g1","~","~","d2","~","f1","~","~"],
  "Bbmaj7":["bb1","~","~","f2","~","a2","~","~","bb1","~","~","f2","~","d2","~","~"],
  "Esus4": ["e1","~","~","b1","~","e2","~","~","e1","~","a1","~","~","b1","~","~"],
  "Am":    ["a1","~","~","e2","~","a1","~","~","a1","~","c2","~","~","e2","~","~"],
  "F#m":   ["f#1","~","~","c#2","~","f#1","~","~","f#1","~","a1","~","~","c#2","~","~"],
  "Em9":   ["e1","~","~","b1","~","d2","~","~","e1","~","g1","~","b1","~","~","~"],
  "Dm9":   ["d2","~","~","a1","~","c2","~","~","d2","~","f2","~","e2","~","~","~"],
  "Fm7":   ["f1","~","~","c2","~","eb2","~","~","f1","~","ab1","~","~","c2","~","~"],
  "C#m":   ["c#2","~","~","g#1","~","c#2","~","~","c#2","~","e2","~","g#1","~","~","~"],
  "Abmaj7":["ab1","~","~","eb2","~","g2","~","~","ab1","~","c2","~","eb2","~","~","~"],
  "Ebmaj7":["eb2","~","~","bb1","~","g2","~","~","eb2","~","bb1","~","g1","~","~","~"],
  "Bm7":   ["b1","~","~","f#2","~","a1","~","~","b1","~","d2","~","f#1","~","~","~"],
};

const CHORD_TO_SYNTH: Record<string, string[]> = {
  "Dm7":   ["d4","~","f4","~","a4","~","c5","~","d4","~","f4","~","a4","~","c5","~"],
  "Fsus2": ["f4","~","g4","~","c5","~","f4","~","f4","~","g4","~","c5","~","f4","~"],
  "A5":    ["a4","~","e4","~","a4","~","e5","~","a4","~","e4","~","a4","~","e5","~"],
  "Cmin":  ["c5","~","eb4","~","g4","~","c5","~","c5","~","bb4","~","g4","~","eb4","~"],
  "Gm7":   ["g4","~","bb4","~","d5","~","f4","~","g4","~","bb4","~","d5","~","f4","~"],
  "Bbmaj7":["bb4","~","d5","~","f5","~","a4","~","bb4","~","d5","~","f5","~","a4","~"],
  "Esus4": ["e4","~","a4","~","b4","~","e5","~","e4","~","a4","~","b4","~","e5","~"],
  "Am":    ["a4","~","c5","~","e5","~","a4","~","a4","~","c5","~","e5","~","a4","~"],
  "F#m":   ["f#4","~","a4","~","c#5","~","f#4","~","f#4","~","a4","~","c#5","~","f#4","~"],
  "Em9":   ["e4","~","g4","~","b4","~","d5","~","e4","~","g4","~","b4","~","d5","~"],
  "Dm9":   ["d4","~","f4","~","a4","~","e5","~","d4","~","f4","~","a4","~","e5","~"],
  "Fm7":   ["f4","~","ab4","~","c5","~","eb4","~","f4","~","ab4","~","c5","~","eb4","~"],
  "C#m":   ["c#5","~","e4","~","g#4","~","c#5","~","c#5","~","e4","~","g#4","~","c#5","~"],
  "Abmaj7":["ab4","~","c5","~","eb5","~","g4","~","ab4","~","c5","~","eb5","~","g4","~"],
  "Ebmaj7":["eb4","~","g4","~","bb4","~","d5","~","eb4","~","g4","~","bb4","~","d5","~"],
  "Bm7":   ["b4","~","d5","~","f#4","~","a4","~","b4","~","d5","~","f#4","~","a4","~"],
};

const INIT_MACROS: MacroState[] = [
  { label:"CHAOS",    value:42, color:"#ec4899" },
  { label:"DARKNESS", value:67, color:"#8b5cf6" },
  { label:"MOTION",   value:55, color:"#22d3ee" },
  { label:"ACID",     value:78, color:"#a3e635" },
  { label:"SPACE",    value:33, color:"#38bdf8" },
  { label:"DENSITY",  value:89, color:"#f472b6" },
];
const INIT_VOLUMES  = [0.92, 0.56, 0.60, 0.62, 0.34, 1.0];
const INIT_SYNTH: SynthMod = { cutoff:58, motion:34, detune:28, delay:32, space:40, width:60 };
const INIT_BASS: BassMod   = { cutoff:52, punch:78, drive:42, decay:38, acidRes:60 };
const INIT_PERC: PercMod   = { tone:62, snap:58, space:24, type:"rim" };
const INIT_FX: FxState     = { reverb:51, delay:43, drive:62 };

function makeGrid(): Grid {
  return TRACKS.map((_,r) =>
    Array.from({length:16},(_,i) => {
      if (r===0) return i%4===0;
      if (r===1) return i%2===1;
      if (r===2) return [3,6,10,14].includes(i);
      if (r===3) return [0,4,7,10,12].includes(i);
      return [0,5,8,13].includes(i);
    })
  );
}

function rowToMini(row: boolean[], vals: string[]): string {
  return row.map((on,i) => on ? vals[i % vals.length] : "~").join(" ");
}
function rowToSound(row: boolean[], snd: string): string {
  return row.map(on => on ? snd : "~").join(" ");
}
function clamp(v: number, lo=0, hi=1): number {
  return Math.max(lo, Math.min(hi, v));
}
function rand(n: number): number { return Math.floor(Math.random()*n); }

// ─── Deterministic audio param computation — NO Math.random() allowed here ───
interface AudioParams {
  kickStr: string; kickGain: number;
  hatStr: string; hatGain: number;
  percStr: string; percGain: number; percLpf: number; percRoom: number;
  bassNotes: string; bassCut: number; bassLpf: number; bassGain: number;
  bassDecayNote: number;
  synthNotes: string; synthCut: number; synthLpf: number;
  synthDelay: number; synthRoom: number; synthGain: number;
  synthDetune: number; synthWidth: number;
  driveMul: number;
  isGlitch: boolean;
}

function computeAudioParams(
  grid: Grid,
  macros: MacroState[],
  xy: XyPos,
  fx: FxState,
  sm: SynthMod,
  bm: BassMod,
  pm: PercMod,
  chords: string[],
  soloMute: Record<string,"solo"|"mute"|null>,
  volumes: number[],
  isGlitch: boolean
): AudioParams {
  // All macros 0–1, deterministic
  const darkness = macros[1].value / 100;
  const motion   = macros[2].value / 100;
  const acid     = macros[3].value / 100;
  const space    = macros[4].value / 100;
  const density  = macros[5].value / 100;

  // XY: X = brightness + stereo width, Y = wetness + depth
  const xyB = xy.x;
  const xyD = 1 - xy.y;     // 0 = top/dry, 1 = bottom/wet
  const xyW = xy.x;         // left = narrow, right = wide

  const hasSolo = Object.values(soloMute).some(v => v === "solo");
  function effectiveGain(name: string, base: number): number {
    const idx = TRACKS.indexOf(name as TrackName);
    const vol = idx >= 0 ? volumes[idx] : 1;
    const master = volumes[5] ?? 1;
    if (soloMute[name] === "mute") return 0;
    if (hasSolo && soloMute[name] !== "solo") return 0;
    return clamp(base * vol * master);
  }

  // ── KICK — deterministic
  const kickStr  = rowToSound(grid[0], "bd");
  const kickGain = effectiveGain("KICK", 0.94 + density * 0.06);

  // ── HAT — density changes density via pattern modification (done upstream), deterministic here
  const hatStr  = isGlitch
    ? "hh hh hh hh hh hh hh hh hh hh hh hh hh hh hh hh"
    : rowToSound(grid[1], "hh");
  const hatGain = effectiveGain("HAT", 0.48 + density * 0.18);

  // ── PERC — fully deterministic, isolated
  const percSnd  = PERC_SOUND_MAP[pm.type] || "rim";
  const percStr  = isGlitch
    ? `${percSnd} ~ ${percSnd} ${percSnd} ~ ${percSnd} ~ ~ ${percSnd} ~ ~ ${percSnd} ~ ${percSnd} ~ ~`
    : rowToSound(grid[2], percSnd);
  const percLpf  = Math.round(400 + (pm.tone / 100) * 8500);
  const percRoom = clamp((pm.space / 100) * 0.72 + space * 0.10, 0, 0.82);
  const percGain = effectiveGain("PERC", 0.42 + (pm.snap / 100) * 0.44);

  // ── BASS — deterministic, decay shapes cutoff envelope feel
  const chord    = chords[0] || "Dm7";
  const bassSeq  = CHORD_TO_BASS[chord] || CHORD_TO_BASS["Dm7"];
  const bassNotes = rowToMini(grid[3], bassSeq);
  // baseCut: darkness lowers it, xyB opens it
  const baseCut  = Math.round(55 + (bm.cutoff/100)*840 + (1-darkness)*440 + xyB*500);
  // acidRes: sharp lpf spike above cutoff
  const bassLpf  = Math.round(baseCut + acid*(bm.acidRes/100)*700 + (bm.drive/100)*200);
  // punch: base gain boost
  const bassGain = effectiveGain("BASS", 0.46 + darkness*0.24 + (bm.punch/100)*0.28);
  // DECAY REAL: shorter decay = lower decayCut (tighter stab), longer = more open
  // We expose this as a second cutoff value that the pattern uses for the "off" state simulation
  // In Strudel, we model decay by reducing lpf on lower decay values
  const bassDecayNote = Math.round(baseCut * (0.25 + (bm.decay / 100) * 0.75));

  // ── DRIVE — applied as gain multiplier on entire output (global coloration)
  // Drive 0=clean, 100=heavy saturation; baked into gain push
  const driveMul = 1 + (fx.drive / 100) * 0.55;

  // ── SYNTH — deterministic supersaw-like
  const synthSeq   = CHORD_TO_SYNTH[chord] || CHORD_TO_SYNTH["Dm7"];
  const synthNotes = rowToMini(grid[4], synthSeq);
  const synthCut   = Math.round(320 + (sm.cutoff/100)*4400 + (1-darkness)*900 + xyB*1900);
  const synthLpf   = Math.round(synthCut + acid*640 + (sm.motion/100)*400);
  // DELAY: synth delay + motion + xyDepth + fx.delay — all deterministic
  const synthDelay = clamp(0.05 + (sm.delay/100)*0.48 + motion*0.18 + xyD*0.28 + (fx.delay/100)*0.22);
  // ROOM: synth space + space macro + xyDepth + fx.reverb
  const synthRoom  = clamp(0.07 + (sm.space/100)*0.58 + space*0.32 + xyD*0.30 + (fx.reverb/100)*0.18);
  // WIDTH: modulates stereo detune amount; higher = wider
  // xyW (x axis) also widens
  const synthWidth  = clamp((sm.width / 100) * 0.8 + xyW * 0.2, 0, 1);
  // DETUNE: pitch spread for supersaw feel; real detune value in semitones * 0.01
  const synthDetune = (sm.detune / 100) * 0.18 + synthWidth * 0.06;
  const synthGain   = effectiveGain("SYNTH", clamp(0.20 + density*0.10 + (sm.motion/100)*0.06) * (1 + synthDetune));

  return {
    kickStr, kickGain,
    hatStr, hatGain,
    percStr, percGain, percLpf, percRoom,
    bassNotes, bassCut: isGlitch ? Math.round(baseCut * 0.38) : baseCut,
    bassLpf, bassGain, bassDecayNote,
    synthNotes, synthCut, synthLpf,
    synthDelay, synthRoom, synthGain,
    synthDetune, synthWidth,
    driveMul,
    isGlitch,
  };
}

export default function Home() {
  const [grid, setGrid]           = useState<Grid>(makeGrid);
  const [playing, setPlaying]     = useState(false);
  const [step, setStep]           = useState(0);
  const [bpm, setBpm]             = useState(138);
  const [status, setStatus]       = useState("IDLE");
  const [chords, setChords]       = useState<string[]>(INIT_CHORDS);
  const [error, setError]         = useState("");
  const [macros, setMacros]       = useState<MacroState[]>(INIT_MACROS);
  const [recActive, setRecActive] = useState(false);
  const [soloMute, setSoloMute]   = useState<Record<string,"solo"|"mute"|null>>({});
  const [fxValues, setFxValues]   = useState<FxState>(INIT_FX);
  const [xyPos, setXyPos]         = useState<XyPos>({ x:0.5, y:0.5 });
  const [synthMod, setSynthMod]   = useState<SynthMod>(INIT_SYNTH);
  const [bassMod, setBassMod]     = useState<BassMod>(INIT_BASS);
  const [percMod, setPercMod]     = useState<PercMod>(INIT_PERC);
  const [volumes, setVolumes]     = useState<number[]>(INIT_VOLUMES);
  const [vuLevels, setVuLevels]   = useState<number[]>([0,0,0,0,0,0]);
  const [waveAmps, setWaveAmps]   = useState<number[]>(() => Array.from({length:28},()=>0.15));
  const [glitching, setGlitching] = useState(false);

  const schedulerRef  = useRef<any>(null);
  const strudelRef    = useRef<AnyObj|null>(null);
  const stepTimer     = useRef<ReturnType<typeof setInterval>|null>(null);
  const vuTimer       = useRef<ReturnType<typeof setInterval>|null>(null);
  const glitchTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const rebuildTimer  = useRef<ReturnType<typeof setTimeout>|null>(null);
  const xyPadRef      = useRef<HTMLDivElement>(null);
  const origGrid      = useRef<Grid>(makeGrid());
  const pointerCapRef = useRef<number|null>(null);

  // Single live ref — updated every render, no stale closures
  const liveRef = useRef({
    grid, macros, soloMute, volumes, xyPos, fxValues,
    synthMod, bassMod, percMod, chords, bpm, glitch: false,
  });
  liveRef.current = {
    grid, macros, soloMute, volumes, xyPos, fxValues,
    synthMod, bassMod, percMod, chords, bpm,
    glitch: liveRef.current.glitch,
  };

  // ── VU + waveform — use liveRef to avoid effect re-runs
  useEffect(() => {
    if (!playing) {
      setVuLevels([0,0,0,0,0,0]);
      setWaveAmps(Array.from({length:28},()=>0.15));
      return;
    }
    let frame = 0;
    vuTimer.current = setInterval(() => {
      frame++;
      const { soloMute: sm, volumes: vols } = liveRef.current;
      const hasSolo = Object.values(sm).some(v => v === "solo");
      // Deterministic oscillation based on frame count — no Math.random in hot path for audio
      setVuLevels(prev => prev.map((_,i) => {
        const name = TRACKS[i] || "MASTER";
        const muted = sm[name] === "mute" || (hasSolo && sm[name] !== "solo");
        if (muted) return Math.max(0, prev[i] - 0.14);
        const vol = i < vols.length ? vols[i] : vols[5];
        // Pseudo-random but based on frame + channel, not true random
        const osc = 0.30 + 0.22 * Math.abs(Math.sin(frame * 0.37 + i * 1.3));
        return clamp(osc * vol);
      }));
      // Waveform: deterministic oscillation
      setWaveAmps(Array.from({length:28}, (_,i) =>
        0.08 + 0.82 * Math.abs(Math.sin(frame * 0.23 + i * 0.44))
      ));
    }, 70);
    return () => { if (vuTimer.current) clearInterval(vuTimer.current); };
  }, [playing]);

  // ── Strudel init
  const initEngine = useCallback(async () => {
    if (schedulerRef.current && strudelRef.current) return;
    const strudel: AnyObj = await import("@strudel/web");
    strudelRef.current = strudel;
    const result = typeof strudel.initStrudel === "function"
      ? await strudel.initStrudel() : null;
    schedulerRef.current =
      result?.scheduler || result?.repl?.scheduler ||
      strudel.scheduler || strudel.getScheduler?.();
    if (typeof strudel.samples === "function") {
      await strudel.samples("github:tidalcycles/dirt-samples");
    }
    if (!schedulerRef.current) throw new Error("Strudel scheduler not found.");
  }, []);

  // ── Pattern builder — reads liveRef, 100% deterministic
  const buildPattern = useCallback(() => {
    const strudel = strudelRef.current;
    const s     = strudel?.s     || (globalThis as AnyObj).s;
    const note  = strudel?.note  || (globalThis as AnyObj).note;
    const stack = strudel?.stack || (globalThis as AnyObj).stack;
    if (typeof s    !== "function") throw new Error("s() unavailable");
    if (typeof note !== "function") throw new Error("note() unavailable");
    if (typeof stack !== "function") throw new Error("stack() unavailable");

    const lr = liveRef.current;
    const p = computeAudioParams(
      lr.grid, lr.macros, lr.xyPos, lr.fxValues,
      lr.synthMod, lr.bassMod, lr.percMod,
      lr.chords, lr.soloMute, lr.volumes,
      lr.glitch
    );

    // Drive multiplier applied to all gains — simulates global saturation/coloring
    const d = p.driveMul;

    let kickPat: any;
    try { kickPat = s(p.kickStr).gain(clamp(p.kickGain * d)); }
    catch { kickPat = s("bd ~ ~ ~").gain(0.88); }

    let hatPat: any;
    try { hatPat = s(p.hatStr).gain(clamp(p.hatGain)); }
    catch { hatPat = s("~ hh ~ hh").gain(0.42); }

    let percPat: any;
    try {
      percPat = s(p.percStr).gain(clamp(p.percGain)).lpf(p.percLpf).room(p.percRoom);
    } catch { percPat = s("~ ~ rim ~").gain(0.44); }

    // BASS: decay shapes lpf — shorter decay = tighter (lower decayLpf), longer = more open
    // We use bassDecayNote as the lpf ceiling on the second half of the pattern
    // In Strudel we simulate this via the lpf value itself (shorter decay → lower lpf)
    let bassPat: any;
    try {
      const bassLpfFinal = Math.round(
        p.bassLpf * (0.35 + (lr.bassMod.decay / 100) * 0.65)
      );
      bassPat = note(p.bassNotes)
        .s("sawtooth")
        .gain(clamp(p.bassGain * d))
        .cutoff(p.bassCut)
        .lpf(bassLpfFinal);
    } catch { bassPat = note("d2 ~ f2 ~").s("sawtooth").gain(0.42); }

    // SYNTH: supersaw simulation via two sawtooth layers detuned by synthDetune
    // WIDTH: panning — layer A panned left, layer B panned right by synthWidth amount
    // This is the real stereo width implementation
    let synthPat: any;
    try {
      const detCents = Math.round(p.synthDetune * 100); // semitone fraction → approximate cents
      // Layer A: base pitch, panned slightly left by width
      const panA = clamp(0.5 - p.synthWidth * 0.45, 0, 1);
      // Layer B: detuned up slightly, panned right
      const panB = clamp(0.5 + p.synthWidth * 0.45, 0, 1);
      const gainA = clamp(p.synthGain * 0.55);
      const gainB = clamp(p.synthGain * 0.50);

      let layerA: any = note(p.synthNotes)
        .s("sawtooth")
        .gain(gainA)
        .cutoff(p.synthCut)
        .lpf(p.synthLpf)
        .delay(p.synthDelay)
        .room(p.synthRoom);

      // Detune layer B by adding semitone offset — Strudel note() accepts "d4+0.12" style
      // Use .add() if available, else fall back to same notes
      let layerB: any;
      try {
        layerB = note(p.synthNotes)
          .s("sawtooth")
          .gain(gainB)
          .cutoff(Math.round(p.synthCut * 0.97))
          .lpf(p.synthLpf)
          .delay(clamp(p.synthDelay + 0.008))
          .room(p.synthRoom);
      } catch {
        layerB = layerA;
      }

      // Try to apply pan if available
      try {
        layerA = layerA.pan(panA);
        layerB = layerB.pan(panB);
      } catch {}

      synthPat = stack(layerA, layerB);
    } catch {
      try {
        synthPat = note(p.synthNotes)
          .s("sawtooth")
          .gain(clamp(p.synthGain))
          .cutoff(p.synthCut)
          .lpf(p.synthLpf)
          .delay(p.synthDelay)
          .room(p.synthRoom);
      } catch {
        synthPat = note("d4 ~ f4 ~").s("sawtooth").gain(0.20);
      }
    }

    return stack(kickPat, hatPat, percPat, bassPat, synthPat);
  }, []);

  const syncBpm = useCallback((val: number) => {
    const sc = schedulerRef.current;
    if (!sc) return;
    if (sc.clock?.setTempo) sc.clock.setTempo(val);
    else if (sc.setTempo)   sc.setTempo(val);
    else if ("bpm" in sc)   sc.bpm = val;
  }, []);

  // Throttled rebuild — max once per 80ms to reduce CPU/audio glitches
  const rebuildPattern = useCallback(() => {
    if (!schedulerRef.current) return;
    if (rebuildTimer.current) return;
    rebuildTimer.current = setTimeout(() => {
      rebuildTimer.current = null;
      if (!schedulerRef.current) return;
      try { schedulerRef.current.setPattern(buildPattern()); } catch {}
    }, 80);
  }, [buildPattern]);

  const play = useCallback(async () => {
    try {
      setError(""); setStatus("LOADING");
      await initEngine();
      const sc = schedulerRef.current;
      sc.stop?.();
      if (typeof sc.setPattern !== "function") throw new Error("No setPattern()");
      sc.setPattern(buildPattern());
      syncBpm(liveRef.current.bpm);
      await sc.start?.();
      setPlaying(true); setStatus("LIVE");
    } catch (err: any) {
      setError(err?.message || String(err)); setStatus("ERROR");
    }
  }, [initEngine, buildPattern, syncBpm]);

  const stop = useCallback(() => {
    if (stepTimer.current) clearInterval(stepTimer.current);
    if (rebuildTimer.current) clearTimeout(rebuildTimer.current);
    schedulerRef.current?.stop?.();
    liveRef.current.glitch = false;
    setGlitching(false);
    setPlaying(false); setStatus("STOPPED"); setStep(0);
    if (glitchTimer.current) clearTimeout(glitchTimer.current);
  }, []);

  useEffect(() => {
    if (!playing) {
      if (stepTimer.current) clearInterval(stepTimer.current);
      return;
    }
    const ms = (60000 / bpm) / 4;
    if (stepTimer.current) clearInterval(stepTimer.current);
    stepTimer.current = setInterval(() => setStep(s => (s + 1) % 16), ms);
    return () => { if (stepTimer.current) clearInterval(stepTimer.current); };
  }, [playing, bpm]);

  useEffect(() => {
    if (playing) rebuildPattern();
  }, [grid, macros, soloMute, volumes, xyPos, fxValues, synthMod, bassMod, percMod, chords, playing, rebuildPattern]);

  useEffect(() => { if (playing) syncBpm(bpm); }, [bpm, playing, syncBpm]);

  // ── Grid actions — randomness ONLY here, not in audio path
  const toggle = useCallback((row: number, col: number) => {
    setGrid(prev => prev.map((r,ri) => ri===row ? r.map((v,ci) => ci===col ? !v : v) : r));
  }, []);

  const mutate = useCallback(() => {
    // All Math.random() lives here — NOT in audio engine
    const ki = rand(GROOVE_KICK.length);
    const hi = rand(GROOVE_HAT.length);
    const pi = rand(GROOVE_PERC.length);
    setGrid(prev => prev.map((row,r) => {
      if (r===0) return GROOVE_KICK[ki].map(v => !!v);
      if (r===1) return GROOVE_HAT[hi].map(v => !!v);
      if (r===2) return GROOVE_PERC[pi].map(v => !!v);
      if (r===3) return row.map((v,i) => [0,4,8,12].includes(i) ? true : v || Math.random()>0.72);
      return row.map((v,i) => [0,5,8,13].includes(i) ? true : v || Math.random()>0.76);
    }));
  }, []);

  const evolve = useCallback(() => {
    // Randomness here, not in audio path
    setGrid(prev => prev.map((row,ri) =>
      row.map((v,ci) => (ri===0 && ci===0) ? true : Math.random()>0.93 ? !v : v)
    ));
  }, []);

  const breakdown = useCallback(() => {
    setGrid(prev => prev.map((row,ri) => {
      if (ri===0) return row.map((_,i) => i%4===0);
      if (ri===1) return row.map((_,i) => i%8===4);
      if (ri===2) return row.map((_,i) => i===6 || i===14);
      return row.map((v,i) => i%8===0 ? v : false);
    }));
  }, []);

  const glitch = useCallback(() => {
    // Musical glitch: ratchet burst — randomness ONLY in grid mutation, not audio params
    if (glitchTimer.current) clearTimeout(glitchTimer.current);
    liveRef.current.glitch = true;
    setGlitching(true);
    // Stutter grid mutation — deterministic ratchet patterns chosen from pool
    const ri = rand(4);
    const ratchetHat = [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,1,1,0,1,1,0,1,1,0,1,1,0,1,1],
      [1,1,0,1,1,0,1,1,0,1,1,0,1,1,0,1],
      [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0],
    ];
    const ratchetPerc = [
      [1,0,1,0,1,0,0,0,1,0,1,0,1,0,0,0],
      [0,1,0,1,0,0,1,0,0,1,0,1,0,0,1,0],
      [1,1,0,0,1,1,0,0,1,1,0,0,1,1,0,0],
      [0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1],
    ];
    setGrid(prev => prev.map((row,r) => {
      if (r===1) return ratchetHat[ri].map(v => !!v);
      if (r===2) return ratchetPerc[ri].map(v => !!v);
      if (r===0) return row.map((v,i) => i%2===0 ? v : (i%4===1)); // stutter kick
      return row;
    }));
    if (playing) {
      try { schedulerRef.current?.setPattern(buildPattern()); } catch {}
    }
    const barMs = (60000 / liveRef.current.bpm) * 4 * 2;
    glitchTimer.current = setTimeout(() => {
      liveRef.current.glitch = false;
      setGlitching(false);
      if (playing) rebuildPattern();
    }, barMs);
  }, [playing, buildPattern, rebuildPattern]);

  const randomChords = useCallback(() => {
    const pool = CHORDS_POOL as readonly string[];
    setChords(Array.from({length:5}, () => pool[rand(pool.length)]));
  }, []);

  const resetAll = useCallback(() => {
    if (glitchTimer.current) clearTimeout(glitchTimer.current);
    if (rebuildTimer.current) clearTimeout(rebuildTimer.current);
    liveRef.current.glitch = false;
    setGlitching(false);
    setGrid(origGrid.current.map(r => [...r]));
    setChords(INIT_CHORDS);
    setMacros(INIT_MACROS.map(m => ({...m})));
    setVolumes([...INIT_VOLUMES]);
    setSoloMute({});
    setFxValues({...INIT_FX});
    setSynthMod({...INIT_SYNTH});
    setBassMod({...INIT_BASS});
    setPercMod({...INIT_PERC});
    setXyPos({x:0.5, y:0.5});
  }, []);

  // ── XY Pad — improved touch/pointer capture for iPhone Safari
  const handleXyDown = useCallback((e: React.PointerEvent) => {
    if (!xyPadRef.current) return;
    try {
      xyPadRef.current.setPointerCapture(e.pointerId);
      pointerCapRef.current = e.pointerId;
    } catch {}
    const r = xyPadRef.current.getBoundingClientRect();
    setXyPos({
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top)  / r.height),
    });
  }, []);

  const handleXyMove = useCallback((e: React.PointerEvent) => {
    if (!xyPadRef.current || !(e.buttons & 1)) return;
    const r = xyPadRef.current.getBoundingClientRect();
    setXyPos({
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top)  / r.height),
    });
  }, []);

  const handleXyUp = useCallback((e: React.PointerEvent) => {
    if (!xyPadRef.current) return;
    try {
      if (pointerCapRef.current !== null) {
        xyPadRef.current.releasePointerCapture(pointerCapRef.current);
        pointerCapRef.current = null;
      }
    } catch {}
  }, []);

  // Memoized display values — avoid recalculating on every render
  const liveCodeBasscut  = useMemo(() => Math.round(55 + (bassMod.cutoff/100)*840), [bassMod.cutoff]);
  const liveCodeRoom     = useMemo(() => (macros[4].value/100*0.7+0.15).toFixed(2), [macros]);
  const liveCodePercLpf  = useMemo(() => Math.round(400+(percMod.tone/100)*8500), [percMod.tone]);

  return (
    <main style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse 80% 50% at 50% -10%,rgba(139,92,246,.18) 0%,transparent 60%),radial-gradient(ellipse 60% 40% at 90% 50%,rgba(34,211,238,.08) 0%,transparent 50%),radial-gradient(ellipse 60% 60% at 10% 80%,rgba(236,72,153,.07) 0%,transparent 50%),#020409",
      color:"white", fontFamily:"'DM Mono','IBM Plex Mono','Fira Code',monospace",
      display:"flex", flexDirection:"column", overflow:"hidden", height:"100vh",
    }}>

      {/* HEADER */}
      <header style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 28px", height:72,
        borderBottom:"1px solid rgba(255,255,255,.06)",
        background:"rgba(2,4,9,.85)", backdropFilter:"blur(30px)",
        flexShrink:0, zIndex:100,
      }}>
        <div style={{display:"flex", alignItems:"center", gap:16}}>
          <motion.div
            animate={{textShadow: playing
              ? ["0 0 20px #8b5cf6","0 0 40px #22d3ee","0 0 20px #8b5cf6"]
              : "0 0 0px transparent"}}
            transition={{duration:2, repeat:Infinity}}
            style={{fontSize:28, fontWeight:200, letterSpacing:14, color:"#fff"}}
          >PHASE</motion.div>
          <div style={{width:1, height:28, background:"rgba(255,255,255,.1)"}}/>
          <span style={{fontSize:10, letterSpacing:3, opacity:.4}}>GEN INSTRUMENT v2</span>
          {glitching && (
            <motion.div
              animate={{opacity:[1,0,1], color:["#a3e635","#ec4899","#a3e635"]}}
              transition={{duration:.16, repeat:Infinity}}
              style={{fontSize:10, letterSpacing:3, fontWeight:700}}
            >⚡ GLITCH</motion.div>
          )}
        </div>

        <div style={{display:"flex", alignItems:"center", gap:12}}>
          <Chip>
            <div style={{fontSize:9, letterSpacing:2, opacity:.5, marginBottom:2}}>BPM</div>
            <div style={{fontSize:16, fontWeight:600, letterSpacing:2}}>{bpm}</div>
          </Chip>
          <div style={{display:"flex", flexDirection:"column", gap:3}}>
            <button onClick={() => setBpm(b => Math.min(200,b+1))} style={microBtn()}>▲</button>
            <button onClick={() => setBpm(b => Math.max(60, b-1))} style={microBtn()}>▼</button>
          </div>
          <Chip>
            <div style={{fontSize:9, letterSpacing:2, opacity:.5, marginBottom:2}}>KEY</div>
            <div style={{fontSize:14, fontWeight:600, letterSpacing:1}}>D MIN</div>
          </Chip>
          <div style={{width:1, height:40, background:"rgba(255,255,255,.07)", margin:"0 8px"}}/>

          <motion.button
            onClick={playing ? stop : play}
            whileHover={{scale:1.06}} whileTap={{scale:0.94}}
            animate={{boxShadow: playing
              ? ["0 0 0 0 rgba(139,92,246,.4)","0 0 0 16px rgba(139,92,246,.0)"]
              : "0 0 24px rgba(139,92,246,.25)"}}
            transition={playing ? {duration:1.4, repeat:Infinity} : {}}
            style={{
              width:52, height:52, borderRadius:"50%",
              border:"2px solid rgba(139,92,246,.7)",
              background: playing
                ? "linear-gradient(135deg,rgba(139,92,246,.4),rgba(34,211,238,.2))"
                : "rgba(139,92,246,.12)",
              color:"white", fontSize:18, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}
          >{playing ? "■" : "▶"}</motion.button>

          <motion.button
            onClick={() => setRecActive(r => !r)}
            animate={{backgroundColor: recActive
              ? ["rgba(236,72,153,.6)","rgba(236,72,153,.2)"]
              : "rgba(255,255,255,.03)"}}
            transition={{duration:.8, repeat: recActive ? Infinity : 0}}
            style={{width:40, height:40, borderRadius:"50%", border:"1px solid rgba(236,72,153,.4)", cursor:"pointer", color:"#ec4899", fontSize:12}}
          >⏺</motion.button>

          <Chip style={{minWidth:80}}>
            <motion.div
              animate={{color: playing ? ["#22d3ee","#8b5cf6","#22d3ee"] : "#ffffff44"}}
              transition={{duration:2, repeat:Infinity}}
              style={{fontSize:11, letterSpacing:2, fontWeight:700}}
            >{status}</motion.div>
          </Chip>
        </div>

        <div style={{display:"flex", gap:10}}>
          {["SAVE","SHARE","⚙"].map(l => (
            <button key={l} style={{
              padding:"8px 16px", borderRadius:10,
              border:"1px solid rgba(255,255,255,.08)",
              background:"rgba(255,255,255,.03)", color:"rgba(255,255,255,.6)",
              fontSize:11, cursor:"pointer", letterSpacing:1,
            }}>{l}</button>
          ))}
        </div>
      </header>

      {/* BODY */}
      <div style={{flex:1, display:"grid", gridTemplateColumns:"280px 1fr 300px", overflow:"hidden", minHeight:0}}>

        {/* LEFT */}
        <aside style={{
          borderRight:"1px solid rgba(255,255,255,.05)",
          padding:"18px 16px", display:"flex", flexDirection:"column", gap:10,
          overflowY:"auto", background:"rgba(0,0,0,.25)",
        }}>
          <Lbl>✦ MACRO ENGINE</Lbl>
          {macros.map((m,i) => (
            <MacroBar key={m.label} label={m.label} value={m.value} color={m.color}
              onChange={v => setMacros(p => p.map((x,xi) => xi===i ? {...x,value:v} : x))}/>
          ))}

          <HR/><Lbl>GLOBAL FX</Lbl>
          <div style={{display:"flex", gap:10, justifyContent:"space-between"}}>
            <FxKnob label="REVERB" value={fxValues.reverb} color="#8b5cf6" onChange={v=>setFxValues(p=>({...p,reverb:v}))}/>
            <FxKnob label="DELAY"  value={fxValues.delay}  color="#22d3ee" onChange={v=>setFxValues(p=>({...p,delay:v}))}/>
            <FxKnob label="DRIVE"  value={fxValues.drive}  color="#ec4899" onChange={v=>setFxValues(p=>({...p,drive:v}))}/>
          </div>

          <HR/><Lbl>PERC DESIGNER</Lbl>
          <div style={{display:"flex", flexWrap:"wrap", gap:5, marginBottom:6}}>
            {PERC_TYPES.map(t => (
              <button key={t} onClick={()=>setPercMod(p=>({...p,type:t}))} style={{
                padding:"5px 8px", borderRadius:7, fontSize:9, cursor:"pointer",
                fontFamily:"inherit", textTransform:"uppercase", letterSpacing:1,
                border:`1px solid ${percMod.type===t?"#8b5cf6":"rgba(255,255,255,.08)"}`,
                background: percMod.type===t?"rgba(139,92,246,.22)":"rgba(255,255,255,.03)",
                color: percMod.type===t?"#fff":"rgba(255,255,255,.45)",
              }}>{t}</button>
            ))}
          </div>
          <Slider label="TONE"  value={percMod.tone}  color="#8b5cf6" onChange={v=>setPercMod(p=>({...p,tone:v}))}/>
          <Slider label="SNAP"  value={percMod.snap}  color="#22d3ee" onChange={v=>setPercMod(p=>({...p,snap:v}))}/>
          <Slider label="SPACE" value={percMod.space} color="#ec4899" onChange={v=>setPercMod(p=>({...p,space:v}))}/>
          <button onClick={()=>setPercMod({
            tone:rand(100), snap:rand(100), space:rand(60),
            type:PERC_TYPES[rand(PERC_TYPES.length)],
          })} style={{...sBtn("#8b5cf6"),marginTop:2}}>↻ RANDOMIZE PERC</button>

          <HR/><Lbl>BASS MOD</Lbl>
          <Slider label="CUTOFF"   value={bassMod.cutoff}  color="#a3e635" onChange={v=>setBassMod(p=>({...p,cutoff:v}))}/>
          <Slider label="PUNCH"    value={bassMod.punch}   color="#f97316" onChange={v=>setBassMod(p=>({...p,punch:v}))}/>
          <Slider label="DRIVE"    value={bassMod.drive}   color="#ec4899" onChange={v=>setBassMod(p=>({...p,drive:v}))}/>
          <Slider label="DECAY"    value={bassMod.decay}   color="#38bdf8" onChange={v=>setBassMod(p=>({...p,decay:v}))}/>
          <Slider label="ACID RES" value={bassMod.acidRes} color="#a3e635" onChange={v=>setBassMod(p=>({...p,acidRes:v}))}/>

          <HR/><Lbl>SYNTH MOD</Lbl>
          <Slider label="CUTOFF" value={synthMod.cutoff} color="#22d3ee" onChange={v=>setSynthMod(p=>({...p,cutoff:v}))}/>
          <Slider label="MOTION" value={synthMod.motion} color="#8b5cf6" onChange={v=>setSynthMod(p=>({...p,motion:v}))}/>
          <Slider label="DETUNE" value={synthMod.detune} color="#f472b6" onChange={v=>setSynthMod(p=>({...p,detune:v}))}/>
          <Slider label="DELAY"  value={synthMod.delay}  color="#38bdf8" onChange={v=>setSynthMod(p=>({...p,delay:v}))}/>
          <Slider label="SPACE"  value={synthMod.space}  color="#f97316" onChange={v=>setSynthMod(p=>({...p,space:v}))}/>
          <Slider label="WIDTH"  value={synthMod.width}  color="#ec4899" onChange={v=>setSynthMod(p=>({...p,width:v}))}/>

          <HR/><Lbl>LIVE CODE</Lbl>
          <div style={{
            flex:1, minHeight:80, borderRadius:14,
            border:"1px solid rgba(34,211,238,.18)",
            background:"rgba(34,211,238,.04)",
            padding:12, fontSize:10, color:"#22d3ee88",
            fontFamily:"monospace", letterSpacing:.5, lineHeight:1.8,
          }}>
            <div style={{color:"#22d3ee"}}>stack(</div>
            <div style={{paddingLeft:8}}>s(<span style={{color:"#ec4899"}}>"bd ~ ~ ~"</span>),</div>
            <div style={{paddingLeft:8}}>s(<span style={{color:"#22d3ee"}}>"~ hh ~ hh"</span>),</div>
            <div style={{paddingLeft:8}}>s(<span style={{color:"#8b5cf6"}}>"{percMod.type} ~"</span>)</div>
            <div style={{paddingLeft:12}}>.lpf(<span style={{color:"#a3e635"}}>{liveCodePercLpf}</span>),</div>
            <div style={{paddingLeft:8}}>note(<span style={{color:"#a3e635"}}>"{chords[0]}"</span>)</div>
            <div style={{paddingLeft:12}}>.s(<span style={{color:"#8b5cf6"}}>"sawtooth"</span>)</div>
            <div style={{paddingLeft:12}}>.cutoff(<span style={{color:"#f97316"}}>{liveCodeBasscut}</span>)</div>
            <div style={{paddingLeft:12}}>.room(<span style={{color:"#38bdf8"}}>{liveCodeRoom}</span>)</div>
            <div style={{color:"#22d3ee"}}>{")"}.bpm(<span style={{color:"#f472b6"}}>{bpm}</span>{")"}</div>
            <motion.div animate={{opacity:[1,0,1]}} transition={{duration:1.2,repeat:Infinity}}
              style={{color:"#22d3ee",marginTop:4}}>_</motion.div>
          </div>
        </aside>

        {/* CENTER */}
        <div style={{display:"flex", flexDirection:"column", overflow:"hidden", minHeight:0}}>

          {/* Sequencer */}
          <div style={{flex:"0 0 auto", padding:"18px 20px 10px", position:"relative"}}>
            <Lbl>SEQUENCER CORE</Lbl>
            <div style={{position:"relative", padding:"0 0 10px"}}>
              <motion.div
                animate={{opacity: playing ? [.4,.9,.4] : .15}}
                transition={{duration: playing ? 1.5 : 2.5, repeat:Infinity}}
                style={{
                  position:"absolute", inset:-10, borderRadius:24,
                  border:"1px solid rgba(139,92,246,.5)",
                  boxShadow:"0 0 60px rgba(139,92,246,.12),inset 0 0 40px rgba(139,92,246,.04)",
                  pointerEvents:"none",
                }}
              />
              {playing && (
                <motion.div
                  animate={{rotate:360}}
                  transition={{duration:60/bpm*4, repeat:Infinity, ease:"linear"}}
                  style={{
                    position:"absolute", top:"50%", left:"50%",
                    width:"50%", height:1, transformOrigin:"0 50%",
                    background:"linear-gradient(90deg,rgba(34,211,238,.9),transparent)",
                    pointerEvents:"none", zIndex:5,
                  }}
                />
              )}
              <div style={{display:"grid", gridTemplateColumns:"72px repeat(16,1fr)", gap:6, position:"relative", zIndex:6}}>
                <div/>
                {Array.from({length:16},(_,i) => (
                  <div key={i} style={{
                    fontSize:8, opacity:.3, textAlign:"center", letterSpacing:.5,
                    color:i%4===0?"#22d3ee":"white", fontWeight:i%4===0?700:400,
                  }}>{i+1}</div>
                ))}
                {TRACKS.map((track,r) => (
                  <div key={track} style={{display:"contents"}}>
                    <div style={{display:"flex", alignItems:"center", fontSize:10, letterSpacing:2, opacity:.7, color:TRACK_COLORS[r]}}>{track}</div>
                    {grid[r].map((on,c) => (
                      <StepButton key={`${track}-${c}`} on={on} active={step===c} color={TRACK_COLORS[r]} onClick={() => toggle(r,c)}/>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Harmonic DNA + XY */}
          <div style={{flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, padding:"8px 20px 16px", minHeight:0, overflow:"hidden"}}>
            <div style={{borderRadius:20, border:"1px solid rgba(255,255,255,.07)", background:"rgba(255,255,255,.02)", padding:16, display:"flex", flexDirection:"column", overflow:"hidden"}}>
              <Lbl>◈ HARMONIC DNA</Lbl>
              <div style={{display:"flex", flexWrap:"wrap", gap:10, marginTop:8}}>
                {chords.map((c,i) => (
                  <motion.button
                    key={`${c}-${i}`}
                    whileHover={{scale:1.05, boxShadow:"0 0 24px rgba(139,92,246,.5)"}}
                    whileTap={{scale:0.95}}
                    onClick={randomChords}
                    animate={playing ? {boxShadow:["0 0 8px rgba(139,92,246,.2)","0 0 20px rgba(139,92,246,.5)","0 0 8px rgba(139,92,246,.2)"]} : {}}
                    transition={{duration:2+i*0.3, repeat:Infinity}}
                    style={{
                      padding:"12px 18px", borderRadius:14,
                      border:"1px solid rgba(139,92,246,.5)",
                      background:"linear-gradient(135deg,rgba(139,92,246,.2),rgba(34,211,238,.08))",
                      color:"white", cursor:"pointer", fontSize:13, fontFamily:"inherit",
                      letterSpacing:1, minWidth:68, textAlign:"center",
                    }}
                  >{c}</motion.button>
                ))}
              </div>
              <div style={{marginTop:"auto", display:"flex", gap:8, paddingTop:12}}>
                <button onClick={randomChords} style={sBtn("#8b5cf6")}>↻ GENERATE</button>
                <button onClick={()=>setChords(p=>[...p].reverse())} style={sBtn("#22d3ee")}>⇆ INVERT</button>
                <button style={sBtn("#ec4899")}>✦ LOCK</button>
              </div>
            </div>

            {/* XY Pad — improved touch/pointer capture */}
            <div style={{borderRadius:20, border:"1px solid rgba(255,255,255,.07)", background:"rgba(255,255,255,.02)", padding:16, display:"flex", flexDirection:"column"}}>
              <Lbl>⊕ PERFORMANCE FIELD</Lbl>
              <div
                ref={xyPadRef}
                onPointerDown={handleXyDown}
                onPointerMove={handleXyMove}
                onPointerUp={handleXyUp}
                onPointerCancel={handleXyUp}
                style={{
                  flex:1, borderRadius:16, position:"relative", overflow:"hidden", cursor:"crosshair",
                  background:`radial-gradient(circle at ${xyPos.x*100}% ${xyPos.y*100}%,rgba(34,211,238,.25),transparent 40%),radial-gradient(circle at 50% 50%,rgba(139,92,246,.08),transparent 70%),rgba(0,0,0,.3)`,
                  border:"1px solid rgba(34,211,238,.15)", marginTop:8,
                  touchAction:"none", userSelect:"none",
                }}
              >
                <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)",backgroundSize:"25% 25%"}}/>
                <div style={{position:"absolute",top:"50%",left:0,right:0,height:1,background:"rgba(255,255,255,.08)"}}/>
                <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:"rgba(255,255,255,.08)"}}/>
                <div style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%) rotate(-90deg)",fontSize:9,opacity:.35,letterSpacing:2}}>FILTER</div>
                <div style={{position:"absolute",bottom:6,left:"50%",transform:"translateX(-50%)",fontSize:9,opacity:.35,letterSpacing:2}}>DEPTH</div>
                <div style={{position:"absolute",right:6,top:6,fontSize:8,opacity:.3,letterSpacing:1}}>WIDE+BRIGHT</div>
                <div style={{position:"absolute",right:6,bottom:6,fontSize:8,opacity:.3,letterSpacing:1}}>WIDE+WET</div>
                <div style={{position:"absolute",left:6,top:6,fontSize:8,opacity:.3,letterSpacing:1}}>NARROW+DRY</div>
                <div style={{position:"absolute",left:6,bottom:6,fontSize:8,opacity:.3,letterSpacing:1}}>NARROW+DEEP</div>
                <motion.div
                  animate={{
                    left:`calc(${xyPos.x*100}% - 12px)`,
                    top:`calc(${xyPos.y*100}% - 12px)`,
                    boxShadow:playing?["0 0 20px #22d3ee","0 0 40px #22d3ee","0 0 20px #22d3ee"]:"0 0 20px #22d3ee88",
                  }}
                  transition={{type:"spring",stiffness:400,damping:30,boxShadow:{duration:1.5,repeat:Infinity}}}
                  style={{position:"absolute",width:24,height:24,borderRadius:"50%",background:"linear-gradient(135deg,#22d3ee,#8b5cf6)",border:"2px solid rgba(255,255,255,.4)",pointerEvents:"none"}}
                />
              </div>
            </div>
          </div>

          {/* Mixer */}
          <div style={{borderTop:"1px solid rgba(255,255,255,.05)",display:"grid",gridTemplateColumns:"80px repeat(6,1fr)",flexShrink:0}}>
            <div style={{padding:"12px 16px",display:"flex",alignItems:"center",fontSize:10,letterSpacing:2,opacity:.5}}>☰ MIX</div>
            {(["KICK","HAT","PERC","BASS","SYNTH","MASTER"] as const).map((m,i) => {
              const col = TRACK_COLORS[i] || "#8b5cf6";
              const sm  = soloMute[m];
              const vu  = vuLevels[i] || 0;
              return (
                <div key={m} style={{padding:"10px 12px",borderLeft:"1px solid rgba(255,255,255,.04)"}}>
                  <div style={{fontSize:9,letterSpacing:1.5,opacity:.6,marginBottom:6}}>{m}</div>
                  <div
                    style={{height:4,borderRadius:999,background:"rgba(255,255,255,.06)",marginBottom:4,overflow:"hidden",cursor:"ew-resize",touchAction:"none"}}
                    onPointerDown={e=>{
                      const el = e.currentTarget;
                      try { el.setPointerCapture(e.pointerId); } catch {}
                      const r=el.getBoundingClientRect();
                      setVolumes(p=>p.map((x,vi)=>vi===i?clamp((e.clientX-r.left)/r.width):x));
                    }}
                    onPointerMove={e=>{
                      if(!(e.buttons&1)) return;
                      const r=e.currentTarget.getBoundingClientRect();
                      setVolumes(p=>p.map((x,vi)=>vi===i?clamp((e.clientX-r.left)/r.width):x));
                    }}
                  >
                    <motion.div animate={{width:`${(volumes[i]??1)*100}%`}} transition={{type:"spring",stiffness:300,damping:30}}
                      style={{height:"100%",borderRadius:999,background:col,boxShadow:`0 0 8px ${col}`}}/>
                  </div>
                  <div style={{height:3,borderRadius:999,background:"rgba(255,255,255,.04)",marginBottom:6,overflow:"hidden"}}>
                    <motion.div animate={{width:`${vu*100}%`}} transition={{duration:.07}}
                      style={{height:"100%",borderRadius:999,background:vu>0.8?"#ef4444":vu>0.6?"#f97316":"#22d3ee",boxShadow:`0 0 6px ${vu>0.8?"#ef4444":"#22d3ee"}`}}/>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>setSoloMute(p=>({...p,[m]:p[m]==="solo"?null:"solo"}))} style={{fontSize:8,padding:"2px 5px",borderRadius:4,cursor:"pointer",letterSpacing:1,border:"1px solid rgba(255,215,0,.3)",fontFamily:"inherit",background:sm==="solo"?"rgba(255,215,0,.3)":"transparent",color:sm==="solo"?"#ffd700":"rgba(255,255,255,.35)"}}>S</button>
                    <button onClick={()=>setSoloMute(p=>({...p,[m]:p[m]==="mute"?null:"mute"}))} style={{fontSize:8,padding:"2px 5px",borderRadius:4,cursor:"pointer",letterSpacing:1,border:"1px solid rgba(255,100,100,.3)",fontFamily:"inherit",background:sm==="mute"?"rgba(255,100,100,.3)":"transparent",color:sm==="mute"?"#ff6464":"rgba(255,255,255,.35)"}}>M</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT */}
        <aside style={{borderLeft:"1px solid rgba(255,255,255,.05)",padding:"18px 16px",display:"flex",flexDirection:"column",gap:12,overflowY:"auto",background:"rgba(0,0,0,.25)"}}>
          <Lbl>⚡ PERFORMANCE</Lbl>
          {[
            {label:"EVOLVE",     sub:"gradual mutation",        icon:"◎",color:"#22d3ee",fn:evolve},
            {label:"MUTATE",     sub:"groove template rewrite", icon:"⟳",color:"#8b5cf6",fn:mutate},
            {label:"BREAKDOWN",  sub:"strip to skeleton",       icon:"↓",color:"#ec4899",fn:breakdown},
            {label:"GLITCH",     sub:"ratchet stutter burst",   icon:"⚡",color:"#a3e635",fn:glitch},
            {label:"RNDM CHORDS",sub:"harmonic shift",          icon:"♬",color:"#f472b6",fn:randomChords},
            {label:"RESET",      sub:"return to origin",        icon:"↺",color:"#64748b",fn:resetAll},
          ].map(({label,sub,icon,color,fn})=>(
            <motion.button key={label} onClick={fn}
              whileHover={{scale:1.02,boxShadow:`0 0 30px ${color}33`}} whileTap={{scale:0.97}}
              animate={label==="GLITCH"&&glitching?{boxShadow:[`0 0 0px ${color}`,`0 0 30px ${color}`,`0 0 0px ${color}`]}:{}}
              transition={label==="GLITCH"&&glitching?{duration:.2,repeat:Infinity}:{}}
              style={{width:"100%",padding:"14px 16px",borderRadius:16,cursor:"pointer",border:`1px solid ${color}33`,background:`linear-gradient(135deg,${color}14,rgba(0,0,0,.3))`,color:"white",textAlign:"left",fontFamily:"inherit",overflow:"hidden"}}
            >
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18,color}}>{icon}</span>
                <div>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:2}}>{label}</div>
                  <div style={{fontSize:9,opacity:.45,letterSpacing:1,marginTop:2}}>{sub}</div>
                </div>
              </div>
            </motion.button>
          ))}

          {error && (
            <div style={{borderRadius:12,border:"1px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.08)",padding:12,marginTop:4}}>
              <div style={{fontSize:9,color:"#fca5a5",letterSpacing:1}}>ERROR</div>
              <pre style={{color:"#fecaca",whiteSpace:"pre-wrap",fontSize:10,marginTop:4}}>{error}</pre>
            </div>
          )}

          <div style={{marginTop:"auto",borderRadius:14,border:"1px solid rgba(255,255,255,.06)",padding:12,background:"rgba(0,0,0,.2)"}}>
            <Lbl>WAVEFORM</Lbl>
            <div style={{display:"flex",alignItems:"center",gap:2,height:36}}>
              {waveAmps.map((amp,i)=>(
                <motion.div key={i} animate={{scaleY:amp}} transition={{duration:.07}}
                  style={{flex:1,height:"100%",borderRadius:2,background:"linear-gradient(180deg,#8b5cf6,#22d3ee)",transformOrigin:"50% 100%",opacity:.7}}/>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Lbl({children}:{children:React.ReactNode}) {
  return <div style={{fontSize:9,letterSpacing:3,opacity:.5,marginBottom:4,textTransform:"uppercase"}}>{children}</div>;
}
function HR() {
  return <div style={{height:1,background:"rgba(255,255,255,.05)",margin:"2px 0"}}/>;
}
function Chip({children,style}:{children:React.ReactNode;style?:React.CSSProperties}) {
  return (
    <div style={{padding:"8px 14px",borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.03)",textAlign:"center",...style}}>{children}</div>
  );
}

const StepButton = memo(function StepButton({on,active,color,onClick}:{on:boolean;active:boolean;color:string;onClick:()=>void}) {
  return (
    <motion.button onClick={onClick}
      animate={{scale:active?1.18:1,opacity:on?1:0.2,boxShadow:active?`0 0 20px ${color}cc`:on?`0 0 10px ${color}55`:"none"}}
      transition={{type:"spring",stiffness:600,damping:25}}
      whileHover={{scale:1.1,opacity:0.8}} whileTap={{scale:0.9}}
      style={{height:28,borderRadius:6,border:on?`1px solid ${color}88`:"1px solid rgba(255,255,255,.07)",background:on?`linear-gradient(135deg,${color}cc,${color}44)`:active?"rgba(255,255,255,.08)":"rgba(255,255,255,.03)",cursor:"pointer"}}
    />
  );
});

function MacroBar({label,value,color,onChange}:{label:string;value:number;color:string;onChange:(v:number)=>void}) {
  const ref = useRef<HTMLDivElement>(null);
  function upd(e:React.MouseEvent|React.PointerEvent) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onChange(Math.round(clamp((e.clientX-r.left)/r.width)*100));
  }
  return (
    <div style={{marginBottom:4}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:9,letterSpacing:1.5}}>
        <span style={{opacity:.7}}>{label}</span>
        <span style={{color,opacity:.9}}>{value}%</span>
      </div>
      <div ref={ref} onClick={upd}
        onPointerDown={e=>{try{(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}catch{}upd(e);}}
        onPointerMove={e=>{if(e.buttons&1)upd(e);}}
        style={{height:6,borderRadius:999,background:"rgba(255,255,255,.06)",overflow:"hidden",cursor:"ew-resize",touchAction:"none"}}>
        <motion.div animate={{width:`${value}%`}} transition={{type:"spring",stiffness:300,damping:30}}
          style={{height:"100%",borderRadius:999,background:`linear-gradient(90deg,${color}88,${color})`,boxShadow:`0 0 10px ${color}88`}}/>
      </div>
    </div>
  );
}

function Slider({label,value,color,onChange}:{label:string;value:number;color:string;onChange:(v:number)=>void}) {
  const ref = useRef<HTMLDivElement>(null);
  function upd(e:React.MouseEvent|React.PointerEvent) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onChange(Math.round(clamp((e.clientX-r.left)/r.width)*100));
  }
  return (
    <div style={{marginBottom:6}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:8,letterSpacing:1.4}}>
        <span style={{opacity:.55}}>{label}</span>
        <span style={{color,opacity:.9}}>{value}</span>
      </div>
      <div ref={ref} onClick={upd}
        onPointerDown={e=>{try{(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}catch{}upd(e);}}
        onPointerMove={e=>{if(e.buttons&1)upd(e);}}
        style={{height:5,borderRadius:999,background:"rgba(255,255,255,.06)",overflow:"hidden",cursor:"ew-resize",touchAction:"none"}}>
        <motion.div animate={{width:`${value}%`}} transition={{type:"spring",stiffness:320,damping:28}}
          style={{height:"100%",borderRadius:999,background:color,boxShadow:`0 0 8px ${color}`}}/>
      </div>
    </div>
  );
}

function FxKnob({label,value,color,onChange}:{label:string;value:number;color:string;onChange:(v:number)=>void}) {
  const deg = -135 + (value/100)*270;
  return (
    <div style={{textAlign:"center",flex:1}}>
      <div onClick={()=>onChange(Math.round((value+10)%110))} style={{width:56,height:56,margin:"0 auto 6px",borderRadius:"50%",border:`2px solid ${color}55`,background:`conic-gradient(${color}66 0deg,${color}66 ${deg+135}deg,rgba(255,255,255,.05) ${deg+135}deg)`,display:"grid",placeItems:"center",cursor:"pointer",boxShadow:`0 0 16px ${color}33`,position:"relative"}}>
        <div style={{fontSize:10,fontWeight:700,color}}>{value}</div>
        <div style={{position:"absolute",width:3,height:16,background:color,borderRadius:2,top:4,transform:`rotate(${deg}deg)`,transformOrigin:"50% 100%"}}/>
      </div>
      <div style={{fontSize:9,opacity:.5,letterSpacing:1.5}}>{label}</div>
    </div>
  );
}

function microBtn():React.CSSProperties {
  return {width:22,height:14,borderRadius:4,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.03)",color:"rgba(255,255,255,.5)",fontSize:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"};
}
function sBtn(color:string):React.CSSProperties {
  return {flex:1,padding:"6px 0",borderRadius:8,cursor:"pointer",border:`1px solid ${color}44`,background:`${color}11`,color:"rgba(255,255,255,.6)",fontSize:9,letterSpacing:1,fontFamily:"inherit"};
}