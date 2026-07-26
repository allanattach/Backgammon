/**
 * Board rendering + click interaction. Pure DOM, no game rules here — the caller
 * (app.js) decides what is selectable/legal and receives click events via a key:
 *   'idx:N' (point index 0-23), 'bar' (the moving player's own bar checkers), 'off' (bear-off tray).
 */
(function (root) {
  'use strict';

  // Point number (1-24) -> {row: 'top'|'bottom', col: 0-12}
  function pointLayout(pointNum) {
    if (pointNum >= 19 && pointNum <= 24) return { row: 'top', col: pointNum - 19 + 7 };
    if (pointNum >= 13 && pointNum <= 18) return { row: 'top', col: pointNum - 13 };
    if (pointNum >= 7 && pointNum <= 12) return { row: 'bottom', col: 12 - pointNum };
    return { row: 'bottom', col: 13 - pointNum }; // 1-6
  }

  const COL_WIDTH = 100 / 14;

  function el(tag, className, attrs) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function renderCheckerStack(stackEl, owner, count, maxShown) {
    const shown = Math.min(count, maxShown);
    for (let i = 0; i < shown; i++) {
      const isLast = i === shown - 1;
      const c = el('div', 'checker ' + owner);
      if (isLast && count > maxShown) {
        c.textContent = '+' + (count - maxShown + 1);
      }
      stackEl.appendChild(c);
    }
  }

  function render(container, opts) {
    const {
      state,
      clickable = new Set(),   // cells that respond to clicks (own checkers/bar, even if currently illegal — lets us explain why)
      legalSources = new Set(), // subset of clickable that are highlighted as an actual legal move source
      targets = new Set(),
      selected = null,
      onCellClick,
    } = opts;
    container.innerHTML = '';
    const boardInner = el('div', 'board-inner');
    container.appendChild(boardInner);

    function makeClickable(elm, key) {
      if (clickable.has(key) || targets.has(key)) {
        elm.addEventListener('click', () => onCellClick(key));
      }
    }

    // Points
    for (let pointNum = 1; pointNum <= 24; pointNum++) {
      const idx = pointNum - 1;
      const { row, col } = pointLayout(pointNum);
      const key = 'idx:' + idx;
      const p = state.points[idx];

      const pointEl = el('div', 'point row-' + row + ' ' + (pointNum % 2 === 0 ? 'color-a' : 'color-b'));
      pointEl.dataset.point = pointNum;
      pointEl.style.left = (col * COL_WIDTH) + '%';
      if (legalSources.has(key)) pointEl.classList.add('selectable');
      if (targets.has(key)) pointEl.classList.add('legal-target');
      if (selected === key) pointEl.classList.add('selected-source');

      pointEl.appendChild(el('div', 'point-triangle'));
      const numLabel = el('div', 'point-number');
      numLabel.textContent = pointNum;
      pointEl.appendChild(numLabel);

      const stack = el('div', 'checker-stack');
      if (p.owner) renderCheckerStack(stack, p.owner, p.count, 5);
      pointEl.appendChild(stack);

      makeClickable(pointEl, key);
      boardInner.appendChild(pointEl);
    }

    // Bar
    const barEl = el('div', 'bar');
    barEl.style.left = (6 * COL_WIDTH) + '%';
    const barTop = el('div', 'bar-half top');
    const barBottom = el('div', 'bar-half bottom');
    renderCheckerStack(barTop, 'black', state.bar.black, 4);
    renderCheckerStack(barBottom, 'white', state.bar.white, 4);
    if (clickable.has('bar')) {
      if (legalSources.has('bar')) { barTop.classList.add('selectable'); barBottom.classList.add('selectable'); }
      barTop.classList.add('clickable');
      barBottom.classList.add('clickable');
      barTop.addEventListener('click', () => onCellClick('bar'));
      barBottom.addEventListener('click', () => onCellClick('bar'));
    }
    barEl.appendChild(barTop);
    barEl.appendChild(barBottom);
    boardInner.appendChild(barEl);

    // Off trays (top = black, bottom = white)
    const offEl = el('div', 'off-tray');
    offEl.style.left = (13 * COL_WIDTH) + '%';
    const offTop = el('div', 'off-half top');
    const offBottom = el('div', 'off-half bottom');
    for (let i = 0; i < state.off.black; i++) offTop.appendChild(el('div', 'off-checker black'));
    for (let i = 0; i < state.off.white; i++) offBottom.appendChild(el('div', 'off-checker white'));
    if (targets.has('off')) { offTop.classList.add('selectable'); offBottom.classList.add('selectable'); }
    if (clickable.has('off') || targets.has('off')) {
      offTop.classList.add('clickable');
      offBottom.classList.add('clickable');
      offTop.addEventListener('click', () => onCellClick('off'));
      offBottom.addEventListener('click', () => onCellClick('off'));
    }
    offEl.appendChild(offTop);
    offEl.appendChild(offBottom);
    boardInner.appendChild(offEl);
  }

  root.BgUI = { render, pointLayout };
})(typeof window !== 'undefined' ? window : globalThis);
