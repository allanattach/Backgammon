(function () {
  'use strict';
  const R = window.BgRules;
  const AI = window.BgAI;

  const PLAYER_LABEL = { white: 'Hvid', black: 'Sort' };

  // ---- DOM refs ----
  const startScreen = document.getElementById('start-screen');
  const gameScreen = document.getElementById('game-screen');
  const boardEl = document.getElementById('board');
  const turnText = document.getElementById('turn-text');
  const diceDisplay = document.getElementById('dice-display');
  const btnRoll = document.getElementById('btn-roll'); // the dice cup itself is the roll button
  const btnUndo = document.getElementById('btn-undo');
  const btnEndTurn = document.getElementById('btn-end-turn');
  const scoreWhite = document.getElementById('score-white');
  const scoreBlack = document.getElementById('score-black');
  const pipWhite = document.getElementById('pip-white');
  const pipBlack = document.getElementById('pip-black');
  const messageLog = document.getElementById('message-log');
  const toast = document.getElementById('toast');
  const winDialog = document.getElementById('win-dialog');
  const winTitle = document.getElementById('win-title');
  const winDetail = document.getElementById('win-detail');
  const rulesModal = document.getElementById('rules-modal');
  const rulesContent = document.getElementById('rules-content');
  const speedSlider = document.getElementById('speed-slider');
  const speedSliderLabel = document.getElementById('speed-slider-label');
  const liveSpeedSlider = document.getElementById('live-speed-slider');
  const liveSpeedLabel = document.getElementById('live-speed-label');
  const autoEndTurnToggle = document.getElementById('auto-end-turn-toggle');

  rulesContent.innerHTML = window.BgRulesText;

  // ---- Session state ----
  let mode = null; // 'pvp' | 'pvc'
  let difficulty = 'normal';
  let humanPlayer = 'white'; // in pvc, human is always white
  let state = null;
  let selectedSource = null; // 'idx:N' | 'bar' | null
  let undoStack = [];
  let awaitingHumanInput = false;
  let scoreboard = loadScoreboard();

  // How fast the computer's moves play out, so the moves stay watchable instead of
  // flashing by. All timings are in milliseconds. Slider position 0/1/2 maps to
  // slow/normal/fast.
  const SPEED_ORDER = ['slow', 'normal', 'fast'];
  const SPEED_LABELS = { slow: 'Langsom', normal: 'Normal', fast: 'Hurtig' };
  const SPEED_PRESETS = {
    slow: { beforeAiTurn: 1800, betweenMoves: 2600, afterSequence: 1800, beforeAiRoll: 1800 },
    normal: { beforeAiTurn: 550, betweenMoves: 450, afterSequence: 500, beforeAiRoll: 500 },
    fast: { beforeAiTurn: 150, betweenMoves: 130, afterSequence: 150, beforeAiRoll: 150 },
  };
  // Dice-cup roll flourish (shake / pour / tumble-to-rest), scaled with the same
  // speed setting so "Hurtig" stays snappy and "Langsom" gets the fuller show.
  const DICE_ROLL_TIMING = {
    slow: { shakeMs: 780, pourMs: 260, tickMs: 90, ticks: 9 },
    normal: { shakeMs: 480, pourMs: 200, tickMs: 65, ticks: 7 },
    fast: { shakeMs: 220, pourMs: 120, tickMs: 45, ticks: 4 },
  };
  let aiSpeed = loadSpeed();

  function loadSpeed() {
    try {
      const v = localStorage.getItem('bg_ai_speed');
      if (v && SPEED_PRESETS[v]) return v;
    } catch (e) { /* ignore */ }
    return 'normal';
  }
  function saveSpeed() {
    try { localStorage.setItem('bg_ai_speed', aiSpeed); } catch (e) { /* ignore */ }
  }
  function speedTimings() { return SPEED_PRESETS[aiSpeed]; }

  function syncSpeedControls() {
    const idx = SPEED_ORDER.indexOf(aiSpeed);
    speedSlider.value = idx;
    liveSpeedSlider.value = idx;
    speedSliderLabel.textContent = SPEED_LABELS[aiSpeed];
    liveSpeedLabel.textContent = SPEED_LABELS[aiSpeed];
  }
  syncSpeedControls();

  function setSpeedFromSlider(sliderEl) {
    aiSpeed = SPEED_ORDER[Number(sliderEl.value)];
    saveSpeed();
    syncSpeedControls();
  }
  // 'input' fires continuously while dragging, so both sliders (start screen and
  // in-game) stay in sync live and the setting takes effect immediately.
  speedSlider.addEventListener('input', () => setSpeedFromSlider(speedSlider));
  liveSpeedSlider.addEventListener('input', () => setSpeedFromSlider(liveSpeedSlider));

  // ---- Auto-end-turn: optionally end a human turn automatically once no dice/moves
  // remain, instead of requiring a manual "Afslut tur" click. ----
  let autoEndTurn = loadAutoEndTurn();
  let pendingAutoEndTimer = null;

  function loadAutoEndTurn() {
    try { return localStorage.getItem('bg_auto_end_turn') === '1'; } catch (e) { return false; }
  }
  function saveAutoEndTurn() {
    try { localStorage.setItem('bg_auto_end_turn', autoEndTurn ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  autoEndTurnToggle.checked = autoEndTurn;
  autoEndTurnToggle.addEventListener('change', () => {
    autoEndTurn = autoEndTurnToggle.checked;
    saveAutoEndTurn();
  });

  function cancelPendingAutoEnd() {
    if (pendingAutoEndTimer !== null) {
      clearTimeout(pendingAutoEndTimer);
      pendingAutoEndTimer = null;
    }
  }

  /** Call once a human turn has no more legal moves: either waits for a manual click
   * on "Afslut tur"/"Fortsæt", or - if the auto-end toggle is on - ends it automatically
   * after a short pause (so the player still sees the final position/animation). */
  function offerOrAutoEndTurn(label) {
    btnEndTurn.disabled = false;
    btnEndTurn.textContent = label;
    if (autoEndTurn) {
      cancelPendingAutoEnd();
      pendingAutoEndTimer = setTimeout(() => {
        pendingAutoEndTimer = null;
        endTurn();
      }, speedTimings().afterSequence);
    }
  }

  function loadScoreboard() {
    try {
      const raw = localStorage.getItem('bg_scoreboard');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { white: 0, black: 0 };
  }
  function saveScoreboard() {
    try { localStorage.setItem('bg_scoreboard', JSON.stringify(scoreboard)); } catch (e) { /* ignore */ }
  }

  function log(text, kind) {
    const line = document.createElement('div');
    line.className = 'msg-' + (kind || 'info');
    line.textContent = text;
    messageLog.appendChild(line);
    messageLog.scrollTop = messageLog.scrollHeight;
  }

  // ---- Checker movement animation (FLIP: capture position before the DOM rebuilds,
  // then transition from there to the freshly-rendered resting position) ----
  function findCheckerEl(locationKey, color) {
    if (locationKey === 'bar') {
      const half = boardEl.querySelector(color === 'white' ? '.bar-half.bottom' : '.bar-half.top');
      return half ? half.lastElementChild : null;
    }
    if (locationKey === 'off') {
      const half = boardEl.querySelector(color === 'white' ? '.off-half.bottom' : '.off-half.top');
      return half ? half.lastElementChild : null;
    }
    const idx = parseInt(locationKey.split(':')[1], 10);
    const pointEl = boardEl.querySelector('.point[data-point="' + (idx + 1) + '"]');
    const stack = pointEl ? pointEl.querySelector('.checker-stack') : null;
    return stack ? stack.lastElementChild : null;
  }

  function moveAnimationDuration() {
    // Scales with the AI speed setting so an animation never outlasts the gap before
    // the next move starts (otherwise a fast AI turn would visibly cut moves short).
    return Math.max(120, Math.min(1100, speedTimings().betweenMoves * 0.7));
  }

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function flipAnimateFrom(el, fromRect) {
    if (!el || !fromRect || prefersReducedMotion) return;
    const toRect = el.getBoundingClientRect();
    const dx = (fromRect.left + fromRect.width / 2) - (toRect.left + toRect.width / 2);
    const dy = (fromRect.top + fromRect.height / 2) - (toRect.top + toRect.height / 2);
    const scale = toRect.width > 0 ? fromRect.width / toRect.width : 1;
    if (!dx && !dy && Math.abs(scale - 1) < 0.01) return;
    const duration = moveAnimationDuration();
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    void el.offsetWidth; // force reflow so the "from" transform applies before we animate away from it
    requestAnimationFrame(() => {
      el.style.transition = `transform ${duration}ms cubic-bezier(.22,.85,.32,1)`;
      el.style.transform = '';
      const cleanup = () => { el.style.transition = ''; el.removeEventListener('transitionend', cleanup); };
      el.addEventListener('transitionend', cleanup);
    });
  }

  // ---- Dice-cup roll flourish: shake a cup (tinted to whoever's rolling), tip it out,
  // and have the dice actually roll out of it - sliding from the cup's position to their
  // resting spot while tumbling through random faces - then hand off to the real roll. ----
  function runDiceTumble(fromRect, onDone) {
    const timing = DICE_ROLL_TIMING[aiSpeed];
    diceDisplay.innerHTML = '';
    const tumblers = [document.createElement('div'), document.createElement('div')];
    tumblers.forEach((d) => { d.className = 'die tumbling-in'; d.textContent = '1'; diceDisplay.appendChild(d); });

    if (fromRect && !prefersReducedMotion) {
      // FLIP: place each die at the cup's position first, then let it transition to its
      // natural resting spot in the dice display - i.e. rolling out of the cup.
      const travelMs = timing.pourMs + timing.tickMs * timing.ticks;
      tumblers.forEach((el) => {
        const toRect = el.getBoundingClientRect();
        const dx = (fromRect.left + fromRect.width / 2) - (toRect.left + toRect.width / 2);
        const dy = (fromRect.top + fromRect.height / 2) - (toRect.top + toRect.height / 2);
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(0.55)`;
      });
      void diceDisplay.offsetWidth; // force reflow so the "from" transform applies before animating away
      requestAnimationFrame(() => {
        tumblers.forEach((el, i) => {
          el.style.transition = `transform ${travelMs}ms cubic-bezier(.16,.8,.3,1) ${i * 40}ms`;
          el.style.transform = '';
        });
      });
    }

    let ticks = 0;
    const tick = setInterval(() => {
      tumblers.forEach((d) => { d.textContent = String(1 + Math.floor(Math.random() * 6)); });
      ticks += 1;
      if (ticks >= timing.ticks) {
        clearInterval(tick);
        onDone();
      }
    }, timing.tickMs);
  }

  function animateDiceRoll(player, onDone) {
    if (prefersReducedMotion) { onDone(); return; }
    const timing = DICE_ROLL_TIMING[aiSpeed];
    // The cup (btn-roll) stays visible throughout - it shakes and tips in place,
    // never swapping with the dice, which roll out of it into the dice display.
    btnRoll.classList.remove('shaking', 'pouring');
    btnRoll.style.animationDuration = timing.shakeMs + 'ms';
    void btnRoll.offsetWidth; // ensure the animation class re-triggers even if the same one was just used
    btnRoll.classList.add('shaking');
    setTimeout(() => {
      btnRoll.classList.remove('shaking');
      btnRoll.style.animationDuration = timing.pourMs + 'ms';
      btnRoll.classList.add('pouring');
      const cupRect = btnRoll.getBoundingClientRect();
      // Start the dice rolling out the moment the cup begins tipping, rather than
      // waiting for the tip to finish first.
      runDiceTumble(cupRect, onDone);
      setTimeout(() => {
        btnRoll.classList.remove('pouring');
      }, timing.pourMs);
    }, timing.shakeMs);
  }

  /** Capture the pre-move DOM positions needed to animate this move, before state changes. */
  function captureMoveFlight(move, player) {
    const fromKey = move.from === 'bar' ? 'bar' : 'idx:' + move.from;
    const fromEl = findCheckerEl(fromKey, player);
    const fromRect = fromEl ? fromEl.getBoundingClientRect() : null;
    let hitFromRect = null;
    if (move.hit) {
      const hitEl = findCheckerEl('idx:' + move.to, R.opponent(player));
      hitFromRect = hitEl ? hitEl.getBoundingClientRect() : null;
    }
    return { fromRect, hitFromRect };
  }

  /** After state has changed and the board been re-rendered, fly the moved (and hit) checkers in. */
  function playMoveFlight(move, player, flight) {
    const toKey = move.to === 'off' ? 'off' : 'idx:' + move.to;
    flipAnimateFrom(findCheckerEl(toKey, player), flight.fromRect);
    if (move.hit && flight.hitFromRect) {
      flipAnimateFrom(findCheckerEl('bar', R.opponent(player)), flight.hitFromRect);
    }
  }

  function showToast(text, kind) {
    toast.textContent = text;
    toast.className = 'toast' + (kind === 'info' ? ' info' : '');
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), 4200);
  }

  // ---- Mode selection ----
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      mode = btn.dataset.mode;
      document.getElementById('difficulty-row').classList.toggle('hidden', mode !== 'pvc');
      document.getElementById('btn-start').disabled = false;
    });
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    if (mode === 'pvc') {
      const sel = document.querySelector('input[name="difficulty"]:checked');
      difficulty = sel ? sel.value : 'normal';
    }
    startScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    beginNewGame();
  });

  document.getElementById('btn-new-game').addEventListener('click', () => {
    gameScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  });

  // ---- Fullscreen (for tablet play) ----
  const btnFullscreen = document.getElementById('btn-fullscreen');
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function updateFullscreenButton() {
    btnFullscreen.textContent = isFullscreen() ? '⤡' : '⛶';
    btnFullscreen.title = isFullscreen() ? 'Afslut fuld skærm' : 'Fuld skærm';
  }
  function fullscreenEnabled() {
    return document.fullscreenEnabled || document.webkitFullscreenEnabled || false;
  }
  btnFullscreen.addEventListener('click', () => {
    const el = document.documentElement;
    if (!isFullscreen()) {
      if (!fullscreenEnabled()) {
        showToast('Fuld skærm er blokeret her (f.eks. fordi siden vises i en indlejret ramme). Åbn siden direkte i browseren for at bruge fuld skærm.', 'info');
        return;
      }
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        req.call(el).catch(() => showToast('Fuld skærm kunne ikke aktiveres. Prøv at åbne siden direkte i browseren (ikke i en indlejret visning).', 'info'));
      } else {
        showToast('Fuld skærm understøttes ikke i denne browser.', 'info');
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  });
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

  document.getElementById('btn-rules').addEventListener('click', () => rulesModal.classList.remove('hidden'));
  document.getElementById('btn-close-rules').addEventListener('click', () => rulesModal.classList.add('hidden'));
  rulesModal.addEventListener('click', (e) => { if (e.target === rulesModal) rulesModal.classList.add('hidden'); });

  document.getElementById('btn-play-again').addEventListener('click', () => {
    winDialog.classList.add('hidden');
    beginNewGame();
  });

  // ---- Game lifecycle ----
  function beginNewGame() {
    cancelPendingAutoEnd();
    messageLog.innerHTML = '';
    undoStack = [];
    selectedSource = null;
    state = R.createInitialState();

    let dWhite, dBlack;
    do {
      dWhite = 1 + Math.floor(Math.random() * 6);
      dBlack = 1 + Math.floor(Math.random() * 6);
    } while (dWhite === dBlack);
    const starter = dWhite > dBlack ? 'white' : 'black';
    log(`Åbningsslag: Hvid slog ${dWhite}, Sort slog ${dBlack}. ${PLAYER_LABEL[starter]} starter.`, 'info');
    state = R.startTurn(state, starter, [dWhite, dBlack]);

    renderAll();
    afterDiceRolled();
  }

  function opponentOf(p) { return R.opponent(p); }

  function isHumanTurn() {
    return mode === 'pvp' || state.turn === humanPlayer;
  }

  function afterDiceRolled() {
    btnRoll.disabled = true;
    undoStack = [];
    updateUndoEndButtons();
    if (isHumanTurn()) {
      awaitingHumanInput = true;
      const legal = R.getLegalMoves(state);
      if (legal.length === 0) {
        log(`${PLAYER_LABEL[state.turn]} har ingen lovlige træk med ${state.dice.join(', ') || 'terningerne'} og springer over.`, 'illegal');
        awaitingHumanInput = false;
        offerOrAutoEndTurn('Fortsæt');
      }
      renderAll();
    } else {
      renderAll();
      setTimeout(aiTakeTurn, speedTimings().beforeAiTurn);
    }
  }

  function aiTakeTurn() {
    const legal = R.getLegalMoves(state);
    if (legal.length === 0) {
      log(`${PLAYER_LABEL[state.turn]} (computer) har ingen lovlige træk med ${state.dice.join(', ')} og springer over.`, 'info');
      setTimeout(endTurn, speedTimings().afterSequence);
      return;
    }
    const seq = AI.chooseSequence(state, difficulty);
    log(`${PLAYER_LABEL[state.turn]} (computer) slog ${state.originalRoll.join('-')}.`, 'info');
    playSequenceStepwise(seq.moves, 0);
  }

  function playSequenceStepwise(moves, i) {
    if (i >= moves.length) {
      if (state.winner) { showWin(); return; }
      setTimeout(endTurn, speedTimings().afterSequence);
      return;
    }
    const mv = moves[i];
    const player = state.turn;
    const flight = captureMoveFlight(mv, player);
    state = R.playMove(state, mv);
    describeMove(mv, player);
    renderAll();
    playMoveFlight(mv, player, flight);
    if (state.winner) { showWin(); return; }
    setTimeout(() => playSequenceStepwise(moves, i + 1), speedTimings().betweenMoves);
  }

  function describeMove(mv, player) {
    const from = mv.from === 'bar' ? 'baren' : ('felt ' + (mv.from + 1));
    const to = mv.to === 'off' ? 'af brættet' : ('felt ' + (mv.to + 1));
    const hitText = mv.hit ? ' og slog en brik!' : '';
    log(`${PLAYER_LABEL[player]}: ${from} → ${to} (${mv.die})${hitText}`, mv.hit ? 'good' : 'info');
  }

  function endTurn() {
    cancelPendingAutoEnd();
    selectedSource = null;
    const next = opponentOf(state.turn);
    state = { ...R.cloneState(state), turn: next, dice: [], originalRoll: [], movesPlayedThisTurn: 0, history: [] };
    btnRoll.disabled = false;
    btnEndTurn.disabled = true;
    btnEndTurn.textContent = 'Afslut tur';
    btnUndo.disabled = true;
    awaitingHumanInput = false;
    renderAll();
    if (!isHumanTurn()) {
      // AI rolls automatically.
      setTimeout(rollForAI, speedTimings().beforeAiRoll);
    }
  }

  function settleDiceFaces() {
    diceDisplay.querySelectorAll('.die').forEach((d) => {
      d.classList.add('settling');
      d.addEventListener('animationend', function cleanup() {
        d.classList.remove('settling');
        d.removeEventListener('animationend', cleanup);
      });
    });
  }

  function rollForAI() {
    const player = state.turn;
    animateDiceRoll(player, () => {
      const roll = R.rollDice();
      state = R.startTurn(state, player, roll);
      afterDiceRolled();
      settleDiceFaces();
    });
  }

  btnRoll.addEventListener('click', () => {
    if (!isHumanTurn()) return;
    btnRoll.disabled = true;
    const player = state.turn;
    animateDiceRoll(player, () => {
      const roll = R.rollDice();
      state = R.startTurn(state, player, roll);
      log(`${PLAYER_LABEL[state.turn]} slog ${roll.join('-')}.`, 'info');
      afterDiceRolled();
      settleDiceFaces();
    });
  });

  btnEndTurn.addEventListener('click', endTurn);

  btnUndo.addEventListener('click', () => {
    if (undoStack.length === 0) return;
    cancelPendingAutoEnd();
    state = undoStack.pop();
    selectedSource = null;
    log('Sidste træk fortrudt.', 'info');
    // Undo only ever pops a state from within the current human turn, which by
    // definition still has the undone move (or another) available - restore board
    // interactivity, which the "no more moves" path had turned off.
    awaitingHumanInput = true;
    updateUndoEndButtons();
    renderAll();
  });

  function updateUndoEndButtons() {
    btnUndo.disabled = undoStack.length === 0;
    if (!isHumanTurn()) {
      btnEndTurn.disabled = true;
      return;
    }
    const legal = R.getLegalMoves(state);
    const canStillPlay = state.dice.length > 0 && legal.length > 0;
    btnEndTurn.disabled = canStillPlay;
  }

  // ---- Win handling ----
  function showWin() {
    const winner = state.winner;
    const type = state.winType;
    const typeLabel = { single: 'almindeligt spil', gammon: 'gammon (dobbelt)', backgammon: 'backgammon (tredobbelt)' }[type];
    const points = { single: 1, gammon: 2, backgammon: 3 }[type];
    scoreboard[winner] += points;
    saveScoreboard();
    winTitle.textContent = `${PLAYER_LABEL[winner]} vinder!`;
    winDetail.textContent = `Sejr ved ${typeLabel} (+${points} point).`;
    renderAll();
    winDialog.classList.remove('hidden');
  }

  // ---- Board interaction ----
  function currentLegalMoves() {
    return R.getLegalMoves(state);
  }

  function ownedPointIndexes(player) {
    const list = [];
    for (let i = 0; i < 24; i++) {
      if (state.points[i].owner === player && state.points[i].count > 0) list.push(i);
    }
    return list;
  }

  function buildInteractionSets() {
    const clickable = new Set();
    const legalSources = new Set();
    const targets = new Set();
    if (!awaitingHumanInput) return { clickable, legalSources, targets };
    const player = state.turn;
    const legal = currentLegalMoves();

    if (state.bar[player] > 0) {
      clickable.add('bar');
    } else {
      for (const idx of ownedPointIndexes(player)) clickable.add('idx:' + idx);
    }
    for (const mv of legal) {
      legalSources.add(mv.from === 'bar' ? 'bar' : 'idx:' + mv.from);
    }

    if (selectedSource) {
      for (const mv of legal) {
        const srcKey = mv.from === 'bar' ? 'bar' : 'idx:' + mv.from;
        if (srcKey === selectedSource) {
          targets.add(mv.to === 'off' ? 'off' : 'idx:' + mv.to);
        }
      }
      // While a source is selected, every cell becomes clickable so an attempt at an
      // illegal destination (e.g. a blocked point) can be explained rather than ignored.
      for (let i = 0; i < 24; i++) clickable.add('idx:' + i);
      clickable.add('off');
    }
    return { clickable, legalSources, targets };
  }

  function keyToFrom(key) { return key === 'bar' ? 'bar' : parseInt(key.split(':')[1], 10); }

  function onCellClick(key) {
    if (!awaitingHumanInput) return;
    const player = state.turn;
    const legal = currentLegalMoves();

    if (!selectedSource) {
      attemptSelectSource(key, legal, player);
      return;
    }

    if (key === selectedSource) {
      selectedSource = null;
      renderAll();
      return;
    }

    // Is this key a legal target for the current selection?
    const match = legal.find((mv) => {
      const srcKey = mv.from === 'bar' ? 'bar' : 'idx:' + mv.from;
      const dstKey = mv.to === 'off' ? 'off' : 'idx:' + mv.to;
      return srcKey === selectedSource && dstKey === key;
    });

    if (match) {
      undoStack.push(R.cloneState(state));
      const flight = captureMoveFlight(match, player);
      state = R.playMove(state, match);
      describeMove(match, player);
      selectedSource = null;
      updateUndoEndButtons();
      renderAll();
      playMoveFlight(match, player, flight);
      if (state.winner) { showWin(); return; }
      const stillLegal = R.getLegalMoves(state);
      if (state.dice.length === 0 || stillLegal.length === 0) {
        awaitingHumanInput = false;
        if (stillLegal.length === 0 && state.dice.length > 0) {
          log('Ingen flere lovlige træk med de resterende terninger.', 'illegal');
        }
        offerOrAutoEndTurn(state.dice.length === 0 ? 'Afslut tur' : 'Fortsæt');
      }
      return;
    }

    // Not a legal target: if it's one of the player's own selectable points, switch selection.
    if (key.startsWith('idx:')) {
      const idx = parseInt(key.split(':')[1], 10);
      if (state.points[idx].owner === player && state.points[idx].count > 0 && state.bar[player] === 0) {
        attemptSelectSource(key, legal, player);
        return;
      }
    }

    explainIllegalDestination(key, legal, player);
  }

  function attemptSelectSource(key, legal, player) {
    const from = keyToFrom(key);
    const isLegalSource = legal.some((mv) => (mv.from === 'bar' ? 'bar' : 'idx:' + mv.from) === key);
    if (isLegalSource) {
      selectedSource = key;
      renderAll();
      return;
    }
    explainWhyNotSelectable(key, from, player);
  }

  // ---- Rule-help diagnostics (Danish) ----
  function explainWhyNotSelectable(key, from, player) {
    if (state.bar[player] > 0 && key !== 'bar') {
      showToast('Du har brikker på baren. De skal sættes ind i spillet, før du kan flytte andre brikker.', 'illegal');
      return;
    }
    if (key === 'bar') {
      const reasons = [];
      for (const d of new Set(state.dice)) {
        const entry = R.entryIndex(player, d);
        if (!R.pointOpenFor(state, entry, player)) reasons.push(`felt ${entry + 1} (terning ${d})`);
      }
      if (reasons.length > 0) {
        showToast(`Du kan ikke sætte brikker ind fra baren – modstanderen blokerer ${reasons.join(' og ')}.`, 'illegal');
      } else {
        showToast('Du kan ikke sætte brikker ind fra baren med de tilgængelige terninger lige nu.', 'illegal');
      }
      return;
    }

    const idx = from;
    const dice = new Set(state.dice);
    const blockedFor = [];
    const forcedAway = [];
    let needsAllHome = false;

    for (const d of dice) {
      const raw = R.legalMovesForDie(state, player, d).some((m) => m.from === idx);
      if (raw) {
        const isInForced = R.getLegalMoves(state).some((m) => m.from === idx && m.die === d);
        if (!isInForced) forcedAway.push(d);
        continue;
      }
      const dist = R.distance(player, idx);
      if (dist <= d && !R.allCheckersHome(state, player)) {
        needsAllHome = true;
      } else if (dist > d) {
        const to = R.destIndex(player, idx, d);
        if (to >= 0 && to <= 23) blockedFor.push({ d, point: to + 1 });
      }
    }

    if (needsAllHome) {
      showToast('Du kan ikke bære brikker af endnu – alle dine 15 brikker skal være i dit hjemmefelt først.', 'illegal');
    } else if (blockedFor.length > 0) {
      const parts = blockedFor.map((b) => `felt ${b.point} (terning ${b.d})`).join(' og ');
      showToast(`Den brik kan ikke flytte – ${parts} er blokeret af modstanderens brikker.`, 'illegal');
    } else if (forcedAway.length > 0) {
      showToast('Reglerne kræver, at du udnytter terningerne bedst muligt (evt. spiller det højeste tal) – denne brik kan ikke bruges lige nu.', 'illegal');
    } else {
      showToast('Det er ikke et lovligt træk ifølge backgammonreglerne.', 'illegal');
    }
  }

  function explainIllegalDestination(key, legal, player) {
    if (key.startsWith('idx:')) {
      const idx = parseInt(key.split(':')[1], 10);
      const pt = state.points[idx];
      if (pt.owner && pt.owner !== player && pt.count >= 2) {
        showToast(`Felt ${idx + 1} er blokeret – modstanderen har ${pt.count} brikker der.`, 'illegal');
        return;
      }
    }
    if (key === 'off') {
      showToast('Du kan ikke bære denne brik af med den valgte terning – enten er den ikke i hjemmefeltet, eller terningen matcher ikke.', 'illegal');
      return;
    }
    showToast('Det felt kan ikke nås med den valgte brik og de tilgængelige terninger.', 'illegal');
  }

  // ---- Rendering ----
  function renderAll() {
    const { clickable, legalSources, targets } = buildInteractionSets();
    window.BgUI.render(boardEl, {
      state,
      clickable,
      legalSources,
      targets,
      selected: selectedSource,
      onCellClick,
    });

    turnText.textContent = `${PLAYER_LABEL[state.turn]}${mode === 'pvc' && state.turn !== humanPlayer ? ' (computer)' : ''}`;
    turnText.className = state.turn === 'white' ? 'white-turn' : 'black-turn';
    btnRoll.classList.remove('turn-white', 'turn-black');
    btnRoll.classList.add(state.turn === 'white' ? 'turn-white' : 'turn-black');

    diceDisplay.innerHTML = '';
    if (state.originalRoll.length) {
      const faces = state.originalRoll[0] === state.originalRoll[1] ? new Array(4).fill(state.originalRoll[0]) : [...state.originalRoll];
      // Match each face against the still-unplayed dice by value (not position) —
      // dice can legally be played out of rolled order, so the face that's actually
      // used depends on which value is gone from state.dice, not which slot it sat in.
      const remainingPool = [...state.dice];
      faces.forEach((val) => {
        const poolIdx = remainingPool.indexOf(val);
        const used = poolIdx === -1;
        if (!used) remainingPool.splice(poolIdx, 1);
        const die = document.createElement('div');
        die.className = 'die' + (used ? ' used' : '');
        die.textContent = val;
        diceDisplay.appendChild(die);
      });
    }

    // Only re-enable rolling once the turn has actually ended (endTurn() clears
    // originalRoll) — using state.dice.length here would re-enable the button the
    // instant the last die is played, letting the same player roll again before
    // clicking "Afslut tur".
    btnRoll.disabled = state.originalRoll.length > 0 || !isHumanTurn() || !!state.winner;
    scoreWhite.textContent = scoreboard.white;
    scoreBlack.textContent = scoreboard.black;
    pipWhite.textContent = R.pipCount(state, 'white');
    pipBlack.textContent = R.pipCount(state, 'black');
  }
})();
