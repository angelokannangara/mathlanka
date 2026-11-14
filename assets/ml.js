/* MathLanka core: auth + storage (Firebase with local fallback), quiz engine, question generators.
   Works on any page: <script src="…/assets/ml.js"></script> */
(function () {
'use strict';
var SRC = (document.currentScript && document.currentScript.src) || '';
var ROOT = SRC.replace(/assets\/ml\.js.*$/, '');
var FB_CFG = { apiKey: 'AIzaSyBjMGNztMbvT-UxacasxvokPrdGkU5pp98', authDomain: 'math-lanka.firebaseapp.com', projectId: 'math-lanka',
  storageBucket: 'math-lanka.firebasestorage.app', messagingSenderId: '919138495654', appId: '1:919138495654:web:50af907fc5b3f55b9b1867' };
var FB_VER = '10.12.2';
var LESSONS = { 1: 3, 2: 5, 3: 13, 4: 14, 5: 21 };
var T = {
  en: { ok: 'Correct! 🎉', no: 'Not quite.', ans: 'Answer:', check: 'Check', next: 'Next', fin: 'Finish', q: 'Question', score: 'Score', retry: 'Try again',
        start: 'Start quiz', best: 'Best', tries: 'tries', saved: 'Saved to your profile ✔', savedG: 'Saved on this device (guest). Sign up to keep it everywhere.',
        order: 'Tap the numbers from smallest to largest', reset: 'Reset', dash: 'My dashboard', nextL: 'Next lesson', time: 'Time', ready: 'Ready to test what you learned?', login: 'Login' },
  si: { ok: 'නිවැරදියි! 🎉', no: 'වැරදියි.', ans: 'පිළිතුර:', check: 'පරීක්ෂා කරන්න', next: 'ඊළඟ', fin: 'අවසන්', q: 'ප්‍රශ්නය', score: 'ලකුණු', retry: 'නැවත උත්සාහ කරන්න',
        start: 'ප්‍රශ්නාවලිය අරඹන්න', best: 'හොඳම', tries: 'උත්සාහ', saved: 'ඔබගේ ගිණුමේ සුරැකිණි ✔', savedG: 'මෙම උපාංගයේ සුරැකිණි (ආගන්තුක). සෑම තැනකම තබා ගැනීමට ලියාපදිංචි වන්න.',
        order: 'කුඩාම සිට විශාලම දක්වා අංක ඔබන්න', reset: 'යළි සකසන්න', dash: 'මගේ උපකරණ පුවරුව', nextL: 'ඊළඟ පාඩම', time: 'කාලය', ready: 'ඉගෙන ගත් දේ පරීක්ෂා කරමුද?', login: 'ඇතුල් වන්න' }
};

/* ---------- helpers ---------- */
var R = function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; };
var pick = function (a) { return a[R(0, a.length - 1)]; };
var shuf = function (a) { return a.map(function (x) { return [Math.random(), x]; }).sort(function (p, q) { return p[0] - q[0]; }).map(function (x) { return x[1]; }); };
var rep = function (s, n) { return new Array(n + 1).join(s); };
var LS = { get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
           set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
           del: function (k) { try { localStorage.removeItem(k); } catch (e) {} } };
function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
function dayStr(ts) { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

/* ---------- auth + storage ---------- */
var fb = null, auth = null, db = null, cur = null, userP = null;
async function initFirebase() {
  if (fb !== null) return fb;
  try {
    var b = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-';
    await loadScript(b + 'app-compat.js'); await loadScript(b + 'auth-compat.js'); await loadScript(b + 'firestore-compat.js');
    if (!firebase.apps.length) firebase.initializeApp(FB_CFG);
    auth = firebase.auth(); db = firebase.firestore(); fb = true;
  } catch (e) { fb = false; }
  return fb;
}
async function loadProfile(u) {
  var ref = db.collection('users').doc(u.uid), snap;
  try { snap = await ref.get(); } catch (e) { snap = null; }
  var p = snap && snap.exists ? snap.data() : null;
  if (!p) p = { name: u.displayName || (u.email || 'Student').split('@')[0], grade: 3, medium: 'en' }; // not written here: avoids racing with sign-up
  p.uid = u.uid; p.email = u.email; p.guest = false; return p;
}
function getUser() {
  if (userP) return userP;
  userP = new Promise(async function (res) {
    var ok = await initFirebase();
    if (!ok) { cur = LS.get('ml_guest', null); return res(cur); }
    var first = true;
    auth.onAuthStateChanged(async function (u) {
      cur = u ? await loadProfile(u) : LS.get('ml_guest', null);
      if (u) await migrateGuest();
      if (first) { first = false; res(cur); }
    });
  });
  return userP;
}
async function migrateGuest() {
  if (!LS.get('ml_migrate', 0)) return; LS.del('ml_migrate');
  var loc = LS.get('ml_attempts', []); if (!loc.length || !cur || cur.guest) return;
  try { for (var i = 0; i < loc.length; i++) await db.collection('users').doc(cur.uid).collection('attempts').add(loc[i]); LS.del('ml_attempts'); } catch (e) {}
}
var ML = window.ML = {
  
  root: ROOT, lessons: LESSONS, t: function (m) { return T[m === 'si' ? 'si' : 'en']; },
  user: getUser,
  current: function () { return cur; },
  signUp: async function (email, pw, prof) {
    if (!(await initFirebase())) throw new Error('Online sign-up is unavailable right now. You can continue as a guest.');
    LS.set('ml_migrate', 1);
    var c = await auth.createUserWithEmailAndPassword(email, pw);
    await c.user.updateProfile({ displayName: prof.name });
    await db.collection('users').doc(c.user.uid).set({ name: prof.name, grade: prof.grade, medium: prof.medium });
  },
  signIn: async function (email, pw) { if (!(await initFirebase())) throw new Error('Online sign-in is unavailable right now.'); await auth.signInWithEmailAndPassword(email, pw); },
  google: async function () { if (!(await initFirebase())) throw new Error('Google sign-in is unavailable right now.'); await LS.set('ml_migrate', 1); await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); },
  guest: function (prof) { LS.set('ml_guest', { name: prof.name || 'Guest', grade: prof.grade || 3, medium: prof.medium || 'en', guest: true }); },
  signOut: async function () { if (fb && auth) await auth.signOut(); LS.del('ml_guest'); location.href = ROOT + 'index.html'; },
  setProfile: async function (p) {
    if (cur && !cur.guest) { await db.collection('users').doc(cur.uid).set({ name: p.name, grade: p.grade, medium: p.medium }, { merge: true }); }
    else LS.set('ml_guest', Object.assign({ guest: true }, p));
  },
  saveAttempt: async function (a) {
    await getUser();
    if (cur && !cur.guest && fb) {
      try { await db.collection('users').doc(cur.uid).collection('attempts').add(a); return 'cloud'; }
      catch (e) { var q = LS.get('ml_pending_' + cur.uid, []); q.push(a); LS.set('ml_pending_' + cur.uid, q); return 'pending'; }
    }
    if (!cur) { cur = { name: 'Guest', grade: a.grade, medium: a.medium, guest: true }; LS.set('ml_guest', cur); }
    var l = LS.get('ml_attempts', []); l.push(a); return LS.set('ml_attempts', l) ? 'local' : 'none-saved';
  },
  attempts: async function () {
    await getUser();
    if (cur && !cur.guest && fb) {
      var col = db.collection('users').doc(cur.uid).collection('attempts'), pk = 'ml_pending_' + cur.uid, q = LS.get(pk, []), left = [];
      for (var i = 0; i < q.length; i++) { try { await col.add(q[i]); } catch (e) { left.push(q[i]); } }
      if (q.length) { left.length ? LS.set(pk, left) : LS.del(pk); }
      try { var s = await col.orderBy('ts', 'desc').limit(500).get(); return s.docs.map(function (d) { return d.data(); }).concat(left).sort(function (x, y) { return y.ts - x.ts; }); } catch (e) { return left; }
    }
    return LS.get('ml_attempts', []).sort(function (x, y) { return y.ts - x.ts; });
  },
  summarize: function (att) {
    var s = { n: att.length, xp: 0, avg: 0, best: {}, topics: {}, done: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, streak: 0, perfect: 0, days: {} }, sum = 0;
    att.forEach(function (a) {
      s.xp += a.score * 10 + (a.pct === 100 ? 20 : 0); sum += a.pct; if (a.pct === 100) s.perfect++;
      if (a.kind === 'lesson' && (!s.best[a.key] || a.pct > s.best[a.key].pct)) s.best[a.key] = a;
      var t = s.topics[a.topic] || (s.topics[a.topic] = { c: 0, t: 0 }); t.c += a.score; t.t += a.total; s.days[dayStr(a.ts)] = 1;
    });
    Object.keys(s.best).forEach(function (k) { if (s.best[k].pct >= 60) s.done[s.best[k].grade]++; });
    s.avg = att.length ? Math.round(sum / att.length) : 0; s.level = Math.floor(s.xp / 200) + 1; s.xpIn = s.xp % 200;
    var d = new Date(); if (!s.days[dayStr(d)]) d.setDate(d.getDate() - 1);
    while (s.days[dayStr(d)]) { s.streak++; d.setDate(d.getDate() - 1); }
    return s;
  }
};

/* ---------- question generators ---------- */
var NAMES = ['Nimal', 'Kamala', 'Saman', 'Nadeesha', 'Ruwan', 'Sithara', 'Dilini', 'Kasun'], ITEMS = ['mangoes', 'marbles', 'books', 'stickers', 'pencils', 'coconuts'];
function wr(n, k, lo) { var s = {}, c = 0, d = 1; while (c < k) { [n + d, n - d].forEach(function (x) { if (x >= lo && x !== n && c < k && !s[x]) { s[x] = 1; c++; } }); d++; } return Object.keys(s).map(Number); }
function mc(q, a, w, e) { var seen = {}, ws = w.map(String).filter(function (x) { if (x === String(a) || seen[x]) return false; return (seen[x] = 1); }); return { t: 'mcq', q: q, a: String(a), o: shuf([String(a)].concat(ws)), e: e || '' }; }
function inp(q, a, e) { return { t: 'inp', q: q, a: String(a), e: e || '' }; }
function lim(g, o) { return o.max || ({ 1: 9, 2: 100, 3: 100, 4: 1000, 5: 10000 }[g] || 100); }
function toRoman(n) { var m = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], r = ''; m.forEach(function (p) { while (n >= p[0]) { r += p[1]; n -= p[0]; } }); return r; }
var G = {};
G.count = function (g, o) { var m = Math.min(o.max || (g === 1 ? 9 : 20), 20), n = R(1, m), e = pick(['🍎', '⭐', '🐟', '🥭', '🌸', '🐞']);
  return mc('How many ' + e + ' are there?<div class="mlq-big">' + rep(e, n) + '</div>', n, wr(n, 3, 1), 'Count them one by one: ' + n + '.'); };
