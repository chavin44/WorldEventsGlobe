import * as THREE from 'three';
import { latLongToVec3 } from './latLongToVec3.js';
import { CATEGORIES } from '../data/dataService.js';

const haloTexture = makeHaloTexture();

export function createEventMarkers(events, radius) {
  const group = new THREE.Group();
  const markers = [];

  for (const evt of events) {
    _addOne(evt, radius, group, markers);
  }

  function update(time) {
    for (const m of markers) {
      const d = m.userData;
      const pulse = 1 + Math.sin(time * 2 + d.phase) * 0.08;
      d.group.scale.setScalar(d.hovered ? pulse * 1.35 : pulse);
      d.halo.material.opacity = (d.hovered ? 0.75 : 0.45) + Math.sin(time * 2 + d.phase) * 0.12;
    }
  }

  function setCategoryFilter(activeSet) {
    for (const m of markers) {
      const visible = activeSet === null || activeSet.has(m.userData.event.category);
      m.userData.group.visible = visible;
      m.userData.stem.visible = visible;
    }
  }

  /** Dynamically add a new marker at runtime (called by Add Event flow). */
  function addMarker(evt) {
    const bubble = _addOne(evt, radius, group, markers);
    return bubble;
  }

  /** Remove every marker (used when the time range changes and we rebuild). */
  function clear() {
    for (const m of markers) {
      const d = m.userData;
      group.remove(d.group);
      group.remove(d.stem);
      d.bubble.geometry.dispose();
      d.bubble.material.dispose();
      d.halo.material.dispose();
      d.stem.geometry.dispose();
      d.stem.material.dispose();
    }
    markers.length = 0; // mutate in place so the picker keeps the same array ref
  }

  return { group, markers, update, setCategoryFilter, addMarker, clear };
}

function _addOne(evt, radius, group, markers) {
  const surface = latLongToVec3(evt.lat, evt.lng, radius);
  const normal = surface.clone().normalize();

  const size = 0.08 + evt.severity * 0.045;
  const lift = 0.18 + evt.severity * 0.06;
  const pos = surface.clone().add(normal.clone().multiplyScalar(lift));

  const markerGroup = new THREE.Group();
  markerGroup.position.copy(pos);

  const bubbleGeo = new THREE.SphereGeometry(size, 16, 16);
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xff2b2b,
    emissive: 0xff1414,
    emissiveIntensity: 0.6 + evt.severity * 0.25,
    roughness: 0.35,
    metalness: 0.0,
  });
  const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
  markerGroup.add(bubble);

  const haloMat = new THREE.SpriteMaterial({
    map: haloTexture,
    color: 0xff3b3b,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Sprite(haloMat);
  const haloScale = size * (5 + evt.severity);
  halo.scale.set(haloScale, haloScale, 1);
  markerGroup.add(halo);

  const stem = makeStem(surface, pos);
  group.add(stem);
  group.add(markerGroup);

  bubble.userData = {
    event: evt,
    group: markerGroup,
    stem,
    halo,
    bubble,
    baseSize: size,
    baseEmissive: bubbleMat.emissiveIntensity,
    phase: (evt.lat + evt.lng) % (Math.PI * 2),
  };
  markers.push(bubble);
  return bubble;
}

function makeStem(from, to) {
  const mat = new THREE.LineBasicMaterial({ color: 0xff5d5d, transparent: true, opacity: 0.5 });
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  return new THREE.Line(geo, mat);
}

function makeHaloTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,90,90,0.9)');
  g.addColorStop(1, 'rgba(255,40,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
