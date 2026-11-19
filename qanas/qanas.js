/**
 * قنّاص الشلة: a bright toy-shooter sniper game for تحديات الشلة.
 *
 * Characters: Quaternius "Ultimate Animated Character Pack" (CC0), one shared clip file.
 * Props and guns: Quaternius "Toon Shooter Game Kit" (CC0).
 *
 * Sections (search for "---------- <name>"):
 *   1. setup        2. save / catalog     3. assets        4. actors
 *   5. world        6. levels             7. game state    8. shooting
 *   9. enemies AI   10. input / camera    11. menus        12. loop
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/* ---------- setup ---------- */
const $ = (id) => document.getElementById(id);
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/\d/g, (d) => AR[d]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
camera.rotation.order = 'YXZ';
const SKY_TOP = new THREE.Color(0x3d8fe0),
  SKY_LOW = new THREE.Color(0xcfeaff);
scene.fog = new THREE.Fog(0xcfeaff, 120, 420);
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(800, 24, 12),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: SKY_TOP }, low: { value: SKY_LOW } },
    vertexShader:
      'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 low; varying vec3 vP;\nvoid main(){ float h = clamp(normalize(vP).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(low, top, h), 1.0);\n#include <colorspace_fragment>\n}'
  })
);
scene.add(sky);
const hemi = new THREE.HemisphereLight(0xdff1ff, 0x8a7a5a, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.position.set(-60, 110, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 320 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.target.position.set(0, 0, -60);
scene.add(sun, sun.target);

function fit() {
  const w = window.innerWidth,
    h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

/* ---------- save / catalog ---------- */
// every item has a price; 0 means free. Paid items can be switched on later without code changes.
const CHARS = [
  ['Soldier_Male', 'جندي', 'm'],
  ['Soldier_Female', 'جندية', 'f'],
  ['BlueSoldier_Male', 'جندي أزرق', 'm'],
  ['BlueSoldier_Female', 'جندية زرقاء', 'f'],
  ['Ninja_Sand', 'نينجا الصحراء', 'm'],
  ['Ninja_Sand_Female', 'نينجا الصحراء', 'f'],
  ['Ninja_Male', 'نينجا', 'm'],
  ['Ninja_Female', 'نينجا', 'f'],
  ['Ninja_Male_Hair', 'نينجا بشعر', 'm'],
  ['Suit_Male', 'رجل أعمال', 'm'],
  ['Suit_Female', 'سيدة أعمال', 'f'],
  ['OldClassy_Male', 'أنيق', 'm'],
  ['OldClassy_Female', 'أنيقة', 'f'],
  ['Casual_Male', 'كاجوال', 'm'],
  ['Casual_Female', 'كاجوال', 'f'],
  ['Casual2_Male', 'كاجوال ٢', 'm'],
  ['Casual2_Female', 'كاجوال ٢', 'f'],
  ['Casual3_Male', 'كاجوال ٣', 'm'],
  ['Casual3_Female', 'كاجوال ٣', 'f'],
  ['Casual_Bald', 'أصلع', 'm'],
  ['Cowboy_Male', 'كاوبوي', 'm'],
  ['Cowboy_Female', 'كاوبوي', 'f'],
  ['Cowboy_Hair', 'كاوبوي بشعر', 'm'],
  ['Pirate_Male', 'قرصان', 'm'],
  ['Pirate_Female', 'قرصانة', 'f'],
  ['Viking_Male', 'فايكنغ', 'm'],
  ['Viking_Female', 'فايكنغ', 'f'],
  ['VikingHelmet', 'خوذة فايكنغ', 'm'],
  ['Knight_Male', 'فارس', 'm'],
  ['Knight_Golden_Male', 'فارس ذهبي', 'm'],
  ['Knight_Golden_Female', 'فارسة ذهبية', 'f'],
  ['Kimono_Male', 'كيمونو', 'm'],
  ['Kimono_Female', 'كيمونو', 'f'],
  ['Doctor_Male_Young', 'دكتور', 'm'],
  ['Doctor_Female_Young', 'دكتورة', 'f'],
  ['Doctor_Male_Old', 'دكتور كبير', 'm'],
  ['Doctor_Female_Old', 'دكتورة كبيرة', 'f'],
  ['Chef_Male', 'طباخ', 'm'],
  ['Chef_Female', 'طباخة', 'f'],
  ['Chef_Hat', 'طباخ بقبعة', 'm'],
  ['Worker_Male', 'عامل', 'm'],
  ['Worker_Female', 'عاملة', 'f'],
  ['Wizard', 'ساحر', 'm'],
  ['Witch', 'ساحرة', 'f'],
  ['Elf', 'قزم', 'm'],
  ['Goblin_Male', 'غول', 'm'],
  ['Goblin_Female', 'غولة', 'f'],
  ['Zombie_Male', 'زومبي', 'm'],
  ['Zombie_Female', 'زومبية', 'f']
].map(([id, name, g]) => ({ id, name, g, price: 0 }));
const charById = Object.fromEntries(CHARS.map((c) => [c.id, c]));
// gangs the enemies come from, and the people you must not hit
const GANGS = [
  ['Pirate_Male', 'Pirate_Female'],
  ['Ninja_Male', 'Ninja_Female', 'Ninja_Male_Hair'],
  ['Zombie_Male', 'Zombie_Female'],
  ['Goblin_Male', 'Goblin_Female'],
  ['Viking_Male', 'Viking_Female', 'VikingHelmet'],
  ['Knight_Male', 'Knight_Golden_Male', 'Knight_Golden_Female']
];
const CIVS = [
  'Chef_Male',
  'Chef_Female',
  'Doctor_Male_Young',
  'Doctor_Female_Young',
  'Worker_Male',
  'Worker_Female',
  'Casual_Female',
  'Casual2_Male',
  'Suit_Female'
];

const KEY = 'qanas-v1';
function defSave() {
  return { coins: 0, char: 'Soldier_Male', shemagh: true, level: 1, stars: {}, best: {} };
}
let save = defSave();
try {
  Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch (e) {}
if (!charById[save.char]) save.char = 'Soldier_Male';
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch (e) {}
}

/* ---------- assets ---------- */
const loader = new GLTFLoader();
const cache = {};
function loadGLB(url) {
  if (!cache[url])
    cache[url] = new Promise((res, rej) =>
      loader.load(url, res, undefined, (e) => {
        delete cache[url];
        rej(e);
      })
    );
  return cache[url];
}
const CH = (id) => '../assets/chibi/' + id + '.glb';
const TOON = (id) => '../assets/toon/' + id + '.glb';
let CLIPS = {};
async function loadClips() {
  const g = await loadGLB(CH('anims'));
  g.animations.forEach((c) => (CLIPS[c.name] = c));
}
// characters: shadows on, a touch of toon-like flatness
function prepChar(g) {
  g.scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      if (o.material) o.material.roughness = 0.75;
    }
  });
  return g;
}
const charTemplates = {};
function charTemplate(id) {
  if (!charTemplates[id]) charTemplates[id] = loadGLB(CH(id)).then(prepChar);
  return charTemplates[id];
}
const propTemplates = {};
function prop(id) {
  if (!propTemplates[id])
    propTemplates[id] = loadGLB(TOON(id)).then((g) => {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return g.scene;
    });
  return propTemplates[id];
}

