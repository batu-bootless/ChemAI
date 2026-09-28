"use client";

// Chem+ app: Iris's face in voice mode - the user's portrait of Iris (public/robert/robert.webp)
// brought to life on the phone, in real time and without any service.
//
// One WebGL pass redraws the portrait each frame through a displacement field built on points
// measured on the picture (MediaPipe face landmarks, FACE below):
//   · the mouth speaks: how loud the voice is sets how far it opens (the upper lip lifts, the
//     lower lip and the chin drop), and the voice's shape (VoiceShape: its brightness and where
//     its formants sit, read against this voice's usual range) sets how - teeth together for
//     s/ş/z, lips drawn back and a flatter opening for e/i, widest for a, rounded, narrower and
//     fuller lips for o/u, lips closing for m/n. Inside, the opening is drawn like a mouth: the
//     upper teeth tooth by tooth, fixed to the head (so the lips uncover more or less of them),
//     the lower teeth when the lips draw back or the mouth opens wide, the tongue, the dark
//     behind, the wet inner edge of the lips;
//   · the eyes blink (the upper lid comes down over the eye);
//   · the corners of the mouth lift with the mood of what is being said;
//   · the head sways, breathes, tilts to listen, nods while the user talks, looks up to think
//     and bobs with its own speech - while the sky behind it stays put.
// Loudness and shape come from the ref the voice engine writes (the voice's measured level, the
// user's microphone level); without them a speech-like rhythm and made-up vowels stand in.

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { Mood } from "@/lib/ai/personality";
import type { GogglesMode, Loudness } from "./Goggles";

/** Points on the portrait, in its pixels (1086 × 1448). */
const FACE = {
  size: [1086, 1448],
  mouthLeft: [424, 932],
  mouthRight: [684, 924],
  eyeLeft: [419, 666, 60, 17],
  eyeRight: [684, 659, 60, 18],
  chin: 1155,
  neck: 1290,
  headCenter: [555, 690],
  headRadius: [430, 610],
  pivot: [555, 1230],
} as const;

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Sizes inside the mouth are in the portrait's pixels: its mouth is 260 px wide (about 52 mm), so
// about 5 px to the millimetre - a central incisor about 40 px across.
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform float u_px;
uniform vec2 u_ml;
uniform vec2 u_mr;
uniform float u_open;
uniform float u_width;
uniform float u_smile;
uniform float u_jaw;
uniform float u_round;
uniform float u_spread;
uniform float u_fric;
uniform vec4 u_eyeL;
uniform vec4 u_eyeR;
uniform float u_blink;
uniform vec2 u_pivot;
uniform vec2 u_headC;
uniform vec2 u_headR;
uniform float u_rot;
uniform vec2 u_shift;
uniform float u_scale;
uniform float u_chin;
uniform float u_neck;
varying vec2 v_uv;

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// The upper lid comes down over an eye: above the lid, skin taken from just above the eye;
// below it, the eye squeezed into what is left open.
vec2 blinkEye(vec2 q, vec4 e, float b, inout float lash) {
  vec2 local = (q - e.xy) / (e.zw * vec2(1.05, 1.35));
  float mask = 1.0 - smoothstep(0.75, 1.0, length(local));
  if (mask <= 0.0 || b <= 0.001) return q;
  float top = e.y - e.w;
  float bottom = e.y + e.w;
  float lid = top + b * (bottom - top) * 0.96;
  vec2 moved = q;
  if (q.y < lid) {
    moved.y = top - 5.0 - (lid - q.y) * 0.22;
  } else {
    moved.y = bottom - (bottom - q.y) * (bottom - top) / max(bottom - lid, 0.5);
  }
  lash = max(lash, mask * b * (1.0 - smoothstep(0.0, 2.2, abs(q.y - lid))));
  return mix(q, moved, mask);
}

