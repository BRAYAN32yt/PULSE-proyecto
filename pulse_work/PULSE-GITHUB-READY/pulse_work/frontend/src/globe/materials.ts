import {
  AdditiveBlending, AmbientLight, BackSide, Color, DirectionalLight, MeshPhongMaterial, ShaderMaterial,
  type Texture, type WebGLProgramParametersWithUniforms,
} from 'three';

/** Soft atmospheric glow rendered on a slightly larger back-facing sphere. */
export function createAtmosphereMaterial(color = '#3a86ff'): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uIntensity: { value: 0.85 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        float rim = pow(0.72 - dot(vNormal, normalize(vViewPosition)), 3.0);
        rim = clamp(rim, 0.0, 1.0);
        gl_FragColor = vec4(uColor, rim * uIntensity);
      }
    `,
    side: BackSide,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/** Earth surface material.
 *
 *  Uses the built-in MeshPhongMaterial so three.js handles colour management,
 *  tone mapping and shader-chunk composition for us (a hand-written ShaderMaterial
 *  risks fighting the renderer's output pipeline). The bump map adds subtle
 *  terrain relief without a second geometry pass. */
export function createEarthMaterial(dayMap: Texture, bumpMap: Texture | null): MeshPhongMaterial {
  return new MeshPhongMaterial({
    map: dayMap,
    bumpMap: bumpMap ?? undefined,
    bumpScale: bumpMap ? 0.015 : 0,
    specular: new Color('#0a0f1a'),
    shininess: 6,
  });
}

/** Sun for the day/night terminator, in world space.
 *  Placed slightly up-right of the camera so most of the visible hemisphere is
 *  lit while a soft terminator stays visible on the left limb. */
export function createSunLight(): DirectionalLight {
  const light = new DirectionalLight(new Color('#fff4e6'), 3.1);
  light.position.set(2.2, 1.4, 3.8);
  return light;
}

/** Low ambient fill so the night side keeps a faint silhouette. */
export function createAmbientLight(): AmbientLight {
  return new AmbientLight(new Color('#1b2b4d'), 1.1);
}

/** Optional hook to tweak shader compilation (kept for future use). */
export type ShaderHook = (parameters: WebGLProgramParametersWithUniforms) => void;
