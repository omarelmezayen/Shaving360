/* Shaving360 — hero WebGL scene
   · chrome 3D logo extruded from the traced brand SVG (does a full 360° every few seconds)
   · products orbiting it on a 360° ring (drag / click / arrows / dots)
   · glossy floor reflections, LED orbit line with degree ticks
   · scene is offset so it never sits under the copy column
   events out: gl-progress, gl-ready, ring-front · in: ring-go */
// A classic script with dynamic imports (not a module file): a module file cannot be loaded when the page is opened
// straight from disk, and this way the same file works both over http and from file://.
(async () => {
const THREE = await import('three');
const { SVGLoader } = await import('three/addons/loaders/SVGLoader.js');
const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
const canvas = document.getElementById('gl');
const pin = document.getElementById('heroPin');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-gl');
  emit('gl-ready');
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const look = new THREE.Vector3();
scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(-5, 8, 7); scene.add(key);
const rim = new THREE.PointLight(0xe8ecf2, 80, 30); rim.position.set(4, 5, -4); scene.add(rim);
const fill = new THREE.PointLight(0xffffff, 25, 20); fill.position.set(0, 3, 6); scene.add(fill);

const manager = new THREE.LoadingManager();
manager.onProgress = (u, l, t) => emit('gl-progress', l / t);
// when every cut-out is in: draw once straight away (uploads the textures and compiles the shaders while the loader
// is still playing), and leave a status on <html data-gl> so a broken scene is easy to spot
manager.onLoad = () => {
  const root = document.documentElement;
  try { renderer.render(scene, camera); root.dataset.gl = 'ok'; }
  catch (e) { root.dataset.gl = 'error'; console.error('hero scene:', e); }
  emit('gl-ready');
};
const texLoader = new THREE.TextureLoader(manager);

/* ---------- chrome logo from the traced SVG parts in the page ---------- */
const d = ['lg-comb', 'lg-blade', 'lg-pivot', 'lg-handle'].map(id => document.getElementById(id).getAttribute('d')).join('');
const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${d}"/></svg>`);
const shapes = svg.paths.flatMap(p => SVGLoader.createShapes(p));
const logoGeo = new THREE.ExtrudeGeometry(shapes, { depth: 40, bevelEnabled: true, bevelThickness: 8, bevelSize: 5, bevelSegments: 5, curveSegments: 10 });
logoGeo.computeBoundingBox();
const lb = logoGeo.boundingBox, lc = new THREE.Vector3(); lb.getCenter(lc);
logoGeo.translate(-lc.x, -lc.y, -lc.z);
const chrome = new THREE.MeshPhysicalMaterial({ color: 0x18181b, metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.9 });
const logoMesh = new THREE.Mesh(logoGeo, chrome);
logoMesh.scale.setScalar(1.35 / (lb.max.y - lb.min.y));
logoMesh.rotation.x = Math.PI;
const logo = new THREE.Group(); logo.add(logoMesh); scene.add(logo);

/* ---------- textures ---------- */
function canvasTex(draw, w = 4, h = 256) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }
const vgrad = stops => canvasTex((g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const fadeBottom = s => vgrad([[0, '#fff'], [s, '#fff'], [1, '#000']]);          // dissolves white bases
const reflFade = vgrad([[0, '#000'], [0.6, '#000'], [1, '#fff']]);
const blob = canvasTex((g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, 128, 128);

/* ---------- products: sculpted relief models ----------
   A product photo is already a finished, lit render, so the model keeps it intact and adds real form:
   · relief(): a smooth height field from the cut-out (rounded rim, flat plateau, no creases)
   · a small shader that keeps the photo's own lighting and adds only what a turning object would show:
     soft falloff on the turning edges, a cool rim from the backdrop glow, a thin gloss streak
   · the turn is limited (about 20 degrees), so the photo never stretches
   · each product has a mirrored twin under the floor that fades with depth = a glossy-floor reflection */
const ITEMS = [
  { src: 'assets/p/cut/clipper.png', h: 2.5,  bulge: 0.17, name: 'clipper' },
  { src: 'assets/p/cut/trimmer.png', h: 2.5,  bulge: 0.2,  name: 'trimmer' },
  { src: 'assets/p/cut/shaver.png',  h: 1.95, bulge: 0.2,  name: 'shaver' },
  { src: 'assets/p/cut/nose.png',    h: 2.0,  bulge: 0.24, name: 'nose' },
  { src: 'assets/p/cut/case-open.png', h: 2.75, bulge: 0.015, name: 'case', tilt: 0.66, refl: false, flat: true }   // the open Pro kit, from the store's own photo,
];
const N = ITEMS.length, STEP = Math.PI * 2 / N;

function relief(img, w, h, bulge, rows = 210) {
  const cols = Math.max(8, Math.round(rows * img.width / img.height));
  const c = document.createElement('canvas'); c.width = cols; c.height = rows;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, cols, rows);
  const A = g.getImageData(0, 0, cols, rows).data, n = cols * rows;
  const inside = new Uint8Array(n);
  let lowest = 0;
  for (let i = 0; i < n; i++) if (A[i * 4 + 3] > 110) { inside[i] = 1; const y = (i / cols) | 0; if (y > lowest) lowest = y; }
  // chamfer (3-4) distance to the silhouette
  const INF = 1e9, D = new Float32Array(n);
  for (let i = 0; i < n; i++) D[i] = inside[i] ? INF : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows) ? 0 : D[y * cols + x];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const k = y * cols + x; if (!D[k]) continue;
    D[k] = Math.min(D[k], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4); }
  for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) { const k = y * cols + x; if (!D[k]) continue;
    D[k] = Math.min(D[k], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4); }
  let dmax = 0; for (let i = 0; i < n; i++) if (D[i] < INF && D[i] > dmax) dmax = D[i];
  // rounded rim that reaches full height well before the middle -> a plateau, so no medial-axis creases
  const Rpx = Math.max(9, dmax * 0.55);
  let H = new Float32Array(n);
  for (let i = 0; i < n; i++) { if (!inside[i]) continue; const t = Math.min(1, D[i] / Rpx); H[i] = Math.sqrt(1 - (1 - t) * (1 - t)); }
  // smooth the field (outside counts as 0, so the rim still tapers to the silhouette)
  for (let pass = 0; pass < 5; pass++) {
    const T = new Float32Array(n);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < cols && Y < rows) s += H[Y * cols + X]; }
      T[y * cols + x] = s / 9;
    }
    H = T;
  }
  let Hmax = 0; for (let i = 0; i < n; i++) if (H[i] > Hmax) Hmax = H[i];
  const baseY = (1 - (lowest + 1) / rows) * h;               // empty margin under the product: sit it on the floor
  const idx = new Int32Array(n).fill(-1), P = [], U = [];
  const near = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < cols && Y < rows && inside[Y * cols + X]) return true; } return false; };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!near(x, y)) continue;
    const k = y * cols + x; idx[k] = P.length / 3;
    // the face (plateau) sits on the turning axis at z = 0 and the rim falls back behind it: when the product turns,
    // what is printed on the face stays put and only the edges swing, like a real box
    P.push(((x + 0.5) / cols - 0.5) * w, (1 - (y + 0.5) / rows) * h - baseY, (H[k] - Hmax) * bulge);
    U.push((x + 0.5) / cols, 1 - (y + 0.5) / rows);
  }
  const ind = [];
  for (let y = 0; y < rows - 1; y++) for (let x = 0; x < cols - 1; x++) {
    const p0 = idx[y * cols + x], p1 = idx[y * cols + x + 1], p2 = idx[(y + 1) * cols + x], p3 = idx[(y + 1) * cols + x + 1];
    if (p0 < 0 || p1 < 0 || p2 < 0 || p3 < 0) continue;
    ind.push(p0, p2, p1, p1, p2, p3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(ind); geo.computeVertexNormals();
  return geo;
}

const PRODUCT_VS = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp; vView = -mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }`;
const PRODUCT_FS = /* glsl */`
  uniform sampler2D map; uniform float uDim; uniform float uRefl; uniform float uFade; uniform float uFlat; uniform float uCut;
  varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
  void main() {
    vec4 tex = texture2D(map, vUv);
    if (tex.a < uCut) discard;
    vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vView);
    float facing = clamp(dot(n, v), 0.0, 1.0);
    vec3 col = tex.rgb;
    if (uFlat < 0.5) {                                                           // (the open case keeps its own photo lighting untouched)
    col *= mix(0.42, 1.0, smoothstep(0.0, 0.8, facing));                       // form: edges turn away from the eye
    col *= 0.92 + 0.16 * dot(n, normalize(vec3(0.45, 0.6, 0.66)));              // soft key from the upper right, like the sunlight on the wall
    col += pow(1.0 - facing, 2.4) * vec3(0.72, 0.72, 0.70) * 0.10;              // light wrapping round the edges from the bright studio
    vec3 hv = normalize(normalize(vec3(0.3, 0.85, 0.45)) + v);
    col += pow(max(dot(n, hv), 0.0), 70.0) * 0.10;                              // thin gloss streak
    }
    col = mix(col, vec3(0.80, 0.80, 0.78), uDim);                               // depth haze: products further back melt into the bright air
    float a = tex.a;
    if (uRefl > 0.5) { a *= (1.0 - smoothstep(0.0, uFade, -vWorld.y)) * 0.13; col *= 0.75; }
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

