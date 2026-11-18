// Kejar Lapan: screens, the frame loop, the HUD, results and the leaderboard.
import { STEP, ROLES, BOOST, LANDMARKS } from './config.js';
import { createRun, step, nextCheckpoint, runSeconds } from './sim.js';
import { landmarkFor } from './course.js';
import { formatDistance, formatTime, formatClock, formatPoints } from './score.js';
import { initInput } from './input.js';
import { play, unlockAudio, setMuted } from './audio.js';
import { randomSeed } from '../../shared/rng.js';
import { initAppsWarga, appsWargaHaptic, appsWargaShare, closeMiniApp, notifyAppReady } from '../../shared/appswarga.js';
import { initFromArked, backToArked, shareUrl } from '../../shared/arked-link.js';
import { initProfile, loadProfile, withProfile } from '../../shared/profile.js';
import { gameKey, readShared, writeShared } from '../../shared/shared-store.js';
import * as lb from '../../shared/leaderboard.js';
import { hardReload } from '../../shared/reload.js';

const GAME_ID = 'kejar-lapan';
const K = { settings: 'kl.settings', stats: 'kl.stats', seenHelp: 'kl.seenHelp' };
const SCREENS = ['home', 'game', 'result', 'board'];
const OBSTACLE_NAME = { cone: 'kon', pothole: 'lubang jalan', monkey: 'monyet', barrier: 'palang', car: 'kereta', bus: 'bas kampus' };
const $ = (sel) => document.querySelector(sel);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};

const settings = () => ({ sound: true, pad: true, role: null, ...store.get(K.settings, {}) });
const saveSettings = (patch) => store.set(K.settings, { ...settings(), ...patch });
const stats = () => ({ played: 0, best: 0, bestDistance: 0, ...store.get(K.stats, {}) });

/** The character: the one picked on the home screen, else the profile's user type. */
function currentRole() {
  const picked = settings().role;
  if (ROLES[picked]) return picked;
  const type = loadProfile()?.userType;
  return ROLES[type] ? type : 'pelajar';
}

/** game: { run, phase: 'ready' | 'running' | 'paused' | 'over', acc, last, queue } */
let game = null;
let view = null;
let viewFailed = false;
let rafId = 0;
let lastResult = null;
let toastTimer = 0;
let hudToastTimer = 0;
let boardTab = 'daily';
const hudCache = {};
/** `?debug` only: a test player that drives the sim (see tests/bot.mjs), and window.__kl. */
const debug = new URLSearchParams(location.search).has('debug');
let debugBot = null;

// ---------- helpers ----------