/* ---------- actors ---------- */
const CHAR_H = 1.75; // metres, top of head
let shemTex = null;
function shemaghTexture() {
  if (shemTex) return shemTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#fbf8f2';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#d3101c';
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const px = i * 16,
        py = j * 16;
      x.fillRect(px + 2, py + 6, 12, 4);
      x.fillRect(px + 6, py + 2, 4, 12);
    }
  shemTex = new THREE.CanvasTexture(c);
  shemTex.wrapS = shemTex.wrapT = THREE.RepeatWrapping;
  shemTex.repeat.set(2, 2);
  shemTex.colorSpace = THREE.SRGBColorSpace;
  return shemTex;
}
// bounds of the vertices driven mostly by one bone (current pose)
function boneBox(model, bone) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3(),
    v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    const bi = o.skeleton.bones.indexOf(bone);
    if (bi < 0) return;
    o.skeleton.update();
    const pos = o.geometry.attributes.position,
      si = o.geometry.attributes.skinIndex,
      sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      let w = 0;
      const ix = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)],
        wx = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      for (let k = 0; k < 4; k++) if (ix[k] === bi) w += wx[k];
      if (w < 0.6) continue;
      v.fromBufferAttribute(pos, i);
      o.applyBoneTransform(i, v);
      box.expandByPoint(v.applyMatrix4(o.matrixWorld));
    }
  });
  return box;
}
// red-and-white shemagh with a black double agal, fitted to the head's measured size.
// Built facing +z (the way characters face), then parented to the head bone.
function addShemagh(model, head) {
  // hide headwear and hair first so the head is measured bare
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const n = (o.name + ' ' + (o.material && o.material.name)).toLowerCase();
    if (/hat|helmet|hair|hood|cap|beanie|bandana/.test(n)) o.visible = false;
  });
  const hb = boneBox(model, head);
  if (hb.isEmpty()) return;
  const c = hb.getCenter(new THREE.Vector3()),
    sz = hb.getSize(new THREE.Vector3()),
    rx = sz.x / 2,
    ry = sz.y / 2,
    rz = sz.z / 2;
  const cloth = new THREE.MeshStandardMaterial({
      map: shemaghTexture(),
      roughness: 0.9,
      side: THREE.DoubleSide
    }),
    black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 });
  const g = new THREE.Group();
  // crown: covers the top of the head, a little oversized
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth);
  crown.scale.set(rx * 1.1, ry * 1.08, rz * 1.12);
  crown.position.y = ry * 0.02;
  // drape: hugs the sides, flares out over the shoulders; open at the face (+z)
  const prof = [
    [1.0, 0.1],
    [1.02, -0.4],
    [1.12, -0.85],
    [1.45, -1.25],
    [1.75, -1.42]
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  const drape = new THREE.Mesh(new THREE.LatheGeometry(prof, 28, Math.PI * 0.3, Math.PI * 1.4), cloth);
  drape.scale.set(rx * 1.1, ry, rz * 1.12);
  // the pointed tail hanging down the back
  const tail = new THREE.Mesh(
    new THREE.ShapeGeometry(
      new THREE.Shape([new THREE.Vector2(-1, 0), new THREE.Vector2(1, 0), new THREE.Vector2(0, -1.1)])
    ),
    cloth
  );
  tail.scale.set(rx * 1.2, ry * 1.1, 1);
  tail.position.set(0, -ry * 1.3, -rz * 1.5);
  tail.rotation.x = -0.25;
  // agal: two black rings around the crown
  const ag1 = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 8, 32), black);
  ag1.rotation.x = Math.PI / 2;
  ag1.scale.set(rx * 1.08, rz * 1.1, ry * 0.9);
  ag1.position.y = ry * 0.42;
  const ag2 = ag1.clone();
  ag2.position.y = ry * 0.56;
  ag2.scale.set(rx * 1.0, rz * 1.02, ry * 0.9);
  [crown, drape, tail, ag1, ag2].forEach((m) => {
    m.castShadow = true;
    g.add(m);
  });
  // g is built in world units at the head's world position, then re-parented keeping that transform
  g.position.copy(c);
  g.updateMatrixWorld(true);
  head.attach(g);
}
// bounds of a skinned model in its current pose (bones must be updated first)
function skinBox(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3(),
    v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    o.skeleton.update();
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i);
      o.applyBoneTransform(i, v);
      box.expandByPoint(v.applyMatrix4(o.matrixWorld));
    }
  });
  return box;
}
async function makeActor(id, opt) {
  opt = opt || {};
  const t = await charTemplate(id);
  const model = SkeletonUtils.clone(t.scene);
  const box = skinBox(model);
  const s = CHAR_H / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  const root = new THREE.Group();
  root.add(model);
  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const mixer = new THREE.AnimationMixer(model);
  const a = { id, root, model, bones, mixer, acts: {}, cur: null };
  for (const k in CLIPS) a.acts[k] = mixer.clipAction(CLIPS[k]);
  if (opt.gun) {
    const gun = (await prop(opt.gun)).clone();
    const fist = bones.FistR;
    if (fist) {
      root.updateMatrixWorld(true);
      const gs = new THREE.Vector3();
      fist.getWorldScale(gs);
      gun.scale.setScalar(opt.gunScale / gs.x);
      gun.rotation.set(0, Math.PI / 2, 0);
      fist.add(gun);
      a.gun = gun;
    }
  }
  if (opt.shemagh && bones.Head) addShemagh(model, bones.Head);
  play(a, opt.anim || 'Idle', 0);
  return a;
}
function play(a, name, fade, once) {
  const n = a.acts[name] ? name : 'Idle';
  const act = a.acts[n];
  if (a.cur === act && !once) return;
  act.reset();
  act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  act.clampWhenFinished = !!once;
  act.play();
  if (a.cur && fade) act.crossFadeFrom(a.cur, fade, false);
  else if (a.cur) a.cur.stop();
  a.cur = act;
}