// Which tooth of a row is ax pixels from its middle, given where the first four end (b) and the
// fifth (last): its number (0 = the middle one), where across it (-1 on the side towards the
// middle … 1) and how far it is to the nearest gap between two teeth.
vec3 toothAt(float ax, vec4 b, float last) {
  float lo = 0.0;
  float hi = b.x;
  float index = 0.0;
  if (ax >= b.w) {
    lo = b.w;
    hi = last;
    index = 4.0;
  } else if (ax >= b.z) {
    lo = b.z;
    hi = b.w;
    index = 3.0;
  } else if (ax >= b.y) {
    lo = b.y;
    hi = b.z;
    index = 2.0;
  } else if (ax >= b.x) {
    lo = b.x;
    hi = b.y;
    index = 1.0;
  }
  return vec3(index, (ax - lo) / (hi - lo) * 2.0 - 1.0, min(ax - lo, hi - ax));
}

// How far below the lip line an upper tooth's cutting edge is: the central incisors square with a
// rounder outer corner, the laterals a little shorter and rounder, the canines pointed, the
// premolars shorter still; the whole row curving up towards the sides.
float upperEdge(vec3 tooth, float ax) {
  float u = tooth.y;
  float a = abs(u);
  // Rounded lips push forward and cover more of them.
  float edge = 5.5 - 0.00035 * ax * ax - 6.0 * u_round;
  if (tooth.x < 0.5) {
    edge -= (u < 0.0 ? 0.8 : 2.8) * a * a * a * a;
  } else if (tooth.x < 1.5) {
    edge -= 2.2 + (u < 0.0 ? 1.4 : 3.4) * a * a * a;
  } else if (tooth.x < 2.5) {
    edge -= 0.6 + 4.2 * pow(a, 1.4);
  } else {
    edge -= 3.4 + 2.4 * u * u;
  }
  return edge;
}

// How far below the top of their row a lower tooth's edge is: flat incisors, pointed canines.
float lowerEdge(vec3 tooth) {
  float a = abs(tooth.y);
  if (tooth.x < 1.5) return 1.1 * a * a * a * a;
  return 1.4 + 3.0 * pow(a, 1.4);
}

