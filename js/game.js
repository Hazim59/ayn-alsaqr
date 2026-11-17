/**
 * عين الصقر: 3D engine and game (ES module, loaded by index.html).
 *
 * Depends on window.SH (js/screens.js) for screen switching and load progress,
 * and on Three.js r160 via the import map in index.html.
 *
 * Sections (search for "---------- <name>" to jump):
 *    1. game data
 *    2. save (new key, migrates the old عين الصقر save)
 *    3. procedural textures (everything is generated, no image downloads)
 *    4. renderer, camera, sky, light, post-processing
 *    5. geometry buckets: many small parts merged into a few draw calls
 *    6. southern terrain
 *    7. southern villages: Asiri stone houses, Najrani mud towers, stone watchtowers
 *    8. the city: concrete and glass towers in rings
 *    9. people: jointed bodies with smooth limbs, Saudi dress, walk and idle animation
 *   10. weapons: detailed procedural rifle models (first-person and armory preview)
 *   11. armory preview: the same model on a turntable
 *   12. effects: impact dust, sparks, hit mist, tracers, decals
 *   13. sound: synthesised gunshot, mountain echo, bolt, impacts, wind
 *   14. character art (SVG): Saudi men's and women's dress, three skin tones
 *   15. cheers in three dialects, with an optional device voice
 *   16. session state
 *   17. world + mission builder
 *   18. ballistics: real flight time, gravity drop, wind drift, hit boxes
 *   19. firing
 *   20. bullet cam: slow-motion chase of the decisive shot
 *   21. per-frame update
 *   22. layout
 *   23. scope: tube, lens edge and vignette are cached; reticle is drawn live
 *   24. input: drag to look, radar, zoom slider, fire, keys
 *   25. control state shown each frame
 *   26. main loop: game, menu backdrop, adaptive resolution
 *   27. screens and menus
 *   28. arsenal: character, weapons (3D turntable), settings
 *   29. multiplayer: rooms over live presence (no extra permissions needed)
 *   30. web build: same room API over direct phone-to-phone links (PeerJS), no account needed
 *   31. multiplayer on the new engine: avatars, shots, hits
 *   32. start-up
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SH = window.SH;
SH.progress(0.15);
var el = function (id) {
  return document.getElementById(id);
};
var D2R = Math.PI / 180,
  CAMY = 60;
var YAW_MAX = 88 * D2R,
  P_MIN = -40 * D2R,
  P_MAX = 22 * D2R;
var CW = 760,
  CH = 360,
  CX = 380,
  CY = 180,
  CR = 176,
  MINI_Y = 330,
  MINI_H = 22,
  MINI_X = 260,
  MINI_W = 240;
var AR = '٠١٢٣٤٥٦٧٨٩';
function ar(n) {
  return String(n)
    .replace(/\d/g, function (d) {
      return AR[d];
    })
    .replace('.', '٫');
}
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function la(a, b, t) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function mk(w, h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function clockText(t) {
  t = Math.max(0, Math.ceil(t));
  return ar(Math.floor(t / 60)) + ':' + ar(String(t % 60).padStart(2, '0'));
}
function markSeg(id, attr, val) {
  Array.prototype.forEach.call(el(id).children, function (b) {
    b.classList.toggle('on', String(b.getAttribute(attr)) === String(val));
  });
}

/* ---------- game data ---------- */
var DIFFS = {
  easy: {
    id: 'easy',
    name: 'مبتدئ',
    fuse: 1.5,
    time: 1.35,
    ammo: 3,
    wind: 0.5,
    sway: 0.65,
    en: -1,
    civ: -1,
    speed: 0.7,
    coin: 0.7,
    note: 'وقت أطول، رصاص أكثر، رياح خفيفة، ارتجاف أقل، وأهداف أقل وأبطأ. المكافأة ٧٠٪.'
  },
  normal: {
    id: 'normal',
    name: 'محترف',
    fuse: 1.1,
    time: 1,
    ammo: 0,
    wind: 1,
    sway: 1,
    en: 0,
    civ: 0,
    speed: 1,
    coin: 1,
    note: 'التجربة الأساسية. المكافأة ١٠٠٪.'
  },
  hard: {
    id: 'hard',
    name: 'نخبة',
    fuse: 0.8,
    time: 0.8,
    ammo: -2,
    wind: 1.6,
    sway: 1.35,
    en: 1,
    civ: 1,
    speed: 1.45,
    coin: 1.6,
    note: 'وقت أقل، رصاص أقل، رياح قوية، ارتجاف أعلى، وأهداف ومدنيون أكثر وأسرع. وفيه فقط يتوفر زر كتم النفس. المكافأة ١٦٠٪.'
  }
};

var QUAL = {
  low: {
    name: 'منخفضة',
    dpr: 1,
    shadow: 1024,
    post: 0,
    note: 'الأخف: بدون مؤثرات ما بعد الرسم. للأجهزة القديمة.'
  },
  mid: { name: 'متوسطة', dpr: 1.5, shadow: 2048, post: 1, note: 'تنعيم حواف وظلال متوسطة. توازن جيد.' },
  high: {
    name: 'عالية',
    dpr: 2,
    shadow: 2048,
    post: 2,
    note: 'تنعيم وتوهج للشمس وظلال واضحة. لمعظم الجوالات الحديثة.'
  },
  ultra: {
    name: 'فائقة',
    dpr: 2.5,
    shadow: 4096,
    post: 3,
    note: 'كل المؤثرات مع ظلال الزوايا (GTAO) وظلال حية للأشخاص. تحتاج جهازاً قوياً.'
  }
};
var ENVS = {
  day: {
    elev: 46,
    azim: 150,
    turb: 2.2,
    ray: 1.1,
    mie: 0.004,
    mieG: 0.8,
    exp: 0.62,
    sunI: 2.9,
    sunCol: 0xfff1dc,
    hemiI: 1.15,
    fog: 0xc6d6e4,
    fogD: 0.00045,
    lit: 0.0
  },
  dusk: {
    elev: 5,
    azim: 112,
    turb: 6,
    ray: 2.6,
    mie: 0.006,
    mieG: 0.86,
    exp: 0.5,
    sunI: 2.1,
    sunCol: 0xffb37a,
    hemiI: 0.7,
    fog: 0xc99278,
    fogD: 0.0009,
    lit: 2.2
  }
};
var WEAPONS = [
  {
    id: 'm700',
    short: 'M700',
    ar: 'ريمنغتون ٧٠٠',
    name: 'Remington M700',
    cal: '.308 Win',
    act: 'يدوي',
    mag: '٥',
    wt: '٤٫٥ كغ',
    rng: '٨٠٠ م',
    desc: 'بندقية قنص يدوية موثوقة وخفيفة. أساس ممتاز للبداية.',
    price: 0,
    cd: 1.2,
    fov: 8,
    hold: 3.4,
    sway: 1.0,
    wind: 1.0,
    drop: 1.0,
    ammo: 0,
    rec: 1,
    accent: '#7fae5a',
    gun: {
      stock: 'classic',
      pol: ['#3b3d40', '#1a1b1d'],
      act: 'bolt',
      hg: 30,
      hgs: 'tube',
      bl: 88,
      th: 9,
      muzzle: 'plain',
      mag: 'int',
      bipod: false,
      scope: 70
    }
  },
  {
    id: 'svd',
    short: 'SVD',
    ar: 'دراغونوف',
    name: 'Dragunov SVD',
    cal: '7.62×54 mmR',
    act: 'نصف آلي',
    mag: '١٠',
    wt: '٤٫٣ كغ',
    rng: '٨٠٠ م',
    desc: 'بندقية روسية نصف آلية. طلقات أسرع لكن ثباتها أقل.',
    price: 450,
    cd: 0.6,
    fov: 9,
    hold: 4.2,
    sway: 1.25,
    wind: 1.1,
    drop: 1.05,
    ammo: 2,
    rec: 0.8,
    accent: '#eab14d',
    gun: {
      stock: 'svd',
      pol: ['#9a6a3a', '#5a3a1c'],
      act: 'semi',
      hg: 64,
      hgs: 'wood',
      bl: 60,
      th: 8,
      muzzle: 'flash',
      mag: 'curve',
      bipod: false,
      scope: 56
    }
  },
  {
    id: 'm110',
    short: 'M110',
    ar: 'إم ١١٠',
    name: "Knight's M110 SASS",
    cal: '7.62×51 mm NATO',
    act: 'نصف آلي',
    mag: '٢٠',
    wt: '٦٫٩ كغ',
    rng: '٨٠٠ م',
    desc: 'بندقية قنص نصف آلية بكاتم ومخزن كبير. سريعة ودقيقة.',
    price: 850,
    cd: 0.45,
    fov: 8,
    hold: 3.6,
    sway: 1.05,
    wind: 0.95,
    drop: 0.98,
    ammo: 3,
    rec: 0.7,
    accent: '#9aa7ff',
    gun: {
      stock: 'ar',
      pol: ['#4a4d50', '#1e2023'],
      act: 'semi',
      hg: 74,
      hgs: 'rail',
      bl: 58,
      th: 10,
      muzzle: 'supp',
      mag: 'box',
      bipod: true,
      scope: 76
    }
  },
  {
    id: 'awm',
    short: 'AWM',
    ar: 'إيه دبليو إم',
    name: 'Accuracy International AWM',
    cal: '.338 Lapua Magnum',
    act: 'يدوي',
    mag: '٥',
    wt: '٦٫٩ كغ',
    rng: '١٤٠٠ م',
    desc: 'بندقية بريطانية بعيدة المدى. تتحمل الرياح بشكل ممتاز.',
    price: 1400,
    cd: 1.4,
    fov: 6.5,
    hold: 2.5,
    sway: 0.7,
    wind: 0.6,
    drop: 0.7,
    ammo: -1,
    rec: 1.3,
    accent: '#7fe0a0',
    gun: {
      stock: 'thumb',
      pol: ['#5a6a45', '#2c3520'],
      act: 'bolt',
      hg: 30,
      hgs: 'tube',
      bl: 96,
      th: 10,
      muzzle: 'brake',
      mag: 'box',
      bipod: true,
      scope: 80
    }
  },
  {
    id: 'm82',
    short: 'M82A1',
    ar: 'باريت',
    name: 'Barrett M82A1',
    cal: '.50 BMG',
    act: 'نصف آلي',
    mag: '١٠',
    wt: '١٤٫٧ كغ',
    rng: '١٨٠٠ م',
    desc: 'بندقية ثقيلة مضادة للعتاد. رصاصتها قوية وتسقط قليلاً.',
    price: 2000,
    cd: 0.9,
    fov: 7,
    hold: 2.8,
    sway: 0.85,
    wind: 0.55,
    drop: 0.6,
    ammo: 1,
    rec: 1.6,
    accent: '#e0603f',
    gun: {
      stock: 'tube',
      pol: ['#4b4f54', '#202327'],
      act: 'semi',
      hg: 46,
      hgs: 'tube',
      bl: 108,
      th: 13,
      muzzle: 'brake',
      mag: 'box',
      bipod: true,
      scope: 84
    }
  },
  {
    id: 'm200',
    short: 'M200',
    ar: 'شايتاك',
    name: 'CheyTac M200 Intervention',
    cal: '.408 CheyTac',
    act: 'يدوي',
    mag: '٧',
    wt: '١١٫٨ كغ',
    rng: '٢٠٠٠ م',
    desc: 'منظومة قنص بأبعد مدى وأعلى ثبات، لكنها بطيئة.',
    price: 2700,
    cd: 1.5,
    fov: 5.5,
    hold: 2.1,
    sway: 0.55,
    wind: 0.45,
    drop: 0.5,
    ammo: 0,
    rec: 1.2,
    accent: '#d6c48a',
    gun: {
      stock: 'chassis',
      pol: ['#b49a6a', '#6f5c3a'],
      act: 'bolt',
      hg: 56,
      hgs: 'rail',
      bl: 100,
      th: 11,
      muzzle: 'brake',
      mag: 'box',
      bipod: true,
      scope: 86
    }
  }
];
var PARTS = [
  { id: 'scope', name: 'المنظار', desc: 'تكبير أعلى في كل مستوى', cost: [150, 300, 520] },
  { id: 'barrel', name: 'السبطانة', desc: 'ثبات أعلى، ورياح وسقوط أقل', cost: [150, 300, 520] },
  { id: 'mag', name: 'المخزن', desc: 'رصاصة إضافية في كل مستوى', cost: [120, 240, 420] }
];
var SUITS = [
  {
    id: 't0',
    price: 0,
    perk: 'الزي الأساسي بلا ميزة',
    bg: '#3b5266',
    m: { n: 'الثوب الأبيض', k: 'thobe', sl: 0xf2f0e8 },
    f: { n: 'ثوب النشل النجدي', k: 'nashal', sl: 0x8a1f2a }
  },
  {
    id: 't1',
    price: 350,
    perk: 'مقاومة الرياح +١٠٪',
    wind: 0.9,
    bg: '#2d3a4a',
    m: { n: 'الثوب الشتوي', k: 'winter', sl: 0x4a4f57 },
    f: { n: 'الثوب العسيري', k: 'asiri', sl: 0x141414 }
  },
  {
    id: 't2',
    price: 600,
    perk: 'ثبات المنظار +١٠٪',
    sway: 0.9,
    bg: '#4a3f2c',
    m: { n: 'الزي الميداني', k: 'field', sl: 0x9b8156 },
    f: { n: 'الزي الميداني', k: 'field', sl: 0xa68c62 }
  },
  {
    id: 't3',
    price: 1500,
    perk: 'عملات المهمة +١٥٪',
    coin: 1.15,
    bg: '#4a3a2a',
    m: { n: 'البشت', k: 'bisht', sl: 0x1a1613 },
    f: { n: 'المكمم النجراني', k: 'najrani', sl: 0x141414 }
  }
];
var SKIN = {
  w: { n: 'أبيض', hex: 0xf0d2b6 },
  h: { n: 'حنطي', hex: 0xd2a173 },
  s: { n: 'أسمر', hex: 0x8a5636 }
};
var HEADS = { shemagh: 'شماغ', ghutra: 'غترة', wool: 'شماغ صوف', asaba: 'عصبة' };
var PHR = {
  najdi: {
    kill: ['كفو والله!', 'زينها يا ذيب', 'أبطال!'],
    head: ['ذيب يا ذيب!', 'في الراس، كفو!'],
    multi: ['زد يا بطل!', 'ما وقفت!'],
    death: ['لا تزعل، قم خذ ثارك', 'قم يا ذيب'],
    fail: ['ما عليه، المرة الجاية لك', 'عاودها وأنت أقوى'],
    win: ['الله الله، فزت!', 'كفو يا بطل']
  },
  south: {
    kill: ['يا زينها من طلقة!', 'هذي هي!'],
    head: ['ما شاء الله، عين صقر!', 'في الراس يا رجّال!'],
    multi: ['هذي هي يا رجّال!', 'واصل يا ولد!'],
    death: ['قم يا رجّال، عاودهم', 'ما عليك، قم'],
    fail: ['ما صار شي، عاودها', 'ولا يهمك، المرة الجاية'],
    win: ['والله إنك الأول', 'فزت يا بطل!']
  },
  hijazi: {
    kill: ['يا سلام عليك!', 'حلوة يا شيخ!'],
    head: ['إيش ذا الإبداع يا شيخ!', 'في الراس على طول!'],
    multi: ['مرة كده يا حبيبي!', 'كمّل كمّل!'],
    death: ['معليش، قوم وريهم', 'ولا يهمك، قوم'],
    fail: ['ولا يهمك، جرّب كمان', 'معليش، المرة الجاية'],
    win: ['أبطال يا بطل!', 'يا سلام، فزت!']
  }
};

var MV = { m700: 850, svd: 830, m110: 790, awm: 905, m82: 853, m200: 910 };
var REGN = { south: 'الجنوب', city: 'المدينة' };
var RANKS = ['مجنّد', 'قنّاص', 'قنّاص أول', 'صقر', 'نخبة'];
var HIP = 56;
var TYPE_ORDER = ['clear', 'hostage', 'assassin', 'protect'];
var STORIES = {
  clear: [
    {
      t: 'تطهير الأسطح',
      s: 'مجموعة مسلحة تسيطر على أسطح الحي وتهدد السكان.',
      o: 'اقنص كل المسلحين وتجنّب المدنيين.'
    },
    {
      t: 'الحي المحاصر',
      s: 'مسلحون يمنعون الأهالي من الخروج من بيوتهم.',
      o: 'أسقط كل المسلحين دون إصابة مدني.'
    },
    { t: 'حراسة المنطقة', s: 'عصابة تراقب الشارع من أسطح المباني.', o: 'اقنصهم قبل أن ينتبهوا لك.' }
  ],
  hostage: [
    {
      t: 'رهينة على السطح',
      s: 'مجرم مسلح يحتجز رهينة على سطح أحد المباني ويهدد بقتلها.',
      o: 'أصب المجرم بدقة لتحرير الرهينة. المجرم أحمر، والرهينة عليها علامة صفراء.'
    },
    {
      t: 'صفقة فاشلة',
      s: 'فشلت مفاوضات إطلاق سراح رهينة، والمجرم على وشك فقدان أعصابه.',
      o: 'حرّر الرهينة بإصابة المجرم فقط.'
    },
    {
      t: 'الدقيقة الأخيرة',
      s: 'خاطف يمسك رهينة عند حافة السطح وينتظر طلباً لن يتحقق.',
      o: 'أصب الخاطف بدقة، وأي إصابة للرهينة تفشل المهمة.'
    }
  ],
  assassin: [
    {
      t: 'المطلوب رقم واحد',
      s: 'مجرم خطير مختبئ وسط المدنيين في الحي، ومعك وصفه فقط.',
      o: 'تعرّف عليه بالوصف واقنصه. أي شخص آخر يفشل المهمة.'
    },
    {
      t: 'وجه بين الجموع',
      s: 'مصدر موثوق وصف لك الهدف الذي ينتقل بين الأسطح.',
      o: 'طابق الوصف بدقة قبل أن تطلق النار.'
    },
    {
      t: 'الصيد الهادئ',
      s: 'مطلوب للعدالة يتنكر بين الأهالي ولا يحمل سلاحاً ظاهراً.',
      o: 'اقتل الشخص الموصوف فقط.'
    }
  ],
  protect: [
    {
      t: 'حماية الشخصية',
      s: 'شخصية مهمة تلقي كلمة على سطح مبنى، وقتلة يتسللون حولها.',
      o: 'اقنص كل المسلحين قبل أن يطلقوا النار. الشخصية عليها علامة خضراء.'
    },
    {
      t: 'حارس السماء',
      s: 'مسؤول يتفقد المنطقة وفريق اغتيال يترصده من الأسطح.',
      o: 'أسقطهم قبل أن يطلقوا النار عليه.'
    },
    {
      t: 'عين الحراسة',
      s: 'قافلة رسمية تتوقف عند الحي ومسلحون يستعدون لإطلاق النار.',
      o: 'احمِ الشخصية بإسقاط كل المهاجمين في الوقت المناسب.'
    }
  ]
};
var WINS = {
  clear: 'سقطت الأهداف كلها.',
  hostage: 'تحررت الرهينة وسلمت من الأذى.',
  assassin: 'سقط المطلوب وانتهت المهمة.',
  protect: 'سلمت الشخصية وانتهى الخطر.'
};
var SHIRTS = [
  { ar: 'أحمر', hex: 0xb8382c },
  { ar: 'أزرق', hex: 0x2f6fb8 },
  { ar: 'أخضر', hex: 0x3f8a4f },
  { ar: 'أصفر', hex: 0xd8b030 },
  { ar: 'أسود', hex: 0x222222 }
];
var HATSM = [
  { id: 'cap', ar: 'قبعة سوداء' },
  { id: 'ghutra', ar: 'غترة بيضاء' },
  { id: 'shemagh', ar: 'شماغ أحمر' },
  { id: 'none', ar: 'بدون غطاء رأس' }
];
function missionInfo(n) {
  var type = TYPE_ORDER[(n - 1) % 4],
    st = STORIES[type][Math.floor((n - 1) / 4) % 3],
    r = rng(n * 131 + 7);
  var shirt = SHIRTS[Math.floor(r() * SHIRTS.length)],
    hat = HATSM[Math.floor(r() * HATSM.length)];
  var info = { type: type, t: st.t, s: st.s, o: st.o, shirt: shirt, hat: hat };
  if (type === 'assassin') {
    info.desc = 'رجل بقميص ' + shirt.ar + (hat.id === 'none' ? ' وبلا غطاء رأس' : ' و' + hat.ar);
    info.o = 'المطلوب: ' + info.desc + '. ' + st.o;
  }
  return info;
}

var wById = {},
  suitById = {};
WEAPONS.forEach(function (w, i) {
  w.idx = i;
  wById[w.id] = w;
});
SUITS.forEach(function (s) {
  suitById[s.id] = s;
});

/* ---------- save (new key, migrates the old عين الصقر save) ---------- */
var KEY = 'shilla-v1',
  OLD = ['ayn-alsaqr-v4', 'ayn-alsaqr-v3'];
function defSave() {
  var lv = {};
  WEAPONS.forEach(function (w) {
    lv[w.id] = { scope: 0, barrel: 0, mag: 0 };
  });
  return {
    coins: 200,
    owned: { m700: true },
    sel: 'm700',
    lv: lv,
    level: 1,
    diff: 'normal',
    region: 'south',
    q: 'high',
    env: 'day',
    bright: 1,
    auto: true,
    fpsOn: false,
    suits: { t0: true },
    suit: 't0',
    gender: 'm',
    skin: 'h',
    head: 'shemagh',
    lithma: false,
    rolled: false,
    aim: 'slider',
    dialect: 'najdi',
    voice: 'm',
    bcam: true,
    sfx: true
  };
}
function load() {
  var d = defSave(),
    j = null;
  try {
    j = JSON.parse(localStorage.getItem(KEY));
  } catch (e) {}
  if (!j) {
    for (var i = 0; i < OLD.length && !j; i++) {
      try {
        j = JSON.parse(localStorage.getItem(OLD[i]));
      } catch (e) {}
    }
  }
  if (!j || typeof j !== 'object') return d;
  d.coins = Math.max(0, +j.coins || 0);
  d.level = Math.max(1, Math.min(99, +j.level || 1));
  if (j.owned)
    WEAPONS.forEach(function (w) {
      if (j.owned[w.id]) d.owned[w.id] = true;
    });
  if (wById[j.sel] && d.owned[j.sel]) d.sel = j.sel;
  WEAPONS.forEach(function (w) {
    var l = j.lv && j.lv[w.id];
    if (l)
      d.lv[w.id] = {
        scope: Math.min(3, l.scope | 0),
        barrel: Math.min(3, l.barrel | 0),
        mag: Math.min(3, l.mag | 0)
      };
  });
  var SMAP = { thobe: 't0', desert: 't1', ghillie: 't2', special: 't2', bisht: 't3' };
  if (j.suits)
    Object.keys(j.suits).forEach(function (k) {
      var m = SMAP[k] || (suitById[k] ? k : null);
      if (m && j.suits[k]) d.suits[m] = true;
    });
  var sj = SMAP[j.suit] || j.suit;
  if (suitById[sj] && d.suits[sj]) d.suit = sj;
  if (DIFFS[j.diff]) d.diff = j.diff;
  if (j.region === 'city' || j.region === 'south') d.region = j.region;
  if (QUAL[j.q]) d.q = j.q;
  if (ENVS[j.env]) d.env = j.env;
  if (+j.bright >= 0.7 && +j.bright <= 1.4) d.bright = +j.bright;
  if (j.auto === false) d.auto = false;
  if (j.fpsOn) d.fpsOn = true;
  if (j.gender === 'f') d.gender = 'f';
  if (SKIN[j.skin]) d.skin = j.skin;
  if (HEADS[j.head]) d.head = j.head;
  d.lithma = !!j.lithma;
  d.rolled = !!j.rolled;
  if (j.aim === 'button') d.aim = 'button';
  if (PHR[j.dialect]) d.dialect = j.dialect;
  if (j.voice === 'f' || j.voice === 'off') d.voice = j.voice;
  if (j.bcam === false) d.bcam = false;
  if (j.sfx === false) d.sfx = false;
  return d;
}
var save = load();
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch (e) {}
}
function curStats(id) {
  var w = wById[id],
    l = save.lv[id],
    su = suitById[save.suit] || SUITS[0];
  return {
    w: w,
    cd: w.cd,
    fov: w.fov * (1 - 0.06 * l.scope),
    hold: w.hold * (1 - 0.09 * l.scope),
    sway: w.sway * (1 - 0.1 * l.barrel) * (su.sway || 1),
    wind: w.wind * (1 - 0.1 * l.barrel) * (su.wind || 1),
    drop: w.drop * (1 - 0.05 * l.barrel),
    ammo: w.ammo + l.mag,
    mv: MV[w.id] || 850,
    rec: w.rec,
    bmax: 3
  };
}
function partCost(p, w, lvl) {
  return Math.round((p.cost[lvl] * (1 + w.idx * 0.4)) / 10) * 10;
}