/* ---------- world ---------- */
const world = new THREE.Group(); // everything of the current mission
const props = new THREE.Group(); // static arena pieces: the only things bullets can hit besides people
scene.add(world);
const groundTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#d9c38f';
  x.fillRect(0, 0, 512, 512);
  const r = rng(5);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = ['#cdb47c', '#e3cf9e', '#c9ae74', '#d6bd86'][i % 4];
    x.globalAlpha = 0.5;
    x.beginPath();
    x.arc(r() * 512, r() * 512, 4 + r() * 18, 0, 6.3);
    x.fill();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
})();
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 900),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// concrete yard under the action
const yard = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0xb9b3a7, roughness: 0.95 })
);
yard.rotation.x = -Math.PI / 2;
yard.position.set(0, 0.02, -75);
yard.receiveShadow = true;
scene.add(yard);
// far hills ring for depth
(() => {
  const r = rng(9),
    mat = new THREE.MeshStandardMaterial({ color: 0xc7a46e, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2,
      d = 300 + r() * 80,
      h = 25 + r() * 45;
    const m = new THREE.Mesh(new THREE.ConeGeometry(40 + r() * 40, h, 6), mat);
    m.position.set(Math.sin(a) * d, h / 2 - 2, -Math.cos(a) * d - 60);
    scene.add(m);
  }
})();
// the player's sniper tower
const PLAYER_POS = new THREE.Vector3(0, 9, 4);
(() => {
  const g = new THREE.Group(),
    wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 }),
    metal = new THREE.MeshStandardMaterial({ color: 0x5a6672, roughness: 0.6, metalness: 0.3 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 5), wood);
  deck.position.set(0, PLAYER_POS.y - 0.2, PLAYER_POS.z);
  g.add(deck);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, PLAYER_POS.y, 0.35), metal);
      leg.position.set(sx * 2.2, PLAYER_POS.y / 2 - 0.2, PLAYER_POS.z + sz * 2.2);
      g.add(leg);
    }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.2), wood);
  rail.position.set(0, PLAYER_POS.y + 0.25, PLAYER_POS.z - 2.4);
  g.add(rail);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(g);
})();

const PROPS_BIG = [
  'Structure_1',
  'Structure_2',
  'Structure_3',
  'Structure_4',
  'Container_Long',
  'Container_Small',
  'WaterTank_Platform',
  'WaterTank_Floor'
];
const PROPS_COVER = [
  'SackTrench',
  'SackTrench_Small',
  'Barrier_Large',
  'Barrier_Single',
  'Barrier_Fixed',
  'Crate',
  'CardboardBoxes_1',
  'CardboardBoxes_3',
  'Pallet',
  'ExplodingBarrel',
  'GasTank',
  'Debris_BrokenCar',
  'Debris_Tires',
  'TrashContainer',
  'WoodPlanks'
];
const PROPS_EDGE = [
  'Fence_Long',
  'MetalFence',
  'BrickWall_1',
  'BrickWall_2',
  'StreetLight',
  'Tree_1',
  'Tree_2',
  'Tree_3',
  'Tree_4',
  'Pipes',
  'Sign',
  'TrafficCone'
];
let blockers = []; // simple boxes enemies walk around and bullets hit
async function buildArena(seed) {
  world.clear();
  props.clear();
  world.add(props);
  blockers = [];
  const r = rng(seed * 7919 + 13),
    pick = (a) => a[Math.floor(r() * a.length)],
    placed = [];
  const place = async (id, x, z, ry, s) => {
    const m = (await prop(id)).clone();
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    if (s) m.scale.setScalar(s);
    props.add(m);
    m.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m);
    blockers.push(b);
    placed.push({ x, z, r: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2 });
    return m;
  };
  const free = (x, z, rad) => placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + rad);
  const jobs = [];
  for (let i = 0; i < 9; i++) {
    for (let t = 0; t < 30; t++) {
      const x = (r() * 2 - 1) * 48,
        z = -30 - r() * 95;
      if (free(x, z, 6)) {
        placed.push({ x, z, r: 6 });
        jobs.push(place(pick(PROPS_BIG), x, z, Math.floor(r() * 4) * (Math.PI / 2), 1.6));
        break;
      }
    }
  }
  for (let i = 0; i < 26; i++) {
    for (let t = 0; t < 30; t++) {
      const x = (r() * 2 - 1) * 52,
        z = -24 - r() * 100;
      if (free(x, z, 2.2)) {
        placed.push({ x, z, r: 2.2 });
        jobs.push(place(pick(PROPS_COVER), x, z, r() * Math.PI * 2, 1.3));
        break;
      }
    }
  }
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    jobs.push(place(pick(PROPS_EDGE), side * (58 + r() * 8), -20 - (i / 18) * 115, r() * Math.PI * 2, 1.5));
  }
  for (let i = 0; i < 8; i++)
    jobs.push(place(pick(PROPS_EDGE), -50 + i * 14 + r() * 4, -138 - r() * 6, r() * 6.28, 1.5));
  await Promise.all(jobs);
}

