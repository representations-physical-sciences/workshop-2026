(() => {
  const scene = document.querySelector('[data-hero-animation]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (!scene || reduceMotion.matches || !window.gsap) return;

  const { gsap } = window;
  const sources = gsap.utils.toArray('.hero-source', scene);
  const bitRow = scene.querySelector('.hero-bit-row');
  const networkLinks = gsap.utils.toArray('.hero-network-link', scene);
  const funnelGlow = scene.querySelector('.hero-funnel-glow');
  const wave = scene.querySelector('.hero-source-line');
  const sourceNetwork = scene.querySelector('.hero-source-particle');
  const sourceCells = gsap.utils.toArray('.hero-source-cell', scene);
  const sourceGridScan = scene.querySelector('.hero-source-grid-scan');

  gsap.set(sources, { autoAlpha: 0, y: 14 });

  gsap.to(sources, {
    autoAlpha: 1,
    y: 0,
    duration: 0.8,
    stagger: 0.12,
    ease: 'power2.out',
  });

  if (bitRow) {
    gsap.fromTo(bitRow, { x: 0 }, {
      x: 190,
      duration: 5.6,
      repeat: -1,
      ease: 'none',
    });
  }

  gsap.to(networkLinks, {
    strokeDashoffset: -18,
    duration: 1.4,
    stagger: 0.1,
    repeat: -1,
    ease: 'none',
  });

  if (wave) {
    gsap.fromTo(wave, {
      strokeDasharray: 180,
      strokeDashoffset: 180,
    }, {
      strokeDashoffset: 0,
      duration: 2.2,
      repeat: -1,
      repeatDelay: 0.65,
      ease: 'power1.inOut',
    });
  }

  if (sourceNetwork) {
    gsap.set(sourceNetwork, {
      transformOrigin: '50% 50%',
      transformPerspective: 640,
    });
    gsap.to(sourceNetwork, {
      rotationY: 360,
      duration: 10,
      repeat: -1,
      ease: 'none',
    });
  }

  if (sourceCells.length) {
    gsap.fromTo(sourceCells, {
      autoAlpha: 0.28,
    }, {
      autoAlpha: 0.94,
      duration: 0.7,
      stagger: 0.24,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  }

  if (sourceGridScan) {
    gsap.fromTo(sourceGridScan, {
      y: 0,
      opacity: 0.14,
    }, {
      y: 54,
      opacity: 0.4,
      duration: 2.8,
      repeat: -1,
      ease: 'none',
    });
  }

  if (funnelGlow) {
    gsap.to(funnelGlow, {
      opacity: 0.18,
      duration: 1.35,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  }
})();