/* ---------- procedural textures (everything is generated, no image downloads) ---------- */
var ANISO = 8;
function texOf(c, srgb, rx, ry) {
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rx) t.repeat.set(rx, ry || rx);
  return t;
}
// tileable value-noise fbm, values 0..1
function fbm(N, base, oct, seed, gain) {
  var out = new Float32Array(N * N),
    r = rng(seed),
    amp = 1,
    tot = 0;
  for (var o = 0; o < oct; o++) {
    var P = base << o,
      lat = new Float32Array(P * P);
    for (var i = 0; i < P * P; i++) lat[i] = r();
    for (var y = 0; y < N; y++) {
      var fy = (y / N) * P,
        y0 = Math.floor(fy),
        ty = fy - y0,
        sy = ty * ty * (3 - 2 * ty),
        y1 = (y0 + 1) % P;
      for (var x = 0; x < N; x++) {
        var fx = (x / N) * P,
          x0 = Math.floor(fx),
          tx = fx - x0,
          sx = tx * tx * (3 - 2 * tx),
          x1 = (x0 + 1) % P;
        var a = lat[y0 * P + x0],
          b = lat[y0 * P + x1],
          c = lat[y1 * P + x0],
          d = lat[y1 * P + x1];
        out[y * N + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    tot += amp;
    amp *= gain || 0.5;
  }
  for (var k = 0; k < out.length; k++) out[k] /= tot;
  return out;
}
// height array -> tangent-space normal map canvas (wraps at edges so it tiles)
function normalCanvas(h, N, strength) {
  var c = mk(N, N),
    x = c.getContext('2d'),
    img = x.createImageData(N, N),
    d = img.data;
  for (var y = 0; y < N; y++)
    for (var i = 0; i < N; i++) {
      var l = h[y * N + ((i - 1 + N) % N)],
        r = h[y * N + ((i + 1) % N)],
        u = h[((y - 1 + N) % N) * N + i],
        dn = h[((y + 1) % N) * N + i];
      var nx = (l - r) * strength,
        ny = (dn - u) * strength,
        nz = 1,
        len = Math.hypot(nx, ny, nz),
        p = (y * N + i) * 4;
      d[p] = ((nx / len) * 0.5 + 0.5) * 255;
      d[p + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      d[p + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      d[p + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  return c;
}
function grayCanvas(h, N, lo, hi) {
  var c = mk(N, N),
    x = c.getContext('2d'),
    img = x.createImageData(N, N),
    d = img.data;
  for (var k = 0; k < N * N; k++) {
    var v = (lo + (hi - lo) * h[k]) * 255;
    d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = v;
    d[k * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
var TX = {};
function makeTextures() {
  var N = 256,
    n1,
    n2,
    i;
  // ground detail: soft albedo variation + crisp micro relief (pebbles, soil clods)
  n1 = fbm(N, 4, 5, 11, 0.55);
  n2 = fbm(N, 16, 3, 12, 0.6);
  var gh = new Float32Array(N * N);
  for (i = 0; i < N * N; i++) gh[i] = n1[i] * 0.5 + n2[i] * 0.5;
  TX.ground = texOf(grayCanvas(gh, N, 0.72, 1.0), true, 220, 220);
  TX.groundN = texOf(normalCanvas(n2, N, 6), false, 220, 220);
  // Asiri dry-stone courses: irregular blocks, recessed joints, a few lighter stones
  var S = 512,
    sc = mk(S, S),
    sx = sc.getContext('2d'),
    hgt = new Float32Array(S * S),
    r = rng(43);
  sx.fillStyle = '#5c544b';
  sx.fillRect(0, 0, S, S);
  var hc = mk(S, S),
    hx = hc.getContext('2d');
  hx.fillStyle = '#000';
  hx.fillRect(0, 0, S, S);
  for (var y = 0; y < S; y += 28) {
    var x0 = -r() * 60,
      rowH = 24 + Math.floor(r() * 4);
    while (x0 < S) {
      var bw = 38 + r() * 70,
        c = 108 + Math.floor(r() * 60),
        warm = r();
      var col =
        'rgb(' + (c + (warm < 0.3 ? 16 : 0)) + ',' + (c - 6) + ',' + (c - 18 - (warm > 0.75 ? 12 : 0)) + ')';
      [0, S].forEach(function (wx) {
        sx.fillStyle = col;
        sx.beginPath();
        sx.roundRect(x0 + 2 + wx - (x0 + bw > S && wx === S ? 0 : 0), y + 2, bw - 4, rowH - 3, 5);
        sx.fill();
        hx.fillStyle = 'rgb(' + (150 + Math.floor(r() * 90)) + ',0,0)';
        hx.beginPath();
        hx.roundRect(x0 + 2 + wx, y + 2, bw - 4, rowH - 3, 6);
        hx.fill();
      });
      x0 += bw;
    }
  }
  var hd = hx.getImageData(0, 0, S, S).data,
    n3 = fbm(S, 8, 4, 44, 0.55);
  for (i = 0; i < S * S; i++) hgt[i] = (hd[i * 4] / 255) * 0.8 + n3[i] * 0.2;
  var sd = sx.getImageData(0, 0, S, S);
  for (i = 0; i < S * S; i++) {
    var m = 0.82 + n3[i] * 0.3;
    sd.data[i * 4] *= m;
    sd.data[i * 4 + 1] *= m;
    sd.data[i * 4 + 2] *= m;
  }
  sx.putImageData(sd, 0, 0);
  TX.stone = texOf(sc, true);
  TX.stoneN = texOf(normalCanvas(hgt, S, 9), false);
  // Najrani mud: smooth hand-laid courses with horizontal ridges
  var mc = mk(N, N),
    mx = mc.getContext('2d'),
    mh = new Float32Array(N * N),
    n4 = fbm(N, 8, 4, 45, 0.5);
  var md = mx.createImageData(N, N);
  for (y = 0; y < N; y++)
    for (var x = 0; x < N; x++) {
      var k = y * N + x,
        ridge = Math.pow(Math.abs(Math.sin(((y + n4[k] * 10) / N) * Math.PI * 12)), 6);
      mh[k] = n4[k] * 0.6 + ridge * 0.4;
      var v = 0.85 + n4[k] * 0.25 - ridge * 0.12;
      md.data[k * 4] = 182 * v;
      md.data[k * 4 + 1] = 136 * v;
      md.data[k * 4 + 2] = 88 * v;
      md.data[k * 4 + 3] = 255;
    }
  mx.putImageData(md, 0, 0);
  TX.mud = texOf(mc, true);
  TX.mudN = texOf(normalCanvas(mh, N, 5), false);
  // plaster (lime white, city concrete)
  var n5 = fbm(N, 8, 4, 46, 0.55);
  TX.plaster = texOf(grayCanvas(n5, N, 0.86, 1.0), true);
  TX.plasterN = texOf(normalCanvas(n5, N, 2.5), false);
  // city: concrete/glass facade with a window grid and lit windows for dusk
  var fc = mk(256, 256),
    fx = fc.getContext('2d'),
    ec = mk(256, 256),
    ex = ec.getContext('2d'),
    rr = rng(7);
  fx.fillStyle = '#c9c1b4';
  fx.fillRect(0, 0, 256, 256);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, 256, 256);
  for (var j = 0; j < 4; j++)
    for (var q = 0; q < 4; q++) {
      var wx2 = q * 64 + 12,
        wy2 = j * 64 + 12,
        g = fx.createLinearGradient(0, wy2, 0, wy2 + 40);
      g.addColorStop(0, '#8fa7bd');
      g.addColorStop(0.5, '#3d4d60');
      g.addColorStop(1, '#1b2430');
      fx.fillStyle = '#9a9286';
      fx.fillRect(wx2 - 4, wy2 - 4, 48, 48);
      fx.fillStyle = g;
      fx.fillRect(wx2, wy2, 40, 40);
      fx.fillStyle = '#9a9286';
      fx.fillRect(wx2 + 19, wy2, 2, 40);
      if (rr() < 0.33) {
        ex.fillStyle = '#ffb860';
        ex.fillRect(wx2, wy2, 40, 40 * (0.6 + rr() * 0.4));
      }
    }
  TX.facade = texOf(fc, true);
  TX.facadeE = texOf(ec, true);
  TX.asphalt = texOf(grayCanvas(fbm(N, 16, 3, 47, 0.6), N, 0.28, 0.42), true, 160, 160);
  // weapon surfaces
  var wc = mk(256, 64),
    wx = wc.getContext('2d'),
    wn = fbm(256, 4, 3, 48, 0.5);
  for (x = 0; x < 256; x++)
    for (y = 0; y < 64; y++) {
      var gr = Math.sin(x * 0.09 + wn[((y * 4) % 256) * 256 + x] * 9) * 0.5 + 0.5;
      wx.fillStyle =
        'rgb(' +
        Math.round(120 + gr * 50) +
        ',' +
        Math.round(78 + gr * 34) +
        ',' +
        Math.round(40 + gr * 18) +
        ')';
      wx.fillRect(x, y, 1, 1);
    }
  TX.wood = texOf(wc, true);
  var bn = fbm(N, 32, 2, 49, 0.5),
    bc = grayCanvas(bn, N, 0.55, 0.85);
  TX.brushed = texOf(bc, false, 4, 1);
  // particles and sky bits
  TX.puff = glow('rgba(225,210,185,.85)', 'rgba(225,210,185,0)');
  TX.glow = glow('rgba(255,236,200,1)', 'rgba(255,200,120,0)');
  TX.flash = glow('rgba(255,240,200,1)', 'rgba(255,150,40,0)');
  TX.spark = glow('rgba(255,250,220,1)', 'rgba(255,190,90,0)');
  TX.cloud = cloudTex();
  TX.grass = grassTex();
}
function glow(a, b) {
  var c = mk(64, 64),
    x = c.getContext('2d'),
    g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function cloudTex() {
  var c = mk(256, 128),
    x = c.getContext('2d'),
    r = rng(5);
  for (var i = 0; i < 26; i++) {
    var px = 40 + r() * 176,
      py = 46 + r() * 40,
      pr = 16 + r() * 34,
      g = x.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function grassTex() {
  var c = mk(64, 64),
    x = c.getContext('2d'),
    r = rng(9);
  for (var i = 0; i < 26; i++) {
    var bx = 4 + r() * 56,
      h = 30 + r() * 32,
      lean = (r() - 0.5) * 18,
      g = 90 + r() * 70;
    x.strokeStyle = 'rgb(' + Math.round(g * 0.7) + ',' + Math.round(g) + ',' + Math.round(g * 0.45) + ')';
    x.lineWidth = 1.6 + r() * 1.4;
    x.beginPath();
    x.moveTo(bx, 64);
    x.quadraticCurveTo(bx + lean * 0.3, 64 - h * 0.6, bx + lean, 64 - h);
    x.stroke();
  }
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- renderer, camera, sky, light, post-processing ---------- */
var glc = el('gl'),
  cv = el('cv'),
  ctx = cv.getContext('2d');
var renderer = new THREE.WebGLRenderer({
  canvas: glc,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
makeTextures();
SH.progress(0.35);

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(HIP, 1, 0.5, 2600);
camera.rotation.order = 'YXZ';
scene.fog = new THREE.FogExp2(0xb9cbdc, 0.00105);
var sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
var skyEnv = new Sky();
skyEnv.scale.setScalar(10000);
var envScene = new THREE.Scene();
envScene.add(skyEnv);
var pmrem = new THREE.PMREMGenerator(renderer),
  envRT = null;
var sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
(function () {
  var c = sun.shadow.camera;
  c.left = -330;
  c.right = 330;
  c.top = 330;
  c.bottom = -330;
  c.near = 20;
  c.far = 1700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  sun.shadow.mapSize.set(2048, 2048);
})();
scene.add(sun);
scene.add(sun.target);
var hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b5a45, 0.55);
scene.add(hemi);
var sunDir = new THREE.Vector3(),
  curEnv = ENVS.day;
var clouds = new THREE.Group();
scene.add(clouds);
(function () {
  var r = rng(11);
  for (var i = 0; i < 26; i++) {
    var yw = (r() * 2 - 1) * 130 * D2R,
      el2 = (14 + r() * 24) * D2R,
      dist = 1700;
    var m = new THREE.SpriteMaterial({
      map: TX.cloud,
      transparent: true,
      opacity: 0.3 + r() * 0.25,
      depthWrite: false,
      fog: false
    });
    var sp = new THREE.Sprite(m);
    sp.position.set(
      Math.sin(yw) * Math.cos(el2) * dist,
      CAMY + Math.sin(el2) * dist,
      -Math.cos(yw) * Math.cos(el2) * dist
    );
    sp.scale.set(500 + r() * 600, 140 + r() * 120, 1);
    sp.userData.op = m.opacity;
    clouds.add(sp);
  }
})();
function applyEnv(key) {
  var E = ENVS[key] || ENVS.day;
  curEnv = E;
  var phi = (90 - E.elev) * D2R,
    th = E.azim * D2R;
  sunDir.setFromSphericalCoords(1, phi, th);
  [sky, skyEnv].forEach(function (s) {
    var u = s.material.uniforms;
    u.turbidity.value = E.turb;
    u.rayleigh.value = E.ray;
    u.mieCoefficient.value = E.mie;
    u.mieDirectionalG.value = E.mieG;
    u.sunPosition.value.copy(sunDir);
  });
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  vmScene.environment = envRT.texture;
  sun.color.setHex(E.sunCol);
  sun.intensity = E.sunI;
  var tgt = new THREE.Vector3(0, 0, -170);
  sun.target.position.copy(tgt);
  sun.position.copy(tgt).addScaledVector(sunDir, 800);
  hemi.intensity = E.hemiI;
  scene.fog.color.setHex(E.fog);
  scene.fog.density = E.fogD;
  baseFog = E.fogD;
  clouds.children.forEach(function (c) {
    c.material.color.setHex(key === 'dusk' ? 0xf0a585 : 0xffffff);
  });
  if (MATS.glassLit) MATS.glassLit.emissiveIntensity = E.lit;
  if (MATS.facade) MATS.facade.emissiveIntensity = E.lit * 0.8;
  applyExposure();
  renderer.shadowMap.needsUpdate = true;
}
var baseFog = 0.00105;
function applyExposure() {
  renderer.toneMappingExposure = curEnv.exp * save.bright;
}

var composer = null,
  bloomPass = null,
  gtaoPass = null,
  smaaPass = null;
var stageW = 640,
  stageH = 360,
  basePR = 1,
  rs = 1;
function setupPost() {
  var q = QUAL[save.q];
  if (composer) {
    composer.passes.forEach(function (p) {
      if (p.dispose) p.dispose();
    });
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    composer = null;
  }
  bloomPass = gtaoPass = smaaPass = null;
  if (!q.post) return;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (q.post >= 3) {
    gtaoPass = new GTAOPass(scene, camera, stageW, stageH);
    gtaoPass.blendIntensity = 0.8;
    composer.addPass(gtaoPass);
  }
  if (q.post >= 2) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(stageW, stageH), 0.28, 0.5, 0.9);
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());
  smaaPass = new SMAAPass(stageW, stageH);
  composer.addPass(smaaPass);
}
function setRes() {
  var pr = basePR * rs;
  renderer.setPixelRatio(pr);
  renderer.setSize(stageW, stageH, false);
  glc.style.width = stageW + 'px';
  glc.style.height = stageH + 'px';
  if (composer) {
    composer.setPixelRatio(pr);
    composer.setSize(stageW, stageH);
  }
  camera.aspect = stageW / stageH;
  camera.updateProjectionMatrix();
  vmCam.aspect = camera.aspect;
  vmCam.updateProjectionMatrix();
}
function applyQuality() {
  var q = QUAL[save.q];
  if (sun.shadow.mapSize.x !== q.shadow) {
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
    sun.shadow.mapSize.set(q.shadow, q.shadow);
  }
  renderer.shadowMap.autoUpdate = save.q === 'ultra';
  renderer.shadowMap.needsUpdate = true;
  setupPost();
  rs = 1;
  fit();
}

/* ---------- geometry buckets: many small parts merged into a few draw calls ---------- */
var _m4 = new THREE.Matrix4(),
  _m4b = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _v = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _col = new THREE.Color();
function Bucket() {
  this.g = [];
}
Bucket.prototype.add = function (geo, parent, x, y, z, ry, sx, sy, sz, hex, rx) {
  var g = geo.index ? geo.toNonIndexed() : geo.clone();
  _e.set(rx || 0, ry || 0, 0);
  _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s.set(sx || 1, sy || 1, sz || 1));
  if (parent) _m4.premultiply(parent);
  g.applyMatrix4(_m4);
  var n = g.attributes.position.count,
    c = new Float32Array(n * 3);
  _col.setHex(hex == null ? 0xffffff : hex);
  for (var i = 0; i < n; i++) {
    c[i * 3] = _col.r;
    c[i * 3 + 1] = _col.g;
    c[i * 3 + 2] = _col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (var k in g.attributes)
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
  this.g.push(g);
  return g;
};
Bucket.prototype.mesh = function (mat, cast) {
  if (!this.g.length) return null;
  var geo = mergeGeometries(this.g, false);
  this.g.forEach(function (g) {
    g.dispose();
  });
  this.g = [];
  geo.computeBoundingSphere();
  var m = new THREE.Mesh(geo, mat);
  m.castShadow = cast !== false;
  m.receiveShadow = true;
  m.userData.own = true;
  return m;
};
// world-scaled UVs on a box so stone/plaster tiles at a constant size
function boxUV(w, h, d, tile) {
  var g = new THREE.BoxGeometry(w, h, d),
    uv = g.attributes.uv,
    dims = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h]
    ];
  for (var f = 0; f < 6; f++)
    for (var i = 0; i < 4; i++) {
      var k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  return g;
}
var G = {};
function sharedGeo() {
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.rugf = new THREE.CylinderGeometry(0.7071, 0.7071 * 1.16, 1, 4, 1, true);
  G.rugf.rotateY(Math.PI / 4);
  var tri = new THREE.Shape();
  tri.moveTo(-0.42, 0);
  tri.lineTo(0, 0.72);
  tri.lineTo(0.42, 0);
  tri.lineTo(-0.42, 0);
  G.merlon = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
  G.merlon.translate(0, 0, -0.1);
  var arch = new THREE.Shape();
  arch.moveTo(-0.62, 0);
  arch.lineTo(0, 0.42);
  arch.lineTo(0.62, 0);
  arch.lineTo(-0.62, 0);
  G.winTop = new THREE.ExtrudeGeometry(arch, { depth: 0.14, bevelEnabled: false });
  G.winTop.translate(0, 0, -0.07);
  G.ring = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
}
var MATS = {};
function sharedMats() {
  MATS.stone = new THREE.MeshStandardMaterial({
    map: TX.stone,
    normalMap: TX.stoneN,
    normalScale: new THREE.Vector2(1.3, 1.3),
    vertexColors: true,
    roughness: 0.93
  });
  MATS.mud = new THREE.MeshStandardMaterial({
    map: TX.mud,
    normalMap: TX.mudN,
    vertexColors: true,
    roughness: 0.96,
    color: 0xd9c8b4
  });
  MATS.trim = new THREE.MeshStandardMaterial({
    map: TX.plaster,
    normalMap: TX.plasterN,
    vertexColors: true,
    roughness: 0.82
  });
  MATS.glass = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 0.3, metalness: 0.2 });
  MATS.glassLit = new THREE.MeshStandardMaterial({
    color: 0x2a1d10,
    emissive: 0xffb46a,
    emissiveIntensity: 0,
    roughness: 0.4
  });
  MATS.facade = new THREE.MeshStandardMaterial({
    map: TX.facade,
    emissiveMap: TX.facadeE,
    emissive: 0xffd29a,
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.15
  });
  MATS.terrain = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: TX.ground,
    normalMap: TX.groundN,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.97
  });
  MATS.asphalt = new THREE.MeshStandardMaterial({ map: TX.asphalt, roughness: 0.92 });
  MATS.tree = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  MATS.grass = new THREE.MeshStandardMaterial({
    map: TX.grass,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.95,
    color: 0xb4c48c
  });
  MATS.mist = new THREE.SpriteMaterial({
    map: TX.puff,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    fog: true,
    color: 0xffffff
  });
  MATS.blob = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.22, depthWrite: false });
}
sharedGeo();
sharedMats();
var SHUT = [0x2f8a5a, 0x2c62b0, 0xb8392b, 0xd9a520, 0x1f9a9a];

/* ---------- southern terrain ---------- */
var H = function () {
  return 0;
};
function makeH(r) {
  var p1 = r() * 6.28,
    p2 = r() * 6.28,
    p3 = r() * 6.28;
  return function (x, z) {
    var d = Math.hypot(x, z),
      a = Math.atan2(x, -z);
    var hill = 52 * Math.exp(-(d * d) / 2450),
      rise = 175 / (1 + Math.exp(-(d - 265) / 55));
    var wv = clamp((d - 60) / 80, 0, 1);
    var nz =
      (14 * Math.sin(x * 0.013 + p1) * Math.sin(z * 0.011 + p2) +
        6 * Math.sin(x * 0.037 + z * 0.029 + p3) +
        2.2 * Math.sin(x * 0.09 - z * 0.07 + p1)) *
      wv;
    var spur = 11 * Math.sin(a * 5 + p2) * clamp((d - 120) / 150, 0, 1);
    var crag = 9 * Math.pow(Math.abs(Math.sin(x * 0.021 + z * 0.017 + p3)), 3) * clamp((d - 330) / 120, 0, 1);
    return hill + rise + nz + spur + crag - 3;
  };
}
function buildTerrain(world) {
  var SZ = 2000,
    SEG = 250,
    g = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG);
  g.rotateX(-Math.PI / 2);
  var pos = g.attributes.position,
    uv = g.attributes.uv,
    cols = new Float32Array(pos.count * 3),
    cc = new THREE.Color();
  var C = function (h) {
    return new THREE.Color(h);
  };
  var cRock = C(0x84755f),
    cRock2 = C(0x9a9086),
    cGreen = C(0x62843f),
    cOlive = C(0x86954a),
    cTan = C(0xb39a66),
    cRiser = C(0x857158),
    cDry = C(0xa58f68),
    cSoil = C(0x8d7350);
  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i),
      z = pos.getZ(i),
      h = H(x, z),
      d = Math.hypot(x, z);
    pos.setY(i, h);
    var sl = Math.hypot(H(x + 2, z) - H(x - 2, z), H(x, z + 2) - H(x, z - 2)) / 4;
    if (d < 75) cc.copy(cDry).lerp(cRock, Math.min(1, sl));
    else if (sl > 0.95 || h > 165) cc.copy(h > 165 ? cRock2 : cRock).lerp(cOlive, h > 165 ? 0 : 0.25);
    else {
      var band = h / 3.2,
        fr = band - Math.floor(band),
        id = Math.floor(band) * 7 + Math.floor((Math.atan2(x, -z) + 2) * 6);
      cc.copy(fr < 0.14 ? cRiser : [cGreen, cOlive, cTan, cGreen, cSoil][((id % 5) + 5) % 5]);
      if (sl > 0.6) cc.lerp(cRock, Math.min(1, (sl - 0.6) / 0.35));
    }
    cols[i * 3] = cc.r;
    cols[i * 3 + 1] = cc.g;
    cols[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  var m = new THREE.Mesh(g, MATS.terrain);
  m.receiveShadow = true;
  m.castShadow = false;
  m.userData.own = true;
  world.add(m);
}

/* ---------- southern villages: Asiri stone houses, Najrani mud towers, stone watchtowers ---------- */
function buildSouth(n, r, world, blds) {
  H = makeH(r);
  buildTerrain(world);
  var B = {
    stone: new Bucket(),
    mud: new Bucket(),
    trim: new Bucket(),
    glass: new Bucket(),
    lit: new Bucket()
  };
  var par = new THREE.Matrix4();
  function free(x, z, rad) {
    return blds.every(function (o) {
      return Math.hypot(o.x - x, o.z - z) > rad + o.rad + 1.4;
    });
  }
  function merlonRow(px, pz, y, len, rot, col) {
    var cnt = Math.max(2, Math.round(len / 1.05)),
      step = len / cnt;
    for (var i = 0; i < cnt; i++) {
      var t = -len / 2 + step * (i + 0.5);
      var lx = rot ? px : t,
        lz = rot ? t : pz;
      B.trim.add(G.merlon, par, lx, y, lz, rot ? Math.PI / 2 : 0, step / 0.9, 1, 1, col);
    }
  }
  function windowAt(lx, y, lz, ry, detail) {
    var c = SHUT[Math.floor(r() * SHUT.length)],
      out = 0.06;
    var nx = Math.sin(ry),
      nz = Math.cos(ry);
    B.trim.add(G.box, par, lx + nx * out, y, lz + nz * out, ry, 1.3, 1.6, 0.14, 0xf3efe6);
    (r() < 0.32 ? B.lit : B.glass).add(
      G.box,
      par,
      lx + nx * (out + 0.05),
      y - 0.02,
      lz + nz * (out + 0.05),
      ry,
      0.84,
      1.14,
      0.06,
      0xffffff
    );
    B.trim.add(G.winTop, par, lx + nx * out, y + 0.8, lz + nz * out, ry, 1, 1, 1, 0xf3efe6);
    if (detail) {
      // open shutters, hinged on both sides
      var px = Math.cos(ry),
        pz = -Math.sin(ry);
      [-1, 1].forEach(function (s) {
        B.trim.add(
          G.box,
          par,
          lx + px * s * 0.66 + nx * 0.28,
          y,
          lz + pz * s * 0.66 + nz * 0.28,
          ry + s * 1.1,
          0.44,
          1.12,
          0.05,
          c
        );
      });
      B.trim.add(G.box, par, lx + nx * 0.18, y - 0.86, lz + nz * 0.18, ry, 1.4, 0.1, 0.32, 0xe9e3d8);
    }
  }
  function house(x, z, li) {
    var a = Math.atan2(x, -z),
      w = 7.5 + r() * 5,
      dp = 7 + r() * 5,
      rad = Math.max(w, dp) * 0.62;
    if (!free(x, z, rad)) return;
    var cs = Math.cos(a),
      sn = Math.sin(a),
      gmin = 1e9,
      gmax = -1e9;
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [0, 0]
    ].forEach(function (q) {
      var lx2 = (q[0] * w) / 2,
        lz2 = (q[1] * dp) / 2,
        hh = H(x + cs * lx2 - sn * lz2, z + sn * lx2 + cs * lz2);
      gmin = Math.min(gmin, hh);
      gmax = Math.max(gmax, hh);
    });
    var tower = li < 3 && r() < 0.14,
      bottom = gmin - 3.5,
      detail = li < 3;
    var ns = tower ? 5 + Math.floor(r() * 3) : 2 + Math.floor(r() * 3);
    var k0 = Math.ceil((gmax - bottom) / 3.5),
      kT = k0 + ns - 1,
      hb = kT * 3.5,
      top = bottom + hb;
    par.compose(_v.set(x, bottom, z), _q.setFromEuler(_e.set(0, -a, 0)), _s.set(1, 1, 1));
    var tint = [0xffffff, 0xeee4d6, 0xdcd4cb, 0xf2e2cf][Math.floor(r() * 4)];
    if (tower) {
      var rb = w * 0.7071,
        rt = rb * 0.78,
        tw = rt / 0.7071,
        g = new THREE.CylinderGeometry(rt, rb, hb, 4, 1);
      g.rotateY(Math.PI / 4);
      var uv = g.attributes.uv;
      for (var i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w * 4) / 4, (uv.getY(i) * hb) / 4);
      B.mud.add(g, par, 0, hb / 2, 0, 0, 1, 1, 1, tint);
      g.dispose();
      B.trim.add(G.box, par, 0, hb - 0.6, 0, 0, tw + 0.12, 1.2, tw + 0.12, 0xf3efe6);
      merlonRow(0, tw / 2 + 0.02, hb, tw, false, 0xf3efe6);
      merlonRow(0, -tw / 2 - 0.02, hb, tw, false, 0xf3efe6);
      merlonRow(tw / 2 + 0.02, 0, hb, tw, true, 0xf3efe6);
      merlonRow(-tw / 2 - 0.02, 0, hb, tw, true, 0xf3efe6);
      for (var s = k0; s < kT; s++) {
        var fy = s * 3.5 + 1.7,
          half = (rb + (rt - rb) * (fy / hb)) / 0.7071 / 2;
        if (r() < 0.75) windowAt(0, fy, half + 0.02, 0, false);
      }
    } else {
      var body = boxUV(w, hb, dp, 4);
      B.stone.add(body, par, 0, hb / 2, 0, 0, 1, 1, 1, tint);
      body.dispose();
      B.trim.add(G.box, par, 0, hb - 0.16, 0, 0, w + 0.18, 0.32, dp + 0.18, 0xf3efe6);
      B.trim.add(G.box, par, 0, hb + 0.02, 0, 0, w - 0.3, 0.06, dp - 0.3, 0x8f7c66);
      merlonRow(0, dp / 2 + 0.05, hb, w + 0.1, false, 0xf3efe6);
      merlonRow(0, -dp / 2 - 0.05, hb, w + 0.1, false, 0xf3efe6);
      merlonRow(w / 2 + 0.05, 0, hb, dp, true, 0xf3efe6);
      merlonRow(-w / 2 - 0.05, 0, hb, dp, true, 0xf3efe6);
      for (var k = k0; k < kT; k++)
        B.trim.add(G.rugf, par, 0, k * 3.5 - 0.22, 0, 0, w + 0.12, 0.42, dp + 0.12, 0x4e4740);
      if (li < 4) {
        for (var f = k0; f <= kT - 1; f++) {
          var wy = f * 3.5 + 1.75,
            cols = Math.max(1, Math.floor((w - 1.6) / 2.6));
          for (var q = 0; q < cols; q++)
            if (r() < 0.8) windowAt(-w / 2 + (w * (q + 0.5)) / cols, wy, dp / 2, 0, detail);
          if (detail && r() < 0.7) windowAt(w / 2, wy, 0, Math.PI / 2, false);
          if (detail && r() < 0.7) windowAt(-w / 2, wy, 0, -Math.PI / 2, false);
        }
        if (detail)
          B.trim.add(
            G.box,
            par,
            (r() - 0.5) * (w - 3),
            k0 * 3.5 - 3.5 + (gmax - bottom - (k0 - 1) * 3.5) + 1.1,
            dp / 2 + 0.05,
            0,
            1.2,
            2.2,
            0.12,
            0x5a3a22
          );
      }
    }
    blds.push({
      l: tower ? 9 : li,
      a: a,
      w: w,
      d: dp,
      h: top,
      x: x,
      z: z,
      rad: rad,
      bot: bottom,
      tower: tower
    });
  }
  var clusters = [],
    ci;
  for (ci = 0; ci < 7; ci++)
    clusters.push({
      a: (-68 + ci * 22.6 + (r() * 10 - 5)) * D2R,
      d: 112 + r() * 170,
      n: 6 + Math.floor(r() * 6),
      li: -1
    });
  for (ci = 0; ci < 5; ci++)
    clusters.push({
      a: (-75 + ci * 37 + (r() * 14 - 7)) * D2R,
      d: 370 + r() * 170,
      n: 5 + Math.floor(r() * 4),
      li: 4
    });
  clusters.forEach(function (c) {
    for (var q = 0; q < 60; q++) {
      var dd = c.d + (r() * 2 - 1) * 26,
        aa = c.a + ((r() * 2 - 1) * 30) / c.d;
      var li = c.li >= 0 ? c.li : dd < 165 ? 0 : dd < 225 ? 1 : 2;
      house(Math.sin(aa) * dd, -Math.cos(aa) * dd, li);
      if (
        blds.filter(function (o) {
          return Math.abs(o.a - c.a) < 40 / c.d && Math.abs(Math.hypot(o.x, o.z) - c.d) < 30;
        }).length >= c.n
      )
        break;
    }
  });
  // round stone watchtowers on the ridges
  for (ci = 0; ci < 6; ci++) {
    var ta = (-80 + r() * 160) * D2R,
      td = 320 + r() * 260,
      tx = Math.sin(ta) * td,
      tz = -Math.cos(ta) * td,
      th = 16 + r() * 8,
      tr = 2.8 + r() * 1.2,
      by = H(tx, tz) - 4;
    par.compose(_v.set(tx, by, tz), _q.identity(), _s.set(1, 1, 1));
    var tg = new THREE.CylinderGeometry(tr * 0.86, tr, th + 4, 18, 1),
      tuv = tg.attributes.uv;
    for (var u = 0; u < tuv.count; u++)
      tuv.setXY(u, (tuv.getX(u) * tr * 6.28) / 4, (tuv.getY(u) * (th + 4)) / 4);
    B.stone.add(tg, par, 0, (th + 4) / 2, 0, 0, 1, 1, 1, 0xe6ddd2);
    tg.dispose();
    B.trim.add(G.ring, par, 0, th + 3.7, 0, 0, tr * 0.9, 0.6, tr * 0.9, 0xf3efe6);
    for (var mm = 0; mm < 12; mm++) {
      var ang = (mm / 12) * Math.PI * 2;
      B.trim.add(
        G.merlon,
        par,
        Math.sin(ang) * tr * 0.88,
        th + 4,
        Math.cos(ang) * tr * 0.88,
        ang,
        1,
        1,
        1,
        0xf3efe6
      );
    }
  }
  ['stone', 'mud', 'trim', 'glass'].forEach(function (k) {
    var m = B[k].mesh(MATS[k]);
    if (m) world.add(m);
  });
  var lm = B.lit.mesh(MATS.glassLit, false);
  if (lm) world.add(lm);
  buildVegetation(r, world, blds);
  // valley mist
  for (ci = 0; ci < 5; ci++) {
    var ma = (r() * 2 - 1) * 80 * D2R,
      md = 90 + r() * 160,
      mx = Math.sin(ma) * md,
      mz = -Math.cos(ma) * md,
      ms = new THREE.Sprite(MATS.mist);
    ms.position.set(mx, H(mx, mz) + 8 + r() * 14, mz);
    ms.scale.set(110 + r() * 90, 26 + r() * 18, 1);
    world.add(ms);
  }
}
function buildVegetation(r, world, blds) {
  // juniper: trunk + clustered crowns in one geometry, instanced
  var parts = [],
    trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.6, 6);
  trunk.translate(0, 0.8, 0);
  var tb = new Bucket();
  tb.add(trunk, null, 0, 0, 0, 0, 1, 1, 1, 0x4a3524);
  [
    [0, 1.9, 0, 1.05],
    [0.45, 1.5, 0.2, 0.75],
    [-0.4, 1.6, -0.2, 0.8],
    [0.1, 2.6, 0.05, 0.7]
  ].forEach(function (b, i) {
    var s = new THREE.IcosahedronGeometry(b[3], 1);
    tb.add(s, null, b[0], b[1], b[2], 0, 1, 0.9, 1, [0x2c4426, 0x34502b, 0x2a3f22, 0x3a5730][i]);
    s.dispose();
  });
  var tg = mergeGeometries(tb.g, false);
  tb.g.forEach(function (g) {
    g.dispose();
  });
  trunk.dispose();
  var TN = 460,
    trees = new THREE.InstancedMesh(tg, MATS.tree, TN),
    dm = new THREE.Object3D(),
    placed = 0;
  for (var t = 0; t < TN * 5 && placed < TN; t++) {
    var ya = (r() * 2 - 1) * 88 * D2R,
      yd = 70 + r() * 470,
      x = Math.sin(ya) * yd,
      z = -Math.cos(ya) * yd;
    if (
      !blds.every(function (o) {
        return Math.hypot(o.x - x, o.z - z) > o.rad + 2.5;
      })
    )
      continue;
    var sc = 1.3 + r() * 1.6;
    dm.position.set(x, H(x, z) - 0.2, z);
    dm.rotation.y = r() * 6.28;
    dm.scale.set(sc, sc * (0.9 + r() * 0.5), sc);
    dm.updateMatrix();
    trees.setMatrixAt(placed++, dm.matrix);
  }
  trees.count = placed;
  trees.frustumCulled = false;
  trees.castShadow = true;
  trees.receiveShadow = true;
  trees.userData.own = true;
  world.add(trees);
  // grass clumps on the terraces where targets are
  var p1 = new THREE.PlaneGeometry(1.4, 0.8);
  p1.translate(0, 0.4, 0);
  var gb = new Bucket();
  [0, 1.05, 2.1].forEach(function (ang) {
    gb.add(p1, null, 0, 0, 0, ang, 1, 1, 1, 0xffffff);
  });
  var gg = mergeGeometries(gb.g, false);
  gb.g.forEach(function (g) {
    g.dispose();
  });
  p1.dispose();
  var GN = 4200,
    grass = new THREE.InstancedMesh(gg, MATS.grass, GN),
    gp = 0;
  for (var k = 0; k < GN * 3 && gp < GN; k++) {
    var ga = (r() * 2 - 1) * 82 * D2R,
      gd = 72 + r() * 300,
      gx = Math.sin(ga) * gd,
      gz = -Math.cos(ga) * gd,
      h = H(gx, gz);
    var sl = Math.abs(H(gx + 2, gz) - H(gx - 2, gz)) / 4;
    if (sl > 0.6) continue;
    var gs = 0.8 + r() * 1.1;
    dm.position.set(gx, h - 0.05, gz);
    dm.rotation.y = r() * 6.28;
    dm.scale.set(gs, gs * (0.8 + r() * 0.6), gs);
    dm.updateMatrix();
    grass.setMatrixAt(gp++, dm.matrix);
  }
  grass.count = gp;
  grass.frustumCulled = false;
  grass.userData.own = true;
  world.add(grass);
}

/* ---------- the city: concrete and glass towers in rings ---------- */
var LAYERS = [
  { dist: 100, hMin: 24, hMax: 48, wMin: 14, wMax: 22 },
  { dist: 160, hMin: 30, hMax: 60, wMin: 16, wMax: 26 },
  { dist: 240, hMin: 36, hMax: 70, wMin: 18, wMax: 30 },
  { dist: 470, hMin: 50, hMax: 130, wMin: 26, wMax: 46, far: true }
];
function buildCity(n, r, world, blds) {
  H = function () {
    return 0;
  };
  var gnd = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), MATS.asphalt);
  gnd.rotation.x = -Math.PI / 2;
  gnd.receiveShadow = true;
  gnd.userData.own = true;
  world.add(gnd);
  var B = { facade: new Bucket(), trim: new Bucket() },
    par = new THREE.Matrix4();
  LAYERS.forEach(function (L, li) {
    var a = -YAW_MAX;
    while (a < YAW_MAX) {
      var w = L.wMin + r() * (L.wMax - L.wMin),
        dp = L.wMin + r() * 10,
        h = L.hMin + r() * (L.hMax - L.hMin),
        dist = L.dist + (r() * 10 - 5);
      var x = Math.sin(a) * dist,
        z = -Math.cos(a) * dist;
      par.compose(_v.set(x, 0, z), _q.setFromEuler(_e.set(0, -a, 0)), _s.set(1, 1, 1));
      var g = new THREE.BoxGeometry(w, h, dp),
        uv = g.attributes.uv,
        dims = [
          [dp, h],
          [dp, h],
          [w, dp],
          [w, dp],
          [w, h],
          [w, h]
        ];
      for (var f = 0; f < 6; f++)
        for (var i = 0; i < 4; i++) {
          var k = f * 4 + i;
          uv.setXY(
            k,
            f === 2 || f === 3 ? 0 : (uv.getX(k) * dims[f][0]) / 12.8,
            f === 2 || f === 3 ? 0 : (uv.getY(k) * dims[f][1]) / 14
          );
        }
      B.facade.add(
        g,
        par,
        0,
        h / 2,
        0,
        0,
        1,
        1,
        1,
        [0xffffff, 0xf3e7d8, 0xd9d3cd, 0xcfe0ea][Math.floor(r() * 4)]
      );
      g.dispose();
      if (!L.far) {
        B.trim.add(G.box, par, 0, h + 0.25, 0, 0, w + 0.6, 0.5, dp + 0.6, 0x3a3836);
        B.trim.add(G.box, par, 0, h + 0.95, dp / 2 + 0.15, 0, w + 0.6, 0.9, 0.3, 0x8c867e);
        B.trim.add(G.box, par, 0, h + 0.95, -dp / 2 - 0.15, 0, w + 0.6, 0.9, 0.3, 0x8c867e);
        B.trim.add(G.box, par, w / 2 + 0.15, h + 0.95, 0, 0, 0.3, 0.9, dp + 0.6, 0x8c867e);
        B.trim.add(G.box, par, -w / 2 - 0.15, h + 0.95, 0, 0, 0.3, 0.9, dp + 0.6, 0x8c867e);
        for (var p = 0; p < 2 + Math.floor(r() * 3); p++) {
          var px = (r() * 2 - 1) * (w / 2 - 2),
            pz = (r() < 0.5 ? -1 : 1) * (1.8 + r() * Math.max(0.2, dp / 2 - 3.5));
          if (r() < 0.5) B.trim.add(G.box, par, px, h + 1, pz, 0, 1.6, 1, 1.2, 0xc9c9c4);
          else B.trim.add(G.box, par, px, h + 1.6, pz, 0, 2.4, 2.2, 2.4, 0x8c867e);
        }
        blds.push({ l: li, a: a, w: w, d: dp, h: h + 0.5, x: x, z: z, rad: Math.max(w, dp) * 0.6, bot: 0 });
      }
      a += (w + 3 + r() * 6) / dist;
    }
  });
  var fm = B.facade.mesh(MATS.facade);
  if (fm) world.add(fm);
  var tm = B.trim.mesh(MATS.trim);
  if (tm) world.add(tm);
}