/* ---------- levels ---------- */
// en: enemies, civ: civilians, near/far: distance band (m), move: share walking, fire: shoot-back rate, wind: max m/s, time: s
const LEVELS = [
  { en: 3, civ: 0, near: 35, far: 60, move: 0.0, fire: 0, wind: 0, time: 90, title: 'التدريب' },
  { en: 4, civ: 1, near: 40, far: 70, move: 0.3, fire: 0, wind: 1, time: 90, title: 'لا تصيب الأبرياء' },
  { en: 5, civ: 2, near: 45, far: 80, move: 0.5, fire: 0.25, wind: 2, time: 100, title: 'يطلقون عليك' },
  { en: 6, civ: 2, near: 50, far: 90, move: 0.6, fire: 0.35, wind: 3, time: 110, title: 'الساحة' },
  { en: 7, civ: 3, near: 55, far: 100, move: 0.7, fire: 0.45, wind: 4, time: 120, title: 'العصابة' },
  { en: 8, civ: 3, near: 60, far: 110, move: 0.8, fire: 0.55, wind: 5, time: 120, title: 'ريح قوية' },
  { en: 9, civ: 4, near: 60, far: 120, move: 0.85, fire: 0.65, wind: 6, time: 130, title: 'الهجوم الكبير' },
  { en: 10, civ: 4, near: 70, far: 125, move: 0.9, fire: 0.8, wind: 7, time: 140, title: 'زعيم الساحة' }
];

/* ---------- game state ---------- */
let G = null; // current mission
let player = null; // the player's actor on the tower
let menuActor = null;
let mode = 'load'; // load | menu | ward | play | over
const view = { yaw: 0, pitch: -6 * D2R, scoped: false, zoom: 6 };
const HIP_FOV = 55;
const BULLET_V = 520,
  GRAV = 9.81;

async function startLevel(n, seed, challenge) {
  const L = LEVELS[n - 1];
  seed = seed || Math.floor(Math.random() * 9000) + 1000;
  mode = 'load';
  showScreen(null);
  $('hud').hidden = true;
  if (menuActor) menuActor.root.visible = false;
  await buildArena(seed);
  const r = rng(seed);
  const gang = GANGS[(n - 1 + Math.floor(r() * GANGS.length)) % GANGS.length];
  const jobs = [];
  const targets = [];
  // every spot must be on open ground and visible from the tower (head and chest)
  const seen = (v) =>
    lineClear(new THREE.Vector3(v.x, 1.2, v.z)) < 0 && lineClear(new THREE.Vector3(v.x, 0.7, v.z)) < 0;
  const open = (x, z) =>
    !blockers.some((b) => x > b.min.x - 1 && x < b.max.x + 1 && z > b.min.z - 1 && z < b.max.z + 1);
  const spot = () => {
    for (let t = 0; t < 200; t++) {
      const d = L.near + r() * (L.far - L.near),
        a = (r() * 2 - 1) * 32 * D2R,
        v = new THREE.Vector3(Math.sin(a) * d, 0, PLAYER_POS.z - Math.cos(a) * d);
      if (open(v.x, v.z) && seen(v)) return v;
    }
    return new THREE.Vector3((r() - 0.5) * 20, 0, PLAYER_POS.z - L.near);
  };
  const leg = (p) => {
    for (let t = 0; t < 30; t++) {
      const q = p.clone().add(new THREE.Vector3((r() * 2 - 1) * 12, 0, (r() * 2 - 1) * 8));
      if (open(q.x, q.z) && seen(q) && seen(p.clone().lerp(q, 0.5))) return q;
    }
    return p.clone();
  };
  for (let i = 0; i < L.en + L.civ; i++) {
    const enemy = i < L.en;
    const id = enemy ? gang[Math.floor(r() * gang.length)] : CIVS[Math.floor(r() * CIVS.length)];
    const p = spot(),
      walk = r() < (enemy ? L.move : 0.7),
      p2 = walk ? leg(p) : p.clone();
    const tgt = {
      enemy,
      id,
      home: p,
      way: [p, p2],
      wi: 1,
      speed: 1.1 + r() * 0.6,
      walk,
      alive: true,
      alert: 0,
      shootT: 2 + r() * 4,
      ph: r()
    };
    targets.push(tgt);
    jobs.push(
      makeActor(id, enemy ? { gun: r() < 0.5 ? 'AK' : 'SMG', gunScale: 0.55 } : {}).then((a) => {
        tgt.a = a;
        a.root.position.copy(p);
        a.root.rotation.y = Math.atan2(PLAYER_POS.x - p.x, PLAYER_POS.z - p.z) + (r() - 0.5);
        play(a, walk ? 'Walk' : 'Idle', 0);
        a.mixer.setTime(r() * 3);
        world.add(a.root);
      })
    );
  }
  if (player) scene.remove(player.root);
  jobs.push(
    makeActor(save.char, { gun: 'Sniper', gunScale: 0.7, shemagh: save.shemagh }).then((a) => {
      player = a;
      a.root.position.copy(PLAYER_POS);
      scene.add(a.root);
    })
  );
  await Promise.all(jobs);
  const wr = rng(seed + 1);
  G = {
    n,
    seed,
    L,
    targets,
    left: L.en,
    time: L.time,
    hp: 100,
    shots: 0,
    hits: 0,
    heads: 0,
    civHit: false,
    over: false,
    wind: Math.round((wr() * 2 - 1) * L.wind * 10) / 10,
    bullets: [],
    challenge: challenge || null,
    score: 0
  };
  view.yaw = 0;
  view.pitch = -5 * D2R;
  setScoped(false);
  mode = 'play';
  $('hud').hidden = false;
  hud();
  toast(L.title);
}

