/* Shaving360 — page choreography (GSAP + ScrollTrigger + Lenis) */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const SVGNS = 'http://www.w3.org/2000/svg';

  if (!window.gsap) { document.body.classList.remove('is-loading'); const l = $('#loader'); if (l) l.style.display = 'none'; return; }
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    window.__lenis = lenis;
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  const scrollToEl = el => lenis ? lenis.scrollTo(el, { offset: 0, duration: 1.4 }) : el.scrollIntoView({ behavior: 'smooth' });

  /* ---------- split words (never letters — Arabic stays joined) ---------- */
  function split(el) {
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span'); w.className = 'w';
          const wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = part;
          w.appendChild(wi); frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR' && !n.classList.contains('pill')) walk(n);
    });
    walk(el);
    return $$('.wi', el);
  }

  /* =========================================================
     PRELOADER (~2.6s)
     snip ×3 → 120° each (hair clippings fly) → logo assembles,
     3-6-0 flip 360° → a last snip cuts the screen open
     ========================================================= */
  const heroWords = $$('[data-split="hero"]').flatMap(split);
  gsap.set(heroWords, { yPercent: 115 });
  gsap.set('[data-hero]', { y: 20, autoAlpha: 0 });
  gsap.set('#gl', { autoAlpha: 0, scale: 1.06 });
  gsap.set('#nav', { autoAlpha: 0, y: -16 });

  /* ---- dial: 72 degree ticks ---- */
  const ticksG = $('#ldTicks');
  for (let k = 0; k < 72; k++) {
    const a = k / 72 * Math.PI * 2, big = k % 18 === 0, r1 = big ? 46 : 47.6, r2 = 49.2;
    const l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('x1', Math.sin(a) * r1); l.setAttribute('y1', -Math.cos(a) * r1);
    l.setAttribute('x2', Math.sin(a) * r2); l.setAttribute('y2', -Math.cos(a) * r2);
    l.setAttribute('class', big ? 'tick b' : 'tick'); ticksG.appendChild(l);
  }
  const tickEls = $$('#ldTicks line');

  let glReady = false;
  addEventListener('gl-ready', () => { glReady = true; });
  setTimeout(() => { glReady = true; }, 3000);
  const waitReady = () => new Promise(res => { const c = () => glReady ? res() : setTimeout(c, 60); c(); });

  /* the scissors' pivot sits exactly at screen centre = the dial's centre */
  const PIV = '185 247.5';
  const ldLogo = $('#ldLogo');
  const VB = { x: -30, y: -40, w: 1426, h: 540 };
  const pivotOffset = () => {
    const w = ldLogo.getBoundingClientRect().width, s = w / VB.w, h = VB.h * s;
    return { x: w / 2 - (185 - VB.x) * s, y: h / 2 - (247.5 - VB.y) * s };
  };

  const deg = { v: 0 }, arc = $('#ldArc'), num = $('#ldNum'), headEl = $('#ldHead');
  let litN = 0, numN = -1;
  const showDeg = () => {
    const n = Math.round(deg.v);
    if (n !== numN) { numN = n; num.textContent = String(n).padStart(3, '0'); }
    arc.style.strokeDashoffset = 1 - deg.v / 360;
    gsap.set(headEl, { rotation: deg.v, svgOrigin: '0 0' });
    const lit = Math.round(deg.v / 5);                       // only the ticks that changed are touched
    if (lit !== litN) { for (let i = Math.min(lit, litN); i < Math.max(lit, litN) && i < tickEls.length; i++) tickEls[i].style.stroke = i < lit ? 'rgba(255,255,255,.7)' : ''; litN = lit; }
  };
  const po = pivotOffset();
  gsap.set(ldLogo, { xPercent: -50, yPercent: -50, x: po.x, y: po.y });
  gsap.set('#plIcon', { scale: 1.5, svgOrigin: PIV, autoAlpha: 0 });
  const OPEN = 4, SHUT = 32;   // degrees each blade sits open, and how far past the logo pose it bites when it closes
  gsap.set('#plA', { rotation: -OPEN, svgOrigin: PIV });
  gsap.set('#plB', { rotation: OPEN, svgOrigin: PIV });
  gsap.set('#plWord use', { y: 150 });
  gsap.set('#plNum use', { autoAlpha: 0, transformOrigin: '50% 50%' });
  gsap.set('#ldDial', { autoAlpha: 0, scale: 0.9, rotation: -40 });
  gsap.set('#ldCount', { autoAlpha: 0, y: 12 });
  $('#loaderStage').classList.add('ready');             // only now may the stage paint: no flash of the assembled logo

  // The loader is one continuous rhythm: a snip every BEAT, each one starting as the last one's blades finish
  // reopening, with the counter still climbing between them, so nothing ever sits still.
  // one snip: a quick bite, a small squeeze, a ripple from the pivot, a springy reopen; the dial gains its degrees
  const BEAT = 0.46;
  const snip = (to, bite = 1) => {
    const tl = gsap.timeline();
    tl.to('#plA', { rotation: SHUT * bite, duration: 0.13, ease: 'power2.in', svgOrigin: PIV, overwrite: 'auto' }, 0)
      .to('#plB', { rotation: -SHUT * bite, duration: 0.13, ease: 'power2.in', svgOrigin: PIV, overwrite: 'auto' }, 0)
      .to('#plIcon', { scale: 1.25 - 0.05 * bite, duration: 0.13, ease: 'power2.in', svgOrigin: PIV, overwrite: 'auto' }, 0)
      .fromTo('#ldPulse', { attr: { r: 6 }, opacity: 0.8 * bite }, { attr: { r: 44 }, opacity: 0, duration: 0.6, ease: 'power3.out', overwrite: 'auto' }, 0.13)
      .to('#plIcon', { scale: 1.25, duration: 0.3, ease: 'back.out(2.2)', svgOrigin: PIV }, 0.13)
      .to('#plA', { rotation: -OPEN, duration: 0.3, ease: 'back.out(1.5)', svgOrigin: PIV }, 0.15)
      .to('#plB', { rotation: OPEN, duration: 0.3, ease: 'back.out(1.5)', svgOrigin: PIV }, 0.15)
      .to(deg, { v: to, duration: 0.62, ease: 'power2.out', onUpdate: showDeg, overwrite: 'auto' }, 0.1);
    return tl;
  };
  const beat = (s = BEAT) => new Promise(r => gsap.delayedCall(s, r));
  async function runLoader() {
    if (reduce) { gsap.set(ldLogo, { x: 0, y: 0 }); gsap.set('#plIcon', { autoAlpha: 1, scale: 1 }); gsap.set('#plWord use', { y: 0 }); gsap.set('#plNum use', { autoAlpha: 1 }); deg.v = 360; showDeg(); await waitReady(); return exitLoader(); }
    gsap.timeline()
      .to('#ldDial', { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.8, ease: 'power3.out' }, 0)
      .fromTo(tickEls, { opacity: 0 }, { opacity: 1, duration: 0.35, stagger: 0.004 }, 0)
      .to('#plIcon', { autoAlpha: 1, scale: 1.25, duration: 0.5, ease: 'power3.out', svgOrigin: PIV }, 0.05)
      .to('#ldCount', { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 0.15);
    await beat(0.5);                                   // the first snip lands while the dial is still settling
    snip(120); await beat();
    snip(240); await beat();
    // scene not ready yet: keep the rhythm with soft half-snips while the counter creeps on, instead of freezing
    let creep = 240;
    while (!glReady) { creep += (318 - creep) * 0.3; snip(creep, 0.5); await beat(); }
    snip(360); await beat(0.3);
    // the dial turns away and the logo assembles around the scissors, straight out of the last snip
    const tl = gsap.timeline();
    tl.to('#ldDial', { rotation: 300, scale: 1.14, autoAlpha: 0, duration: 0.8, ease: 'power2.inOut' }, 0)
      .to('#ldCount', { autoAlpha: 0, y: -12, duration: 0.3, ease: 'power2.in' }, 0.12)
      .to(['#plA', '#plB'], { rotation: 0, duration: 0.5, ease: 'back.out(1.8)', svgOrigin: PIV, overwrite: 'auto' }, 0)
      .to('#plIcon', { scale: 1, duration: 0.7, ease: 'power3.inOut', svgOrigin: PIV, overwrite: 'auto' }, 0)
      .to(ldLogo, { x: 0, y: 0, duration: 0.7, ease: 'power3.inOut' }, 0)
      .to('#plWord use', { y: 0, duration: 0.55, stagger: 0.03, ease: 'power3.out' }, 0.28);
    $$('#plNum use').forEach((el, i) => {
      const a = { v: 0 };
      tl.set(el, { autoAlpha: 1 }, 0.38 + i * 0.07)
        .to(a, { v: 360, duration: 0.6, ease: 'power3.out', onUpdate: () => gsap.set(el, { scaleX: Math.cos(a.v * Math.PI / 180) }) }, 0.38 + i * 0.07);
    });
    await tl;
    exitLoader();
  }
  // exit: a short beat on the finished logo, then the black sheet opens as a circle from the centre while the logo lifts away
  function exitLoader() {
    const bg = $('#ldBg'), far = Math.hypot(innerWidth, innerHeight) / 2 + 40;
    window.dispatchEvent(new Event('loader-exit'));            // the 3D scene starts drawing again
    gsap.timeline()
      .to('#loaderStage', { scale: 0.94, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, 0.12)
      .to('.ld-meta', { autoAlpha: 0, duration: 0.3 }, 0.12)
      .fromTo(bg, { '--hole': '0px' }, { '--hole': far + 'px', duration: 0.95, ease: 'power3.inOut' }, 0.2)
      .add(heroIntro, 0.42)
      .add(() => { $('#loader').style.display = 'none'; document.body.classList.remove('is-loading'); lenis && lenis.start(); ScrollTrigger.refresh(); });
  }
  function heroIntro() {
    gsap.fromTo('#gl', { autoAlpha: 0, scale: 1.08 }, { autoAlpha: 1, scale: 1, duration: 1.6, ease: 'expo.out' });
    gsap.to(heroWords, { yPercent: 0, duration: 1.2, stagger: 0.08, ease: 'expo.out' });
    gsap.to('[data-hero]', { y: 0, autoAlpha: 1, duration: 1, stagger: 0.06, delay: 0.2, ease: 'expo.out' });
    gsap.to('#nav', { autoAlpha: 1, y: 0, duration: 1, delay: 0.25, ease: 'expo.out' });
  }
  runLoader();

  /* =========================================================
     NAVIGATION — floating capsule on scroll, flips over light
     sections; full menu opens as a growing circle
     ========================================================= */
  const nav = $('#nav');
  const lightSecs = $$('#hero, .inside, .light');
  const overSheet = $('#over');                             // the dark sheet that slides over the light hero
  const circ = $('#circle');
  const inBand = el => { const r = el.getBoundingClientRect(); return r.top <= 40 && r.bottom >= 40; };
  nav.classList.add('on-light');                            // the page opens on the light hero
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: s => {
      nav.classList.toggle('scrolled', s.scroll() > 40);
      nav.classList.toggle('on-light', !inBand(overSheet) && (lightSecs.some(inBand) || (inBand(circ) && (window.__circP || 0) < 0.4)));
    }
  });

  const menu = $('#menu'), menuBtn = $('#menuBtn');
  const prevImgs = $$('.menu-preview img');
  const PREV = ['مكينة رأس · من 296 ر.س', 'شنطة 360 برو · 429 ر.س', 'مقص عادي · 59 ر.س', 'جوّا الشنطة · 10 أدوات', 'مكينة تحديد · 196 ر.س'];
  $$('.menu-links a').forEach(a => a.addEventListener('pointerenter', () => {
    const i = +a.dataset.prev;
    prevImgs.forEach((im, k) => im.classList.toggle('on', k === i));
    $('#mpName').textContent = PREV[i];
  }));
  let menuOpen = false;
  function toggleMenu(open) {
    menuOpen = open;
    const r = menuBtn.getBoundingClientRect();
    const at = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    menu.setAttribute('aria-hidden', !open);
    if (open) {
      lenis && lenis.stop();
      gsap.set(menu, { visibility: 'visible' });
      gsap.fromTo(menu, { clipPath: `circle(0% at ${at})` }, { clipPath: `circle(150% at ${at})`, duration: 0.85, ease: 'expo.inOut' });
      gsap.fromTo('.menu-links a', { yPercent: 105 }, { yPercent: 0, duration: 0.9, stagger: 0.05, delay: 0.25, ease: 'expo.out' });
      gsap.fromTo('.menu-side', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, delay: 0.4, duration: 0.8, ease: 'expo.out' });
    } else {
      gsap.to(menu, { clipPath: `circle(0% at ${at})`, duration: 0.65, ease: 'expo.inOut', onComplete: () => gsap.set(menu, { visibility: 'hidden' }) });
      lenis && lenis.start();
    }
  }
  menuBtn.addEventListener('click', () => toggleMenu(!menuOpen));
  addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) toggleMenu(false); });

  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const el = $(id); if (!el) return;
    e.preventDefault();
    if (a.dataset.filter) filter(a.dataset.filter);
    if (menuOpen) { toggleMenu(false); setTimeout(() => scrollToEl(el), 300); } else scrollToEl(el);
  }));

  /* =========================================================
     HERO — switcher follows the 3D ring; hero recedes under
     the manifesto sheet
     ========================================================= */
  const PRODUCTS = [
    { n: 'مكينة رأس', u: '8 أمشاط تدرّج', p: 296, o: 380 },
    { n: 'مكينة تحديد', u: 'شفرة T للحواف', p: 196, o: 275 },
    { n: 'مكينة تنعيم', u: 'اللمسة الأخيرة', p: 196, o: 275 },
    { n: 'مكينة خشم', u: 'بدون ألم', p: 96, o: 135 },
    { n: 'شنطة 360 برو', u: '10 أدوات', p: 429, o: 600 },
  ];
  // thumbnail dock: pick any product directly; a soft highlight slides to the active one
  const thumbs = $$('#pThumbs button'), hl = $('#pHl');
  const moveHl = i => { const t = thumbs[i]; if (t) hl.style.transform = `translateX(${t.offsetLeft}px)`; };
  addEventListener('ring-front', e => {
    const i = e.detail, d = PRODUCTS[i];
    thumbs.forEach((b, k) => b.setAttribute('aria-selected', k === i));
    moveHl(i);
    gsap.to('.dock-info', { y: -6, autoAlpha: 0, duration: 0.16, ease: 'power2.in', onComplete: () => {
      $('#pName').textContent = d.n; $('#pUse').textContent = d.u;
      $('#pPrice').textContent = `${d.p} ر.س`; $('#pOld').textContent = d.o;
      $('#pIdx').innerHTML = `<b>0${i + 1}</b> / 05`;
      gsap.fromTo('.dock-info', { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: 'expo.out' });
    } });
  });
  const ringGo = detail => dispatchEvent(new CustomEvent('ring-go', { detail }));
  thumbs.forEach((b, i) => b.addEventListener('click', () => ringGo({ to: i })));
  requestAnimationFrame(() => moveHl(0)); addEventListener('resize', () => moveHl(thumbs.findIndex(b => b.getAttribute('aria-selected') === 'true')));
  ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom top', onUpdate: s => { window.__heroP = s.progress; } });
  gsap.timeline({ scrollTrigger: { trigger: '#over', start: 'top bottom', end: 'top top', scrub: true } })
    // the hero stays full-bleed while the next sheet slides over it (no shrinking, so no pale edges appear)
    .fromTo('#heroDim', { opacity: 0 }, { opacity: 0.65, ease: 'none' }, 0)
    .fromTo('.hero-ui', { y: 0, autoAlpha: 1 }, { y: -50, autoAlpha: 0, ease: 'none' }, 0);

  /* ---------- marquees ---------- */
  $$('[data-marquee]').forEach(track => {
    const dir = +track.dataset.marquee, skew = track.hasAttribute('data-skew');
    const base = track.innerHTML;
    while (track.scrollWidth < innerWidth * 1.3) track.innerHTML += base;
    track.innerHTML += track.innerHTML;
    let x = 0, drag = false, px = 0, vel = 0, moved = 0, hover = false;
    if (track.hasAttribute('data-drag')) {               // reviews: drift on their own, grab and throw them
      const row = track.parentElement;
      row.addEventListener('pointerenter', () => { hover = true; });
      row.addEventListener('pointerleave', () => { hover = false; });
      row.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = true; px = e.clientX; vel = 0; moved = 0; try { row.setPointerCapture(e.pointerId); } catch (_) {}; row.classList.add('dragging'); });
      row.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - px; px = e.clientX; x += dx; vel = dx; moved += Math.abs(dx); });
      const up = () => { drag = false; row.classList.remove('dragging'); };
      row.addEventListener('pointerup', up); row.addEventListener('pointercancel', up);
      row.addEventListener('wheel', e => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); x -= e.deltaX; } }, { passive: false });
    }
    // width is measured once (and on resize), never inside the frame loop; off-screen marquees skip work
    let half = track.scrollWidth / 2, onScreen = true;
    addEventListener('resize', () => { half = track.scrollWidth / 2; });
    document.fonts && document.fonts.ready.then(() => { half = track.scrollWidth / 2; });
    new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; }).observe(track.parentElement);
    gsap.ticker.add(() => {
      if (!onScreen) return;
      const v = lenis ? lenis.velocity : 0;
      if (!drag) { vel *= 0.94; x += (hover ? 0.12 : 0.45 + Math.abs(v) * 0.15) * dir + vel; }
      if (x >= half) x -= half; if (x < 0) x += half;
      track.style.transform = `translate3d(${x}px,0,0)` + (skew ? ` skewX(${clamp(-v * 0.3, -8, 8)}deg)` : '');
    });
  });

  /* ---------- manifesto + counters ---------- */
  split($('#mani'));
  const maniW = $$('#mani .w');
  gsap.set(maniW, { opacity: 0.16 });
  gsap.to(maniW, { opacity: 1, stagger: 0.05, ease: 'none', scrollTrigger: { trigger: '#mani', start: 'top 80%', end: 'bottom 50%', scrub: true } });
  // story: three scenes open from the centre outwards, then drift at different speeds
  const scenes = $$('#storyGrid .sc');
  scenes.forEach((sc, i) => {
    const img = sc.querySelector('img'), frame = sc.querySelector('.sc-img');
    gsap.fromTo(frame, { clipPath: 'inset(18% 10% 18% 10% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: 1.4, delay: Math.abs(i - 1) * 0.12, ease: 'expo.out', scrollTrigger: { trigger: '#storyGrid', start: 'top 80%', once: true } });
    gsap.from(sc.querySelector('figcaption'), { y: 24, autoAlpha: 0, duration: 1, delay: 0.3 + Math.abs(i - 1) * 0.12, ease: 'expo.out', scrollTrigger: { trigger: '#storyGrid', start: 'top 80%', once: true } });
    gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: sc, start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo(sc, { y: 0 }, { y: +sc.dataset.speed * 8, ease: 'none', scrollTrigger: { trigger: '#storyGrid', start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  // newsletter image drifts inside its frame
  gsap.fromTo('.nb-media img', { scale: 1.05 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.nb', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('.nb', { y: 60, autoAlpha: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.nb', start: 'top 85%', once: true } });

  /* ---------- FAQ: one open at a time, smooth height ---------- */
  const qas = $$('.qa');
  const openQa = (qa, open) => {
    const a = qa.querySelector('.qa-a');
    qa.classList.toggle('open', open);
    qa.querySelector('.qa-q').setAttribute('aria-expanded', open);
    if (open) gsap.fromTo(a, { height: 0 }, { height: 'auto', duration: 0.6, ease: 'expo.out' });
    else gsap.to(a, { height: 0, duration: 0.45, ease: 'expo.out' });
    gsap.fromTo(a.querySelector('p'), { y: open ? 12 : 0, autoAlpha: open ? 0 : 1 }, { y: 0, autoAlpha: open ? 1 : 0, duration: open ? 0.6 : 0.2, delay: open ? 0.08 : 0 });
  };
  qas.forEach(qa => qa.querySelector('.qa-q').addEventListener('click', () => {
    const willOpen = !qa.classList.contains('open');
    qas.forEach(o => { if (o !== qa && o.classList.contains('open')) openQa(o, false); });
    openQa(qa, willOpen);
  }));
  gsap.from(qas, { y: 40, autoAlpha: 0, duration: 0.9, stagger: 0.07, ease: 'expo.out', scrollTrigger: { trigger: '#qaList', start: 'top 85%', once: true } });
  $$('[data-count]').forEach(el => {
    const to = +el.dataset.count, pre = el.dataset.prefix || '', o = { v: 0 };
    ScrollTrigger.create({ trigger: el, start: 'top 92%', once: true, onEnter: () => gsap.to(o, { v: to, duration: 1.8, ease: 'expo.out', onUpdate: () => { el.textContent = pre + Math.round(o.v); } }) });
  });

  /* ---------- generic reveals ---------- */
  $$('[data-split]:not([data-split="hero"])').forEach(el => gsap.from(split(el), { yPercent: 115, duration: 1.1, stagger: 0.06, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } }));
  $$('[data-fade]').forEach(el => gsap.from(el, { y: 40, autoAlpha: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } }));

  /* =========================================================
     FEATURE — full-bleed cinematic, three shots
     ========================================================= */
  const steps = $$('#feat .step');
  const FEAT = [['مكينة رأس', '296 ر.س'], ['مكينة رأس', '296 ر.س'], ['مكينة تحديد', '196 ر.س']];
  let featK = 0;
  // a camera over two product photos: overview → blade → turbo + screen → (cut to) T-blade.
  // Each state: focus point (fx,fy as fraction of the photo), zoom s, and where that point lands on the stage (tx,ty).
  const segs = $$('#feat .sg'), segFill = $$('#feat .sg i b');
  const stage = $('#feat .feat-stage'), F0 = $('#fA0'), F1 = $('#fA1'), hs = $$('#feat .hs');
  const CAM = {
    over:  { fx: 0.32, fy: 0.45, s: 1.00, tx: 0.30, ty: 0.50, ms: 1.1 },
    blade: { fx: 0.25, fy: 0.26, s: 1.75, tx: 0.30, ty: 0.42, ms: 1.5 },
    panel: { fx: 0.36, fy: 0.52, s: 1.55, tx: 0.30, ty: 0.52, ms: 1.45 },
    tIn:   { fx: 0.40, fy: 0.36, s: 1.25, tx: 0.30, ty: 0.52, ms: 1.7 },
    tEnd:  { fx: 0.40, fy: 0.36, s: 1.08, tx: 0.30, ty: 0.50, ms: 1.5 }
  };
  // the callouts live in a twin layer above the stage's dark gradient (same size and camera as their photo),
  // so their white labels stay white instead of being dimmed with the picture
  const hsLayer = document.createElement('div'); hsLayer.className = 'feat-hs'; hsLayer.setAttribute('aria-hidden', 'true');
  $('#featCam').after(hsLayer);
  const ghost = f => { const g = document.createElement('div'); g.className = 'fghost'; $$('.hs', f).forEach(h => g.appendChild(h)); hsLayer.appendChild(g); f._g = g; return g; };
  const G0 = ghost(F0), G1 = ghost(F1);
  let FR = { w: 0, h: 0, l: 0, t: 0, W: 0, H: 0 };
  const sizeFrames = () => {
    const W = stage.clientWidth, H = stage.clientHeight, ar = 16 / 9;
    const phone = innerWidth < 960;
    // desktop: the photo covers the stage. phones: sized so the product (about 40% of the photo) spans the stage width
    const w = phone ? W / 0.44 : Math.max(W, H * ar), h = w / ar;
    FR = { w, h, l: (W - w) / 2, t: (H - h) / 2, W, H };
    [F0, F1, G0, G1].forEach(f => gsap.set(f, { width: w, height: h, left: FR.l, top: FR.t }));
  };
  // translate so the focus point lands on (tx,ty), clamped so the photo always covers the stage
  const camXY = c0 => {
    const c = innerWidth < 960 ? { ...c0, tx: 0.5, ty: c0.ty * 0.7, s: c0.ms } : c0;   // phones: product centred above the copy, with its own zoom per shot
    const cl = (v, lo, hi) => lo > hi ? v : clamp(v, lo, hi);                 // only clamp when the photo is larger than the stage
    const x = cl(c.tx * FR.W - FR.l - c.s * c.fx * FR.w, FR.W - FR.l - c.s * FR.w, -FR.l);
    const y = cl(c.ty * FR.H - FR.t - c.s * c.fy * FR.h, FR.H - FR.t - c.s * FR.h, -FR.t);
    return { x, y, scale: c.s };
  };
  // the camera is one small state (a: overview→blade→panel, b: trimmer in→out) painted from the current
  // frame size every time, so it is always right after a resize or an orientation change
  const camS = { a: 0, b: 0 };
  const mixC = (A, B, t) => { const o = {}; for (const k in A) o[k] = A[k] + (B[k] - A[k]) * t; return o; };
  const putCam = (f, c) => { const p = camXY(c); gsap.set([f, f._g], { x: p.x, y: p.y, scale: p.scale }); f._g.style.setProperty('--s', p.scale); };
  const applyCam = () => {
    putCam(F0, camS.a <= 1 ? mixC(CAM.over, CAM.blade, camS.a) : mixC(CAM.blade, CAM.panel, camS.a - 1));
    putCam(F1, mixC(CAM.tIn, CAM.tEnd, camS.b));
  };
  const refit = () => { sizeFrames(); applyCam(); };
  refit(); addEventListener('resize', refit);
  const setFeat = k => {
    if (k === featK) return; featK = k;
    steps.forEach((st, i) => st.classList.toggle('on', i === k));
    hs.forEach(h => h.classList.toggle('on', +h.dataset.s === k));
    $('#featName').textContent = FEAT[k][0]; $('#featPrice').textContent = FEAT[k][1];
    segs.forEach((g, i) => g.classList.toggle('on', i === k));
  };
  featK = -1; setFeat(0);
  gsap.timeline({
    defaults: { ease: 'power1.inOut' },
    scrollTrigger: {
      trigger: '#feat', start: 'top top', end: () => '+=' + innerHeight * 1.7, scrub: 0.6, invalidateOnRefresh: true,
      onRefresh: refit,
      onUpdate: s => { const q = s.progress * 3; segFill.forEach((b, i) => { b.style.transform = `scaleX(${clamp(q - i, 0, 1).toFixed(3)})`; }); setFeat(Math.min(2, Math.floor(q + 0.04))); }
    }
  })
    .to(camS, { a: 1, duration: 0.8, onUpdate: applyCam }, 0)
    .to(camS, { a: 2, duration: 1.0, onUpdate: applyCam }, 1.05)
    .to(F0, { opacity: 0, duration: 0.35 }, 2.05)
    .to(F1, { opacity: 1, duration: 0.35 }, 2.05)
    .to(camS, { b: 1, duration: 0.95, onUpdate: applyCam }, 2.05);  // as the next section slides over: the stage recedes and darkens (overlay opacity, not a CSS filter)
  gsap.timeline({ scrollTrigger: { trigger: '#inside', start: 'top bottom', end: 'top top', scrub: true } })
    .fromTo('#feat .feat-pin', { scale: 1 }, { scale: 0.94, ease: 'none' }, 0)
    .fromTo('#feat .feat-dim', { opacity: 0 }, { opacity: 0.75, ease: 'none' }, 0);

  /* =========================================================
     INSIDE — vertical scroll drives a horizontal track
     ========================================================= */
  const track = $('#track');
  const dist = () => Math.max(0, track.scrollWidth - innerWidth);
  const insideProg = p => {
    $('#hbar').style.transform = `scaleX(${p})`;
    $('#toolIdx').textContent = String(clamp(Math.round(p * 9) + 1, 1, 10)).padStart(2, '0') + ' / 10';
  };
  // phones and tablets: a free row. It is dragged by hand, coasts after a flick, and once the visitor
  // rests on it for a moment it drifts slowly by itself (back and forth) so it never sits still.
  // desktop: the section pins and vertical scroll drives the row; it can also be dragged by hand.
  const insideFree = matchMedia('(max-width: 960px)').matches;
  if (insideFree) {
    $('#inside').classList.add('free');
    const S = { x: 0, v: 0, down: false, horiz: false, lx: 0, ly: 0, lt: 0, dir: 1, wake: 0, vis: false };
    const put = () => { const m = dist(); track.style.transform = `translate3d(${S.x.toFixed(1)}px,0,0)`; insideProg(m ? S.x / m : 0); };
    new IntersectionObserver(es => { const v = es[0].isIntersecting; if (v && !S.vis) S.wake = performance.now() + 1100; S.vis = v; }, { threshold: 0.4 }).observe(track.parentElement);
    track.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; S.down = true; S.horiz = false; S.v = 0; S.lx = e.clientX; S.ly = e.clientY; S.lt = performance.now(); });
    track.addEventListener('pointermove', e => {
      if (!S.down) return;
      const dx = e.clientX - S.lx, dy = e.clientY - S.ly;
      if (!S.horiz) { if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return; S.horiz = true; track.classList.add('grabbing'); try { track.setPointerCapture(e.pointerId); } catch (_) {} }
      const now = performance.now(), dt = Math.max(8, now - S.lt);
      S.v = S.v * 0.6 + (dx / dt * 1000) * 0.4; S.lx = e.clientX; S.ly = e.clientY; S.lt = now;
      S.x = clamp(S.x + dx, 0, dist()); put();
    });
    const up = () => { if (!S.down) return; S.down = false; if (!S.horiz) S.v = 0; S.horiz = false; track.classList.remove('grabbing'); S.wake = performance.now() + 2600; };
    track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
    gsap.ticker.add((t, dms) => {
      if (S.down || !S.vis) return;
      const dt = Math.min(dms, 50) / 1000, m = dist();
      if (Math.abs(S.v) > 6) {
        S.x += S.v * dt; S.v *= Math.exp(-4.2 * dt);
        if (S.x <= 0 || S.x >= m) { S.x = clamp(S.x, 0, m); S.v = 0; }
        S.dir = S.x >= m ? -1 : S.x <= 0 ? 1 : S.dir; put();
      } else if (performance.now() > S.wake && m > 0) {
        S.x += S.dir * 24 * dt;
        if (S.x >= m) { S.x = m; S.dir = -1; S.wake = performance.now() + 900; }
        if (S.x <= 0) { S.x = 0; S.dir = 1; S.wake = performance.now() + 900; }
        put();
      }
    });
    addEventListener('resize', () => { S.x = clamp(S.x, 0, dist()); put(); });
  } else {
    const insideTw = gsap.to(track, {
      x: () => dist(), ease: 'none',
      scrollTrigger: { trigger: '#inside', pin: '#insidePin', start: 'top top', end: () => '+=' + dist(), scrub: 0.8, invalidateOnRefresh: true, onUpdate: s => insideProg(s.progress) }
    });
    // desktop: the row stays tied to the page scroll, and it can also be dragged freely by hand.
    // A drag moves the page scroll one-to-one (no lag), and a flick coasts and settles, so both inputs
    // always agree about where the row is.
    const st = insideTw.scrollTrigger;
    const D = { down: false, horiz: false, lx: 0, ly: 0, lt: 0, v: 0, y: 0, coast: false, moved: false };
    const goto = y => {
      D.y = clamp(y, st.start, st.end);
      lenis ? lenis.scrollTo(D.y, { immediate: true, force: true }) : scrollTo(0, D.y);
      ScrollTrigger.update(); const tw = st.getTween && st.getTween(); if (tw) tw.progress(1);   // skip the scrub lag while the hand is driving
    };
    track.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      D.down = true; D.horiz = false; D.moved = false; D.coast = false; D.v = 0; D.lx = e.clientX; D.ly = e.clientY; D.lt = performance.now();
    });
    track.addEventListener('pointermove', e => {
      if (!D.down) return;
      const dx = e.clientX - D.lx, dy = e.clientY - D.ly;
      if (!D.horiz) { if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return; D.horiz = true; D.moved = true; track.classList.add('grabbing'); try { track.setPointerCapture(e.pointerId); } catch (_) {} }
      const now = performance.now(), dt = Math.max(8, now - D.lt);
      D.v = D.v * 0.6 + (dx / dt * 1000) * 0.4; D.lx = e.clientX; D.ly = e.clientY; D.lt = now;
      goto(scrollY + dx);
    });
    const pu = () => { if (!D.down) return; D.down = false; track.classList.remove('grabbing'); if (D.horiz && Math.abs(D.v) > 40) { D.coast = true; D.y = scrollY; } D.horiz = false; };
    track.addEventListener('pointerup', pu); track.addEventListener('pointercancel', pu);
    track.addEventListener('click', e => { if (D.moved) { e.preventDefault(); e.stopPropagation(); D.moved = false; } }, true);   // a drag never fires the card's link
    addEventListener('wheel', () => { D.coast = false; }, { passive: true });
    gsap.ticker.add((t, dms) => {
      if (!D.coast) return;
      const dt = Math.min(dms, 50) / 1000;
      D.v *= Math.exp(-4.2 * dt);
      const y = D.y + D.v * dt;
      if (Math.abs(D.v) < 8 || y <= st.start || y >= st.end) D.coast = false;
      goto(y);
    });
  }
  track.dataset.cursor = 'اسحب';
  /* =========================================================
     COMPARE — kit configurator with motion
     ========================================================= */
  const KITS = {
    pro: { price: 429, old: 600, note: 'أو 4 دفعات بـ 107 ر.س · 10 أدوات · 4 مكاين', img: 'assets/p/kit-pro.jpg', img2: 'assets/p/kit-pro-items.jpg', alt: 'شنطة 360 برو', big: 10, tag: 'الأكثر طلبًا', cap: '360 برو · 4 مكاين', add: 'أضف البرو للسلة' },
    eco: { price: 349, old: 490, note: 'أو 4 دفعات بـ 87 ر.س · 5 أدوات · مكينتين', img: 'assets/p/kit-eco.jpg', img2: 'assets/p/kit-eco-items.jpg', alt: 'شنطة 360 الاقتصادية', big: 5, tag: 'الأساسيات', cap: '360 الاقتصادية · مكينتين', add: 'أضف الاقتصادية للسلة' },
  };
  let kit = 'pro';
  const priceO = { v: 429 }, bigO = { v: 10 };
  function setKit(k, instant) {
    if (k === kit && !instant) return;
    kit = k; const d = KITS[k];
    $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.kit === k));
    gsap.to('#knob', { x: k === 'pro' ? 0 : '-100%', duration: 0.6, ease: 'expo.out' });
    gsap.to(priceO, { v: d.price, duration: 0.9, ease: 'expo.out', onUpdate: () => { $('#cfgPrice').textContent = Math.round(priceO.v); } });
    gsap.to(bigO, { v: d.big, duration: 0.9, ease: 'expo.out', onUpdate: () => { $('#cfgBig').textContent = Math.round(bigO.v); $('#cfgOf').textContent = `${Math.round(bigO.v)} / 10`; } });
    $('#cfgOld').textContent = d.old; $('#cfgNote').textContent = d.note; $('#cfgAdd').textContent = d.add;
    $$('#cfgList li').forEach((li, i) => {
      const on = li.dataset.in.split(' ').includes(k);
      setTimeout(() => {
        li.classList.toggle('off', !on);
        if (li.dataset[k]) li.querySelector('.t').textContent = li.dataset[k];
      }, i * 45);
    });
    // stage: wipe the photo, swap, wipe back in
    gsap.timeline()
      .to('#cfgShot', { clipPath: 'inset(0 0 0 100%)', scale: 0.96, duration: 0.4, ease: 'expo.in' })
      .add(() => { $('#cfgImg').src = d.img; $('#cfgImg').alt = d.alt + ' مفتوحة'; $('#cfgImg2').src = d.img2; $('#cfgImg2').alt = 'محتويات ' + d.alt; $('#cfgTag').textContent = d.tag; $('#cfgCap').textContent = d.cap; })
      .fromTo('#cfgShot', { clipPath: 'inset(0 100% 0 0)', scale: 1.04 }, { clipPath: 'inset(0 0% 0 0)', scale: 1, duration: 0.7, ease: 'expo.out' });
  }
  $$('.seg button').forEach(b => b.addEventListener('click', () => setKit(b.dataset.kit)));
  gsap.set('#cfgShot', { clipPath: 'inset(0 0% 0 0)' });
  // two views per kit: the open case, and its contents laid out
  $$('.cfg-view button').forEach(b => b.addEventListener('click', () => {
    const items = b.dataset.v === 'items';
    $$('.cfg-view button').forEach(x => x.setAttribute('aria-pressed', x === b));
    $('#cfgShot').classList.toggle('show-items', items);
  }));
  const cfgTl = gsap.timeline({ scrollTrigger: { trigger: '#config', start: 'top 80%', once: true } });
  cfgTl.from('.cfg-stage', { y: 60, autoAlpha: 0, duration: 1, ease: 'expo.out' })
    .from('#cfgShot', { scale: 0.85, rotate: -6, duration: 1.2, ease: 'expo.out' }, 0.1)
    .from('.cfg-panel > *', { y: 24, autoAlpha: 0, duration: 0.8, stagger: 0.06, ease: 'expo.out' }, 0.1)
    .from('#cfgList li', { x: 30, autoAlpha: 0, duration: 0.6, stagger: 0.04, ease: 'expo.out' }, 0.3);
  // hint: nudge the switch once it's seen
  ScrollTrigger.create({ trigger: '#config', start: 'top 45%', once: true, onEnter: () => { setTimeout(() => setKit('eco'), 900); setTimeout(() => setKit('pro'), 2600); } });

  /* =========================================================
     SHOP — one row: drag, arrows, wheel, filter
     ========================================================= */
  /* the row is a transform slider (no native scroll + snap fighting the drag):
     x = 0 shows the first card on the right; x grows to reveal cards on the left */
  const rail = $('#rail'), railVp = $('#railVp'), cards = $$('#rail .card');
  const R = { x: 0, tx: 0, max: 0, down: false, sx: 0, sX: 0, moved: 0, v: 0, lx: 0, lt: 0 };
  const visCards = () => cards.filter(c => !c.hidden);
  const measureRail = () => { R.max = Math.max(0, rail.scrollWidth - railVp.clientWidth); R.tx = clamp(R.tx, 0, R.max); };
  const snaps = () => {
    const pad = parseFloat(getComputedStyle(rail).paddingRight) || 0, W = rail.offsetWidth;
    const s = visCards().map(c => clamp(W - c.offsetLeft - c.offsetWidth - pad, 0, R.max));
    s.push(R.max); return [...new Set(s.map(Math.round))].sort((a, b) => a - b);
  };
  const snapTo = v => { const s = snaps(); return s.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, s[0] || 0); };
  const railStep = dir => { const s = snaps(); const cur = snapTo(R.tx); const i = s.indexOf(cur); R.tx = s[clamp(i + dir, 0, s.length - 1)]; };
  $('#railNext').addEventListener('click', () => railStep(1));
  $('#railPrev').addEventListener('click', () => railStep(-1));
  railVp.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button,a')) return;
    measureRail(); Object.assign(R, { down: true, sx: e.clientX, sX: R.tx, moved: 0, v: 0, lx: e.clientX, lt: performance.now() });
    try { railVp.setPointerCapture(e.pointerId); } catch (_) {};
  });
  railVp.addEventListener('pointermove', e => {
    if (!R.down) return;
    const dx = e.clientX - R.sx; R.moved = Math.max(R.moved, Math.abs(dx));
    if (R.moved > 5) railVp.classList.add('dragging');
    let n = R.sX + dx;
    if (n < 0) n *= 0.3; else if (n > R.max) n = R.max + (n - R.max) * 0.3;       // rubber band at the ends
    R.tx = n; R.x = n;                                                            // follow the finger 1:1
    const now = performance.now(), dt = Math.max(1, now - R.lt); R.v = (e.clientX - R.lx) / dt; R.lx = e.clientX; R.lt = now;
  });
  const railUp = () => {
    if (!R.down) return; R.down = false; railVp.classList.remove('dragging');
    R.tx = snapTo(clamp(R.tx + R.v * 260, 0, R.max));                             // throw, then settle on a card
  };
  railVp.addEventListener('pointerup', railUp); railVp.addEventListener('pointercancel', railUp);
  railVp.addEventListener('click', e => { if (R.moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
  let wheelT;
  railVp.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;                       // vertical wheel keeps scrolling the page
    e.preventDefault(); measureRail(); R.tx = clamp(R.tx - e.deltaX, 0, R.max);
    clearTimeout(wheelT); wheelT = setTimeout(() => { R.tx = snapTo(R.tx); }, 140);
  }, { passive: false });
  addEventListener('resize', measureRail);
  const updateProg = () => { $('#railProg').style.transform = `scaleX(${0.12 + 0.88 * (R.max > 0 ? clamp(R.x / R.max, 0, 1) : 1)})`; };
  let railLast = null;
  gsap.ticker.add(() => {
    if (!R.down) { const d = R.tx - R.x; R.x = Math.abs(d) < 0.3 ? R.tx : R.x + d * 0.14; }
    if (R.x === railLast) return;                  // idle: write nothing, so the page scroll stays smooth
    railLast = R.x;
    rail.style.transform = `translate3d(${R.x.toFixed(1)}px,0,0)`;
    updateProg();
  });
  measureRail();
  gsap.from(cards, { x: -80, autoAlpha: 0, duration: 1, stagger: 0.06, ease: 'expo.out', scrollTrigger: { trigger: rail, start: 'top 85%', once: true } });
  function filter(f) {
    if (!['all', 'machines', 'kits', 'acc'].includes(f)) return;
    $$('.chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.f === f));
    gsap.to(railVp, { autoAlpha: 0, x: 30, duration: 0.25, ease: 'power2.in', onComplete: () => {
      cards.forEach(c => { c.hidden = !(f === 'all' || c.dataset.tags === f); });
      R.x = R.tx = 0; measureRail(); updateProg();
      gsap.fromTo(railVp, { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, duration: 0.6, ease: 'expo.out' });
      gsap.fromTo(cards.filter(c => !c.hidden), { y: 30 }, { y: 0, duration: 0.7, stagger: 0.05, ease: 'expo.out' });
    } });
  }
  $$('.chip').forEach(c => c.addEventListener('click', () => filter(c.dataset.f)));
  updateProg();

  let cartN = 0;
  const bump = () => { cartN++; $('#cartN').textContent = cartN; gsap.fromTo('.cart-n', { scale: 1.8 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1,.4)' }); };
  $$('.card .add').forEach(b => b.addEventListener('click', bump));
  $('#cfgAdd').addEventListener('click', bump);

  /* =========================================================
     CIRCLE — the 360° motif opens into the brand film
     ========================================================= */
  gsap.set('#circleCopy', { autoAlpha: 0, y: 40 });
  // the film opens through the brand icon: the scissors spin a full 360° while a disc grows out of their
  // centre, then that disc opens to the full frame. It is a live SVG clip-path (the logo paths already in
  // the page + one circle), so every frame is drawn synchronously: nothing to decode, nothing to flicker.
  const cm = $('#circleMedia'), revealO = { p: 0 }, SVG_NS = 'http://www.w3.org/2000/svg';
  const rsvg = document.createElementNS(SVG_NS, 'svg'); rsvg.setAttribute('width', 0); rsvg.setAttribute('height', 0); rsvg.setAttribute('aria-hidden', 'true'); rsvg.style.position = 'absolute';
  const rclip = document.createElementNS(SVG_NS, 'clipPath'); rclip.id = 'revClip'; rclip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const rparts = ['lg-comb', 'lg-blade', 'lg-pivot', 'lg-handle'].map(id => { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', document.getElementById(id).getAttribute('d')); p.setAttribute('clip-rule', 'evenodd'); rclip.appendChild(p); return p; });
  const rdisc = document.createElementNS(SVG_NS, 'circle'); rclip.appendChild(rdisc); rsvg.appendChild(rclip); cm.parentElement.appendChild(rsvg);
  let lastKey = '';
  const paintReveal = () => {
    const p = revealO.p, sm = x => x * x * (3 - 2 * x);
    const W = cm.clientWidth, H = cm.clientHeight, vmin = Math.min(W, H) / 100, far = Math.hypot(W, H) / 2 + 40;
    const k = sm(clamp((p - 0.08) / 0.34, 0, 1));         // 0 → 1: spin, shrink into the disc
    const o = sm(clamp((p - 0.38) / 0.47, 0, 1));         // 0 → 1: the disc opens to full frame
    const disc = 15.5 * vmin, r = k * disc + o * (far - disc);
    const key = W + 'x' + H + '|' + k.toFixed(3) + '|' + r.toFixed(0);
    if (key === lastKey) return; lastKey = key;
    if (o >= 1) { cm.style.clipPath = cm.style.webkitClipPath = 'none'; return; }   // fully open: no clip at all
    const tf = `translate(${(W / 2).toFixed(1)} ${(H / 2).toFixed(1)}) rotate(${(k * 360).toFixed(2)}) scale(${(32 * vmin / 425 * (1 - 0.5 * k)).toFixed(4)}) translate(-202 -212)`;
    rparts.forEach(el => el.setAttribute('transform', tf));
    rdisc.setAttribute('cx', (W / 2).toFixed(1)); rdisc.setAttribute('cy', (H / 2).toFixed(1)); rdisc.setAttribute('r', Math.max(0, r).toFixed(1));
    cm.style.clipPath = cm.style.webkitClipPath = 'url(#revClip)';
  };
  paintReveal(); addEventListener('resize', paintReveal);
  gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '#circle', start: 'top top', end: 'bottom bottom', scrub: 0.5, onUpdate: s => { window.__circP = s.progress; } } })
    .fromTo(revealO, { p: 0 }, { p: 1, duration: 1, onUpdate: paintReveal }, 0)
    .fromTo('#ringText', { scale: 1 }, { scale: 2.6, duration: 1 }, 0)
    .to('#ringText', { autoAlpha: 0, duration: 0.3 }, 0.3)
    .to('#circleCopy', { autoAlpha: 1, y: 0, duration: 0.3 }, 0.68);
  gsap.to('#ringText svg', { rotation: -360, duration: 36, repeat: -1, ease: 'none' });

  /* =========================================================
     FOOTER — the logo is alive: scissors follow the pointer,
     letters wave, digits flip; it assembles on arrival
     ========================================================= */
  const fA = $('#fA'), fB = $('#fB'), letters = $$('#fWord .fl'), digits = $$('#fNum .fd'), flogo = $('#footLogo');
  gsap.set([fA, fB], { svgOrigin: PIV });
  gsap.set(digits, { transformOrigin: '50% 50%' });
  const fsnip = () => gsap.timeline().to(fA, { rotation: 32, duration: 0.14, ease: 'power3.in', svgOrigin: PIV }).to(fB, { rotation: -32, duration: 0.14, ease: 'power3.in', svgOrigin: PIV }, '<').to([fA, fB], { rotation: 0, duration: 0.5, ease: 'back.out(2.4)', svgOrigin: PIV });
  const flip = el => { if (el._f) return; el._f = 1; const a = { v: 0 }; gsap.to(a, { v: 360, duration: 0.9, ease: 'expo.out', onUpdate: () => gsap.set(el, { scaleX: Math.cos(a.v * Math.PI / 180) }), onComplete: () => { el._f = 0; } }); };
  gsap.set(letters, { y: 160, autoAlpha: 0 }); gsap.set(digits, { autoAlpha: 0 }); gsap.set('#fIcon', { autoAlpha: 0, scale: 0.8, transformOrigin: '50% 50%' });
  ScrollTrigger.create({ trigger: flogo, start: 'top 88%', once: true, onEnter: () => {
    gsap.to('#fIcon', { autoAlpha: 1, scale: 1, duration: 0.8, ease: 'expo.out', onComplete: fsnip });
    gsap.to(letters, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.05, ease: 'expo.out', delay: 0.1 });
    digits.forEach((d, i) => gsap.delayedCall(0.3 + i * 0.12, () => { gsap.set(d, { autoAlpha: 1 }); flip(d); }));
  } });
  if (fine) {
    let boxes = [];
    const measure = () => { boxes = letters.map(l => { const r = l.getBoundingClientRect(); return r.left + r.width / 2; }); };
    flogo.addEventListener('pointerenter', measure);
    flogo.addEventListener('pointermove', e => {
      const r = flogo.getBoundingClientRect(), px = (e.clientX - r.left) / r.width;
      if (px < 0.32) { const open = clamp((0.32 - px) / 0.32, 0, 1); gsap.to(fA, { rotation: -26 * open, duration: 0.4, svgOrigin: PIV }); gsap.to(fB, { rotation: 26 * open, duration: 0.4, svgOrigin: PIV }); }
      letters.forEach((l, i) => { const d = Math.abs(e.clientX - boxes[i]); gsap.to(l, { y: -Math.max(0, 1 - d / 140) * 34, duration: 0.45, ease: 'power3.out' }); });
    });
    flogo.addEventListener('pointerleave', () => { gsap.to(letters, { y: 0, duration: 0.8, ease: 'elastic.out(1,.4)' }); fsnip(); });
    digits.forEach(d => d.addEventListener('pointerenter', () => flip(d)));
    $('#fIcon').addEventListener('click', fsnip);
  }

  /* NAV logo — the same hover life as the footer, scaled to its size */
  const nlogo = $('#navLogo');
  if (fine && nlogo) {
    const nA = $('#nA'), nB = $('#nB'), nl = $$('#nWord .nl'), nd = $$('#nNum .nd');
    gsap.set([nA, nB], { svgOrigin: PIV }); gsap.set(nd, { transformOrigin: '50% 50%' });
    const nsnip = () => gsap.timeline().to(nA, { rotation: 32, duration: 0.14, ease: 'power3.in', svgOrigin: PIV }).to(nB, { rotation: -32, duration: 0.14, ease: 'power3.in', svgOrigin: PIV }, '<').to([nA, nB], { rotation: 0, duration: 0.5, ease: 'back.out(2.4)', svgOrigin: PIV });
    let nb = [], nr = null;
    const brand = nlogo.closest('a') || nlogo;
    brand.addEventListener('pointerenter', () => {
      nr = nlogo.getBoundingClientRect(); nb = nl.map(l => { const r = l.getBoundingClientRect(); return r.left + r.width / 2; });
      nsnip(); nd.forEach((d, i) => gsap.delayedCall(i * 0.08, () => flip(d)));
    });
    brand.addEventListener('pointermove', e => {
      if (!nr) return;
      const px = (e.clientX - nr.left) / nr.width, reach = nr.width * 0.44;
      if (px < 0.32) { const open = clamp((0.32 - px) / 0.32, 0, 1); gsap.to(nA, { rotation: -26 * open, duration: 0.4, svgOrigin: PIV }); gsap.to(nB, { rotation: 26 * open, duration: 0.4, svgOrigin: PIV }); }
      nl.forEach((l, i) => { const d = Math.abs(e.clientX - nb[i]); gsap.to(l, { y: -Math.max(0, 1 - d / reach) * 34, duration: 0.45, ease: 'power3.out' }); });
    });
    brand.addEventListener('pointerleave', () => { nr = null; gsap.to(nl, { y: 0, duration: 0.8, ease: 'elastic.out(1,.4)' }); nsnip(); });
  }

  /* ---------- cursor + magnetic (desktop) ---------- */
  if (fine && !reduce) {
    const cur = $('#cursor'), txt = $('#cursorTxt');
    const xs = gsap.quickTo(cur, 'x', { duration: 0.12, ease: 'power3' }), ys = gsap.quickTo(cur, 'y', { duration: 0.12, ease: 'power3' });
    addEventListener('pointermove', e => {
      xs(e.clientX); ys(e.clientY);
      const t = e.target instanceof Element ? e.target : null;
      const d = t && t.closest('[data-cursor]');
      cur.classList.toggle('drag', !!d);
      if (d) txt.textContent = d.dataset.cursor;
      cur.classList.toggle('link', !d && !!(t && t.closest('a,button,input,label,.qa-q')));
    });
    addEventListener('pointerdown', () => cur.classList.add('down'));
    addEventListener('pointerup', () => cur.classList.remove('down'));
    document.addEventListener('pointerleave', () => cur.classList.remove('drag', 'link'));
    $('#gl').dataset.cursor = 'اسحب'; $('#railVp').dataset.cursor = 'اسحب'; $('#revRow').dataset.cursor = 'اسحب';
    $$('[data-magnetic]').forEach(el => {
      const qx = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'elastic.out(1,.4)' }), qy = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'elastic.out(1,.4)' });
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); qx((e.clientX - r.left - r.width / 2) * 0.3); qy((e.clientY - r.top - r.height / 2) * 0.4); });
      el.addEventListener('pointerleave', () => { qx(0); qy(0); });
    });
  }

  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
  addEventListener('load', () => ScrollTrigger.refresh());
})();
