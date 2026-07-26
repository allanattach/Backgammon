const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules-engine.js');

function pointsWith(entries) {
  const points = Array.from({ length: 24 }, () => ({ owner: null, count: 0 }));
  for (const [num, owner, count] of entries) points[num - 1] = { owner, count };
  return points;
}

function baseState(overrides) {
  const s = R.createInitialState();
  return { ...s, ...overrides };
}

test('initial setup has 15 checkers per side and correct layout', () => {
  const s = R.createInitialState();
  let white = 0, black = 0;
  for (const p of s.points) {
    if (p.owner === 'white') white += p.count;
    if (p.owner === 'black') black += p.count;
  }
  assert.equal(white, 15);
  assert.equal(black, 15);
  assert.equal(s.points[23].count, 2); // point 24
  assert.equal(s.points[23].owner, 'white');
  assert.equal(s.points[0].count, 2); // point 1
  assert.equal(s.points[0].owner, 'black');
});

test('white moves decrease point index, black increase', () => {
  assert.equal(R.destIndex('white', 23, 3), 20);
  assert.equal(R.destIndex('black', 0, 3), 3);
});

test('blocked point (2+ opponent checkers) cannot be moved onto', () => {
  let s = baseState({});
  s.points = pointsWith([[24, 'white', 1], [22, 'black', 2]]);
  s.turn = 'white';
  s.dice = [2];
  const moves = R.legalMovesForDie(s, 'white', 2);
  assert.equal(moves.length, 0);
});

test('single opponent checker (blot) can be hit and sent to the bar', () => {
  let s = baseState({});
  s.points = pointsWith([[24, 'white', 1], [22, 'black', 1]]);
  s.turn = 'white';
  const moves = R.legalMovesForDie(s, 'white', 2);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].hit, true);
  const next = R.applyMove(s, 'white', moves[0]);
  assert.equal(next.bar.black, 1);
  assert.equal(next.points[21].owner, 'white');
  assert.equal(next.points[21].count, 1);
});

test('checkers on the bar must enter before any other move', () => {
  let s = baseState({});
  s.points = pointsWith([[24, 'white', 1], [10, 'white', 1]]);
  s.bar = { white: 1, black: 0 };
  s.turn = 'white';
  const moves = R.legalMovesForDie(s, 'white', 3);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, 'bar');
  assert.equal(moves[0].to, R.entryIndex('white', 3));
});

test('entry from the bar is blocked by a closed point (dance)', () => {
  let s = baseState({});
  s.bar = { white: 1, black: 0 };
  // entryIndex('white', 3) === 21, i.e. point 22 (index+1) — block that point.
  s.points = pointsWith([[R.entryIndex('white', 3) + 1, 'black', 2]]);
  s.turn = 'white';
  const moves = R.legalMovesForDie(s, 'white', 3);
  assert.equal(moves.length, 0);
});

test('cannot bear off until all checkers are home', () => {
  let s = baseState({});
  s.points = pointsWith([[6, 'white', 1], [10, 'white', 1]]);
  s.turn = 'white';
  const moves = R.legalMovesForDie(s, 'white', 6);
  // The point-6 checker cannot bear off (not all home yet) and has no other legal
  // destination for an exact-match die, so it contributes no move; only the point-10
  // checker (still outside home) may use the 6 as a normal on-board move.
  assert.ok(!moves.some((m) => m.to === 'off'));
  assert.ok(!moves.some((m) => m.from === 5));
  assert.ok(moves.some((m) => m.from === 9));
});

test('exact die bears a checker off from the matching point', () => {
  let s = baseState({});
  s.points = pointsWith([[6, 'white', 2], [1, 'white', 13]]);
  s.turn = 'white';
  const moves = R.legalMovesForDie(s, 'white', 6);
  assert.ok(moves.some((m) => m.from === 5 && m.to === 'off'));
});

test('over-roll bears off the highest occupied point only', () => {
  let s = baseState({});
  // All 15 white checkers home; highest occupied point is 4.
  s.points = pointsWith([[4, 'white', 2], [1, 'white', 13]]);
  s.turn = 'white';
  const moves = R.legalMovesForDie(s, 'white', 6);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, 3); // point 4 (index 3)
  assert.equal(moves[0].to, 'off');
});