/* ---------- shooting ---------- */
const _v = new THREE.Vector3(),
  _w = new THREE.Vector3(),
  _h = new THREE.Vector3(),
  _n = new THREE.Vector3();
function aimDir() {
  return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(view.pitch, view.yaw, 0, 'YXZ'));
}
function eye() {
  return PLAYER_POS.clone().add(new THREE.Vector3(0, 1.45, 0));
}
let fireCool = 0;
function fire() {
  if (mode !== 'play' || !G || G.over || fireCool > 0) return;
  if (!view.scoped) {
    setScoped(true);
    return;
  }
  fireCool = 1.0;
  G.shots++;
  sfxShot();
  view.kick = 1;
  const o = eye(),
    d = aimDir();
  G.bullets.push({ p: o.clone(), v: d.multiplyScalar(BULLET_V), t: 0, tracer: mkTracer() });
}
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });
function mkTracer() {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const l = new THREE.Line(g, tracerMat);
  l.frustumCulled = false;
  scene.add(l);
  return l;
}
function segPoint2(p, q, c) {
  _v.subVectors(q, p);
  const l2 = _v.lengthSq(),
    t = l2 > 0 ? clamp(_w.subVectors(c, p).dot(_v) / l2, 0, 1) : 0;
  return _h.copy(p).addScaledVector(_v, t).distanceToSquared(c);
}
function hitTest(p, q) {
  let best = null;
  for (const t of G.targets) {
    if (!t.alive || !t.a) continue;
    const b = t.a.bones;
    if (!b.Head || !b.Hips) continue;
    const head = new THREE.Vector3().setFromMatrixPosition(b.Head.matrixWorld).add(_n.set(0, 0.22, 0));
    const hips = new THREE.Vector3().setFromMatrixPosition(b.Hips.matrixWorld);
    const neck = new THREE.Vector3().setFromMatrixPosition((b.Neck || b.Head).matrixWorld);
    let part = 0;
    if (segPoint2(p, q, head) < 0.3 * 0.3) part = 2;
    else {
      // body: sample the hips -> neck line
      for (let k = 0; k <= 4 && !part; k++) {
        const c = hips.clone().lerp(neck, k / 4);
        if (segPoint2(p, q, c) < 0.24 * 0.24) part = 1;
      }
      if (!part && segPoint2(p, q, hips.clone().setY(0.35)) < 0.2 * 0.2) part = 1;
    }
    if (part) {
      const d = p.distanceToSquared(hips);
      if (!best || d < best.d) best = { t, part, d };
    }
  }
  return best;
}
// bullets hit the real prop shapes, not their bounding boxes (trees and lamps have big empty boxes)
const ray = new THREE.Raycaster();
const _seg = new THREE.Vector3();
function hitWorld(p, q) {
  if (q.y <= 0) return true;
  _seg.subVectors(q, p);
  const len = _seg.length();
  if (!len) return false;
  ray.set(p, _seg.multiplyScalar(1 / len));
  ray.far = len;
  return ray.intersectObject(props, true).length > 0;
}
function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    const steps = 6,
      h = dt / steps;
    let done = false;
    for (let s = 0; s < steps && !done; s++) {
      const p = b.p.clone();
      b.v.y -= GRAV * h;
      b.v.x += G.wind * 1.2 * h;
      b.p.addScaledVector(b.v, h);
      b.t += h;
      const ht = hitTest(p, b.p);
      if (ht) {
        onHit(ht.t, ht.part, b);
        done = true;
      } else if (hitWorld(p, b.p) || b.t > 2) {
        puff(b.p);
        alertNear(b.p, 14);
        done = true;
      }
    }
    const pos = b.tracer.geometry.attributes.position;
    const tail = b.p.clone().addScaledVector(b.v, -0.035);
    pos.setXYZ(0, tail.x, tail.y, tail.z);
    pos.setXYZ(1, b.p.x, b.p.y, b.p.z);
    pos.needsUpdate = true;
    if (done) {
      scene.remove(b.tracer);
      b.tracer.geometry.dispose();
      G.bullets.splice(i, 1);
    }
  }
}
function onHit(t, part, b) {
  t.alive = false;
  play(t.a, 'Death', 0.1, true);
  puff(b.p, 0xff5a4a);
  sfxHit();
  if (!t.enemy) {
    G.civHit = true;
    toast('أصبت بريء!', true);
    endLevel(false, 'أصبت شخص بريء. القنّاص الشاطر يتأكد قبل ما يطلق.');
    return;
  }
  G.hits++;
  if (part === 2) G.heads++;
  G.left--;
  G.score += 100 + (part === 2 ? 60 : 0);
  toast(part === 2 ? 'طلقة راس!' : 'أصبته!');
  alertNear(t.a.root.position, 22);
  hud();
  if (G.left <= 0) setTimeout(() => endLevel(true), 900);
}
function alertNear(p, rad) {
  for (const t of G.targets)
    if (t.alive && t.a && t.a.root.position.distanceTo(p) < rad) {
      if (t.enemy) t.alert = Math.max(t.alert, 6);
      else t.panic = 6;
    }
}
const puffMat = new THREE.SpriteMaterial({ color: 0xe8dcc0, transparent: true, depthWrite: false });
const puffs = [];
function puff(p, col) {
  const m = puffMat.clone();
  if (col) m.color.setHex(col);
  const s = new THREE.Sprite(m);
  s.position.copy(p);
  s.scale.setScalar(0.6);
  scene.add(s);
  puffs.push({ s, t: 0 });
}

