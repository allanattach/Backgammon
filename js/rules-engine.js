/**
 * Backgammon rules engine — pure game logic, no DOM.
 *
 * Board model
 * -----------
 * 24 points, indexed 0..23 (point number = index + 1).
 * White moves from point 24 towards point 1 and bears off from points 1-6.
 * Black moves from point 1 towards point 24 and bears off from points 19-24.
 *
 * state = {
 *   points: [{owner: 'white'|'black'|null, count: number}, ...] length 24,
 *   bar: {white: n, black: n},
 *   off: {white: n, black: n},
 *   turn: 'white' | 'black',
 *   dice: [number, ...],       // remaining unplayed die values this turn
 *   originalRoll: [number, number], // the two dice as rolled (before duplicating doubles)
 *   movesPlayedThisTurn: number,
 *   history: [{from, to, die, hit}], // moves played so far this turn (for undo/log)
 *   winner: null | 'white' | 'black',
 *   winType: null | 'single' | 'gammon' | 'backgammon',
 * }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BgRules = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const HOME_RANGES = {
    white: [0, 5],   // points 1-6
    black: [18, 23], // points 19-24
  };

  function opponent(player) {
    return player === 'white' ? 'black' : 'white';
  }

  function createEmptyPoints() {
    return Array.from({ length: 24 }, () => ({ owner: null, count: 0 }));
  }

  function createInitialState() {
    const points = createEmptyPoints();
    const setup = [
      ['white', 24, 2], ['white', 13, 5], ['white', 8, 3], ['white', 6, 5],
      ['black', 1, 2], ['black', 12, 5], ['black', 17, 3], ['black', 19, 5],
    ];
    for (const [owner, pointNum, count] of setup) {
      points[pointNum - 1] = { owner, count };
    }
    return {
      points,
      bar: { white: 0, black: 0 },
      off: { white: 0, black: 0 },
      turn: 'white',
      dice: [],
      originalRoll: [],
      movesPlayedThisTurn: 0,
      history: [],
      winner: null,
      winType: null,
    };
  }

  function cloneState(state) {
    return {
      points: state.points.map((p) => ({ owner: p.owner, count: p.count })),
      bar: { ...state.bar },
      off: { ...state.off },
      turn: state.turn,
      dice: [...state.dice],
      originalRoll: [...state.originalRoll],
      movesPlayedThisTurn: state.movesPlayedThisTurn,
      history: state.history.map((h) => ({ ...h })),
      winner: state.winner,
      winType: state.winType,
    };
  }

  // Distance from a point to bearing off, for the given player. Always positive.
  function distance(player, idx) {
    return player === 'white' ? idx + 1 : 24 - idx;
  }

  function isHomeIndex(player, idx) {
    const [lo, hi] = HOME_RANGES[player];
    return idx >= lo && idx <= hi;
  }

  // Index a die value moves a checker FROM the bar TO, for the given player.
  function entryIndex(player, die) {
    return player === 'white' ? 24 - die : die - 1;
  }

  // Destination index for a normal (non-bear-off) move.
  function destIndex(player, fromIdx, die) {
    return player === 'white' ? fromIdx - die : fromIdx + die;
  }

  function allCheckersHome(state, player) {
    if (state.bar[player] > 0) return false;
    const [lo, hi] = HOME_RANGES[player];
    for (let i = 0; i < 24; i++) {
      const p = state.points[i];
      if (p.owner === player && p.count > 0 && (i < lo || i > hi)) return false;
    }
    return true;
  }

  function pointOpenFor(state, idx, player) {
    const p = state.points[idx];
    if (p.count === 0 || p.owner === player) return true;
    return p.count === 1; // single opposing checker: a blot, can be hit
  }

  function highestOccupiedDistance(state, player) {
    const [lo, hi] = HOME_RANGES[player];
    let best = 0;
    for (let i = lo; i <= hi; i++) {
      const p = state.points[i];
      if (p.owner === player && p.count > 0) {
        best = Math.max(best, distance(player, i));
      }
    }
    return best;
  }

  /**
   * All legal moves for a single die value, for the player to move.
   * Returns entries: { die, from: 'bar'|idx, to: idx|'off', hit: bool }
   */
  function legalMovesForDie(state, player, die) {
    const moves = [];
    if (state.bar[player] > 0) {
      const to = entryIndex(player, die);
      if (pointOpenFor(state, to, player)) {
        moves.push({ die, from: 'bar', to, hit: state.points[to].count === 1 && state.points[to].owner === opponent(player) });
      }
      return moves;
    }

    const canBearOff = allCheckersHome(state, player);
    const highestDist = canBearOff ? highestOccupiedDistance(state, player) : 0;

    for (let idx = 0; idx < 24; idx++) {
      const p = state.points[idx];
      if (p.owner !== player || p.count === 0) continue;
      const d = distance(player, idx);
      if (d > die) {
        // Normal on-board move.
        const to = destIndex(player, idx, die);
        if (pointOpenFor(state, to, player)) {
          moves.push({ die, from: idx, to, hit: state.points[to].count === 1 && state.points[to].owner === opponent(player) });
        }
      } else if (d === die) {
        if (canBearOff) {
          moves.push({ die, from: idx, to: 'off', hit: false });
        }
        // If not all home yet, distance===die would move exactly onto/```beyond edge which
        // is impossible while checkers remain outside home, so no on-board destination exists.
      } else {
        // d < die: only legal as an over-roll bear-off from the single highest point.
        if (canBearOff && d === highestDist) {
          moves.push({ die, from: idx, to: 'off', hit: false });
        }
      }
    }
    return moves;
  }

  /** Apply a move to a (cloned) state. Returns a new state; does not mutate input. */
  function applyMove(state, player, move) {
    const next = cloneState(state);
    if (move.from === 'bar') {
      next.bar[player] -= 1;
    } else {
      next.points[move.from].count -= 1;
      if (next.points[move.from].count === 0) next.points[move.from].owner = null;
    }

    if (move.to === 'off') {
      next.off[player] += 1;
    } else {
      const dest = next.points[move.to];
      if (dest.owner === opponent(player) && dest.count === 1) {
        next.bar[opponent(player)] += 1;
        dest.owner = player;
        dest.count = 1;
      } else {
        dest.owner = player;
        dest.count += 1;
      }
    }
    return next;
  }

  function removeOneFromMultiset(arr, value) {
    const copy = [...arr];
    const i = copy.indexOf(value);
    if (i !== -1) copy.splice(i, 1);
    return copy;
  }

  /** Maximum number of dice from `diceMultiset` that can legally be played from this state. */
  function computeMaxPlayable(state, player, diceMultiset) {
    if (diceMultiset.length === 0) return 0;
    const distinct = [...new Set(diceMultiset)];
    let best = 0;
    for (const d of distinct) {
      const moves = legalMovesForDie(state, player, d);
      for (const mv of moves) {
        const next = applyMove(state, player, mv);
        const remaining = removeOneFromMultiset(diceMultiset, d);
        const sub = 1 + computeMaxPlayable(next, player, remaining);
        if (sub > best) best = sub;
      }
    }
    return best;
  }

  /**
   * Legal moves the current player may make right now, honouring the official
   * "must use both dice if possible, otherwise the higher one" rule.
   */
  function getLegalMoves(state) {
    if (state.winner) return [];
    const player = state.turn;
    const dice = state.dice;
    if (dice.length === 0) return [];

    if (dice.length === 1) {
      return legalMovesForDie(state, player, dice[0]);
    }

    const M = computeMaxPlayable(state, player, dice);
    if (M === 0) return [];

    const distinctDice = [...new Set(dice)];
    let candidates = [];
    for (const d of distinctDice) {
      for (const mv of legalMovesForDie(state, player, d)) {
        const next = applyMove(state, player, mv);
        const remaining = removeOneFromMultiset(dice, d);
        if (computeMaxPlayable(next, player, remaining) === M - 1) {
          candidates.push(mv);
        }
      }
    }

    const isPreFirstMoveOfNonDouble = state.movesPlayedThisTurn === 0 && dice.length === 2 && dice[0] !== dice[1];
    if (isPreFirstMoveOfNonDouble && M === 1) {
      const [a, b] = dice;
      const legalA = legalMovesForDie(state, player, a).length > 0;
      const legalB = legalMovesForDie(state, player, b).length > 0;
      if (legalA && legalB) {
        const larger = Math.max(a, b);
        candidates = candidates.filter((mv) => mv.die === larger);
      }
    }

    return candidates;
  }

  function pipCount(state, player) {
    let total = state.bar[player] * 25;
    for (let i = 0; i < 24; i++) {
      const p = state.points[i];
      if (p.owner === player) total += distance(player, i) * p.count;
    }
    return total;
  }

  function checkWin(state, playerWhoJustMoved) {
    if (state.off[playerWhoJustMoved] === 15) {
      const loser = opponent(playerWhoJustMoved);
      if (state.off[loser] === 0) {
        const loserHasCheckerInWinnersHome = state.points
          .slice(HOME_RANGES[playerWhoJustMoved][0], HOME_RANGES[playerWhoJustMoved][1] + 1)
          .some((p) => p.owner === loser && p.count > 0);
        if (state.bar[loser] > 0 || loserHasCheckerInWinnersHome) {
          return 'backgammon';
        }
        return 'gammon';
      }
      return 'single';
    }
    return null;
  }

  /** Roll two dice (1-6). */
  function rollDice() {
    return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  }

  /** Start a new turn: sets state.dice from a [d1,d2] roll (doubles => four moves). */
  function startTurn(state, player, roll) {
    const next = cloneState(state);
    next.turn = player;
    next.originalRoll = [...roll];
    next.dice = roll[0] === roll[1] ? [roll[0], roll[0], roll[0], roll[0]] : [...roll];
    next.movesPlayedThisTurn = 0;
    next.history = [];
    return next;
  }

  /** Play one move: removes the die, records history, checks for a win. */
  function playMove(state, move) {
    const player = state.turn;
    let next = applyMove(state, player, move);
    next.dice = removeOneFromMultiset(state.dice, move.die);
    next.movesPlayedThisTurn = state.movesPlayedThisTurn + 1;
    next.history = [...state.history, { ...move }];
    const winType = checkWin(next, player);
    if (winType) {
      next.winner = player;
      next.winType = winType;
    }
    return next;
  }

  function hasLegalMoves(state) {
    return getLegalMoves(state).length > 0;
  }

  return {
    HOME_RANGES,
    opponent,
    createInitialState,
    cloneState,
    distance,
    isHomeIndex,
    entryIndex,
    destIndex,
    allCheckersHome,
    pointOpenFor,
    legalMovesForDie,
    applyMove,
    computeMaxPlayable,
    getLegalMoves,
    pipCount,
    checkWin,
    rollDice,
    startTurn,
    playMove,
    hasLegalMoves,
  };
});