const softBlob = canvasTex((g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, 128, 128);
const products = ITEMS.map((it, i) => {
  const group = new THREE.Group(), twin = new THREE.Group();          // twin = the reflection under the floor
  const mkShadow = () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softBlob, transparent: true, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 3; return m; };
  const shadow = mkShadow(), contact = mkShadow();
  const p = { group, twin, shadow, contact, h: it.h, w: it.h * 0.5, i, mat: null, rmat: null, bulge: it.bulge, tilt: it.tilt || 0 };
  group.rotation.order = twin.rotation.order = 'YXZ';        // turn first, then lean back
  twin.visible = it.refl !== false;
  texLoader.load((window.__HERO_TEX && window.__HERO_TEX[it.src]) || it.src, tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (it.flat) { tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; }   // crisp cut edge, no soft halo when it lies tilted
    const img = tex.image, w = it.h * img.width / img.height; p.w = w;
    const geo = relief(img, w, it.h, it.bulge);
    const mk = refl => new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uDim: { value: 1 }, uRefl: { value: refl ? 1 : 0 }, uFade: { value: it.h * 0.55 }, uFlat: { value: it.flat ? 1 : 0 }, uCut: { value: it.flat ? 0.5 : 0.04 } },
      vertexShader: PRODUCT_VS, fragmentShader: PRODUCT_FS, side: THREE.DoubleSide, toneMapped: false,
      transparent: refl, depthWrite: !refl, alphaToCoverage: !refl && !it.flat
    });
    p.mat = mk(false); p.rmat = mk(true);
    const body = new THREE.Mesh(geo, p.mat); body.userData.i = i; group.add(body);
    const mirror = new THREE.Mesh(geo, p.rmat); mirror.renderOrder = 2; twin.add(mirror);
    document.documentElement.dataset.glModels = (+document.documentElement.dataset.glModels || 0) + 1;
  });
  twin.scale.y = -1;
  scene.add(group, twin, shadow, contact);
  return p;
});
/* ---------- LED orbit + ticks ---------- */
const orbit = new THREE.Mesh(new THREE.TorusGeometry(1, 0.0035, 6, 360), new THREE.MeshBasicMaterial({ color: 0x0f0f11, transparent: true, opacity: 0.3, toneMapped: false }));
orbit.rotation.x = Math.PI / 2; scene.add(orbit);
const TICKS = 72;
const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x0f0f11, transparent: true, opacity: 0.22, toneMapped: false }), TICKS);
scene.add(ticks);
const dummy = new THREE.Object3D();