/* ---------- enemies AI ---------- */
function updateTargets(dt) {
  for (const t of G.targets) {
    if (!t.a) continue;
    t.a.mixer.update(dt);
    if (!t.alive) continue;
    const root = t.a.root,
      toP = Math.atan2(PLAYER_POS.x - root.position.x, PLAYER_POS.z - root.position.z);
    if (t.enemy && t.alert > 0) {
      t.alert = Math.max(0, t.alert - dt * 0.15);
      root.rotation.y = toP;
      // shoot back
      t.shootT -= dt;
      if (G.L.fire > 0 && t.shootT <= 0) {
        t.shootT = 2.2 + Math.random() * 2.5;
        play(t.a, 'Shoot_OneHanded', 0.1, true);
        flash(t);
        const dist = root.position.distanceTo(PLAYER_POS),
          chance = G.L.fire * (view.scoped ? 1 : 0.55) * clamp(1.4 - dist / 140, 0.35, 1);
        if (Math.random() < chance) hurt(8 + Math.round(G.L.fire * 10));
        setTimeout(() => t.alive && play(t.a, 'Idle', 0.2), 600);
      } else if (t.a.cur !== t.a.acts.Shoot_OneHanded && t.a.cur !== t.a.acts.Idle) play(t.a, 'Idle', 0.2);
      continue;
    }
    const panic = t.panic > 0;
    if (panic) t.panic -= dt;
    if (t.walk || panic) {
      const goal = t.way[t.wi];
      const dx = goal.x - root.position.x,
        dz = goal.z - root.position.z,
        d = Math.hypot(dx, dz),
        sp = t.speed * (panic ? 2.6 : 1);
      if (d < 0.3) t.wi = (t.wi + 1) % t.way.length;
      else {
        root.position.x += (dx / d) * sp * dt;
        root.position.z += (dz / d) * sp * dt;
        const want = Math.atan2(dx, dz);
        root.rotation.y +=
          Math.atan2(Math.sin(want - root.rotation.y), Math.cos(want - root.rotation.y)) *
          Math.min(1, dt * 6);
      }
      play(t.a, panic ? 'Run' : 'Walk', 0.25);
    } else play(t.a, 'Idle', 0.25);
  }
}
const flashMat = new THREE.SpriteMaterial({
  color: 0xffd36a,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});
function flash(t) {
  const s = new THREE.Sprite(flashMat);
  const p = t.a.gun
    ? new THREE.Vector3().setFromMatrixPosition(t.a.gun.matrixWorld)
    : t.a.root.position.clone().setY(1.2);
  s.position.copy(p);
  s.scale.setScalar(1.6);
  scene.add(s);
  setTimeout(() => scene.remove(s), 80);
  sfxShot(0.25, Math.min(1, t.a.root.position.distanceTo(PLAYER_POS) / 340));
}
function hurt(n) {
  G.hp = Math.max(0, G.hp - n);
  const h = $('hurt');
  h.classList.add('on');
  setTimeout(() => h.classList.remove('on'), 60);
  hud();
  if (G.hp <= 0) endLevel(false, 'أصابوك قبل ما تخلص عليهم. اطلع من المنظار بين الطلقات عشان تقل الإصابات.');
}

/* ---------- input / camera ---------- */
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play') return;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (x) {}
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const k = (camera.fov / HIP_FOV) * 0.0042;
  view.yaw = clamp(view.yaw - (e.clientX - drag.x) * k, -70 * D2R, 70 * D2R);
  view.pitch = clamp(view.pitch - (e.clientY - drag.y) * k, -35 * D2R, 12 * D2R);
  drag.x = e.clientX;
  drag.y = e.clientY;
});
['pointerup', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, () => (drag = null)));
function setScoped(on) {
  view.scoped = on;
  $('hud').classList.toggle('scoped', on);
  $('scopeBtn').classList.toggle('on', on);
  $('scopeBtn').textContent = on ? 'إغلاق' : 'منظار';
  $('zoomBox').style.visibility = on ? 'visible' : 'hidden';
  if (player) player.root.visible = !on;
}
$('scopeBtn').addEventListener('click', () => setScoped(!view.scoped));
$('fireBtn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  fire();
});
$('zoom').addEventListener('input', (e) => {
  view.zoom = +e.target.value;
  $('zoomLbl').textContent = '×' + ar(view.zoom);
});
window.addEventListener('keydown', (e) => {
  if (mode !== 'play') return;
  if (e.code === 'Space') fire();
  if (e.code === 'KeyE') setScoped(!view.scoped);
});
$('pauseBtn').addEventListener('click', () => {
  if (mode !== 'play') return;
  endLevel(null);
});
function updateCamera(dt) {
  view.kick = Math.max(0, (view.kick || 0) - dt * 3);
  if (view.scoped) {
    const target = HIP_FOV / view.zoom;
    camera.fov += (target - camera.fov) * Math.min(1, dt * 12);
    camera.position.copy(eye());
    camera.rotation.set(view.pitch + view.kick * 0.03, view.yaw, 0);
  } else {
    camera.fov += (HIP_FOV - camera.fov) * Math.min(1, dt * 10);
    const back = new THREE.Vector3(1.1, 1.75, 3.6).applyEuler(new THREE.Euler(0, view.yaw, 0));
    camera.position.copy(PLAYER_POS).add(back);
    camera.rotation.set(view.pitch, view.yaw, 0);
  }
  camera.updateProjectionMatrix();
  if (player) {
    player.root.rotation.y = view.yaw + Math.PI;
    player.mixer.update(dt);
  }
}