G.number = function (g, o) { var m = lim(g, o), t = R(0, m >= 100 ? 3 : 2), a = R(1, m), b = R(1, m);
  if (t === 0) { while (b === a && m > 1) b = R(1, m); var big = R(0, 1); return mc('Which number is ' + (big ? 'greater' : 'smaller') + '?', big ? Math.max(a, b) : Math.min(a, b), [big ? Math.min(a, b) : Math.max(a, b)], a + ' and ' + b + '.'); }
  if (t === 1) { var s = {}; while (Object.keys(s).length < 4) s[R(1, m)] = 1; var n = Object.keys(s).map(Number); return { t: 'ord', q: '', a: n.slice().sort(function (x, y) { return x - y; }).join(','), o: shuf(n), e: 'Smallest first.' }; }
  if (t === 2) { var after = R(0, 1); return inp('What number comes ' + (after ? 'just after ' : 'just before ') + (a + 1) + '?', after ? a + 2 : a, 'It is ' + (after ? (a + 2) : a) + '.'); }
  var N, p, ds, dg; do { N = R(100, m); ds = String(N); p = R(0, ds.length - 1); dg = +ds[ds.length - 1 - p]; } while (!dg); var v = dg * Math.pow(10, p);
  return mc('What is the value of the digit <b>' + dg + '</b> in <b>' + N + '</b>? (place #' + (p + 1) + ' from the right)', v, shuf([dg, dg * 10, dg * 100, dg * 1000].filter(function (x) { return x !== v; })).slice(0, 3), dg + ' in this place is worth ' + v + '.'); };
