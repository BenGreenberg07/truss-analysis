// Run with: node --test tests/solver.test.js
const test = require('node:test');
const assert = require('node:assert');
require('../solver.js');

const settings = { E: 1e7, A: 0.25 };
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, a + ' != ' + b);

function triangle(supports) {
  return {
    joints: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 8, y: 0 }, { id: 3, x: 4, y: 3 }],
    members: [{ id: 4, a: 1, b: 2 }, { id: 5, a: 1, b: 3 }, { id: 6, a: 2, b: 3 }],
    supports: supports || { 1: 'pin', 2: 'roller-y' },
    loads: { 3: { fx: 0, fy: -1000 } },
    settings: settings
  };
}

test('3-4-5 triangle matches the hand solution', () => {
  const r = solveTruss(triangle());
  assert.strictEqual(r.status, 'ok');
  near(r.forces[0], 666.6667, 1e-3);   // bottom chord, tension
  near(r.forces[1], -833.3333, 1e-3);  // diagonals, compression
  near(r.forces[2], -833.3333, 1e-3);
  near(r.reactions[1].y, 500, 1e-6);
  near(r.reactions[2].y, 500, 1e-6);
  near(r.reactions[1].x, 0, 1e-6);
});

test('reactions balance the applied load', () => {
  const m = triangle();
  m.loads = { 3: { fx: 300, fy: -1000 } };
  const r = solveTruss(m);
  const sum = Object.values(r.reactions).reduce((s, v) => ({ x: s.x + v.x, y: s.y + v.y }), { x: 0, y: 0 });
  near(sum.x, -300, 1e-6);
  near(sum.y, 1000, 1e-6);
});

test('a missing member is reported as a mechanism', () => {
  const m = triangle();
  m.members.pop();
  assert.strictEqual(solveTruss(m).status, 'unstable');
});

test('no supports is reported, not solved', () => {
  const r = solveTruss(triangle({}));
  assert.strictEqual(r.status, 'unstable');
  assert.match(r.message, /supports/);
});

test('zero-length member is an error', () => {
  const m = triangle();
  m.joints[2] = { id: 3, x: 0, y: 0 };
  assert.strictEqual(solveTruss(m).status, 'error');
});

test('zero-force members come out exactly zero', () => {
  // unloaded joint 2 has two collinear members (1-2, 2-3), so the third (2-4) carries nothing
  const m = {
    joints: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }, { id: 3, x: 8, y: 0 }, { id: 4, x: 4, y: 3 }],
    members: [{ a: 1, b: 2 }, { a: 2, b: 3 }, { a: 2, b: 4 }, { a: 1, b: 4 }, { a: 3, b: 4 }],
    supports: { 1: 'pin', 3: 'roller-y' },
    loads: { 4: { fx: 0, fy: -100 } },
    settings: settings
  };
  const r = solveTruss(m);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.forces[2], 0);
});

test('lab truss example solves and is determinate', () => {
  const P = { 1: [0, 0], 2: [11.8, 0.34], 3: [23.2, 2.02], 4: [31.3, 8.74], 5: [30.6, 17.1], 6: [22.8, 12.8], 7: [14.7, 12], 8: [6, 12], 9: [0, 12] };
  const pairs = [[7, 6], [8, 7], [9, 8], [1, 2], [3, 6], [2, 7], [2, 3], [3, 7], [6, 4], [4, 3], [6, 5], [4, 5], [1, 8], [2, 8]];
  const r = solveTruss({
    joints: Object.entries(P).map(([id, [x, y]]) => ({ id: Number(id), x, y })),
    members: pairs.map(([a, b]) => ({ a, b })),
    supports: { 1: 'pin', 9: 'pin' },
    loads: { 5: { fx: 0, fy: -1000 } },
    settings: settings
  });
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.counts.m + r.counts.r, 2 * r.counts.j);
  near(r.forces[2], 2550.0, 1);    // member 3 (I to H), tension
  near(r.forces[3], -2080.8, 1);   // member 4 (A to B), compression
});

test('bad E or A is an error, not NaN forces', () => {
  for (const s of [{ E: 0, A: 0.25 }, { E: 1e7, A: 0 }, { E: NaN, A: 0.25 }, { E: 1e7, A: -1 }]) {
    const m = triangle();
    m.settings = s;
    assert.strictEqual(solveTruss(m).status, 'error');
  }
});

test('a member pointing at a missing joint is an error, not a crash', () => {
  const m = triangle();
  m.members.push({ id: 9, a: 1, b: 99 });
  assert.strictEqual(solveTruss(m).status, 'error');
});

test('names the joint that can move when the truss is a mechanism', () => {
  const m = triangle();
  m.members.pop();
  const r = solveTruss(m);
  assert.strictEqual(r.status, 'unstable');
  assert.ok([1, 2, 3].includes(r.mechanismJoint));
});