/* ---------- menus ---------- */
function showScreen(id) {
  ['load', 'menu', 'ward', 'lvls', 'chal', 'res'].forEach((s) => ($(s).hidden = s !== id));
}
let toastT = 0;
function toast(t, bad) {
  const el = $('toast');
  el.textContent = t;
  el.className = 'toast';
  void el.offsetWidth;
  el.classList.add('go');
  if (bad) el.classList.add('bad');
}
function hud() {
  if (!G) return;
  $('hEnemies').textContent = ar(G.left);
  $('hTime').textContent = ar(Math.max(0, Math.ceil(G.time)));
  $('hHp').style.width = G.hp + '%';
  $('hWind').textContent = (G.wind === 0 ? '' : G.wind > 0 ? '← ' : '→ ') + ar(Math.abs(G.wind));
}
function starsFor() {
  let s = 1;
  if (G.time > G.L.time * 0.4) s++;
  if (G.hits && G.shots <= G.hits + 1 && G.hp >= 60) s++;
  return s;
}
const enc = (n) => n.toString(36).toUpperCase();
function challengeCode() {
  return 'Q' + G.n + '-' + enc(G.seed) + '-' + G.score;
}
function parseCode(c) {
  const m = /^Q(\d)-([0-9A-Z]+)-(\d+)$/.exec(c.trim().toUpperCase());
  if (!m) return null;
  const n = +m[1],
    seed = parseInt(m[2], 36);
  if (n < 1 || n > LEVELS.length || !seed) return null;
  return { n, seed, score: +m[3] };
}
function endLevel(win, why) {
  if (!G || G.over) return;
  G.over = true;
  mode = 'over';
  setScoped(false);
  $('hud').hidden = true;
  showScreen('res');
  const title = $('resTitle'),
    text = $('resText'),
    next = $('resNext');
  $('resCodeBox').hidden = true;
  $('resStars').innerHTML = '';
  if (win === null) {
    title.textContent = 'إيقاف';
    text.textContent = 'تبي تكمّل ولا ترجع للقائمة؟';
    next.textContent = 'كمّل';
    next.onclick = () => {
      G.over = false;
      mode = 'play';
      showScreen(null);
      $('hud').hidden = false;
    };
    return;
  }
  if (win) {
    G.score += Math.ceil(G.time) * 5 + G.hp * 2;
    const st = starsFor();
    const coins = 20 + st * 15 + G.heads * 5;
    save.coins += coins;
    save.stars[G.n] = Math.max(save.stars[G.n] || 0, st);
    save.best[G.n] = Math.max(save.best[G.n] || 0, G.score);
    if (G.n >= save.level && G.n < LEVELS.length) save.level = G.n + 1;
    persist();
    title.textContent = 'نظّفت الساحة!';
    $('resStars').innerHTML = [1, 2, 3]
      .map((i) => '<span class="' + (i <= st ? 's' : '') + '">★</span>')
      .join('');
    let msg = 'النتيجة ' + ar(G.score) + ' · طلقات راس ' + ar(G.heads) + ' · كسبت ' + ar(coins) + ' عملة.';
    if (G.challenge)
      msg +=
        G.score > G.challenge.score
          ? ' تفوقت على تحدي ربعك!'
          : ' ما تفوقت على تحدي ربعك (' + ar(G.challenge.score) + '). حاول مرة ثانية.';
    text.textContent = msg;
    $('resCode').textContent = challengeCode();
    $('resCodeBox').hidden = false;
    next.textContent = G.n < LEVELS.length ? 'المرحلة التالية' : 'العب مرة ثانية';
    next.onclick = () => startLevel(Math.min(LEVELS.length, G.n + 1));
  } else {
    title.textContent = 'فشلت المهمة';
    text.textContent = why || 'انتهى الوقت.';
    next.textContent = 'حاول مرة ثانية';
    const n = G.n,
      seed = G.seed,
      ch = G.challenge;
    next.onclick = () => startLevel(n, seed, ch);
  }
}
$('resMenu').addEventListener('click', () => openMenu());
$('copyCode').addEventListener('click', async () => {
  const code = $('resCode').textContent,
    text = 'تحداك في قنّاص الشلة! افتح اللعبة واكتب كود التحدي: ' + code;
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      toast('انتسخ الكود');
    }
  } catch (e) {}
});

async function openMenu() {
  mode = 'menu';
  $('hud').hidden = true;
  showScreen('menu');
  $('coins').textContent = ar(save.coins);
  $('playSub').textContent = 'المرحلة ' + ar(save.level);
  $('starsSum').textContent = ar(Object.values(save.stars).reduce((a, b) => a + b, 0)) + ' نجمة';
  await showMenuActor();
}
// the menu shows your character on the tower, looking over the yard
async function showMenuActor() {
  const want = save.char + (save.shemagh ? '+s' : '');
  if (!menuActor || menuActor.key !== want) {
    const a = await makeActor(save.char, { gun: 'Sniper', gunScale: 0.7, shemagh: save.shemagh });
    a.key = want;
    if (menuActor) scene.remove(menuActor.root);
    menuActor = a;
    a.root.position.copy(PLAYER_POS);
    scene.add(a.root);
  }
  menuActor.root.visible = true;
  if (player) player.root.visible = false;
}
$('playBtn').addEventListener('click', () => {
  if (menuActor) menuActor.root.visible = false;
  startLevel(save.level);
});
$('lvlBtn').addEventListener('click', () => {
  showScreen('lvls');
  mode = 'ward';
  $('lvlGrid').innerHTML = LEVELS.map((L, i) => {
    const n = i + 1,
      st = save.stars[n] || 0;
    return (
      '<button class="lvl" type="button" data-n="' +
      n +
      '"' +
      (n > save.level ? ' disabled' : '') +
      '>' +
      ar(n) +
      '<small>' +
      '★'.repeat(st) +
      '☆'.repeat(3 - st) +
      '</small></button>'
    );
  }).join('');
});
$('lvlGrid').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (menuActor) menuActor.root.visible = false;
  startLevel(+b.dataset.n);
});
$('lvlBack').addEventListener('click', openMenu);
$('chalBtn').addEventListener('click', () => {
  showScreen('chal');
  $('chalErr').textContent = '';
});
$('chalBack').addEventListener('click', openMenu);
$('chalGo').addEventListener('click', () => {
  const c = parseCode($('chalIn').value);
  if (!c) {
    $('chalErr').textContent = 'الكود مو صحيح. تأكد منه وحاول مرة ثانية.';
    return;
  }
  if (menuActor) menuActor.root.visible = false;
  startLevel(c.n, c.seed, c);
});

// wardrobe: everything is free for now (price 0)
let wardSel = save.char,
  wardTab = 'all';
