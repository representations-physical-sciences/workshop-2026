(() => {
  const root = document.documentElement;
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileNav = document.querySelector('[data-mobile-nav]');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const favicon = document.querySelector('#site-favicon');
  const savedTheme = localStorage.getItem('rps-theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const applyTheme = (theme) => {
    root.dataset.theme = theme;
    themeColor?.setAttribute('content', theme === 'dark' ? '#0e1724' : '#f4f1ea');
    favicon?.setAttribute('href', theme === 'dark' ? 'assets/favicon-dark.svg' : 'assets/favicon-light.svg');
    themeToggle?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  };

  applyTheme(savedTheme || (systemPrefersDark ? 'dark' : 'light'));

  themeToggle?.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem('rps-theme', nextTheme);
  });

  const closeMenu = () => {
    if (!menuToggle || !mobileNav) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    mobileNav.hidden = true;
  };

  menuToggle?.addEventListener('click', () => {
    const willOpen = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(willOpen));
    if (mobileNav) mobileNav.hidden = !willOpen;
  });

  mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) closeMenu();
  });

  const paperFaq = document.querySelector('.paper-faq');
  const paperFaqSummary = paperFaq?.querySelector('summary');
  const paperFaqContent = paperFaq?.querySelector('.paper-faq-content');
  let paperFaqAnimation = null;
  let paperFaqContentAnimation = null;
  let paperFaqIsClosing = false;
  let paperFaqIsExpanding = false;

  const finishPaperFaqAnimation = (open) => {
    if (!paperFaq) return;
    paperFaq.open = open;
    paperFaq.style.height = '';
    paperFaq.style.overflow = '';
    paperFaqContentAnimation?.cancel();
    paperFaqAnimation = null;
    paperFaqContentAnimation = null;
    paperFaqIsClosing = false;
    paperFaqIsExpanding = false;
  };

  const animatePaperFaq = (open) => {
    if (!paperFaq || !paperFaqSummary || !paperFaqContent) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paperFaqAnimation?.cancel();
      paperFaqContentAnimation?.cancel();
      finishPaperFaqAnimation(open);
      return;
    }

    const startHeight = `${paperFaq.offsetHeight}px`;
    const currentContentOpacity = paperFaqContentAnimation
      ? getComputedStyle(paperFaqContent).opacity
      : (open ? '0' : '1');

    paperFaqAnimation?.cancel();
    paperFaqContentAnimation?.cancel();

    if (open) paperFaq.open = true;

    const borderHeight = paperFaq.offsetHeight - paperFaq.clientHeight;
    const endHeight = open
      ? `${paperFaqSummary.offsetHeight + paperFaqContent.offsetHeight + borderHeight}px`
      : `${paperFaqSummary.offsetHeight + borderHeight}px`;

    paperFaq.style.overflow = 'hidden';
    paperFaqIsClosing = !open;
    paperFaqIsExpanding = open;

    paperFaqAnimation = paperFaq.animate(
      { height: [startHeight, endHeight] },
      { duration: open ? 320 : 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
    paperFaqContentAnimation = paperFaqContent.animate(
      { opacity: [currentContentOpacity, open ? '1' : '0'] },
      { duration: open ? 260 : 180, easing: 'ease-out', fill: 'forwards' }
    );

    paperFaqAnimation.onfinish = () => finishPaperFaqAnimation(open);
    paperFaqAnimation.oncancel = () => {
      paperFaqIsClosing = false;
      paperFaqIsExpanding = false;
    };
  };

  paperFaqSummary?.addEventListener('click', (event) => {
    event.preventDefault();
    const willOpen = paperFaqIsClosing || !paperFaq?.open;
    animatePaperFaq(willOpen);
  });

  const countdowns = document.querySelectorAll('[data-countdown-target]');
  const formatCountdownPart = (value) => String(value).padStart(2, '0');

  const updateCountdowns = () => {
    const now = Date.now();

    countdowns.forEach((countdown) => {
      const target = Date.parse(countdown.dataset.countdownTarget);
      const remaining = target - now;

      if (!Number.isFinite(target) || remaining <= 0) {
        countdown.textContent = countdown.dataset.countdownComplete || 'Date reached';
        countdown.classList.add('is-complete');
        countdown.removeAttribute('aria-label');
        return;
      }

      const days = Math.floor(remaining / 86_400_000);
      const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);

      countdown.textContent = `${formatCountdownPart(days)} Days, ${formatCountdownPart(hours)} Hours, ${formatCountdownPart(minutes)} Minutes away`;
      countdown.setAttribute('aria-label', `${days} days, ${hours} hours, and ${minutes} minutes remaining`);
      countdown.classList.remove('is-complete');
    });
  };

  updateCountdowns();
  if (countdowns.length) window.setInterval(updateCountdowns, 30_000);
})();