// Inside the open mouth: y pixels below the lip line, between top (the upper lip) and bottom (the
// lower lip); px pixels from the middle of the teeth; sx from -1 to 1 across the opening.
vec3 insideMouth(float y, float top, float bottom, float px, float sx, vec3 lipUp, vec3 lipDown) {
  float ax = abs(px);
  float h = bottom - top;
  float soft = max(0.8, 0.6 * u_px);
  float middle = 1.0 - smoothstep(0.3, 1.0, abs(sx));

  // The dark of the mouth: deep maroon, deepest in the middle, warmer towards the cheeks.
  vec3 color = mix(vec3(0.21, 0.065, 0.07), vec3(0.1, 0.026, 0.032), middle);

  // The tongue: a rounded hump low behind the lower teeth, more of it the wider the mouth; wet on
  // top, with its middle groove, in the lower lip's shadow below.
  float rise = clamp((h - 10.0) * 0.5, 0.0, 24.0) * (1.0 - 0.7 * u_fric);
  float tongueTop = bottom - rise * (1.0 - 0.55 * sx * sx);
  float tongue = smoothstep(tongueTop - soft, tongueTop + soft, y) * step(0.5, rise);
  vec3 tongueColor = vec3(0.7, 0.3, 0.3) * (0.55 + 0.45 * middle);
  tongueColor *= 1.0 - 0.4 * smoothstep(tongueTop + 2.0, bottom + 2.0, y);
  tongueColor *= 1.0 - 0.1 * exp(-pow(px / 7.0, 2.0));
  tongueColor += vec3(0.16, 0.1, 0.1) * exp(-pow((y - tongueTop - 2.6) / max(1.8, u_px), 2.0)) * middle;
  color = mix(color, tongueColor, tongue);

  // The lower teeth: their edges show above the lower lip when the mouth opens wide or the lips
  // draw back (e, i); for s, ş, z they come up to just under the upper ones.
  vec3 upper = toothAt(ax, vec4(40.0, 70.0, 92.0, 108.0), 121.0);
  float cut = upperEdge(upper, ax);
  vec3 lower = toothAt(ax, vec4(26.0, 52.0, 72.0, 88.0), 100.0);
  float show = 9.0 * smoothstep(0.5, 1.0, u_spread) * smoothstep(8.0, 20.0, h);
  float lowerTop = mix(bottom - show, cut + 1.8, u_fric) + lowerEdge(lower);
  float lowerA = smoothstep(lowerTop - soft, lowerTop + soft, y) * (1.0 - smoothstep(74.0, 90.0, ax));
  vec3 lowerColor = vec3(0.85, 0.81, 0.74) * (0.88 + 0.12 * (1.0 - lower.y * lower.y));
  lowerColor *= 1.0 - 0.15 * (1.0 - smoothstep(0.0, max(1.2, u_px), lower.z));
  lowerColor *= mix(1.0, 0.6, smoothstep(20.0, 80.0, ax));
  lowerColor *= mix(1.0, 0.72, smoothstep(lowerTop, bottom + 1.0, y));
  color = mix(color, lowerColor, lowerA);

  // The upper teeth, in front of everything behind them: bluish where the enamel thins at the
  // edge, rounded across each tooth, a shadow line between them, darker as the arch turns away
  // from the light, shaded under the upper lip.
  float upperA = (1.0 - smoothstep(cut - soft, cut + soft, y)) * (1.0 - smoothstep(104.0, 122.0, ax)) * smoothstep(4.0, 11.0, h);
  vec3 enamel = mix(vec3(0.88, 0.84, 0.77), vec3(0.7, 0.71, 0.73), smoothstep(cut - 3.5, cut, y));
  enamel *= 0.86 + 0.14 * (1.0 - upper.y * upper.y);
  enamel *= 1.0 - (0.12 + 0.3 * smoothstep(cut - 7.0, cut, y)) * (1.0 - smoothstep(0.0, max(1.3, u_px), upper.z));
  enamel *= mix(1.0, 0.55, smoothstep(30.0, 115.0, ax));
  enamel *= 0.6 + 0.4 * smoothstep(top, top + 6.0, y);
  color = mix(color, enamel, upperA);

  // The wet inside of the lips along both edges.
  color = mix(color, lipUp * 0.6, (1.0 - smoothstep(0.0, max(2.6, 1.4 * u_px), y - top)) * 0.9);
  color = mix(color, lipDown * 0.68, (1.0 - smoothstep(0.0, max(2.4, 1.3 * u_px), bottom - y)) * 0.85);

  // Darker into the corners, and when the lips round forward.
  color *= mix(0.5, 1.0, smoothstep(0.0, 0.45, 1.0 - abs(sx))) * (1.0 - 0.2 * u_round);
  return color;
}