/* ---------- interaction ---------- */
let R = 3.5, rot = 0, target = 0, front = -1, last = performance.now(), idle = 0, t = 0;
let mx = 0, my = 0, smx = 0, smy = 0, spinAt = 3, spinFrom = 0, spinT = -1;
const nearest = i => { let a = -i * STEP; while (a - target > Math.PI) a -= Math.PI * 2; while (a - target < -Math.PI) a += Math.PI * 2; return a; };
const frontIndex = () => ((Math.round(-rot / STEP) % N) + N) % N;
const go = i => { target = nearest(((i % N) + N) % N); idle = 0; };
window.addEventListener('ring-go', e => { const dt = e.detail || {}; if (typeof dt.to === 'number') go(dt.to); else go(frontIndex() + (dt.step || 1)); });

let dragging = false, lastX = 0, moved = 0;
canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; moved = 0; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); target += dx * 0.0065; idle = 0; });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerup', e => {
  dragging = false;
  if (moved < 6) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(products.map(p => p.group), true)[0];
    if (hit) go(hit.object.userData.i);
  } else target = Math.round(target / STEP) * STEP;
});
window.addEventListener('pointermove', e => { mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1; });

/* ---------- layout: keep the scene clear of the copy ---------- */
let mobile = false;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  mobile = w < 960;
  camera.aspect = w / h;
  camera.fov = mobile ? 40 : 30;
  R = mobile ? 1.7 : Math.min(3.4, Math.max(2.5, (w / h) * 1.9));   // ring radius follows the viewport shape
  camera.updateProjectionMatrix();
  layout();
}

