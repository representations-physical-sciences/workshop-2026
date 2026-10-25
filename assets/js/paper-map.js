(() => {
  const widget = document.querySelector('[data-paper-map]');
  if (!widget) return;
  const data = JSON.parse(widget.querySelector('[data-paper-map-data]').textContent);
  const rows = new Map([...document.querySelectorAll('.paper-row')].map((row) => {
    const title = row.querySelector('[data-paper-title]');
    return [title.getAttribute('href').split('/').pop().replace(/\.html$/, ''), {
      row, href: title.getAttribute('href'), title: title.textContent,
      authors: row.querySelector('[data-paper-authors]').textContent,
      abstract: row.querySelector('[data-paper-abstract]').textContent,
    }];
  }));
  const papers = data.papers.map((paper, i) => ({ ...paper, ...rows.get(paper.slug), number: i + 1 }));
  if (!papers.length || papers.some((paper) => !paper.row) || !data.topics?.length) return;
  const bySlug = new Map(papers.map((p) => [p.slug, p]));
  const colors = ['#288a8b', '#a877cb', '#cf7846', '#5483d4', '#be5c89', '#7d9136', '#a88934', '#4c9e79', '#8c779e', '#b87f72', '#718a9d', '#9d934e'];
  const topics = new Map(data.topics.map((t, i) => [t.id, { ...t, color: colors[i] }]));
  const plot = widget.querySelector('[data-map-plot]');
  const canvas = widget.querySelector('[data-map-canvas]');
  const detail = widget.querySelector('[data-map-detail]');
  const sidebar = detail.parentElement;
  const tooltip = widget.querySelector('[data-map-tooltip]');
  const status = widget.querySelector('[data-map-status]');
  const clear = widget.querySelector('[data-map-clear]');
  const expand = widget.querySelector('[data-map-expand]');
  const searchBox = document.querySelector('[data-paper-search]');
  widget.querySelector('[data-map-search-slot]').append(searchBox);
  const search = searchBox.querySelector('input');
  search.placeholder = 'Try “proteins”, “PDE”, a title or an author…';
  const ns = 'http://www.w3.org/2000/svg';
  const html = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const typeset = (node) => {
    if (typeof window.renderMathInElement !== 'function') return;
    window.renderMathInElement(node, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }, { left: '$', right: '$', display: false }],
      throwOnError: false, trust: false, strict: 'ignore', maxSize: 10, maxExpand: 1000,
    });
  };
  const hullLayer = svg('g', { 'aria-hidden': 'true' });
  const edgeLayer = svg('g', { 'aria-hidden': 'true' });
  const dotLayer = svg('g');
  const labelLayer = svg('g');
  plot.append(hullLayer, edgeLayer, dotLayer, labelLayer);
  let activeTopic = null;
  let selected = null;
  let visible = papers;
  let width = 800;
  let height = 540;
  let camera = { x: 0, y: 0, k: 400 };
  let homeScale = 400;
  const dots = new Map();
  const labels = new Map();
  const hulls = new Map();
  const topicButtons = new Map();
  const point = (paper) => [width / 2 + camera.x + paper.tsne[0] * camera.k,
    height / 2 + camera.y - paper.tsne[1] * camera.k];
  function fit(members = visible) {
    if (!members.length) members = papers;
    const xs = members.map((p) => p.tsne[0]);
    const ys = members.map((p) => p.tsne[1]);
    const left = Math.min(...xs), right = Math.max(...xs), bottom = Math.min(...ys), top = Math.max(...ys);
    const k = Math.min((width - (width < 500 ? 55 : 150)) / Math.max(.12, right - left), (height - (height < 400 ? 110 : 150)) / Math.max(.12, top - bottom));
    camera = { x: -(left + right) / 2 * k, y: (top + bottom) / 2 * k, k };
    render();
  }
  function zoom(factor, x = width / 2, y = height / 2) {
    const k = Math.max(homeScale * .5, Math.min(homeScale * 14, camera.k * factor));
    const ratio = k / camera.k;
    camera.x = x - width / 2 - (x - width / 2 - camera.x) * ratio;
    camera.y = y - height / 2 - (y - height / 2 - camera.y) * ratio;
    camera.k = k;
    tooltip.hidden = true;
    render();
  }
  // Monotone-chain convex hulls mark topic neighbourhoods without moving papers.
  function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3) return sorted;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
      const stack = [];
      list.forEach((p) => {
        while (stack.length >= 2 && cross(stack.at(-2), stack.at(-1), p) <= 0) stack.pop();
        stack.push(p);
      });
      return stack.slice(0, -1);
    };
    return [...half(sorted), ...half(sorted.reverse())];
  }
  function render() {
    const matches = new Set(visible);
    const related = new Set(selected?.neighbours.map((n) => n.slug));
    const positions = papers.map(point);
    const named = camera.k / homeScale > 2.1;
    const titleBoxes = [];
    papers.forEach((paper, i) => {
      const node = dots.get(paper.slug);
      node.setAttribute('transform', `translate(${positions[i][0]},${positions[i][1]})`);
      node.classList.toggle('is-muted', !matches.has(paper));
      node.classList.toggle('is-selected', paper === selected);
      node.classList.toggle('is-related', related.has(paper.slug));
      node.setAttribute('tabindex', matches.has(paper) ? '0' : '-1');
      node.setAttribute('aria-pressed', String(paper === selected));
      const title = node.querySelector('text');
      let showTitle = false;
      if (named && matches.has(paper)) {
        const [px, py] = positions[i];
        const textWidth = title.textContent.length * 5.4;
        const right = px + 12 + textWidth < width - 10;
        const left = px - 12 - textWidth > 10;
        const box = { x: right ? px + 12 : px - 12 - textWidth, y: py - 8, w: textWidth, h: 16 };
        showTitle = (right || left) && py > 65 && py < height - 32 && !titleBoxes.some((b) =>
          box.x < b.x + b.w + 8 && box.x + box.w + 8 > b.x && box.y < b.y + b.h + 5 && box.y + box.h + 5 > b.y);
        if (showTitle) titleBoxes.push(box);
        title.setAttribute('x', right ? '12' : '-12');
        title.setAttribute('text-anchor', right ? 'start' : 'end');
      }
      title.style.display = showTitle ? '' : 'none';
    });
    edgeLayer.replaceChildren();
    if (selected) {
      const [x, y] = point(selected);
      selected.neighbours.forEach((n) => {
        const other = bySlug.get(n.slug);
        if (!other || !matches.has(other)) return;
        const [x2, y2] = point(other);
        edgeLayer.append(svg('line', { x1: x, y1: y, x2, y2, class: 'paper-map-edge' }));
      });
    }
    const placed = [];
    for (const topic of topics.values()) {
      const members = papers.filter((p) => p.topic === topic.id);
      const nodes = members.map(point);
      const hull = convexHull(nodes);
      const center = [nodes.reduce((s, p) => s + p[0], 0) / nodes.length, nodes.reduce((s, p) => s + p[1], 0) / nodes.length];
      const expanded = hull.map(([x, y]) => {
        const distance = Math.hypot(x - center[0], y - center[1]) || 1;
        return [x + (x - center[0]) / distance * 18, y + (y - center[1]) / distance * 18];
      });
      hulls.get(topic.id).setAttribute('d', expanded.length >= 3 ? `M${expanded.map((p) => p.join(',')).join('L')}Z` : '');
      hulls.get(topic.id).style.opacity = activeTopic !== null && activeTopic !== topic.id ? '.2' : '1';
      const label = labels.get(topic.id);
      const labelText = width < 500 ? topic.label.replace(' & inverse problems', '').replace(' representations', '')
        .replace(' & reconstruction', '').replace(' & robustness', '').replace(' & forecasting', '').replace(' & PDEs', '') : topic.label;
      const labelWidth = labelText.length * 6.2 + 22;
      label.querySelector('text').textContent = labelText;
      const rect = label.querySelector('rect');
      rect.setAttribute('x', -labelWidth / 2);
      rect.setAttribute('width', labelWidth);
      let best = null;
      const offsets = [[0, -50], [0, 50], [-65, -35], [65, -35], [-65, 40], [65, 40], [0, -90], [0, 90], [-110, 0], [110, 0], [0, -130], [0, 130], [-140, -80], [140, 80], [-140, 80], [140, -80]];
      for (const [dx, dy] of offsets) {
        const x = Math.max(labelWidth / 2 + 8, Math.min(width - labelWidth / 2 - 8, center[0] + dx));
        const y = Math.max(78, Math.min(height - 55, center[1] + dy));
        const box = { x: x - labelWidth / 2, y: y - 13, w: labelWidth, h: 26 };
        const intersections = placed.filter((b) => box.x < b.x + b.w + 6 && box.x + box.w + 6 > b.x && box.y < b.y + b.h + 6 && box.y + box.h + 6 > b.y).length;
        const covering = positions.filter(([px, py]) => px > box.x - 7 && px < box.x + box.w + 7 && py > box.y - 7 && py < box.y + box.h + 7).length;
        const score = intersections * 10000 + covering * 120 + Math.hypot(dx, dy);
        if (!best || score < best.score) best = { x, y, box, score };
      }
      placed.push(best.box);
      label.setAttribute('transform', `translate(${best.x},${best.y})`);
      label.classList.toggle('is-muted', activeTopic !== null && activeTopic !== topic.id);
      // Labels outside the viewport disappear rather than sticking to the edge while panning.
      label.style.display = (width < 500 && topic.count < 10 && activeTopic !== topic.id) || (named && activeTopic === null) || center[0] < -80 || center[0] > width + 80 || center[1] < -80 || center[1] > height + 80 ? 'none' : '';
    }
  }
  function showPreview(paper, x, y) {
    tooltip.replaceChildren(html('span', `${topics.get(paper.topic).label} · Paper ${paper.number}`),
      html('strong', paper.title), html('small', paper.authors), html('small', 'Click to read the abstract →'));
    typeset(tooltip);
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(10, Math.min(width - tooltip.offsetWidth - 10, x + 16))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(height - tooltip.offsetHeight - 12, y + 15))}px`;
  }
  function showResults() {
    selected = null;
    const heading = html('p', `${activeTopic === null ? 'Browse papers' : topics.get(activeTopic).label} · ${visible.length}`, 'paper-map-results-heading');
    const list = html('ol', null, 'paper-map-results');
    [...visible].sort((a, b) => a.title.localeCompare(b.title)).forEach((paper) => {
      const item = html('li');
      const button = html('button', null, 'paper-map-result');
      button.type = 'button';
      button.dataset.mapResult = paper.slug;
      button.style.setProperty('--topic-color', topics.get(paper.topic).color);
      button.append(html('span', `${paper.number}`, 'paper-map-result-number'),
        html('span', topics.get(paper.topic).label, 'paper-map-topic-name'), html('strong', paper.title),
        html('small', paper.authors));
      button.addEventListener('click', () => select(paper));
      button.addEventListener('mouseenter', () => dots.get(paper.slug).classList.add('is-selected'));
      button.addEventListener('mouseleave', () => render());
      item.append(button);
      list.append(item);
    });
    detail.replaceChildren(heading, list);
    if (!visible.length) detail.append(html('p', 'No matches. Try a broader search or clear the topic filter.', 'paper-map-empty'));
    typeset(list);
    sidebar.scrollTop = 0;
    render();
  }
  function select(paper, updateUrl = true) {
    // Keep a recommendation visible even when following it across a topic boundary.
    if (!visible.includes(paper)) {
      activeTopic = null;
      if (search.value) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
      visible = papers.filter((p) => !p.row.hidden);
      updateStatus();
    }
    selected = paper;
    tooltip.hidden = true;
    const back = html('button', `← Back to ${visible.length} papers`, 'paper-map-back');
    back.type = 'button';
    back.addEventListener('click', () => { showResults(); history.replaceState(null, '', location.pathname + location.search); });
    const body = html('div', null, 'paper-map-detail-body');
    body.append(html('p', `${topics.get(paper.topic).label} · Paper ${paper.number}`, 'paper-note'),
      html('h3', paper.title), html('p', paper.authors, 'paper-note'));
    const open = html('a', 'Open paper & materials ↗', 'paper-map-open');
    open.href = paper.href;
    body.append(open);
    const excerpt = html('p', paper.abstract.length > 280 ? paper.abstract.slice(0, 280) + '…' : paper.abstract, 'paper-map-abstract');
    const abstract = html('details');
    abstract.append(html('summary', 'Read full abstract'), html('div', paper.abstract, 'paper-map-abstract'));
    abstract.addEventListener('toggle', () => { excerpt.hidden = abstract.open; });
    body.append(excerpt, abstract, html('h4', 'Related papers'));
    paper.neighbours.forEach((neighbour) => {
      const other = bySlug.get(neighbour.slug);
      if (!other) return;
      const button = html('button', other.title, 'paper-map-neighbour');
      button.type = 'button';
      button.append(html('small', topics.get(other.topic).label));
      button.addEventListener('click', () => select(other));
      body.append(button);
    });
    detail.replaceChildren(back, body);
    typeset(body);
    sidebar.scrollTop = 0;
    const [x, y] = point(paper);
    if (x < 30 || x > width - 30 || y < 30 || y > height - 30) {
      camera.x = -paper.tsne[0] * camera.k;
      camera.y = paper.tsne[1] * camera.k;
    }
    if (updateUrl) history.replaceState(null, '', `#paper=${encodeURIComponent(paper.slug)}`);
    render();
    if (updateUrl && window.innerWidth <= 680) sidebar.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
  function updateStatus() {
    status.textContent = `${visible.length} / ${papers.length} papers`;
    clear.hidden = !search.value && activeTopic === null;
    for (const [id, button] of topicButtons) button.setAttribute('aria-pressed', String(id === activeTopic));
  }
  function filter(resetView = true) {
    if (selected) history.replaceState(null, '', location.pathname + location.search);
    visible = papers.filter((paper) => !paper.row.hidden && (activeTopic === null || paper.topic === activeTopic));
    updateStatus();
    showResults();
    if (resetView) fit();
  }
  function chooseTopic(id) {
    activeTopic = id;
    filter();
    tooltip.hidden = true;
  }
  function topicButton(id, text, count, color) {
    const button = html('button', text, 'paper-map-topic');
    button.type = 'button';
    button.dataset.mapTopic = id === null ? 'all' : id;
    if (color) button.style.setProperty('--topic-color', color);
    button.append(html('span', String(count)));
    button.addEventListener('click', () => chooseTopic(id));
    topicButtons.set(id, button);
    widget.querySelector('[data-map-topics]').append(button);
  }
  topicButton(null, 'All topics', papers.length);
  for (const topic of topics.values()) {
    topicButton(topic.id, topic.label, topic.count, topic.color);
    const hull = svg('path', { class: 'paper-map-hull' });
    hull.style.setProperty('--topic-color', topic.color);
    hulls.set(topic.id, hull);
    hullLayer.append(hull);
    const label = svg('g', { class: 'paper-map-label', role: 'button', tabindex: '0', 'aria-label': `Explore ${topic.label}`, 'data-map-topic-label': topic.id });
    label.style.setProperty('--topic-color', topic.color);
    const labelWidth = topic.label.length * 6.2 + 22;
    const text = svg('text', { y: 4 });
    text.textContent = topic.label;
    label.append(svg('rect', { x: -labelWidth / 2, y: -13, width: labelWidth, height: 26 }), text);
    label.addEventListener('click', () => chooseTopic(activeTopic === topic.id ? null : topic.id));
    label.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseTopic(topic.id); }
    });
    labels.set(topic.id, label);
    labelLayer.append(label);
  }
  for (const paper of papers) {
    const dot = svg('g', { class: 'paper-map-dot', role: 'button', tabindex: '0', 'aria-label': paper.title, 'data-map-paper': paper.slug });
    dot.style.setProperty('--topic-color', topics.get(paper.topic).color);
    const text = svg('text', { x: 12, y: 4, fill: 'var(--ink)', stroke: 'var(--paper)', 'stroke-width': 3,
      'paint-order': 'stroke', 'font-size': 10, 'font-family': 'var(--sans)', 'pointer-events': 'none' });
    text.textContent = paper.title.length > 52 ? paper.title.slice(0, 52) + '…' : paper.title;
    dot.append(svg('circle', { r: 12, class: 'map-dot-hit' }), svg('circle', { r: 6, class: 'map-dot-core' }),
      svg('circle', { r: 9, class: 'map-dot-ring' }), text);
    dot.addEventListener('click', (event) => { if (!suppressClick) { event.stopPropagation(); select(paper); } });
    dot.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(paper); }
    });
    dot.addEventListener('pointerenter', (event) => {
      if (pointers.size || !visible.includes(paper)) return;
      const bounds = canvas.getBoundingClientRect();
      showPreview(paper, event.clientX - bounds.left, event.clientY - bounds.top);
    });
    dot.addEventListener('pointerleave', () => { tooltip.hidden = true; });
    dot.addEventListener('focus', () => {
      const [x, y] = point(paper);
      showPreview(paper, x, y);
    });
    dot.addEventListener('blur', () => { tooltip.hidden = true; });
    dots.set(paper.slug, dot);
    dotLayer.append(dot);
  }
  // All geometry uses viewport pixels: markers and labels stay readable when zooming.
  const pointers = new Map();
  let gesture = null;
  let suppressClick = false;
  const locationInPlot = (event) => {
    const bounds = plot.getBoundingClientRect();
    return [event.clientX - bounds.left, event.clientY - bounds.top];
  };
  const startGesture = () => {
    const values = [...pointers.values()];
    gesture = { camera: { ...camera }, first: values[0], distance: values.length > 1 ? Math.hypot(values[0][0] - values[1][0], values[0][1] - values[1][1]) : null,
      midpoint: values.length > 1 ? [(values[0][0] + values[1][0]) / 2, (values[0][1] + values[1][1]) / 2] : values[0] };
  };
  plot.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // Keep clicks on dots/labels as native clicks; capture only once a drag starts.
    pointers.set(event.pointerId, locationInPlot(event));
    suppressClick = false;
    startGesture();
    tooltip.hidden = true;
  });
  plot.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    const current = locationInPlot(event);
    pointers.set(event.pointerId, current);
    const values = [...pointers.values()];
    if (values.length > 1 && gesture.distance) {
      const distance = Math.hypot(values[0][0] - values[1][0], values[0][1] - values[1][1]);
      const mid = [(values[0][0] + values[1][0]) / 2, (values[0][1] + values[1][1]) / 2];
      camera = { ...gesture.camera };
      zoom(distance / Math.max(1, gesture.distance), ...gesture.midpoint);
      camera.x += mid[0] - gesture.midpoint[0];
      camera.y += mid[1] - gesture.midpoint[1];
      suppressClick = true;
    } else {
      const dx = current[0] - gesture.first[0], dy = current[1] - gesture.first[1];
      if (Math.hypot(dx, dy) > 4) suppressClick = true;
      if (!suppressClick) return;
      camera.x = gesture.camera.x + dx;
      camera.y = gesture.camera.y + dy;
    }
    plot.setPointerCapture(event.pointerId);
    plot.classList.add('is-dragging');
    render();
  });
  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size) startGesture();
    else { gesture = null; plot.classList.remove('is-dragging'); }
  };
  plot.addEventListener('pointerup', endPointer);
  plot.addEventListener('pointercancel', endPointer);
  plot.addEventListener('lostpointercapture', endPointer);
  plot.addEventListener('pointerleave', (event) => { if (!plot.hasPointerCapture(event.pointerId)) endPointer(event); });
  plot.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .006), ...locationInPlot(event));
  }, { passive: false });
  widget.querySelector('[data-map-zoom-in]').addEventListener('click', () => zoom(1.5));
  widget.querySelector('[data-map-zoom-out]').addEventListener('click', () => zoom(1 / 1.5));
  widget.querySelector('[data-map-reset]').addEventListener('click', () => fit());
  clear.addEventListener('click', () => {
    activeTopic = null;
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.focus();
  });
  function setExpanded(value) {
    widget.classList.toggle('is-expanded', value);
    document.body.classList.toggle('has-expanded-map', value);
    expand.setAttribute('aria-pressed', String(value));
    expand.textContent = value ? 'Close expanded map ×' : 'Expand map ↗';
    // Keep keyboard navigation inside the expanded explorer.
    document.querySelectorAll('body > header, body > footer, .papers-hero--catalogue, .papers-catalogue').forEach((node) => { node.inert = value; });
  }
  expand.addEventListener('click', () => setExpanded(!widget.classList.contains('is-expanded')));
  widget.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { setExpanded(false); expand.focus(); }
    if (event.key !== 'Tab' || !widget.classList.contains('is-expanded')) return;
    const focusable = [...widget.querySelectorAll('button:not(:disabled), input, a, [tabindex="0"], summary')].filter((n) => n.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  const initialSlug = new URLSearchParams(location.hash.slice(1)).get('paper');
  let restoreInitial = true;
  document.addEventListener('papers:filtered', () => {
    filter(true);
    if (restoreInitial) {
      restoreInitial = false;
      if (bySlug.has(initialSlug)) select(bySlug.get(initialSlug), false);
    }
  });
  widget.hidden = false;
  const resize = new ResizeObserver(() => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;
    plot.setAttribute('viewBox', `0 0 ${width} ${height}`);
    widget.querySelector('.paper-map-hint').textContent = width < 500
      ? 'Drag to pan · Pinch to zoom · Tap a paper'
      : 'Drag to pan · Scroll to zoom · Click a topic or a paper';
    const xs = papers.map((p) => p.tsne[0]), ys = papers.map((p) => p.tsne[1]);
    homeScale = Math.min((width - (width < 500 ? 55 : 150)) / (Math.max(...xs) - Math.min(...xs) || 1), (height - (height < 400 ? 110 : 150)) / (Math.max(...ys) - Math.min(...ys) || 1));
    fit();
  });
  resize.observe(canvas);
  filter();
})();