/* ---------- people: jointed bodies with smooth limbs, Saudi dress, walk and idle animation ---------- */
var PM = {};
function pmat(hex, rough, metal) {
  var k = hex + '_' + (rough || 0.8) + '_' + (metal || 0);
  return (
    PM[k] ||
    (PM[k] = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: rough == null ? 0.8 : rough,
      metalness: metal || 0
    }))
  );
}
var shemTex = (function () {
  var c = mk(64, 64),
    x = c.getContext('2d');
  x.fillStyle = '#f4f1ea';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#b8302c';
  for (var i = 0; i < 8; i++)
    for (var j = 0; j < 8; j++) if ((i + j) % 2 === 0) x.fillRect(i * 8 + 1, j * 8 + 1, 6, 6);
  x.strokeStyle = 'rgba(140,30,28,.6)';
  for (i = 0; i < 64; i += 8) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 64);
    x.moveTo(0, i);
    x.lineTo(64, i);
    x.stroke();
  }
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
var camoTex = (function () {
  var c = mk(64, 64),
    x = c.getContext('2d'),
    r = rng(31);
  x.fillStyle = '#9c845e';
  x.fillRect(0, 0, 64, 64);
  ['#6f5a3a', '#4f4430', '#c2ad84', '#5d5a3c'].forEach(function (col) {
    x.fillStyle = col;
    for (var i = 0; i < 12; i++) {
      var px = r() * 64,
        py = r() * 64,
        rx = 3 + r() * 7,
        ry = 2 + r() * 4,
        a = r() * 3;
      [-64, 0, 64].forEach(function (ox) {
        [-64, 0, 64].forEach(function (oy) {
          x.beginPath();
          x.ellipse(px + ox, py + oy, rx, ry, a, 0, 6.3);
          x.fill();
        });
      });
    }
  });
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
var MP_SHEM = new THREE.MeshStandardMaterial({ map: shemTex, roughness: 0.9, side: THREE.DoubleSide });
var CLOTH2 = {};
function cloth2(hex) {
  return (
    CLOTH2[hex] ||
    (CLOTH2[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, side: THREE.DoubleSide }))
  );
}
var MP_CAMO = new THREE.MeshStandardMaterial({ map: camoTex, roughness: 0.95, envMapIntensity: 0.4 });
var PG = {
  thigh: new THREE.CapsuleGeometry(0.078, 0.34, 4, 10),
  shin: new THREE.CapsuleGeometry(0.064, 0.36, 4, 10),
  uarm: new THREE.CapsuleGeometry(0.056, 0.24, 4, 10),
  farm: new THREE.CapsuleGeometry(0.047, 0.22, 4, 10),
  hand: new THREE.SphereGeometry(0.05, 10, 8),
  head: new THREE.SphereGeometry(0.115, 20, 16),
  neck: new THREE.CylinderGeometry(0.05, 0.058, 0.12, 10),
  chest: new THREE.CapsuleGeometry(0.17, 0.26, 6, 14),
  belly: new THREE.CapsuleGeometry(0.15, 0.14, 6, 14),
  boot: new THREE.BoxGeometry(0.11, 0.09, 0.26),
  dome: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  nose: new THREE.ConeGeometry(0.022, 0.05, 6),
  agal: new THREE.TorusGeometry(0.122, 0.011, 6, 22),
  drape: new THREE.CylinderGeometry(0.135, 0.24, 0.42, 14, 1, true, Math.PI * 0.25, Math.PI * 1.5),
  backDrape: new THREE.CylinderGeometry(0.13, 0.2, 0.62, 12, 1, true, Math.PI * 0.6, Math.PI * 0.8),
  blob: new THREE.CircleGeometry(0.55, 16)
};
// robe silhouette: shoulders -> hem, slightly flared (thobe, abaya, bisht)
PG.robe = new THREE.LatheGeometry(
  [
    new THREE.Vector2(0.05, 1.5),
    new THREE.Vector2(0.19, 1.46),
    new THREE.Vector2(0.225, 1.38),
    new THREE.Vector2(0.215, 1.05),
    new THREE.Vector2(0.235, 0.6),
    new THREE.Vector2(0.28, 0.08),
    new THREE.Vector2(0.275, 0.04)
  ].reverse(),
  26
);
PG.robe.scale(1, 1, 0.78);
PG.eye = new THREE.SphereGeometry(0.014, 8, 6);
PG.brow = new THREE.BoxGeometry(0.04, 0.008, 0.012);
PG.rifle = (function () {
  var b = new Bucket();
  b.add(G.box, null, 0, 0, 0.12, 0, 0.06, 0.09, 0.5, 0x16181a);
  b.add(G.box, null, 0, 0.01, 0.52, 0, 0.03, 0.03, 0.4, 0x16181a);
  b.add(G.box, null, 0, -0.11, 0.1, 0, 0.05, 0.15, 0.07, 0x16181a);
  b.add(G.box, null, 0, -0.01, -0.25, 0, 0.06, 0.11, 0.22, 0x2a2c2e);
  b.add(G.box, null, 0, 0.07, 0.15, 0, 0.05, 0.05, 0.2, 0x0c0c0c);
  var g = mergeGeometries(b.g, false);
  b.g.forEach(function (x) {
    x.dispose();
  });
  return g;
})();
var MP_RIFLE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
function addM(parent, geo, mat, x, y, z, sx, sy, sz) {
  var m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (sx) m.scale.set(sx, sy || sx, sz || sx);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function limb(parent, x, y, z, segA, segB, lenA, matA, matB, end, endMat) {
  var p = new THREE.Group();
  p.position.set(x, y, z);
  parent.add(p);
  addM(p, segA, matA, 0, -lenA / 2, 0);
  var j = new THREE.Group();
  j.position.set(0, -lenA, 0);
  p.add(j);
  addM(j, segB, matB, 0, -lenA / 2 + 0.01, 0);
  if (end) addM(j, end, endMat, 0, -lenA - 0.03, end === PG.boot ? 0.05 : 0);
  return { p: p, j: j };
}
var SKINS = [0xe2b896, 0xc99a72, 0xa97c58, 0x8a5636];
// kind: 'e' armed enemy, 'c' civilian / hostage / VIP / player look
function mkPerson(kind, r, o) {
  o = o || {};
  var g = new THREE.Group(),
    u = {},
    foe = kind === 'e';
  var skin = pmat(o.skinHex || SKINS[Math.floor(r() * SKINS.length)], 0.62);
  var robe = !foe && (o.thobe !== undefined ? o.thobe : r() < 0.55);
  var cloth = foe
    ? MP_CAMO
    : robe
      ? pmat(o.robe || 0xf2f0e8, 0.88)
      : o.shirt
        ? pmat(o.shirt, 0.85)
        : pmat([0x2f6fb8, 0xd8ccb0, 0x4f8a5a, 0xa8743f, 0xcfcfcf][Math.floor(r() * 5)], 0.85);
  var pants = foe ? MP_CAMO : pmat([0x2b3342, 0x5a5148, 0x3a3a3a][Math.floor(r() * 3)], 0.9),
    boot = pmat(0x1d1713, 0.7);
  var root = new THREE.Group();
  g.add(root);
  u.root = root;
  u.legL = limb(root, -0.1, 0.92, 0, PG.thigh, PG.shin, 0.44, pants, pants, PG.boot, boot);
  u.legR = limb(root, 0.1, 0.92, 0, PG.thigh, PG.shin, 0.44, pants, pants, PG.boot, boot);
  var torso = new THREE.Group();
  torso.position.y = 0.92;
  root.add(torso);
  u.torso = torso;
  if (robe) {
    var rb = addM(root, PG.robe, cloth, 0, 0, 0);
    u.robe = rb;
  }
  addM(torso, PG.belly, cloth, 0, 0.16, 0, 1, 1, 0.74);
  addM(torso, PG.chest, cloth, 0, 0.42, 0, 1.05, 1, 0.68);
  addM(torso, PG.neck, skin, 0, 0.66, 0);
  var head = new THREE.Group();
  head.position.set(0, 0.76, 0);
  torso.add(head);
  u.head = head;
  addM(head, PG.head, skin, 0, 0, 0, 0.92, 1.1, 1);
  var nose = addM(head, PG.nose, skin, 0, -0.008, o.hat === 'shayla' ? 0.13 : 0.116);
  nose.rotation.x = Math.PI / 2;
  u.armL = limb(torso, -0.235, 0.55, 0, PG.uarm, PG.farm, 0.3, cloth, cloth, PG.hand, skin);
  u.armR = limb(torso, 0.235, 0.55, 0, PG.uarm, PG.farm, 0.3, cloth, cloth, PG.hand, skin);
  u.armL.p.rotation.z = -0.08;
  u.armR.p.rotation.z = 0.08;
  var hat =
    o.hat || (foe ? 'helmet' : robe ? (r() < 0.55 ? 'shemagh' : 'ghutra') : r() < 0.4 ? 'cap' : 'none');
  if (!foe && hat !== 'shayla') {
    var bm = pmat(0x241811, 0.95);
    addM(head, PG.head, bm, 0, -0.062, 0.006, 0.84, 0.44, 0.86);
    addM(head, G.box, bm, 0, -0.035, 0.103, 0.06, 0.012, 0.02);
  }
  var fz = hat === 'shayla' ? 0.122 : 0.104;
  [-1, 1].forEach(function (sd) {
    addM(head, PG.eye, pmat(0xf2eee6, 0.5), sd * 0.036, 0.022, fz, 1.1, 0.75, 0.5);
    addM(head, PG.eye, pmat(0x1a1410, 0.3), sd * 0.036, 0.022, fz + 0.005, 0.6, 0.6, 0.4);
    if (!foe) addM(head, PG.brow, pmat(0x1a120c, 0.9), sd * 0.038, 0.044, fz + 0.002).rotation.z = -sd * 0.12;
  });
  addM(head, PG.box || G.box, pmat(0x8a4a3c, 0.7), 0, -0.04, fz + 0.004, 0.03, 0.007, 0.01);
  if (foe) {
    addM(head, PG.head, pmat(0x151515, 0.95), 0, 0, 0, 0.96, 1.13, 1.03);
    addM(head, G.box, skin, 0, 0.02, 0.1, 0.13, 0.035, 0.03);
    addM(head, PG.dome, pmat(0x30352a, 0.55, 0.1), 0, 0.03, 0, 0.14, 0.13, 0.15);
    addM(torso, G.box, pmat(0x2a2e23, 0.85), 0, 0.38, 0, 0.42, 0.42, 0.27);
    for (var q = -1; q <= 1; q++)
      addM(torso, G.box, pmat(0x23271d, 0.85), q * 0.13, 0.26, 0.15, 0.1, 0.11, 0.07);
    var rf = addM(torso, PG.rifle, MP_RIFLE, 0.1, 0.36, 0.22);
    u.rifle = rf;
    u.armL.p.rotation.set(-1.15, 0, -0.25);
    u.armL.j.rotation.x = -0.7;
    u.armR.p.rotation.set(-0.8, 0, 0.3);
    u.armR.j.rotation.x = -1.0;
  } else if (hat === 'shemagh' || hat === 'ghutra') {
    var hm = hat === 'ghutra' ? cloth2(0xf6f4ee) : MP_SHEM;
    addM(head, PG.dome, hm, 0, 0.02, -0.005, 0.135, 0.13, 0.145);
    addM(head, PG.drape, hm, 0, -0.17, -0.01);
    addM(torso, PG.backDrape, hm, 0, 0.42, -0.04);
    var ag1 = addM(head, PG.agal, pmat(0x111111, 0.6), 0, 0.075, -0.012);
    ag1.rotation.x = Math.PI / 2 - 0.12;
    var ag2 = addM(head, PG.agal, pmat(0x111111, 0.6), 0, 0.095, -0.016);
    ag2.rotation.x = Math.PI / 2 - 0.12;
  } else if (hat === 'shayla') {
    var sm = cloth2(o.shayla || 0x141414);
    addM(head, PG.head, sm, 0, 0.012, -0.012, 1.08, 1.22, 1.12);
    addM(head, PG.drape, sm, 0, -0.17, -0.02);
    addM(torso, PG.backDrape, sm, 0, 0.4, -0.04);
    addM(head, PG.head, skin, 0, -0.005, 0.03, 0.74, 0.92, 0.9);
  } else if (hat === 'cap') {
    addM(head, PG.dome, pmat(0x18181c, 0.8), 0, 0.03, -0.005, 0.125, 0.1, 0.13);
    addM(head, G.box, pmat(0x18181c, 0.8), 0, 0.03, 0.12, 0.2, 0.015, 0.1);
  } else {
    addM(head, PG.dome, pmat(0x1c1410, 0.9), 0, 0.02, -0.005, 0.12, 0.11, 0.125);
  }
  var blob = new THREE.Mesh(PG.blob, MATS.blob);
  blob.rotation.x = -Math.PI / 2;
  u.blob = blob;
  g.rotation.order = 'YXZ';
  g.userData = u;
  return g;
}
// walk / idle / aim poses, driven by phase
function animPerson(g, mode, ph, dt, foe) {
  var u = g.userData;
  if (!u.legL) return;
  if (mode === 'walk') {
    var s = Math.sin(ph),
      c = Math.cos(ph);
    u.legL.p.rotation.x = s * 0.5;
    u.legR.p.rotation.x = -s * 0.5;
    u.legL.j.rotation.x = Math.max(0, -c) * 0.7;
    u.legR.j.rotation.x = Math.max(0, c) * 0.7;
    u.root.position.y = Math.abs(c) * 0.03;
    if (!foe) {
      u.armL.p.rotation.x = -s * 0.4;
      u.armR.p.rotation.x = s * 0.4;
      u.armL.j.rotation.x = -0.25;
      u.armR.j.rotation.x = -0.25;
    }
    if (u.robe) u.robe.rotation.z = s * 0.03;
    u.torso.rotation.y = s * 0.06;
  } else {
    var k = Math.min(1, dt * 6);
    u.legL.p.rotation.x *= 1 - k;
    u.legR.p.rotation.x *= 1 - k;
    u.legL.j.rotation.x *= 1 - k;
    u.legR.j.rotation.x *= 1 - k;
    u.root.position.y = Math.sin(ph * 0.35) * 0.006;
    if (!foe) {
      u.armL.p.rotation.x *= 1 - k;
      u.armR.p.rotation.x *= 1 - k;
    }
    u.torso.rotation.y *= 1 - k;
    if (u.robe) u.robe.rotation.z *= 1 - k;
  }
}

/* ---------- weapons: detailed procedural rifle models (first-person and armory preview) ---------- */
var vmScene = new THREE.Scene(),
  vmCam = new THREE.PerspectiveCamera(48, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xdfe8ff, 0x5a4a38, 1.2));
var vmKey = new THREE.DirectionalLight(0xfff0d8, 2.2);
vmKey.position.set(0.7, 1, 0.6);
vmScene.add(vmKey);
var vmRim = new THREE.DirectionalLight(0x9fb8ff, 0.9);
vmRim.position.set(-0.8, 0.4, -0.6);
vmScene.add(vmRim);
var vm = new THREE.Group();
vmScene.add(vm);

function profileGeo(pts, depth, bevel) {
  var s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.lineTo(pts[0][0], pts[0][1]);
  var g = new THREE.ExtrudeGeometry(s, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // profile drawn in (z, y), extruded across x
  return g;
}
function rrBox(w, h, l, r) {
  // rounded receiver block along -z
  var s = new THREE.Shape(),
    x = w / 2 - r,
    y = h / 2 - r;
  s.moveTo(-x, -h / 2);
  s.lineTo(x, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
  s.lineTo(w / 2, y);
  s.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  s.lineTo(-x, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  s.lineTo(-w / 2, -y);
  s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  var g = new THREE.ExtrudeGeometry(s, {
    depth: l,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
    curveSegments: 3
  });
  g.translate(0, 0, -l / 2);
  return g;
}
function tubeZ(r1, r2, len, seg) {
  var g = new THREE.CylinderGeometry(r1, r2, len, seg || 20, 1);
  g.rotateX(Math.PI / 2);
  return g;
}
var STOCKS = {
  classic: [
    [0.08, 0.0],
    [0.42, -0.035],
    [0.44, -0.16],
    [0.4, -0.175],
    [0.2, -0.1],
    [0.12, -0.075],
    [0.08, -0.06]
  ],
  svd: [
    [0.08, 0.0],
    [0.42, -0.03],
    [0.44, -0.17],
    [0.38, -0.175],
    [0.3, -0.07],
    [0.22, -0.07],
    [0.16, -0.12],
    [0.11, -0.12],
    [0.08, -0.05]
  ],
  ar: [
    [0.1, 0.01],
    [0.38, 0.0],
    [0.4, -0.13],
    [0.36, -0.14],
    [0.22, -0.05],
    [0.1, -0.03]
  ],
  thumb: [
    [0.08, 0.0],
    [0.42, 0.0],
    [0.44, -0.15],
    [0.38, -0.16],
    [0.34, -0.06],
    [0.27, -0.06],
    [0.2, -0.12],
    [0.13, -0.12],
    [0.08, -0.05]
  ],
  tube: [
    [0.1, 0.01],
    [0.36, 0.0],
    [0.38, -0.12],
    [0.34, -0.13],
    [0.2, -0.04],
    [0.1, -0.03]
  ],
  chassis: [
    [0.09, 0.01],
    [0.4, 0.01],
    [0.42, -0.14],
    [0.37, -0.15],
    [0.33, -0.05],
    [0.25, -0.05],
    [0.25, -0.02],
    [0.09, -0.02]
  ]
};
var GUNCACHE = {};
function gunMats(w) {
  var gn = w.gun;
  return {
    metal: new THREE.MeshStandardMaterial({
      color: 0x1b1d20,
      metalness: 0.8,
      roughness: 0.42,
      map: TX.brushed,
      envMapIntensity: 0.6
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x0f1012,
      metalness: 0.6,
      roughness: 0.5,
      envMapIntensity: 0.5
    }),
    body: new THREE.MeshStandardMaterial({
      color: new THREE.Color(gn.pol[0]),
      metalness: 0.05,
      roughness: 0.78,
      envMapIntensity: 0.35,
      normalMap: TX.plasterN,
      normalScale: new THREE.Vector2(0.35, 0.35)
    }),
    body2: new THREE.MeshStandardMaterial({
      color: new THREE.Color(gn.pol[1]),
      metalness: 0.05,
      roughness: 0.8,
      envMapIntensity: 0.35
    }),
    wood: new THREE.MeshStandardMaterial({
      map: TX.wood,
      color: new THREE.Color(gn.pol[0]).lerp(new THREE.Color(0xffffff), 0.35),
      roughness: 0.55
    }),
    lens: new THREE.MeshStandardMaterial({
      color: 0x0b1626,
      metalness: 0.9,
      roughness: 0.06,
      emissive: 0x0a2740,
      emissiveIntensity: 0.6
    }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.9 })
  };
}
// returns a group whose -z is the muzzle direction; ref points: grip (origin), fore (left hand), ocular, muzzle
function buildGun(w) {
  var gn = w.gun,
    M = gunMats(w),
    g = new THREE.Group(),
    add = function (geo, mat, x, y, z) {
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      g.add(m);
      return m;
    };
  var wood = gn.stock === 'svd' || gn.hgs === 'wood';
  var bl = 0.36 + (gn.bl / 100) * 0.42,
    th = 0.008 + (gn.th / 1000) * 1.1,
    hgl = 0.14 + (gn.hg / 100) * 0.32;
  add(rrBox(0.052, 0.07, 0.28, 0.012), M.metal, 0, 0.02, -0.06);
  add(profileGeo(STOCKS[gn.stock] || STOCKS.classic, 0.042, 0.006), wood ? M.wood : M.body, 0, 0.02, 0);
  if (gn.stock !== 'classic' && gn.stock !== 'svd') {
    var gr = add(
      profileGeo(
        [
          [0, 0],
          [0.05, 0],
          [0.075, -0.11],
          [0.03, -0.12]
        ],
        0.034,
        0.006
      ),
      M.body2,
      0,
      -0.01,
      0.02
    );
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.02), M.rubber).geometry, M.rubber, 0, -0.05, 0.43);
  // handguard
  if (gn.hgs === 'rail') {
    add(rrBox(0.05, 0.05, hgl, 0.01), M.body, 0, 0.018, -0.2 - hgl / 2);
    for (var i = 0; i < 6; i++)
      add(new THREE.BoxGeometry(0.054, 0.006, 0.012), M.dark, 0, 0.046, -0.21 - (i * hgl) / 6);
  } else if (gn.hgs === 'wood') add(rrBox(0.05, 0.055, hgl, 0.014), M.wood, 0, 0.012, -0.2 - hgl / 2);
  else add(tubeZ(0.026, 0.028, hgl, 18), M.body, 0, 0.015, -0.2 - hgl / 2);
  if (gn.stock === 'classic' || gn.stock === 'svd')
    add(
      profileGeo(
        [
          [-0.2, 0.0],
          [-0.2 - hgl, 0.0],
          [-0.2 - hgl, -0.035],
          [-0.2, -0.05]
        ],
        0.044,
        0.005
      ),
      wood ? M.wood : M.body,
      0,
      0.0,
      0
    );
  // barrel and muzzle device
  var bz = -0.2 - bl / 2;
  add(tubeZ(th, th * 1.25, bl, 16), M.metal, 0, 0.02, bz);
  var mz = -0.2 - bl;
  if (gn.muzzle === 'supp') add(tubeZ(0.026, 0.026, 0.19, 20), M.dark, 0, 0.02, mz - 0.07);
  else if (gn.muzzle === 'brake') {
    add(new THREE.BoxGeometry(0.045, 0.034, 0.1), M.dark, 0, 0.02, mz - 0.03);
    for (var s = 0; s < 3; s++)
      add(new THREE.BoxGeometry(0.05, 0.008, 0.012), M.metal, 0, 0.02, mz - 0.005 - s * 0.028);
  } else if (gn.muzzle === 'flash') add(tubeZ(0.018, 0.013, 0.07, 10), M.dark, 0, 0.02, mz - 0.03);
  else add(tubeZ(th * 1.1, th * 1.1, 0.02, 12), M.dark, 0, 0.02, mz);
  // trigger guard and trigger
  var tgd = add(new THREE.TorusGeometry(0.026, 0.0045, 6, 16, Math.PI), M.dark, 0, -0.016, 0.005);
  tgd.rotation.set(0, Math.PI / 2, Math.PI);
  var trg = add(new THREE.BoxGeometry(0.006, 0.026, 0.006), M.metal, 0, -0.026, 0.012);
  trg.rotation.x = 0.35;
  // magazine
  if (gn.mag === 'box') add(rrBox(0.036, 0.11, 0.08, 0.006), M.dark, 0, -0.06, -0.08);
  else if (gn.mag === 'curve') {
    var mg = add(rrBox(0.034, 0.13, 0.075, 0.006), M.dark, 0, -0.07, -0.09);
    mg.rotation.x = 0.28;
  }
  // bolt handle
  if (gn.act === 'bolt') {
    var bh = add(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 8), M.metal, 0.05, 0.03, 0.02);
    bh.rotation.z = Math.PI / 2 - 0.3;
    add(new THREE.SphereGeometry(0.013, 12, 10), M.dark, 0.084, 0.02, 0.02);
    g.userData.bolt = bh;
  }
  // folded bipod
  if (gn.bipod)
    [-1, 1].forEach(function (sd) {
      var lg = add(
        new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6),
        M.dark,
        sd * 0.02,
        -0.02,
        -0.3 - hgl * 0.6
      );
      lg.rotation.x = Math.PI / 2;
    });
  // scope: lathe profile from ocular (+z) to objective (-z), turrets, rings, lenses
  var sc = gn.scope / 80,
    sy = 0.098;
  var prof = [
    [0, 0.17],
    [0.024, 0.17],
    [0.026, 0.13],
    [0.019, 0.1],
    [0.0165, 0.06],
    [0.0165, -0.12],
    [0.03 * sc, -0.2],
    [0.032 * sc, -0.26],
    [0, -0.26]
  ].map(function (p) {
    return new THREE.Vector2(p[0], p[1]);
  });
  var lg2 = new THREE.LatheGeometry(prof, 28);
  lg2.rotateX(Math.PI / 2);
  add(lg2, M.dark, 0, sy, 0);
  add(tubeZ(0.022, 0.022, 0.004, 24), M.lens, 0, sy, 0.172).rotation.set(0, 0, 0);
  add(new THREE.CircleGeometry(0.028 * sc, 24), M.lens, 0, sy, -0.262).rotation.y = Math.PI;
  add(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 16), M.dark, 0, sy + 0.028, -0.02);
  var wt = add(new THREE.CylinderGeometry(0.012, 0.012, 0.028, 16), M.dark, 0.026, sy, -0.02);
  wt.rotation.z = Math.PI / 2;
  [-0.08, 0.06].forEach(function (z) {
    add(new THREE.TorusGeometry(0.0195, 0.0055, 8, 24), M.metal, 0, sy, z);
    add(rrBox(0.022, 0.028, 0.016, 0.004), M.metal, 0, 0.068, z);
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8), M.dark, 0.012, 0.075, z).rotation.z = Math.PI / 2;
  });
  add(tubeZ(0.03 * sc + 0.002, 0.03 * sc + 0.002, 0.012, 24), M.metal, 0, sy, -0.255);
  add(tubeZ(0.027, 0.027, 0.01, 24), M.metal, 0, sy, 0.16);
  var pg = gn.stock !== 'classic' && gn.stock !== 'svd';
  g.userData.refs = {
    grip: pg
      ? { x: 0, y: -0.06, z: 0.055, tilt: -0.35, r: 0.022 }
      : { x: 0, y: -0.025, z: 0.14, tilt: -0.75, r: 0.026 },
    fore: new THREE.Vector3(0, -0.01, -0.3),
    ocular: new THREE.Vector3(0, sy, 0.17),
    muzzle: new THREE.Vector3(0, 0.02, mz - (gn.muzzle === 'supp' ? 0.17 : 0.06)),
    sy: sy
  };
  g.traverse(function (o) {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return g;
}
// first-person rig: rifle + hands wrapped on grip and handguard + sleeves by outfit
var VM = {
    hipR: { x: 0.0, y: 0.25, z: -0.05 },
    gun: null,
    refs: null,
    kick: 0,
    boltT: 0,
    swayX: 0,
    swayY: 0,
    ads: 0,
    flash: null
  },
  CLOTHN = null;
function clothNormal() {
  if (CLOTHN) return CLOTHN;
  var N = 128,
    h = fbm(N, 4, 4, 91, 0.55),
    f = new Float32Array(N * N);
  for (var y = 0; y < N; y++)
    for (var x = 0; x < N; x++)
      f[y * N + x] = h[y * N + x] * 0.7 + 0.3 * Math.sin((x / N) * Math.PI * 2 * 9 + h[y * N + x] * 6) * 0.5;
  CLOTHN = texOf(normalCanvas(f, N, 2.2), false, 1, 2);
  return CLOTHN;
}
function segMesh(geo, mat, a, b) {
  // place a Y-aligned geometry between points a and b
  var d = new THREE.Vector3().subVectors(b, a),
    m = new THREE.Mesh(geo, mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
// a hand: palm + 4 curled fingers (torus arcs around an axis) + thumb
function makeHand(mat, R, arcFrom, arcLen, palmS, palmP) {
  var h = new THREE.Group();
  var palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
  palm.scale.set(palmS[0], palmS[1], palmS[2]);
  palm.position.set(palmP[0], palmP[1], palmP[2]);
  h.add(palm);
  for (var i = 0; i < 4; i++) {
    var tg = new THREE.TorusGeometry(R + 0.004 - i * 0.0008, 0.0092 - i * 0.0006, 8, 14, arcLen - i * 0.08);
    var f = new THREE.Mesh(tg, mat);
    f.rotation.z = arcFrom;
    f.position.z = -0.026 + i * 0.0175;
    h.add(f);
    var tip = new THREE.Mesh(new THREE.SphereGeometry(0.0092 - i * 0.0006, 8, 6), mat),
      ang = arcFrom + arcLen - i * 0.08;
    tip.position.set(
      Math.cos(ang) * (R + 0.004 - i * 0.0008),
      Math.sin(ang) * (R + 0.004 - i * 0.0008),
      f.position.z
    );
    h.add(tip);
    var kn = tip.clone();
    kn.scale.setScalar(1.15);
    kn.position.set(Math.cos(arcFrom) * (R + 0.004), Math.sin(arcFrom) * (R + 0.004), f.position.z);
    h.add(kn);
  }
  return h;
}
function sleeveMat(vc) {
  var col = new THREE.Color(vc.sleeve),
    field = vc.k === 'field';
  return new THREE.MeshPhysicalMaterial({
    color: col,
    roughness: field ? 0.85 : 0.75,
    sheen: 1,
    sheenRoughness: 0.6,
    sheenColor: col.clone().lerp(new THREE.Color(0xffffff), 0.4),
    normalMap: clothNormal(),
    normalScale: new THREE.Vector2(field ? 0.9 : 0.55, field ? 0.9 : 0.55)
  });
}
function buildArm(vc, skin, glove, sl, hand, wrist, elbow, side) {
  var g = new THREE.Group(),
    field = vc.k === 'field',
    fem = vc.g === 'f';
  var fw = fem ? 0.86 : 1;
  // forearm: skin when rolled, else the sleeve (wide thobe sleeve, fitted field sleeve)
  var wR = (vc.rolled ? 0.027 : field ? 0.036 : 0.042) * fw,
    eR = (vc.rolled ? 0.036 : field ? 0.046 : 0.054) * fw;
  var fa = segMesh(
    new THREE.CylinderGeometry(eR, wR, wrist.distanceTo(elbow), 18, 3),
    vc.rolled ? skin : sl,
    wrist,
    elbow
  );
  g.add(fa);
  g.add(
    segMesh(
      new THREE.SphereGeometry(eR, 14, 10),
      vc.rolled ? sl : sl,
      elbow,
      elbow.clone().add(new THREE.Vector3(0, 0.001, 0))
    )
  );
  if (vc.rolled) {
    // bunched rolled cloth just below the elbow
    var rl = segMesh(
      new THREE.CylinderGeometry(eR * 1.32, eR * 1.25, 0.07, 18),
      sl,
      elbow.clone().lerp(wrist, 0.05),
      elbow.clone().lerp(wrist, 0.28)
    );
    g.add(rl);
  } else {
    // cuff band at the wrist
    var cuffMat =
      vc.k === 'bisht'
        ? new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.35 })
        : sl;
    var c0 = wrist.clone().lerp(elbow, 0.0),
      c1 = wrist.clone().lerp(elbow, vc.k === 'bisht' ? 0.12 : 0.08);
    g.add(segMesh(new THREE.CylinderGeometry(wR * 1.08, wR * 1.1, c0.distanceTo(c1), 18), cuffMat, c0, c1));
    if (vc.k === 'thobe' || vc.k === 'winter') {
      // cufflink
      var cl = new THREE.Mesh(
        new THREE.SphereGeometry(0.006, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8c08a, metalness: 0.9, roughness: 0.25 })
      );
      cl.position.copy(c0.clone().lerp(c1, 0.5)).add(new THREE.Vector3(side * wR * 1.05, 0.004, 0));
      g.add(cl);
    }
  }
  // wrist and back of hand bridge
  var hm = field ? glove : skin;
  g.add(
    segMesh(new THREE.CylinderGeometry(wR * 0.92, 0.024 * fw, wrist.distanceTo(hand), 14), hm, hand, wrist)
  );
  return g;
}
function buildVM(w) {
  vmScene.remove(vm);
  vm = new THREE.Group();
  vmScene.add(vm);
  var gun = buildGun(w);
  vm.add(gun);
  VM.gun = gun;
  VM.refs = gun.userData.refs;
  var vc = vmColors(),
    fem = vc.g === 'f';
  var skin = new THREE.MeshPhysicalMaterial({
    color: vc.skin,
    roughness: 0.55,
    sheen: 0.4,
    sheenColor: 0xffd6c0,
    clearcoat: 0.08
  });
  var glove = new THREE.MeshStandardMaterial({
    color: 0x3b362e,
    roughness: 0.8,
    normalMap: clothNormal(),
    normalScale: new THREE.Vector2(0.5, 0.5)
  });
  var handMat = vc.k === 'field' ? glove : skin,
    sl = sleeveMat(vc),
    s = fem ? 0.9 : 1;
  // right hand: fingers wrap the pistol grip (axis ~ vertical, tilted with the grip)
  var GP = VM.refs.grip;
  var rh = makeHand(
    handMat,
    GP.r,
    -Math.PI * 1.15,
    Math.PI * 1.12,
    [0.014 * s, 0.03 * s, 0.042 * s],
    [GP.r + 0.012, 0.006, 0.0]
  );
  rh.rotation.set(Math.PI / 2 + GP.tilt, 0, 0);
  rh.position.set(GP.x, GP.y, GP.z);
  rh.scale.setScalar(s);
  vm.add(rh);
  var th = segMesh(
    new THREE.CapsuleGeometry(0.0095 * s, 0.03, 4, 8),
    handMat,
    new THREE.Vector3(0.02, GP.y + 0.035, GP.z + 0.035),
    new THREE.Vector3(-0.022, GP.y + 0.045, GP.z + 0.0)
  );
  vm.add(th);
  vm.add(
    buildArm(
      vc,
      skin,
      glove,
      sl,
      new THREE.Vector3(GP.x + 0.035, GP.y - 0.005, GP.z + 0.03),
      new THREE.Vector3(GP.x + 0.06, GP.y - 0.03, GP.z + 0.08),
      new THREE.Vector3(0.19, GP.y - 0.17, GP.z + 0.36),
      1
    )
  );
  // left hand: cradles the handguard from below, fingers curling up its left side
  var fz = VM.refs.fore.z;
  var lh = makeHand(
    handMat,
    0.031,
    -Math.PI * 0.62,
    Math.PI * 0.7,
    [0.03 * s, 0.018 * s, 0.05 * s],
    [-0.006, -0.042, 0.005]
  );
  lh.position.set(0, 0.014, fz);
  lh.scale.setScalar(s);
  vm.add(lh);
  var th2 = segMesh(
    new THREE.CapsuleGeometry(0.0095 * s, 0.035, 4, 8),
    handMat,
    new THREE.Vector3(-0.028, -0.035, fz + 0.03),
    new THREE.Vector3(-0.036, -0.008, fz - 0.018)
  );
  vm.add(th2);
  vm.add(
    buildArm(
      vc,
      skin,
      glove,
      sl,
      new THREE.Vector3(-0.005, -0.04, fz + 0.035),
      new THREE.Vector3(-0.03, -0.07, fz + 0.08),
      new THREE.Vector3(-0.2, -0.22, fz + 0.36),
      -1
    )
  );
  var fl = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: TX.flash,
      color: 0xffd9a0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    })
  );
  fl.position.copy(VM.refs.muzzle).add(new THREE.Vector3(0, 0, -0.06));
  fl.scale.setScalar(0.22);
  fl.visible = false;
  gun.add(fl);
  VM.flash = fl;
  vm.traverse(function (o) {
    if (o.isMesh) o.frustumCulled = false;
  });
  vm.position.copy(HIP_POSE);
}
// hip pose -> aim-down-sights pose; scope ocular is brought to the eye
var HIP_POSE = new THREE.Vector3(0.22, -0.2, -0.5),
  ADS_POSE = new THREE.Vector3(0, -0.098, -0.2);
