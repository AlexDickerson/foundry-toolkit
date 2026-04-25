// WebGL custom layer that renders a procedural starfield in screen-space
// behind the Golarion globe. Stars are point primitives at NDC positions
// seeded for stability; each star has an independent twinkle phase so they
// shimmer asynchronously rather than pulsing in unison.
//
// Rendering is in screen-space (projection matrix is intentionally ignored),
// so inserting this layer before 'background' means the globe and atmosphere
// paint over it where they occlude — stars appear only in the void.
//
// Usage in player-portal:
//   const firstLayerId = map.getStyle().layers[0]?.id;
//   map.addLayer(createStarsLayer(), firstLayerId);

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MaplibreMap } from 'maplibre-gl';

// ---- Public types -----------------------------------------------------------

export interface StarsOptions {
  /** Stars per million screen pixels. Default: 50. */
  density?: number;
  /**
   * Star colour as linear RGB [r, g, b] in [0, 1].
   * Default: warm white [1.0, 0.97, 0.92].
   */
  color?: [number, number, number];
  /** Point size range [min, max] in CSS pixels. Default: [1.0, 3.0]. */
  sizeRange?: [number, number];
  /** Per-star base brightness range [min, max] in [0, 1]. Default: [0.15, 1.0]. */
  brightnessRange?: [number, number];
  /** Twinkle animation parameters. */
  twinkle?: {
    /** Angular speed in radians per second. Default: 0.8. */
    speed?: number;
    /** Fraction of total alpha that oscillates [0, 1]. Default: 0.15. */
    amplitude?: number;
    /**
     * Fraction of base size that oscillates [0, 1]. Default: 0.3.
     * Each star uses an independent phase so they pulse out-of-sync.
     */
    sizeAmplitude?: number;
  };
  /** Overall opacity multiplier [0, 1]. Default: 0.85. */
  opacity?: number;
}

// Fully-resolved, no optionals — used internally after defaults are applied.
export interface ResolvedStarsOptions {
  density: number;
  color: [number, number, number];
  sizeRange: [number, number];
  brightnessRange: [number, number];
  twinkle: { speed: number; amplitude: number; sizeAmplitude: number };
  opacity: number;
}

// ---- Pure helpers (exported for tests) --------------------------------------

/**
 * Mulberry32 — a fast, well-distributed seeded PRNG.
 * Returns a function that yields floats in [0, 1) with stable output for
 * a given seed across environments.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Merge user-supplied options with sensible defaults. */
export function resolveStarsOptions(opts?: StarsOptions): ResolvedStarsOptions {
  return {
    density: opts?.density ?? 50,
    color: opts?.color ?? [1.0, 0.97, 0.92],
    sizeRange: opts?.sizeRange ?? [1.0, 8.0],
    brightnessRange: opts?.brightnessRange ?? [0.4, 1.0],
    twinkle: {
      speed: opts?.twinkle?.speed ?? 0.8,
      amplitude: opts?.twinkle?.amplitude ?? 0.15,
      sizeAmplitude: opts?.twinkle?.sizeAmplitude ?? 0.3,
    },
    opacity: opts?.opacity ?? 0.85,
  };
}

// ---- GLSL shaders -----------------------------------------------------------
//
// Vertex: positions are raw NDC (no projection matrix) so stars are fixed to
// the screen regardless of globe pan/zoom.  Per-star alpha oscillates with
// sin(time × speed + phase[i]) so each star twinkles at its own rate.
//
// Fragment: circular soft-edged point — smoothstep fade from 0.25→0.5 radius
// gives a gentle glow rather than a hard dot.

const VERT_SRC = /* glsl */ `#version 300 es
precision mediump float;

in vec2 a_pos;
in float a_size;
in float a_phase;
in float a_size_phase;
in float a_brightness;

uniform float u_time;
uniform float u_twinkle_speed;
uniform float u_twinkle_amplitude;
uniform float u_size_amplitude;
uniform float u_opacity;

out float v_alpha;

void main() {
  // Screen-space: ignore the projection matrix entirely.
  gl_Position = vec4(a_pos, 0.0, 1.0);

  // Size pulses independently of brightness using its own per-star phase.
  float size_wave = sin(u_time * u_twinkle_speed + a_size_phase) * u_size_amplitude;
  gl_PointSize = a_size * (1.0 + size_wave);

  // base + sin wave, then scaled by per-star brightness so dim stars stay
  // dim even at peak twinkle and bright stars are fully lit.
  float base = 1.0 - u_twinkle_amplitude;
  float wave = sin(u_time * u_twinkle_speed + a_phase) * u_twinkle_amplitude;
  v_alpha = (base + wave) * a_brightness * u_opacity;
}`;