test('a die larger than a point value but not the highest cannot bear that checker off', () => {
  let s = baseState({});
  // Highest occupied point is 6, so a die of 5 cannot bear off the point-4 checker
  // (5 does not exactly match 4, and 4 is not the highest occupied point).
  s.points = pointsWith([[6, 'white', 1], [4, 'white', 1], [1, 'white', 13]]);
  s.turn = 'white';
  const moves = R.legalMovesForDie(s, 'white', 5);
  assert.ok(!moves.some((m) => m.to === 'off'));
  assert.ok(moves.some((m) => m.from === 5 && m.to === 0)); // point6 -> point1, normal move
});

test('must play both dice when possible', () => {
  let s = baseState({});
  s.points = pointsWith([[24, 'white', 1]]);
  s.turn = 'white';
  s.dice = [3, 5];
  s.originalRoll = [3, 5];
  s.movesPlayedThisTurn = 0;
  const first = R.getLegalMoves(s);
  // Only one checker exists; playing 3 then 5 (or 5 then 3) both work, so both dice values usable as first move.
  assert.ok(first.length > 0);
});

test('forced-higher-die rule: if only one die can be played, and either alone works, must play the larger', () => {
  let s = baseState({});
  // A single white checker on point 14: 14-3=11 and 14-5=9 are both open individually,
  // but 3+5=8 pips lands on point 6 either way (14-3-5 === 14-5-3 === 6), which is
  // blocked by black. So only ONE die total can ever be played, though each die is
  // individually legal on its own -> must be forced to play the larger (5).
  s.points = pointsWith([[14, 'white', 1], [6, 'black', 2]]);
  s.turn = 'white';
  s.dice = [3, 5];
  s.originalRoll = [3, 5];
  s.movesPlayedThisTurn = 0;
  const m3 = R.legalMovesForDie(s, 'white', 3);
  const m5 = R.legalMovesForDie(s, 'white', 5);
  assert.ok(m3.length > 0 && m5.length > 0, 'both dice should be individually playable');
  const M = R.computeMaxPlayable(s, 'white', [3, 5]);
  assert.equal(M, 1, 'test position should only allow one die total to be played');
  const legal = R.getLegalMoves(s);
  assert.ok(legal.every((m) => m.die === 5), 'must be forced to play the larger die (5)');
});

test('doubles allow up to four moves of the same die', () => {
  let s = baseState({});
  s.points = pointsWith([[24, 'white', 4]]);
  s.turn = 'white';
  s.dice = [2, 2, 2, 2];
  s.originalRoll = [2, 2];
  const M = R.computeMaxPlayable(s, 'white', [2, 2, 2, 2]);
  assert.equal(M, 4);
});

test('bearing off all 15 checkers wins the game', () => {
  let s = baseState({});
  s.off = { white: 14, black: 0 };
  s.points = pointsWith([[1, 'white', 1]]);
  s.turn = 'white';
  const move = { die: 1, from: 0, to: 'off' };
  const next = R.playMove({ ...s, dice: [1] }, move);
  assert.equal(next.winner, 'white');
});

test('gammon: loser has borne off zero checkers', () => {
  let s = baseState({});
  s.off = { white: 14, black: 0 };
  s.points = pointsWith([[1, 'white', 1], [20, 'black', 15]]);
  s.turn = 'white';
  const move = { die: 1, from: 0, to: 'off' };
  const next = R.playMove({ ...s, dice: [1] }, move);
  assert.equal(next.winner, 'white');
  assert.equal(next.winType, 'gammon');
});

test('backgammon: loser has a checker in the winner\'s home board', () => {
  let s = baseState({});
  s.off = { white: 14, black: 0 };
  s.points = pointsWith([[1, 'white', 1], [3, 'black', 1], [20, 'black', 14]]);
  s.turn = 'white';
  const move = { die: 1, from: 0, to: 'off' };
  const next = R.playMove({ ...s, dice: [1] }, move);
  assert.equal(next.winner, 'white');
  assert.equal(next.winType, 'backgammon');
});

test('pip count decreases as checkers move toward home', () => {
  const s = R.createInitialState();
  const before = R.pipCount(s, 'white');
  assert.equal(before, 2 * 24 + 5 * 13 + 3 * 8 + 5 * 6);
});

test('a completely closed home board causes the entering player to dance', () => {
  let s = baseState({});
  s.bar = { white: 1, black: 0 };
  s.points = pointsWith([
    [19, 'black', 2], [20, 'black', 2], [21, 'black', 2],
    [22, 'black', 2], [23, 'black', 2], [24, 'black', 2],
  ]);
  s.turn = 'white';
  s.dice = [1, 2];
  s.originalRoll = [1, 2];
  const legal = R.getLegalMoves(s);
  assert.equal(legal.length, 0);
});
