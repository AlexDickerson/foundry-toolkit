// Screen-space atmospheric halo for the Golarion globe — player-portal only.
//
// Renders a soft radial glow ring just outside the globe's projected silhouette,
// providing the depth cue that makes the globe read as a sphere in space rather
// than a flat disc on a background.
//
// The layer covers the full viewport with a quad (NDC space). The fragment shader
// converts each pixel's distance from the globe disc centre into a smooth alpha
// profile: fading in from just inside the silhouette, peaking at the silhouette
// edge, then decaying outward over the configured band width.
//
// Globe silhouette radius and screen-centre are derived each frame from
// MapLibre's globe projection matrix so the halo tracks zoom and pan correctly.
//
// Usage (after style.load, before pin layer):
//   import { createHaloLayer } from '@foundry-toolkit/shared/golarion-map';
//   map.on('load', () => {
//     map.addLayer(createHaloLayer());  // add before pin icons
//   });

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MaplibreMap } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Tunable knobs for the atmospheric halo layer. All fields are optional; the
 *  defaults produce a clearly visible atmospheric rim that reads as planetary
 *  curvature without obscuring the map surface. */
export interface HaloOptions {
  /** Width of the glow band outside the globe silhouette, in CSS pixels. Default: 35 */
  widthPx?: number;
  /** How far inside the silhouette the alpha tapers to zero, in CSS pixels.
   *  A small value (default: 8) provides anti-aliasing at the limb without
   *  painting over the map surface. */
  innerFeatherPx?: number;
  /** Halo colour as linear RGB [R, G, B] in the 0–1 range.
   *  Default: atmospheric blue [0.18, 0.52, 1.0]. */
  color?: [number, number, number];
  /** Peak opacity of the halo at the silhouette edge. Default: 0.6 */
  opacity?: number;
}

export interface ResolvedHaloOptions {
  widthPx: number;
  innerFeatherPx: number;
  color: [number, number, number];
  opacity: number;
}

// ---------------------------------------------------------------------------
// Options merging (exported for unit testing)
// ---------------------------------------------------------------------------

/** Merge caller-supplied options with per-field defaults. */
export function mergeHaloOptions(options?: HaloOptions): ResolvedHaloOptions {
  return {
    widthPx: options?.widthPx ?? 35,
    innerFeatherPx: options?.innerFeatherPx ?? 8,
    color: options?.color ?? [0.18, 0.52, 1.0],
    opacity: options?.opacity ?? 0.6,
  };
}

// ---------------------------------------------------------------------------
// Geometry — full-screen quad (2 triangles, 6 vertices in NDC)
// ---------------------------------------------------------------------------

const QUAD_VERTS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);

// ---------------------------------------------------------------------------
// GLSL sources
// ---------------------------------------------------------------------------

/** Vertex shader — passes NDC positions straight through; no globe matrix needed. */
const VERT_SRC = /* glsl */ `#version 300 es
precision mediump float;

in  vec2 a_pos;
out vec2 v_ndc;

void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_ndc = a_pos;
}`;

/**
 * Fragment shader — renders a smooth glow ring at the globe silhouette.
 *
 * Distances are computed in physical-pixel space (accounting for the viewport
 * dimensions) so the halo band width is invariant to viewport aspect ratio.
 *
 * Alpha profile (d = signed pixel distance from silhouette; positive = outside):
 *   d < -innerFeather  → 0  (inside the globe — no bleed onto the surface)
 *   d ∈ [-inner, 0]    → ramps 0 → 1  (soft inner edge / anti-alias)
 *   d = 0              → peak = 1  (the silhouette itself)
 *   d ∈ [0, width]     → decays 1 → 0  (the atmospheric glow band into space)
 *   d > width          → 0  (void; stars show through)
 */
const FRAG_SRC = /* glsl */ `#version 300 es
precision mediump float;

uniform vec2  u_viewport;    // physical pixel dimensions [w, h]
uniform vec2  u_center_ndc;  // globe disc centre in NDC
uniform float u_radius_px;   // globe disc radius in physical pixels
uniform float u_width_px;    // outer glow width in physical pixels
uniform float u_inner_px;    // inner feather width in physical pixels
uniform vec3  u_color;       // halo colour (linear RGB)
uniform float u_opacity;     // peak opacity

in  vec2 v_ndc;
out vec4 fragColor;

void main() {
  // Convert NDC → physical-pixel offset from globe centre, preserving aspect ratio
  vec2  p_px    = (v_ndc - u_center_ndc) * u_viewport * 0.5;
  float dist_px = length(p_px);

  // Signed distance from the silhouette: positive = outside, negative = inside
  float d = dist_px - u_radius_px;

  // Outer decay: 1 at d = 0, smoothly 0 at d = +width
  float outer = smoothstep(u_width_px, 0.0, d);
  // Inner taper: 0 at d = -inner, smoothly 1 at d = 0
  float inner = smoothstep(-u_inner_px, 0.0, d);

  fragColor = vec4(u_color, inner * outer * u_opacity);
}`;