function renderWard() {
  const list = CHARS.filter((c) => wardTab === 'all' || c.g === wardTab);
  $('wardGrid').innerHTML = list
    .map(
      (c) =>
        '<button class="item' +
        (c.id === wardSel ? ' on' : '') +
        (c.id === save.char ? ' worn' : '') +
        '" type="button" data-id="' +
        c.id +
        '"><img loading="lazy" alt="" src="../assets/chibi/thumbs/' +
        c.id +
        '.webp"><b>' +
        c.name +
        '</b><small>' +
        (c.id === save.char ? 'لابسه' : c.price ? ar(c.price) + ' عملة' : 'مجاني') +
        '</small></button>'
    )
    .join('');
  const c = charById[wardSel];
  $('wardName').textContent = c.name;
  $('wardPrice').textContent = c.price ? ar(c.price) + ' عملة' : 'مجاني';
  $('wardWear').textContent = wardSel === save.char ? 'لابسه' : 'البس';
  $('shemTog').checked = save.shemagh;
}
$('wardBtn').addEventListener('click', async () => {
  mode = 'ward';
  wardSel = save.char;
  showScreen('ward');
  renderWard();
});
$('wardTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  wardTab = b.dataset.t;
  [...$('wardTabs').children].forEach((x) => x.classList.toggle('on', x === b));
  renderWard();
});
let previewTok = 0;
async function previewWard() {
  const tok = ++previewTok;
  const a = await makeActor(wardSel, { gun: 'Sniper', gunScale: 0.7, shemagh: $('shemTog').checked });
  if (tok !== previewTok) return;
  a.key = wardSel + ($('shemTog').checked ? '+s' : '');
  if (menuActor) scene.remove(menuActor.root);
  menuActor = a;
  a.root.position.copy(PLAYER_POS);
  scene.add(a.root);
  play(a, 'Victory', 0, true);
  setTimeout(() => menuActor === a && play(a, 'Idle', 0.3), 1800);
}
$('wardGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.item');
  if (!b) return;
  wardSel = b.dataset.id;
  renderWard();
  previewWard();
});
$('shemTog').addEventListener('change', () => {
  save.shemagh = $('shemTog').checked;
  persist();
  previewWard();
});
$('wardWear').addEventListener('click', () => {
  const c = charById[wardSel];
  if (c.price && save.coins < c.price) return;
  save.char = wardSel;
  persist();
  renderWard();
});
$('wardBack').addEventListener('click', openMenu);

/* ---------- sound ---------- */
let AC = null;
function audio() {
  if (!AC)
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function noiseBurst(dur, freq, vol, delay) {
  const c = audio();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur),
    buf = c.createBuffer(1, n, c.sampleRate),
    d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const src = c.createBufferSource(),
    f = c.createBiquadFilter(),
    g = c.createGain();
  src.buffer = buf;
  f.type = 'lowpass';
  f.frequency.value = freq;
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + (delay || 0));
}
function sfxShot(vol, delay) {
  noiseBurst(0.35, 1800, vol || 0.9, delay);
  if (!vol) noiseBurst(0.6, 500, 0.25, 0.25);
}
function sfxHit() {
  noiseBurst(0.12, 900, 0.5, 0.15);
}
document.addEventListener('pointerdown', audio, { once: true });

/* ---------- loop ---------- */
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  if (mode === 'play' && G && !G.over) {
    fireCool = Math.max(0, fireCool - dt);
    G.time -= dt;
    if (G.time <= 0) endLevel(false, 'انتهى الوقت قبل ما تنظّف الساحة.');
    updateTargets(dt);
    updateBullets(dt);
    updateCamera(dt);
    if (Math.floor(G.time * 4) !== Math.floor((G.time + dt) * 4)) hud();
  } else if (G && mode === 'over') {
    for (const t of G.targets) if (t.a) t.a.mixer.update(dt);
  } else {
    // menu camera: slow orbit around the player on the tower
    // keep the character on the left; the buttons sit on the right
    const t = performance.now() / 1000;
    camera.fov = 38;
    camera.updateProjectionMatrix();
    const ward = mode === 'ward',
      a = 0.25 + Math.sin(t * 0.2) * 0.12,
      D = camera.aspect > 1.2 ? (ward ? 6.4 : 4.6) : ward ? 9 : 7.2;
    camera.position.set(PLAYER_POS.x + Math.sin(a) * D, PLAYER_POS.y + 1.25, PLAYER_POS.z + Math.cos(a) * D);
    const rx = Math.cos(a),
      rz = -Math.sin(a),
      wide = camera.aspect > 1.2,
      off = wide ? (ward ? 2.35 : 1.25) : 0,
      up = wide ? (ward ? 0.35 : 0.85) : ward ? 1.9 : 0.35;
    camera.lookAt(PLAYER_POS.x + rx * off, PLAYER_POS.y + up, PLAYER_POS.z + rz * off);
    if (menuActor) menuActor.mixer.update(dt);
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.t += dt;
    p.s.scale.setScalar(0.6 + p.t * 3);
    p.s.material.opacity = Math.max(0, 1 - p.t * 1.6);
    if (p.t > 0.7) {
      scene.remove(p.s);
      puffs.splice(i, 1);
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

/* ---------- start-up ---------- */
(async function boot() {
  const fill = $('loadFill');
  try {
    fill.style.width = '15%';
    await loadClips();
    fill.style.width = '45%';
    await buildArena(1234);
    fill.style.width = '85%';
    await showMenuActor();
    fill.style.width = '100%';
    requestAnimationFrame(loop);
    openMenu();
  } catch (e) {
    $('loadMsg').textContent = 'تعذّر تحميل اللعبة. تأكد من الإنترنت وأعد فتح الصفحة.';
    console.error(e);
  }
})();
// test hook: is the straight line from the scope to a point clear of props?
function lineClear(q) {
  const p = eye(),
    d = q.clone().sub(p),
    len = d.length();
  ray.set(p, d.normalize());
  ray.far = len;
  const h = ray.intersectObject(props, true);
  return h.length ? h[0].distance : -1;
}
window.__Q = {
  lineClear,
  get G() {
    return G;
  },
  get view() {
    return view;
  },
  startLevel,
  fire,
  setScoped,
  get mode() {
    return mode;
  },
  save,
  get player() {
    return player;
  },
  get menuActor() {
    return menuActor;
  }
};
