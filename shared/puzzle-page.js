import { Game2048, BlockGame, MemoryGame } from './puzzle-engines.js';
import { initAppsWarga, appsWargaHaptic, closeMiniApp, notifyAppReady } from './appswarga.js';
import { initFromArked, backToArked } from './arked-link.js';
import { initProfile, loadProfile, withProfile } from './profile.js';
import { gameKey, readShared, writeShared } from './shared-store.js';
import { todayKL } from './rng.js';
import * as lb from './leaderboard.js';
import { hardReload } from './reload.js';

const $ = (selector) => document.querySelector(selector);
const gameId = location.pathname.split('/').filter(Boolean).at(-1);
const games = {
  '2048': { name: '2048', icon: '2048', description: 'Gabungkan nombor hingga mencapai 2048.', help: 'Leret papan, gunakan kekunci anak panah, atau butang arah. Dua nombor yang sama bergabung. Capai 2048 dan teruskan jika mahu.', create: seed => new Game2048(seed) },
  'blok': { name: 'Teka Blok', icon: '▦', description: 'Susun kepingan dan lengkapkan baris atau lajur.', help: 'Pilih satu kepingan, kemudian ketik petak pada papan untuk meletakkannya. Lengkapkan baris atau lajur untuk markah tambahan. Permainan tamat apabila tiada kepingan yang boleh diletakkan.', create: seed => new BlockGame(seed) },
  'memori': { name: 'Memori', icon: '✦', description: 'Cari pasangan kad sebelum masa tamat.', help: 'Buka dua kad untuk mencari pasangan. Selesaikan semua pasangan untuk naik ke tahap seterusnya. Masa yang tersedia berubah mengikut tahap.', create: seed => new MemoryGame(seed) },
};
const config = games[gameId];
if (!config) throw new Error(`Unknown game: ${gameId}`);

let game = null, playedMs = 0, lastTick = 0, lastResult = null, boardTab = 'daily';
let selectedPiece = 0, settleTimer = 0, timer = 0, boardRequest = 0;
const statsKey = `${gameId}.stats`;
const progressKey = gameKey(gameId);
const screens = ['home', 'game', 'result', 'board'];
const symbols = ['◆', '●', '▲', '■', '✚', '✦', '☀', '☾', '♣', '♥', '♠', '⬟'];
const number = value => Number(value).toLocaleString('ms-MY');

