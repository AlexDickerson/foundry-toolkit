// Ambient cloud-wash layer for the Golarion globe — player-portal only.
//
// Implemented as a MapLibre custom layer that draws a full-screen WebGL quad
// with a fragment shader that samples fractional Brownian motion (FBM) noise
// in screen UV space, animating slowly over time.  No texture assets required;
// the procedural noise tiles seamlessly and drifts naturally.
//
// Usage (after style.load):
//   import { createCloudsLayer } from '@foundry-toolkit/shared/golarion-map';
//   map.addLayer(createCloudsLayer());

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MaplibreMap } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Tunable knobs for the cloud layer.  All fields are optional; the defaults
 *  produce a subtle atmospheric haze that is visible without being distracting. */
export interface CloudsOptions {
  /** Overall cloud opacity, 0–1.  Default: 0.25 */
  opacity?: number;
  /**
   * Drift speed, approximately in noise-UV units per second.  Default: 0.005
   * (very slow — roughly one cloud-width per minute at the default scale).
   * Increase toward 0.02–0.05 for a livelier sky; decrease toward 0.001 for
   * near-static clouds.
   */
  driftSpeed?: number;
  /** Scale factor for cloud cluster size.  Higher → larger patches.
   *  Default: 3.0 */
  scale?: number;
  /** Cloud tint as [R, G, B] in the 0–1 range.  Default: warm near-white
   *  [1, 0.98, 0.95]. */
  color?: [number, number, number];
}

interface ResolvedCloudsOptions {
  opacity: number;
  driftSpeed: number;
  scale: number;
  color: [number, number, number];
}

// ---------------------------------------------------------------------------
// Options merging (exported for unit testing)
// ---------------------------------------------------------------------------

/** Merge caller-supplied options with per-field defaults. */
export function mergeCloudsOptions(options?: CloudsOptions): ResolvedCloudsOptions {
  return {
    opacity: options?.opacity ?? 0.25,
    driftSpeed: options?.driftSpeed ?? 0.005,
    scale: options?.scale ?? 3.0,
    color: options?.color ?? [1, 0.98, 0.95],
  };
}

// ---------------------------------------------------------------------------
// GLSL sources
// ---------------------------------------------------------------------------

/** Full-screen quad vertex shader — ignores the MapLibre matrix entirely;
 *  draws directly in NDC so the quad covers every pixel on-screen. */
const VERT_SRC = `
  attribute vec2 a_pos;
  varying   vec2 v_uv;

  void main() {
    // Clip-space position; z = -1.0 (near plane) keeps clouds in front of
    // globe geometry without needing to manage depth state explicitly.
    gl_Position = vec4(a_pos, -1.0, 1.0);
    // NDC [-1, 1] → UV [0, 1]
    v_uv = (a_pos + 1.0) * 0.5;
  }
`;

/** FBM cloud fragment shader.
 *
 *  Two layers of fractional Brownian motion are sampled at slowly-drifting UV
 *  coordinates, blended together, and threshold-clipped with smoothstep to
 *  produce soft cloud patches.  Output is premultiplied alpha because MapLibre
 *  already enables the ONE / ONE_MINUS_SRC_ALPHA blend equation. */
const FRAG_SRC = `
  precision highp float;

  uniform float u_time;    // wall-clock seconds
  uniform float u_drift;   // driftSpeed option (noise-UV units / sec)
  uniform float u_opacity; // overall alpha cap
  uniform float u_scale;   // UV scale (controls cloud size)
  uniform vec3  u_color;   // cloud tint [0, 1]

  varying vec2 v_uv;

  // ---- noise helpers -------------------------------------------------------

  float hash(vec2 p) {
    p  = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Smootherstep curve for C2 continuity
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // 6-octave fractional Brownian motion
  float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
      val += amp * vnoise(p);
      p   *= 2.0;
      amp *= 0.5;
    }
    return val;
  }

  // -------------------------------------------------------------------------

  void main() {
    float t  = u_time;
    float ds = u_drift;
    vec2 uv  = v_uv * u_scale;

    // Primary layer: drift rightward + slight upward
    float n1 = fbm(uv + vec2(ds * t, ds * 0.3 * t));

    // Secondary layer: counter-drift at a different scale for visual depth
    float n2 = fbm(uv * 1.6 + vec2(-ds * 0.7 * t, ds * 0.4 * t) + vec2(5.2, 1.3));

    // Blend layers and threshold into soft cloud shapes
    float cloud = mix(n1, n2, 0.4);
    cloud = smoothstep(0.38, 0.65, cloud);

    // Premultiplied alpha: MapLibre uses ONE / ONE_MINUS_SRC_ALPHA blending
    float alpha = cloud * u_opacity;
    gl_FragColor = vec4(u_color * alpha, alpha);
  }
`;

