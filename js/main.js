// App shell: hash router, screens, game session, profile and leaderboard wiring.
import { PHRASES, CATEGORIES } from './phrases.js';
import {
  createPuzzle,
  guess,
  moveCursor,
  selectCell,
  applyProgress,
  filledIndices,
  dailyIndex,
  MAX_MISTAKES,
} from './game.js';
import { mulberry32, hashString, randomSeed, todayKL } from './rng.js';
import { computeScore, formatTime } from './score.js';
import { BoardView } from './board.js';
import * as lb from './leaderboard.js';
import { USER_TYPES, CAMPUSES, userTypeLabel } from './profile-options.js';
import { store, uuid } from './storage.js';
import { initAppsWarga, appsWargaAllowedUserTypes } from './appswarga.js';

const $ = (sel) => document.querySelector(sel);
const K = { profile: 'tk.profile', daily: 'tk.daily', stats: 'tk.stats', seen: 'tk.freeSeen' };
const SCREENS = ['home', 'game', 'result', 'board'];

let session = null; // { mode, date, phrase, state, startedAt }
let lastResult = null;
let timerId = 0;
let afterProfile = null;
let appAllowedTypes = null; // user types the AppsWarga account may use (null = any)
let boardTab = 'daily';
let submitting = false;
let toastTimer = 0;

const view = new BoardView($('#board'), $('#keyboard'), {
  onLetter,
  onMove(dir) {
    if (!session) return;
    moveCursor(session.state, dir);
    view.update();
  },
  onSelect(idx) {
    if (session && selectCell(session.state, idx)) view.update();
  },
});

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

const loadProfile = () => store.get(K.profile);
const elapsedSeconds = () => Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
const modeLabel = (mode) => (mode === 'daily' ? 'Cabaran Harian' : 'Main Bebas');

