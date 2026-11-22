// Metre-scale surface patterns share a seamless noise texture. The relief and
// colour use the same joint lines, chipped glaze and exposed brick courses.
import * as THREE from 'three';
import { mulberry32 } from '../noise.js';

let sharedGrain;
export function weatherGrain() {
  if (sharedGrain) return sharedGrain;
  const size = 256,
    data = new Uint8Array(size * size * 4);
  const random = mulberry32(19093);
  const fields = [4, 12, 32, 90].map((n) => ({ n, cells: Float32Array.from({ length: n * n }, random) }));
  function sample(field, u, v) {
    const { n, cells } = field;
    const x = u * n,
      y = v * n,
      i = Math.floor(x),
      j = Math.floor(y);
    const fx = x - i,
      fy = y - j,
      a = fx * fx * (3 - 2 * fx),
      b = fy * fy * (3 - 2 * fy);
    const at = (dx, dy) => cells[((j + dy) % n) * n + ((i + dx) % n)];
    return (at(0, 0) * (1 - a) + at(1, 0) * a) * (1 - b) + (at(0, 1) * (1 - a) + at(1, 1) * a) * b;
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const [broad, mid, small, grit] = fields.map((f) => sample(f, x / size, y / size));
      data[o] = 255 * (broad * 0.44 + mid * 0.3 + small * 0.18 + grit * 0.08);
      data[o + 1] = 255 * (mid * 0.53 + small * 0.29 + grit * 0.18);
      data[o + 2] = 255 * (grit * 0.5 + random() * 0.5);
      data[o + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  sharedGrain = tex;
  return tex;
}

// Codes are attached to the batched shell's vertices; lettering and props
// retain their original colours. Floor stone and vertical stone share a code.
export const FINISH = new Map([
  [0x70594e, 1],
  [0x999684, 2],
  [0x53665e, 3],
  [0x898378, 4],
  [0x383b38, 5],
  [0x76523d, 5],
  [0x665746, 6],
  [0x626961, 5],
  [0x74644b, 3],
]);
export function institutionMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWeather = { value: weatherGrain() };
    shader.vertexShader =
      'attribute float finish; attribute float indoor; varying float vIndoor; varying float vFinish; varying vec3 vBuilding; varying vec3 vFace;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvIndoor=indoor; vFinish=finish; vBuilding=position; vFace=normal;');
    shader.fragmentShader =
      `uniform sampler2D uWeather;
      varying float vIndoor; varying float vFinish; varying vec3 vBuilding; varying vec3 vFace;
      float joint(vec2 grid, float w) {
        vec2 e = .5-abs(fract(grid)-.5);
        vec2 aa = max(fwidth(grid)*.75,vec2(.006));
        vec2 coverage = smoothstep(vec2(w)-aa,vec2(w)+aa,e);
        return 1.-min(coverage.x,coverage.y);
      }
      float cellTone(vec2 id) { return fract(sin(dot(mod(id,179.),vec2(47.1,29.7)))*13751.7); }
    \n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
      vec2 st=abs(vFace.y)>.6?vBuilding.xz:(abs(vFace.x)>.6?vBuilding.zy:vBuilding.xy);
      st+=dot(vBuilding,abs(vFace))*vec2(.731,.357);
      vec3 gr=texture2D(uWeather,st*.33).rgb;
      float leak=texture2D(uWeather,st*vec2(.47,.072)).r;
      float fine=texture2D(uWeather,st*1.6).b;
      float erosion=gr.r*.68+gr.g*.24+fine*.08;
      float relief=0.;
      vec3 paint=diffuseColor.rgb;
      vec2 bricks=st/vec2(.53,.235); bricks.x+=.5*mod(floor(bricks.y),2.);
      float mortar=joint(bricks,.046);
      vec3 fired=mix(vec3(.115,.055,.035),vec3(.34,.174,.092),cellTone(floor(bricks)))*(.55+.85*gr.g);
      fired=mix(fired,vec3(.21,.185,.146)*(.6+.65*fine), mortar);
      if(vFinish>.5 && vFinish<1.5) {paint=fired;relief=-.017*mortar;}
      if(vFinish>1.5 && vFinish<2.5) {
        float peel=smoothstep(.47,.55,erosion+.08*leak);
        float edge=smoothstep(.36,.48,erosion);
        paint=mix(fired*.78,mix(vec3(.19,.128,.073),paint,peel),edge);
        paint*=.72+.4*smoothstep(.3,.60,leak);
        relief=.011*peel-.009*mortar*(1.-edge);
      }
      if((vFinish>2.5 && vFinish<3.5) || (vFinish>3.5 && vFinish<4.5 && vFace.y>.9 && abs(vBuilding.y)<.02)) {
        vec2 grid=st/(vFace.y>.9?.7:.34);
        float grout=joint(grid+(gr.g-.5)*.03,.025);
        float darkTile=mod(floor(grid.x)+floor(grid.y),2.);
        vec3 glaze=vFace.y>.9?mix(vec3(.235,.224,.182),vec3(.105,.124,.11),darkTile):paint*1.18;
        glaze*=.72+.46*cellTone(floor(grid));
        float chip=smoothstep(.56,.67,erosion+.09*grout);
        paint=mix(mix(glaze,vec3(.113,.081,.051),chip),vec3(.054,.051,.04),grout);
        relief=-.012*grout-.008*chip;
      }
      if(vFinish>4.5 && vFinish<5.5) {
        float rust=smoothstep(.49,.62,erosion+.08*leak);
        paint=mix(paint,vec3(.168,.066,.033)*(.45+gr.g),rust);
        relief=rust*.006;
      }
      if(vFinish>5.5) paint*=.57+.75*texture2D(uWeather,st*vec2(.12,2.6)).g;
      diffuseColor.rgb=paint*(.67+.5*gr.r+.23*fine);
    `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
      vec3 dp1=dFdx(-vViewPosition), dp2=dFdy(-vViewPosition);
      vec3 s1=cross(dp2,normal), s2=cross(normal,dp1);
      float det=dot(dp1,s1);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*s1+dFdy(relief)*s2)+normal*1e-8);
    `,
        )
        .replace(
          '#include <opaque_fragment>',
          `
      // Pools of tube light alternate with long runs of dead fittings.
      float bayDistance=abs(mod(vBuilding.z+6.,13.)-6.5);
      float lightPool=exp(-.048*bayDistance*bayDistance-.017*vBuilding.x*vBuilding.x);
      float dampShade=mix(.74,1.,smoothstep(0.,1.5,vBuilding.y));
      vec3 indoors=vec3(.28,.35,.34)+lightPool*vec3(.33,.35,.28);
      outgoingLight*=mix(vec3(1.),indoors*dampShade,vIndoor);
      #include <opaque_fragment>`,
        );
  };
  return material;
}