function poseVM(dt, moving, scoped, lookDX, lookDY) {
  VM.ads += ((scoped ? 1 : 0) - VM.ads) * Math.min(1, dt * 9);
  VM.swayX += (lookDX * 0.6 - VM.swayX) * Math.min(1, dt * 8);
  VM.swayY += (lookDY * 0.6 - VM.swayY) * Math.min(1, dt * 8);
  VM.kick = Math.max(0, VM.kick - dt * 5);
  var t = performance.now() / 1000,
    bob = (1 - VM.ads) * 0.004;
  vm.position.lerpVectors(HIP_POSE, ADS_POSE, VM.ads);
  vm.position.x += Math.sin(t * 1.4) * bob - VM.swayX * 0.02;
  vm.position.y += Math.cos(t * 1.9) * bob - VM.swayY * 0.02 + VM.kick * 0.012;
  vm.position.z += VM.kick * 0.06;
  vm.rotation.set(
    VM.kick * 0.12 + VM.swayY * 0.05 + (1 - VM.ads) * VM.hipR.x,
    (1 - VM.ads) * VM.hipR.y + VM.swayX * 0.06,
    (1 - VM.ads) * VM.hipR.z
  );
  if (VM.boltT > 0 && VM.gun.userData.bolt) {
    VM.boltT = Math.max(0, VM.boltT - dt);
    var p = 1 - Math.abs((VM.boltT / 0.6) * 2 - 1);
    VM.gun.userData.bolt.rotation.x = -p * 1.1;
    VM.gun.userData.bolt.position.z = 0.02 + p * 0.06;
  }
  if (VM.flash) VM.flash.visible = VM.kick > 0.82;
}

/* ---------- armory preview: the same model on a turntable ---------- */
var G3 = { r: null, scene: null, cam: null, gun: null, id: '', rot: 0.6, drag: null, on: false };
function gun3dShow(w) {
  var cvs = el('gun3dCv');
  if (!G3.r) {
    try {
      G3.r = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, alpha: true });
    } catch (e) {
      return;
    }
    G3.r.toneMapping = THREE.ACESFilmicToneMapping;
    G3.r.toneMappingExposure = 1.1;
    G3.scene = new THREE.Scene();
    G3.cam = new THREE.PerspectiveCamera(28, 16 / 7, 0.05, 20);
    G3.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4a38, 2.6));
    var k = new THREE.DirectionalLight(0xffffff, 4);
    k.position.set(1.5, 2, 2);
    G3.scene.add(k);
    var rim = new THREE.DirectionalLight(0xeab14d, 1.4);
    rim.position.set(-2, 1, -2);
    G3.scene.add(rim);
    cvs.addEventListener('pointerdown', function (e) {
      G3.drag = e.clientX;
      try {
        cvs.setPointerCapture(e.pointerId);
      } catch (x) {}
    });
    cvs.addEventListener('pointermove', function (e) {
      if (G3.drag != null) {
        G3.rot += (e.clientX - G3.drag) * 0.012;
        G3.drag = e.clientX;
      }
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      cvs.addEventListener(ev, function () {
        G3.drag = null;
      });
    });
  }
  if (G3.id !== w.id) {
    if (G3.gun) G3.scene.remove(G3.gun);
    G3.gun = buildGun(w);
    G3.id = w.id;
    var box = new THREE.Box3().setFromObject(G3.gun),
      c = box.getCenter(new THREE.Vector3()),
      sz = box.getSize(new THREE.Vector3());
    G3.gun.position.sub(c);
    var holder = new THREE.Group();
    holder.add(G3.gun);
    G3.scene.add(holder);
    G3.gun = holder;
    G3.cam.position.set(0, 0.1, Math.max(sz.z, sz.x, 0.6) * 1.25);
    G3.cam.lookAt(0, 0, 0);
  }
  G3.on = true;
}
function gun3dFrame(dt) {
  if (!G3.on || !G3.r) return;
  var cvs = el('gun3dCv'),
    w = cvs.clientWidth,
    h = cvs.clientHeight;
  if (!w || !h) return;
  if (cvs.width !== Math.floor(w * Math.min(2, devicePixelRatio))) {
    G3.r.setPixelRatio(Math.min(2, devicePixelRatio));
    G3.r.setSize(w, h, false);
    G3.cam.aspect = w / h;
    G3.cam.updateProjectionMatrix();
  }
  if (G3.drag == null) G3.rot += dt * 0.35;
  G3.gun.rotation.y = G3.rot + Math.PI / 2;
  G3.gun.rotation.x = 0.08;
  G3.r.render(G3.scene, G3.cam);
}

