import * as THREE from 'three';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';

/**
 * Builds an equirectangular Earth texture from real land-outline data
 * (Natural Earth 110m via world-atlas) drawn onto a canvas.
 *
 * The projection used here — x = (lng+180)/360, y = (90-lat)/180 — is the SAME
 * mapping THREE.SphereGeometry uses for its UVs AND the same one latLongToVec3
 * uses for the event markers. That shared math is what makes the red bubbles
 * line up with the actual continents.
 */
export function createEarthTexture(width = 2048, height = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // --- ocean ---
  const ocean = ctx.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#1f5e86');
  ocean.addColorStop(0.5, '#1a6f9c');
  ocean.addColorStop(1, '#155576');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  // --- land polygons ---
  const land = feature(landTopo, landTopo.objects.land);
  const polygons = collectPolygons(land);

  const project = ([lng, lat]) => [
    ((lng + 180) / 360) * width,
    ((90 - lat) / 180) * height,
  ];

  // draw land with slight drop shadow for depth
  ctx.save();
  ctx.shadowColor = 'rgba(0, 20, 30, 0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  drawPolygons(ctx, polygons, project, '#6cba4a');
  ctx.restore();

  // clean coastline
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(35, 90, 35, 0.5)';
  strokePolygons(ctx, polygons, project);

  // exposed so verification code can sample land/ocean at any lat/long
  if (typeof window !== 'undefined') window.__earthCanvas = canvas;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** Flatten Polygon / MultiPolygon features into a list of rings-arrays. */
function collectPolygons(geojson) {
  const out = [];
  const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
  for (const f of features) {
    const g = f.geometry || f;
    if (g.type === 'Polygon') out.push(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) out.push(p);
  }
  return out;
}

function tracePolygon(ctx, rings, project) {
  for (const ring of rings) {
    ring.forEach((coord, i) => {
      const [x, y] = project(coord);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}

function drawPolygons(ctx, polygons, project, fill) {
  ctx.fillStyle = fill;
  for (const rings of polygons) {
    ctx.beginPath();
    tracePolygon(ctx, rings, project);
    ctx.fill('evenodd');
  }
}

function strokePolygons(ctx, polygons, project) {
  for (const rings of polygons) {
    ctx.beginPath();
    tracePolygon(ctx, rings, project);
    ctx.stroke();
  }
}

