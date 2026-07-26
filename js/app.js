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
  const btnRoll = document.getElementById('btn-roll');
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
        btnEndTurn.disabled = false;
        btnEndTurn.textContent = 'Fortsæt';
      }
      renderAll();
    } else {
      renderAll();
      setTimeout(aiTakeTurn, 550);
    }
  }

  function aiTakeTurn() {
    const legal = R.getLegalMoves(state);
    if (legal.length === 0) {
      log(`${PLAYER_LABEL[state.turn]} (computer) har ingen lovlige træk med ${state.dice.join(', ')} og springer over.`, 'info');
      setTimeout(endTurn, 700);
      return;
    }
    const seq = AI.chooseSequence(state, difficulty);
    log(`${PLAYER_LABEL[state.turn]} (computer) slog ${state.originalRoll.join('-')}.`, 'info');
    playSequenceStepwise(seq.moves, 0);
  }

  function playSequenceStepwise(moves, i) {
    if (i >= moves.length) {
      if (state.winner) { showWin(); return; }
      setTimeout(endTurn, 500);
      return;
    }
    const mv = moves[i];
    state = R.playMove(state, mv);
    describeMove(mv, state.turn);
    renderAll();
    if (state.winner) { showWin(); return; }
    setTimeout(() => playSequenceStepwise(moves, i + 1), 450);
  }

  function describeMove(mv, player) {
    const from = mv.from === 'bar' ? 'baren' : ('felt ' + (mv.from + 1));
    const to = mv.to === 'off' ? 'af brættet' : ('felt ' + (mv.to + 1));
    const hitText = mv.hit ? ' og slog en brik!' : '';
    log(`${PLAYER_LABEL[player]}: ${from} → ${to} (${mv.die})${hitText}`, mv.hit ? 'good' : 'info');
  }

  function endTurn() {
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
      setTimeout(rollForAI, 500);
    }
  }

  function rollForAI() {
    const roll = R.rollDice();
    state = R.startTurn(state, state.turn, roll);
    afterDiceRolled();
  }

  btnRoll.addEventListener('click', () => {
    if (!isHumanTurn()) return;
    const roll = R.rollDice();
    state = R.startTurn(state, state.turn, roll);
    log(`${PLAYER_LABEL[state.turn]} slog ${roll.join('-')}.`, 'info');
    afterDiceRolled();
  });

  btnEndTurn.addEventListener('click', endTurn);

  btnUndo.addEventListener('click', () => {
    if (undoStack.length === 0) return;
    state = undoStack.pop();
    selectedSource = null;
    log('Sidste træk fortrudt.', 'info');
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
      state = R.playMove(state, match);
      describeMove(match, player);
      selectedSource = null;
      updateUndoEndButtons();
      renderAll();
      if (state.winner) { showWin(); return; }
      const stillLegal = R.getLegalMoves(state);
      if (state.dice.length === 0 || stillLegal.length === 0) {
        awaitingHumanInput = false;
        btnEndTurn.disabled = false;
        btnEndTurn.textContent = state.dice.length === 0 ? 'Afslut tur' : 'Fortsæt';
        if (stillLegal.length === 0 && state.dice.length > 0) {
          log('Ingen flere lovlige træk med de resterende terninger.', 'illegal');
        }
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

    diceDisplay.innerHTML = '';
    if (state.originalRoll.length) {
      const total = state.originalRoll[0] === state.originalRoll[1] ? 4 : 2;
      const usedN = total - state.dice.length;
      const faces = state.originalRoll[0] === state.originalRoll[1] ? new Array(4).fill(state.originalRoll[0]) : [...state.originalRoll];
      faces.forEach((val, i) => {
        const die = document.createElement('div');
        die.className = 'die' + (i < usedN ? ' used' : '');
        die.textContent = val;
        diceDisplay.appendChild(die);
      });
    }

    btnRoll.disabled = state.dice.length > 0 || !isHumanTurn() || !!state.winner;
    scoreWhite.textContent = scoreboard.white;
    scoreBlack.textContent = scoreboard.black;
    pipWhite.textContent = R.pipCount(state, 'white');
    pipBlack.textContent = R.pipCount(state, 'black');
  }
})();
