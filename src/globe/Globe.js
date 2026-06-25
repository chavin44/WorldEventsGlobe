import * as THREE from 'three';
import { createEarthTexture } from './earthTexture.js';

/**
 * Builds a low-poly Earth globe with real continents (green land / blue ocean)
 * and returns a group containing it. Event markers get parented to this same
 * group so they rotate with the planet AND line up with the real geography,
 * because the texture, the sphere UVs, and the markers all share one projection.
 */
export function createGlobe(radius = 5) {
  const group = new THREE.Group();

  // --- the planet ---
  // Moderate segment count keeps continents readable; flatShading gives the
  // gentle faceted, low-poly shading seen in the reference images.
  const geo = new THREE.SphereGeometry(radius, 64, 64);
  const earthMap = createEarthTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: earthMap,
    flatShading: true,
    roughness: 0.85,
    metalness: 0.05,
  });
  const planet = new THREE.Mesh(geo, mat);
  group.add(planet);

  // Rotate the WHOLE group (planet + markers, which get added later) so the
  // initial front settles over Africa/Europe like the references. Rotating the
  // group keeps texture and markers locked together — they never drift apart.
  group.rotation.y = -1.9;

  // --- soft atmosphere halo ---
  const atmoGeo = new THREE.SphereGeometry(radius * 1.14, 48, 48);
  const atmoMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    uniforms: { uColor: { value: new THREE.Color(0x6fb6ff) } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      uniform vec3 uColor;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
        gl_FragColor = vec4(uColor, 1.0) * intensity;
      }
    `,
  });
  const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
  group.add(atmosphere);

  return { group, planet, atmosphere, radius };
}
