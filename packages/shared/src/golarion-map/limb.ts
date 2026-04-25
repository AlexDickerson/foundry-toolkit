// Screen-space limb darkening for the Golarion globe — player-portal only.
//
// Darkens the globe surface near the silhouette, mimicking the reduced
// brightness at glancing viewing angles (terrain viewed through more
// atmosphere at the limb). This is a subtle but effective depth cue — the
// eye reads the gradient as spherical curvature.
//
// Implementation: a full-screen quad whose fragment shader computes each
// pixel's normalised distance from the globe centre and applies the
// physically-motivated limb darkening law:
//
//   darkening = (1 − cos θ)^exponent
//   where cos θ = sqrt(1 − r²),  r = dist_from_centre / globe_radius
//
// Zero at the disc centre, peak at the silhouette. Globe disc centre and
// radius are derived from defaultProjectionData.clippingPlane each frame —
// the same rotationally-stable approach as the halo layer.
//
// Usage (after style.load, before cloud layer):
//   import { createLimbDarkeningLayer } from '@foundry-toolkit/shared/golarion-map';
//   map.on('style.load', () => {
//     map.addLayer(createLimbDarkeningLayer()); // under the clouds
//     map.addLayer(createCloudsLayer());
//   });

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MaplibreMap } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Tunable knobs for the limb darkening layer. Both fields are optional;
 *  the defaults produce a subtle effect that is clearly perceptible as
 *  curvature without visibly obscuring the map surface. */
export interface LimbOptions {
  /** Peak opacity of the dark overlay at the silhouette edge (0–1). Default: 0.5 */
  opacity?: number;
  /**
   * Exponent of the power curve applied after the (1 − cos θ) term.
   * Higher values concentrate the darkening more tightly at the very edge;
   * lower values spread it further across the disc.
   * Default: 1.0 — effect is visible across the outer ~30% of the radius.
   */
  exponent?: number;
}

export interface ResolvedLimbOptions {
  opacity: number;
  exponent: number;
}

// ---------------------------------------------------------------------------
// Options merging (exported for unit testing)
// ---------------------------------------------------------------------------

/** Merge caller-supplied options with per-field defaults. */
export function mergeLimbOptions(options?: LimbOptions): ResolvedLimbOptions {
  return {
    opacity: options?.opacity ?? 0.5,
    exponent: options?.exponent ?? 1.0,
  };
}

// ---------------------------------------------------------------------------
// Geometry — full-screen quad (2 triangles, 6 vertices in NDC)
// ---------------------------------------------------------------------------

const QUAD_VERTS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);

// ---------------------------------------------------------------------------
// GLSL sources
// ---------------------------------------------------------------------------

/** Vertex shader — passes NDC position straight through. */
const VERT_SRC = /* glsl */ `#version 300 es
precision mediump float;

in  vec2 a_pos;
out vec2 v_ndc;

void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_ndc = a_pos;
}`;

/**
 * Fragment shader — applies limb darkening inside the globe disc.
 *
 * For each fragment, r = pixel_distance / globe_radius ∈ [0, 1].
 *
 *   cos θ      = sqrt(1 − r²)   (orthographic surface normal angle)
 *   darkening  = (1 − cos θ)^exponent
 *
 * Zero at the disc centre, increases continuously, maximum at r → 1.
 * Fragments at r ≥ 1 are discarded. The halo layer handles the soft
 * silhouette transition outside the disc, so no extra edge feather is
 * needed here — adding one suppresses the peak darkening at the rim.
 */
const FRAG_SRC = /* glsl */ `#version 300 es
precision mediump float;

uniform vec2  u_viewport;    // physical pixel dimensions [w, h]
uniform vec2  u_center_ndc;  // globe disc centre in NDC
uniform float u_radius_px;   // globe disc radius in physical pixels
uniform float u_opacity;     // peak darkening opacity
uniform float u_exponent;    // power-curve exponent

in  vec2 v_ndc;
out vec4 fragColor;

void main() {
  // Physical-pixel distance from disc centre, accounting for aspect ratio
  vec2  p_px = (v_ndc - u_center_ndc) * u_viewport * 0.5;
  float dist  = length(p_px);

  // Normalised radius: 0 at disc centre, 1 at silhouette
  float r = dist / u_radius_px;

  // Nothing to darken outside the globe
  if (r >= 1.0) discard;

  // Physically-motivated limb darkening:
  //   cos θ = component of surface normal along the view direction (ortho approx)
  //   darkening = (1 − cos θ)^exponent  →  0 at centre, peaks at r = 1
  float cos_theta = sqrt(max(0.0, 1.0 - r * r));
  float darkening = pow(1.0 - cos_theta, u_exponent);

  // Black overlay: SRC_ALPHA / ONE_MINUS_SRC_ALPHA blend darkens the tiles beneath.
  fragColor = vec4(0.0, 0.0, 0.0, darkening * u_opacity);
}`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type GL2 = WebGL2RenderingContext;

/** Column-major 4×4 matrix as a fixed-length tuple (noUncheckedIndexedAccess). */
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

/** 4-component vector as a fixed-length tuple. */
type Vec4 = readonly [number, number, number, number];

function mat4MulVec4(m: Mat16, x: number, y: number, z: number, w: number): [number, number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ];
}