void main() {
  vec2 p = v_uv * u_size;

  // The head moves (turns, tilts, bobs) around the neck; the sky around it does not.
  vec2 d = (p - u_headC) / u_headR;
  float wHead = 1.0 - smoothstep(0.95, 1.22, length(d));
  wHead *= 1.0 - smoothstep(u_neck - 60.0, u_neck + 60.0, p.y);
  vec2 inverse = u_pivot + rotate(p - u_shift - u_pivot, -u_rot) / u_scale;
  vec2 q = mix(p, inverse, wHead);

  vec2 mc = (u_ml + u_mr) * 0.5;
  float halfW = (u_mr.x - u_ml.x) * 0.5;
  // The teeth are fixed to the head: the lips move over them.
  float teethX = q.x - mc.x;

  // Mouth width: narrower for o/u, drawn back for e/i and smiles.
  float wMouth = 1.0 - smoothstep(0.75, 1.35, length((q - mc) / vec2(halfW * 1.45, 72.0)));
  q.x = mix(q.x, mc.x + (q.x - mc.x) / u_width, wMouth);

  // The corners lift with a smile (or drop a little).
  float wl = exp(-pow(length((q - u_ml) / vec2(40.0, 30.0)), 2.0));
  float wr = exp(-pow(length((q - u_mr) / vec2(40.0, 30.0)), 2.0));
  q.y += u_smile * (wl + wr);

  float t = clamp((q.x - u_ml.x) / (u_mr.x - u_ml.x), 0.0, 1.0);
  float lip = mix(u_ml.y, u_mr.y, t);

  // Rounded lips push forward and look fuller.
  float band = 1.0 - smoothstep(0.85, 1.3, length((q - vec2(mc.x, lip)) / vec2(halfW * 1.2, 58.0)));
  q.y = lip + (q.y - lip) / (1.0 + 0.16 * u_round * band);

  // The opening: a lens for a with the corners still closed, wider and flatter for e/i, smaller
  // and rounder for o/u.
  float sx = (q.x - mc.x) / (halfW * (0.88 + 0.08 * u_spread - 0.36 * u_round));
  float n = mix(2.0, 3.2, u_spread);
  float m = mix(1.0, 0.9, u_spread) - 0.4 * u_round;
  float profile = abs(sx) < 1.0 ? pow(1.0 - pow(abs(sx), n), m) : 0.0;
  float openH = u_open * profile;
  // The lower lip does most of the moving; the middle of the upper lip stays a touch lower.
  float share = mix(0.22 - 0.03 * u_spread - 0.05 * u_round, 0.25, u_fric);
  float up = openH * share * (1.0 - 0.14 * exp(-pow((q.x - mc.x) / 22.0, 2.0)));
  float down = openH - up;
  float jawX = 1.0 - smoothstep(halfW * 0.85, halfW * 1.9, abs(q.x - mc.x));
  float jaw = u_jaw * jawX;

  vec3 mouth = vec3(0.0);
  float mouthA = 0.0;
  float y = q.y - lip;
  if (y < -up) {
    q.y += up * smoothstep(lip - 85.0, lip, q.y);
  } else if (y > down) {
    float drop = mix(down, jaw, smoothstep(lip, lip + 95.0, q.y));
    drop *= 1.0 - smoothstep(u_chin + 10.0, u_chin + 125.0, q.y);
    q.y -= drop;
  } else {
    vec3 lipUp = texture2D(u_tex, vec2(q.x, lip - 12.0) / u_size).rgb;
    vec3 lipDown = texture2D(u_tex, vec2(q.x, lip + 14.0) / u_size).rgb;
    mouth = insideMouth(y, -up, down, teethX, sx, lipUp, lipDown);
    mouthA = smoothstep(0.0, max(1.1, u_px), min(y + up, down - y)) * smoothstep(0.6, 2.2, openH);
    // At the very edge the lip itself shows through.
    q.y = lip;
  }

  float lash = 0.0;
  q = blinkEye(q, u_eyeL, u_blink, lash);
  q = blinkEye(q, u_eyeR, u_blink, lash);

  vec3 color = texture2D(u_tex, clamp(q / u_size, vec2(0.0), vec2(1.0))).rgb;
  color *= 1.0 - lash * 0.55;
  color = mix(color, mouth, mouthA);
  gl_FragColor = vec4(color, 1.0);
}`;

/** A talking rhythm: syllables about four times a second inside slower phrases. */
function speechEnvelope(t: number): number {
  const syllable = Math.max(0, Math.sin(t * Math.PI * 2 * 3.9 + Math.sin(t * 1.7) * 1.3));
  const phrase = 0.55 + 0.45 * Math.sin(t * 0.8 + 1.1);
  return 0.18 + 0.7 * syllable * phrase;
}

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** A mouth shape: lips drawn back, rounded, teeth together; how wide it opens; lips closing. */
interface Viseme {
  spread: number;
  round: number;
  fric: number;
  open: number;
  close: number;
}

const REST: Viseme = { spread: 0, round: 0, fric: 0, open: 1, close: 0 };

/** Made-up vowels for a voice that reports no shape, about as often as Turkish uses each. */
const VISEMES: { weight: number; viseme: Viseme }[] = [
  { weight: 0.24, viseme: { spread: 0, round: 0, fric: 0, open: 1.2, close: 0 } }, // a
  { weight: 0.22, viseme: { spread: 0.7, round: 0, fric: 0, open: 1, close: 0 } }, // e
  { weight: 0.2, viseme: { spread: 1, round: 0, fric: 0, open: 0.75, close: 0 } }, // i, ı
  { weight: 0.08, viseme: { spread: 0, round: 0.8, fric: 0, open: 1, close: 0 } }, // o, ö
  { weight: 0.12, viseme: { spread: 0, round: 1, fric: 0, open: 0.7, close: 0 } }, // u, ü
  { weight: 0.14, viseme: { spread: 0, round: 0, fric: 1, open: 1, close: 0 } }, // s, ş, z
];

function madeUpViseme(): Viseme {
  let r = Math.random();
  for (const { weight, viseme } of VISEMES) {
    r -= weight;
    if (r <= 0) return viseme;
  }
  return VISEMES[0].viseme;
}

/**
 * A running mean and spread of one of the voice's shape numbers, so a moment is read against
 * this voice's usual range (voices, engines and phones differ) - in standard deviations.
 */
function norm(mean: number, spread: number) {
  let variance = spread * spread;
  return (value: number, learn: boolean) => {
    if (learn) {
      const d = value - mean;
      mean += 0.012 * d;
      variance += 0.012 * (d * d - variance);
    }
    return (value - mean) / Math.sqrt(Math.max(variance, 1e-4));
  };
}

const SMILE: Partial<Record<Mood, number>> = { warm: 9, bright: 12, curious: 5, calm: 3, focus: 2, serious: -2 };

function build(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function RobertAvatar({
  mode,
  level,
  mood,
  label,
  onTap,
}: {
  mode: GogglesMode;
  level: React.RefObject<Loudness>;
  /** The mood of the sentence being said (personality.ts), for the smile. */
  mood?: Mood;
  label: string;
  onTap: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const moodRef = useRef(mood);
  const reduceRef = useRef(reduce);
  // Without WebGL the portrait is shown still (with a gentle bob).
  const [flat, setFlat] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);
  useEffect(() => {
    reduceRef.current = reduce;
  }, [reduce]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, alpha: false });
    const vertex = gl && build(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = gl && build(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl?.createProgram();
    if (!gl || !vertex || !fragment || !program) {
      const id = window.setTimeout(() => setFlat(true), 0);
      return () => window.clearTimeout(id);
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const id = window.setTimeout(() => setFlat(true), 0);
      return () => window.clearTimeout(id);
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform2f(u("u_size"), FACE.size[0], FACE.size[1]);
    gl.uniform2f(u("u_ml"), FACE.mouthLeft[0], FACE.mouthLeft[1]);
    gl.uniform2f(u("u_mr"), FACE.mouthRight[0], FACE.mouthRight[1]);
    gl.uniform4f(u("u_eyeL"), ...FACE.eyeLeft);
    gl.uniform4f(u("u_eyeR"), ...FACE.eyeRight);
    gl.uniform2f(u("u_pivot"), FACE.pivot[0], FACE.pivot[1]);
    gl.uniform2f(u("u_headC"), FACE.headCenter[0], FACE.headCenter[1]);
    gl.uniform2f(u("u_headR"), FACE.headRadius[0], FACE.headRadius[1]);
    gl.uniform1f(u("u_chin"), FACE.chin);
    gl.uniform1f(u("u_neck"), FACE.neck);
    const uPx = u("u_px");
    const uOpen = u("u_open");
    const uWidth = u("u_width");
    const uSmile = u("u_smile");
    const uJaw = u("u_jaw");
    const uRound = u("u_round");
    const uSpread = u("u_spread");
    const uFric = u("u_fric");
    const uBlink = u("u_blink");
    const uRot = u("u_rot");
    const uShift = u("u_shift");
    const uScale = u("u_scale");

    let ready = false;
    const texture = gl.createTexture();
    const image = new Image();
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      ready = true;
    };
    image.onerror = () => setFlat(true);
    image.src = "/robert/robert.webp";

    // The face's state, eased towards where each moment wants it.
    let open = 0;
    let shapeOpen = 1;
    let round = 0;
    let spread = 0;
    let fric = 0;
    let width = 1;
    let smile = 3;
    let rot = 0;
    let shiftX = 0;
    let shiftY = 0;
    let scale = 1;
    let blink = 0;
    let blinkStart = -1;
    let nextBlink = performance.now() + 1800;
    let doubleBlink = false;
    let nod = 0;
    let lastMode = modeRef.current;
    let shake = 0;
    let frame = 0;
    let last = performance.now();
    // Made-up vowels, one a syllable, when the voice reports no shape.
    let madeUp = REST;
    let nextSyllable = 0;
    // The voice's usual range of f1 and f2 (starting from Iris's natural voice), learnt from
    // each new measurement once.
    const f1 = norm(0.12, 0.05);
    const f2 = norm(0.38, 0.1);
    let learntAt = -1;

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
        // How many of the portrait's pixels one pixel on screen covers, for smooth edges.
        gl.uniform1f(uPx, FACE.size[0] / Math.max(1, width));
      }
    };

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0.001, (time - last) / 1000));
      last = time;
      const t = time / 1000;
      const current = modeRef.current;
      const reduced = reduceRef.current;
      if (current !== lastMode) {
        if (current === "error") shake = 1;
        if (current === "speak") nod = 1;
        lastMode = current;
      }
      const ease = (value: number, target: number, speed: number) => value + (target - value) * Math.min(1, dt * speed);

      // Loudness: the measured level while fresh; a speaking rhythm when the voice gives none.
      const source = level.current;
      const fresh = source !== null && time - source.at < 280;
      const speaking = current === "speak";
      const voice = speaking ? (fresh ? source.value : speechEnvelope(t)) : 0;
      const heard = current === "hear" && fresh ? source.value : 0;

      // Lip-sync. Loudness says how far the mouth opens; the voice's shape says how.
      let want = REST;
      if (speaking && voice > 0.1) {
        const shape = fresh ? source.shape : undefined;
        if (shape && shape.f1 !== undefined && shape.f2 !== undefined) {
          // Learn this voice's range from its vowels (loud enough, not hissing), once a sample.
          const learn = source.at !== learntAt && voice > 0.15 && shape.bright < 0.45;
          learntAt = source.at;
          const z1 = f1(shape.f1, learn);
          const z2 = f2(shape.f2, learn);
          const hiss = smoothstep(0.5, 0.85, shape.bright);
          want = {
            fric: hiss,
            // High second formant: e, i. Low second and first: o, u. High first: a, wide open.
            spread: smoothstep(0.1, 0.9, z2) * (1 - hiss),
            round: (1 - smoothstep(-1, -0.25, z2)) * (1 - smoothstep(-0.3, 0.5, z1)) * (1 - hiss),
            // A high first formant opens the jaw (a); i, u keep it nearly closed.
            open: Math.min(1.35, Math.max(0.6, 1 + 0.3 * z1 - 0.12 * Math.max(0, z2))),
            // The dull hum of m, n: the lips come together.
            close: 1 - smoothstep(0.045, 0.075, shape.bright),
          };
        } else {
          if (time > nextSyllable) {
            madeUp = madeUpViseme();
            nextSyllable = time + 140 + Math.random() * 110;
          }
          want = madeUp;
        }
      }
      fric = ease(fric, want.fric, 18);
      spread = ease(spread, want.spread, 16);
      round = ease(round, want.round, 14);
      shapeOpen = ease(shapeOpen, want.open * (1 - 0.6 * want.close), 16);
      // For s, ş, z the lips part a little over teeth that are (almost) together.
      const vowel = Math.min(1.15, voice * shapeOpen * (1 - 0.15 * spread) * (1 - 0.25 * round));
      const openTarget = vowel + (0.4 - vowel) * fric;
      open = ease(open, openTarget, openTarget > open ? 26 : 16);
      // The corners come in as the jaw drops, more when the lips round; back for e/i.
      width = ease(width, 1 - 0.15 * round + 0.07 * spread + 0.03 * fric - 0.05 * open, 14);
      const moodSmile = speaking ? (SMILE[moodRef.current ?? "calm"] ?? 3) : current === "think" ? 0 : current === "error" ? -4 : 5;
      smile = ease(smile, moodSmile, 4);

      // Blinks every few seconds, now and then twice; fewer while thinking.
      if (blinkStart < 0 && time > nextBlink) {
        blinkStart = time;
        doubleBlink = Math.random() < 0.18;
      }
      if (blinkStart >= 0) {
        const phase = (time - blinkStart) / 150;
        blink = phase < 0.45 ? phase / 0.45 : phase < 1 ? 1 - (phase - 0.45) / 0.55 : 0;
        if (phase >= 1) {
          if (doubleBlink) {
            doubleBlink = false;
            blinkStart = time + 90;
          } else {
            blinkStart = -1;
            nextBlink = time + (current === "think" ? 4200 : 2400) + Math.random() * 3800;
          }
        }
      }

      // The head: breathing and a slow sway; a tilt to listen, nods while the user talks, a look
      // up while thinking, a bob with its own syllables, a shake after a failure.
      let wantRot = 0;
      let wantX = 0;
      let wantY = 0;
      if (!reduced) {
        wantRot = 0.012 * Math.sin(t * 0.53) + 0.006 * Math.sin(t * 1.37);
        wantX = 3 * Math.sin(t * 0.41);
        wantY = 2 * Math.sin(t * 0.9);
        if (current === "listen" || current === "hear") wantRot += 0.03;
        if (current === "hear") wantY += 5 * Math.max(0, Math.sin(t * 2.3)) * Math.min(1, heard * 1.6);
        if (current === "think") {
          wantRot -= 0.035;
          wantX += 7;
          wantY -= 7;
        }
        if (speaking) {
          wantY += 5 * open;
          wantRot += 0.02 * Math.sin(t * 2.7) * open;
        }
        if (nod > 0) {
          wantY += 6 * Math.sin((1 - nod) * Math.PI);
          nod = Math.max(0, nod - dt * 2.2);
        }
        if (shake > 0) {
          wantRot += 0.05 * Math.sin(t * 18) * shake;
          shake = Math.max(0, shake - dt * 1.5);
        }
      }
      rot = ease(rot, wantRot, 5);
      shiftX = ease(shiftX, wantX, 4);
      shiftY = ease(shiftY, wantY, 7);
      scale = ease(scale, 1 + (reduced ? 0 : 0.004 * Math.sin(t * 0.9)), 4);

      if (!ready) return;
      resize();
      gl.uniform1f(uOpen, open * 54);
      gl.uniform1f(uJaw, open * 32 * (1 - 0.4 * spread - 0.5 * fric));
      gl.uniform1f(uRound, round);
      gl.uniform1f(uSpread, spread);
      gl.uniform1f(uFric, fric);
      gl.uniform1f(uWidth, width + smile * 0.004);
      gl.uniform1f(uSmile, smile);
      gl.uniform1f(uBlink, blink);
      gl.uniform1f(uRot, rot);
      gl.uniform2f(uShift, shiftX, shiftY);
      gl.uniform1f(uScale, scale);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [level]);

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label}
      title={label}
      className="relative block aspect-[3/4] w-full touch-manipulation select-none overflow-hidden rounded-[36px] bg-[#9EC4F8] shadow-[0_28px_60px_-24px_rgb(40_20_90/0.55),0_0_0_1px_rgb(255_255_255/0.7),0_0_0_6px_rgb(255_255_255/0.35)] outline-none transition-transform duration-150 focus-visible:ring-4 focus-visible:ring-[#8F6CF6]/40 active:scale-[0.98]"
    >
      {flat ? (
        // eslint-disable-next-line @next/next/no-img-element -- a bundled portrait
        <img src="/robert/robert.webp" alt="" className="h-full w-full object-cover" />
      ) : (
        <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
      )}
    </button>
  );
}
