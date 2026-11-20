// What a tool shows before you commit: translucent ghosts of the piece that
// would go in, the grid you're snapping to, the reach of the shovel.
//
// Everything made through here is hidden at the start of every frame; the
// tool in hand turns back on what it wants shown (see Tool.preview in
// builder.js). So a tool never has to remember to clean up after itself.

import * as THREE from 'three';

export class Previews {
  constructor(scene, chunks) {
    this.scene = scene;
    this.chunks = chunks;
    this.objects = [];
    const ghost = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
    this.ok = ghost(0x9fe07a); // it would go here
    this.bad = ghost(0xe06a4a); // it can't
    this.dots = new GridDots(this);
  }

  // Put an object under management: hidden each frame until shown again.
  add(object, renderOrder = 10) {
    object.visible = false;
    object.renderOrder = renderOrder;
    this.scene.add(object);
    this.objects.push(object);
    return object;
  }

  // A translucent stand-in for a piece.
  ghost(geometry) {
    return this.add(new THREE.Mesh(geometry, this.ok));
  }

  // Show a ghost green or red.
  show(mesh, ok = true) {
    mesh.material = ok ? this.ok : this.bad;
    mesh.visible = true;
  }

  hideAll() {
    for (const o of this.objects) o.visible = false;
  }
}

// The 1 m grid nodes around where you're aiming.
class GridDots {
  constructor(previews, R = 5) {
    this.chunks = previews.chunks;
    this.R = R;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((2 * R + 1) ** 2 * 3), 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe8dcb0, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
    this.points.frustumCulled = false;
    previews.add(this.points, 0);
  }

  // The dots are measured from (cx, cz), where the points are put.
  place(cx, cz) {
    const R = this.R;
    const pos = this.points.geometry.attributes.position;
    this.points.position.set(cx, 0, cz);
    let i = 0;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const inside = dx * dx + dz * dz <= R * R;
        pos.setXYZ(i++, dx, inside ? this.chunks.heightAt(cx + dx, cz + dz) + 0.04 : -9999, dz);
      }
    }
    pos.needsUpdate = true;
    this.points.visible = true;
  }
}

// A ring that hugs the ground: the reach of a brush.
export class GroundRing {
  constructor(previews, segments = 40) {
    this.chunks = previews.chunks;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments * 3), 3));
    this.line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xf2e2b0, transparent: true, opacity: 0.85, toneMapped: false }));
    this.line.frustumCulled = false;
    previews.add(this.line, 0);
  }

  // The ring is measured from its middle, where the line is put.
  place(x, z, r) {
    const pos = this.line.geometry.attributes.position;
    this.line.position.set(x, 0, z);
    for (let i = 0; i < pos.count; i++) {
      const a = (i / pos.count) * Math.PI * 2;
      const dx = Math.cos(a) * r;
      const dz = Math.sin(a) * r;
      pos.setXYZ(i, dx, this.chunks.heightAt(x + dx, z + dz) + 0.05, dz);
    }
    pos.needsUpdate = true;
    this.line.visible = true;
  }
}
