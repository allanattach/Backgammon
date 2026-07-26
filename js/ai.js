/**
 * Heuristic computer opponent. Depends on BgRules (js/rules-engine.js) being loaded first.
 * Enumerates every legal full-turn move sequence (already restricted to rule-legal
 * sequences by the rules engine's forced dice-usage logic) and picks the one whose
 * resulting position scores best under a static evaluation function.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rules-engine.js'));
  } else {
    root.BgAI = factory(root.BgRules);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (R) {
  'use strict';

  // Approximate direct+indirect shot counts out of 36, ignoring intervening blocks.
  // Distances beyond 12 are rare combination/double shots and treated as 0 for simplicity.
  const SHOT_TABLE = { 1: 11, 2: 12, 3: 14, 4: 15, 5: 15, 6: 17, 7: 6, 8: 6, 9: 5, 10: 3, 11: 2, 12: 3 };

  function shotsAgainst(distance) {
    return SHOT_TABLE[distance] || 0;
  }

  /**
   * Enumerate all distinct legal full-turn move sequences from the given state.
   * Returns a list of { moves: [...], finalState }.
   */
  function enumerateSequences(state) {
    const results = [];

    function recurse(s, movesSoFar) {
      const legal = R.getLegalMoves(s);
      if (legal.length === 0) {
        results.push({ moves: movesSoFar, finalState: s });
        return;
      }
      for (const mv of legal) {
        const next = R.playMove(s, mv);
        recurse(next, [...movesSoFar, mv]);
      }
    }

    recurse(state, []);
    if (results.length === 0) results.push({ moves: [], finalState: state });
    return results;
  }

  /** Static evaluation of `state` from `player`'s perspective. Higher is better for `player`. */
  function evaluate(state, player) {
    const opp = R.opponent(player);
    let score = 0;

    score -= R.pipCount(state, player) * 2;
    score += R.pipCount(state, opp) * 2;

    score += state.off[player] * 25;
    score -= state.off[opp] * 25;

    score -= state.bar[player] * 60;
    score += state.bar[opp] * 40;

    const [homeLo, homeHi] = R.HOME_RANGES[player];
    let pointsMade = 0;

    for (let i = 0; i < 24; i++) {
      const p = state.points[i];
      if (p.owner === player) {
        if (p.count >= 2) {
          if (i >= homeLo && i <= homeHi) pointsMade += 1;
        } else if (p.count === 1) {
          // Blot: penalise by how exposed it is to the opponent.
          const dist = R.distance(player, i);
          // Roughly: an opponent checker "behind" this blot (i.e. between it and
          // the opponent's entry side) at any distance 1-12 could hit it. We don't
          // track exact opponent checker positions here for full precision; use a
          // simplified board-wide exposure estimate based on how many opponent
          // checkers could plausibly reach, scaled by proximity.
          let exposure = 0;
          for (let j = 0; j < 24; j++) {
            const q = state.points[j];
            if (q.owner !== opp || q.count === 0) continue;
            const oppDist = player === 'white' ? j - i : i - j;
            if (oppDist > 0 && oppDist <= 12) exposure += shotsAgainst(oppDist);
          }
          const deepPenalty = 1 + (24 - dist) / 24; // blots deep in own territory hurt more if hit
          score -= exposure * 0.6 * deepPenalty;
        }
      }
    }
    score += pointsMade * 6;

    return score;
  }

  /**
   * Choose the best full-turn move sequence for the current player.
   * `level`: 'easy' picks a random legal sequence, anything else picks the best-scored one.
   */
  function chooseSequence(state, level) {
    const sequences = enumerateSequences(state);
    if (level === 'easy') {
      return sequences[Math.floor(Math.random() * sequences.length)];
    }
    let best = sequences[0];
    let bestScore = -Infinity;
    for (const seq of sequences) {
      const s = evaluate(seq.finalState, state.turn);
      if (s > bestScore) {
        bestScore = s;
        best = seq;
      }
    }
    return best;
  }

  return { evaluate, enumerateSequences, chooseSequence, shotsAgainst };
});