G.add = function (g, o) { var m = lim(g, o), a, b;
  if (o.noRegroup) { var a1 = R(0, 8), b1 = R(1, 9 - a1), a10 = R(1, 8), b10 = R(0, 9 - a10); a = a10 * 10 + a1; b = b10 * 10 + b1; }
  else { a = R(Math.max(1, Math.floor(m / 10)), Math.max(2, m - 1)); b = g <= 3 ? R(1, Math.max(1, m - a)) : R(Math.floor(m / 10), m - 1); }
  if (R(0, 2) === 0) { var nm = pick(NAMES), it = pick(ITEMS); return inp(nm + ' has ' + a + ' ' + it + '. He gets ' + b + ' more. How many ' + it + ' now?', a + b, a + ' + ' + b + ' = ' + (a + b)); }
  return inp(a + ' + ' + b + ' = ?', a + b, a + ' + ' + b + ' = ' + (a + b)); };
G.sub = function (g, o) { var m = lim(g, o), a, b;
  if (o.noRegroup) { var a1 = R(1, 9), b1 = R(0, a1), a10 = R(2, 9), b10 = R(0, a10 - 1); a = a10 * 10 + a1; b = b10 * 10 + b1; }
  else { a = R(Math.max(3, Math.floor(m / 4)), Math.max(4, m - 1)); b = R(1, a - 1); }
  if (R(0, 2) === 0) { var nm = pick(NAMES), it = pick(ITEMS); return inp(nm + ' had ' + a + ' ' + it + ' and gave away ' + b + '. How many are left?', a - b, a + ' − ' + b + ' = ' + (a - b)); }
  return inp(a + ' − ' + b + ' = ?', a - b, a + ' − ' + b + ' = ' + (a - b)); };
