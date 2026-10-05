(() => {
  document.querySelectorAll('[data-load-video]').forEach((button) => {
    button.addEventListener('click', () => {
      const container = button.closest('[data-video-embed]');
      const frame = document.createElement('iframe');
      frame.src = container.dataset.videoEmbed;
      frame.title = 'Virtual video poster';
      frame.allow = 'fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      container.replaceChildren(frame);
      frame.focus();
    });
  });
})();