function h(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/** Sets an element's text only when it changed (the HUD updates every frame). */
function setText(id, text) {
  if (hudCache[id] === text) return;
  hudCache[id] = text;
  document.getElementById(id).textContent = text;
}

function todayKL(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// ---------- routing ----------

function show(name) {
  for (const s of SCREENS) $(`#screen-${s}`).hidden = s !== name;
  document.body.dataset.screen = name;
}

function go(path, replace = false) {
  const target = `#/${path}`;
  if (location.hash === target) route();
  else if (replace) location.replace(target);
  else location.hash = target;
}

function route() {
  const path = location.hash.replace(/^#\/?/, '');
  if (path !== 'lari') stopGame();
  switch (path) {
    case 'lari':
      if (!loadProfile()) renderHome(); // behind the profile dialog
      return withProfile(startGame);
    case 'tamat':
      return lastResult ? renderResult() : go('', true);
    case 'papan':
      return openBoard();
    default:
      return renderHome();
  }
}

// ---------- home ----------

function renderRole() {
  const role = currentRole();
  for (const b of document.querySelectorAll('.role-chip')) b.setAttribute('aria-checked', String(b.dataset.role === role));
  const r = ROLES[role];
  $('#role-mission').textContent = r.mission;
  $('#role-items').textContent = `${r.items.points} +25 · ${r.items.boost} untuk pecut · ${r.items.shield} untuk kebal`;
}

function renderSettings() {
  const s = settings();
  $('#set-sound').setAttribute('aria-checked', String(s.sound));
  $('#set-sound-hint').textContent = s.sound ? 'Kesan bunyi semasa berlari' : 'Senyap';
  $('#set-pad').setAttribute('aria-checked', String(s.pad));
  $('#set-pad-hint').textContent = s.pad ? 'Butang arah di skrin' : 'Leret pada skrin sahaja';
  setMuted(!s.sound);
}

function renderHome() {
  show('home');
  renderRole();
  renderSettings();
  const st = stats();
  $('#st-distance').textContent = formatDistance(st.bestDistance);
  $('#st-best').textContent = formatPoints(st.best);
  $('#st-played').textContent = st.played;
}

// ---------- the run ----------

async function ensureView() {
  if (view || viewFailed) return view;
  try {
    // Banner text uses Lexend: wait for it (briefly) so signs aren't drawn in a fallback font.
    await Promise.race([document.fonts?.load("800 40px 'Lexend'"), new Promise((r) => setTimeout(r, 1500))]);
    const { createView } = await import('./render.js');
    view = createView($('#view'), { reducedMotion: () => reducedMotion.matches });
    new ResizeObserver(() => view.resize()).observe($('#stage'));
    view.resize();
  } catch (err) {
    console.error(err);
    viewFailed = true;
  }
  return view;
}

async function startGame() {
  stopGame();
  show('game');
  const s = settings();
  $('#screen-game').classList.toggle('no-pad', !s.pad);
  $('#screen-game').classList.remove('over');
  setMuted(!s.sound);
  if (!(await ensureView())) {
    toast('Peranti ini tidak menyokong grafik 3D (WebGL).');
    return go('', true);
  }
  if (document.body.dataset.screen !== 'game') return; // left while loading
  const role = currentRole();
  game = { run: createRun({ seed: randomSeed(), role }), phase: 'ready', acc: 0, last: 0, queue: [], stepT: 0 };
  view.reset();
  for (const k of Object.keys(hudCache)) delete hudCache[k];
  $('#hud-mission').textContent = `${ROLES[role].label} · Kejar 8:00`;
  hideHudToast();
  renderHud();
  overlay('Sedia?', ROLES[role].mission + '. Leret atau tekan butang untuk mula.', 'Mula', begin);
  view.draw(game.run, performance.now(), 0, false);
  // Tell Arked Warga this game was played (its continue card).
  writeShared(gameKey(GAME_ID), { ...readShared(gameKey(GAME_ID)), lastPlayedAt: Date.now(), daily: null });
}

function begin() {
  if (!game || game.phase === 'running' || game.phase === 'over') return;
  unlockAudio();
  game.phase = 'running';
  game.last = 0;
  overlay(null);
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

function pause() {
  if (game?.phase !== 'running') return;
  game.phase = 'paused';
  game.queue.length = 0;
  cancelAnimationFrame(rafId);
  overlay('Rehat', 'Jam kampus berhenti seketika.', 'Sambung', begin);
}

function stopGame() {
  cancelAnimationFrame(rafId);
  game = null;
  overlay(null);
}

function overlay(title, text, button, onClick) {
  const box = $('#overlay');
  box.hidden = !title;
  if (!title) return;
  $('#overlay-title').textContent = title;
  $('#overlay-text').textContent = text;
  const btn = $('#overlay-btn');
  btn.textContent = button;
  btn.onclick = onClick;
}

/** Fixed-step loop: the sim moves in 1/60 s steps whatever the frame rate; drawing follows. */
function frame(now) {
  if (!game || game.phase !== 'running') return;
  const g = game;
  const dt = g.last ? Math.min((now - g.last) / 1000, 0.25) : STEP;
  g.last = now;
  g.acc += dt;
  const events = [];
  while (g.acc >= STEP && g.run.status === 'running') {
    const actions = g.queue.splice(0);
    if (debugBot) actions.push(...debugBot(g.run));
    events.push(...step(g.run, actions));
    g.acc -= STEP;
  }
  handleEvents(events, dt);
  view.onEvents(g.run, events);
  view.draw(g.run, now, dt, true);
  renderHud();
  if (g.run.status !== 'running') return finish();
  rafId = requestAnimationFrame(frame);
}

function handleEvents(events, dt) {
  const run = game.run;
  for (const e of events) {
    switch (e.type) {
      case 'jump':
      case 'slide':
      case 'lane':
        play(e.type);
        break;
      case 'pickup': {
        const kind = e.item.kind;
        play(kind === 'points' ? 'points' : 'powerup');
        appsWargaHaptic('impact', 'light');
        const name = ROLES[run.role].items[kind];
        if (kind === 'boost') hudToast(name, 'PECUT!');
        else if (kind === 'shield') hudToast(name, 'KEBAL');
        else if (kind === 'time') hudToast('+5 saat', name);
        break;
      }
      case 'smash':
        play('smash');
        appsWargaHaptic('impact', 'medium');
        break;
      case 'shieldBreak':
        play('shieldBreak');
        appsWargaHaptic('impact', 'heavy');
        break;
      case 'checkpoint':
        play('checkpoint');
        appsWargaHaptic('notification', 'success');
        hudToast(`+${e.add} saat`, e.landmark.name);
        break;
      case 'crash':
        game.crashType = e.obstacle.type;
        play('crash');
        appsWargaHaptic('notification', 'error');
        break;
      case 'late':
        play('late');
        appsWargaHaptic('notification', 'warning');
        break;
    }
  }
  // Footsteps while running on the ground.
  if (!run.airborne && run.status === 'running') {
    game.stepT += dt * (run.speed / 12);
    if (game.stepT >= 0.55) {
      game.stepT = 0;
      play('step');
    }
  }
}

function hudToast(big, small) {
  const t = $('#hud-toast');
  t.replaceChildren(big, ...(small ? [h('small', null, small)] : []));
  t.classList.add('show');
  clearTimeout(hudToastTimer);
  hudToastTimer = setTimeout(hideHudToast, 1500);
}

function hideHudToast() {
  $('#hud-toast').classList.remove('show');
}

function renderHud() {
  const run = game.run;
  setText('hud-score', formatPoints(run.score));
  setText('hud-dist', formatDistance(run.distance));
  setText('hud-clock', formatClock(run.timeLeft));
  const level = run.timeLeft > 15 ? '' : run.timeLeft > 7 ? 'warn' : 'danger';
  if (hudCache.level !== level) {
    hudCache.level = level;
    $('#hud-clock-box').className = `hud-panel hud-clock ${level}`;
  }
  setText('hud-status', level === '' ? 'Masih sempat!' : level === 'warn' ? 'Pecut!' : 'Saat akhir!');
  const next = nextCheckpoint(run);
  setText('hud-next', `${next.landmark.short} · ${formatDistance(next.metres)} lagi`);
  if (hudCache.shield !== run.shield) {
    hudCache.shield = run.shield;
    $('#hud-shield').hidden = !run.shield;
  }
  const boosting = run.boostT > 0;
  if (hudCache.boost !== boosting) {
    hudCache.boost = boosting;
    $('#hud-boost').hidden = !boosting;
  }
  if (boosting) $('#hud-boost-fill').style.transform = `scaleX(${run.boostT / BOOST.time})`;
}

function finish() {
  const g = game;
  g.phase = 'over';
  const run = g.run;
  $('#screen-game').classList.add('over');
  const crash = run.status === 'crashed';
  const st = stats();
  const newBestDistance = run.distance > st.bestDistance && run.distance >= 50;
  st.played += 1;
  st.best = Math.max(st.best, run.score);
  st.bestDistance = Math.max(st.bestDistance, Math.floor(run.distance));
  store.set(K.stats, st);
  lastResult = {
    reason: crash ? 'crash' : 'late',
    obstacle: crash ? g.crashType : null,
    role: run.role,
    distance: Math.floor(run.distance),
    score: run.score,
    seconds: runSeconds(run),
    checkpoints: run.checkpoints,
    landmarks: Array.from({ length: run.checkpoints }, (_, k) => landmarkFor(k).short),
    newBestDistance,
    submit: { status: run.score > 0 ? 'pending' : 'skipped' },
  };
  if (lastResult.submit.status === 'pending') submitResult(lastResult);
  // Let the crash shake and particles play out over the frozen scene.
  const settle = (t0) => {
    const tick = (now) => {
      if (game !== g) return;
      const dt = Math.min((now - (g.last || now)) / 1000, 0.05);
      g.last = now;
      view.draw(run, now, dt, false);
      if (now - t0 < 1100) requestAnimationFrame(tick);
      else go('tamat', true);
    };
    requestAnimationFrame(tick);
  };
  settle(performance.now());
}

// ---------- result ----------

function renderResult() {
  const r = lastResult;
  show('result');
  const role = ROLES[r.role];
  if (r.reason === 'crash') {
    $('#res-badge').textContent = '💥';
    $('#res-title').textContent = 'Terlanggar!';
    $('#res-sub').textContent = `Terlanggar ${OBSTACLE_NAME[r.obstacle] ?? 'halangan'}. ${role.late}`;
  } else {
    $('#res-badge').textContent = '⏰';
    $('#res-title').textContent = 'Dah Pukul 8:00!';
    $('#res-sub').textContent = role.late;
  }
  $('#res-distance').textContent = formatDistance(r.distance);
  $('#res-record').hidden = !r.newBestDistance;
  $('#res-cps').textContent = String(r.checkpoints);
  $('#res-time').textContent = formatTime(r.seconds);
  $('#res-score').textContent = formatPoints(r.score);
  const names = [LANDMARKS[0].short, ...r.landmarks];
  $('#res-landmarks').replaceChildren(...[...new Set(names)].map((n) => h('span', null, n)));
  renderSubmit();
}

function renderSubmit() {
  if (document.body.dataset.screen !== 'result' || !lastResult) return;
  const r = lastResult;
  const box = $('#res-submit');
  box.replaceChildren();
  box.className = 'res-submit';
  const msg = (text, cls) => {
    box.append(h('span', null, text));
    if (cls) box.classList.add(cls);
  };
  switch (r.submit.status) {
    case 'skipped':
      return msg('Lari lebih jauh untuk direkodkan.');
    case 'offline':
      return msg('Papan markah belum dikonfigurasi.');
    case 'pending':
    case 'sending':
      return msg('Menghantar markah…', 'busy');
    case 'done':
      return msg('Markah direkodkan.', 'ok');
    case 'error': {
      msg(`Gagal menghantar: ${r.submit.msg}`, 'err');
      const retry = h('button', 'btn btn-link', 'Cuba semula');
      retry.type = 'button';
      retry.addEventListener('click', () => submitResult(r));
      box.append(retry);
    }
  }
}

async function submitResult(r) {
  const profile = loadProfile();
  if (!lb.boardsConfigured() || !profile) {
    r.submit = { status: 'offline' };
    return renderSubmit();
  }
  r.submit = { status: 'sending' };
  renderSubmit();
  try {
    await lb.recordRound({ game: GAME_ID, profile, points: r.score, seconds: r.seconds });
    r.submit = { status: 'done' };
  } catch (err) {
    r.submit = { status: 'error', msg: err.code === '54000' ? 'Terlalu cepat. Tunggu sebentar.' : err.message };
  }
  renderSubmit();
}

async function shareResult() {
  const r = lastResult;
  const text = `Kejar Lapan · ${formatDistance(r.distance)} · ${r.checkpoints} mercu tanda · ${formatPoints(r.score)} mata`;
  const url = shareUrl();
  const viaApp = await appsWargaShare({ text, url, title: 'Kejar Lapan' });
  if (viaApp) return;
  try {
    if (navigator.share) return await navigator.share({ text, url, title: 'Kejar Lapan' });
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Disalin ke papan klip');
  } catch {
    toast('Tidak dapat berkongsi');
  }
}

// ---------- leaderboard ----------

function openBoard() {
  show('board');
  setTab(boardTab);
}

function setTab(tab) {
  boardTab = tab;
  const buttons = [...document.querySelectorAll('.tabs [data-tab]')];
  buttons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('.tabs').style.setProperty('--tab-index', String(buttons.findIndex((b) => b.dataset.tab === tab)));
  loadTab(tab);
}

function boardMessage(text, retry) {
  const box = h('div', 'lb-empty');
  box.append(h('p', null, text));
  if (retry) {
    const b = h('button', 'btn btn-ghost', 'Cuba semula');
    b.type = 'button';
    b.addEventListener('click', retry);
    box.append(b);
  }
  $('#lb-body').replaceChildren(box);
}

async function loadTab(tab) {
  $('#board-sub').textContent =
    tab === 'daily' ? 'Jumlah markah hari ini' : tab === 'alltime' ? 'Jumlah markah & masa bermain' : 'Jumlah markah semua pemain kampus';
  if (!lb.boardsConfigured()) return boardMessage('Papan markah belum dikonfigurasi.');
  $('#lb-body').replaceChildren(h('div', 'lb-loading', 'Memuatkan…'));
  const profile = loadProfile();
  try {
    const rows =
      tab === 'campus'
        ? await lb.topCampuses(GAME_ID)
        : await lb.topPlayers(GAME_ID, profile?.playerId, tab === 'daily' ? todayKL() : null);
    if (boardTab !== tab) return;
    if (!rows?.length) {
      return boardMessage(tab === 'daily' ? 'Belum ada markah hari ini. Jadilah yang pertama!' : 'Belum ada markah.');
    }
    $('#lb-body').replaceChildren(
      tab === 'campus' ? lb.campusList(rows, profile?.campus) : lb.playersList(rows, { showPlays: tab === 'daily' }),
    );
  } catch (err) {
    if (boardTab === tab) boardMessage(`Gagal memuatkan: ${err.message}`, () => loadTab(tab));
  }
}

// ---------- wiring ----------

function init() {
  initFromArked();
  initAppsWarga();
  initProfile({ changed: () => document.body.dataset.screen === 'home' && renderRole() });

  $('#btn-help').addEventListener('click', () => $('#dlg-help').showModal());
  $('#help-close').addEventListener('click', () => $('#dlg-help').close());
  $('#btn-close-app').addEventListener('click', closeMiniApp);
  $('#btn-hub').addEventListener('click', backToArked);
  $('#btn-version').addEventListener('click', () => {
    $('#btn-version').disabled = true;
    toast('Memuat semula…');
    hardReload();
  });
  for (const b of document.querySelectorAll('.role-chip')) {
    b.addEventListener('click', () => {
      saveSettings({ role: b.dataset.role });
      renderRole();
      appsWargaHaptic('selection');
    });
  }
  $('#set-sound').addEventListener('click', () => {
    saveSettings({ sound: !settings().sound });
    renderSettings();
    appsWargaHaptic('selection');
  });
  $('#set-pad').addEventListener('click', () => {
    saveSettings({ pad: !settings().pad });
    renderSettings();
    appsWargaHaptic('selection');
  });
  $('#btn-play').addEventListener('click', () => {
    unlockAudio();
    go('lari');
  });
  $('#btn-board').addEventListener('click', () => go('papan'));

  $('#btn-pause').addEventListener('click', () => (game?.phase === 'running' ? pause() : begin()));
  $('#overlay-quit').addEventListener('click', () => go(''));
  initInput({
    area: $('#screen-game'),
    buttons: document.querySelectorAll('.pad-btn'),
    active: () => game && (game.phase === 'running' || game.phase === 'ready'),
    onAction: (action) => {
      if (game.phase === 'ready') begin();
      game.queue.push(action);
    },
    onPauseKey: () => (game?.phase === 'running' ? pause() : game?.phase === 'paused' ? begin() : null),
  });

  $('#res-again').addEventListener('click', () => go('lari', true));
  $('#res-share').addEventListener('click', shareResult);
  $('#res-board').addEventListener('click', () => {
    boardTab = 'daily';
    go('papan');
  });
  $('#res-home').addEventListener('click', () => go(''));

  $('#btn-board-back').addEventListener('click', () => go(''));
  $('#btn-board-refresh').addEventListener('click', () => loadTab(boardTab));
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.addEventListener('click', () => setTab(b.dataset.tab));

  // Pause when the player looks away: the page is hidden, or AppsWarga goes to the background.
  document.addEventListener('visibilitychange', () => document.hidden && pause());
  window.addEventListener('appswargaDeactivated', pause);
  window.addEventListener('blur', pause);

  window.addEventListener('hashchange', route);
  if (!store.get(K.seenHelp)) {
    store.set(K.seenHelp, true);
    $('#dlg-help').showModal();
  }
  route();
  requestAnimationFrame(() => notifyAppReady());
}

init();

if (debug) {
  window.__kl = {
    game: () => game,
    view: () => view,
    setBot: (fn) => (debugBot = fn),
  };
}