G.mul = function (g, o) { var x = g <= 3 ? pick([2, 3, 4, 5, 10]) : R(2, g === 4 ? 9 : 12), y = R(1, g <= 3 ? 10 : 12); if (g === 5 && R(0, 2) === 0) y = R(11, 40);
  if (R(0, 2) === 0) return inp('A box has ' + x + ' pencils. How many pencils are in ' + y + ' boxes?', x * y, y + ' × ' + x + ' = ' + (x * y));
  return inp(x + ' × ' + y + ' = ?', x * y, x + ' × ' + y + ' = ' + (x * y)); };
G.div = function (g, o) { var b = R(2, g <= 3 ? 5 : 9), q = R(1, g <= 3 ? 5 : g === 4 ? 10 : 20), a = b * q;
  if (R(0, 2) === 0) return inp(a + ' sweets are shared equally among ' + b + ' children. How many does each get?', q, a + ' ÷ ' + b + ' = ' + q);
  return inp(a + ' ÷ ' + b + ' = ?', q, a + ' ÷ ' + b + ' = ' + q); };
function four(a, pool, q, e) { var x = mc(q, a, pool, e); x.o = shuf([x.a].concat(x.o.filter(function (v) { return v !== x.a; }).slice(0, 3))); return x; }
G.frac = function (g, o) { var n = pick([2, 3, 4, 5, 6, 8]), k = R(1, n - 1), t = R(0, 3);
  if (t === 0) return four(k + '/' + n, [(n - k) + '/' + n, k + '/' + (n + 1), k + '/' + (n + 2), k + '/' + (n + 3)], 'What fraction of the squares is green?<div class="mlq-big">' + rep('🟩', k) + rep('⬜', n - k) + '</div>', k + ' out of ' + n + ' parts is green = ' + k + '/' + n + '.');
  if (t === 1) return four(n, [k, n + k, n + 1, n - 1, n + 2, n + 3].filter(function (x) { return x >= 1; }), 'In the fraction <b>' + k + '/' + n + '</b>, which number is the denominator?', 'The denominator is the bottom number: ' + n + '.');
  if (t === 2) { var a = R(1, n - 1), b = R(1, n - 1); while (b === a && n > 2) b = R(1, n - 1); if (a === b) return G.frac(g, o); return mc('Which fraction is greater?', Math.max(a, b) + '/' + n, [Math.min(a, b) + '/' + n], 'Same denominator: bigger numerator is bigger.'); }
  var h = 2 * R(2, 10); return inp('Half of ' + h + ' is ...?', h / 2, h + ' ÷ 2 = ' + h / 2); };
G.time = function (g, o) { var t = R(0, 3);
  if (t === 0) { var h = R(2, 6); return inp('How many minutes are in ' + h + ' hours?', h * 60, h + ' × 60 = ' + h * 60); }
  if (t === 1) { var r = pick([['How many days are in a week?', 7, [5, 6, 10]], ['How many months are in a year?', 12, [10, 11, 13]], ['How many hours are in a day?', 24, [12, 20, 60]], ['How many minutes are in an hour?', 60, [30, 100, 24]]]); return mc(r[0], r[1], r[2], 'Remember: ' + r[1] + '.'); }
  var hh = R(1, 10), add = pick([15, 30, 45]), mm = R(0, 1) * 30, tot = hh * 60 + mm + add, f = function (x) { x = x % 720; var H = Math.floor(x / 60) || 12, M = x % 60; return H + ':' + (M < 10 ? '0' : '') + M; };
  return mc('It is ' + f(hh * 60 + mm) + '. What time is it after ' + add + ' minutes?', f(tot), shuf([f(tot + 15), f(tot - 15), f(tot + 30)]), f(hh * 60 + mm) + ' + ' + add + ' min = ' + f(tot) + '.'); };
G.money = function (g, o) { var d = [1, 2, 5, 10, 20, 50, 100], t = R(0, 2);
  if (t === 0) { var a = pick(d), b = pick(d), c = pick(d); return inp('Rs. ' + a + ' + Rs. ' + b + ' + Rs. ' + c + ' = Rs. ?', a + b + c, 'Add them: ' + (a + b + c)); }
  if (t === 1) { var p = 5 * R(2, 18), pay = p < 50 ? 50 : 100; return inp('A toy costs Rs. ' + p + '. You pay Rs. ' + pay + '. How much change (Rs.) do you get?', pay - p, pay + ' − ' + p + ' = ' + (pay - p)); }
  var u = 5 * R(1, 6), n = R(2, 5); return inp(n + ' pens cost Rs. ' + u + ' each. Total cost (Rs.)?', u * n, n + ' × ' + u + ' = ' + u * n); };
G.shape = function (g, o) { var r = pick([['How many sides does a triangle have?', 3], ['How many sides does a square have?', 4], ['How many sides does a rectangle have?', 4], ['How many sides does a pentagon have?', 5], ['How many sides does a hexagon have?', 6],
  ['How many faces does a cube have?', 6], ['How many corners does a triangle have?', 3], ['How many corners does a square have?', 4]]); var w = wr(r[1], 3, 2); return mc(r[0], r[1], w, 'The answer is ' + r[1] + '.'); };
