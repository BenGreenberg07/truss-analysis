// Truss Lab: editor, results and cut list. Solver lives in solver.js.
(function () {
  'use strict';

  var STORE_KEY = 'truss-lab-v1';
  var THEME_KEY = 'truss-lab-theme';

  // Everything is stored in inches, lbf, psi and in²; these factors convert for display and input.
  var LEN_F = { 'in': 1, 'mm': 25.4, 'cm': 2.54, 'm': 0.0254 };
  var FORCE_F = { 'lbf': 1, 'N': 4.448222, 'kN': 0.004448222 };
  var E_F = { 'psi': 1, 'ksi': 0.001, 'MPa': 0.00689476, 'GPa': 0.00000689476, 'Pa': 6894.76 };
  var A_F = { 'in²': 1, 'mm²': 645.16, 'cm²': 6.4516, 'm²': 0.00064516 };
  var SNAPS = { 'in': [0.05, 0.1, 0.125, 0.25, 0.5, 1], 'mm': [1, 2, 5, 10, 25], 'cm': [0.1, 0.25, 0.5, 1, 2.5], 'm': [0.001, 0.0025, 0.005, 0.01, 0.025] };
  function defaultUnits() { return { len: 'in', force: 'lbf', E: 'GPa', A: 'in²' }; }

  // Stock catalog from the E6 Lab 3 design sheet (inches, lbf, grams).
  // rough/finish: offset added to the center-to-center length.
  // weight = perIn * finish + ends. Capacity: cap (centered tabs); offset tabs = offA - offB * finish.
  var STOCK_IDS = ['flat14', 'flat18', 'tube1', 'tube34'];
  function defaultStocks() {
    return {
      flat14: { name: '1/4 x 1 flat bar', kind: 't', rough: 1.30, finish: 1.25, perIn: 11.5, ends: 0, cap: 3000 },
      flat18: { name: '1/8 x 1 flat bar', kind: 't', rough: 1.30, finish: 1.25, perIn: 5.75, ends: 0, cap: 1500 },
      tube1: { name: '1 x 1 tube', kind: 'c', rough: -4.13, finish: -4.25, perIn: 11.41, ends: 122.6, cap: 3000, offA: 2140, offB: 6 },
      tube34: { name: '3/4 x 3/4 tube', kind: 'c', rough: -3.63, finish: -3.75, perIn: 7.64, ends: 72, cap: 2200, offA: 1470, offB: 14 }
    };
  }
  function defaultSettings() {
    return {
      units: defaultUnits(),
      E: 69e9 / 6894.76, // the lab's 69 GPa, stored in psi
      A: 0.25,
      snap: 0.25,
      stocks: defaultStocks(),
      defaultStock: { t: 'flat14', c: 'tube1' },
      // pin hardware = (joints - 2) * perJoint; the two support joints use the test fixture's pins
      pin: { perJoint: 57.5, skip: 2 },
      rules: true
    };
  }

  function emptyModel() {
    return { name: 'Untitled truss', joints: [], members: [], supports: {}, loads: {}, bracket: {}, nextId: 1, settings: defaultSettings() };
  }

  function exampleModel() {
    var m = emptyModel();
    m.name = 'Lab truss example';
    var pts = [[0, 0], [11.8, 0.34], [23.2, 2.02], [31.3, 8.74], [30.6, 17.1], [22.8, 12.8], [14.7, 12], [6, 12], [0, 12]];
    pts.forEach(function (p) { m.joints.push({ id: m.nextId++, x: p[0], y: p[1] }); });
    var J = function (letter) { return letter.charCodeAt(0) - 64; };
    var mem = ['GF', 'HG', 'IH', 'AB', 'CF', 'BG', 'BC', 'CG', 'FD', 'DC', 'FE', 'DE', 'AH', 'BH'];
    mem.forEach(function (ab) { m.members.push({ id: m.nextId++, a: J(ab[0]), b: J(ab[1]) }); });
    // offset end tabs, as on the team spreadsheet
    [4, 7, 11, 12, 13].forEach(function (n) { m.members[n - 1].tab = 'off'; });
    m.supports[J('A')] = 'pin';
    m.supports[J('I')] = 'pin';
    m.loads[J('E')] = { fx: 0, fy: -1000 };
    return m;
  }

  // ---------- state ----------
  var model = emptyModel();
  var result = null;
  var undoStack = [], redoStack = [];
  var ui = { tool: 'select', sel: null, hover: null, pending: null, labels: 'force', tab: 'forces', mode: 'simple', cursor: null, focusLoad: false };
  function simple() { return ui.mode === 'simple'; }
  var view = { x: 12, y: 6, s: 30 };
  var drag = null;
  var spaceDown = false;

  var $ = function (s) { return document.querySelector(s); };
  var svg = $('#canvas');
  var inspector = $('#inspector');

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function U() {
    var u = model.settings.units;
    return { len: u.len, force: u.force, E: u.E, A: u.A, stress: u.force === 'lbf' ? 'psi' : 'MPa' };
  }
  function lenDigits() { return { 'in': 2, 'mm': 1, 'cm': 2, 'm': 4 }[U().len]; }
  function dispDigits() { return { 'in': 4, 'mm': 3, 'cm': 4, 'm': 5 }[U().len]; }
  // stored value -> display value, and back
  function dLen(v) { return v * LEN_F[U().len]; }
  function iLen(v) { return v / LEN_F[U().len]; }
  function dF(v) { return v * FORCE_F[U().force]; }
  function iF(v) { return v / FORCE_F[U().force]; }
  function dStress(v) { return U().stress === 'psi' ? v : v * 0.00689476; }
  function clean(v) { return Number(Number(v).toPrecision(10)); }
  function fDisp(v) { return num(dLen(v), dispDigits()); }
  function fStress(v) { return num(dStress(v), U().stress === 'psi' ? 0 : 1); }
  function pt(x, y) { return '(' + fLen(x) + ', ' + fLen(y) + ')'; }
  function num(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return '–';
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fLen(v) { return num(dLen(v), lenDigits()); }
  function fForce(v) { var d = dF(v); return num(d, Math.abs(d) >= 100 ? 0 : Math.abs(d) >= 1 ? 1 : 3); }
  function fForceExact(v) { var d = dF(v); return num(d, Math.abs(d) >= 1 ? 1 : 3); }
  function round6(v) { return Math.round(v * 1e6) / 1e6; }
  function jointLabel(i) {
    var s = ''; i += 1;
    while (i > 0) { i -= 1; s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26); }
    return s;
  }
  function jointIndex(id) {
    for (var i = 0; i < model.joints.length; i++) if (model.joints[i].id === id) return i;
    return -1;
  }
  function jointById(id) { return model.joints[jointIndex(id)]; }
  function labelOf(id) { return jointLabel(jointIndex(id)); }
  function memberIndex(id) {
    for (var i = 0; i < model.members.length; i++) if (model.members[i].id === id) return i;
    return -1;
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o[k]; }, obj); }
  function setPath(obj, path, val) {
    var keys = path.split('.'), last = keys.pop();
    keys.reduce(function (o, k) { return o[k]; }, obj)[last] = val;
  }

  // ---------- persistence and undo ----------
  function snapshot() { return JSON.stringify(model); }
  function checkpoint() {
    undoStack.push(snapshot());
    if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    model = JSON.parse(undoStack.pop());
    afterLoad(false);
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    model = JSON.parse(redoStack.pop());
    afterLoad(false);
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ model: model, ui: { tab: ui.tab, labels: ui.labels, mode: ui.mode } }));
    } catch (e) { /* storage unavailable: the app still works, it just won't remember */ }
  }
  function normalize(m) {
    var out = Object.assign(emptyModel(), m);
    out.settings = Object.assign(defaultSettings(), m.settings || {});
    var ms = m.settings || {}, ds = defaultStocks();
    out.settings.stocks = {};
    STOCK_IDS.forEach(function (id) { out.settings.stocks[id] = Object.assign(ds[id], (ms.stocks || {})[id] || {}); });
    out.settings.defaultStock = Object.assign({ t: 'flat14', c: 'tube1' }, ms.defaultStock || {});
    out.settings.pin = Object.assign({ perJoint: 57.5, skip: 2 }, ms.pin || {});
    // files saved before the stock catalog: carry over edited offsets and capacities
    if (ms.offsets) {
      Object.assign(out.settings.stocks.flat14, { rough: ms.offsets.tRough, finish: ms.offsets.tFinish });
      Object.assign(out.settings.stocks.tube1, { rough: ms.offsets.cRough, finish: ms.offsets.cFinish });
    }
    if (ms.capacity) {
      Object.assign(out.settings.stocks.flat14, { cap: ms.capacity.t });
      Object.assign(out.settings.stocks.tube1, { cap: ms.capacity.c, offA: ms.capacity.offA || 2140, offB: ms.capacity.offB || 6 });
    }
    ['stock', 'offsets', 'capacity', 'weight'].forEach(function (k) { delete out.settings[k]; });
    out.settings.units = typeof ms.units === 'object' && ms.units ? Object.assign(defaultUnits(), ms.units) : defaultUnits();
    out.members.forEach(function (mb) { if (mb.stock && !out.settings.stocks[mb.stock]) delete mb.stock; });
    out.supports = out.supports || {};
    out.loads = out.loads || {};
    out.bracket = out.bracket || {};
    var maxId = 0;
    out.joints.forEach(function (j) { maxId = Math.max(maxId, j.id); });
    out.members.forEach(function (mb) { maxId = Math.max(maxId, mb.id); });
    out.nextId = Math.max(out.nextId || 1, maxId + 1);
    return out;
  }
  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.model && Array.isArray(data.model.joints)) model = normalize(data.model);
      if (data.ui) {
        if (data.ui.tab) ui.tab = data.ui.tab;
        if (data.ui.labels) ui.labels = data.ui.labels;
        if (data.ui.mode) ui.mode = data.ui.mode;
      }
    } catch (e) { /* ignore a corrupt or blocked store */ }
  }

  // ---------- model edits ----------
  function addJoint(x, y) {
    x = round6(x); y = round6(y);
    for (var i = 0; i < model.joints.length; i++) {
      var j = model.joints[i];
      if (Math.abs(j.x - x) < 1e-9 && Math.abs(j.y - y) < 1e-9) return j.id;
    }
    var id = model.nextId++;
    model.joints.push({ id: id, x: x, y: y });
    return id;
  }
  function hasMember(a, b) {
    return model.members.some(function (m) { return (m.a === a && m.b === b) || (m.a === b && m.b === a); });
  }
  function addMember(a, b) {
    if (a === b || hasMember(a, b)) return null;
    var id = model.nextId++;
    model.members.push({ id: id, a: a, b: b });
    return id;
  }
  function splitMember(memberId, x, y) {
    var i = memberIndex(memberId), m = model.members[i];
    var id = model.nextId++;
    model.joints.push({ id: id, x: round6(x), y: round6(y) });
    var second = { id: model.nextId++, a: id, b: m.b };
    m.b = id;
    delete m.cap;
    model.members.splice(i + 1, 0, second);
    return id;
  }
  function deleteJoint(id) {
    model.joints = model.joints.filter(function (j) { return j.id !== id; });
    model.members = model.members.filter(function (m) { return m.a !== id && m.b !== id; });
    delete model.supports[id];
    delete model.loads[id];
    delete model.bracket[id];
  }
  function deleteMember(id) {
    model.members = model.members.filter(function (m) { return m.id !== id; });
  }
  function deleteSelection() {
    if (!ui.sel) return;
    checkpoint();
    if (ui.sel.type === 'joint') deleteJoint(ui.sel.id); else deleteMember(ui.sel.id);
    ui.sel = null;
    if (ui.pending && jointIndex(ui.pending) < 0) ui.pending = null;
    refresh();
  }
  var SUPPORT_CYCLE = [undefined, 'pin', 'roller-y', 'roller-x'];
  function cycleSupport(id) {
    checkpoint();
    var next = SUPPORT_CYCLE[(SUPPORT_CYCLE.indexOf(model.supports[id]) + 1) % SUPPORT_CYCLE.length];
    if (next) model.supports[id] = next; else delete model.supports[id];
    ui.sel = { type: 'joint', id: id };
    refresh();
  }

  // ---------- analysis ----------
  function analyze() {
    result = window.solveTruss(model);
    var st = model.settings, ok = result.status === 'ok';
    var rows = model.members.map(function (m, i) {
      var a = jointById(m.a), b = jointById(m.b);
      var L = Math.hypot(b.x - a.x, b.y - a.y);
      var F = ok ? result.forces[i] : null;
      var tc = F === null ? null : F > 0 ? 't' : F < 0 ? 'c' : 'z';
      var isC = tc === 'c';
      var stockId = m.stock || st.defaultStock[isC ? 'c' : 't'];
      var sk = st.stocks[stockId];
      var tube = sk.kind === 'c';
      var rough = L + sk.rough;
      var finish = L + sk.finish;
      var off = tube && m.tab === 'off';
      var defCap = off ? sk.offA - sk.offB * finish : sk.cap;
      var cap = m.cap != null ? m.cap : defCap;
      var sf = F ? cap / Math.abs(F) : Infinity;
      var weight = sk.perIn * finish + sk.ends;
      return {
        i: i, m: m, L: L, F: F, tc: tc, rough: rough, finish: finish, cap: cap, defCap: defCap, sf: sf,
        tab: tube ? (off ? 'Offset' : 'Centered') : '',
        stress: F === null ? null : F / st.A, weight: weight,
        stockId: stockId, stock: sk.name, stockKind: sk.kind, manualStock: !!m.stock,
        // flat bar can't take compression, and a tube in tension is wasted weight
        mismatch: (tc === 'c' && sk.kind === 't') || (tc === 't' && sk.kind === 'c'),
        excluded: isBracket(m.a) || isBracket(m.b)
      };
    });
    var s = { rows: rows, maxT: null, maxC: null, minSF: null, weight: 0, defl: null };
    rows.forEach(function (r) {
      s.weight += r.weight;
      if (!ok) return;
      if (r.tc === 't' && (!s.maxT || r.F > s.maxT.F)) s.maxT = r;
      if (r.tc === 'c' && (!s.maxC || r.F < s.maxC.F)) s.maxC = r;
      if (r.F && !r.excluded && (!s.minSF || r.sf < s.minSF.sf)) s.minSF = r;
    });
    s.weight += st.pin.perJoint * Math.max(0, model.joints.length - st.pin.skip);
    if (ok) {
      var best = null, bestMag = 0;
      model.joints.forEach(function (j) {
        var ld = model.loads[j.id];
        if (!ld) return;
        var mag = Math.hypot(ld.fx || 0, ld.fy || 0);
        if (mag > bestMag) { bestMag = mag; best = j; }
      });
      if (best) {
        var ld = model.loads[best.id], u = result.u[best.id];
        var vertical = Math.abs(ld.fy || 0) >= Math.abs(ld.fx || 0);
        s.defl = { joint: best, value: vertical ? u.y : u.x, dir: vertical ? 'vertical' : 'horizontal' };
      }
    }
    s.determinacy = model.members.length + result.counts.r - 2 * model.joints.length;
    // lab score: 60 / (weight in lb x deflection in in) + 30 x safety factor
    if (s.defl && s.minSF && Math.abs(s.defl.value) > 1e-9) {
      s.score = 60 / ((s.weight / 453.592) * Math.abs(s.defl.value)) + 30 * s.minSF.sf;
    }
    s.rules = st.rules ? ruleChecks(rows, ok) : [];
    return s;
  }

  // The lab's mounting bracket is the joint at (0, 0); members there are left out of the overall safety factor.
  function isBracket(id) {
    var j = jointById(id);
    return !!model.bracket[id] || (j && Math.abs(j.x) < 1e-6 && Math.abs(j.y) < 1e-6);
  }

  // E6 Lab 3 design rules (inches).
  function ruleChecks(rows, ok) {
    var out = [], joints = model.joints;
    function add(pass, text) { out.push({ ok: pass, text: text }); }
    if (!joints.length) return out;
    var near = function (j, x, y) { return Math.abs(j.x - x) < 1e-6 && Math.abs(j.y - y) < 1e-6; };
    var lower = joints.filter(function (j) { return near(j, 0, 0); })[0];
    var upper = joints.filter(function (j) { return near(j, 0, 12); })[0];
    add(!!(lower && upper && model.supports[lower.id] && model.supports[upper.id]),
      'Supports at ' + pt(0, 0) + ' and ' + pt(0, 12));
    if (lower && upper) add(!hasMember(lower.id, upper.id), 'No member between the supports');

    var bad = rows.filter(function (r) { return r.L < 2 - 1e-9 || r.L > 15.3 + 1e-9; });
    add(!bad.length, 'Member lengths ' + fLen(2) + ' to ' + fLen(15.3) + ' ' + U().len + (bad.length ? ': member ' + bad.map(function (r) { return r.i + 1; }).join(', ') : ''));

    var lowJ = joints.filter(function (j) { return j.y < -1 - 1e-9; });
    add(!lowJ.length, 'Nothing more than ' + fLen(1) + ' ' + U().len + ' below the bottom support' + (lowJ.length ? ': joint ' + lowJ.map(function (j) { return labelOf(j.id); }).join(', ') : ''));

    var crowded = [], compCrowded = [], tight = [];
    joints.forEach(function (j) {
      var at = rows.filter(function (r) { return r.m.a === j.id || r.m.b === j.id; });
      if (at.length > 5) crowded.push(labelOf(j.id));
      if (ok && at.filter(function (r) { return r.tc === 'c'; }).length > 3) compCrowded.push(labelOf(j.id));
      var ang = at.map(function (r) {
        var o = jointById(r.m.a === j.id ? r.m.b : r.m.a);
        return Math.atan2(o.y - j.y, o.x - j.x) * 180 / Math.PI;
      }).sort(function (a, b) { return a - b; });
      for (var k = 0; k < ang.length && ang.length > 1; k++) {
        var gap = k === ang.length - 1 ? ang[0] + 360 - ang[k] : ang[k + 1] - ang[k];
        if (gap < 30 - 1e-6) { tight.push(labelOf(j.id)); break; }
      }
    });
    add(!crowded.length, 'At most 5 members at a joint' + (crowded.length ? ': joint ' + crowded.join(', ') : ''));
    if (ok) add(!compCrowded.length, 'At most 3 compression members at a joint' + (compCrowded.length ? ': joint ' + compCrowded.join(', ') : ''));
    add(!tight.length, 'At least 30° between members at a joint' + (tight.length ? ': joint ' + tight.join(', ') : ''));

    var loaded = joints.filter(function (j) { var l = model.loads[j.id]; return l && (l.fx || l.fy); });
    if (loaded.length) {
      var lj = loaded[0], maxY = Math.max.apply(null, joints.map(function (j) { return j.y; }));
      add(near(lj, 30, 18), 'Load at ' + pt(30, 18));
      add(lj.y >= maxY - 1e-9, 'Load point is the highest point');
      var rightAngle = false, at2 = rows.filter(function (r) { return r.m.a === lj.id || r.m.b === lj.id; });
      for (var p = 0; p < at2.length; p++) for (var q = p + 1; q < at2.length; q++) {
        var o1 = jointById(at2[p].m.a === lj.id ? at2[p].m.b : at2[p].m.a), o2 = jointById(at2[q].m.a === lj.id ? at2[q].m.b : at2[q].m.a);
        var d = (o1.x - lj.x) * (o2.x - lj.x) + (o1.y - lj.y) * (o2.y - lj.y);
        var c = d / (Math.hypot(o1.x - lj.x, o1.y - lj.y) * Math.hypot(o2.x - lj.x, o2.y - lj.y));
        if (Math.abs(c) < 0.0175) rightAngle = true;
      }
      add(!rightAngle, 'No right angle at the load point');
    }
    var mism = rows.filter(function (r) { return r.mismatch; });
    if (ok) add(!mism.length, 'Stock matches tension or compression' + (mism.length ? ': member ' + mism.map(function (r) { return r.i + 1; }).join(', ') : ''));
    return out;
  }

  // ---------- view ----------
  function size() { return { w: svg.clientWidth || 800, h: svg.clientHeight || 500 }; }
  function toS(x, y) {
    var z = size();
    return [z.w / 2 + (x - view.x) * view.s, z.h / 2 - (y - view.y) * view.s];
  }
  function toW(px, py) {
    var z = size();
    return [view.x + (px - z.w / 2) / view.s, view.y - (py - z.h / 2) / view.s];
  }
  function localPoint(e) {
    var r = svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function snapV(v, free) {
    if (free) return round6(v);
    var g = model.settings.snap;
    return round6(Math.round(v / g) * g);
  }
  function fitView() {
    var z = size();
    if (!model.joints.length) {
      view = { x: 12, y: 6, s: 30 };
      return;
    }
    var xs = model.joints.map(function (j) { return j.x; }), ys = model.joints.map(function (j) { return j.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6);
    var s = Math.min((z.w - Math.min(220, z.w * 0.3)) / w, (z.h - Math.min(200, z.h * 0.35)) / h);
    if (!isFinite(s) || s <= 0) s = 30;
    view = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: Math.min(Math.max(s, 0.05), 400) };
  }
  function zoomAt(px, py, factor) {
    var w = toW(px, py);
    view.s = Math.min(Math.max(view.s * factor, 0.05), 400);
    var z = size();
    view.x = w[0] - (px - z.w / 2) / view.s;
    view.y = w[1] + (py - z.h / 2) / view.s;
    renderCanvas();
  }

  // ---------- canvas rendering ----------
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var steps = [1, 2, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= raw) return steps[i] * p;
    return 10 * p;
  }
  function arrow(x1, y1, x2, y2, lineCls, headCls) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    var hl = 10, hw = 4.5, bx = x2 - ux * hl, by = y2 - uy * hl;
    return '<line class="' + lineCls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + bx + '" y2="' + by + '"/>' +
      '<polygon class="' + headCls + '" points="' + x2 + ',' + y2 + ' ' + (bx - uy * hw) + ',' + (by + ux * hw) + ' ' + (bx + uy * hw) + ',' + (by - ux * hw) + '"/>';
  }
  function hatch(x0, x1, y) {
    var out = '';
    for (var x = x0 + 4; x <= x1; x += 6) out += '<line class="support-hatch" x1="' + x + '" y1="' + y + '" x2="' + (x - 5) + '" y2="' + (y + 6) + '"/>';
    return out;
  }
  function supportGlyph(type, px, py) {
    var g;
    if (type === 'pin') {
      g = '<path class="support" d="M0 0 L-11 17 L11 17 Z"/>' +
        '<line class="support-ground" x1="-16" y1="17" x2="16" y2="17"/>' + hatch(-16, 16, 17);
    } else {
      g = '<path class="support" d="M0 0 L-10 13 L10 13 Z"/>' +
        '<circle class="support" cx="-5.5" cy="16.5" r="3.3"/><circle class="support" cx="5.5" cy="16.5" r="3.3"/>' +
        '<line class="support-ground" x1="-16" y1="20" x2="16" y2="20"/>' + hatch(-16, 16, 20);
    }
    var rot = type === 'roller-x' ? ' rotate(90)' : '';
    return '<g transform="translate(' + px + ',' + py + ')' + rot + '">' + g + '</g>';
  }

  function renderCanvas() {
    var z = size(), out = [];
    var data = analyze.cache;
    if (!data) return;
    var solved = result && result.status === 'ok';

    // grid
    // pick grid spacing in display units so the labels are round numbers
    var lf = LEN_F[U().len];
    var stepD = niceStep(16 * lf / view.s), step = stepD / lf, major = step * 5;
    var tl = toW(0, 0), br = toW(z.w, z.h);
    var gx0 = Math.floor(tl[0] / step) * step, gy0 = Math.floor(br[1] / step) * step;
    var minor = '', majorL = '', labels = '';
    var dec = Math.max(0, -Math.floor(Math.log10(stepD * 5) + 1e-9));
    for (var gx = gx0; gx <= br[0]; gx += step) {
      if (Math.abs(gx) < step / 2) continue;
      var sx = toS(gx, 0)[0];
      if (Math.abs(gx / major - Math.round(gx / major)) < 1e-6) {
        majorL += 'M' + sx + ' 0V' + z.h;
        labels += '<text class="grid-label" x="' + (sx + 3) + '" y="' + (z.h - 6) + '">' + round6(gx * lf).toFixed(dec) + '</text>';
      } else minor += 'M' + sx + ' 0V' + z.h;
    }
    for (var gy = gy0; gy <= tl[1]; gy += step) {
      if (Math.abs(gy) < step / 2) continue;
      var sy = toS(0, gy)[1];
      if (Math.abs(gy / major - Math.round(gy / major)) < 1e-6) {
        majorL += 'M0 ' + sy + 'H' + z.w;
        labels += '<text class="grid-label" x="4" y="' + (sy - 3) + '">' + round6(gy * lf).toFixed(dec) + '</text>';
      } else minor += 'M0 ' + sy + 'H' + z.w;
    }
    var o = toS(0, 0);
    out.push('<path class="grid-minor" d="' + minor + '"/>', '<path class="grid-major" d="' + majorL + '"/>');
    out.push('<path class="grid-axis" d="M' + o[0] + ' 0V' + z.h + 'M0 ' + o[1] + 'H' + z.w + '"/>');
    out.push(labels);

    // members
    var maxF = 0;
    if (solved) result.forces.forEach(function (f) { maxF = Math.max(maxF, Math.abs(f)); });
    var pills = [];
    // boxes already taken by joints and placed labels, so labels can slide along their member to a clear spot
    var taken = model.joints.map(function (j) { var s = toS(j.x, j.y); return [s[0] - 13, s[1] - 13, s[0] + 13, s[1] + 13]; });
    function clash(b) {
      for (var k = 0; k < taken.length; k++) {
        var t = taken[k];
        if (b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]) return true;
      }
      return false;
    }
    model.members.forEach(function (m, i) {
      var a = jointById(m.a), b = jointById(m.b);
      var p = toS(a.x, a.y), q = toS(b.x, b.y);
      var row = data.rows[i];
      var cls = 'member-line', w = 3;
      if (solved && row) {
        cls += ' ' + row.tc;
        w = row.tc === 'z' ? 2 : 2.5 + (maxF ? 6 * Math.abs(row.F) / maxF : 0);
      }
      var isSel = ui.sel && ui.sel.type === 'member' && ui.sel.id === m.id;
      var isHover = ui.hover && ui.hover.type === 'member' && ui.hover.id === m.id;
      var seg = 'x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '"';
      if (isSel) out.push('<line class="member-sel" ' + seg + ' stroke-width="' + (w + 9) + '"/>');
      else if (isHover) out.push('<line class="member-hover" ' + seg + ' stroke-width="' + (w + 8) + '"/>');
      out.push('<line class="' + cls + '" ' + seg + ' stroke-width="' + w + '"/>');
      out.push('<line class="member-hit" data-m="' + m.id + '" ' + seg + '/>');

      var text, pc = 'pill';
      var L = Math.hypot(b.x - a.x, b.y - a.y);
      if (ui.labels === 'length') text = (i + 1) + ' · ' + fLen(L) + ' ' + U().len;
      else if (ui.labels === 'force' && solved && row) {
        text = (i + 1) + ' · ' + (row.tc === 'z' ? '0' : fForce(Math.abs(row.F)) + ' ' + row.tc.toUpperCase());
        pc += ' ' + row.tc;
      } else text = String(i + 1);
      var tw = text.length * 6.7 + 12, cx, cy, box;
      var spots = [0.5, 0.38, 0.62, 0.28, 0.72, 0.5];
      for (var si = 0; si < spots.length; si++) {
        cx = p[0] + (q[0] - p[0]) * spots[si];
        cy = p[1] + (q[1] - p[1]) * spots[si];
        box = [cx - tw / 2 - 2, cy - 11, cx + tw / 2 + 2, cy + 11];
        if (!clash(box)) break;
      }
      taken.push(box);
      pills.push('<g class="' + pc + '" data-m="' + m.id + '"><rect x="' + (cx - tw / 2) + '" y="' + (cy - 9) + '" width="' + tw + '" height="18" rx="2"/><text x="' + cx + '" y="' + cy + '">' + esc(text) + '</text></g>');
    });

    // rubber band while drawing members
    if (ui.tool === 'member' && ui.pending && ui.cursor) {
      var pj = jointById(ui.pending);
      if (pj) {
        var a1 = toS(pj.x, pj.y), b1 = toS(ui.cursor[0], ui.cursor[1]);
        out.push('<line class="rubber" x1="' + a1[0] + '" y1="' + a1[1] + '" x2="' + b1[0] + '" y2="' + b1[1] + '"/>');
      }
    }

    // supports, loads, reactions
    model.joints.forEach(function (j) {
      var p = toS(j.x, j.y);
      var sup = model.supports[j.id];
      if (sup) out.push(supportGlyph(sup, p[0], p[1]));
      var ld = model.loads[j.id];
      if (ld && (ld.fx || ld.fy)) {
        var mag = Math.hypot(ld.fx || 0, ld.fy || 0);
        var ux = (ld.fx || 0) / mag, uy = -(ld.fy || 0) / mag;
        var tipX = p[0] - ux * 8, tipY = p[1] - uy * 8, tailX = p[0] - ux * 64, tailY = p[1] - uy * 64;
        out.push(arrow(tailX, tailY, tipX, tipY, 'load-arrow', 'load-head'));
        var anchor = Math.abs(ux) > 0.5 ? (ux > 0 ? 'end' : 'start') : 'middle';
        var lx = tailX - ux * 8, ly = tailY - uy * 8 + 4;
        if (anchor === 'middle') ly = uy > 0 ? tailY - 8 : tailY + 16;
        out.push('<text class="load-text" text-anchor="' + anchor + '" x="' + lx + '" y="' + ly + '">' + fForce(mag) + ' ' + U().force + '</text>');
      }
      if (solved && result.reactions[j.id]) {
        var r = result.reactions[j.id];
        if (Math.abs(r.y) > 1e-9) {
          var x = p[0], y0 = p[1] + 30, y1 = p[1] + 70;
          out.push(r.y > 0 ? arrow(x, y1, x, y0, 'react-arrow', 'react-head') : arrow(x, y0, x, y1, 'react-arrow', 'react-head'));
          out.push('<text class="react-text" x="' + (x + 7) + '" y="' + (y1 - 2) + '">' + fForce(Math.abs(r.y)) + '</text>');
        }
        if (Math.abs(r.x) > 1e-9) {
          var yy = p[1], x0 = p[0] - 30, x1 = p[0] - 76;
          out.push(r.x > 0 ? arrow(x1, yy, x0, yy, 'react-arrow', 'react-head') : arrow(x0, yy, x1, yy, 'react-arrow', 'react-head'));
          out.push('<text class="react-text" text-anchor="middle" x="' + ((x0 + x1) / 2) + '" y="' + (yy - 7) + '">' + fForce(Math.abs(r.x)) + '</text>');
        }
      }
    });

    out.push(pills.join(''));

    // joints
    model.joints.forEach(function (j, idx) {
      var p = toS(j.x, j.y);
      var isSel = ui.sel && ui.sel.type === 'joint' && ui.sel.id === j.id;
      var isHover = ui.hover && ui.hover.type === 'joint' && ui.hover.id === j.id;
      if (isSel) out.push('<circle class="joint-sel" cx="' + p[0] + '" cy="' + p[1] + '" r="11"/>');
      else if (isHover) out.push('<circle class="joint-hover" cx="' + p[0] + '" cy="' + p[1] + '" r="10"/>');
      if (ui.pending === j.id) out.push('<circle class="joint-pending" cx="' + p[0] + '" cy="' + p[1] + '" r="13"/>');
      var loose = result && result.status === 'unstable' && result.mechanismJoint === j.id;
      if (loose) out.push('<circle class="joint-loose" cx="' + p[0] + '" cy="' + p[1] + '" r="12"/>');
      out.push('<circle class="joint-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="5"/>');
      // put the label on the side away from the members
      var vx = 0, vy = 0;
      model.members.forEach(function (m) {
        if (m.a !== j.id && m.b !== j.id) return;
        var other = jointById(m.a === j.id ? m.b : m.a), q = toS(other.x, other.y);
        var d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        vx += (q[0] - p[0]) / d; vy += (q[1] - p[1]) / d;
      });
      if (model.supports[j.id] && model.supports[j.id] !== 'roller-x') vy += 1.2;
      var vl = Math.hypot(vx, vy);
      var lx = vl > 0.2 ? -vx / vl : -0.7, ly = vl > 0.2 ? -vy / vl : -0.7;
      out.push('<text class="joint-label" text-anchor="middle" x="' + (p[0] + lx * 17) + '" y="' + (p[1] + ly * 17 + 4.5) + '">' + jointLabel(idx) + '</text>');
      out.push('<circle class="joint-hit" data-j="' + j.id + '" cx="' + p[0] + '" cy="' + p[1] + '" r="12"/>');
    });

    // snap marker
    if ((ui.tool === 'joint' || ui.tool === 'member') && ui.cursor && !(ui.hover && ui.hover.type === 'joint')) {
      var c = toS(ui.cursor[0], ui.cursor[1]);
      out.push('<path class="snap-mark" d="M' + (c[0] - 6) + ' ' + c[1] + 'h12M' + c[0] + ' ' + (c[1] - 6) + 'v12"/>');
    }

    svg.setAttribute('viewBox', '0 0 ' + z.w + ' ' + z.h);
    svg.innerHTML = out.join('');
    svg.className.baseVal = 'tool-' + ui.tool + (drag && drag.type === 'pan' && drag.moved ? ' panning' : '');
  }

  // ---------- canvas chrome ----------
  var HINTS = {
    select: 'Drag a joint to move it. Drag empty space to pan, scroll to zoom. Arrow keys nudge the selected joint.',
    joint: 'Click to place a joint. It snaps to the grid; hold Alt to place freely. Click a member to split it.',
    member: 'Click a joint or an empty spot to start a member.',
    memberPending: 'Click the next joint to connect it. Press Esc to stop.',
    support: 'Click a joint to cycle its support: pin, roller (vertical reaction), side roller (horizontal reaction), none.',
    load: 'Click a joint, then type its load in the side panel. Negative Fy points down.'
  };
  function renderChrome(data) {
    document.body.classList.toggle('mode-simple', simple());
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.mode === ui.mode));
    });
    document.querySelectorAll('.tool[data-tool]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === ui.tool));
    });
    document.querySelectorAll('[data-labels]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.labels === ui.labels));
    });
    $('#btnUndo').disabled = !undoStack.length;
    $('#btnRedo').disabled = !redoStack.length;
    $('#canvasHint').textContent = ui.tool === 'member' && ui.pending ? HINTS.memberPending
      : ui.tool === 'select' && model.members.length ? '' : HINTS[ui.tool];
    $('#emptyState').hidden = model.joints.length > 0;

    var status = $('#canvasStatus'), msg = '', cls = 'canvas-status';
    if (result.status === 'empty') msg = model.joints.length ? 'Connect the joints with members to solve.' : '';
    else if (result.status === 'ok') {
      var d = data.determinacy;
      msg = 'Solved. ' + (d === 0 ? 'Statically determinate.' : d > 0 ? 'Statically indeterminate (degree ' + d + '), so forces depend on member stiffness.' : 'Check the supports: m + r is less than 2j.');
      if (!Object.keys(model.loads).length) msg = 'Solved, but there are no loads yet. Use the Load tool.';
    } else {
      msg = result.message;
      if (result.mechanismJoint != null && jointIndex(result.mechanismJoint) >= 0) {
        msg = 'The truss is a mechanism: joint ' + labelOf(result.mechanismJoint) + ' (in red) can move without stretching any member. Brace it with another member, or check for a loop with too few diagonals.';
      }
      cls += ' warn';
    }
    status.className = cls;
    status.textContent = msg;
    if (document.activeElement !== $('#projectName')) $('#projectName').value = model.name;
  }

  // ---------- inspector ----------
  var SUPPORT_LABELS = { none: 'None', 'pin': 'Pin', 'roller-y': 'Roller', 'roller-x': 'Side roller' };
  var SUPPORT_ICONS = {
    none: '<svg viewBox="0 0 28 24"><circle cx="14" cy="8" r="3"/></svg>',
    'pin': '<svg viewBox="0 0 28 24"><path d="M14 4 L8 14 L20 14 Z M5 14h18M8 14l-2 4M13 14l-2 4M18 14l-2 4M23 14l-2 4"/></svg>',
    'roller-y': '<svg viewBox="0 0 28 24"><path d="M14 3 L8 11 L20 11 Z"/><circle cx="10.5" cy="13.5" r="2.2"/><circle cx="17.5" cy="13.5" r="2.2"/><path d="M5 16h18"/></svg>',
    'roller-x': '<svg viewBox="0 0 28 24"><path d="M20 12 L12 6 L12 18 Z"/><circle cx="9.5" cy="8.5" r="2.2"/><circle cx="9.5" cy="15.5" r="2.2"/><path d="M7 3v18"/></svg>'
  };
  function field(id, label, value, unit, extra) {
    return '<label class="field">' + label + '<span class="unit"><input id="' + id + '" type="number" step="any" value="' + (value === '' ? '' : esc(value)) + '"' + (extra || '') + '><em>' + esc(unit) + '</em></span></label>';
  }
  function renderInspector(data) {
    var ae = document.activeElement, focusId = ae && inspector.contains(ae) ? ae.id : null;
    var u = U(), html = '', solved = result.status === 'ok';

    if (ui.sel && ui.sel.type === 'joint' && jointIndex(ui.sel.id) >= 0) {
      var j = jointById(ui.sel.id), ld = model.loads[j.id] || { fx: 0, fy: 0 };
      var sup = model.supports[j.id] || 'none';
      html += '<div class="insp-eyebrow">Joint</div><h2 class="insp-title">Joint ' + labelOf(j.id) + '</h2>';
      html += '<div class="insp-section"><h3>Position</h3><div class="field-row">' +
        field('jx', 'x', clean(dLen(j.x)), u.len) + field('jy', 'y', clean(dLen(j.y)), u.len) + '</div></div>';
      html += '<div class="insp-section"><h3>Support</h3><div class="support-picker">';
      ['none', 'pin', 'roller-y', 'roller-x'].forEach(function (k) {
        html += '<button type="button" data-support="' + k + '" aria-pressed="' + (sup === k) + '">' + SUPPORT_ICONS[k] + SUPPORT_LABELS[k] + '</button>';
      });
      html += '</div></div>';
      html += '<div class="insp-section"><h3>Load</h3><div class="field-row">' +
        field('fx', 'Fx', clean(dF(ld.fx || 0)), u.force) + field('fy', 'Fy', clean(dF(ld.fy || 0)), u.force) + '</div>' +
        (simple() ? '</div>' : '<label class="check"><input type="checkbox" id="bracket"' + (isBracket(j.id) ? ' checked' : '') + (Math.abs(j.x) < 1e-6 && Math.abs(j.y) < 1e-6 ? ' disabled' : '') + '> Mounting bracket: leave the members attached here out of the overall safety factor' + (Math.abs(j.x) < 1e-6 && Math.abs(j.y) < 1e-6 ? ' (always on at 0, 0)' : '') + '</label></div>');
      if (solved && !simple()) {
        var d = result.u[j.id], r = result.reactions[j.id];
        html += '<div class="insp-section"><h3>Results</h3><dl class="readout">' +
          '<dt>Displacement x</dt><dd>' + fDisp(d.x) + ' ' + u.len + '</dd>' +
          '<dt>Displacement y</dt><dd>' + fDisp(d.y) + ' ' + u.len + '</dd>' +
          (r ? '<dt>Reaction Rx</dt><dd>' + fForceExact(r.x) + ' ' + u.force + '</dd><dt>Reaction Ry</dt><dd>' + fForceExact(r.y) + ' ' + u.force + '</dd>' : '') +
          '</dl></div>';
      }
      html += '<div class="insp-actions"><button type="button" class="btn danger small" data-action="delete">Delete joint</button></div>';
    } else if (ui.sel && ui.sel.type === 'member' && memberIndex(ui.sel.id) >= 0) {
      var i = memberIndex(ui.sel.id), m = model.members[i], row = data.rows[i];
      var tag = row.tc ? ' <span class="tc-tag ' + row.tc + '">' + (row.tc === 'z' ? '0' : row.tc.toUpperCase()) + '</span>' : '';
      html += '<div class="insp-eyebrow">Member</div><h2 class="insp-title">Member ' + (i + 1) + ', ' + labelOf(m.a) + ' to ' + labelOf(m.b) + tag + '</h2>';
      html += '<div class="insp-section"><dl class="readout">' +
        '<dt>Length c-c</dt><dd>' + fLen(row.L) + ' ' + u.len + '</dd>' +
        (solved ? '<dt>Force</dt><dd>' + (row.tc === 'z' ? '0' : fForceExact(Math.abs(row.F)) + ' ' + u.force + ' ' + (row.tc === 't' ? 'tension' : 'compression')) + '</dd>' +
          (simple() ? '' : '<dt>Stress</dt><dd>' + fStress(Math.abs(row.stress)) + ' ' + u.stress + '</dd>' +
          '<dt>Safety factor</dt><dd>' + (isFinite(row.sf) ? num(row.sf, 2) : '–') + '</dd>') : '') +
        '</dl></div>';
      if (!simple()) html += '<div class="insp-section"><h3>Machining</h3><dl class="readout">' +
        '</dl><label class="field" style="margin:6px 0 8px">Stock<select id="stockSel">' +
        '<option value="">Automatic (' + esc(row.stock) + ')</option>' +
        STOCK_IDS.map(function (id) { return '<option value="' + id + '"' + (m.stock === id ? ' selected' : '') + '>' + esc(model.settings.stocks[id].name) + '</option>'; }).join('') +
        '</select></label>' + (row.mismatch ? '<p class="panel-note warn-text" style="margin:0 0 8px">' + (row.tc === 'c' ? 'This member is in compression, so it needs tube stock.' : 'This member is in tension; flat bar is lighter.') + '</p>' : '') + '<dl class="readout">' +
        '<dt>Rough cut</dt><dd>' + fLen(row.rough) + ' ' + u.len + '</dd>' +
        '<dt>Finish length</dt><dd>' + fLen(row.finish) + ' ' + u.len + '</dd>' +
        (simple() ? '' : '<dt>Weight</dt><dd>' + num(row.weight, 1) + ' g</dd>') + '</dl></div>';
      if (!simple()) html += '<div class="insp-section"><h3>Capacity</h3>';
      if (!simple() && row.tc === 'c') {
        html += '<div class="field" style="margin-bottom:8px">End tabs<div class="seg" role="radiogroup" aria-label="End tabs">' +
          '<button type="button" role="radio" data-tab-type="cen" aria-checked="' + (m.tab !== 'off') + '">Centered</button>' +
          '<button type="button" role="radio" data-tab-type="off" aria-checked="' + (m.tab === 'off') + '">Offset</button></div></div>';
      }
      if (!simple()) html += field('cap', 'Max force for this member', m.cap != null ? clean(dF(m.cap)) : '', u.force, ' placeholder="' + num(dF(row.defCap), 0).replace(/,/g, '') + '"') +
        '<p class="panel-note" style="margin-top:6px">Leave blank to use the default from Lab settings' + (row.tc === 'c' && m.tab === 'off' ? ' (offset tabs: ' + fForce(row.defCap) + ' ' + u.force + ' at this length)' : '') + '.</p></div>';
      html += '<div class="insp-actions"><button type="button" class="btn danger small" data-action="delete">Delete member</button></div>';
    } else {
      ui.sel = null;
      html += '<div class="insp-section"><h3>Add a joint by coordinates</h3><div class="field-row three">' +
        field('addX', 'x', '', u.len) + field('addY', 'y', '', u.len) +
        '<button type="button" class="btn small" data-action="add-joint">Add</button></div>' +
        '<p class="panel-note" style="margin-top:6px">With the Member tool active, each new joint connects to the previous one.</p></div>';
      html += '<div class="insp-section"><h3>Checks</h3><ul class="check-list">' + checks(data) + '</ul></div>';
      if (!simple()) html += '<div class="insp-section"><h3>Keys</h3><ul class="shortcuts">' +
        '<li><kbd>V</kbd><kbd>J</kbd><kbd>M</kbd><kbd>S</kbd><kbd>L</kbd> switch tools</li>' +
        '<li><kbd>Del</kbd> delete the selection</li>' +
        '<li><kbd>Esc</kbd> stop drawing or deselect</li>' +
        '<li><kbd>F</kbd> fit the truss to the view</li>' +
        '<li><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Z</kbd> undo, add <kbd>Shift</kbd> to redo</li>' +
        '<li>Hold <kbd>Space</kbd> and drag to pan with any tool</li></ul></div>';
    }
    inspector.innerHTML = html;
    if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
    if (ui.focusLoad && document.getElementById('fy')) {
      ui.focusLoad = false;
      // wait until the click that picked the joint is done, or the browser moves focus back to the canvas
      setTimeout(function () {
        var fy = document.getElementById('fy');
        if (!fy) return;
        fy.scrollIntoView({ block: 'nearest' });
        fy.focus({ preventScroll: true });
        fy.select();
      }, 0);
    }
  }
  function checks(data) {
    var j = model.joints.length, m = model.members.length, r = result.counts.r, items = [];
    function add(ok, text) { items.push('<li' + (ok ? '' : ' class="bad"') + '>' + text + '</li>'); }
    add(true, j + ' joints, ' + m + ' members, ' + r + ' reaction components');
    var loose = model.joints.filter(function (jt) { return !model.members.some(function (mb) { return mb.a === jt.id || mb.b === jt.id; }); });
    if (loose.length) add(false, 'Not connected: joint ' + loose.map(function (jt) { return labelOf(jt.id); }).join(', '));
    if (j) {
      var d = data.determinacy;
      add(d >= 0, 'm + r = ' + (m + r) + ', 2j = ' + 2 * j + (d === 0 ? ' (determinate)' : d > 0 ? ' (indeterminate by ' + d + ')' : ' (' + (-d) + ' short)'));
    }
    add(r >= 3, r >= 3 ? 'Supports are in place' : 'Needs supports with at least 3 reaction components');
    var loaded = Object.keys(model.loads);
    add(loaded.length > 0, loaded.length ? 'Loaded at joint ' + loaded.map(function (id) { return labelOf(Number(id)); }).join(', ') : 'No loads yet');
    if (result.status === 'unstable' || result.status === 'error') {
      add(false, result.mechanismJoint != null && jointIndex(result.mechanismJoint) >= 0
        ? 'Joint ' + labelOf(result.mechanismJoint) + ' can move freely (mechanism). Add a member to brace it.'
        : esc(result.message));
    }
    if (data.rules && data.rules.length) {
      items.push('<li class="check-head">E6 lab rules</li>');
      data.rules.forEach(function (r) { add(r.ok, esc(r.text)); });
    }
    return items.join('');
  }

  // ---------- results ----------
  function renderSummary(data) {
    var u = U(), solved = result.status === 'ok', parts = [];
    function item(label, value, cls) { parts.push('<span class="' + (cls || '') + '">' + label + ' <b>' + value + '</b></span>'); }
    if (solved) {
      item('Max tension', data.maxT ? fForceExact(data.maxT.F) + ' ' + u.force + ' (member ' + (data.maxT.i + 1) + ')' : '–', 't');
      item('Max compression', data.maxC ? fForceExact(-data.maxC.F) + ' ' + u.force + ' (member ' + (data.maxC.i + 1) + ')' : '–', 'c');
      item('Lowest safety factor', data.minSF ? num(data.minSF.sf, 2) + ' (member ' + (data.minSF.i + 1) + ')' : '–', data.minSF && data.minSF.sf < 1 ? 'bad' : '');
      if (data.defl) item('Deflection at ' + labelOf(data.defl.joint.id) + ' (' + data.defl.dir + ')', fDisp(data.defl.value) + ' ' + u.len);
    } else {
      item('Status', result.status === 'empty' ? 'nothing to solve yet' : 'not solved');
    }
    item('Weight', num(data.weight, 0) + ' g (' + num(data.weight / 453.592, 2) + ' lb)');
    if (solved && data.score) item('Predicted score', num(data.score, 1));
    $('#summary').innerHTML = parts.join('');
  }

  function tcTag(row) {
    if (!row.tc) return '–';
    return '<span class="tc-tag ' + row.tc + '">' + (row.tc === 'z' ? '0' : row.tc.toUpperCase()) + '</span>';
  }
  function rowAttrs(m) {
    var sel = ui.sel && ui.sel.type === 'member' && ui.sel.id === m.id;
    return ' data-m="' + m.id + '"' + (sel ? ' class="selected"' : '');
  }

  function renderForces(data) {
    var u = U(), solved = result.status === 'ok';
    if (!model.members.length) return '<p class="panel-note">Member forces show up here once you draw members.</p>';
    var h = solved ? '<p class="panel-note">Positive is tension (pulling on the joints), negative is compression. Safety factor is capacity divided by the force. Members at a mounting bracket are greyed out of the overall safety factor.</p>'
      : '<p class="panel-note">' + esc(result.message || 'Not solved yet.') + '</p>';
    h += '<table class="data"><thead><tr><th>#</th><th class="left">Joints</th><th>Length (' + u.len + ')</th><th>Force (' + u.force + ')</th><th>T / C</th><th class="left">Tabs</th><th>Stress (' + u.stress + ')</th><th>Capacity (' + u.force + ')</th><th>Safety factor</th></tr></thead><tbody>';
    data.rows.forEach(function (r) {
      var sfCls = '';
      if (solved && isFinite(r.sf)) {
        if (r.sf < 1) sfCls = 'sf-low';
        if (data.minSF && data.minSF.i === r.i) sfCls += ' sf-min';
        if (r.excluded) sfCls = 'excluded';
      }
      h += '<tr' + rowAttrs(r.m) + '><td>' + (r.i + 1) + '</td><td class="left">' + labelOf(r.m.a) + ' to ' + labelOf(r.m.b) + '</td>' +
        '<td class="num">' + fLen(r.L) + '</td>' +
        '<td class="num">' + (solved ? fForceExact(r.F) : '–') + '</td>' +
        '<td>' + tcTag(r) + '</td><td class="left">' + (r.tab || '–') + '</td>' +
        '<td class="num">' + (solved ? fStress(r.stress) : '–') + '</td>' +
        '<td class="num">' + num(r.cap, 0) + (r.m.cap != null ? '*' : '') + '</td>' +
        '<td class="num ' + sfCls + '">' + (solved && isFinite(r.sf) ? num(r.sf, 2) : '–') + '</td></tr>';
    });
    h += '</tbody></table>';
    if (model.members.some(function (m) { return m.cap != null; })) h += '<p class="panel-note" style="margin-top:8px">* capacity set on that member.</p>';
    return h;
  }

  function stocksUsed(data) {
    var st = model.settings, seen = {};
    data.rows.forEach(function (r) { seen[r.stockId] = true; });
    return STOCK_IDS.filter(function (id) { return seen[id]; }).map(function (id) {
      var sk = st.stocks[id];
      return esc(sk.name) + ': rough = c-c ' + sign(sk.rough) + ', finish = c-c ' + sign(sk.finish);
    }).join('. ');
  }
  function sign(v) { return (v >= 0 ? '+ ' : '- ') + fLen(Math.abs(v)); }
  function ruleSvg(r, span, minorStep, majorStep) {
    var W = 1000, x = function (v) { return Math.max(0, v) / span * W; };
    var s = '<svg class="rule" viewBox="0 0 ' + W + ' 26" preserveAspectRatio="none" aria-hidden="true">';
    for (var t = 0; t <= span + 1e-9; t += minorStep) {
      var major = Math.abs(t / majorStep - Math.round(t / majorStep)) < 1e-6;
      s += '<line class="tick' + (major ? ' major' : '') + '" x1="' + x(t) + '" x2="' + x(t) + '" y1="' + (major ? 18 : 21) + '" y2="26"/>';
    }
    var fin = dLen(r.finish), rgh = dLen(r.rough), cc = dLen(r.L);
    var lo = Math.min(fin, rgh), hi = Math.max(fin, rgh);
    s += '<rect class="finish ' + (r.tc || 't') + '" x="0" y="4" width="' + x(fin) + '" height="12"/>';
    if (hi - lo > 1e-9) s += '<rect class="rough" x="' + x(lo) + '" y="4" width="' + (x(hi) - x(lo)) + '" height="12"/>';
    s += '<line class="cc" x1="' + x(cc) + '" x2="' + x(cc) + '" y1="0" y2="20"/>';
    return s + '</svg>';
  }
  function renderCut(data) {
    var u = U(), st = model.settings, solved = result.status === 'ok';
    if (!model.members.length) return '<p class="panel-note">The cut list fills in once you draw members.</p>';
    var maxLen = 0;
    data.rows.forEach(function (r) { maxLen = Math.max(maxLen, dLen(r.rough), dLen(r.finish), dLen(r.L)); });
    var steps = { 'in': [0.5, 1, 2], 'mm': [10, 50, 100], 'cm': [1, 5, 10], 'm': [0.01, 0.05, 0.1] }[u.len];
    var minorStep = steps[0], majorStep = steps[1], labelStep = steps[2];
    var span = Math.ceil(maxLen / majorStep) * majorStep || majorStep;

    var h = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" fill="#7D8A83"/></pattern></defs></svg>';
    h += '<div class="print-head"><h1>' + esc(model.name) + ': cut list</h1><p>' + new Date().toLocaleDateString() +
      '. Lengths in ' + u.len + '. ' + stocksUsed(data) + '.</p></div>';
    if (!solved) h += '<p class="panel-note">The truss isn\'t solved yet, so members without a chosen stock are listed as ' + esc(st.stocks[st.defaultStock.t].name) + '. ' + esc(result.message || '') + '</p>';
    else h += '<p class="panel-note">Rough cut and finish length are the center-to-center length plus the offset for each stock, from the lab design sheet. Members use ' + esc(st.stocks[st.defaultStock.t].name) + ' in tension and ' + esc(st.stocks[st.defaultStock.c].name) + ' in compression unless you pick a stock for them.</p>';
    h += '<div class="cut-legend"><span><i class="sw finish"></i>Finish length</span><span><i class="sw rough"></i>Extra for the rough cut</span><span><i class="sw cc"></i>Center-to-center length</span></div>';

    var scale = '<div class="rule-scale">';
    for (var t = 0; t <= span + 1e-9; t += labelStep) scale += '<span style="left:' + (t / span * 100) + '%">' + round6(t) + '</span>';
    scale += '</div>';

    h += '<table class="data"><thead><tr><th>#</th><th class="left">Joints</th><th>T / C</th><th class="left">Stock</th><th class="left">Tabs</th><th>Length c-c</th><th>Rough cut</th><th>Finish</th><th>Weight (g)</th><th class="left rule-cell">' + scale + '</th><th class="print-only">Done</th></tr></thead><tbody>';
    var totals = {};
    data.rows.forEach(function (r) {
      var key = r.stockId;
      totals[key] = totals[key] || { n: 0, rough: 0, name: r.stock };
      totals[key].n++; totals[key].rough += r.rough;
      h += '<tr' + rowAttrs(r.m) + '><td>' + (r.i + 1) + '</td><td class="left">' + labelOf(r.m.a) + ' to ' + labelOf(r.m.b) + '</td><td>' + tcTag(r) + '</td>' +
        '<td class="left' + (r.mismatch ? ' warn-text' : '') + '">' + esc(r.stock) + '</td><td class="left">' + (r.tab || '–') + '</td><td class="num">' + fLen(r.L) + '</td><td class="num">' + fLen(r.rough) + '</td><td class="num"><b>' + fLen(r.finish) + '</b></td>' +
        '<td class="num">' + num(r.weight, 1) + '</td><td class="rule-cell">' + ruleSvg(r, span, minorStep, majorStep) + '</td><td class="print-only"><span class="tickbox"></span></td></tr>';
    });
    h += '</tbody></table><div class="stock-totals">';
    STOCK_IDS.forEach(function (k) {
      if (!totals[k]) return;
      h += '<div>' + esc(totals[k].name) + ': <b>' + totals[k].n + '</b> pieces, <b>' + fLen(totals[k].rough) + ' ' + u.len + '</b> of stock before saw kerf</div>';
    });
    return h + '</div>';
  }

  function renderJoints() {
    var u = U(), solved = result.status === 'ok';
    if (!model.joints.length) return '<p class="panel-note">No joints yet.</p>';
    var h = '<table class="data"><thead><tr><th>Joint</th><th>x (' + u.len + ')</th><th>y (' + u.len + ')</th><th class="left">Support</th><th>Load Fx</th><th>Load Fy</th><th>Reaction Rx</th><th>Reaction Ry</th><th>Disp. x (' + u.len + ')</th><th>Disp. y (' + u.len + ')</th></tr></thead><tbody>';
    model.joints.forEach(function (j, idx) {
      var ld = model.loads[j.id] || {}, r = solved && result.reactions[j.id], d = solved && result.u[j.id];
      var sel = ui.sel && ui.sel.type === 'joint' && ui.sel.id === j.id;
      h += '<tr data-j="' + j.id + '"' + (sel ? ' class="selected"' : '') + '><td>' + jointLabel(idx) + (isBracket(j.id) ? ' (bracket)' : '') + '</td>' +
        '<td class="num">' + fLen(j.x) + '</td><td class="num">' + fLen(j.y) + '</td>' +
        '<td class="left">' + (model.supports[j.id] ? SUPPORT_LABELS[model.supports[j.id]] : '–') + '</td>' +
        '<td class="num">' + (ld.fx ? fForceExact(ld.fx) : '–') + '</td><td class="num">' + (ld.fy ? fForceExact(ld.fy) : '–') + '</td>' +
        '<td class="num">' + (r ? fForceExact(r.x) : '–') + '</td><td class="num">' + (r ? fForceExact(r.y) : '–') + '</td>' +
        '<td class="num">' + (d ? fDisp(d.x) : '–') + '</td><td class="num">' + (d ? fDisp(d.y) : '–') + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function renderSimple(data) {
    var u = U(), solved = result.status === 'ok';
    if (!model.members.length) return '<p class="panel-note">Members show up here once you draw them.</p>';
    var h = '<div class="print-head"><h1>' + esc(model.name) + ': members</h1><p>' + new Date().toLocaleDateString() + '. Lengths in ' + u.len + ', forces in ' + u.force + '; positive force is tension.</p></div>';
    h += solved ? '<p class="panel-note">These columns match the lab design spreadsheet. Use <b>Export to lab spreadsheet</b> to fill it in, then pick each member\'s cross section there to see how it changes the weight and safety factor.</p>'
      : '<p class="panel-note">' + esc(result.message || 'Not solved yet.') + '</p>';
    h += '<table class="data"><thead><tr><th>#</th><th class="left">Joints</th><th>From x</th><th>From y</th><th>To x</th><th>To y</th><th>Length c-c (' + u.len + ')</th><th class="left">T or C</th><th>Force (' + u.force + ')</th></tr></thead><tbody>';
    data.rows.forEach(function (r) {
      var a = jointById(r.m.a), b = jointById(r.m.b);
      var tcText = !r.tc ? '–' : r.tc === 't' ? 'Tension' : r.tc === 'c' ? 'Compression' : 'Zero force';
      h += '<tr' + rowAttrs(r.m) + '><td>' + (r.i + 1) + '</td><td class="left">' + labelOf(r.m.a) + ' to ' + labelOf(r.m.b) + '</td>' +
        '<td class="num">' + fLen(a.x) + '</td><td class="num">' + fLen(a.y) + '</td><td class="num">' + fLen(b.x) + '</td><td class="num">' + fLen(b.y) + '</td>' +
        '<td class="num">' + fLen(r.L) + '</td><td class="left">' + (r.tc ? tcTag(r) + ' ' + tcText : '–') + '</td>' +
        '<td class="num">' + (solved ? fForceExact(r.F) : '–') + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function renderResults(data) {
    if (simple()) {
      $('#panel').innerHTML = renderSimple(data);
      return;
    }
    renderSummary(data);
    document.querySelectorAll('[role="tab"]').forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.tab === ui.tab));
    });
    var panel = $('#panel');
    panel.setAttribute('aria-labelledby', 'tab-' + ui.tab);
    panel.innerHTML = ui.tab === 'cut' ? renderCut(data) : ui.tab === 'joints' ? renderJoints() : renderForces(data);
  }

  // ---------- refresh cycle ----------
  function refresh() {
    var data = analyze();
    analyze.cache = data;
    renderCanvas();
    renderChrome(data);
    renderInspector(data);
    renderResults(data);
    persist();
  }
  var rafPending = false;
  function refreshSoon() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; refresh(); });
  }
  function afterLoad(fit) {
    ui.sel = null; ui.pending = null;
    if (fit) fitView();
    refresh();
  }

  // ---------- canvas interaction ----------
  function hitOf(target) {
    var el = target && target.closest ? target.closest('[data-j],[data-m]') : null;
    if (!el || !svg.contains(el)) return null;
    if (el.dataset.j) return { type: 'joint', id: Number(el.dataset.j) };
    return { type: 'member', id: Number(el.dataset.m) };
  }
  function projectOnMember(id, wx, wy) {
    var m = model.members[memberIndex(id)], a = jointById(m.a), b = jointById(m.b);
    var dx = b.x - a.x, dy = b.y - a.y, t = ((wx - a.x) * dx + (wy - a.y) * dy) / (dx * dx + dy * dy);
    t = Math.min(Math.max(t, 0.05), 0.95);
    return [a.x + t * dx, a.y + t * dy];
  }

  svg.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (ui.pending) { ui.pending = null; refresh(); }
  });

  svg.addEventListener('pointerdown', function (e) {
    svg.focus({ preventScroll: true });
    var lp = localPoint(e), w = toW(lp[0], lp[1]);
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      drag = { type: 'pan', sx: lp[0], sy: lp[1], vx: view.x, vy: view.y, moved: false, clear: false };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    var hit = hitOf(e.target), free = e.altKey;

    if (ui.tool === 'select') {
      if (hit && hit.type === 'joint') {
        ui.sel = hit;
        var j = jointById(hit.id);
        drag = { type: 'joint', id: hit.id, sx: lp[0], sy: lp[1], before: snapshot(), moved: false, ox: j.x - w[0], oy: j.y - w[1] };
        refresh();
      } else if (hit) {
        ui.sel = hit;
        refresh();
      } else {
        drag = { type: 'pan', sx: lp[0], sy: lp[1], vx: view.x, vy: view.y, moved: false, clear: true };
      }
    } else if (ui.tool === 'joint') {
      if (hit && hit.type === 'joint') { ui.sel = hit; refresh(); return; }
      checkpoint();
      var id;
      if (hit && hit.type === 'member') { var pp = projectOnMember(hit.id, w[0], w[1]); id = splitMember(hit.id, pp[0], pp[1]); }
      else id = addJoint(snapV(w[0], free), snapV(w[1], free));
      ui.sel = { type: 'joint', id: id };
      refresh();
    } else if (ui.tool === 'member') {
      checkpoint();
      var target;
      if (hit && hit.type === 'joint') target = hit.id;
      else if (hit && hit.type === 'member') { var p2 = projectOnMember(hit.id, w[0], w[1]); target = splitMember(hit.id, p2[0], p2[1]); }
      else target = addJoint(snapV(w[0], free), snapV(w[1], free));
      if (ui.pending && jointIndex(ui.pending) >= 0 && ui.pending !== target) {
        var mid = addMember(ui.pending, target);
        if (mid) ui.sel = { type: 'member', id: mid };
      }
      ui.pending = target;
      if (snapshot() === undoStack[undoStack.length - 1]) undoStack.pop();
      refresh();
    } else if (ui.tool === 'support') {
      if (hit && hit.type === 'joint') cycleSupport(hit.id);
    } else if (ui.tool === 'load') {
      if (hit && hit.type === 'joint') {
        ui.sel = hit;
        ui.focusLoad = true;
        refresh();
      }
    }
  });

  window.addEventListener('pointermove', function (e) {
    var lp = localPoint(e);
    if (drag && drag.type === 'pan') {
      var dx = lp[0] - drag.sx, dy = lp[1] - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 3) drag.moved = true;
      if (drag.moved) {
        view.x = drag.vx - dx / view.s;
        view.y = drag.vy + dy / view.s;
        renderCanvas();
      }
      return;
    }
    if (drag && drag.type === 'joint') {
      if (!drag.moved && Math.hypot(lp[0] - drag.sx, lp[1] - drag.sy) > 3) {
        drag.moved = true;
        undoStack.push(drag.before);
        redoStack = [];
      }
      if (drag.moved) {
        var w = toW(lp[0], lp[1]), j = jointById(drag.id);
        j.x = snapV(w[0] + drag.ox, e.altKey);
        j.y = snapV(w[1] + drag.oy, e.altKey);
        refreshSoon();
      }
      return;
    }
    if (e.target !== svg && !svg.contains(e.target)) {
      if (ui.cursor || ui.hover) { ui.cursor = null; ui.hover = null; $('#canvasCoords').textContent = ''; renderCanvas(); }
      return;
    }
    var wpt = toW(lp[0], lp[1]), hit = hitOf(e.target);
    var snapped = [snapV(wpt[0], e.altKey), snapV(wpt[1], e.altKey)];
    if (hit && hit.type === 'joint') { var hj = jointById(hit.id); snapped = [hj.x, hj.y]; }
    ui.cursor = snapped;
    $('#canvasCoords').textContent = 'x ' + fLen(snapped[0]) + ', y ' + fLen(snapped[1]) + ' ' + U().len;
    var hoverChanged = JSON.stringify(hit) !== JSON.stringify(ui.hover);
    ui.hover = hit;
    if (hoverChanged || ui.tool === 'member' || ui.tool === 'joint') renderCanvas();
  });

  window.addEventListener('pointerup', function () {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (d.type === 'pan' && !d.moved && d.clear) { ui.sel = null; refresh(); return; }
    if (d.type === 'joint' && d.moved) refresh();
    else renderCanvas();
  });

  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var lp = localPoint(e);
    zoomAt(lp[0], lp[1], Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  // ---------- keyboard ----------
  function typing(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }
  function setTool(t) {
    ui.tool = t;
    if (t !== 'member') ui.pending = null;
    refresh();
  }
  window.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey, k = (e.key || '').toLowerCase();
    if (mod && k === 'z' && !typing(e.target)) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y' && !typing(e.target)) { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); saveFile(); return; }
    if (typing(e.target) || $('#settingsDialog').open) return;
    if (mod || e.altKey) return;
    var tools = { v: 'select', j: 'joint', m: 'member', s: 'support', l: 'load' };
    if (tools[k]) { setTool(tools[k]); return; }
    if (k === 'f') { fitView(); renderCanvas(); return; }
    if (e.key === ' ') {
      if (e.target.tagName !== 'BUTTON') { spaceDown = true; e.preventDefault(); }
      return;
    }
    if (e.key === 'Escape') {
      if (ui.pending) ui.pending = null; else ui.sel = null;
      refresh();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    var arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[e.key] && ui.sel && ui.sel.type === 'joint') {
      e.preventDefault();
      var stepN = model.settings.snap * (e.shiftKey ? 10 : 1), j = jointById(ui.sel.id);
      checkpoint();
      j.x = round6(j.x + arrows[e.key][0] * stepN);
      j.y = round6(j.y + arrows[e.key][1] * stepN);
      refresh();
    }
  });
  window.addEventListener('keyup', function (e) { if (e.key === ' ') spaceDown = false; });

  // ---------- inspector events ----------
  function readNum(el) {
    if (!el || el.value.trim() === '') return null;
    var v = Number(el.value);
    return isFinite(v) ? v : null;
  }
  inspector.addEventListener('change', function (e) {
    var el = e.target, id = el.id;
    if (!ui.sel) return;
    if (ui.sel.type === 'joint') {
      var j = jointById(ui.sel.id);
      if (id === 'jx' || id === 'jy') {
        var v = readNum(el);
        if (v === null) { refresh(); return; }
        checkpoint();
        j[id === 'jx' ? 'x' : 'y'] = round6(iLen(v));
      } else if (id === 'fx' || id === 'fy') {
        var f = iF(readNum(el) || 0);
        checkpoint();
        var ld = model.loads[j.id] || { fx: 0, fy: 0 };
        ld[id] = f;
        if (ld.fx || ld.fy) model.loads[j.id] = ld; else delete model.loads[j.id];
      } else if (id === 'bracket') {
        checkpoint();
        if (el.checked) model.bracket[j.id] = true; else delete model.bracket[j.id];
      } else return;
      refresh();
    } else if (ui.sel.type === 'member' && id === 'stockSel') {
      var ms = model.members[memberIndex(ui.sel.id)];
      checkpoint();
      if (el.value) ms.stock = el.value; else delete ms.stock;
      refresh();
    } else if (ui.sel.type === 'member' && id === 'cap') {
      var m = model.members[memberIndex(ui.sel.id)], c = readNum(el);
      checkpoint();
      if (c === null || c <= 0) delete m.cap; else m.cap = iF(c);
      refresh();
    }
  });
  inspector.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.support && ui.sel) {
      checkpoint();
      if (b.dataset.support === 'none') delete model.supports[ui.sel.id]; else model.supports[ui.sel.id] = b.dataset.support;
      refresh();
    } else if (b.dataset.tabType && ui.sel && ui.sel.type === 'member') {
      checkpoint();
      var mt = model.members[memberIndex(ui.sel.id)];
      if (b.dataset.tabType === 'off') mt.tab = 'off'; else delete mt.tab;
      refresh();
    } else if (b.dataset.action === 'delete') deleteSelection();
    else if (b.dataset.action === 'add-joint') addJointFromForm();
  });
  inspector.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'addX' || e.target.id === 'addY') { e.preventDefault(); addJointFromForm(); }
    else if (e.target.tagName === 'INPUT') e.target.blur();
  });
  function addJointFromForm() {
    var x = readNum($('#addX')), y = readNum($('#addY'));
    if (x === null || y === null) { toast('Enter both x and y.'); (x === null ? $('#addX') : $('#addY')).focus(); return; }
    checkpoint();
    x = iLen(x); y = iLen(y);
    var id = addJoint(x, y);
    if (ui.tool === 'member' && ui.pending && ui.pending !== id) addMember(ui.pending, id);
    if (ui.tool === 'member') ui.pending = id;
    var z = size(), p = toS(x, y);
    if (p[0] < 40 || p[1] < 40 || p[0] > z.w - 40 || p[1] > z.h - 40) fitView();
    refresh();
    $('#addX').value = ''; $('#addY').value = '';
    $('#addX').focus();
    toast('Added joint ' + labelOf(id) + ' at (' + fLen(x) + ', ' + fLen(y) + ').');
  }

  // ---------- results events ----------
  $('#panel').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-m], tr[data-j]');
    if (!tr) return;
    ui.sel = tr.dataset.m ? { type: 'member', id: Number(tr.dataset.m) } : { type: 'joint', id: Number(tr.dataset.j) };
    refresh();
  });
  document.querySelectorAll('[role="tab"]').forEach(function (t) {
    t.addEventListener('click', function () { ui.tab = t.dataset.tab; refresh(); });
  });
  $('.tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
    var i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    next.click();
  });

  // ---------- toolbar and chrome events ----------
  document.querySelectorAll('.tool[data-tool]').forEach(function (b) {
    b.addEventListener('click', function () { setTool(b.dataset.tool); });
  });
  document.querySelectorAll('[data-labels]').forEach(function (b) {
    b.addEventListener('click', function () { ui.labels = b.dataset.labels; refresh(); });
  });
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { ui.mode = b.dataset.mode; refresh(); });
  });
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#zoomIn').addEventListener('click', function () { var z = size(); zoomAt(z.w / 2, z.h / 2, 1.25); });
  $('#zoomOut').addEventListener('click', function () { var z = size(); zoomAt(z.w / 2, z.h / 2, 0.8); });
  $('#zoomFit').addEventListener('click', function () { fitView(); renderCanvas(); });
  $('#projectName').addEventListener('change', function (e) {
    checkpoint();
    model.name = e.target.value.trim() || 'Untitled truss';
    refresh();
  });
  $('#projectName').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.blur(); });

  $('#btnNew').addEventListener('click', function () {
    checkpoint();
    var keep = model.settings;
    model = emptyModel();
    model.settings = keep;
    afterLoad(true);
    toast('Started a new truss. Undo brings the old one back.');
  });
  function loadExample() {
    checkpoint();
    model = exampleModel();
    afterLoad(true);
    toast('Loaded the lab truss example: ' + fForce(1000) + ' ' + U().force + ' down at joint E.');
  }
  $('#btnExample').addEventListener('click', loadExample);
  $('#btnExample2').addEventListener('click', loadExample);

  // ---------- files ----------
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function slug() { return (model.name || 'truss').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'truss'; }
  function saveFile() {
    download(slug() + '.truss.json', JSON.stringify({ app: 'truss-lab', version: 1, model: model }, null, 2), 'application/json');
    toast('Saved ' + slug() + '.truss.json');
  }
  $('#btnSave').addEventListener('click', saveFile);
  $('#btnOpen').addEventListener('click', function () { $('#fileInput').click(); });
  $('#fileInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var m = data.model || data;
        if (!Array.isArray(m.joints) || !Array.isArray(m.members)) throw new Error('shape');
        checkpoint();
        model = normalize(m);
        afterLoad(true);
        toast('Opened ' + file.name);
      } catch (err) {
        toast('Couldn\'t open ' + file.name + '. Choose a .truss.json file saved from Truss Lab.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  function csvCell(v) {
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  $('#btnCsv').addEventListener('click', function () {
    var data = analyze.cache, u = U(), solved = result.status === 'ok';
    if (simple()) {
      var rowsS = ['Member,From,To,From x (' + u.len + '),From y (' + u.len + '),To x (' + u.len + '),To y (' + u.len + '),Length c-c (' + u.len + '),T or C,Force (' + u.force + ', + tension)'];
      data.rows.forEach(function (r) {
        var ja = jointById(r.m.a), jb = jointById(r.m.b);
        rowsS.push([r.i + 1, labelOf(r.m.a), labelOf(r.m.b), clean(dLen(ja.x)), clean(dLen(ja.y)), clean(dLen(jb.x)), clean(dLen(jb.y)), dLen(r.L).toFixed(4),
          solved ? (r.tc === 't' ? 'T' : r.tc === 'c' ? 'C' : '0') : '', solved ? dF(r.F).toFixed(2) : ''].map(csvCell).join(','));
      });
      download(slug() + '-members.csv', rowsS.join('\n') + '\n', 'text/csv');
      toast('Downloaded ' + slug() + '-members.csv');
      return;
    }
    var head = ['Member', 'From', 'To', 'Length c-c (' + u.len + ')', 'Force (' + u.force + ')', 'T or C', 'Tabs', 'Stress (' + u.stress + ')', 'Capacity (' + u.force + ')', 'Safety factor', 'Stock', 'Rough cut (' + u.len + ')', 'Finish length (' + u.len + ')', 'Weight (g)'];
    var lines = [head.join(',')];
    data.rows.forEach(function (r) {
      lines.push([
        r.i + 1, labelOf(r.m.a), labelOf(r.m.b), dLen(r.L).toFixed(4),
        solved ? dF(r.F).toFixed(2) : '', solved ? (r.tc === 't' ? 'Tension' : r.tc === 'c' ? 'Compression' : 'Zero') : '', r.tab,
        solved ? dStress(r.stress).toFixed(1) : '', dF(r.cap).toFixed(1), solved && isFinite(r.sf) ? r.sf.toFixed(2) : '',
        r.stock, dLen(r.rough).toFixed(4), dLen(r.finish).toFixed(4), r.weight.toFixed(1)
      ].map(csvCell).join(','));
    });
    download(slug() + '-members.csv', lines.join('\n') + '\n', 'text/csv');
    toast('Downloaded ' + slug() + '-members.csv');
  });
  $('#btnPrint').addEventListener('click', function () {
    ui.tab = 'cut';
    refresh();
    window.print();
  });

  // ---------- lab spreadsheet export ----------
  // Writes the E6 Lab 3 design sheet layout with the lab's own formulas, so students
  // choose each member's cross section and tabs in Excel and watch weight and safety factor update.
  var EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  var SHEET_STOCK = { flat14: '1/4x1', flat18: '1/8x1', tube1: '1x1', tube34: '3/4x3/4' };
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise(function (resolve, reject) {
      var tag = document.createElement('script');
      tag.src = EXCELJS_URL;
      tag.onload = function () { resolve(window.ExcelJS); };
      tag.onerror = reject;
      document.head.appendChild(tag);
    });
  }
  function labFormulas(r) {
    var H = 'H' + r, F = 'F' + r, J = 'J' + r, L = 'L' + r;
    return {
      F: 'SQRT((B' + r + '-D' + r + ')^2 +(C' + r + '-E' + r + ')^2)',
      I: 'IF(' + H + '="1/4x1",' + F + '+1.3,IF(' + H + '="1/8x1",' + F + '+1.3,IF(' + H + '="1x1",' + F + '-4.13,IF(' + H + '="3/4x3/4",' + F + '-3.63))))',
      J: 'IF(' + H + '="1/4x1",' + F + '+1.25,IF(' + H + '="1/8x1",' + F + '+1.25,IF(' + H + '="1x1",' + F + '-4.25,IF(' + H + '="3/4x3/4",' + F + '-3.75))))',
      K: 'IF(' + H + '="1/4x1",' + J + '*11.5,IF(' + H + '="1/8x1",' + J + '*5.75,IF(' + H + '="1x1",' + J + '*11.41+2*61.3,IF(' + H + '="3/4x3/4",' + J + '*7.64+2*36))))',
      M: 'IF(' + H + '="1/4x1",3000,IF(' + H + '="1/8x1",1500,IF(AND(' + H + '="1x1",' + L + '="CEN"),3000,IF(AND(' + H + '="1x1",' + L + '="OFF"),-6*' + J + '+2140,IF(AND(' + H + '="3/4x3/4",' + L + '="CEN"),2200,IF(AND(' + H + '="3/4x3/4",' + L + '="OFF"),-14*' + J + '+1470))))))',
      O: 'M' + r + '/ABS(N' + r + ')'
    };
  }
  function exportSheet() {
    var data = analyze.cache, solved = result.status === 'ok';
    if (!model.members.length) { toast('Draw some members first.'); return; }
    if (!solved) { toast('Solve the truss first: ' + result.message); return; }
    toast('Building the spreadsheet...');
    loadExcelJS().then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook();
      wb.calcProperties.fullCalcOnLoad = true;
      var ws = wb.addWorksheet('Design');
      var yellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2A8' } };
      var gray = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
      var head1 = ['Member', 'From X', 'From y', 'To X', 'To Y', 'center-to-center', 'T or C', 'Cross Section', 'Rough Cut', 'Finish length', 'Weight', '', '', 'Force', 'Safety'];
      var head2 = ['', 'in.', 'in.', 'in.', 'in.', 'in.', '(comp/tens)', 'in. x in.', 'in', 'in.', 'member+ends', 'Tab', 'Max Force', '(lbf)', 'Factor'];
      ws.addRow(head1); ws.addRow(head2);
      [1, 2].forEach(function (n) { ws.getRow(n).font = { bold: true }; });
      var n = data.rows.length, first = 3, last = 2 + n, bracketFree = [];
      data.rows.forEach(function (row, k) {
        var r = first + k, a = jointById(row.m.a), b = jointById(row.m.b), f = labFormulas(r);
        var cross = row.manualStock ? SHEET_STOCK[row.stockId] : (row.tc === 'c' ? SHEET_STOCK[model.settings.defaultStock.c] : SHEET_STOCK[model.settings.defaultStock.t]);
        var isTube = cross === '1x1' || cross === '3/4x3/4';
        ws.getCell('A' + r).value = k + 1;
        ws.getCell('B' + r).value = clean(a.x); ws.getCell('C' + r).value = clean(a.y);
        ws.getCell('D' + r).value = clean(b.x); ws.getCell('E' + r).value = clean(b.y);
        ws.getCell('F' + r).value = { formula: f.F };
        ws.getCell('G' + r).value = row.tc === 'c' ? 'C' : row.tc === 't' ? 'T' : '0';
        ws.getCell('H' + r).value = cross;
        ws.getCell('I' + r).value = { formula: f.I };
        ws.getCell('J' + r).value = { formula: f.J };
        ws.getCell('K' + r).value = { formula: f.K };
        ws.getCell('L' + r).value = isTube ? (row.m.tab === 'off' ? 'OFF' : 'CEN') : ' ';
        ws.getCell('M' + r).value = { formula: f.M };
        ws.getCell('N' + r).value = Math.round(row.F * 100) / 100;
        ws.getCell('O' + r).value = { formula: f.O };
        ws.getCell('H' + r).dataValidation = { type: 'list', allowBlank: false, formulae: ['"1/4x1,1/8x1,1x1,3/4x3/4"'] };
        ws.getCell('L' + r).dataValidation = { type: 'list', allowBlank: true, formulae: ['"CEN,OFF, "'] };
        ['H', 'L'].forEach(function (c) { ws.getCell(c + r).fill = yellow; });
        ['F', 'I', 'J', 'K', 'M', 'O'].forEach(function (c) { ws.getCell(c + r).fill = gray; });
        ['F', 'I', 'J'].forEach(function (c) { ws.getCell(c + r).numFmt = '0.00'; });
        ['K', 'M', 'N'].forEach(function (c) { ws.getCell(c + r).numFmt = '0.00'; });
        ws.getCell('O' + r).numFmt = '0.00';
        if (!row.excluded && row.F) bracketFree.push('O' + r);
      });
      var t = last + 1;
      ws.getCell('F' + t).value = 'Number of joints'; ws.getCell('G' + t).value = model.joints.length;
      ws.getCell('J' + t).value = 'pin hardware'; ws.getCell('K' + t).value = { formula: '(G' + t + '-2)*(50+2*3.75)' };
      ws.getCell('J' + (t + 1)).value = 'total (gm)'; ws.getCell('K' + (t + 1)).value = { formula: 'SUM(K' + first + ':K' + t + ')' };
      ws.getCell('J' + (t + 2)).value = 'total(lb)'; ws.getCell('K' + (t + 2)).value = { formula: 'K' + (t + 1) + '*0.00220462' };
      ws.getCell('J' + (t + 3)).value = 'Deflection ';
      ws.getCell('K' + (t + 3)).value = data.defl ? Math.round(data.defl.value * 10000) / 10000 : null;
      ws.getCell('O' + (t + 3)).value = bracketFree.length ? { formula: 'MIN(' + bracketFree.join(',') + ')' } : null;
      ws.getCell('P' + (t + 4)).value = 'Overall Safety Factor: the lowest safety factor, excluding members attached to the lower bracket at (0,0)';
      ws.getCell('J' + (t + 5)).value = 'Predicted score';
      ws.getCell('K' + (t + 5)).value = { formula: 'IFERROR(60/(K' + (t + 2) + '*ABS(K' + (t + 3) + '))+30*O' + (t + 3) + ',"")' };
      ['K' + t, 'K' + (t + 1), 'K' + (t + 2), 'O' + (t + 3), 'K' + (t + 5)].forEach(function (c) { ws.getCell(c).fill = gray; ws.getCell(c).numFmt = '0.00'; });
      ws.getCell('K' + (t + 3)).numFmt = '0.0000';
      ws.getCell('A' + (t + 7)).value = 'Exported from Truss Lab. Coordinates are in inches and forces in lbf so the lab formulas work. Pick each member\'s Cross Section and Tab in the yellow cells; gray cells update.';
      [8, 8, 8, 8, 8, 16, 11, 13, 10, 13, 13, 6, 11, 10, 9].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      var name = slug() + '-design-sheet.xlsx';
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      toast('Downloaded ' + name);
    }).catch(function () {
      toast('Couldn\'t build the spreadsheet. It needs an internet connection the first time; Download CSV works offline.');
    });
  }
  if ($('#btnXlsx')) $('#btnXlsx').addEventListener('click', exportSheet);

  // ---------- settings ----------
  var dialog = $('#settingsDialog');
  // Each setting has a kind, so it shows in the chosen units and converts back when edited.
  var KINDS = {
    plain: [function (v) { return v; }, function (v) { return v; }],
    len: [function (v) { return dLen(v); }, function (v) { return iLen(v); }],
    force: [function (v) { return dF(v); }, function (v) { return iF(v); }],
    perLen: [function (v) { return v / LEN_F[U().len]; }, function (v) { return v * LEN_F[U().len]; }],
    forcePerLen: [function (v) { return dF(v) / LEN_F[U().len]; }, function (v) { return iF(v) * LEN_F[U().len]; }],
    E: [function (v) { return v * E_F[U().E]; }, function (v) { return v / E_F[U().E]; }],
    A: [function (v) { return v * A_F[U().A]; }, function (v) { return v / A_F[U().A]; }]
  };
  function sInput(path, kind, label) {
    var v = getPath(model.settings, path);
    return '<input type="number" step="any" data-setting="' + path + '" data-kind="' + kind + '" value="' + clean(KINDS[kind][0](v)) + '"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '>';
  }
  function sField(path, label, unit, kind) {
    return '<label class="field">' + label + '<span class="unit">' + sInput(path, kind || 'plain') + '<em>' + esc(unit || '') + '</em></span></label>';
  }
  function sSelect(special, label, options, current) {
    return '<label class="field">' + label + '<select data-special="' + special + '">' + options.map(function (o) {
      var val = Array.isArray(o) ? o[0] : o, text = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(val) + '"' + (String(val) === String(current) ? ' selected' : '') + '>' + esc(text) + '</option>';
    }).join('') + '</select></label>';
  }
  function currentTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; }
  }
  function nearestSnap(len, snapIn) {
    var best = null;
    SNAPS[len].forEach(function (d) { var v = d / LEN_F[len]; if (best === null || Math.abs(v - snapIn) < Math.abs(best - snapIn)) best = v; });
    return best;
  }
  function renderSettings() {
    var u = U(), st = model.settings, theme = currentTheme();
    var snapOpts = SNAPS[u.len].map(function (d) { return [d / LEN_F[u.len], d + ' ' + u.len]; });
    var curSnap = snapOpts.filter(function (o) { return Math.abs(o[0] - st.snap) < 1e-9; })[0];
    var h = '<fieldset><legend>Units</legend><p class="hint">Each quantity has its own unit, so mixed units work, like the lab\'s A = 0.25 in² with E = 69 GPa. Values are converted, never re-entered.</p><div class="settings-grid">' +
      sSelect('unit-len', 'Length', Object.keys(LEN_F), u.len) +
      sSelect('unit-force', 'Force', Object.keys(FORCE_F), u.force) +
      (simple() ? '' : sSelect('unit-E', 'Elastic modulus', Object.keys(E_F), u.E) + sSelect('unit-A', 'Area', Object.keys(A_F), u.A)) +
      sSelect('snap', 'Grid snap', snapOpts, curSnap ? curSnap[0] : '') +
      '</div></fieldset>';
    if (!simple()) {
      h += '<fieldset><legend>Material</legend><div class="settings-grid">' +
        sField('E', 'Elastic modulus E', u.E, 'E') + sField('A', 'Cross-section area A', u.A, 'A') +
        '</div><p class="hint">The lab uses A = 0.25 in² and E = 69 GPa for every member. E and A only change the predicted deflection, unless the truss is statically indeterminate.</p></fieldset>';
      var cols = [['rough', 'Rough cut', u.len, 'len'], ['finish', 'Finish', u.len, 'len'], ['perIn', 'Weight', 'g/' + u.len, 'perLen'], ['ends', 'Ends', 'g', 'plain'],
        ['cap', 'Capacity', u.force, 'force'], ['offA', 'Offset base', u.force, 'force'], ['offB', 'Offset per ' + u.len, u.force, 'forcePerLen']];
      h += '<fieldset><legend>Stock</legend><p class="hint">From the E6 Lab 3 design sheet. Rough cut and finish length = center-to-center length + offset; weight = weight per length x finish length + end fittings; offset-tab capacity = base - per length x finish length.</p>' +
        '<div class="stock-table-wrap"><table class="stock-table"><thead><tr><th class="left">Stock</th><th class="left">Used for</th>' +
        cols.map(function (c) { return '<th>' + c[1] + ' <em>' + esc(c[2]) + '</em></th>'; }).join('') + '</tr></thead><tbody>';
      STOCK_IDS.forEach(function (id) {
        var sk = st.stocks[id];
        h += '<tr><td class="left">' + esc(sk.name) + '</td><td class="left">' + (sk.kind === 't' ? 'Tension' : 'Compression') + '</td>' +
          cols.map(function (c) { return sk[c[0]] === undefined ? '<td>–</td>' : '<td>' + sInput('stocks.' + id + '.' + c[0], c[3], sk.name + ' ' + c[1]) + '</td>'; }).join('') + '</tr>';
      });
      h += '</tbody></table></div><div class="settings-grid">' +
        sSelect('defT', 'Default tension stock', STOCK_IDS.filter(function (id) { return st.stocks[id].kind === 't'; }).map(function (id) { return [id, st.stocks[id].name]; }), st.defaultStock.t) +
        sSelect('defC', 'Default compression stock', STOCK_IDS.filter(function (id) { return st.stocks[id].kind === 'c'; }).map(function (id) { return [id, st.stocks[id].name]; }), st.defaultStock.c) +
        sField('pin.perJoint', 'Pin hardware per joint', 'g', 'plain') +
        '</div><p class="hint">Pin hardware = (joints - 2) x per joint. The two support joints use the test fixture\'s pins.</p></fieldset>';
    }
    h += '<fieldset><legend>Checks</legend><label class="check"><input type="checkbox" data-special="rules"' + (st.rules ? ' checked' : '') + '> Check the E6 lab design rules (member lengths, angles, load point, supports)</label></fieldset>';
    h += '<fieldset><legend>Appearance</legend><div class="settings-grid">' +
      sSelect('theme', 'Theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], theme) + '</div></fieldset>';
    $('#settingsBody').innerHTML = h;
  }
  $('#btnSettings').addEventListener('click', function () { renderSettings(); dialog.showModal(); });
  $('#settingsBody').addEventListener('change', function (e) {
    var el = e.target, sp = el.dataset.special;
    if (el.dataset.setting) {
      var v = readNum(el);
      if (v === null) { renderSettings(); return; }
      checkpoint();
      setPath(model.settings, el.dataset.setting, KINDS[el.dataset.kind || 'plain'][1](v));
      refresh();
    } else if (sp && sp.indexOf('unit-') === 0) {
      var key = sp.slice(5);
      model.settings.units[key] = el.value;
      if (key === 'len') model.settings.snap = nearestSnap(el.value, model.settings.snap);
      refresh();
      renderSettings();
    } else if (sp === 'defT' || sp === 'defC') {
      checkpoint();
      model.settings.defaultStock[sp === 'defT' ? 't' : 'c'] = el.value;
      refresh();
    } else if (sp === 'rules') {
      checkpoint();
      model.settings.rules = el.checked;
      refresh();
    } else if (sp === 'snap') {
      model.settings.snap = Number(el.value);
      refresh();
    } else if (sp === 'theme') {
      try { localStorage.setItem(THEME_KEY, el.value); } catch (err) { /* ignore */ }
      applyTheme();
    }
  });
  $('#btnResetSettings').addEventListener('click', function () {
    checkpoint();
    var units = model.settings.units;
    model.settings = defaultSettings();
    model.settings.units = units;
    model.settings.snap = nearestSnap(units.len, model.settings.snap);
    refresh();
    renderSettings();
    toast('Lab settings reset to the defaults.');
  });

  function applyTheme() {
    var t = currentTheme();
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  // ---------- start ----------
  applyTheme();
  restore();
  analyze.cache = analyze();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { renderCanvas(); }).observe(svg);
  fitView();
  refresh();
})();