// ---------------------------------------------------------------------------
// WebGL helpers
// ---------------------------------------------------------------------------

type GL2 = WebGL2RenderingContext;

function compileShader(gl: GL2, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[shared:halo] Shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(gl: GL2, vertSrc: string, fragSrc: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;

  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[shared:halo] Shader link failed:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

// ---------------------------------------------------------------------------
// Projection helpers — derive globe disc centre and radius from the matrix
// ---------------------------------------------------------------------------

/**
 * Column-major 4×4 matrix as a fixed-length tuple.
 * Using a tuple type (rather than ArrayLike<number>) means numeric literal
 * index access returns exactly `number` under noUncheckedIndexedAccess.
 */
type Mat16 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** 4-component vector as a fixed-length tuple (same motivation as Mat16). */
type Vec4 = readonly [number, number, number, number];

/**
 * Multiply a column-major 4×4 matrix by a homogeneous 4-vector.
 * Returns [x, y, z, w].
 */
function mat4MulVec4(m: Mat16, x: number, y: number, z: number, w: number): [number, number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ];
}

/**
 * Project a globe-space point through the MapLibre projection matrix and
 * return its NDC position [x, y] after the homogeneous perspective divide.
 */
function projectToNDC(m: Mat16, x: number, y: number, z: number): [number, number] {
  const [cx, cy, , cw] = mat4MulVec4(m, x, y, z, 1);
  const w = cw === 0 ? 1 : cw;
  return [cx / w, cy / w];
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a screen-space atmospheric halo custom layer for the Golarion globe.
 * Register it in the `load` event handler **after** any cloud layers and
 * **before** pin / icon layers so the halo sits above the globe surface but
 * below map markers.
 *
 * @example
 * ```ts
 * map.on('load', () => {
 *   map.addLayer(createHaloLayer());      // halo above globe, below pins
 *   map.addLayer({ id: PIN_LAYER, ... }); // pins on top
 * });
 * ```
 */
export function createHaloLayer(options?: HaloOptions): CustomLayerInterface {
  const opts = mergeHaloOptions(options);

  // GL resources — allocated in onAdd, freed in onRemove
  let _gl: GL2 | null = null;
  let _program: WebGLProgram | null = null;
  let _vao: WebGLVertexArrayObject | null = null;
  let _vbo: WebGLBuffer | null = null;
  let _map: MaplibreMap | null = null;

  // Cached uniform locations
  let _uViewport: WebGLUniformLocation | null = null;
  let _uCenterNDC: WebGLUniformLocation | null = null;
  let _uRadiusPx: WebGLUniformLocation | null = null;
  let _uWidthPx: WebGLUniformLocation | null = null;
  let _uInnerPx: WebGLUniformLocation | null = null;
  let _uColor: WebGLUniformLocation | null = null;
  let _uOpacity: WebGLUniformLocation | null = null;

  return {
    id: 'golarion-halo',
    type: 'custom',
    // '3d' renders in the same compositing pass as globe tiles and clouds,
    // respecting the layer stack order so the halo sits above them.
    renderingMode: '3d',

    onAdd(map: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
      _map = map;
      _gl = gl as GL2;

      _program = buildProgram(_gl, VERT_SRC, FRAG_SRC);
      if (!_program) {
        console.warn('[shared:halo] Shader build failed; atmospheric halo will be absent');
        return;
      }

      _vao = _gl.createVertexArray();
      if (!_vao) {
        console.warn('[shared:halo] createVertexArray() returned null; atmospheric halo will be absent');
        _gl.deleteProgram(_program);
        _program = null;
        return;
      }

      _gl.bindVertexArray(_vao);

      _vbo = _gl.createBuffer();
      _gl.bindBuffer(_gl.ARRAY_BUFFER, _vbo);
      _gl.bufferData(_gl.ARRAY_BUFFER, QUAD_VERTS, _gl.STATIC_DRAW);

      const aPos = _gl.getAttribLocation(_program, 'a_pos');
      _gl.enableVertexAttribArray(aPos);
      _gl.vertexAttribPointer(aPos, 2, _gl.FLOAT, false, 0, 0);

      _gl.bindVertexArray(null);
      _gl.bindBuffer(_gl.ARRAY_BUFFER, null);

      _uViewport = _gl.getUniformLocation(_program, 'u_viewport');
      _uCenterNDC = _gl.getUniformLocation(_program, 'u_center_ndc');
      _uRadiusPx = _gl.getUniformLocation(_program, 'u_radius_px');
      _uWidthPx = _gl.getUniformLocation(_program, 'u_width_px');
      _uInnerPx = _gl.getUniformLocation(_program, 'u_inner_px');
      _uColor = _gl.getUniformLocation(_program, 'u_color');
      _uOpacity = _gl.getUniformLocation(_program, 'u_opacity');

      console.info('[shared:halo] Atmospheric halo layer added', {
        widthPx: opts.widthPx,
        innerFeatherPx: opts.innerFeatherPx,
        color: opts.color,
        opacity: opts.opacity,
      });
    },

    render(_glCtx: WebGLRenderingContext | WebGL2RenderingContext, input: CustomRenderMethodInput): void {
      if (!_program || !_vao || !_gl || !_map) return;
      const gl = _gl;

      // Derive the globe disc centre and radius from the clip plane.
      //
      // MapLibre's clippingPlane satisfies:  dot(cp.xyz, p) + cp.w = 0
      // for every point p on the unit sphere's silhouette ring — i.e. the
      // actual boundary between the visible and hidden hemisphere.  Using this
      // gives a rotationally-stable radius that does NOT oscillate as the globe
      // auto-rotates (unlike projecting a fixed equatorial point such as [1,0,0]
      // which sweeps from disc-edge to disc-centre and back each full rotation).
      const cp = input.defaultProjectionData.clippingPlane as unknown as Vec4;
      const cnx = cp[0],
        cny = cp[1],
        cnz = cp[2],
        cnd = cp[3];
      const nlen = Math.sqrt(cnx * cnx + cny * cny + cnz * cnz);
      if (nlen < 1e-6) return; // degenerate clip plane

      // Normalise plane normal
      const nx = cnx / nlen,
        ny = cny / nlen,
        nz = cnz / nlen;
      const dd = cnd / nlen;

      // Silhouette ring in globe-space:
      //   centre = -dd · n̂  (on or inside the unit sphere)
      //   radius = sqrt(1 − dd²)
      const scx = -dd * nx,
        scy = -dd * ny,
        scz = -dd * nz;
      const sRad = Math.sqrt(Math.max(0, 1 - dd * dd));
      if (sRad < 1e-6) return; // fully pole-on or degenerate

      // Tangent vector e1 perpendicular to n̂.  Choose the basis axis whose
      // component along n̂ is smallest for maximum numerical stability.
      let e1x: number, e1y: number, e1z: number;
      const absNx = Math.abs(nx),
        absNy = Math.abs(ny),
        absNz = Math.abs(nz);
      if (absNx <= absNy && absNx <= absNz) {
        // n × [1,0,0] = [0, nz, -ny]
        const el = Math.sqrt(nz * nz + ny * ny);
        e1x = 0;
        e1y = nz / el;
        e1z = -ny / el;
      } else if (absNy <= absNz) {
        // n × [0,1,0] = [-nz, 0, nx]
        const el = Math.sqrt(nz * nz + nx * nx);
        e1x = -nz / el;
        e1y = 0;
        e1z = nx / el;
      } else {
        // n × [0,0,1] = [ny, -nx, 0]
        const el = Math.sqrt(ny * ny + nx * nx);
        e1x = ny / el;
        e1y = -nx / el;
        e1z = 0;
      }

      // Project two opposing silhouette points; their screen-space midpoint is
      // the disc centre and half their distance is the disc radius.
      const m = input.defaultProjectionData.mainMatrix as unknown as Mat16;
      const sil1 = projectToNDC(m, scx + sRad * e1x, scy + sRad * e1y, scz + sRad * e1z);
      const sil2 = projectToNDC(m, scx - sRad * e1x, scy - sRad * e1y, scz - sRad * e1z);

      const centerNDC: [number, number] = [(sil1[0] + sil2[0]) / 2, (sil1[1] + sil2[1]) / 2];

      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;

      const dxNDC = sil1[0] - centerNDC[0];
      const dyNDC = sil1[1] - centerNDC[1];
      const radiusPx = Math.sqrt((dxNDC * (w / 2)) ** 2 + (dyNDC * (h / 2)) ** 2);

      // Guard against degenerate matrices (e.g. during projection transitions).
      if (!isFinite(radiusPx) || radiusPx < 1 || radiusPx > 20_000) return;

      // Scale CSS-pixel widths to physical pixels using the canvas DPR.
      const canvas = _map.getCanvas();
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      const widthPx = opts.widthPx * dpr;
      const innerPx = opts.innerFeatherPx * dpr;

      // Save relevant GL state that this layer modifies
      const prevBlend = gl.isEnabled(gl.BLEND);
      const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);

      gl.useProgram(_program);
      gl.bindVertexArray(_vao);

      gl.uniform2f(_uViewport, w, h);
      gl.uniform2f(_uCenterNDC, centerNDC[0], centerNDC[1]);
      gl.uniform1f(_uRadiusPx, radiusPx);
      gl.uniform1f(_uWidthPx, widthPx);
      gl.uniform1f(_uInnerPx, innerPx);
      gl.uniform3f(_uColor, opts.color[0], opts.color[1], opts.color[2]);
      gl.uniform1f(_uOpacity, opts.opacity);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.bindVertexArray(null);

      // Restore GL state
      if (!prevBlend) gl.disable(gl.BLEND);
      if (prevDepthTest) gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    },

    onRemove(_m: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
      const g = gl as GL2;
      if (_program) {
        g.deleteProgram(_program);
        _program = null;
      }
      if (_vbo) {
        g.deleteBuffer(_vbo);
        _vbo = null;
      }
      if (_vao) {
        g.deleteVertexArray(_vao);
        _vao = null;
      }
      _gl = null;
      _map = null;
    },
  };
}
