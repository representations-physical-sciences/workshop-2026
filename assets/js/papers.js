(() => {
  const delimiters = [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
    { left: '$', right: '$', display: false },
  ];
  const renderMath = (element) => {
    if (typeof window.renderMathInElement !== 'function') return;
    window.renderMathInElement(element, {
      delimiters,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      maxSize: 10,
      maxExpand: 1000,
    });
  };

  document.querySelectorAll('.paper-title, .paper-abstract').forEach(renderMath);

  const search = document.querySelector('[data-paper-search]');
  if (search) {
    const input = search.querySelector('input');
    const count = document.querySelector('[data-paper-count]');
    const noResults = document.querySelector('[data-paper-no-results]');
    const papers = [...document.querySelectorAll('.paper-row')].map((row) => {
      const title = row.querySelector('[data-paper-title]');
      const authors = row.querySelector('[data-paper-authors]');
      const abstract = row.querySelector('[data-paper-abstract]');
      return {
        row, title, authors, abstract,
        titleText: title.textContent,
        authorsText: authors.textContent,
        abstractText: abstract.textContent.replace(/\s+/gu, ' ').trim(),
      };
    });

    // Keep excerpts from cutting through a delimited formula.
    const mathRanges = (text) => {
      const ranges = [];
      const openings = /\$\$|\$|\\\(|\\\[/g;
      const escaped = (index) => {
        let slashes = 0;
        while (index > 0 && text[--index] === '\\') slashes += 1;
        return slashes % 2 !== 0;
      };
      let match;
      while ((match = openings.exec(text))) {
        if (escaped(match.index)) continue;
        const delimiter = delimiters.find(({ left }) => left === match[0]);
        let end = text.indexOf(delimiter.right, openings.lastIndex);
        while (end !== -1 && escaped(end)) end = text.indexOf(delimiter.right, end + 1);
        if (end === -1) continue;
        end += delimiter.right.length;
        ranges.push([match.index, end]);
        openings.lastIndex = end;
      }
      return ranges;
    };
    papers.forEach((paper) => { paper.mathRanges = mathRanges(paper.abstractText); });

    // Use text nodes so both author-supplied content and queries remain literal text.
    const highlightedText = (text, pattern) => {
      const fragment = document.createDocumentFragment();
      let position = 0;
      if (pattern) {
        for (const match of text.matchAll(new RegExp(pattern, 'giu'))) {
          fragment.append(document.createTextNode(text.slice(position, match.index)));
          const mark = document.createElement('mark');
          mark.textContent = match[0];
          fragment.append(mark);
          position = match.index + match[0].length;
        }
      }
      fragment.append(document.createTextNode(text.slice(position)));
      return fragment;
    };

    const highlight = (element, text, pattern, math = false) => {
      element.textContent = text;
      if (math) renderMath(element);
      if (!pattern) return;
      // Typeset first: inserting marks into the TeX source would break formulas.
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.parentElement.closest('.katex')
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => node.replaceWith(highlightedText(node.textContent, pattern)));
      // Highlight a matching formula as a whole, preserving its MathML and layout.
      element.querySelectorAll('.katex').forEach((formula) => {
        const source = formula.querySelector('annotation[encoding="application/x-tex"]')?.textContent || '';
        formula.classList.toggle('math-search-match', new RegExp(pattern, 'iu').test(source));
      });
    };

    const filter = () => {
      const terms = [...new Set(input.value.trim().split(/\s+/u).filter(Boolean))];
      const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const matchers = escaped.map((term) => new RegExp(term, 'iu'));
      // Prefer the longest term when two terms match at the same position.
      const pattern = escaped.sort((a, b) => b.length - a.length).join('|');
      let visible = 0;
      papers.forEach((paper) => {
        const searchable = [paper.titleText, paper.authorsText, paper.abstractText];
        const matches = matchers.every((matcher) => searchable.some((text) => matcher.test(text)));
        paper.row.hidden = !matches;
        if (!matches) return;
        visible += 1;
        highlight(paper.title, paper.titleText, pattern, true);
        highlight(paper.authors, paper.authorsText, pattern);
        const abstractMatch = pattern && new RegExp(pattern, 'iu').exec(paper.abstractText);
        paper.abstract.hidden = !abstractMatch;
        if (abstractMatch) {
          // Reveal context around the first match, including matches late in an abstract.
          let start = Math.max(0, abstractMatch.index - 70);
          let end = Math.min(paper.abstractText.length, Math.max(start + 240, abstractMatch.index + abstractMatch[0].length + 70));
          paper.mathRanges.forEach(([left, right]) => {
            if (start > left && start < right) start = left;
            if (end > left && end < right) end = right;
          });
          const excerpt = (start ? '…' : '') + paper.abstractText.slice(start, end) + (end < paper.abstractText.length ? '…' : '');
          highlight(paper.abstract, excerpt, pattern, true);
        } else {
          paper.abstract.textContent = paper.abstractText;
        }
      });
      count.textContent = terms.length
        ? `${visible} of ${papers.length} papers`
        : `${papers.length} accepted ${papers.length === 1 ? 'paper' : 'papers'}`;
      noResults.hidden = visible !== 0;
      document.dispatchEvent(new Event('papers:filtered'));
    };

    search.hidden = false;
    input.addEventListener('input', filter);
    // Apply any value restored by the browser when returning to the catalogue.
    filter();
  }

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