/* ---------- effects: impact dust, sparks, hit mist, tracers, decals ---------- */
var FX = { parts: [], tracers: [], decals: [] };
var FXM = {
  dust: new THREE.SpriteMaterial({ map: TX.puff, color: 0xcdb894, transparent: true, depthWrite: false }),
  smoke: new THREE.SpriteMaterial({ map: TX.puff, color: 0xd8d4cc, transparent: true, depthWrite: false }),
  spark: new THREE.SpriteMaterial({
    map: TX.spark,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  }),
  hit: new THREE.SpriteMaterial({ map: TX.puff, color: 0x9a2a22, transparent: true, depthWrite: false }),
  tracer: new THREE.MeshBasicMaterial({
    color: 0xffd890,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }),
  decal: new THREE.MeshBasicMaterial({
    color: 0x1a140f,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  })
};
var TRACER_GEO = new THREE.CylinderGeometry(0.035, 0.035, 9, 6, 1, true);
TRACER_GEO.rotateX(Math.PI / 2);
var DECAL_GEO = new THREE.CircleGeometry(0.09, 10);
var fxGroup = new THREE.Group();
scene.add(fxGroup);
function spawn(mat, pos, vel, life, s0, s1, op) {
  if (FX.parts.length > 160) {
    var o = FX.parts.shift();
    fxGroup.remove(o.sp);
    o.sp.material.dispose();
  }
  var m = mat.clone();
  m.opacity = op == null ? 1 : op;
  var sp = new THREE.Sprite(m);
  sp.position.copy(pos);
  sp.scale.setScalar(s0);
  fxGroup.add(sp);
  FX.parts.push({
    sp: sp,
    v: vel,
    life: life,
    t: 0,
    s0: s0,
    s1: s1,
    op: m.opacity,
    g: mat === FXM.spark ? -9 : mat === FXM.dust ? -0.6 : 0.4
  });
}
function impactFX(p, n, kind, dist) {
  var k = Math.max(1, dist / 120),
    i,
    v = new THREE.Vector3();
  if (kind === 'flesh') {
    for (i = 0; i < 5; i++)
      spawn(
        FXM.hit,
        p,
        v.set((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2).clone(),
        0.5,
        0.15 * k,
        0.6 * k,
        0.75
      );
    return;
  }
  for (i = 0; i < 9; i++)
    spawn(
      FXM.dust,
      p,
      v
        .set(
          n.x * 2 + (Math.random() - 0.5) * 3,
          n.y * 2 + Math.random() * 3,
          n.z * 2 + (Math.random() - 0.5) * 3
        )
        .clone(),
      1.1 + Math.random() * 0.6,
      0.2 * k,
      1.6 * k,
      0.8
    );
  if (kind === 'hard')
    for (i = 0; i < 7; i++)
      spawn(
        FXM.spark,
        p,
        v
          .set(
            n.x * 6 + (Math.random() - 0.5) * 8,
            n.y * 6 + Math.random() * 6,
            n.z * 6 + (Math.random() - 0.5) * 8
          )
          .clone(),
        0.25,
        0.08 * k,
        0.02 * k,
        1
      );
  if (kind !== 'ground' && FX.decals.length < 40) {
    var d = new THREE.Mesh(DECAL_GEO, FXM.decal);
    d.position.copy(p).addScaledVector(n, 0.02);
    d.lookAt(p.clone().add(n));
    fxGroup.add(d);
    FX.decals.push(d);
  }
}
function tracerFX(b) {
  var m = new THREE.Mesh(TRACER_GEO, FXM.tracer);
  fxGroup.add(m);
  b.tr = m;
}
function updateFX(dt) {
  for (var i = FX.parts.length - 1; i >= 0; i--) {
    var q = FX.parts[i];
    q.t += dt;
    if (q.t >= q.life) {
      fxGroup.remove(q.sp);
      q.sp.material.dispose();
      FX.parts.splice(i, 1);
      continue;
    }
    var f = q.t / q.life;
    q.v.y += q.g * dt;
    q.v.multiplyScalar(1 - dt * 1.5);
    q.sp.position.addScaledVector(q.v, dt);
    q.sp.scale.setScalar(q.s0 + (q.s1 - q.s0) * f);
    q.sp.material.opacity = q.op * (1 - f) * (1 - f);
  }
}
function clearFX() {
  FX.parts.forEach(function (q) {
    fxGroup.remove(q.sp);
    q.sp.material.dispose();
  });
  FX.parts = [];
  FX.decals.forEach(function (d) {
    fxGroup.remove(d);
  });
  FX.decals = [];
}

/* ---------- sound: synthesised gunshot, mountain echo, bolt, impacts, wind ---------- */
var AU = { ctx: null, master: null, wind: null, echo: null };
function audio() {
  if (!save.sfx) return null;
  if (!AU.ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      AU.ctx = new AC();
    } catch (e) {
      return null;
    }
    AU.master = AU.ctx.createGain();
    AU.master.gain.value = 0.8;
    AU.master.connect(AU.ctx.destination);
    var d = AU.ctx.createDelay(2),
      fb = AU.ctx.createGain(),
      lp = AU.ctx.createBiquadFilter();
    d.delayTime.value = 0.42;
    fb.gain.value = 0.32;
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    d.connect(lp);
    lp.connect(fb);
    fb.connect(d);
    lp.connect(AU.master);
    AU.echo = d;
  }
  if (AU.ctx.state === 'suspended') AU.ctx.resume();
  return AU.ctx;
}
function noiseBuf(c, sec) {
  var b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate),
    d = b.getChannelData(0);
  for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function sfxShot(heavy, supp) {
  var c = audio();
  if (!c) return;
  var t = c.currentTime;
  var n = c.createBufferSource();
  n.buffer = noiseBuf(c, 0.6);
  var f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(supp ? 1400 : 5200, t);
  f.frequency.exponentialRampToValueAtTime(220, t + 0.35);
  var g = c.createGain();
  g.gain.setValueAtTime(supp ? 0.35 : 1.0, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (supp ? 0.25 : 0.55));
  n.connect(f);
  f.connect(g);
  g.connect(AU.master);
  g.connect(AU.echo);
  n.start(t);
  n.stop(t + 0.6);
  var o = c.createOscillator(),
    og = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(heavy ? 90 : 130, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
  og.gain.setValueAtTime(supp ? 0.3 : 0.9, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(og);
  og.connect(AU.master);
  o.start(t);
  o.stop(t + 0.3);
}
function sfxClick(freq, dur, vol, delay) {
  var c = audio();
  if (!c) return;
  var t = c.currentTime + (delay || 0);
  var n = c.createBufferSource();
  n.buffer = noiseBuf(c, dur);
  var f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 4;
  var g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(f);
  f.connect(g);
  g.connect(AU.master);
  n.start(t);
  n.stop(t + dur);
}
function sfxBolt() {
  sfxClick(2400, 0.05, 0.5, 0.25);
  sfxClick(1600, 0.06, 0.45, 0.42);
  sfxClick(2800, 0.04, 0.5, 0.62);
}
function sfxImpact(dist, flesh) {
  sfxClick(flesh ? 500 : 900, 0.12, Math.max(0.05, 0.6 - dist / 600), Math.min(1.2, dist / 340));
}
function windOn(on) {
  var c = on ? audio() : AU.ctx;
  if (!c) return;
  if (on && !AU.wind) {
    var n = c.createBufferSource();
    n.buffer = noiseBuf(c, 4);
    n.loop = true;
    var f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420;
    f.Q.value = 0.6;
    var g = c.createGain();
    g.gain.value = 0.06;
    n.connect(f);
    f.connect(g);
    g.connect(AU.master);
    n.start();
    AU.wind = { n: n, g: g, f: f };
  } else if (!on && AU.wind) {
    try {
      AU.wind.n.stop();
    } catch (e) {}
    AU.wind = null;
  }
}

/* ---------- character art (SVG): Saudi men's and women's dress, three skin tones ---------- */
var CHAR = (function () {
  var SK = { w: ['#f0d2b6', '#d9b393'], h: ['#d2a173', '#b5845a'], s: ['#8a5636', '#6c4129'] };
  var uid = 0;
  function defs(o) {
    var id = 'p' + ++uid;
    o.id = id;
    return (
      '<defs>' +
      '<linearGradient id="' +
      id +
      'bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
      (o.bg || '#36495a') +
      '"/><stop offset="1" stop-color="#120e0b"/></linearGradient>' +
      '<linearGradient id="' +
      id +
      'sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>' +
      '<pattern id="' +
      id +
      'shm" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#f6f2ea"/><path d="M0 0h5v5H0zM5 5h5v5H5z" fill="' +
      (o.shmCol || '#b8302c') +
      '" opacity=".88"/><path d="M2.5 0v10M0 2.5h10" stroke="#fff" stroke-width=".7" opacity=".5"/></pattern>' +
      '<pattern id="' +
      id +
      'shw" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#e9e1d2"/><path d="M0 0h8v8H0zM8 8h8v8H8z" fill="#8f1f1c"/><path d="M4 0v16M0 4h16" stroke="#e9e1d2" stroke-width="1.2" opacity=".6"/></pattern>' +
      '<pattern id="' +
      id +
      'cam" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#c2a878"/><path d="M3 5q8-4 14 2t-4 9q-9 1-10-11zM24 20q10-3 13 6t-9 8q-8-3-4-14zM6 26q6-1 7 5t-6 5q-5-4-1-10z" fill="#9b8156"/><path d="M20 3q5 0 6 5t-5 4q-3-5-1-9zM30 4q4 1 3 5" fill="#e2cfa6"/></pattern>' +
      '<pattern id="' +
      id +
      'emb" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#111"/><path d="M7 1l5 6-5 6-5-6z" fill="none" stroke="#e0b030" stroke-width="1.4"/><circle cx="7" cy="7" r="1.6" fill="#c0392b"/><path d="M0 0l3 3M14 0l-3 3M0 14l3-3M14 14l-3-3" stroke="#2f8a4a" stroke-width="1.4"/></pattern>' +
      '<pattern id="' +
      id +
      'zari" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.5" fill="#f2cf63"/><path d="M0 0l8 8M8 0L0 8" stroke="#d9a93a" stroke-width=".7"/></pattern>' +
      '<radialGradient id="' +
      id +
      'lt" cx=".5" cy=".25" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '</defs>'
    );
  }
  function P(id, s) {
    return 'url(#' + id + s + ')';
  }
  function bg(o) {
    return (
      '<rect width="220" height="440" fill="' +
      P(o.id, 'bg') +
      '"/><rect width="220" height="440" fill="' +
      P(o.id, 'lt') +
      '"/><ellipse cx="110" cy="428" rx="70" ry="9" fill="#000" opacity=".45"/>'
    );
  }
  function sandals(o) {
    if (o.boots)
      return '<path d="M78 404h26l2 22H72q-2-12 6-22zM116 404h26q8 10 6 22h-34z" fill="#3a2c1e"/><path d="M72 422h34M114 422h34" stroke="#1d150e" stroke-width="4"/>';
    var s = SK[o.skin][0];
    return (
      '<path d="M80 418q10-6 22 0l2 8H76z" fill="' +
      s +
      '"/><path d="M118 418q10-6 22 0l4 8h-28z" fill="' +
      s +
      '"/><path d="M76 425h28M116 425h28" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/><path d="M86 418l6 6M128 418l6 6" stroke="#5a3a22" stroke-width="3"/>'
    );
  }
  function robe(o, col, extra) {
    return (
      '<path d="M70 120Q110 110 150 120L160 150L168 420Q110 428 52 420L60 150Z" fill="' +
      col +
      '"/>' +
      '<path d="M70 120Q110 110 150 120L160 150L168 420Q110 428 52 420L60 150Z" fill="' +
      P(o.id, 'sh') +
      '"/>' +
      '<path d="M86 200q-4 110 -10 216M134 200q4 110 10 216M110 190v230" stroke="#000" stroke-opacity=".07" stroke-width="2" fill="none"/>' +
      (extra || '')
    );
  }
  function arms(o, col, rolled, cuff) {
    var s = SK[o.skin];
    var out = '';
    [
      [1, 66],
      [-1, 154]
    ].forEach(function (a) {
      var dx = a[0],
        x = a[1];
      var sx = x - dx * 4,
        ex = x - dx * 14;
      if (rolled) {
        out +=
          '<path d="M' +
          (x + dx * 6) +
          ' 122 L' +
          (x - dx * 8) +
          ' 126 L' +
          (ex - dx * 6) +
          ' 196 L' +
          (ex + dx * 14) +
          ' 196 Z" fill="' +
          col +
          '"/>';
        out +=
          '<path d="M' +
          (ex - dx * 7) +
          ' 192h' +
          dx * 22 +
          'v12h' +
          -dx * 22 +
          'z" fill="' +
          col +
          '" stroke="#000" stroke-opacity=".15"/>';
        out +=
          '<path d="M' +
          (ex - dx * 4) +
          ' 204 L' +
          (ex - dx * 6) +
          ' 248 L' +
          (ex + dx * 8) +
          ' 248 L' +
          (ex + dx * 12) +
          ' 204 Z" fill="' +
          s[0] +
          '"/>';
        out +=
          '<path d="M' +
          (ex - dx * 2) +
          ' 210 L' +
          (ex - dx * 3) +
          ' 244" stroke="' +
          s[1] +
          '" stroke-width="3"/>';
      } else {
        out +=
          '<path d="M' +
          (x + dx * 6) +
          ' 122 L' +
          (x - dx * 8) +
          ' 126 L' +
          (ex - dx * 8) +
          ' 246 L' +
          (ex + dx * 12) +
          ' 246 Z" fill="' +
          col +
          '"/>';
        out +=
          '<path d="M' +
          (x + dx * 6) +
          ' 122 L' +
          (x - dx * 8) +
          ' 126 L' +
          (ex - dx * 8) +
          ' 246 L' +
          (ex + dx * 12) +
          ' 246 Z" fill="#000" opacity=".12"/>';
        out +=
          '<rect x="' +
          Math.min(ex - dx * 8, ex + dx * 12) +
          '" y="238" width="20" height="8" fill="' +
          (cuff || col) +
          '" stroke="#000" stroke-opacity=".12"/>';
      }
      out +=
        '<ellipse cx="' +
        (ex + dx * 2) +
        '" cy="257" rx="9" ry="12" fill="' +
        s[0] +
        '"/><path d="M' +
        (ex + dx * 2 - 6) +
        ' 262q6 6 12 0" stroke="' +
        s[1] +
        '" fill="none" stroke-width="1.5"/>';
    });
    return out;
  }
  function neckHead(o, fem) {
    var s = SK[o.skin];
    var h = '<rect x="101" y="100" width="18" height="22" fill="' + s[1] + '"/>';
    h +=
      '<ellipse cx="110" cy="80" rx="' +
      (fem ? 21 : 23) +
      '" ry="' +
      (fem ? 26 : 28) +
      '" fill="' +
      s[0] +
      '"/>';
    h +=
      '<ellipse cx="86" cy="84" rx="4" ry="7" fill="' +
      s[1] +
      '"/><ellipse cx="134" cy="84" rx="4" ry="7" fill="' +
      s[1] +
      '"/>';
    if (fem) {
      h += '<path d="M97 77q5-4 10 0M113 77q5-4 10 0" stroke="#2a1a12" stroke-width="2" fill="none"/>';
      h +=
        '<ellipse cx="102" cy="81" rx="3.2" ry="2.4" fill="#1b120c"/><ellipse cx="118" cy="81" rx="3.2" ry="2.4" fill="#1b120c"/>';
      h += '<path d="M97 79l-3-2M123 79l3-2" stroke="#1b120c" stroke-width="1.4"/>';
      h +=
        '<path d="M110 84v9" stroke="' +
        s[1] +
        '" stroke-width="2"/><path d="M104 97q6 4 12 0" stroke="#9a4a40" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
      h +=
        '<circle cx="97" cy="92" r="5" fill="#e07a6a" opacity=".18"/><circle cx="123" cy="92" r="5" fill="#e07a6a" opacity=".18"/>';
    } else {
      h += '<path d="M95 74q6-4 12 0M113 74q6-4 12 0" stroke="#1d130d" stroke-width="3" fill="none"/>';
      h +=
        '<ellipse cx="101" cy="80" rx="3" ry="2.2" fill="#1b120c"/><ellipse cx="119" cy="80" rx="3" ry="2.2" fill="#1b120c"/>';
      h += '<path d="M110 82v11" stroke="' + s[1] + '" stroke-width="2.4"/>';
      h += '<path d="M88 86q2 22 22 24q20-2 22-24q-3 8-8 10q-14 4-28 0q-5-2-8-10z" fill="#1f1610"/>';
      h +=
        '<path d="M100 97q10-5 20 0q-10 3-20 0z" fill="#1f1610"/><path d="M104 101q6 2 12 0" stroke="#7a3a30" stroke-width="2" fill="none"/>';
    }
    return h;
  }
  function collarPlacket(col) {
    var b = '<path d="M98 120q12 8 24 0" stroke="#000" stroke-opacity=".25" stroke-width="2.5" fill="none"/>';
    b +=
      '<rect x="106" y="122" width="8" height="70" fill="' + col + '" stroke="#000" stroke-opacity=".15"/>';
    for (var i = 0; i < 5; i++) b += '<circle cx="110" cy="' + (130 + i * 13) + '" r="1.9" fill="#bdb6a8"/>';
    b += '<path d="M126 150h18" stroke="#000" stroke-opacity=".2" stroke-width="2"/>';
    return b;
  }
  function headdress(o) {
    var t = o.head,
      id = o.id,
      out = '';
    if (t === 'shemagh' || t === 'ghutra' || t === 'wool') {
      var fill = t === 'ghutra' ? '#f7f5ef' : P(id, t === 'wool' ? 'shw' : 'shm');
      out +=
        '<path d="M133 52q10 24 13 66M136 52q11 26 14 68" stroke="#111" stroke-width="2.2" fill="none"/><path d="M144 118l-2 10h6zM149 120l-2 10h6z" fill="#111"/>';
      if (o.kashkha) {
        out += '<path d="M82 74Q110 30 138 74L142 92Q136 70 110 64Q84 70 78 92Z" fill="' + fill + '"/>';
        out +=
          '<path d="M78 62q32-34 64 0l-6 16q-26-22-52 0z" fill="' +
          fill +
          '" stroke="#000" stroke-opacity=".12"/>';
        out +=
          '<path d="M90 60l-10 -14l26 4M130 60l10 -14l-26 4" fill="' +
          fill +
          '" stroke="#000" stroke-opacity=".15"/>';
        out +=
          '<path d="M80 86 L72 150 L88 146 L90 100" fill="' +
          fill +
          '"/><path d="M140 86 L148 150 L132 146 L130 100" fill="' +
          fill +
          '"/>';
      } else {
        var sd = o.lithma
          ? 'M80 78Q84 46 106 38L110 31L114 38Q136 46 140 78L144 104L131 104Q135 66 110 58Q85 66 89 104L84 172L68 168Z'
          : 'M80 78Q84 46 106 38L110 31L114 38Q136 46 140 78L152 168L136 172L131 104Q135 66 110 58Q85 66 89 104L84 172L68 168Z';
        out += '<path d="' + sd + '" fill="' + fill + '"/>';
        out += '<path d="' + sd + '" fill="#000" opacity=".08"/>';
        out +=
          '<path d="M110 31L110 58M96 44q-4 14-6 34M124 44q4 14 6 34" stroke="#000" stroke-opacity=".14" stroke-width="1.5" fill="none"/>';
        out += '<path d="M84 104l-8 60M136 104l8 60" stroke="#000" stroke-opacity=".12" stroke-width="2"/>';
      }
      out += '<g transform="translate(0,-11) scale(1,0.92)" transform-origin="110 60">';
      out +=
        '<path d="M83 60Q110 46 137 60" stroke="#1c1c1c" stroke-width="4" fill="none"/><path d="M83 63Q110 49 137 63" stroke="#1c1c1c" stroke-width="4" fill="none"/>';
      out +=
        '<path d="M83 61Q110 74 137 61" stroke="#0b0b0b" stroke-width="4.6" fill="none"/><path d="M83 65Q110 78 137 65" stroke="#0b0b0b" stroke-width="4.6" fill="none"/>';
      out +=
        '<path d="M90 66Q110 74 130 66" stroke="#fff" stroke-opacity=".18" stroke-width="1.2" fill="none"/>';
      out += '</g>';
      if (o.lithma) {
        var ld =
          'M142 104Q144 124 126 130Q104 134 90 122Q84 108 86 90L82 62L90 60L94 84Q104 89 112 88Q126 87 134 86Q140 92 142 104Z';
        out += '<path d="' + ld + '" fill="' + fill + '"/>';
        out += '<path d="' + ld + '" fill="#000" opacity=".1"/>';
        out +=
          '<path d="M138 98Q116 104 94 92M140 110Q114 116 90 102M136 122Q110 124 90 112" stroke="#000" stroke-opacity=".22" stroke-width="1.6" fill="none"/>';
        out +=
          '<path d="M94 84Q112 90 134 86" stroke="#fff" stroke-opacity=".35" stroke-width="1.3" fill="none"/>';
      }
    } else if (t === 'flower') {
      out +=
        '<path d="M86 70q-10 30 -6 70l12-2q-4-30 2-60zM134 70q10 30 6 70l-12-2q4-30-2-60z" fill="#120c08"/>';
      out += '<path d="M86 66Q110 40 134 66L132 60Q110 46 88 60Z" fill="#160e09"/>';
      out +=
        '<path d="M82 62Q110 48 138 62" stroke="#3f7a32" stroke-width="11" fill="none" stroke-linecap="round"/>';
      var fc = ['#f4d23a', '#ffffff', '#e2463a', '#f4d23a', '#ffffff', '#e8833a', '#f4d23a', '#ffffff'];
      for (var i = 0; i < 8; i++) {
        var x = 86 + i * 7,
          y = 62 - Math.sin((i / 7) * Math.PI) * 9;
        out +=
          '<circle cx="' +
          x +
          '" cy="' +
          y +
          '" r="3.6" fill="' +
          fc[i] +
          '"/><circle cx="' +
          x +
          '" cy="' +
          y +
          '" r="1.2" fill="#8a5a10"/>';
      }
      out += '<path d="M80 62l-6 -4M140 62l6 -4" stroke="#5f9a42" stroke-width="3"/>';
    }
    return out;
  }
  function bisht(o, col) {
    return (
      '<path d="M64 118Q110 104 156 118L184 404Q170 414 148 410L130 150Q110 168 90 150L72 410Q50 414 36 404Z" fill="' +
      col +
      '" opacity=".97"/>' +
      '<path d="M64 118Q110 104 156 118L184 404Q170 414 148 410L130 150Q110 168 90 150L72 410Q50 414 36 404Z" fill="' +
      P(o.id, 'sh') +
      '"/>' +
      '<path d="M90 150L72 410M130 150L148 410" stroke="' +
      P(o.id, 'zari') +
      '" stroke-width="7"/>' +
      '<path d="M68 120Q110 108 152 120" stroke="' +
      P(o.id, 'zari') +
      '" stroke-width="9" fill="none"/>' +
      '<path d="M90 150Q110 168 130 150" stroke="#e9c35a" stroke-width="2" fill="none"/>'
    );
  }
  function jambiya() {
    return (
      '<rect x="58" y="246" width="104" height="12" fill="#6b4a2a"/><path d="M58 248h104" stroke="#d6b25a" stroke-width="2"/>' +
      '<path d="M104 244h12v18q8 12 -6 30q6 -14 -6 -22z" fill="#5a3a1c" stroke="#d6b25a" stroke-width="2"/><rect x="104" y="236" width="12" height="10" fill="#c9a24a"/>'
    );
  }
  function femHead(o, col, trim) {
    var out = '';
    out += '<path d="M84 74Q110 34 136 74L150 176Q110 190 70 176Z" fill="' + col + '"/>';
    out += '<path d="M84 74Q110 34 136 74L150 176Q110 190 70 176Z" fill="' + P(o.id, 'sh') + '"/>';
    out += '<path d="M89 76Q110 50 131 76Q136 104 110 112Q84 104 89 76Z" fill="#000" opacity=".25"/>';
    if (trim) out += '<path d="M86 72Q110 42 134 72" stroke="' + trim + '" stroke-width="4" fill="none"/>';
    return out;
  }
  function femFace(o, col, lithma) {
    var out = neckHead(o, true);
    out = out.replace('<rect x="101" y="100" width="18" height="22" fill="' + SK[o.skin][1] + '"/>', '');
    out = out.replace(/<ellipse cx="(86|134)" cy="84" rx="4" ry="7"[^>]*\/>/g, '');
    out +=
      '<path fill-rule="evenodd" d="M85 72Q87 46 110 44Q133 46 135 72L136 104Q131 120 110 123Q89 120 84 104Z M110 59Q93 60 92 80Q92 101 110 107Q128 101 128 80Q127 60 110 59Z" fill="' +
      col +
      '"/>';
    out +=
      '<path fill-rule="evenodd" d="M85 72Q87 46 110 44Q133 46 135 72L136 104Q131 120 110 123Q89 120 84 104Z M110 59Q93 60 92 80Q92 101 110 107Q128 101 128 80Q127 60 110 59Z" fill="#000" opacity=".12"/>';
    out +=
      '<path d="M92 76Q93 61 110 60Q127 61 128 76" stroke="#fff" stroke-opacity=".12" stroke-width="2" fill="none"/>';
    if (lithma)
      out +=
        '<path d="M86 86Q110 96 134 86L134 112Q110 122 86 112Z" fill="' +
        lithma +
        '"/><path d="M88 90q22 8 44 0" stroke="#000" stroke-opacity=".2" fill="none"/>';
    return out;
  }
  function dress(o, col, w) {
    w = w || 0;
    return (
      '<path d="M72 118Q110 108 148 118L' +
      (162 + w) +
      ' 160L' +
      (172 + w) +
      ' 420Q110 430 ' +
      (48 - w) +
      ' 420L' +
      (58 - w) +
      ' 160Z" fill="' +
      col +
      '"/>' +
      '<path d="M72 118Q110 108 148 118L' +
      (162 + w) +
      ' 160L' +
      (172 + w) +
      ' 420Q110 430 ' +
      (48 - w) +
      ' 420L' +
      (58 - w) +
      ' 160Z" fill="' +
      P(o.id, 'sh') +
      '"/>'
    );
  }
  function wideSleeves(o, col, under, edge) {
    var s = SK[o.skin],
      out = '';
    [
      [1, 66],
      [-1, 154]
    ].forEach(function (a) {
      var dx = a[0],
        x = a[1];
      out +=
        '<path d="M' +
        (x + dx * 6) +
        ' 120 L' +
        (x - dx * 10) +
        ' 124 L' +
        (x - dx * 44) +
        ' 236 L' +
        (x - dx * 2) +
        ' 244 Z" fill="' +
        col +
        '"/>';
      out +=
        '<path d="M' +
        (x + dx * 6) +
        ' 120 L' +
        (x - dx * 10) +
        ' 124 L' +
        (x - dx * 44) +
        ' 236 L' +
        (x - dx * 2) +
        ' 244 Z" fill="#000" opacity=".14"/>';
      if (edge)
        out +=
          '<path d="M' +
          (x - dx * 44) +
          ' 236 L' +
          (x - dx * 2) +
          ' 244" stroke="' +
          edge +
          '" stroke-width="5"/>';
      if (under)
        out +=
          '<path d="M' +
          (x - dx * 30) +
          ' 236 L' +
          (x - dx * 10) +
          ' 240 L' +
          (x - dx * 12) +
          ' 252 L' +
          (x - dx * 28) +
          ' 250Z" fill="' +
          under +
          '"/>';
      out += '<ellipse cx="' + (x - dx * 20) + '" cy="258" rx="8.5" ry="11" fill="' + s[0] + '"/>';
    });
    return out;
  }
  function card(svg, name, desc) {
    return (
      '<div class="card"><svg viewBox="0 0 220 440">' +
      svg +
      '</svg><b>' +
      name +
      '</b><small>' +
      desc +
      '</small></div>'
    );
  }

  function man(cfg) {
    var o = {
      skin: cfg.skin,
      head: cfg.head,
      kashkha: cfg.kashkha,
      lithma: cfg.lithma,
      bg: cfg.bg,
      boots: cfg.boots
    };
    var s = defs(o) + bg(o) + sandals(o);
    if (cfg.field) {
      s +=
        '<path d="M76 300h68l6 108H70z" fill="' +
        P(o.id, 'cam') +
        '"/><path d="M110 300v108" stroke="#000" stroke-opacity=".25" stroke-width="2"/>';
      s +=
        '<path d="M70 120Q110 110 150 120L160 150L158 304H62L60 150Z" fill="' +
        P(o.id, 'cam') +
        '"/><path d="M70 120Q110 110 150 120L160 150L158 304H62L60 150Z" fill="' +
        P(o.id, 'sh') +
        '"/>';
      s +=
        '<rect x="62" y="232" width="96" height="12" fill="#5a4a32"/><rect x="80" y="160" width="24" height="18" rx="2" fill="#a89064" stroke="#000" stroke-opacity=".2"/><rect x="116" y="160" width="24" height="18" rx="2" fill="#a89064" stroke="#000" stroke-opacity=".2"/>';
      s += '<path d="M150 124 L70 290" stroke="#2a2a26" stroke-width="5"/>';
      s += arms(o, P(o.id, 'cam'), false, '#9b8156');
    } else {
      s += robe(o, cfg.thobe);
      s += collarPlacket(cfg.thobe);
      if (cfg.jambiya) s += jambiya();
      s += arms(o, cfg.thobe, cfg.rolled);
      if (cfg.bisht) s += bisht(o, cfg.bisht);
    }
    s += neckHead(o, false) + headdress(o);
    return s;
  }
  function woman(cfg) {
    var o = { skin: cfg.skin, bg: cfg.bg };
    var s = defs(o) + bg(o) + sandals(o);
    s += femHead(o, cfg.shayla, cfg.trim);
    if (cfg.kind === 'nashal') {
      s += dress(o, '#1e5a3e');
      s +=
        '<path d="M60 118Q110 102 160 118L198 250L176 262L168 420Q110 430 52 420L44 262L22 250Z" fill="#8a1f2a" opacity=".55"/>';
      s +=
        '<path d="M94 122h32l-4 90h-24z" fill="' +
        P(o.id, 'zari') +
        '"/><path d="M94 122h32l-4 90h-24z" fill="none" stroke="#f2cf63" stroke-width="1.5"/>';
      s +=
        '<path d="M60 400Q110 412 160 400" stroke="' + P(o.id, 'zari') + '" stroke-width="8" fill="none"/>';
      s += wideSleeves(o, '#8a1f2a', '#1e5a3e', '#e9c35a');
    } else if (cfg.kind === 'asiri') {
      s += dress(o, '#121212');
      s += '<path d="M86 120h48l-6 120h-36z" fill="' + P(o.id, 'emb') + '"/>';
      s += '<path d="M56 330h108l4 50H52z" fill="' + P(o.id, 'emb') + '"/>';
      s +=
        '<path d="M66 160l-6 250M154 160l6 250" stroke="#e0b030" stroke-width="3" stroke-dasharray="6 4"/><path d="M72 160l-6 250M148 160l6 250" stroke="#c0392b" stroke-width="2"/>';
      s +=
        '<rect x="58" y="244" width="104" height="10" fill="#c0392b"/><path d="M58 249h104" stroke="#e0b030" stroke-width="2" stroke-dasharray="4 3"/>';
      s += arms(o, '#121212', false, '#2f8a4a');
    } else if (cfg.kind === 'najrani') {
      s += dress(o, '#f2efe8');
      s += dress(o, '#141414', -6);
      s +=
        '<path d="M90 124h40l-4 70h-32z" fill="none" stroke="#c9ccd2" stroke-width="2"/><path d="M96 134h28M98 148h24M100 162h20M102 176h16" stroke="#c9ccd2" stroke-width="2" stroke-dasharray="3 3"/>';
      s += '<rect x="64" y="240" width="92" height="14" fill="#2a2a2a"/>';
      for (var i = 0; i < 9; i++) s += '<circle cx="' + (70 + i * 10) + '" cy="247" r="3.2" fill="#d5d8de"/>';
      s += '<path d="M54 410Q110 420 166 410" stroke="#f2efe8" stroke-width="6" fill="none"/>';
      s += wideSleeves(o, '#141414', '#f2efe8');
    } else {
      s += dress(o, '#b49a70');
      s +=
        '<path d="M110 122v296" stroke="#000" stroke-opacity=".2" stroke-width="2"/><path d="M84 124l-2 290M136 124l2 290" stroke="#000" stroke-opacity=".08" stroke-width="3"/>';
      s += '<rect x="62" y="236" width="96" height="12" fill="#5a4a32"/>';
      s += '<path d="M152 122 L70 292" stroke="#2a2a26" stroke-width="5"/>';
      s += arms(o, '#a68c62', false, '#8a7350');
    }
    s += femFace(o, cfg.shayla, cfg.lithma);
    return s;
  }

  /* ---- refined men: thobe, shemagh/ghutra (classic "ملكية" drape), agal, bisht, lithma ---- */
  function mFace(o) {
    var s = SK[o.skin],
      h = '';
    h += '<path d="M101 96h18v24h-18z" fill="' + s[1] + '"/>';
    h += '<ellipse cx="110" cy="82" rx="20" ry="25" fill="' + s[0] + '"/>';
    h +=
      '<path d="M92 86q0 14 8 20M128 86q0 14-8 20" stroke="' +
      s[1] +
      '" stroke-width="3" fill="none" opacity=".6"/>';
    h +=
      '<path d="M95 76q6-4 12-1M113 75q6-3 12 1" stroke="#1b120c" stroke-width="2.8" fill="none" stroke-linecap="round"/>';
    h +=
      '<path d="M97 81q4-3 8 0q-4 2-8 0zM115 81q4-3 8 0q-4 2-8 0z" fill="#fff"/><circle cx="101" cy="81" r="1.9" fill="#1b120c"/><circle cx="119" cy="81" r="1.9" fill="#1b120c"/>';
    h += '<path d="M110 82q-1 8-4 11q4 2 8 0" stroke="' + s[1] + '" stroke-width="1.8" fill="none"/>';
    // trimmed Gulf beard: sideburns into jawline beard, moustache, connected goatee
    h +=
      '<path d="M90 80q-1 16 6 24q6 8 14 9q8-1 14-9q7-8 6-24q-2 10-6 15q-4 4-8 2q-6-2-12 0q-4 2-8-2q-4-5-6-15z" fill="#17100b" opacity=".92"/>';
    h += '<path d="M100 97q10-6 20 0q-4 2-10 1q-6 1-10-1z" fill="#17100b"/>';
    h += '<path d="M104 101q6 2 12 0" stroke="#7a3a30" stroke-width="2" fill="none" stroke-linecap="round"/>';
    return h;
  }
  function mHeadwear(o) {
    var id = o.id,
      t = o.head,
      out = '',
      asaba = t === 'asaba';
    if (asaba) t = 'shemagh';
    var fill = t === 'ghutra' ? '#f7f5f0' : P(id, t === 'wool' ? 'shw' : 'shm');
    var edge = t === 'ghutra' ? '#e9e5dc' : '#f1ebe0';
    var lith = !!o.lithma;
    // crown (starched, slightly squared) with the front edge resting on the forehead
    var crown = 'M83 86Q80 58 92 51Q110 44 128 51Q140 58 137 86L131 84Q132 70 110 68Q88 70 89 84Z';
    // drapes: framing the face, over the shoulders, down the chest (classic royal drape)
    var dl = 'M83 84L89 82Q89 98 94 112Q98 122 100 136L98 196L70 190L68 132Q76 118 80 104Z';
    var dr = 'M137 84L131 82Q131 98 126 112Q122 122 120 136L122 196L150 190L152 132Q144 118 140 104Z';
    if (asaba) {
      dl = dl.replace(/196/g, '158').replace(/190/g, '152');
      dr = dr.replace(/196/g, '158').replace(/190/g, '152');
    }
    if (lith) dr = 'M137 84L131 82Q131 96 128 104L150 132L152 140Q140 126 138 104Z';
    [dl, dr].forEach(function (d) {
      out += '<path d="' + d + '" fill="' + fill + '"/>';
      out += '<path d="' + d + '" fill="#000" opacity=".1"/>';
    });
    // border band of the shemagh along the hanging edges
    if (!asaba) {
      out += '<path d="M98 194L70 188" stroke="' + edge + '" stroke-width="4"/>';
      if (!lith) out += '<path d="M122 194L150 188" stroke="' + edge + '" stroke-width="4"/>';
    }
    // fold lines ("كبسات") beside the face and soft folds in the drapes
    out +=
      '<path d="M90 86q2 14 7 26M78 116q-4 30-6 70M90 130q-2 30-4 60" stroke="#000" stroke-opacity=".16" stroke-width="1.4" fill="none"/>';
    if (!lith)
      out +=
        '<path d="M130 86q-2 14-7 26M142 116q4 30 6 70M130 130q2 30 4 60" stroke="#000" stroke-opacity=".16" stroke-width="1.4" fill="none"/>';
    out += '<path d="' + crown + '" fill="' + fill + '"/>';
    out += '<path d="' + crown + '" fill="url(#' + id + 'sh)"/>';
    // front edge (المرزام): crisp, starched, sitting just above the eyebrows' line
    out += '<path d="M89 84Q88 70 110 68Q132 70 131 84" stroke="' + edge + '" stroke-width="3" fill="none"/>';
    if (lith) {
      // the right flap wraps under the chin and across nose and mouth, tucked up under the agal at the left temple
      var ld = 'M134 88Q136 112 124 120Q108 126 94 116Q88 104 89 90L86 60L93 58L96 87Q113 92 134 88Z';
      out += '<path d="' + ld + '" fill="' + fill + '"/><path d="' + ld + '" fill="#000" opacity=".1"/>';
      out +=
        '<path d="M132 98Q114 104 96 94M132 108Q112 114 94 104M128 117Q108 120 94 112" stroke="#000" stroke-opacity=".2" stroke-width="1.5" fill="none"/>';
      out += '<path d="M96 87Q114 92 134 88" stroke="' + edge + '" stroke-width="2.4" fill="none"/>';
    }
    if (asaba) {
      out +=
        '<path d="M84 56Q110 42 136 56L136 67Q110 53 84 67Z" fill="' +
        fill +
        '" stroke="#5a1a16" stroke-opacity=".5"/>';
      out +=
        '<path d="M90 58l6 7M100 54l6 7M110 52l6 7M120 54l6 7M128 57l5 6" stroke="#000" stroke-opacity=".28" stroke-width="1.6"/>';
      return out;
    }
    // agal: double black cord ring sitting high on the crown, front arc above the front edge
    out +=
      '<path d="M86 52Q110 37 134 52" stroke="#151515" stroke-width="3.6" fill="none"/><path d="M86 55Q110 40 134 55" stroke="#151515" stroke-width="3.6" fill="none"/>';
    out +=
      '<path d="M85 53Q110 66 135 53" stroke="#0a0a0a" stroke-width="4.4" fill="none"/><path d="M85 57Q110 70 135 57" stroke="#0a0a0a" stroke-width="4.4" fill="none"/>';
    out +=
      '<path d="M92 58Q110 66 128 58" stroke="#fff" stroke-opacity=".2" stroke-width="1.1" fill="none"/>';
    return out;
  }
  function mThobe(o, col) {
    var id = o.id,
      out = '';
    var body =
      'M98 116Q86 120 72 127Q64 131 64 146L60 420Q110 428 160 420L156 146Q156 131 148 127Q134 120 122 116Z';
    out += '<path d="' + body + '" fill="' + col + '"/><path d="' + body + '" fill="url(#' + id + 'sh)"/>';
    out +=
      '<path d="M84 210q-4 100-8 206M136 210q4 100 8 206M100 240q-2 90-3 178M120 240q2 90 3 178" stroke="#000" stroke-opacity=".06" stroke-width="2.2" fill="none"/>';
    out +=
      '<path d="M66 300q-2 60-4 118M154 300q2 60 4 118" stroke="#000" stroke-opacity=".1" stroke-width="5" fill="none"/>';
    // round standing collar closed with two buttons, then the placket
    out +=
      '<path d="M98 110Q110 118 122 110L123 119Q110 127 97 119Z" fill="' +
      col +
      '" stroke="#000" stroke-opacity=".22" stroke-width="1"/>';
    out += '<circle cx="110" cy="119" r="1.5" fill="#cfc8ba"/>';
    out +=
      '<path d="M107 124h6v74h-6z" fill="' + col + '" stroke="#000" stroke-opacity=".14" stroke-width="1"/>';
    for (var i = 0; i < 4; i++)
      out +=
        '<circle cx="110" cy="' +
        (134 + i * 16) +
        '" r="1.7" fill="#cfc8ba" stroke="#000" stroke-opacity=".2" stroke-width=".5"/>';
    // chest pocket (wearer's left) and hidden side pockets
    out +=
      '<path d="M126 152h18" stroke="#000" stroke-opacity=".24" stroke-width="1.6"/><path d="M126 153.5h18" stroke="#fff" stroke-opacity=".25" stroke-width="1"/>';
    out += '<path d="M72 258l2 26M148 258l-2 26" stroke="#000" stroke-opacity=".14" stroke-width="1.6"/>';
    return out;
  }
  function mArms(o, col, rolled, cufflink) {
    var s = SK[o.skin],
      out = '';
    [
      [1, 'M72 127Q62 132 60 150L56 246L78 248L80 158Q82 140 86 132Z', 67],
      [-1, 'M148 127Q158 132 160 150L164 246L142 248L140 158Q138 140 134 132Z', 153]
    ].forEach(function (a) {
      var dx = a[0],
        d = a[1],
        cx = a[2];
      if (rolled) d = d.replace(/246/g, '200').replace(/248/g, '202');
      out += '<path d="' + d + '" fill="' + col + '"/><path d="' + d + '" fill="#000" opacity=".1"/>';
      out +=
        '<path d="M' +
        (cx + dx * 4) +
        ' 160q' +
        -dx * 2 +
        ' 40 ' +
        -dx * 3 +
        ' 80" stroke="#000" stroke-opacity=".12" stroke-width="1.4" fill="none"/>';
      if (rolled) {
        out +=
          '<path d="M' +
          (cx - 12) +
          ' 194h24l1 12h-26z" fill="' +
          col +
          '" stroke="#000" stroke-opacity=".2"/>';
        out +=
          '<path d="M' +
          (cx - 9) +
          ' 206L' +
          (cx - 10) +
          ' 248h20L' +
          (cx + 9) +
          ' 206Z" fill="' +
          s[0] +
          '"/><path d="M' +
          (cx - 4) +
          ' 212v32" stroke="' +
          s[1] +
          '" stroke-width="2.5"/>';
      } else {
        out +=
          '<path d="M' +
          (cx - 11.5) +
          ' 238h23l.5 11h-24z" fill="' +
          col +
          '" stroke="#000" stroke-opacity=".22"/>';
        if (cufflink) out += '<circle cx="' + (cx + dx * 7) + '" cy="243.5" r="1.8" fill="#d9b04a"/>';
      }
      out +=
        '<path d="M' +
        (cx - 8) +
        ' 250Q' +
        (cx - 10) +
        ' 266 ' +
        (cx - 3) +
        ' 272Q' +
        (cx + 5) +
        ' 274 ' +
        (cx + 8) +
        ' 266L' +
        (cx + 8) +
        ' 250Z" fill="' +
        s[0] +
        '"/>';
      out +=
        '<path d="M' +
        (cx - 4) +
        ' 262v8M' +
        cx +
        ' 263v9M' +
        (cx + 4) +
        ' 262v7" stroke="' +
        s[1] +
        '" stroke-width="1.2"/>';
    });
    return out;
  }
  function mBisht(o, col) {
    var id = o.id,
      out = '';
    var L = 'M100 114Q84 118 66 126Q54 134 50 160L40 402Q66 410 92 404L100 170Z';
    var R = 'M120 114Q136 118 154 126Q166 134 170 160L180 402Q154 410 128 404L120 170Z';
    [L, R].forEach(function (d) {
      out +=
        '<path d="' +
        d +
        '" fill="' +
        col +
        '" opacity=".96"/><path d="' +
        d +
        '" fill="url(#' +
        id +
        'sh)"/>';
    });
    out +=
      '<path d="M60 160q-6 100-14 236M160 160q6 100 14 236M76 170q-4 100-6 228M144 170q4 100 6 228" stroke="#fff" stroke-opacity=".05" stroke-width="2" fill="none"/>';
    // wide sleeve openings ending above the wrist
    out +=
      '<path d="M50 160L46 226Q62 232 82 224L82 150Z" fill="' +
      col +
      '"/><path d="M170 160L174 226Q158 232 138 224L138 150Z" fill="' +
      col +
      '"/>';
    out +=
      '<path d="M46 226Q62 232 82 224M174 226Q158 232 138 224" stroke="url(#' +
      id +
      'zari)" stroke-width="5" fill="none"/>';
    // zari bands along the front edges and around the neck
    out +=
      '<path d="M100 116L100 170L92 404M120 116L120 170L128 404" stroke="url(#' +
      id +
      'zari)" stroke-width="7" fill="none"/>';
    out +=
      '<path d="M97 116L97 170L89 404M123 116L123 170L131 404" stroke="#e9c35a" stroke-width="1" fill="none"/>';
    out += '<path d="M92 118Q110 108 128 118" stroke="url(#' + id + 'zari)" stroke-width="8" fill="none"/>';
    out +=
      '<path d="M100 190l-3 6M100 214l-3 6M100 238l-3 6M120 190l3 6M120 214l3 6M120 238l3 6" stroke="#f2cf63" stroke-width="2"/>';
    return out;
  }
  function man2(cfg) {
    var o = { skin: cfg.skin, head: cfg.head, lithma: cfg.lithma, bg: cfg.bg, boots: cfg.boots };
    var s = defs(o) + bg(o) + sandals(o);
    if (cfg.field) {
      s +=
        '<path d="M76 300h68l6 108H70z" fill="' +
        P(o.id, 'cam') +
        '"/><path d="M110 300v108" stroke="#000" stroke-opacity=".25" stroke-width="2"/>';
      s +=
        '<path d="M98 116Q86 120 72 127Q64 131 64 146L62 304H158L156 146Q156 131 148 127Q134 120 122 116Z" fill="' +
        P(o.id, 'cam') +
        '"/>';
      s +=
        '<path d="M98 116Q86 120 72 127Q64 131 64 146L62 304H158L156 146Q156 131 148 127Q134 120 122 116Z" fill="url(#' +
        o.id +
        'sh)"/>';
      s +=
        '<rect x="62" y="232" width="96" height="12" fill="#5a4a32"/><rect x="80" y="160" width="24" height="18" rx="2" fill="#a89064" stroke="#000" stroke-opacity=".2"/><rect x="116" y="160" width="24" height="18" rx="2" fill="#a89064" stroke="#000" stroke-opacity=".2"/>';
      s += mArms(o, P(o.id, 'cam'), false, false);
      s += '<path d="M150 124 L70 290" stroke="#2a2a26" stroke-width="5"/>';
    } else {
      s += mThobe(o, cfg.thobe);
      s += mArms(o, cfg.thobe, cfg.rolled, cfg.cufflink);
      if (cfg.bisht) {
        s += mBisht(o, cfg.bisht);
        var sk2 = SK[o.skin];
        [
          [66, 1],
          [154, -1]
        ].forEach(function (h) {
          var cx = h[0];
          s +=
            '<path d="M' +
            (cx - 10) +
            ' 226h20l1 9h-22z" fill="' +
            cfg.thobe +
            '" stroke="#000" stroke-opacity=".2"/>';
          s +=
            '<path d="M' +
            (cx - 8) +
            ' 235Q' +
            (cx - 10) +
            ' 251 ' +
            (cx - 3) +
            ' 257Q' +
            (cx + 5) +
            ' 259 ' +
            (cx + 8) +
            ' 251L' +
            (cx + 8) +
            ' 235Z" fill="' +
            sk2[0] +
            '"/>';
          s +=
            '<path d="M' +
            (cx - 4) +
            ' 247v8M' +
            cx +
            ' 248v9M' +
            (cx + 4) +
            ' 247v7" stroke="' +
            sk2[1] +
            '" stroke-width="1.2"/>';
        });
      }
    }
    s += mFace(o) + mHeadwear(o);
    return s;
  }

  return { man: man2, woman: woman };
})();
function charSVG(lk, vb) {
  var su = suitById[lk.suit] || SUITS[0],
    g = lk.g === 'f' ? 'f' : 'm',
    k = su[g].k,
    inner;
  if (g === 'f') {
    var sh = k === 'asiri' ? '#d8a020' : k === 'field' ? '#6a5a40' : '#141414';
    inner = CHAR.woman({
      skin: lk.skin,
      kind: k,
      shayla: sh,
      trim: k === 'asiri' ? '#c0392b' : null,
      lithma: lk.lithma ? sh : null,
      bg: su.bg
    });
  } else {
    inner = CHAR.man({
      skin: lk.skin,
      thobe: k === 'winter' ? '#4a4f57' : '#f7f5f0',
      head: lk.head,
      lithma: lk.lithma,
      rolled: lk.rolled && (k === 'thobe' || k === 'winter'),
      cufflink: !lk.rolled,
      bisht: k === 'bisht' ? '#1a1613' : null,
      field: k === 'field',
      boots: k === 'field',
      bg: su.bg
    });
  }
  return (
    '<svg viewBox="' +
    (vb || '0 0 220 440') +
    '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
    inner +
    '</svg>'
  );
}
function myLook() {
  return {
    g: save.gender,
    skin: save.skin,
    suit: save.suit,
    head: save.head,
    lithma: save.lithma,
    rolled: save.rolled
  };
}
function vmColors() {
  var su = suitById[save.suit] || SUITS[0],
    sk = SKIN[save.skin].hex,
    g = save.gender;
  var rolled = g === 'm' && save.rolled && (su.m.k === 'thobe' || su.m.k === 'winter');
  return { skin: sk, sleeve: su[g].sl, rolled: rolled, k: su[g].k, g: g };
}
function lookOpts(lk) {
  if (!lk || typeof lk !== 'object') return null;
  var su = suitById[lk.s] || SUITS[0],
    g = lk.g === 'f' ? 'f' : 'm',
    k = su[g].k,
    sk = SKIN[lk.k] || SKIN.h;
  var o = { thobe: k !== 'field', skinHex: sk.hex };
  if (k === 'field') o.shirt = g === 'f' ? 0xa68c62 : 0x9b8156;
  else o.robe = g === 'f' ? su.f.sl : k === 'winter' ? 0x4a4f57 : k === 'bisht' ? 0x1a1613 : 0xf2f0e8;
  o.hat = g === 'f' ? 'shayla' : lk.h === 'ghutra' ? 'ghutra' : 'shemagh';
  o.shayla = k === 'asiri' ? 0xd8a020 : k === 'field' ? 0x6a5a40 : 0x141414;
  return o;
}

/* ---------- cheers in three dialects, with an optional device voice ---------- */
var voices = [],
  MALE = /maged|majed|tarik|tariq|hamed|naayf|fahad|shakir|omar|male|ذكر/i,
  FEM = /laila|layla|mariam|maryam|hoda|zariyah|salma|amira|sara|noura|lana|female|أنثى/i;
function loadVoices() {
  try {
    voices = window.speechSynthesis.getVoices().filter(function (v) {
      return /^ar/i.test(v.lang);
    });
  } catch (e) {
    voices = [];
  }
}
if (window.speechSynthesis) {
  loadVoices();
  try {
    window.speechSynthesis.onvoiceschanged = function () {
      loadVoices();
      if (SH.scr === 'arsenal') renderArsenal();
    };
  } catch (e) {}
}
function pickVoice() {
  var want = save.voice === 'f' ? FEM : MALE,
    v = voices.filter(function (x) {
      return want.test(x.name);
    })[0];
  return { v: v || voices[0] || null, exact: !!v };
}
function speak(t) {
  if (save.voice === 'off' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined')
    return;
  try {
    var u = new SpeechSynthesisUtterance(t),
      pv = pickVoice();
    u.lang = 'ar-SA';
    u.rate = 1.05;
    if (pv.v) u.voice = pv.v;
    if (!pv.exact) u.pitch = save.voice === 'f' ? 1.35 : 0.75;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {}
}
function callout(type) {
  var set = (PHR[save.dialect] || PHR.najdi)[type];
  if (!set) return;
  var t = set[Math.floor(Math.random() * set.length)],
    c = el('callout');
  c.textContent = t;
  c.className = type === 'death' || type === 'fail' ? 'bad' : '';
  void c.offsetWidth;
  c.classList.add('go');
  speak(t);
}

/* ---------- session state ---------- */
var level = save.level,
  S = null,
  cur = null,
  D = DIFFS[save.diff],
  mode = 'menu',
  last = 0,
  drag = null,
  lx = 0,
  ly = 0,
  lastWin = false,
  arsenalOpen = false;
var HUDC = '#e4ecd6',
  HUDD = 'rgba(228,236,214,.6)',
  fogK = 1;
var BUL = [],
  BC = null,
  lookDX = 0,
  lookDY = 0;
function markTex(col) {
  var c = mk(64, 64),
    x = c.getContext('2d');
  x.fillStyle = col;
  x.strokeStyle = '#000';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(8, 10);
  x.lineTo(56, 10);
  x.lineTo(32, 56);
  x.closePath();
  x.stroke();
  x.fill();
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
var MK = {
  vip: new THREE.SpriteMaterial({ map: markTex('#4ccf6a'), transparent: true, depthTest: false, fog: false }),
  host: new THREE.SpriteMaterial({ map: markTex('#f2c230'), transparent: true, depthTest: false, fog: false })
};
function disposeWorld() {
  if (!S || !S.world) return;
  scene.remove(S.world);
  S.world.traverse(function (o) {
    if (o.userData && o.userData.own && o.geometry) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
  });
  BUL.forEach(function (b) {
    if (b.tr) fxGroup.remove(b.tr);
  });
  BUL = [];
  clearFX();
}

/* ---------- world + mission builder ---------- */
function build(n, d, opt) {
  var info = missionInfo(n),
    r = rng(n * 977 + 13),
    world = new THREE.Group(),
    blds = [],
    tg = [];
  if (save.region === 'south') buildSouth(n, r, world, blds);
  else buildCity(n, r, world, blds);
  SH.progress(0.85);
  var base = (r() * 2 - 1) * Math.min(4.5, 1 + n * 0.6) * d.wind;
  if (opt && opt.empty) {
    scene.add(world);
    return { world: world, targets: [], total: 0, mission: info, blds: blds, base: base };
  }
  function pickSpot(gap, lo, hi) {
    var b, lxp, tx, tz;
    for (var tries = 0; tries < 50; tries++) {
      var li = lo + Math.floor(r() * (hi - lo + 1));
      var pool = blds.filter(function (z) {
        return z.l === li && Math.abs(z.a) < 72 * D2R;
      });
      if (!pool.length)
        pool = blds.filter(function (z) {
          return z.l <= 2 && Math.abs(z.a) < 80 * D2R;
        });
      b = pool[Math.floor(r() * pool.length)];
      lxp = (r() * 2 - 1) * Math.max(0.3, b.w / 2 - 2.5);
      tx = b.x + Math.cos(b.a) * lxp;
      tz = b.z + Math.sin(b.a) * lxp;
      if (
        tg.every(function (o) {
          return Math.hypot(o.px - tx, o.pz - tz) > gap;
        })
      )
        break;
    }
    return { b: b, lx: lxp, tx: tx, tz: tz };
  }
  function addPerson(kind, role, sp, lxo, o, still) {
    var grp = mkPerson(kind, r, o),
      u = grp.userData;
    world.add(grp);
    world.add(u.blob);
    var t = {
      kind: kind,
      role: role,
      b: sp.b,
      lx: sp.lx + lxo,
      lim: Math.max(0.4, sp.b.w / 2 - 2),
      vx: still ? 0 : (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6) * d.speed,
      alive: true,
      b0: 0,
      fall: 0,
      fdir: r() < 0.5 ? 1 : -1,
      grp: grp,
      px: sp.tx,
      pz: sp.tz,
      y: sp.b.h,
      d: 0,
      mode: still ? 'still' : 'look',
      timer: 0.5 + r() * 2,
      hd: 0,
      ph: r() * 6,
      alert: 0
    };
    if (role === 'crim' || role === 'host') t.br = 0.2;
    if (role === 'host' || role === 'vip') {
      var m = new THREE.Sprite(role === 'vip' ? MK.vip : MK.host);
      m.renderOrder = 5;
      world.add(m);
      t.mk = m;
    }
    tg.push(t);
    return t;
  }
  var type = info.type,
    enemies = 0,
    k,
    sp2,
    civN = clamp(1 + n + d.civ, 1, 7);
  if (type === 'clear') {
    enemies = clamp(2 + n + d.en, 2, 7);
    for (k = 0; k < enemies; k++) addPerson('e', 'gun', pickSpot(6, 0, 2), 0, null, false);
    for (k = 0; k < civN; k++) addPerson('c', 'civ', pickSpot(6, 0, 2), 0, null, false);
  } else if (type === 'hostage') {
    sp2 = pickSpot(8, 0, 1);
    addPerson('e', 'crim', sp2, 0.45, null, true);
    addPerson('c', 'host', sp2, -0.45, { thobe: false, shirt: 0xe8e2d0, hat: 'none' }, true);
    enemies = 1;
    var gN = (n >= 5 ? 1 : 0) + (d.id === 'hard' ? 1 : 0);
    for (k = 0; k < gN; k++) {
      addPerson('e', 'gun', pickSpot(6, 0, 2), 0, null, false);
      enemies++;
    }
    for (k = 0; k < clamp(civN - 3, 0, 3); k++) addPerson('c', 'civ', pickSpot(6, 0, 2), 0, null, false);
  } else if (type === 'assassin') {
    addPerson(
      'e',
      'target',
      pickSpot(6, 0, 2),
      0,
      { thobe: false, shirt: info.shirt.hex, hat: info.hat.id },
      false
    );
    enemies = 1;
    var nc = clamp(5 + n + d.civ * 2, 5, 14),
      share = d.id === 'easy' ? 0 : d.id === 'hard' ? 4 : 2;
    var rs1 = function () {
        return SHIRTS[Math.floor(r() * SHIRTS.length)];
      },
      rh1 = function () {
        return HATSM[Math.floor(r() * HATSM.length)];
      };
    for (k = 0; k < nc; k++) {
      var sh = rs1(),
        ht = rh1();
      if (k < share && k % 2 === 0) {
        sh = info.shirt;
        while (ht === info.hat) ht = rh1();
      } else if (k < share) {
        ht = info.hat;
        while (sh === info.shirt) sh = rs1();
      } else {
        while (sh === info.shirt) sh = rs1();
        while (ht === info.hat) ht = rh1();
      }
      addPerson('c', 'civ', pickSpot(4.5, 0, 2), 0, { thobe: false, shirt: sh.hex, hat: ht.id }, false);
    }
  } else {
    addPerson('c', 'vip', pickSpot(8, 0, 1), 0, { thobe: true, hat: 'shemagh' }, true);
    enemies = clamp(2 + Math.floor(n / 4) + d.en, 2, 5);
    for (k = 0; k < enemies; k++) {
      var en = addPerson('e', 'gun', pickSpot(6, 0, 2), 0, null, false);
      en.fuse = (12 + r() * 8 + k * 7) * d.fuse;
    }
    for (k = 0; k < clamp(civN - 4, 0, 2); k++) addPerson('c', 'civ', pickSpot(6, 0, 2), 0, null, false);
  }
  scene.add(world);
  return { world: world, targets: tg, total: enemies, mission: info, blds: blds, base: base };
}
function reset() {
  disposeWorld();
  D = DIFFS[save.diff];
  P_MIN = (save.region === 'south' ? -40 : -24) * D2R;
  P_MAX = (save.region === 'south' ? 22 : 14) * D2R;
  cur = curStats(save.sel);
  cur.sway *= D.sway;
  cur.wind *= D.wind;
  var g = build(level, D);
  S = {
    world: g.world,
    targets: g.targets,
    blds: g.blds,
    total: g.total,
    killed: 0,
    heads: 0,
    shots: 0,
    hits: 0,
    mission: g.mission,
    type: g.mission.type,
    ammo: Math.max(
      g.total,
      g.total +
        2 +
        cur.ammo +
        D.ammo +
        (g.mission.type === 'assassin' ? 2 : g.mission.type === 'hostage' ? 1 : 0)
    ),
    time: Math.round(
      { clear: Math.max(40, 80 - level * 3), hostage: 60, assassin: 90, protect: 75 }[g.mission.type] * D.time
    ),
    base: g.base,
    t: 0,
    rt: 0,
    cool: 0,
    recoil: 0,
    slow: 0,
    scoped: false,
    brHold: false,
    warned: false,
    breath: cur.bmax,
    fov: HIP,
    zfov: cur.fov,
    yaw: 0,
    pitch: (save.region === 'south' ? -14 : -8) * D2R,
    ay: 0,
    ap: 0,
    wind: g.base,
    banner: null,
    pending: null,
    hm: 0,
    hmHead: false,
    ox: 0,
    oy: CAMY,
    oz: 0,
    yaw0: 0,
    swx: 0,
    swy: 0
  };
  S.syaw = S.yaw;
  S.spitch = S.pitch;
  buildVM(cur.w);
  placeTargets();
  zoomReset();
  renderer.shadowMap.needsUpdate = true;
  SH.progress(1);
}
function placeTargets() {
  S.targets.forEach(function (t) {
    if (t.kind === 'p') return;
    var ca = Math.cos(t.b.a),
      sa = Math.sin(t.b.a);
    t.px = t.b.x + ca * t.lx;
    t.pz = t.b.z + sa * t.lx;
    t.grp.position.set(t.px, t.y - t.fall * 0.2, t.pz);
    var u = t.grp.userData;
    u.blob.position.set(t.px, t.y + 0.04, t.pz);
    u.blob.visible = t.fall < 0.9;
    t.d = Math.round(Math.hypot(t.px - S.ox, t.y + 0.9 - S.oy, t.pz - S.oz));
    if (t.mk) {
      t.mk.visible = t.alive;
      t.mk.position.set(t.px, t.y + 2.45, t.pz);
      t.mk.scale.setScalar(Math.max(1.2, t.d * 0.011));
    }
  });
}
function animateTargets(sdt, dt) {
  S.targets.forEach(function (t) {
    if (t.kind === 'p') return;
    var g = t.grp;
    if (!t.alive) {
      t.fall = Math.min(1, t.fall + sdt * 2.4);
      var e = 1 - Math.pow(1 - t.fall, 3);
      g.rotation.x = -e * 1.42 * t.fdir;
      g.userData.root.position.y = -e * 0.05;
      return;
    }
    var toCam = Math.atan2(S.ox - t.px, S.oz - t.pz);
    if (t.alert > 0) t.alert -= sdt;
    if (t.mode === 'still') {
      t.hd = la(t.hd, toCam, Math.min(1, sdt * 4));
      g.rotation.y = t.hd;
      t.ph += sdt * 2;
      animPerson(g, 'idle', t.ph, sdt, t.kind === 'e');
      return;
    }
    t.timer -= sdt;
    var spd = t.alert > 0 ? 2.2 : 1;
    if (t.mode === 'walk') {
      t.lx += t.vx * spd * sdt;
      if (Math.abs(t.lx - t.b0) > t.lim) {
        t.lx = t.b0 + Math.sign(t.lx - t.b0) * t.lim;
        t.vx *= -1;
      }
      var dir = Math.sign(t.vx),
        want = Math.atan2(Math.cos(t.b.a) * dir, Math.sin(t.b.a) * dir);
      t.hd = la(t.hd, want, Math.min(1, sdt * 6));
      t.ph += sdt * 7 * Math.abs(t.vx) * spd;
      if (t.timer <= 0 && t.alert <= 0) {
        t.mode = 'look';
        t.timer = 1 + Math.random() * 2.5;
      }
    } else {
      t.hd = la(t.hd, toCam + Math.sin(S.t * 0.7 + t.ph) * 0.6, Math.min(1, sdt * 2.5));
      t.ph += sdt * 2;
      if (t.timer <= 0 || t.alert > 0) {
        t.mode = 'walk';
        t.timer = 2 + Math.random() * 3;
        if (Math.random() < 0.4) t.vx *= -1;
      }
    }
    g.rotation.y = t.hd;
    animPerson(g, t.mode === 'walk' ? 'walk' : 'idle', t.ph, sdt, t.kind === 'e');
  });
}
function enemiesLeft() {
  return S.targets.filter(function (t) {
    return t.kind === 'e' && t.alive;
  }).length;
}
function banner(text, col) {
  S.banner = { text: text, col: col || HUDC, t: 1.3 };
}

/* ---------- ballistics: real flight time, gravity drop, wind drift, hit boxes ---------- */
var _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3();
function segPointDist2(p, q, c) {
  var dx = q.x - p.x,
    dy = q.y - p.y,
    dz = q.z - p.z,
    l2 = dx * dx + dy * dy + dz * dz;
  var t = l2 > 0 ? clamp(((c.x - p.x) * dx + (c.y - p.y) * dy + (c.z - p.z) * dz) / l2, 0, 1) : 0;
  var x = p.x + dx * t - c.x,
    y = p.y + dy * t - c.y,
    z = p.z + dz * t - c.z;
  return x * x + y * y + z * z;
}
function segSegDist2(p1, q1, p2, q2) {
  var d1 = _a.subVectors(q1, p1),
    d2 = _b.subVectors(q2, p2),
    r = _c.subVectors(p1, p2);
  var a = d1.dot(d1),
    e = d2.dot(d2),
    f = d2.dot(r),
    s,
    t;
  if (a < 1e-9 && e < 1e-9) return r.lengthSq();
  if (a < 1e-9) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    var c = d1.dot(r);
    if (e < 1e-9) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      var b = d1.dot(d2),
        den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  var dx = p1.x + d1.x * s - (p2.x + d2.x * t),
    dy = p1.y + d1.y * s - (p2.y + d2.y * t),
    dz = p1.z + d1.z * s - (p2.z + d2.z * t);
  return dx * dx + dy * dy + dz * dz;
}
var _h = new THREE.Vector3(),
  _k1 = new THREE.Vector3(),
  _k2 = new THREE.Vector3(),
  _l1 = new THREE.Vector3(),
  _l2 = new THREE.Vector3();
function hitTargets(p, q) {
  var best = null,
    bd = 1e9;
  S.targets.forEach(function (t) {
    if (!t.alive || t.cover || (t.grp && !t.grp.visible)) return;
    var gp = t.grp.position,
      low = t.lowY || 0;
    if (segPointDist2(p, q, gp) > 9) {
      var mid = _h.set(gp.x, gp.y + 1, gp.z);
      if (segPointDist2(p, q, mid) > 6) return;
    }
    _h.set(gp.x, gp.y + 1.68 - low, gp.z);
    var dh = segPointDist2(p, q, _h),
      part = 0;
    if (dh < 0.15 * 0.15) part = 2;
    else {
      var br = t.br || 0.24;
      _k1.set(gp.x, gp.y + 0.95 - low, gp.z);
      _k2.set(gp.x, gp.y + 1.48 - low, gp.z);
      _l1.set(gp.x, gp.y + 0.12 - low, gp.z);
      _l2.set(gp.x, gp.y + 0.92 - low, gp.z);
      if (segSegDist2(p, q, _k1, _k2) < br * br || segSegDist2(p, q, _l1, _l2) < 0.14 * 0.14) part = 1;
    }
    if (part) {
      var dd = p.distanceToSquared(gp);
      if (dd < bd) {
        bd = dd;
        best = { t: t, part: part };
      }
    }
  });
  return best;
}
function hitWorld(p, q) {
  var gy = H(q.x, q.z);
  if (q.y < gy) return { kind: 'ground', n: new THREE.Vector3(0, 1, 0), p: q.clone().setY(gy + 0.05) };
  for (var i = 0; i < S.blds.length; i++) {
    var b = S.blds[i];
    if (Math.abs(q.x - b.x) > b.rad + 2 || Math.abs(q.z - b.z) > b.rad + 2) continue;
    if (q.y > b.h - 0.02 || q.y < (b.bot || 0)) continue;
    var ca = Math.cos(b.a),
      sa = Math.sin(b.a),
      dx = q.x - b.x,
      dz = q.z - b.z,
      lx2 = dx * ca + dz * sa,
      lz = -dx * sa + dz * ca;
    var hw = b.tower ? b.w * 0.4 : b.w / 2,
      hd = b.tower ? b.w * 0.4 : b.d / 2;
    if (Math.abs(lx2) < hw && Math.abs(lz) < hd) {
      var px = p.x - b.x,
        pz = p.z - b.z,
        plx = px * ca + pz * sa,
        plz = -px * sa + pz * ca,
        n = new THREE.Vector3();
      if (Math.abs(plz) >= hd) n.set(-sa * Math.sign(plz), 0, ca * Math.sign(plz));
      else if (Math.abs(plx) >= hw) n.set(ca * Math.sign(plx), 0, sa * Math.sign(plx));
      else n.set(0, 1, 0);
      return { kind: 'hard', n: n, p: p.clone() };
    }
  }
  return null;
}
function makeBullet(o, dir, mv) {
  var g = 9.81 * 1.6 * cur.drop,
    zeroT = 100 / mv,
    lift = (g * zeroT) / 2;
  var v = dir.clone().multiplyScalar(mv);
  v.y += lift;
  return { p: o.clone(), v: v, g: g, t: 0, alive: true, dist: 0 };
}
// one integration step; returns impact info or null
function stepBullet(b, dt, sim) {
  var steps = Math.max(1, Math.ceil(dt / 0.003)),
    h = dt / steps,
    wa = S.wind * 1.5 * cur.wind;
  for (var i = 0; i < steps; i++) {
    var p = b.p.clone();
    b.v.y -= b.g * h;
    b.v.x += wa * h;
    b.p.addScaledVector(b.v, h);
    b.t += h;
    b.dist = b.p.distanceTo(_h.set(S.ox, S.oy, S.oz));
    var ht = hitTargets(p, b.p);
    var hw = hitWorld(p, b.p);
    if (ht && (!hw || p.distanceToSquared(ht.t.grp.position) <= p.distanceToSquared(hw.p)))
      return { target: ht.t, part: ht.part, p: b.p.clone() };
    if (hw) return { world: hw };
    if (b.t > 3 || b.p.y < -60) return { lost: true };
  }
  return null;
}
function predict(o, dir) {
  var b = makeBullet(o, dir, cur.mv),
    res = null;
  for (var i = 0; i < 400 && !res; i++) res = stepBullet(b, 1 / 120, true);
  return { res: res, time: b.t };
}

/* ---------- firing ---------- */
function aimDir() {
  return new THREE.Vector3(0, 0, -1).applyEuler(_eAim.set(S.ap, -S.ay, 0, 'YXZ'));
}
var _eAim = new THREE.Euler();
function fire() {
  if (mode !== 'play' || S.pending || BC) return;
  if (S.duel) {
    if (S.dead > 0 || S.moving > 0) return;
    if (S.cover) {
      banner('اطلع من خلف الجدار أولاً', '#c9a46a');
      return;
    }
  }
  if (S.fov > 30) {
    banner(save.aim === 'slider' ? 'ارفع الشريط لفتح المنظار' : 'افتح المنظار أولاً', '#c9a46a');
    return;
  }
  if (S.cool > 0) return;
  if (!S.duel && S.ammo <= 0) return;
  if (!S.duel) S.ammo--;
  S.cool = cur.cd;
  S.recoil = 1;
  S.shots++;
  VM.kick = 1;
  var w = cur.w,
    heavy = w.id === 'm82' || w.id === 'm200';
  sfxShot(heavy, w.gun.muzzle === 'supp');
  if (w.gun.act === 'bolt') {
    VM.boltT = 0.6;
    sfxBolt();
  }
  var o = new THREE.Vector3(S.ox, S.oy, S.oz),
    dir = aimDir();
  spawn(
    FXM.smoke,
    o
      .clone()
      .addScaledVector(dir, 2.5)
      .add(_h.set(0, -0.3, 0)),
    dir.clone().multiplyScalar(1.5),
    0.9,
    0.3,
    1.6,
    0.35
  );
  var pr = predict(o, dir),
    res = pr.res;
  var b = makeBullet(o, dir, cur.mv);
  tracerFX(b);
  BUL.push(b);
  if (S.duel) {
    b.duel = true;
    duelFired();
  }
  if (
    save.bcam &&
    res &&
    res.target &&
    res.target.kind === 'e' &&
    !S.duel &&
    (res.part === 2 || enemiesLeft() === 1 || Math.random() < 0.2)
  )
    startBulletCam(b, res, pr.time);
}
function onImpact(b, res) {
  if (b.tr) {
    fxGroup.remove(b.tr);
    b.tr = null;
  }
  b.alive = false;
  if (res.lost) return;
  if (res.world) {
    impactFX(res.world.p, res.world.n, res.world.kind, b.dist);
    sfxImpact(b.dist, false);
    if (!S.duel)
      S.targets.forEach(function (t) {
        if (t.alive && t.kind === 'e' && t.grp.position.distanceTo(res.world.p) < 6) {
          t.alert = 3;
          t.mode = 'walk';
        }
      });
    if (b.duel) duelShot(null, 0);
    else if (!S.pending && S.ammo <= 0 && enemiesLeft() > 0)
      S.pending = { win: false, why: 'خلص الرصاص قبل ما تسقط كل الأهداف.', at: S.rt + 1.2 };
    return;
  }
  var t = res.target,
    part = res.part;
  impactFX(res.p, _h.set(0, 0, 1), 'flesh', b.dist);
  sfxImpact(b.dist, true);
  S.hm = 0.45;
  S.hmHead = part === 2;
  if (b.duel) {
    duelShot(t, part);
    return;
  }
  S.hits++;
  t.alive = false;
  S.slow = 0.6;
  if (t.kind === 'e') {
    S.killed++;
    if (part === 2) S.heads++;
    callout(S.rt - (S.lastKill || -9) < 4 ? 'multi' : part === 2 ? 'head' : 'kill');
    S.lastKill = S.rt;
    banner(
      t.role === 'crim'
        ? 'تحررت الرهينة'
        : part === 2
          ? 'إصابة في الرأس · ' + ar(Math.round(b.dist)) + ' م'
          : 'هدف سقط · ' + ar(Math.round(b.dist)) + ' م',
      '#7fae5a'
    );
    S.targets.forEach(function (o) {
      if (o.alive && o.kind === 'e' && o.grp.position.distanceTo(t.grp.position) < 40) {
        o.alert = 4;
        o.mode = 'walk';
      }
    });
    if (enemiesLeft() === 0) S.pending = { win: true, at: S.rt + (BC ? 2.2 : 1.2) };
  } else {
    var fm =
      t.role === 'host'
        ? 'أصبت الرهينة'
        : t.role === 'vip'
          ? 'أصبت الشخصية'
          : S.type === 'assassin'
            ? 'ليس هو المطلوب'
            : 'أصبت مدنياً';
    var fw =
      t.role === 'host'
        ? 'أصبت الرهينة بدل المجرم.'
        : t.role === 'vip'
          ? 'أصبت الشخصية التي تحميها.'
          : S.type === 'assassin'
            ? 'أصبت شخصاً ليس هو المطلوب.'
            : 'أصبت مدنياً. المدنيون خط أحمر.';
    banner(fm, '#e0603f');
    S.pending = { win: false, why: fw, at: S.rt + 1.2 };
  }
  if (!S.pending && S.ammo <= 0 && enemiesLeft() > 0)
    S.pending = { win: false, why: 'خلص الرصاص قبل ما تسقط كل الأهداف.', at: S.rt + 1.2 };
}
function updateBullets(sdt) {
  for (var i = BUL.length - 1; i >= 0; i--) {
    var b = BUL[i];
    if (b.alive) {
      var res = stepBullet(b, sdt, false);
      if (res) onImpact(b, res);
    }
    if (b.tr) {
      b.tr.position.copy(b.p).addScaledVector(_h.copy(b.v).normalize(), -4.5);
      b.tr.lookAt(b.p);
      b.tr.visible = b.dist > 25;
    }
    if (!b.alive) BUL.splice(i, 1);
  }
}

/* ---------- bullet cam: slow-motion chase of the decisive shot ---------- */
function startBulletCam(b, res, flight) {
  BC = { b: b, res: res, phase: 'fly', t: 0, scale: clamp(flight / 1.8, 0.04, 0.4), after: 0 };
  el('stage').classList.add('bcam');
  windOn(false);
}
function updateBulletCam(dt) {
  var b = BC.b;
  if (BC.phase === 'fly') {
    if (!b.alive) {
      BC.phase = 'after';
      BC.after = 0;
      return;
    }
    var tp = BC.res.target.grp.position,
      near = b.p.distanceTo(tp) < 14;
    var dir = _h.copy(b.v).normalize();
    camera.position
      .copy(b.p)
      .addScaledVector(dir, near ? -2.2 : -1.4)
      .add(_k1.set(0.25, 0.22, 0));
    camera.lookAt(_k2.copy(b.p).addScaledVector(dir, 4));
    camera.fov = near ? 32 : 42;
  } else {
    BC.after += dt;
    var t = BC.res.target.grp.position,
      ang = BC.after * 0.4;
    camera.position.set(t.x + Math.sin(ang) * 4.5, t.y + 1.6, t.z + Math.cos(ang) * 4.5);
    camera.lookAt(t.x, t.y + 0.9, t.z);
    camera.fov = 40;
    if (BC.after > 1.6) {
      BC = null;
      el('stage').classList.remove('bcam');
      windOn(true);
    }
  }
}
function bcScale() {
  if (!BC) return 1;
  if (BC.phase === 'after') return 0.35;
  return BC.b.p.distanceTo(BC.res.target.grp.position) < 14 ? 0.05 : BC.scale;
}

/* ---------- per-frame update ---------- */
function update(dt) {
  var sc = bcScale(),
    sdt = dt * sc * (S.slow > 0 ? 0.4 : 1);
  if (S.slow > 0) S.slow -= dt;
  S.t += sdt;
  S.rt += dt;
  S.cool = Math.max(0, S.cool - dt);
  S.recoil = Math.max(0, S.recoil - dt * 2.4);
  S.hm = Math.max(0, S.hm - dt);
  S.wind = S.base + Math.sin(S.t * 0.6) * 0.7 * D.wind + Math.sin(S.t * 1.7) * 0.3 * D.wind;
  var hard = D.id === 'hard',
    steady = false;
  if (hard && S.scoped && S.brHold && S.breath > 0) {
    steady = true;
    S.breath = Math.max(0, S.breath - dt);
    if (S.breath <= 0 && !S.warned) {
      S.warned = true;
      banner('انقطع نفسك', '#c9a46a');
    }
  } else {
    S.breath = Math.min(cur.bmax, S.breath + dt * (S.brHold ? 0.2 : 0.6));
    if (S.breath > 0.8) S.warned = false;
  }
  S.fov += ((S.scoped ? S.zfov || cur.fov : HIP) - S.fov) * Math.min(1, dt * 10);
  clampView();
  var zf = Math.min(1, Math.sqrt(S.fov / cur.fov)),
    sf = (steady ? 0.08 : hard ? 0.3 : 0.13) * zf * D2R * cur.sway;
  var sy = (Math.sin(S.t * 0.9) * 0.6 + Math.sin(S.t * 2.3) * 0.25) * sf,
    sp = (Math.sin(S.t * 1.3 + 1) * 0.5 + Math.cos(S.t * 2.9) * 0.2) * sf;
  S.swx = sy / (S.fov * D2R);
  S.swy = sp / (S.fov * D2R);
  var sm = 1 - Math.exp(-dt * 16);
  S.syaw = la(S.syaw, S.yaw, sm);
  S.spitch += (S.pitch - S.spitch) * sm;
  S.ay = S.syaw + sy;
  S.ap = S.spitch + sp + S.recoil * S.recoil * 0.02 * cur.rec * (S.fov / cur.fov);
  if (S.duel) duelUpdate(sdt, dt);
  else {
    animateTargets(sdt, dt);
    placeTargets();
  }
  updateBullets(sdt);
  updateFX(sdt);
  if (S.type === 'protect' && !S.pending) {
    S.targets.forEach(function (t) {
      if (t.alive && t.kind === 'e' && t.fuse !== undefined) {
        t.fuse -= sdt;
        if (t.fuse <= 0 && !S.pending) {
          S.targets.forEach(function (v) {
            if (v.role === 'vip') v.alive = false;
          });
          sfxShot(false, false);
          S.pending = { win: false, why: 'أطلق المسلح النار على الشخصية التي تحميها.', at: S.rt + 1 };
        }
      }
    });
  }
  if (!S.duel && !S.pending) {
    S.time -= sdt;
    if (S.time <= 0) S.pending = { win: false, why: 'انتهى الوقت.', at: S.rt + 0.3 };
  }
  if (S.pending && S.rt >= S.pending.at && !BC) finish(S.pending.win, S.pending.why);
  if (S.banner) {
    S.banner.t -= dt;
    if (S.banner.t <= 0) S.banner = null;
  }
  poseVM(dt, false, S.scoped, lookDX, lookDY);
  lookDX *= 0.8;
  lookDY *= 0.8;
  vm.visible = !BC && VM.ads < 0.9 && !(S.duel && (S.cover || S.dead > 0));
  if (AU.wind) AU.wind.g.gain.value = 0.03 + Math.min(0.08, Math.abs(S.wind) * 0.012);
}
function clampView() {
  S.yaw = clamp(S.yaw, S.yaw0 - YAW_MAX, S.yaw0 + YAW_MAX);
  S.pitch = clamp(S.pitch, P_MIN, P_MAX);
}
function finish(win, why) {
  if (MP.game && MP.game.kind === 'race') {
    raceStep(win, why);
    return;
  }
  callout(win ? 'win' : 'fail');
  mode = 'over';
  lastWin = win;
  S.pending = null;
  S.scoped = false;
  S.brHold = false;
  vm.visible = false;
  zoomReset();
  var su = suitById[save.suit] || SUITS[0];
  var coins = win ? Math.round((60 + level * 15 + S.heads * 25 + S.ammo * 10) * D.coin * (su.coin || 1)) : 0;
  save.coins += coins;
  if (win) {
    level++;
    save.level = Math.max(save.level, level);
  }
  persist();
  var acc = S.shots ? Math.round((S.hits / S.shots) * 100) : 0;
  el('ovTitle').textContent = win ? 'المهمة نجحت' : 'فشلت المهمة';
  el('ovText').textContent = win
    ? WINS[S.type] +
      ' دقتك ' +
      ar(acc) +
      '٪ · إصابات الرأس ' +
      ar(S.heads) +
      ' · كسبت ' +
      ar(coins) +
      ' عملة.'
    : (why || '') + ' حاول مرة ثانية.';
  el('resGo').textContent = win ? 'المهمة التالية' : 'حاول مرة ثانية';
  overlay.hidden = false;
}
var overlay = el('overlay');

/* ---------- layout ---------- */
function fit() {
  var W = Math.max(1, window.innerWidth),
    Hh = Math.max(1, window.innerHeight);
  CH = 360;
  CW = Math.max(200, Math.round((CH * W) / Hh));
  CX = CW / 2;
  CY = CH / 2;
  CR = CH / 2 - 4;
  MINI_H = 22;
  MINI_W = Math.round(Math.min(300, CW * 0.34));
  MINI_X = Math.round(CX - MINI_W / 2);
  MINI_Y = CH - MINI_H - 8;
  var dev = window.devicePixelRatio || 1,
    q = QUAL[save.q],
    dpr2 = Math.min(dev, 2);
  stageW = W;
  stageH = Hh;
  basePR = Math.min(dev, q.dpr);
  cv.style.width = W + 'px';
  cv.style.height = Hh + 'px';
  cv.width = Math.floor(W * dpr2);
  cv.height = Math.floor(Hh * dpr2);
  ctx.setTransform(cv.width / CW, 0, 0, cv.height / CH, 0, 0);
  buildScope();
  setRes();
  applyZoom();
}
/* ---------- scope: tube, lens edge and vignette are cached; reticle is drawn live ---------- */
var scopeL = mk(4, 4);
function buildScope() {
  var dpr = cv.width / CW;
  scopeL = mk(cv.width, cv.height);
  var x = scopeL.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = '#000';
  x.beginPath();
  x.rect(0, 0, CW, CH);
  x.arc(CX, CY, CR, 0, Math.PI * 2, true);
  x.fill('evenodd');
  var g = x.createRadialGradient(CX, CY, CR * 0.62, CX, CY, CR);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.82, 'rgba(0,0,0,.25)');
  g.addColorStop(0.95, 'rgba(0,0,0,.75)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(CX, CY, CR, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(80,120,170,.25)';
  x.lineWidth = 2;
  x.beginPath();
  x.arc(CX, CY, CR - 3, 0, Math.PI * 2);
  x.stroke();
  x.strokeStyle = 'rgba(200,120,60,.18)';
  x.lineWidth = 1.5;
  x.beginPath();
  x.arc(CX, CY, CR - 6, 0, Math.PI * 2);
  x.stroke();
  x.strokeStyle = '#1a1a1a';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(CX, CY, CR + 2, 0, Math.PI * 2);
  x.stroke();
}
function drawScope(sk) {
  ctx.save();
  ctx.globalAlpha = sk;
  // scope shadow: when the eye is off-axis (sway, recoil) a dark crescent creeps in from the edge
  var ox = -S.swx * 0.9 * CR,
    oy = -S.swy * 0.9 * CR - S.recoil * 30,
    off = Math.hypot(ox, oy);
  if (off > 2) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, CR, 0, Math.PI * 2);
    ctx.clip();
    var g = ctx.createRadialGradient(
      CX + ox * 1.6,
      CY + oy * 1.6,
      CR * 0.85,
      CX + ox * 1.6,
      CY + oy * 1.6,
      CR * 1.15
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.9, off / 40) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(CX - CR, CY - CR, CR * 2, CR * 2);
    ctx.restore();
  }
  ctx.drawImage(scopeL, 0, 0, CW, CH);
  // first-focal-plane mil reticle: spacing is a true milliradian at any zoom
  var mil = (0.001 / (S.fov * D2R)) * CH,
    R = CR;
  ctx.strokeStyle = 'rgba(10,10,10,.95)';
  ctx.fillStyle = 'rgba(10,10,10,.95)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(CX - R, CY);
  ctx.lineTo(CX - R * 0.42, CY);
  ctx.moveTo(CX + R * 0.42, CY);
  ctx.lineTo(CX + R, CY);
  ctx.moveTo(CX, CY + R);
  ctx.lineTo(CX, CY + R * 0.42);
  ctx.moveTo(CX, CY - R);
  ctx.lineTo(CX, CY - R * 0.42);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX - R * 0.42, CY);
  ctx.lineTo(CX + R * 0.42, CY);
  ctx.moveTo(CX, CY - R * 0.42);
  ctx.lineTo(CX, CY + R * 0.42);
  ctx.stroke();
  for (var i = 1; i <= 10; i++) {
    var dd = i * mil;
    if (dd > R * 0.42) break;
    [
      [dd, 0],
      [-dd, 0],
      [0, dd],
      [0, -dd]
    ].forEach(function (p) {
      ctx.beginPath();
      ctx.arc(CX + p[0], CY + p[1], i % 5 === 0 ? 2.2 : 1.5, 0, 6.2832);
      ctx.fill();
    });
  }
  // range marks: where a bullet lands at 200/300/400 m with this rifle (drop from the real trajectory model)
  var g2 = 9.81 * 1.6 * cur.drop,
    mv = cur.mv,
    zeroLift = (g2 * (100 / mv)) / 2;
  ctx.font = '700 9px Tajawal, Tahoma, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  [200, 300, 400, 500].forEach(function (rng2, k) {
    var tt = rng2 / mv,
      drop = 0.5 * g2 * tt * tt - zeroLift * tt,
      ang = drop / rng2,
      py = (ang / (S.fov * D2R)) * CH;
    if (py < 4 || py > R * 0.95) return;
    var hw = 10 - k * 1.5;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(CX - hw, CY + py);
    ctx.lineTo(CX + hw, CY + py);
    ctx.stroke();
    ctx.fillText(ar(rng2 / 100), CX + hw + 3, CY + py);
  });
  ctx.fillStyle = '#e0603f';
  ctx.beginPath();
  ctx.arc(CX, CY, 1.6, 0, 6.2832);
  ctx.fill();
  ctx.restore();
}
function drawHip(sk) {
  var a = 1 - sk;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(CX - 12, CY);
  ctx.lineTo(CX - 4, CY);
  ctx.moveTo(CX + 4, CY);
  ctx.lineTo(CX + 12, CY);
  ctx.moveTo(CX, CY - 12);
  ctx.lineTo(CX, CY - 4);
  ctx.moveTo(CX, CY + 4);
  ctx.lineTo(CX, CY + 12);
  ctx.stroke();
  txt(
    save.aim === 'slider' ? 'ارفع الشريط اللي على اليسار لفتح المنظار' : 'اضغط «تصويب» لفتح المنظار',
    CX,
    CY + 92,
    13,
    '#ffffff',
    'center'
  );
  if (S.type === 'protect' && fuseMin() < 6)
    txt('مسلح يستعد لإطلاق النار!', CX, 120, 14, '#ff7a5a', 'center');
  ctx.restore();
}
function fuseMin() {
  var m = 99;
  S.targets.forEach(function (t) {
    if (t.alive && t.fuse !== undefined && t.fuse < m) m = t.fuse;
  });
  return m;
}
function txt(s, x, y, size, col, al) {
  ctx.font = '700 ' + size + 'px Tajawal, "Segoe UI", Tahoma, sans-serif';
  ctx.textAlign = al || 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.85)';
  ctx.shadowBlur = 3;
  ctx.fillStyle = col;
  ctx.fillText(s, x, y);
  ctx.shadowBlur = 0;
}
function nearest() {
  var best = null,
    bd = 1e9;
  S.targets.forEach(function (t) {
    if (!t.alive || t.cover) return;
    var by = Math.atan2(t.px - S.ox, -(t.pz - S.oz)),
      bp = Math.atan2(t.y + 1 - S.oy, Math.hypot(t.px - S.ox, t.pz - S.oz));
    var d = Math.abs(la(0, by - S.ay, 1)) + Math.abs(bp - S.ap);
    if (d < bd && d < S.fov * D2R * 0.6) {
      bd = d;
      best = t;
    }
  });
  return best;
}
function drawRadar() {
  var x0 = MINI_X,
    w = MINI_W,
    h = MINI_H;
  ctx.fillStyle = 'rgba(18,14,11,.72)';
  ctx.fillRect(x0, MINI_Y, w, h);
  ctx.strokeStyle = 'rgba(207,227,180,.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var i = 1; i < 6; i++) {
    var gx = x0 + (w * i) / 6;
    ctx.moveTo(gx, MINI_Y);
    ctx.lineTo(gx, MINI_Y + h);
  }
  ctx.stroke();
  ctx.strokeRect(x0 + 0.5, MINI_Y + 0.5, w - 1, h - 1);
  S.targets.forEach(function (t) {
    if (!t.alive) return;
    var col =
      t.kind === 'p'
        ? '#ff5a3c'
        : t.role === 'vip'
          ? '#4ccf6a'
          : t.role === 'host'
            ? '#f2c230'
            : t.role === 'target'
              ? '#9a9a9a'
              : t.kind === 'e'
                ? '#ff5a3c'
                : null;
    if (S.type === 'assassin' && t.kind === 'c') col = '#9a9a9a';
    if (!col) return;
    if (t.fuse !== undefined && t.fuse < 6 && Math.sin(S.rt * 12) > 0) col = '#ffffff';
    var bearing = la(0, Math.atan2(t.px - S.ox, -(t.pz - S.oz)) - S.yaw0, 1) / YAW_MAX / 2 + 0.5;
    var ry = MINI_Y + h - 4 - clamp((Math.hypot(t.px - S.ox, t.pz - S.oz) - 100) / 190, 0, 1) * (h - 8);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x0 + bearing * w, ry, 2.6, 0, 6.2832);
    ctx.fill();
  });
  var vx = x0 + ((S.yaw - S.yaw0) / YAW_MAX / 2 + 0.5) * w,
    vw = Math.max(8, ((S.fov * D2R * (CW / CH)) / YAW_MAX / 2) * w);
  ctx.strokeStyle = HUDC;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(vx - vw / 2, MINI_Y + 1, vw, h - 2);
}
function drawHud() {
  var L = 88,
    R = CW - 18;
  txt(S.duel ? 'الإسقاطات' : 'الأهداف', L, 60, 11, HUDD, 'left');
  txt(ar(S.killed) + '/' + ar(S.total), L, 82, 20, HUDC, 'left');
  if (false) txt('ضباب كثيف، انتظر انقشاعه', CX, 100, 12, '#f0ead8', 'center');
  txt('الوقت', R, 60, 11, HUDD, 'right');
  txt(clockText(S.time), R, 82, 20, S.time < 15 ? '#ff7a5a' : HUDC, 'right');
  if (S.duel) txt('سقطاتك ' + ar(duelDeaths(myPeer())), L, 104, 11, HUDD, 'left');
  else txt('الرصاص ' + ar(S.ammo), L, 104, 11, HUDD, 'left');
  for (var i = 0; i < (S.duel ? 0 : S.ammo); i++) {
    var rx = L + (i % 10) * 7,
      ry = 110 + Math.floor(i / 10) * 16;
    ctx.fillStyle = '#d6a64e';
    ctx.fillRect(rx, ry + 5, 4, 8);
    ctx.fillStyle = '#b87a38';
    ctx.fillRect(rx, ry + 1, 4, 5);
  }
  var cross = S.wind * Math.cos(S.ay),
    w = Math.round(cross * 10) / 10,
    len = clamp(Math.abs(w) * 5, 3, 22),
    dir = w >= 0 ? 1 : -1,
    wcx = R - 26,
    wcy = 118;
  txt('الرياح', R, 104, 11, HUDD, 'right');
  ctx.strokeStyle = HUDC;
  ctx.fillStyle = HUDC;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wcx - dir * len, wcy);
  ctx.lineTo(wcx + dir * len, wcy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(wcx + dir * (len + 7), wcy);
  ctx.lineTo(wcx + dir * len, wcy - 5);
  ctx.lineTo(wcx + dir * len, wcy + 5);
  ctx.fill();
  txt(ar(Math.abs(w).toFixed(1)) + ' م/ث', R, 138, 11, HUDC, 'right');
  var n = nearest();
  txt(
    S.scoped ? 'تكبير ×' + ar(Math.round(48 / S.fov)) : 'رؤية السلاح',
    MINI_X - 12,
    MINI_Y + 12,
    12,
    HUDC,
    'right'
  );
  txt(
    n ? 'المسافة ' + ar(n.d) + ' م' : 'المسافة —',
    MINI_X + MINI_W + 12,
    MINI_Y + 12,
    12,
    n ? '#ff8a6a' : HUDD,
    'left'
  );
  if (D.id === 'hard' && S.scoped) {
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(CX - 40, MINI_Y - 14, 80, 4);
    ctx.fillStyle = '#7fae5a';
    ctx.fillRect(CX - 40, MINI_Y - 14, (80 * S.breath) / cur.bmax, 4);
  }
}
function drawHitMarker() {
  if (S.hm <= 0) return;
  var a = Math.min(1, S.hm / 0.25),
    s = 7 + (0.45 - S.hm) * 10;
  ctx.strokeStyle = S.hmHead ? 'rgba(255,90,60,' + a + ')' : 'rgba(255,255,255,' + a + ')';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ].forEach(function (q) {
    ctx.moveTo(CX + q[0] * s, CY + q[1] * s);
    ctx.lineTo(CX + q[0] * (s + 7), CY + q[1] * (s + 7));
  });
  ctx.stroke();
}
function drawOverlay() {
  ctx.clearRect(0, 0, CW, CH);
  if (!S) return;
  if (BC) {
    var d = BC.b.alive ? Math.round(BC.b.dist) : Math.round(BC.res.target.d);
    txt(ar(d) + ' م', CX, CH - 70, 18, '#ffd36a', 'center');
    return;
  }
  var sk = clamp((40 - S.fov) / 22, 0, 1) * clamp((VM.ads - 0.75) / 0.2, 0, 1);
  if (sk > 0) drawScope(sk);
  if (sk < 1) drawHip(sk);
  if (S.duel) drawDuelFx();
  drawHitMarker();
  drawHud();
  drawRadar();
  if (S.banner) {
    var b = S.banner;
    ctx.font = '700 16px Tajawal, Tahoma, sans-serif';
    var bw = ctx.measureText(b.text).width + 30;
    ctx.fillStyle = 'rgba(14,10,8,.72)';
    ctx.fillRect(CX - bw / 2, 46, bw, 30);
    txt(b.text, CX, 61, 16, b.col, 'center');
  }
  if (MP.game) mpDrawTop();
}