function projectToNDC(m: Mat16, x: number, y: number, z: number): [number, number] {
  const [cx, cy, , cw] = mat4MulVec4(m, x, y, z, 1);
  const w = cw === 0 ? 1 : cw;
  return [cx / w, cy / w];
}

function compileShader(gl: GL2, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[shared:limb] Shader compile failed:', gl.getShaderInfoLog(shader));
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
    console.warn('[shared:limb] Shader link failed:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a screen-space limb darkening custom layer for the Golarion globe.
 * Register it in the `style.load` handler **before** the cloud layer so the
 * darkening is visible beneath any cloud cover.
 *
 * @example
 * ```ts
 * map.on('style.load', () => {
 *   map.setProjection({ type: 'globe' });
 *   map.addLayer(createLimbDarkeningLayer()); // darkens terrain at the limb
 *   map.addLayer(createCloudsLayer());         // clouds on top
 * });
 * ```
 */
export function createLimbDarkeningLayer(options?: LimbOptions): CustomLayerInterface {
  const opts = mergeLimbOptions(options);

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
  let _uOpacity: WebGLUniformLocation | null = null;
  let _uExponent: WebGLUniformLocation | null = null;

  return {
    id: 'golarion-limb',
    type: 'custom',
    renderingMode: '3d',

    onAdd(map: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
      _map = map;
      _gl = gl as GL2;

      _program = buildProgram(_gl, VERT_SRC, FRAG_SRC);
      if (!_program) {
        console.warn('[shared:limb] Shader build failed; limb darkening will be absent');
        return;
      }

      _vao = _gl.createVertexArray();
      if (!_vao) {
        console.warn('[shared:limb] createVertexArray() returned null; limb darkening will be absent');
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
      _uOpacity = _gl.getUniformLocation(_program, 'u_opacity');
      _uExponent = _gl.getUniformLocation(_program, 'u_exponent');

      console.info('[shared:limb] Limb darkening layer added', {
        opacity: opts.opacity,
        exponent: opts.exponent,
      });
    },

    render(_glCtx: WebGLRenderingContext | WebGL2RenderingContext, input: CustomRenderMethodInput): void {
      if (!_program || !_vao || !_gl || !_map) return;
      const gl = _gl;

      // Derive globe disc centre and radius from the clipping plane.
      // See halo.ts for the full derivation — this is the same approach.
      const cp = input.defaultProjectionData.clippingPlane as unknown as Vec4;
      const cnx = cp[0],
        cny = cp[1],
        cnz = cp[2],
        cnd = cp[3];
      const nlen = Math.sqrt(cnx * cnx + cny * cny + cnz * cnz);
      if (nlen < 1e-6) return;

      const nx = cnx / nlen,
        ny = cny / nlen,
        nz = cnz / nlen;
      const dd = cnd / nlen;
      const scx = -dd * nx,
        scy = -dd * ny,
        scz = -dd * nz;
      const sRad = Math.sqrt(Math.max(0, 1 - dd * dd));
      if (sRad < 1e-6) return;

      // Tangent vector perpendicular to the clip-plane normal
      let e1x: number, e1y: number, e1z: number;
      const absNx = Math.abs(nx),
        absNy = Math.abs(ny),
        absNz = Math.abs(nz);
      if (absNx <= absNy && absNx <= absNz) {
        const el = Math.sqrt(nz * nz + ny * ny);
        e1x = 0;
        e1y = nz / el;
        e1z = -ny / el;
      } else if (absNy <= absNz) {
        const el = Math.sqrt(nz * nz + nx * nx);
        e1x = -nz / el;
        e1y = 0;
        e1z = nx / el;
      } else {
        const el = Math.sqrt(ny * ny + nx * nx);
        e1x = ny / el;
        e1y = -nx / el;
        e1z = 0;
      }

      const m = input.defaultProjectionData.mainMatrix as unknown as Mat16;
      const sil1 = projectToNDC(m, scx + sRad * e1x, scy + sRad * e1y, scz + sRad * e1z);
      const sil2 = projectToNDC(m, scx - sRad * e1x, scy - sRad * e1y, scz - sRad * e1z);

      const centerNDC: [number, number] = [(sil1[0] + sil2[0]) / 2, (sil1[1] + sil2[1]) / 2];

      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;

      const dxNDC = sil1[0] - centerNDC[0];
      const dyNDC = sil1[1] - centerNDC[1];
      const radiusPx = Math.sqrt((dxNDC * (w / 2)) ** 2 + (dyNDC * (h / 2)) ** 2);

      if (!isFinite(radiusPx) || radiusPx < 1 || radiusPx > 20_000) return;

      // Save GL state
      const prevBlend = gl.isEnabled(gl.BLEND);
      const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);

      gl.useProgram(_program);
      gl.bindVertexArray(_vao);

      // radiusPx is already in physical pixels (derived from drawingBufferWidth),
      // so no DPR conversion needed here.
      gl.uniform2f(_uViewport, w, h);
      gl.uniform2f(_uCenterNDC, centerNDC[0], centerNDC[1]);
      gl.uniform1f(_uRadiusPx, radiusPx);
      gl.uniform1f(_uOpacity, opts.opacity);
      gl.uniform1f(_uExponent, opts.exponent);

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
