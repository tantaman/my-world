// The headlamp: strapped round the hiker's cap, and switched on when it gets
// dark underground (or by hand, with K, anywhere).
//
// Its beam goes where you look (where the camera looks), out from the lamp on
// the hiker's forehead, so you can sweep it over a cave's walls. A dim glow
// round the hiker stands for the beam's light coming back off the rock close
// by, so you can see yourself as well as where you're going. Both lights are
// in the scene from the start and only turned up and down, so switching the
// lamp on never makes every material recompile.

import * as THREE from 'three';

const BEAM = { intensity: 9, range: 24, angle: 0.72, penumbra: 0.85, decay: 1.5 };
const GLOW = { intensity: 1.1, range: 7, decay: 1.6 };
const WARM = 0xfff0d8;
const SWITCH = 7; // how fast it comes on and goes off (per second)

const _f = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Headlamp {
  constructor(scene, character) {
    // the lamp: a little black box with a lens, on an elastic strap
    const lamp = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.034, 0.026), black);
    body.position.z = 0.012;
    lamp.add(body);
    this.lens = new THREE.MeshStandardMaterial({ color: 0x9a9a8c, roughness: 0.2, emissive: WARM, emissiveIntensity: 0 });
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 10), this.lens);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.027;
    lamp.add(lens);
    lamp.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    const crown = character.cap.crown;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 24), black);
    strap.rotation.x = Math.PI / 2;
    strap.scale.set(crown.rx + 0.004, crown.rz + 0.004, 0.11);
    strap.position.set(0, crown.y, crown.z);
    character.addWorn(lamp, { band: strap });
    this.lamp = lamp;

    this.beam = new THREE.SpotLight(WARM, 0, BEAM.range, BEAM.angle, BEAM.penumbra, BEAM.decay);
    this.beam.castShadow = false;
    this.glow = new THREE.PointLight(WARM, 0, GLOW.range, GLOW.decay);
    this.glow.castShadow = false;
    scene.add(this.beam, this.beam.target, this.glow);

    this.level = 0; // 0 off .. 1 on
    this.on = false;
  }

  // want: should it be on? look: the camera (the beam goes where it looks)
  update(dt, want, look) {
    this.on = want;
    this.level += ((want ? 1 : 0) - this.level) * (1 - Math.exp(-dt * SWITCH));
    if (this.level < 0.002) this.level = 0;
    const k = this.level;
    this.lens.emissiveIntensity = k * 3;
    this.beam.intensity = BEAM.intensity * k;
    this.glow.intensity = GLOW.intensity * k;
    if (!k) return;
    this.lamp.getWorldPosition(_p);
    look.getWorldDirection(_f);
    // a touch below where you look, as a lamp worn on the head throws it
    _f.y -= 0.12;
    _f.normalize();
    this.beam.position.copy(_p).addScaledVector(_f, 0.08);
    this.beam.target.position.copy(_p).addScaledVector(_f, 8);
    this.beam.target.updateMatrixWorld();
    this.glow.position.set(_p.x - _f.x * 0.6, _p.y + 0.55, _p.z - _f.z * 0.6);
  }
}
