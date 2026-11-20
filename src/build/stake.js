// The grade stake: a level to work to. Driven into the ground where you aim
// (G), it shows a translucent plane at its height; ground poking through is
// high, and where the plane floats, it's low. With a stake set the shovel only
// cuts down to grade and only fills up to it, and footings read against it.

import * as THREE from 'three';
import { makeStake } from './geometry.js';

export class GradeStake {
  constructor(scene) {
    this.datum = null; // { x, y, z }, or null when there is no stake
    this.dirty = false;

    this.mesh = makeStake();
    this.mesh.visible = false;
    scene.add(this.mesh);

    // the "water level" plane at grade
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26, 1, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vW; // as drawn: whole metres from the world, so the grid lines up (render/origin.js)
          varying vec2 vOut; // from the stake
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            vOut = position.xz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vW;
          varying vec2 vOut;
          void main() {
            vec2 g = abs(fract(vW.xz + 0.5) - 0.5);
            float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
            float d = length(vOut);
            float fade = 1.0 - smoothstep(7.0, 12.5, d);
            vec3 col = mix(vec3(0.25, 0.55, 0.75), vec3(0.85, 0.95, 1.0), line);
            gl_FragColor = vec4(col * 0.9, (0.26 + line * 0.4) * fade);
          }`,
      }),
    );
    this.plane.visible = false;
    this.plane.renderOrder = 5;
    scene.add(this.plane);
  }

  get level() {
    return this.datum ? this.datum.y : null;
  }

  set(x, y, z) {
    this.datum = { x, y, z };
    this.mesh.position.set(x, y, z);
    this.mesh.visible = true;
    this.dirty = true;
  }

  pull() {
    this.datum = null;
    this.mesh.visible = false;
    this.dirty = true;
  }

  // Is the stake within r of (x, z)?
  near(x, z, r) {
    return !!this.datum && Math.hypot(x - this.datum.x, z - this.datum.z) < r;
  }

  // The plane only shows while a tool that works to grade is in hand.
  show(on) {
    this.plane.visible = on && !!this.datum;
    if (!this.plane.visible) return;
    this.plane.position.set(this.datum.x, this.datum.y, this.datum.z);
  }

  load(datum) {
    if (datum && Number.isFinite(datum.x) && Number.isFinite(datum.y) && Number.isFinite(datum.z)) this.set(datum.x, datum.y, datum.z);
    this.dirty = false;
  }
}