/* ---------- input: drag to look, radar, zoom slider, fire, keys ---------- */
function logical(e) {
  var r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * CW, y: ((e.clientY - r.top) / r.height) * CH };
}
function fromRadar(x) {
  S.yaw = S.yaw0 + clamp(((x - MINI_X) / MINI_W - 0.5) * 2, -1, 1) * YAW_MAX;
  clampView();
}
cv.addEventListener('pointerdown', function (e) {
  if (!S || mode !== 'play' || BC) return;
  var p = logical(e);
  if (p.y >= MINI_Y - 8 && p.x >= MINI_X - 8 && p.x <= MINI_X + MINI_W + 8) {
    drag = 'radar';
    fromRadar(p.x);
  } else {
    drag = 'aim';
    lx = e.clientX;
    ly = e.clientY;
  }
  try {
    cv.setPointerCapture(e.pointerId);
  } catch (err) {}
});
cv.addEventListener('pointermove', function (e) {
  if (!drag || !S) return;
  if (drag === 'radar') {
    fromRadar(logical(e).x);
    return;
  }
  var k = (Math.min(S.fov, 24) * D2R * 1.15) / cv.getBoundingClientRect().height,
    dx = e.clientX - lx,
    dy = e.clientY - ly;
  S.yaw += dx * k;
  S.pitch -= dy * k;
  lx = e.clientX;
  ly = e.clientY;
  clampView();
  lookDX = clamp(dx * 0.05, -1, 1);
  lookDY = clamp(dy * 0.05, -1, 1);
});
['pointerup', 'pointercancel'].forEach(function (ev) {
  cv.addEventListener(ev, function () {
    drag = null;
  });
});
el('fire').addEventListener('pointerdown', function (e) {
  e.preventDefault();
  audio();
  fire();
});
var holdBtn = el('hold'),
  breathBtn = el('breath');