function storeGet(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function storeSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* unavailable */ } }
function h(tag, className, content) { const node = document.createElement(tag); if (className) node.className = className; if (content !== undefined) node.textContent = content; return node; }
function show(name) { for (const screen of screens) $(`#screen-${screen}`).hidden = screen !== name; document.body.dataset.screen = name; }
function go(name) { const hash = `#/${name}`; if (location.hash === hash) route(); else location.hash = hash; }
function stats() { return storeGet(statsKey, { played: 0, best: 0 }); }
function renderHome() { show('home'); const s = stats(); $('#st-best').textContent = number(s.best); $('#st-played').textContent = s.played; }
function route() {
  const name = location.hash.replace(/^#\/?/, '');
  if (name === 'main') return game ? show('game') : withProfile(startGame);
  if (document.body.dataset.screen === 'game' && game && !game.over) stopClock();
  if (name === 'tamat' && lastResult) return renderResult();
  if (name === 'papan') return openBoard();
  game = null; renderHome();
}
function activeClock() { return document.body.dataset.screen === 'game' && !document.hidden && game && !game.over && !(gameId === '2048' && game.won && !game.continued); }
function stopClock() { if (lastTick) { playedMs += Math.max(0, performance.now() - lastTick); lastTick = 0; } }
function updateClock() {
  if (!activeClock()) { stopClock(); return; }
  const now = performance.now();
  if (lastTick) { const delta = Math.max(0, now - lastTick); playedMs += delta; if (gameId === 'memori') { game.timeLeft = Math.max(0, game.timeLeft - delta); if (game.timeLeft === 0) { finish('timeout'); return; } } }
  lastTick = now;
  if (gameId === 'memori') { $('#game-status').textContent = `Tahap ${game.level} · Pasangan ${game.pairs}/${game.deck.length / 2} · Masa ${Math.ceil(game.timeLeft / 1000)}s`; }
}
function startGame() {
  clearTimeout(settleTimer); stopClock();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  game = config.create(seed); playedMs = 0; lastTick = performance.now(); selectedPiece = 0;
  const previous = readShared(progressKey);
  writeShared(progressKey, { ...previous, lastPlayedAt: Date.now() });
  show('game'); renderGame();
}
function renderGame() {
  if (!game) return;
  $('#game-score').textContent = number(game.score);
  $('#game-mode').textContent = config.name;
  const controls = $('#game-controls'), grid = $('#game-grid');
  controls.replaceChildren(); grid.replaceChildren();
  grid.className = 'puzzle-grid';
  if (gameId === '2048') render2048(grid, controls);
  if (gameId === 'blok') renderBlock(grid, controls);
  if (gameId === 'memori') renderMemory(grid);
}
function render2048(grid, controls) {
  grid.classList.add('four'); grid.setAttribute('aria-label', 'Papan 2048');
  game.board.forEach((value, i) => { const cell = h('div', 'puzzle-cell', value || ''); cell.dataset.value = value; cell.setAttribute('role', 'img'); cell.setAttribute('aria-label', `Baris ${Math.floor(i / 4) + 1}, lajur ${i % 4 + 1}: ${value || 'kosong'}`); grid.append(cell); });
  const pad = h('div', 'puzzle-pad'); const row = h('div');
  const button = (text, dir, parent) => { const b = h('button', 'btn btn-ghost', text); b.type = 'button'; b.setAttribute('aria-label', { up: 'Atas', down: 'Bawah', left: 'Kiri', right: 'Kanan' }[dir]); b.addEventListener('click', () => move2048(dir)); parent.append(b); };
  button('↑', 'up', pad); button('←', 'left', row); button('↓', 'down', row); button('→', 'right', row); pad.append(row); controls.append(pad);
  $('#game-status').textContent = game.won && !game.continued ? '2048! Anda boleh tamat atau terus bermain.' : `Gerakan: ${game.moves}`;
  if (game.won && !game.continued) { const keep = h('button', 'btn btn-gold', 'Terus bermain'); keep.addEventListener('click', () => { game.continued = true; lastTick = performance.now(); renderGame(); }); controls.append(keep); stopClock(); }
}
function move2048(direction) {
  if (gameId !== '2048' || document.body.dataset.screen !== 'game' || !game?.move(direction)) return;
  appsWargaHaptic('selection'); renderGame(); if (game.over) finish('full');
}
function renderBlock(grid, controls) {
  grid.classList.add('eight'); grid.setAttribute('aria-label', 'Papan teka blok');
  game.board.forEach((value, i) => { const cell = h('button', `puzzle-cell${value ? ' filled' : ''}`); cell.type = 'button'; cell.setAttribute('aria-label', `Baris ${Math.floor(i / 8) + 1}, lajur ${i % 8 + 1}${value ? ', berisi' : ', kosong'}`); cell.addEventListener('click', () => { if (game.place(selectedPiece, Math.floor(i / 8), i % 8)) { selectedPiece = Math.max(0, game.tray.findIndex(Boolean)); appsWargaHaptic('selection'); renderGame(); if (game.over) finish('full'); } }); grid.append(cell); });
  const tray = h('div', 'puzzle-tray'); tray.setAttribute('aria-label', 'Kepingan');
  game.tray.forEach((shape, i) => { const b = h('button', 'btn btn-ghost puzzle-piece'); b.type = 'button'; b.disabled = !shape; b.setAttribute('aria-label', `Kepingan ${i + 1}${shape ? '' : ', digunakan'}`); b.setAttribute('aria-pressed', String(selectedPiece === i)); if (shape) { const mini = h('span', 'piece-mini'); shape.forEach(([x, y]) => { const pixel = h('i'); pixel.style.left = `${x * 15}px`; pixel.style.top = `${y * 15}px`; mini.append(pixel); }); b.append(mini); } else b.textContent = '✓'; b.addEventListener('click', () => { selectedPiece = i; renderGame(); }); tray.append(b); });
  controls.append(tray); $('#game-status').textContent = `Garisan: ${game.lines} · Pilih kepingan, kemudian petak`;
}
function renderMemory(grid) {
  grid.classList.add('memory'); if (game.deck.length > 16) grid.classList.add('wide'); grid.setAttribute('aria-label', 'Kad memori');
  game.deck.forEach((value, i) => { const shown = game.matched[i] || game.revealed.includes(i); const b = h('button', `puzzle-cell${game.matched[i] ? ' matched' : ''}`, shown ? symbols[value] : '?'); b.type = 'button'; b.disabled = shown || game.revealed.length === 2; b.setAttribute('aria-label', `Kad ${i + 1}: ${shown ? symbols[value] : 'tertutup'}`); b.addEventListener('click', () => { if (!game.flip(i)) return; appsWargaHaptic('selection'); clearTimeout(settleTimer); if (game.revealed.length === 2) settleTimer = setTimeout(() => { if (game && document.body.dataset.screen === 'game') { game.settle(); renderGame(); } }, 850); renderGame(); }); grid.append(b); });
  $('#game-status').textContent = `Tahap ${game.level} · Pasangan ${game.pairs}/${game.deck.length / 2} · Masa ${Math.ceil(game.timeLeft / 1000)}s`;
}
function finish(reason = 'manual') {
  if (!game || lastResult?.game === game) return;
  stopClock(); clearTimeout(settleTimer);
  game.over = true;
  const seconds = Math.min(86400, Math.max(1, Math.round(playedMs / 1000)));
  const result = { game, score: game.score, seconds, reason, detail: gameId === 'memori' ? `Tahap ${game.highestCompleted} selesai` : gameId === 'blok' ? `${game.lines} garisan` : gameId === '2048' ? `${game.moves} gerakan` : 'Pusingan ditamatkan', submit: { status: 'pending' } };
  lastResult = result;
  const s = stats(); s.played++; s.best = Math.max(s.best, result.score); storeSet(statsKey, s);
  appsWargaHaptic('notification', result.score > 0 ? 'success' : 'warning');
  submitResult(result); go('tamat');
}
function renderResult() {
  const r = lastResult; show('result'); $('#res-icon').textContent = config.icon; $('#res-title').textContent = r.reason === 'timeout' ? 'Masa Tamat' : 'Pusingan Tamat'; $('#res-detail').textContent = r.detail; $('#res-score').textContent = number(r.score); $('#res-time').textContent = `Masa ${lb.formatDuration(r.seconds)}`; renderSubmit();
}
function renderSubmit() {
  if (!lastResult) return;
  const r = lastResult, box = $('#res-submit'); box.replaceChildren(); box.className = 'res-submit';
  const state = r.submit.status;
  box.textContent = state === 'offline' ? 'Papan markah belum dikonfigurasi. Markah disimpan dalam peranti ini sahaja.' : state === 'sending' || state === 'pending' ? 'Menghantar markah…' : state === 'done' ? 'Markah direkodkan.' : `Gagal menghantar: ${r.submit.message}`;
  if (state === 'done') box.classList.add('ok'); if (state === 'error') { box.classList.add('err'); const retry = h('button', 'btn btn-link', 'Cuba semula'); retry.addEventListener('click', () => submitResult(r)); box.append(retry); }
}
async function submitResult(r) {
  if (r.sending) return;
  const profile = loadProfile();
  if (!profile || !lb.boardsConfigured()) { r.submit = { status: 'offline' }; renderSubmit(); return; }
  r.sending = true; r.submit = { status: 'sending' }; renderSubmit();
  try { await lb.recordRound({ game: gameId, profile, points: r.score, seconds: r.seconds, date: todayKL() }); r.submit = { status: 'done' }; }
  catch (error) { r.submit = { status: 'error', message: error.message }; }
  finally { r.sending = false; if (lastResult === r) renderSubmit(); }
}
function openBoard() { show('board'); setTab(boardTab); }
function setTab(tab) { boardTab = tab; const buttons = [...document.querySelectorAll('.tabs [data-tab]')]; buttons.forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === tab))); $('.tabs').style.setProperty('--tab-index', String(buttons.findIndex(button => button.dataset.tab === tab))); loadTab(tab); }
function boardMessage(message, retry) { const box = h('div', 'lb-empty'); box.append(h('p', null, message)); if (retry) { const b = h('button', 'btn btn-ghost', 'Cuba semula'); b.addEventListener('click', retry); box.append(b); } $('#lb-body').replaceChildren(box); }
async function loadTab(tab) {
  const request = ++boardRequest;
  $('#board-sub').textContent = tab === 'daily' ? 'Jumlah markah hari ini' : tab === 'alltime' ? 'Jumlah markah & masa bermain' : 'Jumlah markah semua pemain kampus';
  if (!lb.boardsConfigured()) return boardMessage('Papan markah belum dikonfigurasi.');
  $('#lb-body').replaceChildren(h('div', 'lb-loading', 'Memuatkan…'));
  const profile = loadProfile();
  try { const rows = tab === 'campus' ? await lb.topCampuses(gameId) : await lb.topPlayers(gameId, profile?.playerId, tab === 'daily' ? todayKL() : null); if (request !== boardRequest) return; if (!rows?.length) return boardMessage(tab === 'daily' ? 'Belum ada markah hari ini. Jadilah yang pertama!' : 'Belum ada markah.'); $('#lb-body').replaceChildren(tab === 'campus' ? lb.campusList(rows, profile?.campus) : lb.playersList(rows, { showPlays: tab === 'daily' })); }
  catch (error) { if (request === boardRequest) boardMessage(`Gagal memuatkan: ${error.message}`, () => loadTab(tab)); }
}
function init() {
  document.title = config.name; $('#game-icon').textContent = config.icon; $('#game-name').textContent = config.name; $('#game-description').textContent = config.description; $('#help-text').textContent = config.help;
  initFromArked(); initAppsWarga(); initProfile();
  const help = () => $('#dlg-help').showModal(); $('#btn-help').addEventListener('click', help); $('#btn-game-help').addEventListener('click', help); $('#help-close').addEventListener('click', () => $('#dlg-help').close());
  $('#btn-hub').addEventListener('click', backToArked); $('#btn-close-app').addEventListener('click', closeMiniApp); $('#btn-version').addEventListener('click', hardReload);
  $('#btn-play').addEventListener('click', () => go('main')); $('#btn-board').addEventListener('click', () => go('papan')); $('#btn-quit').addEventListener('click', () => go(''));
  $('#btn-finish').addEventListener('click', () => finish('manual')); $('#res-home').addEventListener('click', () => go('')); $('#res-again').addEventListener('click', () => { game = null; go('main'); }); $('#res-board').addEventListener('click', () => { boardTab = 'alltime'; go('papan'); });
  $('#btn-board-back').addEventListener('click', () => go('')); $('#btn-board-refresh').addEventListener('click', () => loadTab(boardTab)); for (const button of document.querySelectorAll('.tabs [data-tab]')) button.addEventListener('click', () => setTab(button.dataset.tab));
  document.addEventListener('keydown', event => { if (gameId !== '2048' || document.body.dataset.screen !== 'game' || document.querySelector('dialog[open]')) return; const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key]; if (dir) { event.preventDefault(); move2048(dir); } });
  let touch = null; $('#game-grid').addEventListener('pointerdown', event => { if (gameId === '2048') touch = { x: event.clientX, y: event.clientY }; }); $('#game-grid').addEventListener('pointerup', event => { if (!touch || gameId !== '2048') return; const dx = event.clientX - touch.x, dy = event.clientY - touch.y; touch = null; if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) move2048(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopClock(); else if (activeClock()) lastTick = performance.now(); });
  window.addEventListener('hashchange', route); timer = setInterval(updateClock, 100); route(); requestAnimationFrame(notifyAppReady);
}
init();