G.pattern = function (g, o) { var d = pick(g <= 3 ? [2, 5, 10] : [3, 4, 6, 7, 25]), s = R(0, 5) * d / d + R(1, 9), dn = R(0, 3) === 0; if (dn) s = d * R(6, 9) + R(0, 5); var seq = [0, 1, 2, 3, 4].map(function (i) { return dn ? s - i * d : s + i * d; });
  if (R(0, 1)) return inp('Find the next number: ' + seq.slice(0, 4).join(', ') + ', __', seq[4], 'The pattern ' + (dn ? 'decreases' : 'increases') + ' by ' + d + '.');
  var h = R(1, 3), ans = seq[h]; return inp('Find the missing number: ' + seq.map(function (x, i) { return i === h ? '__' : x; }).join(', '), ans, 'The pattern ' + (dn ? 'decreases' : 'increases') + ' by ' + d + '.'); };
G.measure = function (g, o) { var ti = o.title || '', t = /perimeter/.test(ti) ? 3 : /volume|capacity/.test(ti) ? 1 : /weight/.test(ti) ? 2 : pick([0, 0, 4]);
  if (t === 0) { var m = R(2, 9); return inp(m + ' m = ? cm', m * 100, '1 m = 100 cm'); }
  if (t === 1) { var l = R(2, 9); return inp(l + ' litres = ? ml', l * 1000, '1 l = 1000 ml'); }
  if (t === 2) { var k = R(2, 9); return inp(k + ' kg = ? g', k * 1000, '1 kg = 1000 g'); }
  if (t === 3) { var a = R(2, 12), b = R(2, 12); if (g <= 3) return inp('Perimeter of a square with side ' + a + ' cm (cm)?', a * 4, '4 × ' + a); return inp('Perimeter of a rectangle ' + a + ' cm × ' + b + ' cm (cm)?', 2 * (a + b), '2 × (' + a + ' + ' + b + ')'); }
  var km = R(2, 9); return inp(km + ' km = ? m', km * 1000, '1 km = 1000 m'); };
G.roman = function (g, o) { var n = R(1, g <= 4 ? 20 : 50);
  if (R(0, 1)) return mc('Write ' + n + ' in Roman numerals.', toRoman(n), shuf([toRoman(n + 1), toRoman(n + 5 > 50 ? n - 4 || 2 : n + 5), toRoman(n > 1 ? n - 1 : n + 2)]).filter(function (x) { return x !== toRoman(n); }).slice(0, 3), 'Answer: ' + toRoman(n));
  return inp(toRoman(n) + ' = ? (write the number)', n, toRoman(n) + ' = ' + n); };
G.dir = function (g, o) { var D = ['North', 'East', 'South', 'West'], f = R(0, 3), tr = pick([['right', 1], ['left', 3], ['around', 2]]), a = D[(f + tr[1]) % 4];
  return mc('You face <b>' + D[f] + '</b> and turn <b>' + tr[0] + '</b>. Which way do you face now?', a, D.filter(function (x) { return x !== a; }), 'Turning ' + tr[0] + ' from ' + D[f] + ' gives ' + a + '.'); };
G.data = function (g, o) { var F = shuf([['Apples', '🍎'], ['Mangoes', '🥭'], ['Bananas', '🍌'], ['Oranges', '🍊']]).slice(0, 3), c = F.map(function () { return R(2, 9); }), t = R(0, 2), mx = c.indexOf(Math.max.apply(0, c));
  if (c.filter(function (x) { return x === c[mx]; }).length > 1) return G.data(g, o);
  var tbl = '<div class="mlq-big" style="font-size:1.1rem;text-align:left">' + F.map(function (f, i) { return f[0] + ': ' + rep(f[1], c[i]); }).join('<br>') + '</div>';
  if (t === 0) return mc('Which fruit is the most?' + tbl, F[mx][0], F.filter(function (f, i) { return i !== mx; }).map(function (f) { return f[0]; }), 'The longest row.');
  if (t === 1) return inp('How many fruits in all?' + tbl, c[0] + c[1] + c[2], c.join(' + ') + ' = ' + (c[0] + c[1] + c[2]));
  return inp('How many more ' + F[mx][0].toLowerCase() + ' than ' + F[(mx + 1) % 3][0].toLowerCase() + '?' + tbl, c[mx] - c[(mx + 1) % 3], c[mx] + ' − ' + c[(mx + 1) % 3]); };