// ---------------------------------------------------------------------------
// WebGL helpers
// ---------------------------------------------------------------------------

type GL = WebGLRenderingContext;

function compileShader(gl: GL, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return shader;
}

function buildProgram(gl: GL, vertSrc: string, fragSrc: string): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;

  const prog = gl.createProgram();
  if (!prog) return null;

  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[shared:clouds] Shader link failed:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

// Full-screen quad — 2 triangles, 6 vertices in NDC space
// prettier-ignore
const QUAD_VERTS = new Float32Array([
  -1, -1,   1, -1,  -1,  1,
   1, -1,   1,  1,  -1,  1,
]);

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a slow-drifting ambient cloud-wash custom layer for the Golarion
 * globe.  Register it on the map **after `style.load`** — player-portal only.
 *
 * @example
 * ```ts
 * map.on('style.load', () => {
 *   map.setProjection({ type: 'globe' });
 *   map.addLayer(createCloudsLayer());
 * });
 * ```
 */
export function createCloudsLayer(options?: CloudsOptions): CustomLayerInterface {
  const opts = mergeCloudsOptions(options);

  // GL resources — allocated in onAdd, freed in onRemove
  let _gl: GL | null = null;
  let _program: WebGLProgram | null = null;
  let _buf: WebGLBuffer | null = null;
  let _map: MaplibreMap | null = null;
  let _aPos = -1;
  let _uTime: WebGLUniformLocation | null = null;
  let _uDrift: WebGLUniformLocation | null = null;
  let _uOpacity: WebGLUniformLocation | null = null;
  let _uScale: WebGLUniformLocation | null = null;
  let _uColor: WebGLUniformLocation | null = null;

  return {
    id: 'golarion-clouds',
    type: 'custom',
    renderingMode: '2d',

    onAdd(map: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
      _map = map;
      _gl = gl as GL;

      _program = buildProgram(_gl, VERT_SRC, FRAG_SRC);
      if (!_program) return;

      _aPos = _gl.getAttribLocation(_program, 'a_pos');
      _uTime = _gl.getUniformLocation(_program, 'u_time');
      _uDrift = _gl.getUniformLocation(_program, 'u_drift');
      _uOpacity = _gl.getUniformLocation(_program, 'u_opacity');
      _uScale = _gl.getUniformLocation(_program, 'u_scale');
      _uColor = _gl.getUniformLocation(_program, 'u_color');

      _buf = _gl.createBuffer();
      _gl.bindBuffer(_gl.ARRAY_BUFFER, _buf);
      _gl.bufferData(_gl.ARRAY_BUFFER, QUAD_VERTS, _gl.STATIC_DRAW);
      _gl.bindBuffer(_gl.ARRAY_BUFFER, null);

      console.info('[shared:clouds] Cloud layer added', {
        opacity: opts.opacity,
        driftSpeed: opts.driftSpeed,
        scale: opts.scale,
        color: opts.color,
      });
    },

    render(_gl2: WebGLRenderingContext | WebGL2RenderingContext, _options: CustomRenderMethodInput): void {
      if (!_program || !_buf || !_gl) return;

      const g = _gl;
      const t = performance.now() / 1000;

      // Disable depth test so the full-screen quad isn't clipped by globe
      // geometry already in the depth buffer.
      const wasDepthTest = g.isEnabled(g.DEPTH_TEST);
      g.disable(g.DEPTH_TEST);

      // MapLibre has already set the blend equation to
      // ONE / ONE_MINUS_SRC_ALPHA (premultiplied alpha) — we rely on that.

      g.useProgram(_program);
      g.bindBuffer(g.ARRAY_BUFFER, _buf);
      g.enableVertexAttribArray(_aPos);
      g.vertexAttribPointer(_aPos, 2, g.FLOAT, false, 0, 0);

      g.uniform1f(_uTime, t);
      g.uniform1f(_uDrift, opts.driftSpeed);
      g.uniform1f(_uOpacity, opts.opacity);
      g.uniform1f(_uScale, opts.scale);
      g.uniform3f(_uColor, opts.color[0], opts.color[1], opts.color[2]);

      g.drawArrays(g.TRIANGLES, 0, 6);

      g.disableVertexAttribArray(_aPos);
      g.bindBuffer(g.ARRAY_BUFFER, null);

      // Restore depth state so subsequent MapLibre layers are unaffected
      if (wasDepthTest) g.enable(g.DEPTH_TEST);

      // Keep the animation running; MapLibre will call render() again
      _map?.triggerRepaint();
    },

    onRemove(_m: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
      const g = gl as GL;
      if (_program) g.deleteProgram(_program);
      if (_buf) g.deleteBuffer(_buf);
      _program = null;
      _buf = null;
      _gl = null;
      _map = null;
    },
  };
}