/* Fit the scene to the page: the tallest product must sit between the bottom of the headline block
   (title + copy + buttons) and the top of the dock, and the backdrop's floor line must run just behind
   the products at the back. Offsets are read with offsetTop so running animations don't disturb them. */
const heroTop = document.querySelector('.hero-top'), dockEl = document.querySelector('.dock'), stageImg = document.querySelector('.hero-stage img'), heroUi = document.querySelector('.hero-ui');
const TALL = 2.5 * 0.96;
let camZ = 12.2, camY = 1.75, lookY = 1.05;
const topIn = el => { let y = 0; while (el && el !== heroUi) { y += el.offsetTop; el = el.offsetParent; } return y; };
function layout() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h || !heroTop || !dockEl) return;
  const topPx = topIn(heroTop) + heroTop.offsetHeight, botPx = topIn(dockEl);
  if (!(botPx - topPx > 120)) return;
  const gapB = Math.max(30, h * 0.045), gapT = 18;
  const Hpx = Math.max(150, Math.min(botPx - topPx - gapB - gapT, h * (mobile ? 0.42 : 0.54)));
  const d = TALL * h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Hpx);
  camY = mobile ? 2.3 : 1.75; lookY = mobile ? 1.15 : 1.05; camZ = R + d;
  camera.clearViewOffset(); camera.position.set(0, camY, camZ); look.set(0, lookY, 0); camera.lookAt(look);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const py = (x, y, z) => (1 - new THREE.Vector3(x, y, z).project(camera).y) / 2 * h;
  const off = (botPx - gapB) - py(0, 0, R);                     // front product's base lands just above the dock
  const backBase = py(0, 0, -R * 0.81) + off;                   // base of the two products at the back
  camera.setViewOffset(w, h, 0, -off, w, h); camera.updateProjectionMatrix();
  if (stageImg) {                                               // slide the backdrop so its wall/floor line sits behind them
    const S = 1.22, P = 0.71, ih = 1238 * Math.max(w / 2200, h / 1238);
    const y0 = (h - ih) * P + 0.7076 * ih, target = backBase - Math.max(8, h * 0.014);
    const lim = (S - 1) / 2 / S;                               // how far it can slide and still cover the frame
    const ty = Math.max(-lim, Math.min(lim, ((target - h / 2) - (y0 - h / 2) * S) / (S * h)));
    stageImg.style.setProperty('--stage-s', S); stageImg.style.setProperty('--stage-y', (ty * 100).toFixed(2) + '%');
  }
}new ResizeObserver(resize).observe(canvas);
resize();

/* where the headline's logo slot sits in world space (plane z = 0), and how big the logo must be to fill it */
const slot = document.getElementById('logoSlot');
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
function anchor() {
  const r = slot.getBoundingClientRect(), c = canvas.getBoundingClientRect();
  if (!r.width || !c.width) return { p: new THREE.Vector3(0, 3, 0), s: 0.6 };
  const nx = ((r.left + r.width / 2 - c.left) / c.width) * 2 - 1;
  const ny = -((r.top + r.height / 2 - c.top) / c.height) * 2 + 1;
  _v.set(nx, ny, 0.5).unproject(camera);
  _d.copy(_v).sub(camera.position).normalize();
  const p = camera.position.clone().addScaledVector(_d, -camera.position.z / _d.z);
  const worldH = 2 * camera.position.distanceTo(p) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (r.height / c.height);
  return { p, s: worldH / 1.35 };
}