G.mixed = function (g, o) { var p = ['add', 'sub', 'number', 'pattern']; if (g >= 3) p = p.concat(['mul', 'div', 'money']); if (g >= 4) p = p.concat(['frac', 'measure']); return G[pick(p)](g, o); };
G.speed = function (g) { var m = g >= 4 ? 200 : 50, t = R(0, g >= 3 ? 2 : 1), a = R(2, m), b = R(2, g >= 3 ? 12 : 20);
  if (t === 0) return inp(a + ' + ' + b + ' = ?', a + b); if (t === 1) { if (b > a) { var x = a; a = b; b = x; } return inp(a + ' − ' + b + ' = ?', a - b); } var p = R(2, 12), q = R(2, 12); return inp(p + ' × ' + q + ' = ?', p * q); };
var RULES = [[/roman/, 'roman'], [/pattern/, 'pattern'], [/fraction/, 'frac'], [/multipl/, 'mul'], [/divis/, 'div'], [/addition|add/, 'add'], [/subtract/, 'sub'], [/time|clock/, 'time'], [/money/, 'money'],
  [/shape|solid/, 'shape'], [/direction/, 'dir'], [/graph|data/, 'data'], [/perimeter|length|distance|volume|capacity|weight|measur/, 'measure'], [/counting by|count/, 'count'], [/number|place/, 'number'], [/revision|problem/, 'mixed']];
function topicOf(title) { title = (title || '').toLowerCase(); for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(title)) return RULES[i][1]; return 'mixed'; }
function optsOf(title) { title = (title || '').toLowerCase(); var m = title.match(/(?:to|up to)\s+(\d+)/); return { max: m ? +m[1] : 0, noRegroup: /no regroup/.test(title), title: title }; }
ML._G = G; ML.topicOf = topicOf; ML.optsOf = optsOf; ML.topics = ['count', 'number', 'add', 'sub', 'mul', 'div', 'frac', 'time', 'money', 'shape', 'pattern', 'measure', 'roman', 'dir', 'data', 'mixed'];
ML.topicName = { speed: 'Speed Math', count: 'Counting', number: 'Numbers & place value', add: 'Addition', sub: 'Subtraction', mul: 'Multiplication', div: 'Division', frac: 'Fractions', time: 'Time', money: 'Money', shape: 'Shapes', pattern: 'Number patterns', measure: 'Measurement', roman: 'Roman numerals', dir: 'Directions', data: 'Data & graphs', mixed: 'Mixed practice' };

/* ---------- quiz UI ---------- */
var CSS = '.mlq-card{max-width:720px;margin:32px auto;background:#fff;border:2px solid #dbeafe;border-radius:16px;padding:24px;box-shadow:0 4px 14px rgba(0,0,0,.08);font-family:Roboto,"Segoe UI",sans-serif;color:#1e293b}' +
'.mlq-card h3{font-size:1.4rem;font-weight:700;color:#1e40af;margin-bottom:8px}.mlq-bar{height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin:8px 0 16px}.mlq-bar i{display:block;height:100%;background:#2563eb;transition:width .3s}' +
'.mlq-q{font-size:1.25rem;font-weight:600;margin:8px 0 16px;line-height:1.5}.mlq-big{font-size:2rem;margin:10px 0;line-height:1.4;word-break:break-all}.mlq-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}' +
'.mlq-btn{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:1.05rem;font-weight:600;cursor:pointer}.mlq-btn:hover{background:#1e40af}.mlq-btn.alt{background:#f1f5f9;color:#1e293b}' +
'.mlq-opt{background:#f8fafc;border:2px solid #cbd5e1;border-radius:10px;padding:14px;font-size:1.15rem;font-weight:600;cursor:pointer;color:#1e293b}.mlq-opt:hover{border-color:#2563eb;background:#eff6ff}' +
'.mlq-opt.good,.mlq-chip.good{background:#dcfce7;border-color:#16a34a}.mlq-opt.bad{background:#fee2e2;border-color:#dc2626}.mlq-opt[disabled]{cursor:default}' +
'.mlq-in{border:2px solid #cbd5e1;border-radius:10px;padding:12px;font-size:1.2rem;width:160px;margin-right:8px}.mlq-fb{margin-top:14px;font-weight:600;min-height:24px}.mlq-fb.ok{color:#16a34a}.mlq-fb.no{color:#dc2626}.mlq-fb small{display:block;color:#475569;font-weight:400}' +
'.mlq-chip{display:inline-block;margin:4px;padding:10px 16px;border:2px solid #cbd5e1;border-radius:10px;font-size:1.2rem;font-weight:700;cursor:pointer;background:#f8fafc}.mlq-chip.used{opacity:.35;pointer-events:none}' +
'.mlq-meta{display:flex;justify-content:space-between;font-size:.9rem;color:#64748b}.mlq-res{text-align:center}.mlq-score{font-size:3rem;font-weight:800;color:#1e40af}.mlq-stars{font-size:2.2rem;margin:6px 0}.mlq-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}' +
'.mlq-chipnav{display:inline-flex;align-items:center;gap:6px;background:#eff6ff;color:#1e40af;font-weight:600;padding:6px 12px;border-radius:99px;text-decoration:none;margin-left:12px;font-size:.95rem}';
function css() { if (document.getElementById('mlq-css')) return; var s = document.createElement('style'); s.id = 'mlq-css'; s.textContent = CSS; document.head.appendChild(s); }

