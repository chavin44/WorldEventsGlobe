import * as THREE from 'three';

/**
 * Convert geographic coordinates to a 3D point on a sphere.
 */
export function latLongToVec3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

/**
 * Inverse: convert a 3D point on a sphere back to lat/lng degrees.
 * The point must already be in the globe group's local space.
 */
export function vec3ToLatLong(v) {
  const r = v.length();
  const lat = 90 - Math.acos(v.y / r) * (180 / Math.PI);
  const theta = Math.atan2(v.z, -v.x);
  const lng = theta * (180 / Math.PI) - 180;
  return { lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lng.toFixed(4)) };
}