holdBtn.addEventListener('click', toggleAim);
breathBtn.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  if (S) S.brHold = true;
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
  breathBtn.addEventListener(ev, function () {
    if (S) S.brHold = false;
  });
});
function toggleAim() {
  if (S && mode === 'play') {
    S.scoped = !S.scoped;
    applyZoom();
  }
}
var zv = 0,
  zDrag = false;
function zoomRange() {
  return [4, Math.max(8, Math.min(25, 48 / ((cur ? cur.hold : 3.4) * 0.55)))];
}
function zoomFov(v) {
  var r = zoomRange();
  return 48 / (r[0] * Math.pow(r[1] / r[0], clamp(v, 0, 1)));
}
function applyZoom() {
  if (S && cur) {
    if (save.aim === 'slider') {
      S.scoped = zv > 0.04;
      S.zfov = zoomFov((zv - 0.04) / 0.96);
    } else S.zfov = zoomFov(zv);
  }
  var p = (zv * 100).toFixed(1);
  el('zFill').style.height = p + '%';
  el('zKnob').style.bottom = p + '%';
  el('zoom').setAttribute('aria-valuenow', Math.round(zv * 100));
}
function zoomReset() {
  if (!S) return;
  S.scoped = false;
  if (save.aim === 'slider') zv = 0;
  applyZoom();
}
function unscope() {
  if (!S) return;
  S.scoped = false;
  if (save.aim === 'slider') {
    zv = 0;
    applyZoom();
  }
}
function zFromY(y) {
  var r = el('zoom').querySelector('.ztrack').getBoundingClientRect();
  zv = clamp(1 - (y - r.top) / r.height, 0, 1);
  applyZoom();
}
el('zoom').addEventListener('pointerdown', function (e) {
  if (mode !== 'play' || BC || (S && S.duel && (S.cover || S.dead > 0))) return;
  e.preventDefault();
  zDrag = true;
  zFromY(e.clientY);
  try {
    el('zoom').setPointerCapture(e.pointerId);
  } catch (err) {}
});
el('zoom').addEventListener('pointermove', function (e) {
  if (zDrag) zFromY(e.clientY);
});
['pointerup', 'pointercancel'].forEach(function (ev) {
  el('zoom').addEventListener(ev, function () {
    zDrag = false;
  });
});
cv.addEventListener(
  'wheel',
  function (e) {
    if (SH.scr !== 'game' || mode !== 'play') return;
    e.preventDefault();
    zv = clamp(zv - e.deltaY * 0.0012, 0, 1);
    applyZoom();
  },
  { passive: false }
);
document.addEventListener('keydown', function (e) {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (SH.scr !== 'game') return;
  if (e.code === 'Space') {
    e.preventDefault();
    audio();
    fire();
  }
  if (e.code === 'KeyZ' && !e.repeat) {
    if (save.aim === 'slider') {
      zv = zv > 0.04 ? 0 : 0.35;
      applyZoom();
    } else toggleAim();
  }
  if (e.key === 'Shift' && S) S.brHold = true;
  var k = (S ? S.fov : 50) * D2R * 0.02;
  if (S && e.code === 'ArrowLeft') {
    S.yaw -= k;
    clampView();
  }
  if (S && e.code === 'ArrowRight') {
    S.yaw += k;
    clampView();
  }
  if (S && e.code === 'ArrowUp') {
    S.pitch += k;
    clampView();
  }
  if (S && e.code === 'ArrowDown') {
    S.pitch -= k;
    clampView();
  }
});
document.addEventListener('keyup', function (e) {
  if (e.key === 'Shift' && S) S.brHold = false;
});

/* ---------- control state shown each frame ---------- */
var hudCache = '',
  holdCache = '',
  duelCache = null,
  zCache = '';
function hud() {
  var su = suitById[save.suit] || SUITS[0];
  var hs = level + '|' + save.coins + '|' + save.sel + '|' + save.suit;
  if (hs !== hudCache) {
    hudCache = hs;
    el('coins').textContent = ar(save.coins);
    el('hubCoins').textContent = ar(save.coins);
    el('rank').textContent = RANKS[Math.min(RANKS.length - 1, Math.floor((save.level - 1) / 3))];
    el('lvl').textContent = 'المهمة ' + ar(level) + ' · ' + wById[save.sel].short + ' · ' + su[save.gender].n;
  }
  var hb = save.aim !== 'button';
  if (holdBtn.hidden !== hb) holdBtn.hidden = hb;
  var zl = S && S.scoped ? '×' + ar(Math.round(48 / (S.zfov || S.fov))) : '—';
  if (zl !== zCache) {
    zCache = zl;
    el('zLbl').textContent = zl;
  }
  var on = !!S && S.scoped,
    h2 = on ? 'فك التصويب' : 'تصويب';
  if (h2 !== holdCache) {
    holdCache = h2;
    el('holdTxt').textContent = h2;
    holdBtn.classList.toggle('on', on);
  }
  var du = !!(S && S.duel && MP.game);
  if (du !== duelCache) {
    duelCache = du;
    el('cover').hidden = !du;
    el('move').hidden = !du;
  }
  if (du) el('cover').classList.toggle('on', !!S.cover);
  var qv = !(MP.game && MP.st === 'play');
  if (el('mpQuit').hidden !== qv) el('mpQuit').hidden = qv;
  var hardOn = D.id === 'hard' && !du;
  if (hardOn === breathBtn.hidden) breathBtn.hidden = !hardOn;
  if (S && hardOn) el('brBar').style.width = (S.breath / cur.bmax) * 100 + '%';
}

/* ---------- main loop: game, menu backdrop, adaptive resolution ---------- */
var accT = 0,
  accF = 0,
  fpsV = 60,
  cool = 0,
  fpsTop = 55,
  lowN = 0,
  hiN = 0;
function loop(ts) {
  var dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  accT += dt;
  accF++;
  cool -= dt;
  if (accT >= 1) {
    fpsV = Math.round(accF / accT);
    accT = 0;
    accF = 0;
    if (SH.scr === 'game' && mode === 'play') fpsTop = Math.min(165, Math.max(fpsTop * 0.995, fpsV));
    if (save.fpsOn) el('fps').textContent = fpsV + ' FPS · ' + Math.round(rs * 100) + '%';
    if (save.auto && SH.scr === 'game' && mode === 'play' && cool <= 0) {
      if (fpsV < fpsTop * 0.78) {
        lowN++;
        hiN = 0;
      } else if (fpsV >= fpsTop * 0.95) {
        hiN++;
        lowN = 0;
      } else {
        lowN = 0;
        hiN = 0;
      }
      if (lowN >= 2 && rs > 0.6) {
        rs = Math.max(0.6, Math.round((rs - 0.1) * 10) / 10);
        setRes();
        cool = 4;
        lowN = 0;
      } else if (hiN >= 6 && rs < 1) {
        rs = Math.min(1, Math.round((rs + 0.1) * 10) / 10);
        setRes();
        cool = 8;
        hiN = 0;
      }
    }
  }
  if (!arsenalOpen) {
    var game = SH.scr === 'game';
    if (game && mode === 'play' && S && !(MP.game && ts < MP.game.t0)) update(dt);
    if (save.region === 'south') {
      fogK = 0.5 + 0.5 * Math.sin((Date.now() / 1000) * 0.035 + 1.2);
      scene.fog.density = baseFog * (1 + (1 - fogK) * 0.3);
    }
    if (S) {
      if (game && BC) updateBulletCam(dt);
      else if (game) {
        camera.fov = S.fov;
        camera.position.set(S.ox, S.oy, S.oz);
        camera.rotation.set(S.ap, -S.ay, 0);
      } else {
        var tt = ts / 1000;
        camera.fov = 48;
        camera.position.set(0, CAMY, 0);
        camera.rotation.set(-0.15 + Math.sin(tt * 0.11) * 0.025, -Math.sin(tt * 0.045) * 0.7, 0);
      }
      camera.updateProjectionMatrix();
      if (composer) composer.render();
      else renderer.render(scene, camera);
      if (game && vm.visible) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(vmScene, vmCam);
        renderer.autoClear = true;
      }
    }
    if (game) drawOverlay();
    else ctx.clearRect(0, 0, CW, CH);
  } else if (SH.scr === 'arsenal') gun3dFrame(dt);
  mpFlush(ts);
  hud();
  requestAnimationFrame(loop);
}

/* ---------- screens and menus ---------- */
SH.onShow = function (n) {
  arsenalOpen = !(n === 'game' || n === 'home' || n === 'camp' || n === 'mp');
  G3.on = n === 'arsenal';
  if (n !== 'game') windOn(false);
  fit();
};
SH.goHome = function () {
  mode = 'menu';
  SH.show('home');
  refreshAvatar();
};
function menuUI() {
  markSeg('diffSeg', 'data-d', save.diff);
  markSeg('regSeg', 'data-r', save.region);
  el('diffNote').textContent = DIFFS[save.diff].note;
  el('mNum').textContent = 'المهمة ' + ar(level);
  el('mPrev').disabled = level <= 1;
  el('mNext').disabled = level >= save.level;
  var mi = missionInfo(level);
  el('brief').innerHTML = '';
  var b = document.createElement('b');
  b.textContent = REGN[save.region] + ' · ' + mi.t;
  el('brief').appendChild(b);
  el('brief').appendChild(document.createTextNode(mi.s));
  var em = document.createElement('em');
  em.textContent = mi.o;
  el('brief').appendChild(em);
}
function startMission() {
  el('goBtn').disabled = true;
  el('goBtn').textContent = 'يجهز العالم…';
  setTimeout(function () {
    reset();
    mode = 'play';
    overlay.hidden = true;
    SH.show('game');
    audio();
    windOn(true);
    el('goBtn').disabled = false;
    el('goBtn').textContent = 'ابدأ المهمة';
  }, 30);
}
el('goBtn').addEventListener('click', startMission);
el('resGo').addEventListener('click', startMission);
el('resMenu').addEventListener('click', function () {
  mode = 'menu';
  overlay.hidden = true;
  SH.show('camp');
  menuUI();
});
el('campBtn').addEventListener('click', function () {
  SH.show('camp');
  menuUI();
});
el('campBack').addEventListener('click', function () {
  SH.show('home');
});
el('hubBtn').addEventListener('click', function () {
  SH.show('hub');
});
el('mPrev').addEventListener('click', function () {
  if (level > 1) {
    level--;
    menuUI();
  }
});
el('mNext').addEventListener('click', function () {
  if (level < save.level) {
    level++;
    menuUI();
  }
});
el('regSeg').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  save.region = b.getAttribute('data-r');
  persist();
  reset();
  menuUI();
});
el('diffSeg').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  save.diff = b.getAttribute('data-d');
  D = DIFFS[save.diff];
  persist();
  menuUI();
});
el('pauseBtn').addEventListener('click', function () {
  if (MP.game) {
    el('pause').hidden = false;
    return;
  }
  if (mode === 'play') {
    mode = 'pause';
    el('pause').hidden = false;
    windOn(false);
  }
});
el('resume').addEventListener('click', function () {
  el('pause').hidden = true;
  if (mode === 'pause') {
    mode = 'play';
    windOn(true);
  }
});
el('quit').addEventListener('click', function () {
  el('pause').hidden = true;
  if (MP.game) {
    MP.game.end = true;
    mpShowResults();
    return;
  }
  mode = 'menu';
  BC = null;
  el('stage').classList.remove('bcam');
  SH.show('camp');
  menuUI();
});
(function () {
  var de = document.documentElement,
    ok = !!(de.requestFullscreen || de.webkitRequestFullscreen);
  el('fsBtn').hidden = !ok;
  el('fsBtn').addEventListener('click', function () {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      return;
    }
    try {
      var pr = (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
      if (pr && pr.then)
        pr.then(function () {
          try {
            window.screen.orientation.lock('landscape').catch(function () {});
          } catch (e) {}
        }).catch(function () {
          el('fsBtn').hidden = true;
        });
    } catch (e) {
      el('fsBtn').hidden = true;
    }
  });
})();

/* ---------- arsenal: character, weapons (3D turntable), settings ---------- */
var tab = 'c',
  view = save.sel,
  cs = save.suit,
  arMsg = '',
  cMsg = '';
function setArsenal(open, t) {
  if (open) {
    SH.show('arsenal');
    tab = t || 'c';
    view = save.sel;
    cs = save.suit;
    arMsg = '';
    cMsg = '';
    renderArsenal();
  } else {
    SH.show('home');
    refreshAvatar();
  }
}
el('arBtn').addEventListener('click', function () {
  setArsenal(true, 'c');
});
el('setBtn').addEventListener('click', function () {
  setArsenal(true, 's');
});
el('aBack').addEventListener('click', function () {
  setArsenal(false);
});
['C', 'W', 'S'].forEach(function (k) {
  el('tab' + k).addEventListener('click', function () {
    tab = k.toLowerCase();
    renderArsenal();
  });
});
function refreshAvatar() {
  el('avatar').innerHTML = charSVG(myLook(), '74 42 72 84');
}
function renderArsenal() {
  ['c', 'w', 's'].forEach(function (k) {
    el('tab' + k.toUpperCase()).classList.toggle('on', tab === k);
    el('pane' + k.toUpperCase()).hidden = tab !== k;
  });
  G3.on = tab === 'w';
  if (tab === 'w') renderWeapons();
  else if (tab === 'c') renderChar();
  else renderSettings();
}
function bar(label, v) {
  return (
    '<div class="sr"><span>' +
    label +
    '</span><div class="trk"><i style="width:' +
    Math.round(clamp(v, 0.04, 1) * 100) +
    '%"></i></div></div>'
  );
}
function renderWeapons() {
  var w = wById[view],
    l = save.lv[view],
    st = curStats(view);
  el('wList').innerHTML = WEAPONS.map(function (x) {
    return (
      '<button type="button" class="wcard' +
      (x.id === view ? ' on' : '') +
      '" data-w="' +
      x.id +
      '"><b>' +
      x.short +
      '</b><em>' +
      (save.sel === x.id ? 'مجهّز' : save.owned[x.id] ? 'مملوك' : ar(x.price) + ' عملة') +
      '</em></button>'
    );
  }).join('');
  el('wName').textContent = w.name + ' · ' + w.ar;
  el('wDesc').textContent = w.desc;
  var specs = [
    ['العيار', w.cal],
    ['الآلية', w.act],
    ['المخزن', w.mag],
    ['الوزن', w.wt],
    ['المدى الفعال', w.rng],
    ['سرعة الطلقة', ar(MV[w.id]) + ' م/ث']
  ];
  el('wSpecs').innerHTML = specs
    .map(function (p) {
      return '<div class="chip"><span>' + p[0] + '</span><b>' + p[1] + '</b></div>';
    })
    .join('');
  el('wStats').innerHTML =
    bar('التكبير', (9.5 - st.fov) / 5) +
    bar('الثبات', 1.4 - st.sway) +
    bar('مقاومة الريح', 1.4 - st.wind) +
    bar('قلة السقوط', 1.4 - st.drop) +
    bar('سرعة الإطلاق', 1.6 - st.cd);
  el('wParts').innerHTML = PARTS.map(function (p) {
    var lv2 = l[p.id],
      max = lv2 >= 3,
      cost = max ? 0 : partCost(p, w, lv2),
      pips = '';
    for (var i = 0; i < 3; i++) pips += '<s class="' + (i < lv2 ? 'f' : '') + '"></s>';
    return (
      '<div class="pr"><b>' +
      p.name +
      '<span class="pips">' +
      pips +
      '</span></b><button type="button" data-p="' +
      p.id +
      '"' +
      (max || !save.owned[view] || save.coins < cost ? ' disabled' : '') +
      '>' +
      (max ? 'مكتمل' : 'ترقية ' + ar(cost)) +
      '</button><small>' +
      p.desc +
      '</small></div>'
    );
  }).join('');
  var a = el('wAct');
  if (save.sel === view) {
    a.textContent = 'السلاح مجهّز';
    a.disabled = true;
    a.dataset.act = '';
  } else if (save.owned[view]) {
    a.textContent = 'تجهيز السلاح';
    a.disabled = false;
    a.dataset.act = 'eq';
  } else {
    a.textContent = 'شراء ' + ar(w.price) + ' عملة';
    a.disabled = save.coins < w.price;
    a.dataset.act = 'buy';
  }
  el('aMsg').textContent = arMsg;
  gun3dShow(w);
}
el('paneW').addEventListener('click', function (e) {
  var t = e.target.closest('button');
  if (!t || t.disabled) return;
  if (t.dataset.w) {
    view = t.dataset.w;
    arMsg = '';
  } else if (t.dataset.p) {
    var w = wById[view],
      p = PARTS.filter(function (x) {
        return x.id === t.dataset.p;
      })[0],
      lv2 = save.lv[view][p.id],
      cost = partCost(p, w, lv2);
    if (save.coins >= cost && lv2 < 3) {
      save.coins -= cost;
      save.lv[view][p.id]++;
      arMsg = 'تمت ترقية ' + p.name;
      persist();
    }
  } else if (t.id === 'wAct') {
    var w2 = wById[view];
    if (t.dataset.act === 'eq') {
      save.sel = view;
      arMsg = 'جهّزت ' + w2.short;
      persist();
    } else if (t.dataset.act === 'buy' && save.coins >= w2.price) {
      save.coins -= w2.price;
      save.owned[view] = true;
      save.sel = view;
      arMsg = 'اشتريت ' + w2.short + ' وجهّزته';
      persist();
    }
  }
  renderArsenal();
});
function renderChar() {
  var g = save.gender,
    su = suitById[cs] || SUITS[0];
  el('chPrev').innerHTML = charSVG({
    g: g,
    skin: save.skin,
    suit: cs,
    head: save.head,
    lithma: save.lithma,
    rolled: save.rolled
  });
  markSeg('gSeg', 'data-g', g);
  markSeg('skSeg', 'data-k', save.skin);
  markSeg('hdSeg', 'data-h', save.head);
  el('suitList').innerHTML = SUITS.map(function (s) {
    var lk = { g: g, skin: save.skin, suit: s.id, head: save.head, lithma: save.lithma, rolled: save.rolled };
    return (
      '<button type="button" class="ccard' +
      (cs === s.id ? ' on' : '') +
      '" data-s="' +
      s.id +
      '">' +
      charSVG(lk, '30 20 160 300') +
      '<b>' +
      s[g].n +
      '</b><em>' +
      (save.suit === s.id ? 'مرتدى' : save.suits[s.id] ? 'مملوك' : ar(s.price) + ' عملة') +
      '</em></button>'
    );
  }).join('');
  el('chPerk').textContent = su[g].n + ': ' + su.perk;
  var sa = el('suitAct');
  if (save.suit === cs) {
    sa.textContent = 'الزي مرتدى';
    sa.disabled = true;
    sa.dataset.act = '';
  } else if (save.suits[cs]) {
    sa.textContent = 'ارتداء الزي';
    sa.disabled = false;
    sa.dataset.act = 'wear';
  } else {
    sa.textContent = 'شراء الزي ' + ar(su.price);
    sa.disabled = save.coins < su.price;
    sa.dataset.act = 'buy';
  }
  el('headBox').hidden = g !== 'm';
  var lb = el('lithBtn');
  lb.textContent = 'اللثمة: ' + (save.lithma ? 'ملثّم' : 'بدون');
  lb.classList.toggle('off', !save.lithma);
  var canRoll = g === 'm' && (su.m.k === 'thobe' || su.m.k === 'winter'),
    rb = el('rollBtn');
  rb.hidden = g !== 'm';
  rb.disabled = !canRoll;
  rb.classList.toggle('off', !save.rolled);
  rb.textContent = canRoll ? 'الكم: ' + (save.rolled ? 'مشمّر' : 'عادي') : 'التشمير للثوب فقط';
  el('cMsg').textContent = cMsg;
}
function lookChanged() {
  refreshAvatar();
  if (MP.nr) pres({ lk: { g: save.gender, k: save.skin, s: save.suit, h: save.head } });
}
el('paneC').addEventListener('click', function (e) {
  var t = e.target.closest('button');
  if (!t || t.disabled) return;
  if (t.dataset.g) {
    save.gender = t.dataset.g;
    persist();
  } else if (t.dataset.k) {
    save.skin = t.dataset.k;
    persist();
  } else if (t.dataset.h) {
    save.head = t.dataset.h;
    persist();
  } else if (t.dataset.s) {
    cs = t.dataset.s;
    cMsg = '';
  } else if (t.id === 'lithBtn') {
    save.lithma = !save.lithma;
    persist();
  } else if (t.id === 'rollBtn') {
    save.rolled = !save.rolled;
    persist();
  } else if (t.id === 'suitAct') {
    var s = suitById[cs],
      nm = s[save.gender].n;
    if (t.dataset.act === 'wear' && save.suits[cs]) {
      save.suit = cs;
      cMsg = 'لبست ' + nm;
      persist();
    } else if (t.dataset.act === 'buy') {
      if (save.coins >= s.price) {
        save.coins -= s.price;
        save.suits[cs] = true;
        save.suit = cs;
        cMsg = 'اشتريت ' + nm + ' ولبسته';
        persist();
      } else cMsg = 'رصيدك لا يكفي';
    }
  }
  lookChanged();
  renderArsenal();
});
function renderSettings() {
  markSeg('qSeg', 'data-q', save.q);
  markSeg('eSeg', 'data-e', save.env);
  markSeg('bSeg', 'data-b', save.bright);
  markSeg('aimSeg', 'data-a', save.aim);
  markSeg('dlSeg', 'data-l', save.dialect);
  markSeg('vcSeg', 'data-v', save.voice);
  markSeg('bcSeg', 'data-c', save.bcam ? 1 : 0);
  markSeg('sfxSeg', 'data-x', save.sfx ? 1 : 0);
  el('qNote').textContent = QUAL[save.q].note;
  el('aimNote').textContent =
    save.aim === 'slider'
      ? 'ترفع الشريط اللي على يسار الشاشة فيفتح المنظار ويقرّب، وتنزله لتحت خالص فترجع تشوف سلاحك.'
      : 'زر «تصويب» يفتح المنظار ويقفله، والشريط للتقريب والتبعيد بس.';
  var vn;
  if (save.voice === 'off') vn = 'العبارات تطلع مكتوبة بس.';
  else if (!window.speechSynthesis) vn = 'متصفحك ما يدعم الصوت، فالعبارات تطلع مكتوبة.';
  else if (!voices.length) vn = 'ما لقيت صوت عربي في جهازك، فالعبارات بتطلع مكتوبة.';
  else {
    var pv = pickVoice();
    vn = pv.exact
      ? 'الصوت المستخدم: ' + pv.v.name + '.'
      : 'ما لقيت صوت ' +
        (save.voice === 'f' ? 'حرمة' : 'رجل') +
        ' عربي في جهازك، فبنستخدم ' +
        pv.v.name +
        '.';
  }
  el('vcNote').textContent = vn;
  el('autoBtn').textContent = 'الدقة التلقائية: ' + (save.auto ? 'تشغيل' : 'إيقاف');
  el('fpsBtn').textContent = 'عدّاد الإطارات: ' + (save.fpsOn ? 'ظاهر' : 'مخفي');
}
el('paneS').addEventListener('click', function (e) {
  var t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.q) {
    save.q = t.dataset.q;
    persist();
    applyQuality();
  } else if (t.dataset.e) {
    save.env = t.dataset.e;
    persist();
    applyEnv(save.env);
  } else if (t.dataset.b) {
    save.bright = +t.dataset.b;
    persist();
    applyExposure();
  } else if (t.dataset.a) {
    save.aim = t.dataset.a;
    persist();
  } else if (t.dataset.l) {
    save.dialect = t.dataset.l;
    persist();
  } else if (t.dataset.v) {
    save.voice = t.dataset.v;
    persist();
    if (save.voice !== 'off') speak((PHR[save.dialect] || PHR.najdi).kill[0]);
  } else if (t.dataset.c) {
    save.bcam = t.dataset.c === '1';
    persist();
  } else if (t.dataset.x) {
    save.sfx = t.dataset.x === '1';
    persist();
    if (!save.sfx) windOn(false);
  } else if (t.id === 'autoBtn') {
    save.auto = !save.auto;
    if (!save.auto) {
      rs = 1;
      setRes();
    }
    persist();
  } else if (t.id === 'fpsBtn') {
    save.fpsOn = !save.fpsOn;
    el('fps').hidden = !save.fpsOn;
    persist();
  }
  renderArsenal();
});

/* ---------- multiplayer: rooms over live presence (no extra permissions needed) ---------- */
var MP = {
  st: 'off',
  code: '',
  host: false,
  mode: 'duel',
  nr: null,
  peers: [],
  meP: '',
  game: null,
  out: {},
  lastSend: 0,
  seenGo: '',
  q: 0,
  shots: [],
  kb: {},
  fired: 0,
  hits: 0,
  hp: 2,
  seenQ: {},
  seenSc: {},
  saved: null
};
var MPN = { duel: 'مواجهة الأبراج', race: 'سباق العشر' };
var MPNOTE = {
  duel: 'من ٢ إلى ٦ لاعبين، كل واحد في مبنى. تنقّل بين ثلاث نقاط واحتمِ خلف الجدار. الرأس يسقط فوراً والجسم يحتاج طلقتين. الأكثر إسقاطاً بعد ٥ دقائق، أو أول من يوصل ١٥، يفوز.',
  race: 'نفس العشر مهمات للجميع. الفشل يعيد المهمة مع عقوبة ١٥ ثانية، وكل إصابة رأس تخصم ثانيتين. الأسرع يفوز.'
};
var roomP = null;
/* ---------- web build: same room API over direct phone-to-phone links (PeerJS), no account needed ---------- */
var PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise(function (res, rej) {
    var s = document.createElement('script');
    s.src = PEERJS_URL;
    s.async = true;
    s.onload = function () {
      window.Peer ? res(window.Peer) : rej(new Error('peerjs'));
    };
    s.onerror = function () {
      rej(new Error('peerjs'));
    };
    document.head.appendChild(s);
  });
}
function p2pJoin(Peer, name) {
  return new Promise(function (resolve, reject) {
    var hubId = ('shilla-' + name + '-hub').replace(/[^a-zA-Z0-9_-]/g, '');
    var mine = {},
      others = {},
      hs = [],
      errH = [],
      myId = '',
      isHub = false,
      conns = {},
      hubConn = null,
      peer = null,
      settled = false,
      left = false;
    var timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        try {
          peer && peer.destroy();
        } catch (e) {}
        reject(new Error('timeout'));
      }
    }, 15000);
    function done() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(nr);
    }
    function fail(e) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try {
          peer && peer.destroy();
        } catch (x) {}
        reject(e);
      } else if (!left)
        errH.forEach(function (f) {
          try {
            f(e);
          } catch (x) {}
        });
    }
    function snap() {
      var arr = [
        {
          peer: myId,
          by: null,
          isMe: true,
          sameTab: true,
          kind: 'viewer',
          guest: false,
          presence: Object.freeze(JSON.parse(JSON.stringify(mine))),
          updatedAt: Date.now()
        }
      ];
      Object.keys(others).forEach(function (k) {
        arr.push({
          peer: k,
          by: null,
          isMe: false,
          sameTab: false,
          kind: 'viewer',
          guest: false,
          presence: Object.freeze(others[k]),
          updatedAt: Date.now()
        });
      });
      return arr;
    }
    var fq = false;
    function fire() {
      if (fq) return;
      fq = true;
      setTimeout(function () {
        fq = false;
        var s = snap();
        hs.forEach(function (h) {
          try {
            h({ peers: s, joined: [], left: [], updated: [] });
          } catch (e) {}
        });
      }, 0);
    }
    function bcast(msg, skip) {
      Object.keys(conns).forEach(function (k) {
        if (k !== skip && conns[k].open) {
          try {
            conns[k].send(msg);
          } catch (e) {}
        }
      });
    }
    function allPres() {
      var a = {};
      a[myId] = mine;
      Object.keys(others).forEach(function (k) {
        a[k] = others[k];
      });
      return a;
    }
    function asHub() {
      isHub = true;
      peer.on('connection', function (c) {
        c.on('open', function () {
          conns[c.peer] = c;
          try {
            c.send({ t: 'all', all: allPres() });
          } catch (e) {}
        });
        c.on('data', function (d) {
          if (d && d.t === 'p') {
            others[c.peer] = d.pres || {};
            bcast({ t: 'p', peer: c.peer, pres: others[c.peer] }, c.peer);
            fire();
          }
        });
        var gone = function () {
          if (!conns[c.peer] && !others[c.peer]) return;
          delete conns[c.peer];
          delete others[c.peer];
          bcast({ t: 'bye', peer: c.peer });
          fire();
        };
        c.on('close', gone);
        c.on('error', gone);
      });
      peer.on('disconnected', function () {
        try {
          peer.reconnect();
        } catch (e) {}
      });
      done();
    }
    function asClient(P2) {
      peer = P2;
      hubConn = peer.connect(hubId, { reliable: true });
      hubConn.on('open', function () {
        try {
          hubConn.send({ t: 'p', pres: mine });
        } catch (e) {}
        done();
        fire();
      });
      hubConn.on('data', function (d) {
        if (!d) return;
        if (d.t === 'all') {
          others = {};
          Object.keys(d.all || {}).forEach(function (k) {
            if (k !== myId) others[k] = d.all[k];
          });
        } else if (d.t === 'p' && d.peer !== myId) others[d.peer] = d.pres || {};
        else if (d.t === 'bye') delete others[d.peer];
        fire();
      });
      hubConn.on('close', function () {
        fail(new Error('hub closed'));
      });
      hubConn.on('error', function (e) {
        fail(e);
      });
    }
    var opts = {
      debug: 0,
      config: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
      }
    };
    peer = new Peer(hubId, opts);
    peer.on('open', function (id) {
      myId = id;
      asHub();
    });
    peer.on('error', function (e) {
      if (e && e.type === 'unavailable-id' && !settled && !isHub) {
        try {
          peer.destroy();
        } catch (x) {}
        var p2 = new Peer(opts);
        p2.on('open', function (id) {
          myId = id;
          asClient(p2);
        });
        p2.on('error', function (e2) {
          fail(e2);
        });
      } else if (e && e.type === 'peer-unavailable') {
        /* a client vanished; ignore */
      } else fail(e);
    });
    var nr = {
      name: name,
      emit: function () {
        return Promise.resolve();
      },
      on: function () {
        return function () {};
      },
      presence: function (patch) {
        for (var k in patch) {
          if (patch[k] === null) delete mine[k];
          else mine[k] = JSON.parse(JSON.stringify(patch[k]));
        }
        if (isHub) bcast({ t: 'p', peer: myId, pres: mine });
        else if (hubConn && hubConn.open) {
          try {
            hubConn.send({ t: 'p', pres: mine });
          } catch (e) {}
        }
        fire();
        return Promise.resolve();
      },
      peers: function () {
        return snap();
      },
      onPeers: function (h, onErr) {
        hs.push(h);
        if (onErr) errH.push(onErr);
        fire();
        return function () {
          hs = hs.filter(function (x) {
            return x !== h;
          });
        };
      },
      connected: function () {
        return isHub ? !peer.disconnected : !!(hubConn && hubConn.open);
      },
      onConnection: function () {
        return function () {};
      },
      leave: function () {
        left = true;
        try {
          peer.destroy();
        } catch (e) {}
        return Promise.resolve();
      }
    };
  });
}
function p2pRoom() {
  return loadPeerJS().then(function (Peer) {
    return {
      join: function (name) {
        return p2pJoin(Peer, name);
      }
    };
  });
}

