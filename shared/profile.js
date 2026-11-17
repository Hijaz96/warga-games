// The player profile dialog for a game: the shared Arked Warga profile (arked.profile), with
// the AppsWarga user-type lock. Same behaviour as Teka Kata's and the hub's.
//
// The page needs the profile chip (#profile-chip, #chip-avatar, #chip-name, #chip-meta) and
// the dialog (#dlg-profile, #profile-form, #pf-name, #pf-type, #pf-type-hint, #pf-campus,
// #pf-error, #pf-cancel), as in ular/index.html.
import { PROFILE_KEY, migrateLocal, readShared, syncShared, writeShared } from './shared-store.js';
import { USER_TYPES, CAMPUSES, NON_UITM_CAMPUS, userTypeLabel } from './profile-options.js';
import { enhanceSelect, refreshSelect, closeSelectSheet } from './select.js';
import { appsWargaAllowedUserTypes, appsWargaSessionError } from './appswarga.js';
import { uuid } from './uuid.js';

const $ = (sel) => document.querySelector(sel);
let allowedTypes = null; // user types the AppsWarga account may use (null = any)
let afterSave = null;
let onChange = () => {};

export const loadProfile = () => readShared(PROFILE_KEY);

/** The type to use when a saved one isn't allowed: the only choice, or Orang Awam for public accounts. */
const fallbackType = (allowed) => (allowed.includes('awam') ? 'awam' : allowed[0]);

export function renderProfileChip() {
  const p = loadProfile();
  $('#chip-avatar').textContent = p ? p.nickname.charAt(0).toUpperCase() : '?';
  $('#chip-name').textContent = p ? p.nickname : 'Tetapkan profil';
  // Orang Awam isn't tied to a campus, so their chip shows the category only.
  $('#chip-meta').textContent = !p
    ? 'Nama, kategori & kampus'
    : p.userType === 'awam'
      ? userTypeLabel(p.userType)
      : `${userTypeLabel(p.userType)} · ${p.campus}`;
}

function applyUserTypeRules() {
  const select = $('#pf-type');
  for (const opt of select.options) {
    if (opt.value) opt.disabled = Boolean(allowedTypes) && !allowedTypes.includes(opt.value);
  }
  const locked = allowedTypes?.length === 1;
  if (allowedTypes && !allowedTypes.includes(select.value)) select.value = fallbackType(allowedTypes);
  if (select.value === 'awam' && !$('#pf-campus').value) $('#pf-campus').value = NON_UITM_CAMPUS;
  select.disabled = locked;
  select.parentElement.classList.toggle('locked', locked);
  const hint = $('#pf-type-hint');
  const error = allowedTypes ? null : appsWargaSessionError();
  hint.hidden = !error;
  hint.classList.toggle('warn', Boolean(error));
  hint.textContent = error ? `Kategori tidak dapat disemak dengan AppsWarga (${error}).` : '';
  refreshSelect(select);
  refreshSelect($('#pf-campus'));
}

/**
 * Inside AppsWarga, the signed-in account limits the user type: staff and testers are locked
 * to Staf, students to Pelajar, public accounts choose Alumni or Orang Awam. A saved profile
 * outside those choices is corrected.
 */
async function syncUserTypeFromApp() {
  const allowed = await appsWargaAllowedUserTypes();
  if (!allowed) return applyUserTypeRules();
  allowedTypes = allowed;
  const p = loadProfile();
  if (p && !allowed.includes(p.userType)) {
    writeShared(PROFILE_KEY, { ...p, userType: fallbackType(allowed) });
    renderProfileChip();
    onChange();
  }
  applyUserTypeRules();
}

/** Opens the dialog; `then` runs after a successful save. */
export function openProfile(then = null) {
  afterSave = then;
  const p = loadProfile();
  $('#dlg-profile').returnValue = '';
  $('#pf-name').value = p?.nickname ?? '';
  $('#pf-type').value = p?.userType ?? '';
  $('#pf-campus').value = p?.campus ?? '';
  $('#pf-error').textContent = '';
  applyUserTypeRules();
  $('#dlg-profile').showModal();
  if (!allowedTypes) syncUserTypeFromApp(); // retry, e.g. the first try was offline
}

/** Runs `fn` now if there's a profile, else after the player saves one. */
export function withProfile(fn) {
  if (loadProfile()) return fn();
  openProfile(fn);
}

function save(e) {
  e.preventDefault();
  const nickname = $('#pf-name').value.trim().replace(/\s+/g, ' ');
  const userType = $('#pf-type').value;
  const campus = $('#pf-campus').value;
  if (!nickname) return void ($('#pf-error').textContent = 'Sila masukkan nama panggilan.');
  if (!userType || (allowedTypes && !allowedTypes.includes(userType))) {
    return void ($('#pf-error').textContent = 'Sila pilih kategori.');
  }
  if (!campus) return void ($('#pf-error').textContent = 'Sila pilih kampus.');
  const prev = loadProfile();
  writeShared(PROFILE_KEY, { playerId: prev?.playerId ?? uuid(), nickname: nickname.slice(0, 20), userType, campus });
  $('#dlg-profile').close('saved');
  renderProfileChip();
  onChange();
  const next = afterSave;
  afterSave = null;
  if (next) next();
}

function fillOptions() {
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

/**
 * Wires the chip and dialog. Call once, after initAppsWarga(). `changed` runs whenever the
 * profile changes (saved here, corrected for AppsWarga, or synced from AppsWarga's storage).
 */
export function initProfile({ changed = () => {} } = {}) {
  onChange = changed;
  // Players from before Arked Warga keep their Teka Kata profile and player id.
  migrateLocal('tk.profile', PROFILE_KEY);
  fillOptions();
  enhanceSelect($('#pf-type'));
  enhanceSelect($('#pf-campus'));
  $('#pf-type').addEventListener('change', () => {
    if ($('#pf-type').value !== 'awam') return;
    $('#pf-campus').value = NON_UITM_CAMPUS;
    refreshSelect($('#pf-campus'));
  });
  $('#profile-chip').addEventListener('click', () => openProfile());
  $('#profile-form').addEventListener('submit', save);
  $('#pf-cancel').addEventListener('click', () => $('#dlg-profile').close('cancel'));
  $('#dlg-profile').addEventListener('close', () => {
    closeSelectSheet();
    if ($('#dlg-profile').returnValue !== 'saved') afterSave = null;
  });
  renderProfileChip();
  syncUserTypeFromApp();
  // In AppsWarga, the profile set in Arked Warga (perhaps on another site) wins.
  syncShared([PROFILE_KEY], () => {
    renderProfileChip();
    onChange();
  });
}