document.fonts && document.fonts.ready.then(layout); addEventListener('load', layout); setTimeout(layout, 1200);
let visible = true;
// while the preloader plays, the scene is drawn only a few times (to compile shaders and upload textures) and then rests,
// so the loader animation gets the whole frame budget; it starts drawing again the moment the loader begins to open
let loading = true, warm = 0, texReady = false;
addEventListener('gl-ready', () => { texReady = true; });
addEventListener('loader-exit', () => { loading = false; });
new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(pin);
const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!visible) return;
  if (loading) { if (!document.body.classList.contains('is-loading')) loading = false; else if (!texReady || warm++ > 3) return; }
  t += dt;
  const hp = window.__heroP || 0;

  if (!dragging) { idle += dt; if (idle > 4.5 && hp < 0.05) go(frontIndex() + 1); }
  rot += (target - rot) * Math.min(1, dt * 5);
  const spin = rot + hp * 1.6;

  smx += (mx - smx) * 0.05; smy += (my - smy) * 0.05;
  camera.position.set(smx * 0.6, camY + hp * 3 - smy * 0.25, camZ - hp * 2);
  look.set(0, lookY + hp * 0.8, 0);
  camera.lookAt(look);

  // logo lives inside the headline (DOM slot) and drops into the ring as you scroll
  if (spinT < 0 && t > spinAt) { spinT = 0; spinFrom = 0; }
  let extra = 0;
  if (spinT >= 0) { spinT += dt / 1.8; extra = easeIO(Math.min(1, spinT)) * Math.PI * 2; if (spinT >= 1) { spinT = -1; spinAt = t + 6; extra = 0; } }
  camera.updateMatrixWorld();
  const anc = anchor();
  const k = Math.min(1, hp * 2.2), ke = k * k * (3 - 2 * k);
  logo.position.set(
    anc.p.x * (1 - ke),
    anc.p.y + (1.55 - anc.p.y) * ke + Math.sin(t * 1.2) * 0.02,
    anc.p.z * (1 - ke));
  logo.scale.setScalar(anc.s + (1.25 - anc.s) * ke);
  logo.rotation.y = Math.sin(t * 0.6) * 0.35 + extra + smx * 0.3;
  logo.rotation.x = smy * 0.06;

  const r = R * (1 + hp * 0.25);
  orbit.scale.setScalar(r);
  for (let k = 0; k < TICKS; k++) {
    const a = k / TICKS * Math.PI * 2 + spin, big = k % 18 === 0;
    dummy.position.set(Math.sin(a) * (r + 0.12), 0.002, Math.cos(a) * (r + 0.12));
    dummy.rotation.set(0, a, 0);
    dummy.scale.set(0.01, 0.002, big ? 0.3 : 0.12);
    dummy.updateMatrix(); ticks.setMatrixAt(k, dummy.matrix);
  }
  ticks.instanceMatrix.needsUpdate = true;

  products.forEach(p => {
    const a = p.i * STEP + spin;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const k = (Math.cos(a) + 1) / 2;                          // 1 = front, 0 = back
    const face = Math.atan2(camera.position.x - x, camera.position.z - z);
    // limited turn (about 20 degrees at most): enough to read the form, never enough to stretch the photo.
    // the front product adds a slow showcase sway and leans a touch toward the pointer
    const yaw = face - Math.sin(a) * 0.2 + Math.pow(k, 5) * (Math.sin(t * 0.55 + p.i) * 0.13 + smx * 0.1);
    const sc = (0.62 + 0.34 * Math.pow(k, 2)) * (mobile && p.tilt ? 0.8 : 1);   // the open case is wide: a little smaller on phones
    const dim = Math.pow(1 - k, 1.4) * 0.46;                 // haze amount: 0 at the front, ~0.46 at the very back
    p.group.position.set(x, 0, z); p.group.rotation.set(-p.tilt, yaw, 0); p.group.scale.setScalar(sc);
    p.twin.position.set(x, 0, z); p.twin.rotation.set(p.tilt, yaw, 0); p.twin.scale.set(sc, -sc, sc);
    if (p.mat) { p.mat.uniforms.uDim.value = dim; p.rmat.uniforms.uDim.value = dim; p.rmat.uniforms.uFade.value = p.h * sc * 0.3; }
    // grounding: a wide soft shadow plus a tight dark contact line under the base
    p.shadow.scale.set(p.w * sc * 2.5 + p.h * sc * 0.35, p.w * sc * 0.8 + 0.3, 1); p.shadow.position.set(x - (p.w * 0.55 + p.h * 0.16) * sc, 0.004, z + 0.16);
    p.shadow.material.opacity = 0.3 + 0.2 * k;
    p.contact.scale.set(p.w * sc * 1.05, 0.2 * sc + p.bulge * sc, 1); p.contact.position.set(x, 0.006, z);
    p.contact.material.opacity = 0.34 + 0.22 * k;
  });
  const f = frontIndex();
  if (f !== front) { front = f; emit('ring-front', f); }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
})().catch(e => { console.error(e); document.documentElement.dataset.gl = 'error'; window.dispatchEvent(new CustomEvent('gl-ready')); });
