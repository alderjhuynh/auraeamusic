(() => {
  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const heroInner = document.querySelector('.hero__inner');
  const heroPortrait = document.querySelector('.hero__portrait');
  const fadeWrap = document.querySelector('.fade-wrap');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// interp for bkg wash

  const washStops = [
    { at: 0,    a: '#f0a8b9', b: '#fdeaef' },
    { at: 0.35, a: '#f8d2dc', b: '#fffcfa' },
    { at: 0.6,  a: '#fffcfa', b: '#fffcfa' },
    { at: 1,    a: '#fffcfa', b: '#fffcfa' },
  ];

  function lerpColor(c1, c2, t){
    const p1 = parseInt(c1.slice(1), 16), p2 = parseInt(c2.slice(1), 16);
    const r1 = (p1 >> 16) & 255, g1 = (p1 >> 8) & 255, b1 = p1 & 255;
    const r2 = (p2 >> 16) & 255, g2 = (p2 >> 8) & 255, b2 = p2 & 255;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function washAt(progress){
    for (let i = 0; i < washStops.length - 1; i++){
      const cur = washStops[i], next = washStops[i + 1];
      if (progress >= cur.at && progress <= next.at){
        const t = (progress - cur.at) / (next.at - cur.at || 1);
        return { a: lerpColor(cur.a, next.a, t), b: lerpColor(cur.b, next.b, t) };
      }
    }
    return { a: washStops.at(-1).a, b: washStops.at(-1).b };
  }

  let ticking = false;

  function update(){
    ticking = false;
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const scrollY = window.scrollY;
    const overallProgress = docH > 0 ? Math.min(scrollY / (docH * 0.55), 1) : 0;

    if (!reduceMotion){
      const { a, b } = washAt(overallProgress);
      root.style.setProperty('--wash-a', a);
      root.style.setProperty('--wash-b', b);
    }

    // hero fade
    if (hero && heroInner){
      const vh = window.innerHeight;
      const heroProgress = Math.min(Math.max(scrollY / (vh * 0.9), 0), 1);
      if (!reduceMotion){
        heroInner.style.opacity = String(1 - heroProgress);
        heroInner.style.transform = `translateY(${heroProgress * -40}px)`;
        if (heroPortrait) heroPortrait.style.opacity = String(0.55 * (1 - heroProgress * 0.6));
      }
    }
  }

  function onScroll(){
    if (!ticking){
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  // scroll reveal for content blocks
  const revealTargets = document.querySelectorAll(
    '.bio__grid, .section-lede, .video-frame, .btn--ghost, .link-list, .contact__email, .socials'
  );
  revealTargets.forEach(el => el.classList.add('reveal'));

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting){
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  revealTargets.forEach(el => io.observe(el));

  // nav

  const navLinks = document.querySelectorAll('.nav__link');
  const sections = ['home', 'bio', 'videos', 'music', 'contact']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const sectionIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting){
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.classList.toggle('is-active', link.dataset.section === id);
        });
      }
    });
  }, { threshold: 0.5 });

  sections.forEach(sec => sectionIO.observe(sec));

  const navToggle = document.getElementById('navToggle');
  const navLinksWrap = document.getElementById('navLinks');
  if (navToggle && navLinksWrap){
    navToggle.addEventListener('click', () => {
      const isOpen = navLinksWrap.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinksWrap.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinksWrap.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();