const FRAG_SRC = /* glsl */ `#version 300 es
precision mediump float;

uniform vec3 u_color;

in float v_alpha;
out vec4 fragColor;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist2 = dot(coord, coord); // dist² — avoids a sqrt

  // Gaussian falloff: bright core, exponential decay outward.
  // No hard edge — the function reaches ~0.018 at the sprite boundary
  // so there's nothing to discard and no circular outline visible.
  float soft = exp(-dist2 * 16.0);
  fragColor = vec4(u_color, v_alpha * soft);
}`;

// ---- WebGL helpers ----------------------------------------------------------

function compileShader(
  gl: WebGL2RenderingContext | WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[shared:stars] Shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// ---- Layer implementation ---------------------------------------------------

// Fixed seed so star positions are identical across reloads.
const STAR_SEED = 0xdeadbeef;

class StarsLayer implements CustomLayerInterface {
  readonly id = 'golarion-stars';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private readonly _opts: ResolvedStarsOptions;
  private _map: MaplibreMap | null = null;
  private _program: WebGLProgram | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _posBuffer: WebGLBuffer | null = null;
  private _sizeBuffer: WebGLBuffer | null = null;
  private _phaseBuffer: WebGLBuffer | null = null;
  private _sizePhaseBuffer: WebGLBuffer | null = null;
  private _brightnessBuffer: WebGLBuffer | null = null;
  private _count = 0;
  private _startTime = 0;

  // Cached uniform locations
  private _uTime: WebGLUniformLocation | null = null;
  private _uTwinkleSpeed: WebGLUniformLocation | null = null;
  private _uTwinkleAmplitude: WebGLUniformLocation | null = null;
  private _uSizeAmplitude: WebGLUniformLocation | null = null;
  private _uOpacity: WebGLUniformLocation | null = null;
  private _uColor: WebGLUniformLocation | null = null;

  constructor(opts?: StarsOptions) {
    this._opts = resolveStarsOptions(opts);
  }

  onAdd(map: MaplibreMap, _gl: WebGL2RenderingContext | WebGLRenderingContext): void {
    this._map = map;
    // MapLibre v5 always provides WebGL2; shadow the union param with the cast.
    const gl = _gl as WebGL2RenderingContext;

    // Build shader program ------------------------------------------------
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) {
      console.warn('[shared:stars] Shader compile failed; starfield will be absent');
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      console.warn('[shared:stars] gl.createProgram() returned null');
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[shared:stars] Program link failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }
    this._program = program;

    // Generate star geometry (seeded → stable across reloads) ------------
    const canvas = map.getCanvas();
    const pixelArea = (canvas.width || 1280) * (canvas.height || 720);
    this._count = Math.max(1, Math.floor((this._opts.density * pixelArea) / 1_000_000));

    const rng = mulberry32(STAR_SEED);
    const positions = new Float32Array(this._count * 2);
    const sizes = new Float32Array(this._count);
    const phases = new Float32Array(this._count);
    const sizePhases = new Float32Array(this._count);
    const brightnesses = new Float32Array(this._count);
    const [minSz, maxSz] = this._opts.sizeRange;
    const [minBr, maxBr] = this._opts.brightnessRange;

    for (let i = 0; i < this._count; i++) {
      positions[i * 2] = rng() * 2 - 1; // x in NDC
      positions[i * 2 + 1] = rng() * 2 - 1; // y in NDC
      sizes[i] = minSz + rng() * (maxSz - minSz);
      phases[i] = rng() * Math.PI * 2; // unique brightness-twinkle phase
      sizePhases[i] = rng() * Math.PI * 2; // independent size-pulse phase
      brightnesses[i] = minBr + rng() * (maxBr - minBr); // static base brightness
    }

    // Upload geometry to GPU via VAO -------------------------------------
    this._vao = gl.createVertexArray();
    if (!this._vao) {
      console.warn('[shared:stars] gl.createVertexArray() returned null');
      return;
    }
    gl.bindVertexArray(this._vao);

    const uploadAttrib = (data: Float32Array, name: string, components: number): WebGLBuffer | null => {
      const buf = gl.createBuffer();
      if (!buf) return null;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, components, gl.FLOAT, false, 0, 0);
      return buf;
    };

    this._posBuffer = uploadAttrib(positions, 'a_pos', 2);
    this._sizeBuffer = uploadAttrib(sizes, 'a_size', 1);
    this._phaseBuffer = uploadAttrib(phases, 'a_phase', 1);
    this._sizePhaseBuffer = uploadAttrib(sizePhases, 'a_size_phase', 1);
    this._brightnessBuffer = uploadAttrib(brightnesses, 'a_brightness', 1);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Cache uniform locations -------------------------------------------
    this._uTime = gl.getUniformLocation(program, 'u_time');
    this._uTwinkleSpeed = gl.getUniformLocation(program, 'u_twinkle_speed');
    this._uTwinkleAmplitude = gl.getUniformLocation(program, 'u_twinkle_amplitude');
    this._uSizeAmplitude = gl.getUniformLocation(program, 'u_size_amplitude');
    this._uOpacity = gl.getUniformLocation(program, 'u_opacity');
    this._uColor = gl.getUniformLocation(program, 'u_color');

    this._startTime = performance.now();

    console.info('[shared:stars] Layer added', {
      count: this._count,
      density: this._opts.density,
      opacity: this._opts.opacity,
      twinkleSpeed: this._opts.twinkle.speed,
      twinkleAmplitude: this._opts.twinkle.amplitude,
    });
  }

  render(_gl: WebGL2RenderingContext | WebGLRenderingContext, _options: CustomRenderMethodInput): void {
    if (!this._program || !this._vao || !this._map) return;
    const gl = _gl as WebGL2RenderingContext;

    const elapsed = (performance.now() - this._startTime) / 1000;

    // Save GL state that we're about to change ---------------------------
    const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevBlendSrcRgb = gl.getParameter(gl.BLEND_SRC_RGB) as number;
    const prevBlendDstRgb = gl.getParameter(gl.BLEND_DST_RGB) as number;
    const prevBlendSrcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA) as number;
    const prevBlendDstAlpha = gl.getParameter(gl.BLEND_DST_ALPHA) as number;

    gl.useProgram(this._program);
    gl.bindVertexArray(this._vao);

    // Stars are screen-space geometry behind the globe — no depth test.
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Set uniforms -------------------------------------------------------
    const { color, twinkle, opacity } = this._opts;
    gl.uniform1f(this._uTime, elapsed);
    gl.uniform1f(this._uTwinkleSpeed, twinkle.speed);
    gl.uniform1f(this._uTwinkleAmplitude, twinkle.amplitude);
    gl.uniform1f(this._uSizeAmplitude, twinkle.sizeAmplitude);
    gl.uniform1f(this._uOpacity, opacity);
    gl.uniform3fv(this._uColor, color);

    gl.drawArrays(gl.POINTS, 0, this._count);

    gl.bindVertexArray(null);

    // Restore GL state ---------------------------------------------------
    if (prevDepthTest) gl.enable(gl.DEPTH_TEST);
    else gl.disable(gl.DEPTH_TEST);

    if (prevBlend) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(prevBlendSrcRgb, prevBlendDstRgb, prevBlendSrcAlpha, prevBlendDstAlpha);
    } else {
      gl.disable(gl.BLEND);
    }

    // Drive continuous animation for the twinkle effect.
    this._map.triggerRepaint();
  }

  onRemove(_map: MaplibreMap, _gl: WebGL2RenderingContext | WebGLRenderingContext): void {
    const gl = _gl as WebGL2RenderingContext;
    if (this._program) {
      gl.deleteProgram(this._program);
      this._program = null;
    }
    if (this._posBuffer) {
      gl.deleteBuffer(this._posBuffer);
      this._posBuffer = null;
    }
    if (this._sizeBuffer) {
      gl.deleteBuffer(this._sizeBuffer);
      this._sizeBuffer = null;
    }
    if (this._phaseBuffer) {
      gl.deleteBuffer(this._phaseBuffer);
      this._phaseBuffer = null;
    }
    if (this._sizePhaseBuffer) {
      gl.deleteBuffer(this._sizePhaseBuffer);
      this._sizePhaseBuffer = null;
    }
    if (this._brightnessBuffer) {
      gl.deleteBuffer(this._brightnessBuffer);
      this._brightnessBuffer = null;
    }
    if (this._vao) {
      gl.deleteVertexArray(this._vao);
      this._vao = null;
    }
    this._map = null;
  }
}

// ---- Public factory ---------------------------------------------------------

/**
 * Create a MapLibre custom layer that renders a procedural starfield
 * in screen-space, behind the Golarion globe.
 *
 * Insert it as the bottommost layer so everything else paints over it:
 * ```ts
 * const firstLayerId = map.getStyle().layers[0]?.id;
 * map.addLayer(createStarsLayer(), firstLayerId);
 * ```
 */
export function createStarsLayer(options?: StarsOptions): CustomLayerInterface {
  return new StarsLayer(options);
}