ML.quiz = function (el, cfg) {
  css();
  var g = +cfg.grade || 3, topic = cfg.topic || 'mixed', o = cfg.opts || {}, L = T[cfg.medium === 'si' ? 'si' : 'en'], endless = !!cfg.seconds,
      n = cfg.n || (g <= 2 ? 5 : 8), i = 0, score = 0, asked = 0, t0 = Date.now(), seen = {}, q, done = false, locked = false, timer = null, left = cfg.seconds || 0;
  function next() { for (var k = 0; k < 25; k++) { var x = G[topic](g, o); if (!seen[x.q + x.a]) { seen[x.q + x.a] = 1; return x; } } return G[topic](g, o); }
  function norm(v) { return String(v).trim().toLowerCase().replace(/\s+/g, ''); }
  function head() { return '<div class="mlq-meta"><span>' + (endless ? '⏱ ' + left + 's' : L.q + ' ' + (i + 1) + '/' + n) + '</span><span>' + L.score + ': ' + score + '</span></div>' +
    '<div class="mlq-bar"><i style="width:' + (endless ? left / cfg.seconds * 100 : i / n * 100) + '%"></i></div>'; }
  function show() {
    q = next(); locked = false; var b = '';
    if (q.t === 'mcq') b = '<div class="mlq-opts">' + q.o.map(function (v) { return '<button class="mlq-opt" data-v="' + v + '">' + v + '</button>'; }).join('') + '</div>';
    else if (q.t === 'inp') b = '<input class="mlq-in" id="mlq-in" inputmode="numeric" autocomplete="off"><button class="mlq-btn" id="mlq-ck">' + L.check + '</button>';
    else b = '<p style="margin-bottom:8px">' + L.order + '</p><div id="mlq-pool">' + q.o.map(function (v) { return '<span class="mlq-chip" data-v="' + v + '">' + v + '</span>'; }).join('') + '</div><p>→ <b id="mlq-pick"></b></p><button class="mlq-btn alt" id="mlq-rs">' + L.reset + '</button>';
    el.innerHTML = head() + '<div class="mlq-q">' + q.q + '</div>' + b + '<div class="mlq-fb" id="mlq-fb"></div><div id="mlq-nx"></div>';
    if (q.t === 'mcq') el.querySelectorAll('.mlq-opt').forEach(function (bt) { bt.onclick = function () { grade(bt.dataset.v, bt); }; });
    if (q.t === 'inp') { var inE = el.querySelector('#mlq-in'); inE.focus(); el.querySelector('#mlq-ck').onclick = function () { if (inE.value.trim()) grade(inE.value); }; inE.onkeydown = function (e) { if (e.key === 'Enter' && inE.value.trim()) grade(inE.value); }; }
    if (q.t === 'ord') { var ch = []; el.querySelectorAll('.mlq-chip').forEach(function (c) { c.onclick = function () { if (locked) return; ch.push(c.dataset.v); c.classList.add('used'); el.querySelector('#mlq-pick').textContent = ch.join(', '); if (ch.length === q.o.length) grade(ch.join(',')); }; });
      el.querySelector('#mlq-rs').onclick = function () { if (locked) return; ch = []; el.querySelector('#mlq-pick').textContent = ''; el.querySelectorAll('.mlq-chip').forEach(function (c) { c.classList.remove('used'); }); }; }
  }
  function grade(v, btn) {
    if (locked || done) return; locked = true; asked++; var ok = norm(v) === norm(q.a), fb = el.querySelector('#mlq-fb'); if (ok) score++;
    el.querySelectorAll('.mlq-opt').forEach(function (b) { b.disabled = true; if (norm(b.dataset.v) === norm(q.a)) b.classList.add('good'); else if (b === btn) b.classList.add('bad'); });
    fb.className = 'mlq-fb ' + (ok ? 'ok' : 'no'); fb.innerHTML = (ok ? L.ok : L.no + ' ' + L.ans + ' <b>' + q.a.replace(/,/g, ', ') + '</b>') + (q.e ? '<small>' + q.e + '</small>' : '');
    if (endless) { setTimeout(function () { if (!done) { i++; show(); } }, ok ? 500 : 1400); return; }
    var nx = el.querySelector('#mlq-nx'); nx.innerHTML = '<button class="mlq-btn" style="margin-top:12px" id="mlq-n">' + (i + 1 >= n ? L.fin : L.next) + ' →</button>';
    var go = function () { i++; if (i >= n) finish(); else show(); }; el.querySelector('#mlq-n').onclick = go; el.querySelector('#mlq-n').focus();
  }
  async function finish() {
    if (done) return; done = true; clearInterval(timer); var total = endless ? asked : n, pct = total ? Math.round(score / total * 100) : 0, secs = Math.round((Date.now() - t0) / 1000);
    var u = await getUser(), a = { kind: cfg.kind || 'lesson', key: cfg.key || (cfg.kind || 'practice') + '-' + topic, topic: topic, grade: g, lesson: cfg.lesson || 0, medium: cfg.medium || 'en', score: score, total: total, pct: pct, secs: secs, ts: Date.now() };
    var stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0, where = total ? await ML.saveAttempt(a) : 'none';
    el.innerHTML = '<div class="mlq-res"><h3>' + (pct >= 70 ? '🎉 Great job!' : '💪 Keep practising!') + '</h3><div class="mlq-score">' + score + ' / ' + total + '</div><div class="mlq-stars">' + rep('⭐', stars) + rep('☆', 3 - stars) + '</div>' +
      '<p>' + pct + '% · ' + L.time + ': ' + secs + 's</p><p style="color:#64748b;font-size:.9rem;margin-top:6px">' + (where === 'cloud' ? L.saved : where === 'local' ? L.savedG : where === 'pending' ? 'Saved on this device — it will sync to your account when you are back online.' : where === 'none-saved' ? '⚠️ Could not save (browser storage is blocked). Sign in to keep your scores.' : '') + '</p>' +
      '<div class="mlq-row"><button class="mlq-btn" id="mlq-again">' + L.retry + '</button>' + (cfg.nextHref ? '<a class="mlq-btn alt" style="text-decoration:none" href="' + cfg.nextHref + '">' + L.nextL + ' →</a>' : '') +
      '<a class="mlq-btn alt" style="text-decoration:none" href="' + ROOT + 'dashboard.html">' + L.dash + '</a></div></div>';
    el.querySelector('#mlq-again').onclick = function () { ML.quiz(el, cfg); }; if (cfg.onDone) cfg.onDone(a);
  }
  if (endless) timer = setInterval(function () { left--; var m = el.querySelector('.mlq-meta span'); if (m) m.textContent = '⏱ ' + left + 's'; var bi = el.querySelector('.mlq-bar i'); if (bi) bi.style.width = (left / cfg.seconds * 100) + '%'; if (left <= 0) finish(); }, 1000);
  show();
};

