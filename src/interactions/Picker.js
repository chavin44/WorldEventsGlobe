import * as THREE from 'three';

/**
 * Raycasting helper: figures out which event bubble the pointer is over,
 * fires hover/click callbacks, and keeps a tooltip following the cursor.
 *
 * @param {object} opts
 * @param {THREE.Camera}   opts.camera
 * @param {HTMLElement}    opts.domElement   the renderer canvas
 * @param {THREE.Mesh[]}   opts.markers      bubble meshes to test against
 * @param {(evt|null, screenXY)=>void} opts.onHover
 * @param {(evt)=>void}    opts.onSelect
 */
export function createPicker({ camera, domElement, markers, onHover, onSelect }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;
  let downXY = null;

  function visibleMarkers() {
    return markers.filter((m) => m.userData.group.visible);
  }

  function intersectAt(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(visibleMarkers(), false);
    return hits.length ? hits[0].object : null;
  }

  function onMove(e) {
    const hit = intersectAt(e.clientX, e.clientY);
    if (hit !== hovered) {
      if (hovered) hovered.userData.hovered = false;
      hovered = hit;
      if (hovered) hovered.userData.hovered = true;
      domElement.style.cursor = hovered ? 'pointer' : 'grab';
    }
    onHover(hovered ? hovered.userData.event : null, { x: e.clientX, y: e.clientY });
  }

  // Distinguish a click from a drag-to-rotate by tracking pointer travel.
  function onDown(e) {
    downXY = { x: e.clientX, y: e.clientY };
  }

  function onUp(e) {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y);
    downXY = null;
    if (moved > 6) return; // it was a drag, not a click
    const hit = intersectAt(e.clientX, e.clientY);
    if (hit) onSelect(hit.userData.event);
  }

  domElement.addEventListener('pointermove', onMove);
  domElement.addEventListener('pointerdown', onDown);
  domElement.addEventListener('pointerup', onUp);

  return {
    dispose() {
      domElement.removeEventListener('pointermove', onMove);
      domElement.removeEventListener('pointerdown', onDown);
      domElement.removeEventListener('pointerup', onUp);
    },
  };
}
