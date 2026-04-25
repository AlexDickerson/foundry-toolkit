// Ambient cloud-wash layer for the Golarion globe — player-portal only.
//
// Rendered as a tessellated unit-sphere mesh transformed with MapLibre's
// globe projection matrix.  A six-octave FBM shader samples noise in
// lon/lat space, animated by a slow time drift.  The layer clips precisely
// to the globe's visible hemisphere, so no clouds bleed into the sky area.
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
   * Drift speed in lon/lat UV units per second.  Default: 0.005
   * (roughly one cloud-width per minute at the default scale).
   * Increase toward 0.02–0.05 for a livelier sky.
   */
  driftSpeed?: number;
  /** Scale factor for cloud cluster size (higher → larger patches).
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
// Sphere mesh generation
// ---------------------------------------------------------------------------

/**
 * Build a tessellated unit sphere.
 *
 * Returns an interleaved Float32Array with 5 floats per vertex:
 *   [x, y, z, lon, lat]  (lon ∈ [-π, π], lat ∈ [-π/2, π/2])
 * and a Uint16Array of triangle indices.
 */
function buildSphereMesh(latSteps: number, lonSteps: number): { data: Float32Array; indices: Uint16Array } {
  const verts: number[] = [];
  const idx: number[] = [];

  for (let li = 0; li <= latSteps; li++) {
    const lat = (li / latSteps) * Math.PI - Math.PI / 2;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let lo = 0; lo <= lonSteps; lo++) {
      const lon = (lo / lonSteps) * 2 * Math.PI - Math.PI;
      verts.push(
        cosLat * Math.cos(lon), // x
        cosLat * Math.sin(lon), // y
        sinLat, // z
        lon, // attribute lon (radians)
        lat, // attribute lat (radians)
      );
    }
  }

  for (let li = 0; li < latSteps; li++) {
    for (let lo = 0; lo < lonSteps; lo++) {
      const a = li * (lonSteps + 1) + lo;
      const b = a + 1;
      const c = a + (lonSteps + 1);
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }

  return { data: new Float32Array(verts), indices: new Uint16Array(idx) };
}

// Resolution: 48 lat × 96 lon → 49×97 = 4753 verts, 27 648 indices
const SPHERE = buildSphereMesh(48, 96);

// ---------------------------------------------------------------------------
// GLSL sources
// ---------------------------------------------------------------------------

/** Vertex shader — transforms unit-sphere vertices with MapLibre's globe
 *  projection matrix and computes a signed clip-distance against the
 *  horizon plane so the fragment shader can discard the back hemisphere. */
const VERT_SRC = `
  attribute vec3 a_sphere;   // unit-sphere position (x, y, z)
  attribute vec2 a_lonlat;   // longitude, latitude in radians

  uniform mat4 u_matrix;     // defaultProjectionData.mainMatrix
  uniform vec4 u_clip_plane; // defaultProjectionData.clippingPlane

  varying vec2  v_lonlat;
  varying float v_visible;   // > 0 = front hemisphere

  void main() {
    gl_Position = u_matrix * vec4(a_sphere, 1.0);
    v_lonlat  = a_lonlat;
    // Positive when vertex is on the camera-facing side of the globe
    v_visible = dot(u_clip_plane.xyz, a_sphere) + u_clip_plane.w;
  }
`;

/** FBM cloud fragment shader.
 *
 *  Two FBM layers are sampled in lon/lat space at slowly-drifting offsets,
 *  blended, and threshold-clipped with smoothstep.  Fragments on the back
 *  hemisphere are discarded; fragments near the horizon fade softly out. */