function formatDateMs(dateKey) {
  return new Intl.DateTimeFormat('ms-MY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00Z`));
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
  if (path !== 'harian' && path !== 'bebas') leaveGame();
  switch (path) {
    case 'harian':
      return withProfile(startDaily);
    case 'bebas':
      return withProfile(startFree);
    case 'keputusan':
      return lastResult ? renderResult() : go('', true);
    case 'papan':
      return openBoard();
    default:
      return renderHome();
  }
}

function leaveGame() {
  stopTimer();
  session = null;
}

// ---------- profile ----------

function withProfile(fn) {
  if (loadProfile()) return fn();
  renderHome();
  afterProfile = fn;
  openProfile();
}

function openProfile() {
  const p = loadProfile();
  $('#dlg-profile').returnValue = '';
  $('#pf-name').value = p?.nickname ?? '';
  $('#pf-type').value = p?.userType ?? '';
  $('#pf-campus').value = p?.campus ?? '';
  $('#pf-error').textContent = '';
  applyUserTypeRules();
  $('#dlg-profile').showModal();
  if (!appAllowedTypes) syncUserTypeFromApp(); // retry, e.g. the first try was offline
}

/** The type to use when a saved one isn't allowed: the only choice, or Orang Awam for public accounts. */
const fallbackType = (allowed) => (allowed.includes('awam') ? 'awam' : allowed[0]);

/**
 * Inside AppsWarga, the signed-in account limits the user type: staff and testers are locked
 * to Staf, students to Pelajar, public accounts choose Alumni or Orang Awam. A saved profile
 * outside those choices is corrected. When AppsWarga can't say (outside the app, or no token
 * yet), the player picks any type as usual.
 */
async function syncUserTypeFromApp() {
  const allowed = await appsWargaAllowedUserTypes();
  if (!allowed) return;
  appAllowedTypes = allowed;
  const p = loadProfile();
  if (p && !allowed.includes(p.userType)) {
    store.set(K.profile, { ...p, userType: fallbackType(allowed) });
    renderProfileChip();
  }
  applyUserTypeRules();
}

function applyUserTypeRules() {
  const select = $('#pf-type');
  const allowed = appAllowedTypes;
  for (const opt of select.options) {
    if (!opt.value) continue; // the "Pilih kategori…" placeholder stays as it is
    const off = Boolean(allowed) && !allowed.includes(opt.value);
    opt.disabled = off;
    opt.hidden = off;
  }
  const locked = allowed?.length === 1;
  if (allowed && !allowed.includes(select.value)) select.value = locked ? allowed[0] : '';
  select.disabled = locked;
  select.parentElement.classList.toggle('locked', locked); // hides the arrow
  const hint = $('#pf-type-hint');
  hint.hidden = !allowed;
  hint.textContent = locked
    ? 'Ditetapkan oleh akaun AppsWarga anda.'
    : 'Akaun awam AppsWarga: pilih Alumni atau Orang Awam.';
}

function fillProfileOptions() {
  const type = $('#pf-type');
  type.append(new Option('Pilih kategori…', '', true, false));
  type.options[0].disabled = true;
  for (const t of USER_TYPES) type.append(new Option(t.label, t.value));

  const campus = $('#pf-campus');
  campus.append(new Option('Pilih kampus…', '', true, false));
  campus.options[0].disabled = true;
  for (const group of CAMPUSES) {
    const og = document.createElement('optgroup');
    og.label = group.state;
    for (const c of group.items) og.append(new Option(c, c));
    campus.append(og);
  }
}

function saveProfileFromForm(e) {
  e.preventDefault();
  const nickname = $('#pf-name').value.trim().replace(/\s+/g, ' ');
  const userType = $('#pf-type').value;
  const campus = $('#pf-campus').value;
  if (!nickname) return void ($('#pf-error').textContent = 'Sila masukkan nama panggilan.');
  if (!userType || (appAllowedTypes && !appAllowedTypes.includes(userType))) {
    return void ($('#pf-error').textContent = 'Sila pilih kategori.');
  }
  if (!campus) return void ($('#pf-error').textContent = 'Sila pilih kampus.');
  const prev = loadProfile();
  store.set(K.profile, { playerId: prev?.playerId ?? uuid(), nickname: nickname.slice(0, 20), userType, campus });
  $('#dlg-profile').close('saved');
  renderProfileChip();
  const next = afterProfile;
  afterProfile = null;
  if (next) next();
}

function onProfileClosed() {
  if ($('#dlg-profile').returnValue === 'saved') return;
  if (afterProfile) {
    afterProfile = null;
    go('', true);
  }
}

function renderProfileChip() {
  const p = loadProfile();
  $('#chip-avatar').textContent = p ? p.nickname.charAt(0).toUpperCase() : '?';
  $('#chip-name').textContent = p ? p.nickname : 'Tetapkan profil';
  $('#chip-meta').textContent = p ? `${userTypeLabel(p.userType)} · ${p.campus}` : 'Nama, kategori & kampus';
}

// ---------- home ----------

function loadDaily(date) {
  const d = store.get(K.daily);
  return d && d.date === date ? d : null;
}

function renderHome() {
  show('home');
  renderProfileChip();
  const date = todayKL();
  $('#daily-date').textContent = formatDateMs(date);
  const d = loadDaily(date);
  const status = $('#daily-status');
  const btn = $('#btn-daily');
  if (d?.status === 'done') {
    const r = d.result;
    status.textContent = r.won
      ? `Selesai dalam ${formatTime(r.seconds)} · ${r.score} mata${r.submit?.rank ? ` · #${r.submit.rank}` : ''}`
      : 'Tidak berjaya hari ini. Cuba lagi esok!';
    btn.textContent = 'Lihat Keputusan';
  } else if (d?.status === 'playing') {
    status.textContent = 'Permainan sedang berjalan. Masa masih dikira!';
    btn.textContent = 'Sambung';
  } else {
    status.textContent = 'Satu frasa yang sama untuk semua pemain hari ini.';
    btn.textContent = 'Main';
  }
  const st = store.get(K.stats, { played: 0, won: 0, best: 0 });
  $('#st-played').textContent = st.played;
  $('#st-won').textContent = st.won;
  $('#st-best').textContent = st.best;
}

// ---------- game ----------

function startDaily() {
  const date = todayKL();
  const phrase = PHRASES[dailyIndex(date, PHRASES.length)];
  const saved = loadDaily(date);
  if (saved?.status === 'done') {
    lastResult = saved.result;
    return go('keputusan', true);
  }
  const state = createPuzzle(phrase.text, mulberry32(hashString(`cipher:${date}`)));
  let startedAt = Date.now();
  if (saved?.status === 'playing' && saved.phraseId === phrase.id) {
    applyProgress(state, saved.filled, saved.mistakes);
    startedAt = saved.startedAt;
  }
  session = { mode: 'daily', date, phrase, state, startedAt };
  beginSession();
  if (state.status !== 'playing') return finish();
  persistDaily();
}

function pickFreePhrase() {
  let seen = store.get(K.seen, []);
  let pool = PHRASES.filter((p) => !seen.includes(p.id));
  if (!pool.length) {
    seen = [];
    pool = PHRASES;
  }
  const phrase = pool[Math.floor(Math.random() * pool.length)];
  store.set(K.seen, [...seen, phrase.id]);
  return phrase;
}

function startFree() {
  const phrase = pickFreePhrase();
  const state = createPuzzle(phrase.text, mulberry32(randomSeed()));
  session = { mode: 'free', date: todayKL(), phrase, state, startedAt: Date.now() };
  beginSession();
}

function beginSession() {
  show('game');
  $('#game-mode').textContent = modeLabel(session.mode);
  $('#game-cat').textContent = `Kategori: ${CATEGORIES[session.phrase.cat] ?? ''}`;
  view.mount(session.state);
  renderDots();
  startTimer();
}

function persistDaily() {
  if (session?.mode !== 'daily') return;
  store.set(K.daily, {
    date: session.date,
    phraseId: session.phrase.id,
    status: 'playing',
    startedAt: session.startedAt,
    filled: filledIndices(session.state),
    mistakes: session.state.mistakes,
  });
}

function startTimer() {
  stopTimer();
  const tick = () => {
    if (session) $('#timer').textContent = formatTime(elapsedSeconds());
  };
  tick();
  timerId = setInterval(tick, 500);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = 0;
}

function renderDots() {
  const m = session.state.mistakes;
  [...$('#dots').children].forEach((dot, i) => dot.classList.toggle('used', i < m));
  $('#mistakes').setAttribute('aria-label', `Kesilapan ${m} daripada ${MAX_MISTAKES}`);
}

function onLetter(letter) {
  if (!session || session.state.status !== 'playing' || session.finishing) return;
  const { state } = session;
  const idx = state.cursor;
  if (idx < 0) return;
  const r = guess(state, idx, letter);
  if (r.result === 'ignored') return;

  if (r.result === 'wrong') {
    view.flashWrong(idx, letter);
    renderDots();
    $('#mistakes').classList.remove('bump');
    void $('#mistakes').offsetWidth;
    $('#mistakes').classList.add('bump');
    navigator.vibrate?.(70);
  } else {
    view.update();
    view.pop(idx);
    if (r.completed) view.glowLetter(letter);
  }
  persistDaily();
  if (state.status !== 'playing') finish();
}

async function finish() {
  stopTimer();
  const s = session;
  s.finishing = true;
  const { state, phrase, mode, date } = s;
  const won = state.status === 'won';
  const seconds = elapsedSeconds();
  const result = {
    mode,
    date,
    phraseId: phrase.id,
    text: state.text,
    fact: phrase.fact,
    cat: phrase.cat,
    won,
    seconds,
    mistakes: state.mistakes,
    hidden: state.hiddenCount,
    score: won ? computeScore(state.hiddenCount, seconds, state.mistakes) : 0,
    submit: { status: won ? 'pending' : 'skipped' },
  };
  lastResult = result;
  saveResult(result);
  recordStats(result);
  // The answer stays secret on a loss, so let that phrase come up again in free play.
  if (!won && mode === 'free') store.set(K.seen, store.get(K.seen, []).filter((id) => id !== phrase.id));
  $('#timer').textContent = formatTime(seconds);
  if (won) submitResult(result); // runs during the animation; renders when the result screen is up

  if (won) await view.celebrate();
  else await view.fail();
  // Player may have navigated away during the animation.
  if (session === s) go('keputusan', true);
}

function saveResult(result) {
  if (result.mode !== 'daily') return;
  store.set(K.daily, { date: result.date, phraseId: result.phraseId, status: 'done', result });
}

function recordStats(r) {
  const st = store.get(K.stats, { played: 0, won: 0, best: 0 });
  st.played += 1;
  if (r.won) st.won += 1;
  st.best = Math.max(st.best, r.score);
  store.set(K.stats, st);
}

// ---------- result ----------

function renderResult() {
  const r = lastResult;
  show('result');
  $('#screen-result').classList.toggle('lost', !r.won);
  $('#res-badge').textContent = r.won ? '🎉' : '💔';
  $('#res-title').textContent = r.won ? 'Tahniah!' : 'Cuba Lagi';
  $('#res-mode').textContent =
    r.mode === 'daily' ? `Cabaran Harian · ${formatDateMs(r.date)}` : 'Main Bebas';
  // A lost round keeps the answer secret; the fact is hidden too since it can give the phrase away.
  $('#res-phrase').textContent = r.won ? r.text : 'Jawapan dirahsiakan';
  $('#res-fact').textContent = r.won ? r.fact : 'Cuba frasa lain dan pecahkan kodnya!';
  $('#res-time').textContent = formatTime(r.seconds);
  $('#res-mistakes').textContent = `${r.mistakes} / ${MAX_MISTAKES}`;
  $('#res-score').textContent = String(r.score);
  $('#res-again').textContent = r.mode === 'daily' ? 'Main Bebas' : 'Frasa Seterusnya';
  renderSubmit();
  if (r.won && (r.submit.status === 'pending' || r.submit.status === 'sending') && !submitting) {
    submitResult(r);
  }
}

function renderSubmit() {
  const r = lastResult;
  const box = $('#res-submit');
  box.replaceChildren();
  box.className = 'res-submit';
  const s = r.submit;
  const msg = (text, cls) => {
    box.append(h('span', null, text));
    if (cls) box.classList.add(cls);
  };
  switch (s.status) {
    case 'skipped':
      return msg(r.mode === 'daily' ? 'Cabaran baharu esok. Jumpa lagi!' : 'Markah tidak direkodkan.');
    case 'offline':
      return msg('Papan markah belum dikonfigurasi. Markah disimpan dalam peranti ini sahaja.');
    case 'pending':
    case 'sending':
      return msg('Menghantar markah…', 'busy');
    case 'done':
      return msg(
        s.rank
          ? `Kedudukan #${s.rank} ${r.mode === 'daily' ? 'hari ini' : 'keseluruhan'}`
          : 'Markah direkodkan.',
        'ok',
      );
    case 'dup':
      return msg('Markah Cabaran Harian anda sudah direkodkan hari ini.', 'ok');
    case 'error': {
      msg(`Gagal menghantar: ${s.msg}`, 'err');
      const retry = h('button', 'btn btn-link', 'Cuba semula');
      retry.type = 'button';
      retry.addEventListener('click', () => {
        r.submit = { status: 'pending' };
        submitResult(r);
      });
      box.append(retry);
    }
  }
}

async function submitResult(r) {
  if (!r.won || submitting) return;
  if (!lb.isConfigured()) {
    r.submit = { status: 'offline' };
    saveResult(r);
    if (lastResult === r) renderSubmit();
    return;
  }
  const p = loadProfile();
  if (!p) return;
  submitting = true;
  r.submit = { status: 'sending' };
  if (lastResult === r) renderSubmit();
  try {
    const row = await lb.submitScore({ ...p, ...r, date: r.date });
    r.submit = { status: 'done', rank: row?.rank ?? null };
    if (typeof row?.score === 'number') r.score = row.score;
    const st = store.get(K.stats, { played: 0, won: 0, best: 0 });
    st.best = Math.max(st.best, r.score);
    store.set(K.stats, st);
  } catch (err) {
    r.submit = err.code === '23505' ? { status: 'dup' } : { status: 'error', msg: err.message };
  } finally {
    submitting = false;
  }
  saveResult(r);
  if (lastResult === r && document.body.dataset.screen === 'result') {
    $('#res-score').textContent = String(r.score);
    renderSubmit();
  }
}

async function shareResult() {
  const r = lastResult;
  const dots = '🟥'.repeat(r.mistakes) + '🟩'.repeat(MAX_MISTAKES - r.mistakes);
  const head = r.mode === 'daily' ? `Teka Kata UiTM · Cabaran Harian ${r.date}` : 'Teka Kata UiTM · Main Bebas';
  const body = r.won
    ? `✅ ${formatTime(r.seconds)} · ${r.mistakes} kesilapan · ${r.score} mata`
    : '❌ Tidak berjaya kali ini';
  const url = location.href.split('#')[0];
  const text = `${head}\n${body}\n${dots}\n${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast('Keputusan disalin!');
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Tidak dapat berkongsi.');
  }
}

// ---------- leaderboard ----------

function openBoard() {
  show('board');
  setTab(boardTab);
}

function setTab(tab) {
  boardTab = tab;
  for (const b of document.querySelectorAll('.tabs [data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  }
  loadTab(tab);
}

function boardMessage(text, retry) {
  const body = $('#lb-body');
  const box = h('div', 'lb-empty');
  box.append(h('p', null, text));
  if (retry) {
    const b = h('button', 'btn btn-ghost', 'Cuba semula');
    b.type = 'button';
    b.addEventListener('click', retry);
    box.append(b);
  }
  body.replaceChildren(box);
}

async function loadTab(tab) {
  const date = todayKL();
  $('#board-sub').textContent =
    tab === 'daily' ? formatDateMs(date) : tab === 'alltime' ? 'Markah terbaik setiap pemain' : 'Jumlah markah terbaik pemain';
  if (!lb.isConfigured()) {
    boardMessage('Papan markah belum dikonfigurasi. Lihat README untuk menyambung Supabase.');
    return;
  }
  const body = $('#lb-body');
  body.replaceChildren(h('div', 'lb-loading', 'Memuatkan…'));
  const playerId = loadProfile()?.playerId;
  try {
    const rows =
      tab === 'daily'
        ? await lb.topDaily(date, playerId)
        : tab === 'alltime'
          ? await lb.topAllTime(playerId)
          : await lb.campusRanking();
    if (boardTab !== tab) return; // user switched tabs meanwhile
    if (!rows?.length) {
      boardMessage(tab === 'daily' ? 'Belum ada markah hari ini. Jadilah yang pertama!' : 'Belum ada markah.');
      return;
    }
    body.replaceChildren(tab === 'campus' ? campusList(rows) : playerList(rows));
  } catch (err) {
    if (boardTab === tab) boardMessage(`Gagal memuatkan: ${err.message}`, () => loadTab(tab));
  }
}

function rankCell(rank) {
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[rank];
  return h('span', `lb-rank${medal ? ' medal' : ''}`, medal ?? String(rank));
}

function playerList(rows) {
  const ol = h('ol', 'lb-list');
  for (const r of rows) {
    const li = h('li', `lb-row${r.is_me ? ' me' : ''}`);
    const who = h('div', 'lb-who');
    const name = h('div', 'lb-name');
    name.append(h('span', null, r.nickname), h('span', `badge badge-${r.user_type}`, userTypeLabel(r.user_type)));
    who.append(name, h('div', 'lb-meta', `${r.campus} · ${formatTime(r.seconds)}`));
    li.append(rankCell(Number(r.rank)), who, h('span', 'lb-score', String(r.score)));
    ol.append(li);
  }
  return ol;
}

function campusList(rows) {
  const myCampus = loadProfile()?.campus;
  const ol = h('ol', 'lb-list');
  for (const r of rows) {
    const li = h('li', `lb-row${r.campus === myCampus ? ' me' : ''}`);
    const who = h('div', 'lb-who');
    who.append(h('div', 'lb-name', r.campus), h('div', 'lb-meta', `${r.players} pemain · terbaik ${r.best_score}`));
    li.append(rankCell(Number(r.rank)), who, h('span', 'lb-score', String(r.total_score)));
    ol.append(li);
  }
  return ol;
}

// ---------- wiring ----------

function init() {
  initAppsWarga();
  syncUserTypeFromApp();
  fillProfileOptions();

  $('#profile-chip').addEventListener('click', () => {
    afterProfile = null;
    openProfile();
  });
  $('#profile-form').addEventListener('submit', saveProfileFromForm);
  $('#pf-cancel').addEventListener('click', () => $('#dlg-profile').close('cancel'));
  $('#dlg-profile').addEventListener('close', onProfileClosed);

  $('#btn-help').addEventListener('click', () => $('#dlg-help').showModal());
  $('#help-close').addEventListener('click', () => $('#dlg-help').close());

  $('#btn-daily').addEventListener('click', () => go('harian'));
  $('#btn-free').addEventListener('click', () => go('bebas'));
  $('#btn-board').addEventListener('click', () => go('papan'));
  $('#btn-quit').addEventListener('click', () => go(''));

  $('#res-again').addEventListener('click', () => go('bebas', true));
  $('#res-share').addEventListener('click', shareResult);
  $('#res-board').addEventListener('click', () => {
    boardTab = lastResult?.mode === 'daily' ? 'daily' : 'alltime';
    go('papan');
  });
  $('#res-home').addEventListener('click', () => go(''));

  $('#btn-board-back').addEventListener('click', () => go(''));
  $('#btn-board-refresh').addEventListener('click', () => loadTab(boardTab));
  for (const b of document.querySelectorAll('.tabs [data-tab]')) {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  }

  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.screen !== 'game' || !session) return;
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (/^[a-z]$/i.test(e.key)) {
      e.preventDefault();
      onLetter(e.key.toUpperCase());
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveCursor(session.state, 1);
      view.update();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveCursor(session.state, -1);
      view.update();
    }
  });

  window.addEventListener('hashchange', route);

  // First visit: show how to play once.
  if (!store.get('tk.seenHelp')) {
    store.set('tk.seenHelp', true);
    $('#dlg-help').showModal();
  }
  route();
}

init();
