// 2D pin-jointed truss solver (direct stiffness method).
// Pure function, no DOM: solveTruss(model) -> result.
(function (root) {
  'use strict';

  // Supports: 'pin' restrains x and y, 'roller-y' restrains y (rolls along x),
  // 'roller-x' restrains x (rolls along y).
  var RESTRAINT = {
    'pin': [true, true],
    'roller-y': [false, true],
    'roller-x': [true, false]
  };

  function solveTruss(model) {
    var joints = model.joints, members = model.members;
    var E = model.settings.E, A = model.settings.A;
    var res = {
      status: 'ok', message: '', forces: [], lengths: [], u: {}, reactions: {},
      counts: { j: joints.length, m: members.length, r: 0 }
    };
    if (!joints.length || !members.length) {
      res.status = 'empty';
      res.message = 'Add joints and members to start.';
      return res;
    }
    if (!(E > 0 && isFinite(E)) || !(A > 0 && isFinite(A))) {
      res.status = 'error';
      res.message = 'The elastic modulus E and area A must be positive numbers. Check Lab settings.';
      return res;
    }
    for (var jc = 0; jc < joints.length; jc++) {
      if (!isFinite(joints[jc].x) || !isFinite(joints[jc].y)) {
        res.status = 'error';
        res.message = 'Joint ' + (jc + 1) + ' has an invalid position.';
        return res;
      }
    }

    var index = {};
    joints.forEach(function (j, i) { index[j.id] = i; });
    var N = 2 * joints.length;
    var K = [];
    for (var i = 0; i < N; i++) K.push(new Float64Array(N));

    var geom = [];
    for (var e = 0; e < members.length; e++) {
      var mb = members[e];
      var a = joints[index[mb.a]], b = joints[index[mb.b]];
      if (!a || !b) {
        res.status = 'error';
        res.message = 'Member ' + (e + 1) + ' is connected to a joint that does not exist.';
        return res;
      }
      var dx = b.x - a.x, dy = b.y - a.y;
      var L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-9) {
        res.status = 'error';
        res.message = 'Member ' + (e + 1) + ' has zero length. Move one of its joints.';
        return res;
      }
      var c = dx / L, s = dy / L, k = E * A / L;
      var dofs = [2 * index[mb.a], 2 * index[mb.a] + 1, 2 * index[mb.b], 2 * index[mb.b] + 1];
      var t = [-c, -s, c, s];
      for (var p = 0; p < 4; p++)
        for (var q = 0; q < 4; q++)
          K[dofs[p]][dofs[q]] += k * t[p] * t[q];
      geom.push({ dofs: dofs, t: t, k: k, L: L });
      res.lengths.push(L);
    }

    var F = new Float64Array(N);
    joints.forEach(function (j, i) {
      var ld = model.loads[j.id];
      if (ld) { F[2 * i] = ld.fx || 0; F[2 * i + 1] = ld.fy || 0; }
    });

    var fixed = new Array(N).fill(false);
    joints.forEach(function (j, i) {
      var r = RESTRAINT[model.supports[j.id]];
      if (r) {
        fixed[2 * i] = r[0];
        fixed[2 * i + 1] = r[1];
        res.counts.r += (r[0] ? 1 : 0) + (r[1] ? 1 : 0);
      }
    });
    if (res.counts.r === 0) {
      res.status = 'unstable';
      res.message = 'Add supports. A truss needs at least 3 reaction components (for example a pin and a roller).';
      return res;
    }

    var free = [];
    for (i = 0; i < N; i++) if (!fixed[i]) free.push(i);
    var n = free.length;
    var M = [], rhs = new Float64Array(n);
    var maxDiag = 0;
    for (i = 0; i < n; i++) {
      var row = new Float64Array(n);
      for (var jj = 0; jj < n; jj++) row[jj] = K[free[i]][free[jj]];
      M.push(row);
      rhs[i] = F[free[i]];
      maxDiag = Math.max(maxDiag, Math.abs(row[i]));
    }

    // Gaussian elimination with partial pivoting
    var tol = 1e-9 * (maxDiag || 1);
    for (var col = 0; col < n; col++) {
      var piv = col;
      for (var r2 = col + 1; r2 < n; r2++)
        if (Math.abs(M[r2][col]) > Math.abs(M[piv][col])) piv = r2;
      if (Math.abs(M[piv][col]) < tol) {
        res.status = 'unstable';
        res.message = 'The truss is a mechanism: it can move without stretching any member. Add a member or a support.';
        // the column with no pivot is a free direction of motion, so its joint is part of the mechanism
        res.mechanismJoint = joints[Math.floor(free[col] / 2)].id;
        return res;
      }
      if (piv !== col) {
        var tmp = M[piv]; M[piv] = M[col]; M[col] = tmp;
        var tr = rhs[piv]; rhs[piv] = rhs[col]; rhs[col] = tr;
      }
      for (r2 = col + 1; r2 < n; r2++) {
        var f = M[r2][col] / M[col][col];
        if (f === 0) continue;
        for (var c2 = col; c2 < n; c2++) M[r2][c2] -= f * M[col][c2];
        rhs[r2] -= f * rhs[col];
      }
    }
    var x = new Float64Array(n);
    for (i = n - 1; i >= 0; i--) {
      var sum = rhs[i];
      for (jj = i + 1; jj < n; jj++) sum -= M[i][jj] * x[jj];
      x[i] = sum / M[i][i];
    }

    var U = new Float64Array(N);
    free.forEach(function (d, i2) { U[d] = x[i2]; });

    var maxF = 0;
    geom.forEach(function (g) {
      var ext = 0;
      for (var p2 = 0; p2 < 4; p2++) ext += g.t[p2] * U[g.dofs[p2]];
      var force = g.k * ext;
      res.forces.push(force);
      maxF = Math.max(maxF, Math.abs(force));
    });
    // clear floating-point dust so zero-force members read as exactly zero
    res.forces = res.forces.map(function (v) {
      return Math.abs(v) < Math.max(1e-9, 1e-9 * maxF) ? 0 : v;
    });

    joints.forEach(function (j, i2) {
      res.u[j.id] = { x: U[2 * i2], y: U[2 * i2 + 1] };
      if (fixed[2 * i2] || fixed[2 * i2 + 1]) {
        var rx = 0, ry = 0;
        for (var d = 0; d < N; d++) {
          rx += K[2 * i2][d] * U[d];
          ry += K[2 * i2 + 1][d] * U[d];
        }
        rx -= F[2 * i2]; ry -= F[2 * i2 + 1];
        res.reactions[j.id] = { x: fixed[2 * i2] ? rx : 0, y: fixed[2 * i2 + 1] ? ry : 0 };
      }
    });
    return res;
  }

  root.solveTruss = solveTruss;
})(typeof window !== 'undefined' ? window : globalThis);