const FRAG_SRC = `
  precision highp float;

  uniform float u_time;    // wall-clock seconds
  uniform float u_drift;   // driftSpeed (lon/lat UV units per second)
  uniform float u_opacity; // overall alpha cap
  uniform float u_scale;   // UV scale for cloud features
  uniform vec3  u_color;   // cloud tint

  varying vec2  v_lonlat;
  varying float v_visible;

  // ---- noise helpers -------------------------------------------------------

  float hash(vec2 p) {
    p  = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

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
    // Discard fragments on the back hemisphere
    if (v_visible <= 0.0) discard;

    float t  = u_time;
    float ds = u_drift;

    // Map lon/lat to noise UV; scale controls cloud feature size
    vec2 uv = vec2(
      v_lonlat.x / 6.28318530718 + 0.5,   // lon → [0, 1]
      v_lonlat.y / 3.14159265359 + 0.5    // lat → [0, 1]
    ) * u_scale;

    // Two FBM layers at slightly different drift angles for visual depth
    float n1 = fbm(uv + vec2(ds * t,         ds * 0.3 * t));
    float n2 = fbm(uv * 1.6 + vec2(-ds * 0.7 * t, ds * 0.4 * t) + vec2(5.2, 1.3));

    float cloud = mix(n1, n2, 0.4);
    cloud = smoothstep(0.38, 0.65, cloud);

    // Soft fade near the globe's horizon so clouds don't hard-clip at the limb
    float horizon = clamp(v_visible * 8.0, 0.0, 1.0);

    float alpha = cloud * u_opacity * horizon;
    gl_FragColor = vec4(u_color, alpha);
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

// Stride between vertices in the interleaved buffer: 5 floats × 4 bytes
const STRIDE = 20;

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
  let _vbo: WebGLBuffer | null = null;
  let _ibo: WebGLBuffer | null = null;
  let _map: MaplibreMap | null = null;
  let _aSphere = -1;
  let _aLonlat = -1;
  let _uMatrix: WebGLUniformLocation | null = null;
  let _uClipPlane: WebGLUniformLocation | null = null;
  let _uTime: WebGLUniformLocation | null = null;
  let _uDrift: WebGLUniformLocation | null = null;
  let _uOpacity: WebGLUniformLocation | null = null;
  let _uScale: WebGLUniformLocation | null = null;
  let _uColor: WebGLUniformLocation | null = null;

  return {
    id: 'golarion-clouds',
    type: 'custom',
    // '3d' renders in the same pass as globe tiles, after them.
    renderingMode: '3d',

    onAdd(map: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
      _map = map;
      _gl = gl as GL;

      _program = buildProgram(_gl, VERT_SRC, FRAG_SRC);
      if (!_program) return;

      _aSphere = _gl.getAttribLocation(_program, 'a_sphere');
      _aLonlat = _gl.getAttribLocation(_program, 'a_lonlat');
      _uMatrix = _gl.getUniformLocation(_program, 'u_matrix');
      _uClipPlane = _gl.getUniformLocation(_program, 'u_clip_plane');
      _uTime = _gl.getUniformLocation(_program, 'u_time');
      _uDrift = _gl.getUniformLocation(_program, 'u_drift');
      _uOpacity = _gl.getUniformLocation(_program, 'u_opacity');
      _uScale = _gl.getUniformLocation(_program, 'u_scale');
      _uColor = _gl.getUniformLocation(_program, 'u_color');

      // Vertex buffer: interleaved [x, y, z, lon, lat]
      _vbo = _gl.createBuffer();
      _gl.bindBuffer(_gl.ARRAY_BUFFER, _vbo);
      _gl.bufferData(_gl.ARRAY_BUFFER, SPHERE.data, _gl.STATIC_DRAW);
      _gl.bindBuffer(_gl.ARRAY_BUFFER, null);

      // Index buffer
      _ibo = _gl.createBuffer();
      _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, _ibo);
      _gl.bufferData(_gl.ELEMENT_ARRAY_BUFFER, SPHERE.indices, _gl.STATIC_DRAW);
      _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, null);

      console.info('[shared:clouds] Cloud layer added', {
        opacity: opts.opacity,
        driftSpeed: opts.driftSpeed,
        scale: opts.scale,
        color: opts.color,
      });
    },

    render(_glCtx: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
      if (!_program || !_vbo || !_ibo || !_gl) return;

      const g = _gl;
      const t = performance.now() / 1000;
      const pd = options.defaultProjectionData;

      // renderingMode '3d' gives a clean GL slate — set up everything.
      g.enable(g.BLEND);
      g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
      // No depth interaction — pure overlay; don't pollute the depth buffer.
      g.disable(g.DEPTH_TEST);
      g.depthMask(false);

      g.useProgram(_program);

      // Bind vertex buffer and wire interleaved attributes
      g.bindBuffer(g.ARRAY_BUFFER, _vbo);
      g.enableVertexAttribArray(_aSphere);
      g.vertexAttribPointer(_aSphere, 3, g.FLOAT, false, STRIDE, 0); // xyz at offset 0
      g.enableVertexAttribArray(_aLonlat);
      g.vertexAttribPointer(_aLonlat, 2, g.FLOAT, false, STRIDE, 12); // lonlat at offset 12

      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, _ibo);

      // Globe projection matrix (projects unit sphere → screen)
      g.uniformMatrix4fv(_uMatrix, false, pd.mainMatrix);
      // Horizon clipping plane (clips the back hemisphere)
      g.uniform4fv(_uClipPlane, pd.clippingPlane);

      g.uniform1f(_uTime, t);
      g.uniform1f(_uDrift, opts.driftSpeed);
      g.uniform1f(_uOpacity, opts.opacity);
      g.uniform1f(_uScale, opts.scale);
      g.uniform3f(_uColor, opts.color[0], opts.color[1], opts.color[2]);

      g.drawElements(g.TRIANGLES, SPHERE.indices.length, g.UNSIGNED_SHORT, 0);

      g.disableVertexAttribArray(_aSphere);
      g.disableVertexAttribArray(_aLonlat);
      g.bindBuffer(g.ARRAY_BUFFER, null);
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, null);
      g.depthMask(true);

      _map?.triggerRepaint();
    },

    onRemove(_m: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
      const g = gl as GL;
      if (_program) g.deleteProgram(_program);
      if (_vbo) g.deleteBuffer(_vbo);
      if (_ibo) g.deleteBuffer(_ibo);
      _program = null;
      _vbo = null;
      _ibo = null;
      _gl = null;
      _map = null;
    },
  };
}