/* ---------- auto-mount on lesson pages + nav chip ---------- */
function navChip() {
  var nav = document.getElementById('auth-buttons-container') || document.querySelector('header nav, nav'); if (!nav || document.getElementById('ml-chip')) return; css();
  getUser().then(function (u) { var a = document.createElement('a'); a.id = 'ml-chip'; a.className = 'mlq-chipnav'; a.href = ROOT + (u ? 'dashboard.html' : 'login.html'); a.textContent = u ? '👤 ' + u.name : '🔑 Login / Sign up'; nav.appendChild(a); });
}
function mountLesson() {
  var m = decodeURIComponent(location.pathname).match(/(English|Sinhala) Medium\/primary\/Grade(\d)\/grade\d+_lesson(\d+)\.html/i); if (!m) return;
  var medium = m[1].toLowerCase() === 'sinhala' ? 'si' : 'en', g = +m[2], l = +m[3], L = T[medium], h1 = document.querySelector('h1'), title = h1 ? h1.textContent : '';
  var host = document.getElementById('ml-quiz'); if (!host) { host = document.createElement('div'); host.id = 'ml-quiz'; var f = document.querySelector('footer'); f ? f.parentNode.insertBefore(host, f) : document.body.appendChild(host); }
  css(); host.className = 'mlq-card'; var key = 'g' + g + '-l' + l, topic = topicOf(title.replace(/^[^:]*:/, '')), o = optsOf(title);
  var nextHref = l < LESSONS[g] ? 'grade' + g + '_lesson' + (l + 1) + '.html' : 'grade' + g + '.html';
  function intro(att) { var mine = att.filter(function (a) { return a.key === key; }), best = mine.reduce(function (b, a) { return Math.max(b, a.pct); }, 0);
    host.innerHTML = '<h3>📝 ' + L.ready + '</h3><p style="margin-bottom:14px;color:#475569">' + ML.topicName[topic] + (mine.length ? ' · ' + L.best + ': <b>' + best + '%</b> (' + mine.length + ' ' + L.tries + ')' + (best >= 60 ? ' ✅' : '') : '') + '</p><button class="mlq-btn" id="mlq-go">' + L.start + '</button>';
    host.querySelector('#mlq-go').onclick = function () { ML.quiz(host, { grade: g, lesson: l, key: key, kind: 'lesson', topic: topic, opts: Object.assign({}, o, { title: title }), medium: medium, nextHref: nextHref, onDone: function () { } }); }; }
  ML.attempts().then(intro);
}
function init() { navChip(); mountLesson(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