function getRoom() {
  if (!roomP)
    roomP =
      window.claude && typeof window.claude.use === 'function'
        ? window.claude.use('room').catch(function () {
            return null;
          })
        : p2pRoom().catch(function () {
            roomP = null;
            return null;
          });
  return roomP;
}
function mpMsg(t) {
  el('mpMsg').textContent = t;
  el('mpMsg2').textContent = t;
}
function pres(patch) {
  for (var k in patch) MP.out[k] = patch[k];
}
function mpFlush(now) {
  if (!MP.nr) return;
  var ks = Object.keys(MP.out);
  if (!ks.length || now - MP.lastSend < 110) return;
  var o = MP.out;
  MP.out = {};
  MP.lastSend = now;
  MP.nr.presence(o).catch(function () {});
}
function peerP(p) {
  return (p && p.presence) || {};
}
function myPeer() {
  for (var i = 0; i < MP.peers.length; i++)
    if (MP.peers[i].isMe && MP.peers[i].sameTab) return MP.peers[i].peer;
  return MP.meP;
}
function players() {
  return MP.peers.filter(function (p) {
    return p.kind === 'viewer' && peerP(p).nm;
  });
}
function hostPeer() {
  var h = MP.peers.filter(function (p) {
    return peerP(p).host === true && peerP(p).nm;
  });
  return h[0] || null;
}
function pname(p) {
  var n = String(peerP(p).nm || '').slice(0, 14);
  return n || 'لاعب';
}
function byPeer(id) {
  for (var i = 0; i < MP.peers.length; i++) if (MP.peers[i].peer === id) return MP.peers[i];
  return null;
}
function latin(t) {
  return String(t)
    .replace(/[٠-٩]/g, function (d) {
      return AR.indexOf(d);
    })
    .replace(/\D/g, '');
}

function mpView() {
  el('mpHome').hidden = MP.st !== 'off';
  el('mpRoom').hidden = MP.st !== 'lobby';
  el('mpRes').hidden = MP.st !== 'res';
  Array.prototype.forEach.call(el('mpMode').children, function (b) {
    b.classList.toggle('on', b.getAttribute('data-m') === MP.mode);
  });
  el('mpModeNote').textContent = MPNOTE[MP.mode];
  if (MP.st === 'lobby') mpRoomUI();
  if (MP.st === 'res') mpResults();
}
function mpRoomUI() {
  var h = hostPeer(),
    ps = players(),
    me = myPeer(),
    ul = el('mpList');
  if (!MP.host && h && MPN[peerP(h).mode]) MP.mode = peerP(h).mode;
  el('mpCodeBig').textContent = ar(MP.code);
  el('mpRoomMode').textContent =
    MPN[MP.mode] +
    ' · ' +
    REGN[h ? (peerP(h).reg === 'city' ? 'city' : 'south') : save.region] +
    '. ' +
    MPNOTE[MP.mode];
  ul.innerHTML = '';
  if (!ps.length) {
    var w = document.createElement('li');
    w.textContent = 'جارٍ الاتصال…';
    ul.appendChild(w);
  }
  ps.slice(0, 10).forEach(function (p) {
    var li = document.createElement('li');
    li.textContent = pname(p) + (peerP(p).host ? ' · المضيف' : '') + (p.peer === me ? ' (أنت)' : '');
    if (p.peer === me) li.className = 'me';
    ul.appendChild(li);
  });
  var sb = el('mpStart'),
    n = ps.length;
  sb.hidden = !MP.host;
  el('mpWait').hidden = MP.host;
  sb.disabled = n < 2;
  sb.textContent = n < 2 ? 'بانتظار لاعب ثاني على الأقل' : 'ابدأ الجولة (' + ar(Math.min(6, n)) + ' لاعبين)';
}
function mpEnter(code, host) {
  var nm = el('mpName').value.trim().slice(0, 12);
  if (!nm) {
    mpMsg('اكتب اسمك أولاً.');
    return;
  }
  if (!/^\d{4}$/.test(code)) {
    mpMsg('الكود لازم يكون ٤ أرقام.');
    return;
  }
  try {
    localStorage.setItem('ayn-mp-name', nm);
  } catch (e) {}
  mpMsg('جارٍ الاتصال…');
  getRoom()
    .then(function (room) {
      if (!room) {
        mpMsg(
          window.claude
            ? 'اللعب الجماعي ما يشتغل هنا. افتح اللعبة من claude.ai وأنت مسجل دخول، وتأكد إن صاحب اللعبة دعاك لها.'
            : 'تعذّر تحميل خدمة الاتصال. تأكد من الإنترنت وحاول مرة ثانية.'
        );
        return;
      }
      return room.join('ayn-' + code).then(function (nr) {
        if (MP.nr) MP.nr.leave().catch(function () {});
        MP.nr = nr;
        MP.code = code;
        MP.host = host;
        MP.st = 'lobby';
        MP.peers = nr.peers().slice();
        nr.onPeers(
          function (ch) {
            MP.peers = ch.peers.slice();
            var me = MP.peers.filter(function (p) {
              return p.isMe && p.sameTab;
            })[0];
            if (me) MP.meP = me.peer;
            mpPeers();
          },
          function () {
            mpMsg('انقطع الاتصال بالغرفة. ارجع وادخل بالكود مرة ثانية.');
          }
        );
        var h = hostPeer();
        MP.seenGo = h && peerP(h).go ? String(peerP(h).go.id) : '';
        pres({
          nm: nm,
          host: host,
          mode: host ? MP.mode : null,
          reg: host ? save.region : null,
          st: 'lobby',
          lk: { g: save.gender, k: save.skin, s: save.suit, h: save.head }
        });
        MP.lastSend = 0;
        mpMsg('');
        mpView();
      });
    })
    .catch(function (e) {
      mpMsg(
        e && e.code === 'not_permitted'
          ? 'ما عندك صلاحية تدخل الغرف هنا. اطلب من صاحب اللعبة يدعوك لها.'
          : window.claude
            ? 'تعذّر الدخول للغرفة. حاول مرة ثانية.'
            : 'تعذّر الاتصال بالغرفة. تأكد من الإنترنت، وإن كان الكود صحيح، وحاول مرة ثانية.'
      );
    });
}
function mpRestore() {
  if (MP.saved) {
    save.region = MP.saved.region;
    save.diff = MP.saved.diff;
    level = MP.saved.level;
    MP.saved = null;
  }
  D = DIFFS[save.diff];
}
function mpLeave() {
  if (MP.nr) MP.nr.leave().catch(function () {});
  MP.nr = null;
  MP.st = 'off';
  MP.peers = [];
  MP.out = {};
  if (MP.game) {
    MP.game = null;
    mpRestore();
    reset();
    mode = 'menu';
    menuUI();
  }
  mpView();
}
function mpPeers() {
  if (MP.st === 'lobby') mpRoomUI();
  if (MP.st === 'res') mpResults();
  var h = hostPeer(),
    go = h && peerP(h).go;
  if (go && go.id && String(go.id) !== MP.seenGo && (MP.st === 'lobby' || MP.st === 'res')) {
    MP.seenGo = String(go.id);
    mpStartGame(go);
  }
}
function mpStartGame(go) {
  var me = myPeer(),
    roster = Array.isArray(go.roster) ? go.roster.slice(0, 6).map(String) : [],
    idx = roster.indexOf(me);
  if (idx < 0 || roster.length < 2) {
    mpMsg('بدأت الجولة بدونك. انتظر الجولة الجاية.');
    return;
  }
  if (!MP.saved) MP.saved = { region: save.region, diff: save.diff, level: level };
  save.region = go.reg === 'city' ? 'city' : 'south';
  save.diff = DIFFS[go.diff] ? go.diff : 'normal';
  MP.game = {
    kind: go.mode === 'race' ? 'race' : 'duel',
    id: String(go.id),
    roster: roster,
    idx: idx,
    t0: performance.now() + 3600,
    seed: Math.max(1, Math.min(999, go.seed | 0)),
    end: false,
    n: 1,
    pen: 0,
    hs: 0,
    fin: 0,
    cache: {}
  };
  MP.st = 'play';
  mpMsg('');
  overlay.hidden = true;
  SH.show('game');
  if (MP.game.kind === 'race') {
    level = 1;
    reset();
    pres({ st: 'play', g: MP.game.id, lv: 0, fin: 0 });
  } else duelStart();
  MP.lastSend = 0;
  mode = 'play';
}
function mpShowResults() {
  var G = MP.game;
  if (!G) return;
  if (G.kind === 'duel' && !G.rows) G.rows = duelRows();
  if (G.kind === 'race' && !G.fin) pres({ st: 'out' });
  MP.st = 'res';
  mode = 'over';
  if (S) {
    S.scoped = false;
    S.brHold = false;
  }
  vm.visible = false;
  setMp(true);
}
function mpBackToRoom() {
  MP.game = null;
  MP.st = 'lobby';
  mpRestore();
  pres({
    st: 'lobby',
    g: null,
    sh: null,
    kb: null,
    al: null,
    cr: null,
    p: null,
    yw: null,
    lv: null,
    fin: null,
    sc: null,
    hn: null
  });
  reset();
  mode = 'menu';
  menuUI();
  mpView();
}

/* race */
function raceTime() {
  var G = MP.game;
  return Math.max(0, (performance.now() - G.t0) / 1000) + G.pen - G.hs * 2;
}
function raceStep(win, why) {
  var G = MP.game;
  S.pending = null;
  S.scoped = false;
  mode = 'wait';
  if (win) {
    G.hs += S.heads;
    pres({ lv: G.n });
    if (G.n >= 10) {
      G.fin = Math.max(1, raceTime());
      pres({ fin: Math.round(G.fin * 10) / 10, st: 'done' });
      S.banner = { text: 'أنهيت العشر!', col: '#7fae5a', t: 99 };
      callout('win');
      setTimeout(function () {
        if (MP.game === G) mpShowResults();
      }, 1600);
      return;
    }
    S.banner = { text: 'المهمة ' + ar(G.n) + ' تمت', col: '#7fae5a', t: 99 };
    G.n++;
  } else {
    G.pen += 15;
    S.banner = { text: 'فشلت · عقوبة ١٥ ثانية', col: '#e0603f', t: 99 };
    callout('fail');
  }
  setTimeout(function () {
    if (MP.game !== G || MP.st !== 'play') return;
    level = G.n;
    reset();
    mode = 'play';
  }, 1500);
}
function raceRows() {
  var G = MP.game,
    me = myPeer();
  G.roster.forEach(function (peer) {
    var p = byPeer(peer),
      pr = peerP(p);
    if (p && pr.g === G.id)
      G.cache[peer] = {
        nm: pname(p),
        lv: Math.max(0, Math.min(10, pr.lv | 0)),
        fin: +pr.fin > 0 ? +pr.fin : 0,
        out: pr.st === 'out'
      };
    else if (!G.cache[peer]) G.cache[peer] = { nm: p ? pname(p) : 'لاعب', lv: 0, fin: 0, out: true };
  });
  return G.roster
    .map(function (peer) {
      var c = G.cache[peer];
      return { peer: peer, me: peer === me, nm: c.nm, lv: c.lv, fin: c.fin, out: c.out };
    })
    .sort(function (a, b) {
      return (a.fin || 1e9 - a.lv) - (b.fin || 1e9 - b.lv);
    });
}

/* tower duel */
function duelSpots(blds, n) {
  var spots = [{ x: 0, z: 0, ax: 1, az: 0, w: 6, y: CAMY - 1.65 }];
  var cand = blds.filter(function (b) {
    var d = Math.hypot(b.x, b.z);
    return b.l <= 2 && Math.abs(b.a) < 70 * D2R && d > 95 && d < 280 && b.w >= 7;
  });
  var used = [];
  for (var k = 0; k < n - 1; k++) {
    var want = (-55 + (110 * (k + 0.5)) / (n - 1)) * D2R,
      best = null,
      bc = 1e9;
    cand.forEach(function (b) {
      if (used.indexOf(b) >= 0) return;
      if (
        !spots.every(function (q) {
          return Math.hypot(q.x - b.x, q.z - b.z) > 45;
        })
      )
        return;
      var c = Math.abs(b.a - want) * 300 + Math.abs(Math.hypot(b.x, b.z) - 170) * 0.4;
      if (c < bc) {
        bc = c;
        best = b;
      }
    });
    if (!best)
      best =
        cand.filter(function (b) {
          return used.indexOf(b) < 0;
        })[0] || cand[0];
    used.push(best);
    spots.push({
      x: best.x,
      z: best.z,
      ax: Math.cos(best.a),
      az: Math.sin(best.a),
      w: best.w,
      y: best.h + 0.5
    });
  }
  return spots;
}
function postPos(sp, p) {
  var off = (p - 1) * Math.max(1, sp.w / 2 - 1.6);
  return { x: sp.x + sp.ax * off, z: sp.z + sp.az * off };
}
function nameTex(t) {
  var c = mk(256, 64),
    x = c.getContext('2d');
  x.font = '700 34px Tajawal, Tahoma, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 7;
  x.strokeStyle = 'rgba(0,0,0,.8)';
  x.strokeText(t, 128, 34);
  x.fillStyle = '#ffd36a';
  x.fillText(t, 128, 34);
  var tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
function maxQ(sh) {
  var m = 0;
  if (Array.isArray(sh))
    sh.forEach(function (q) {
      if (q && typeof q.q === 'number' && q.q > m) m = q.q;
    });
  return m;
}
function inGame(p) {
  return !!(p && MP.game && peerP(p).g === MP.game.id);
}
function duelKills(peer) {
  var k = 0;
  if (!MP.game) return 0;
  MP.game.roster.forEach(function (o) {
    var p = byPeer(o);
    if (inGame(p)) {
      var kb = peerP(p).kb;
      if (kb && typeof kb === 'object') k += Math.max(0, Math.min(99, +kb[peer] || 0));
    }
  });
  return k;
}
function duelDeaths(peer) {
  var p = byPeer(peer),
    kb = inGame(p) ? peerP(p).kb : null,
    d = 0;
  if (kb && typeof kb === 'object') for (var k in kb) d += Math.max(0, Math.min(99, +kb[k] || 0));
  return d;
}
function duelRows() {
  var G = MP.game,
    me = myPeer();
  return G.roster
    .map(function (peer) {
      var p = byPeer(peer),
        pr = peerP(p),
        sc = inGame(p) ? +pr.sc || 0 : 0,
        hn = inGame(p) ? +pr.hn || 0 : 0;
      return {
        peer: peer,
        me: peer === me,
        nm: p ? pname(p) : 'لاعب غادر',
        k: duelKills(peer),
        d: duelDeaths(peer),
        sc: sc,
        acc: sc ? Math.round(Math.min(1, hn / sc) * 100) : 0
      };
    })
    .sort(function (a, b) {
      return b.k - a.k || a.d - b.d;
    });
}

function duelHitMe(shooter, nm, head) {
  if (!head && MP.hp > 1) {
    MP.hp--;
    S.hurt = 0.6;
    S.banner = { text: 'أصابك ' + nm + '! احتمِ', col: '#e0603f', t: 1.4 };
    return;
  }
  S.dead = 5;
  unscope();
  S.cover = false;
  S.hurt = 0.8;
  MP.hp = 2;
  callout('death');
  MP.kb[shooter] = (MP.kb[shooter] || 0) + 1;
  var kb = {};
  for (var k in MP.kb) kb[k] = MP.kb[k];
  pres({ al: false, cr: false, kb: kb });
  S.banner = { text: (head ? 'طلقة رأس من ' : 'أسقطك ') + nm, col: '#e0603f', t: 2.6 };
}

function drawDuelFx() {
  if (S.cover && S.dead <= 0) {
    var top = CY + 20,
      gr = ctx.createLinearGradient(0, top, 0, CH);
    gr.addColorStop(0, '#8d8172');
    gr.addColorStop(1, '#4f463c');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(0, CH);
    ctx.lineTo(0, top + 28);
    for (var x = 0; x <= CW; x += 30) {
      ctx.lineTo(x + 15, top);
      ctx.lineTo(x + 30, top + 28);
    }
    ctx.lineTo(CW, CH);
    ctx.closePath();
    ctx.fill();
    txt('محتمٍ خلف الجدار · ما تقدر تطلق', CX, top + 76, 13, '#f4efe4', 'center');
  }
  if (S.hurt > 0) {
    ctx.fillStyle = 'rgba(200,20,10,' + S.hurt * 0.45 + ')';
    ctx.fillRect(0, 0, CW, CH);
  }
  if (S.dead > 0) {
    ctx.fillStyle = 'rgba(40,6,4,.6)';
    ctx.fillRect(0, 0, CW, CH);
    txt('سقطت', CX, CY - 10, 28, '#ffffff', 'center');
    txt('تعود للمعركة بعد ' + ar(Math.ceil(S.dead)), CX, CY + 20, 14, '#f4d9b0', 'center');
  }
  if (S.moving > 0) txt('تنتقل…', CX, CY + 96, 14, '#f4efe4', 'center');
}
function mpDrawTop() {
  var G = MP.game,
    now = performance.now();
  if (now < G.t0) {
    var c = Math.ceil((G.t0 - now) / 1000);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, CW, CH);
    txt(MPN[G.kind], CX, CY - 46, 18, '#ffffff', 'center');
    txt(c > 3 ? 'استعد' : ar(c), CX, CY + 18, 54, '#eab14d', 'center');
    return;
  }
  if (G.kind === 'race') {
    var rows = raceRows(),
      me = myPeer(),
      rank = 1,
      lead = rows[0];
    rows.forEach(function (r, i) {
      if (r.peer === me) rank = i + 1;
    });
    txt(
      'المركز ' + ar(rank) + ' من ' + ar(rows.length) + ' · المهمة ' + ar(Math.min(10, G.n)) + '/١٠',
      CX,
      18,
      11,
      '#eab14d',
      'center'
    );
    txt(clockText(raceTime()), CX, 38, 17, HUDC, 'center');
    if (lead && lead.peer !== me)
      txt('المتصدر: ' + lead.nm + ' ' + ar(lead.lv) + '/١٠', CX, 112, 11, '#f4efe4', 'center');
  } else {
    var best = null,
      bk = -1;
    G.roster.forEach(function (pe) {
      var k = duelKills(pe);
      if (k > bk) {
        bk = k;
        best = pe;
      }
    });
    var bp = byPeer(best);
    if (bk > 0 && bp)
      txt(
        'المتصدر: ' + (bp.peer === myPeer() ? 'أنت' : pname(bp)) + ' · ' + ar(bk),
        CX,
        18,
        11,
        '#eab14d',
        'center'
      );
  }
}
function mpResults() {
  var G = MP.game,
    list = el('mpResList');
  if (!G) return;
  list.innerHTML = '';
  if (G.kind === 'duel') {
    var rows = G.rows || duelRows();
    el('mpResTitle').textContent = rows.length
      ? 'الفائز: ' + (rows[0].me ? 'أنت' : rows[0].nm)
      : 'انتهت المواجهة';
    rows.forEach(function (r, i) {
      var li = document.createElement('li');
      if (r.me) li.className = 'me';
      li.textContent =
        ar(i + 1) +
        '. ' +
        r.nm +
        (r.me ? ' (أنت)' : '') +
        ' · ' +
        ar(r.k) +
        ' إسقاط · ' +
        ar(r.d) +
        ' سقطة · دقة ' +
        ar(r.acc) +
        '٪';
      list.appendChild(li);
    });
    var t = [];
    if (rows.length) t.push('الصياد: ' + rows[0].nm);
    var eye = rows
      .filter(function (r) {
        return r.sc >= 3;
      })
      .sort(function (a, b) {
        return b.acc - a.acc;
      })[0];
    if (eye) t.push('عين الصقر: ' + eye.nm);
    var ghost = rows.slice().sort(function (a, b) {
      return a.d - b.d;
    })[0];
    if (ghost) t.push('الشبح: ' + ghost.nm);
    el('mpTitles').textContent = t.join(' · ');
  } else {
    var rr = raceRows();
    el('mpResTitle').textContent =
      rr.length && rr[0].fin ? 'الفائز: ' + (rr[0].me ? 'أنت' : rr[0].nm) : 'سباق العشر';
    rr.forEach(function (r, i) {
      var li = document.createElement('li');
      if (r.me) li.className = 'me';
      li.textContent =
        ar(i + 1) +
        '. ' +
        r.nm +
        (r.me ? ' (أنت)' : '') +
        ' · ' +
        (r.fin
          ? clockText(r.fin)
          : r.out
            ? 'انسحب عند ' + ar(r.lv) + '/١٠'
            : 'يلعب الحين ' + ar(r.lv) + '/١٠');
      list.appendChild(li);
    });
    el('mpTitles').textContent = 'الوقت يشمل عقوبة ١٥ ثانية لكل فشل، وخصم ثانيتين لكل إصابة رأس.';
  }
}

try {
  el('mpName').value = localStorage.getItem('ayn-mp-name') || '';
} catch (e) {}
el('mpBtn').addEventListener('click', function () {
  setMp(true);
});
el('mpBack').addEventListener('click', function () {
  setMp(false);
});
el('mpMode').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  MP.mode = b.getAttribute('data-m');
  mpView();
});
el('mpCreate').addEventListener('click', function () {
  mpEnter(String(1000 + Math.floor(Math.random() * 9000)), true);
});
el('mpJoin').addEventListener('click', function () {
  mpEnter(latin(el('mpCode').value), false);
});
el('mpLeave').addEventListener('click', mpLeave);
el('mpAgain').addEventListener('click', mpBackToRoom);
el('mpQuit').addEventListener('click', function () {
  if (MP.game) {
    MP.game.end = true;
    mpShowResults();
  }
});
el('mpStart').addEventListener('click', function () {
  var ps = players()
    .map(function (p) {
      return p.peer;
    })
    .sort()
    .slice(0, 6);
  if (ps.length < 2) return;
  var go = {
    id: Math.random().toString(36).slice(2, 10),
    mode: MP.mode,
    seed: 1 + Math.floor(Math.random() * 400),
    reg: save.region,
    diff: save.diff,
    roster: ps
  };
  pres({ go: go, mode: MP.mode, reg: save.region });
  MP.lastSend = 0;
  MP.seenGo = go.id;
  mpStartGame(go);
});
el('cover').addEventListener('click', function () {
  if (!S || !S.duel || S.dead > 0 || mode !== 'play') return;
  S.cover = !S.cover;
  S.coverT = 0;
  if (S.cover) unscope();
  pres({ cr: S.cover });
});
el('move').addEventListener('click', function () {
  if (!S || !S.duel || S.dead > 0 || S.moving > 0 || mode !== 'play') return;
  S.post = (S.post + 1) % 3;
  S.moving = 0.8;
  unscope();
  pres({ p: S.post });
});

/* ---------- multiplayer on the new engine: avatars, shots, hits ---------- */
function setMp(open) {
  if (open) {
    SH.show('mp');
    mpView();
  } else SH.show('home');
}
function duelStart() {
  var G = MP.game;
  disposeWorld();
  D = DIFFS.normal;
  P_MIN = -42 * D2R;
  P_MAX = 32 * D2R;
  cur = curStats(save.sel);
  cur.sway *= D.sway;
  var g = build(G.seed, D, { empty: true }),
    spots = duelSpots(g.blds, G.roster.length);
  var mine = spots[G.idx],
    cx = 0,
    cz = 0,
    cy = 0,
    cnt = 0;
  spots.forEach(function (q, i) {
    if (i !== G.idx) {
      cx += q.x;
      cz += q.z;
      cy += q.y;
      cnt++;
    }
  });
  cx /= cnt;
  cz /= cnt;
  cy /= cnt;
  var yaw0 = Math.atan2(cx - mine.x, -(cz - mine.z)),
    avs = [];
  G.roster.forEach(function (peer, i) {
    if (i === G.idx) return;
    var lo = lookOpts(peerP(byPeer(peer)).lk),
      rr = rng(G.seed * 31 + i * 7);
    var grp = lo ? mkPerson('c', rr, lo) : mkPerson('e', rr);
    var tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: nameTex('…'), depthTest: false, fog: false, transparent: true })
    );
    var fl = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: TX.flash,
        color: 0xffc070,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false
      })
    );
    fl.visible = false;
    tag.renderOrder = 6;
    g.world.add(grp);
    g.world.add(grp.userData.blob);
    g.world.add(tag);
    g.world.add(fl);
    var pp = postPos(spots[i], 1);
    avs.push({
      kind: 'p',
      peer: peer,
      sp: spots[i],
      alive: false,
      cover: false,
      grp: grp,
      tag: tag,
      tagName: '',
      fl: fl,
      flT: 0,
      px: pp.x,
      pz: pp.z,
      y: spots[i].y,
      d: 0,
      fall: 0,
      lowY: 0,
      br: 0.26,
      ph: Math.random() * 6
    });
  });
  S = {
    world: g.world,
    targets: avs,
    blds: g.blds,
    flags: [],
    total: 15,
    killed: 0,
    heads: 0,
    shots: 0,
    hits: 0,
    mission: { type: 'duel' },
    type: 'duel',
    duel: true,
    ammo: 99,
    time: 300,
    base: g.base,
    t: 0,
    rt: 0,
    cool: 0,
    recoil: 0,
    slow: 0,
    scoped: false,
    brHold: false,
    warned: false,
    breath: cur.bmax,
    fov: HIP,
    zfov: cur.fov,
    yaw: yaw0,
    pitch: clamp(Math.atan2(cy + 1 - (mine.y + 1.65), Math.hypot(cx - mine.x, cz - mine.z)), P_MIN, P_MAX),
    ay: yaw0,
    ap: 0,
    wind: g.base,
    banner: null,
    pending: null,
    hm: 0,
    ox: mine.x,
    oy: mine.y + 1.65,
    oz: mine.z,
    yaw0: yaw0,
    swx: 0,
    swy: 0,
    cover: false,
    coverT: 0,
    post: 1,
    moving: 0,
    dead: 0,
    hurt: 0,
    mySp: mine,
    lastYw: 0
  };
  S.syaw = S.yaw;
  S.spitch = S.pitch;
  MP.kb = {};
  MP.shots = [];
  MP.fired = 0;
  MP.hits = 0;
  MP.hp = 2;
  MP.seenQ = {};
  MP.seenSc = {};
  MP.peers.forEach(function (p) {
    MP.seenQ[p.peer] = maxQ(peerP(p).sh);
    MP.seenSc[p.peer] = null;
  });
  pres({
    st: 'play',
    g: G.id,
    p: 1,
    cr: false,
    al: true,
    kb: {},
    sh: [],
    sc: 0,
    hn: 0,
    yw: Math.round(yaw0 * 100) / 100
  });
  buildVM(cur.w);
  zoomReset();
  renderer.shadowMap.needsUpdate = true;
}
function duelFired() {
  MP.fired++;
  pres({ sc: MP.fired });
}
function duelShot(hit, part) {
  if (hit && hit.kind === 'p') {
    MP.hits++;
    MP.q++;
    S.hits++;
    MP.shots.push({ q: MP.q, t: hit.peer, h: part });
    if (MP.shots.length > 6) MP.shots.shift();
    pres({ sh: MP.shots.slice(), hn: MP.hits });
    banner((part === 2 ? 'طلقة رأس في ' : 'أصبت ') + hit.tagName, '#7fae5a');
  } else banner('أخطأت', '#c9a46a');
}
function duelUpdate(sdt, dt) {
  var G = MP.game,
    me = myPeer();
  if (!G) return;
  S.moving = Math.max(0, S.moving - dt);
  S.hurt = Math.max(0, S.hurt - dt);
  var tp = postPos(S.mySp, S.post),
    eyeY = S.mySp.y + (S.cover || S.dead > 0 ? 0.55 : 1.65),
    k = Math.min(1, dt * 4);
  S.ox += (tp.x - S.ox) * k;
  S.oz += (tp.z - S.oz) * k;
  S.oy += (eyeY - S.oy) * Math.min(1, dt * 8);
  if (S.dead > 0) {
    S.dead -= dt;
    if (S.dead <= 0) {
      S.dead = 0;
      S.post = Math.floor(Math.random() * 3);
      pres({ al: true, p: S.post });
      banner('عدت للمعركة', '#7fae5a');
    }
  }
  if (S.cover) S.coverT += dt;
  if (Math.abs(S.yaw - S.lastYw) > 0.05) {
    S.lastYw = S.yaw;
    pres({ yw: Math.round(S.yaw * 100) / 100 });
  }
  S.targets.forEach(function (a) {
    var p = byPeer(a.peer),
      pr = peerP(p),
      vis = inGame(p),
      u = a.grp.userData;
    a.grp.visible = vis;
    u.blob.visible = vis;
    a.tag.visible = vis;
    if (!vis) {
      a.alive = false;
      a.fl.visible = false;
      return;
    }
    var nm = pname(p);
    if (nm !== a.tagName) {
      a.tagName = nm;
      var om = a.tag.material.map;
      a.tag.material.map = nameTex(nm);
      a.tag.material.needsUpdate = true;
      if (om) om.dispose();
    }
    var post = pr.p === 0 || pr.p === 2 ? pr.p : 1,
      pp = postPos(a.sp, post),
      m = Math.min(1, dt * 4),
      ox = a.px,
      oz = a.pz;
    a.px += (pp.x - a.px) * m;
    a.pz += (pp.z - a.pz) * m;
    var moving = Math.hypot(a.px - ox, a.pz - oz) > dt * 0.3;
    a.cover = !!pr.cr;
    a.alive = pr.al !== false;
    a.fall = a.alive ? 0 : Math.min(1, a.fall + dt * 2.2);
    a.lowY += ((a.cover ? 1.6 : 0) - a.lowY) * Math.min(1, dt * 8);
    a.y = a.sp.y;
    a.grp.position.set(a.px, a.y - a.lowY, a.pz);
    a.grp.rotation.x = -a.fall * 1.45;
    if (typeof pr.yw === 'number' && isFinite(pr.yw)) a.grp.rotation.y = Math.PI - pr.yw;
    a.ph += dt * (moving ? 7 : 2);
    animPerson(a.grp, moving ? 'walk' : 'idle', a.ph, dt, false);
    u.blob.position.set(a.px, a.y + 0.04, a.pz);
    a.d = Math.round(Math.hypot(a.px - S.ox, a.y + 0.9 - S.oy, a.pz - S.oz));
    var ts2 = Math.max(1.3, a.d * 0.011);
    a.tag.position.set(a.px, a.y + 2.3 - a.lowY * 0.4, a.pz);
    a.tag.scale.set(ts2 * 4, ts2, 1);
    var sc = +pr.sc || 0;
    if (MP.seenSc[a.peer] == null) MP.seenSc[a.peer] = sc;
    else if (sc !== MP.seenSc[a.peer]) {
      MP.seenSc[a.peer] = sc;
      a.flT = 0.12;
      sfxClick(300, 0.25, Math.max(0.08, 0.5 - a.d / 600), a.d / 340);
    }
    a.flT = Math.max(0, a.flT - dt);
    a.fl.visible = a.flT > 0;
    if (a.fl.visible) {
      a.fl.position.set(a.px, a.y + 1.45 - a.lowY, a.pz);
      a.fl.scale.setScalar(Math.max(1.5, a.d * 0.03));
    }
    var seen = MP.seenQ[a.peer] || 0;
    (Array.isArray(pr.sh) ? pr.sh : []).forEach(function (q) {
      if (!q || typeof q.q !== 'number' || q.q <= seen) return;
      if (q.q > (MP.seenQ[a.peer] || 0)) MP.seenQ[a.peer] = q.q;
      if (q.t !== me || S.dead > 0 || G.end) return;
      if (S.cover && S.coverT > 0.35) {
        banner('رصاصة ' + nm + ' ضربت الجدار', '#c9a46a');
        return;
      }
      duelHitMe(a.peer, nm, q.h === 2);
    });
  });
  var myK = duelKills(me);
  if (myK > S.killed) {
    S.killed = myK;
    banner('إسقاط مؤكد', '#7fae5a');
    callout('kill');
  }
  S.time = Math.max(0, 300 - (performance.now() - G.t0) / 1000);
  var top = 0;
  G.roster.forEach(function (pe) {
    top = Math.max(top, duelKills(pe));
  });
  if (!G.end && (S.time <= 0 || top >= 15)) {
    G.end = true;
    G.rows = duelRows();
    mode = 'wait';
    unscope();
    S.banner = { text: 'انتهت المواجهة', col: '#eab14d', t: 99 };
    setTimeout(function () {
      if (MP.game === G) mpShowResults();
    }, 1800);
  }
}

/* ---------- start-up ---------- */
applyEnv(save.env);
el('fps').hidden = !save.fpsOn;
applyQuality();
reset();
menuUI();
refreshAvatar();
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', function () {
  setTimeout(fit, 250);
});
SH.progress(1);
SH.ready = true;
el('failBox').hidden = true;
requestAnimationFrame(loop);
