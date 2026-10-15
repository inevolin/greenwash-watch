/* Greenwashing Watchdog · motion layer. Purely presentational: never touches app.js state. */
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasG = window.gsap && window.ScrollTrigger;
  document.documentElement.classList.add('js');
  if (RM || !hasG) { document.documentElement.classList.remove('js'); drawStatic(); return; }
  gsap.registerPlugin(ScrollTrigger);

  /* inertial scroll */
  if (window.Lenis) {
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]'); if (!a) return;
      const t = document.querySelector(a.getAttribute('href')); if (!t) return;
      e.preventDefault(); lenis.scrollTo(t, { offset: -40, duration: 1.6 });
    });
    window.__lenis = lenis;
  }

  /* HERO: leaf → smoke particles, redaction, verdict */
  const cv = document.getElementById('leafCanvas'), ctx = cv.getContext('2d');
  let W, H, DPR, pts = [];
  const leafPath = new Path2D('M70 340C40 200 150 70 340 55c12 160-80 280-270 285z');
  function build() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * DPR; cv.height = H * DPR;
    const mob = W <= 768; const size = mob ? Math.min(W * 0.62, H * 0.34) : Math.min(H * 0.62, W * 0.48);
    const ox = mob ? W - size - 8 : W - size - W * 0.06, oy = mob ? H * 0.5 - size * 0.1 : H * 0.5 - size / 2;
    const off = document.createElement('canvas'); off.width = off.height = 400; const o = off.getContext('2d');
    o.fill(leafPath); o.globalCompositeOperation = 'destination-out'; o.lineWidth = 6;
    o.stroke(new Path2D('M85 325C160 250 240 170 330 70'));
    const d = o.getImageData(0, 0, 400, 400).data, step = W < 760 ? 7 : 5; pts = [];
    for (let y = 0; y < 400; y += step) for (let x = 0; x < 400; x += step) if (d[(y * 400 + x) * 4 + 3] > 128) {
      pts.push({ x: ox + (x / 400) * size, y: oy + (y / 400) * size, vx: (Math.random() - 0.5) * 2, vy: -0.4 - Math.random() * 1.6,
        r: Math.random(), s: 1 + Math.random() * 1.6, d: (400 - y) / 400 * 0.25 + Math.random() * 0.25 });
    }
  }
  let prog = 0, t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      const k = Math.max(0, Math.min(1, (prog - p.d) / 0.55)), e = k * k;
      const x = p.x + Math.sin(t * 0.8 + p.r * 6) * (0.6 + e * 40) + p.vx * e * 160;
      const y = p.y + p.vy * e * H * 0.45 + Math.cos(t * 0.6 + p.r * 9) * e * 20;
      const g = Math.round(47 + (160 - 47) * e), gr = Math.round(125 + (156 - 125) * e), b = Math.round(85 + (150 - 85) * e);
      ctx.globalAlpha = (1 - e * 0.85) * (k > 0.99 ? 0.15 : 1);
      ctx.fillStyle = `rgb(${g},${gr},${b})`;
      const s = p.s * (1 + e * 5);
      if (e > 0.05) { ctx.beginPath(); ctx.arc(x, y, s, 0, 6.283); ctx.fill(); } else ctx.fillRect(x, y, p.s * 1.6, p.s * 1.6);
    }
    if (visible) requestAnimationFrame(frame); else running = false;
  }
  let visible = true, running = false;
  const start = () => { if (!running) { running = true; requestAnimationFrame(frame); } };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(cv);
  build(); start(); let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(build, 200); });

  const reds = gsap.utils.toArray('.claim-title .redact');
  gsap.set(reds, { '--r': 0 });
  const MOB = matchMedia('(max-width: 768px)').matches;
  if (true) {
    /* all widths: no pin. A real claim is struck through and stamped within ~3s, leaving it readable. */
    const pr = { v: 0 };
    gsap.timeline({ delay: 0.9 })
      .to(pr, { v: 1.25, duration: 2.6, ease: 'power1.inOut', onUpdate: () => { prog = pr.v; } }, 0)
      .to(reds, { '--r': 1, duration: 0.32, stagger: 0.12, ease: 'power2.inOut' }, 0.2)
      .fromTo('.hero-stamp', { opacity: 0, scale: 2.2, rotate: -18 }, { opacity: 1, scale: 1, rotate: -6, duration: 0.45, ease: 'back.out(3)' }, 1.05)
      .to('.hero-pin', { x: () => (Math.random() - 0.5) * 4, duration: 0.03, repeat: 3, yoyo: true, clearProps: 'x' }, 1.12)
      .fromTo('.hero-exhibit', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 1.35)
      .to('.rec', { color: '#D97757', duration: 0.3 }, 1.05);
  } else {
  const tl = gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom bottom', scrub: 0.8,
    onUpdate: (s) => { prog = s.progress * 1.4; } } });
  tl.to('.claim-title', { color: '#1f1e1d', duration: 0.3 }, 0.1)
    .to(reds, { '--r': 1, duration: 0.12, stagger: 0.07, ease: 'power2.inOut' }, 0.25)
    .to('.hero-lead, .scroll-cue', { opacity: 0, y: -20, duration: 0.15 }, 0.2)
    .fromTo('.hero-stamp', { opacity: 0, scale: 2.4, rotate: -20 }, { opacity: 1, scale: 1, rotate: -8, duration: 0.12, ease: 'back.out(3)' }, 0.78)
    .to('.hero-pin', { x: () => (Math.random() - 0.5) * 6, duration: 0.02, repeat: 3, yoyo: true }, 0.86)
    .to('.rec', { color: '#D97757', duration: 0.1 }, 0.8);
  }
  gsap.from('.claim-title .w', { yPercent: 110, opacity: 0, rotate: 3, duration: 1.3, stagger: 0.07, ease: 'expo.out', delay: 0.15 });
  gsap.from('.hero-meta, .hero-cta, .hero-lead', { opacity: 0, y: 16, duration: 1, stagger: 0.1, delay: 0.7, ease: 'power3.out' });

  /* kinetic headings */
  const touch = matchMedia('(hover: none), (max-width: 768px)').matches;
  document.querySelectorAll('.kinetic').forEach((h) => {
    h.innerHTML = h.textContent.split(' ').map((w) => `<span style="display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.06em">${[...w].map((c) => `<span class="ch">${c}</span>`).join('')}</span>`).join(' ');
    gsap.from(h.querySelectorAll('.ch'), {
      yPercent: touch ? 70 : 115, rotate: touch ? 0 : 8, duration: touch ? 0.85 : 1.1, ease: 'expo.out', stagger: touch ? 0.018 : 0.025,
      scrollTrigger: { trigger: h, start: 'top 88%' }
    });
  });

  /* method: horizontal pinned scrub */
  const track = document.querySelector('.how-track');
  const mm = gsap.matchMedia();
  mm.add('(min-width: 761px)', () => {
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.how', pin: '.how-pin', start: 'top top', end: () => '+=' + (dist() + innerHeight * 0.6), scrub: 1, invalidateOnRefresh: true } });
  });
  document.querySelectorAll('.step').forEach((s) => {
    gsap.to(s, { '--p': 1, ease: 'none', scrollTrigger: { trigger: '.how', start: 'top 60%', end: () => '+=' + innerHeight * 1.4, scrub: true } });
  });
  gsap.utils.toArray('.step').forEach((s, i) => gsap.set(s, { '--p': 0 }));

  /* stat parallax — desktop only (mobile uses swipe cards) */
  mm.add('(min-width: 769px)', () => {
    gsap.utils.toArray('.stat b').forEach((b, i) => gsap.fromTo(b, { yPercent: 20 + i * 12 }, { yPercent: -10, ease: 'none', scrollTrigger: { trigger: '.stats', scrub: true } }));
  });

  /* case files drop onto the board as they render */
  const grid = document.getElementById('grid');
  new MutationObserver(() => {
    const touchUI = matchMedia('(max-width: 768px)').matches;
    gsap.from(grid.children, {
      y: touchUI ? 24 : 60,
      rotate: touchUI ? 0 : () => gsap.utils.random(-6, 6),
      opacity: 0, duration: touchUI ? 0.55 : 0.9, stagger: touchUI ? 0.04 : 0.05, ease: 'expo.out',
      clearProps: 'transform,opacity'
    });
    ScrollTrigger.refresh();
  }).observe(grid, { childList: true });

  /* cinematic search state */
  const progress = document.getElementById('progress');
  new MutationObserver(() => document.body.classList.toggle('investigating', !progress.classList.contains('hidden'))).observe(progress, { attributes: true, attributeFilter: ['class'] });
  const report = document.getElementById('report');
  new MutationObserver(() => { ScrollTrigger.refresh(); }).observe(report, { childList: true });
  document.getElementById('form').addEventListener('submit', () => {
    gsap.fromTo('#brand', { letterSpacing: '0.1em' }, { letterSpacing: '-0.02em', duration: 1.2, ease: 'expo.out' });
    window.__lenis && window.__lenis.scrollTo('#research', { offset: -40, duration: 1.4 });
  });

  /* cursor + magnetic */
  if (fine) {
    const cur = document.querySelector('.cursor');
    const qx = gsap.quickTo(cur, 'x', { duration: 0.25, ease: 'power3' }), qy = gsap.quickTo(cur, 'y', { duration: 0.25, ease: 'power3' });
    addEventListener('pointermove', (e) => { qx(e.clientX); qy(e.clientY); });
    document.addEventListener('pointerover', (e) => cur.classList.toggle('big', !!e.target.closest('a,button,.card,input')));
    document.addEventListener('pointermove', (e) => {
      const m = e.target.closest('.magnetic,.btn,.filters button');
      document.querySelectorAll('.is-mag').forEach((el) => { if (el !== m) { el.classList.remove('is-mag'); gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1,.4)' }); } });
      if (!m) return; m.classList.add('is-mag');
      const r = m.getBoundingClientRect();
      gsap.to(m, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.4, duration: 0.4, ease: 'power3' });
    });
    /* case file tilt */
    grid.addEventListener('pointermove', (e) => {
      const c = e.target.closest('.card'); if (!c) return; const r = c.getBoundingClientRect();
      gsap.to(c.querySelector('.inner'), { rotateY: ((e.clientX - r.left) / r.width - 0.5) * 10, rotateX: -((e.clientY - r.top) / r.height - 0.5) * 10, duration: 0.5 });
    });
    grid.addEventListener('pointerout', (e) => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) gsap.to(c.querySelector('.inner'), { rotateX: 0, rotateY: 0, duration: 0.8, ease: 'elastic.out(1,.5)' }); });
  }
  addEventListener('load', () => ScrollTrigger.refresh());
  const pill = document.querySelector('.cpill');
  if (pill) ScrollTrigger.create({ trigger: '.hero', start: 'bottom 60%', onEnter: () => pill.classList.add('show'), onLeaveBack: () => pill.classList.remove('show') });

  function drawStatic() {}
})();
