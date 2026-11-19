// Local cosmetic milestones. This module never supplies values to the simulation.
// Milestone access is enabled by default; existing progress remains intact.
export const COSMETICS_TEST_UNLOCK = false;

export const SLOTS = { head: 'Kepala', face: 'Muka', outfit: 'Badan', back: 'Belakang', hand: 'Tangan', trail: 'Jejak Larian' };
export const COSMETICS = [
  { id: 'bag-mint', slot: 'back', name: 'Beg Bulat', design: 'round', icon: '🩷', colour: 0xf472b6, metric: 'played', target: 100 },
  { id: 'bag-gold', slot: 'back', name: 'Beg Kucing Emas', design: 'cat', icon: '🐱', colour: 0xfbbf24, metric: 'totalDistance', target: 50000 },
  { id: 'outfit-coral', slot: 'outfit', name: 'Jubah Shinigami', design: 'robe', icon: '🥋', colour: 0x18181b, metric: 'bestDistance', target: 10000 },
  { id: 'outfit-sky', slot: 'outfit', name: 'Vest Pengembara', design: 'vest', icon: '🦺', colour: 0x4d7c0f, metric: 'totalCheckpoints', target: 100 },
  { id: 'trail-mint', slot: 'trail', name: 'Fros Terbang', design: 'frost', icon: '❄️', colour: 0x2dd4bf, metric: 'totalSeconds', target: 3600 },
  { id: 'trail-violet', slot: 'trail', name: 'Bintang Berkelip', design: 'stars', icon: '⭐', colour: 0xc084fc, metric: 'bestDistance', target: 12000 },
  { id: 'trail-fire', slot: 'trail', name: 'Jejak Api', design: 'fire', icon: '🔥', colour: 0xf97316, metric: 'totalSeconds', target: 7200 },
  { id: 'trail-rainbow', slot: 'trail', name: 'Pelangi', design: 'rainbow', icon: '🌈', colour: 0xf472b6, metric: 'totalDistance', target: 200000 },
  { id: 'glasses', slot: 'face', name: 'Cermin Mata', icon: '🕶️', colour: 0x0f172a, metric: 'bestDistance', target: 5000 },
  { id: 'mask', slot: 'face', name: 'Topeng Penuh', icon: '🎭', colour: 0xf1f5f9, metric: 'played', target: 300 },
  { id: 'briefcase', slot: 'hand', name: 'Beg Kerja', icon: '💼', colour: 0x78350f, metric: 'arrivals', target: 100 },
  { id: 'headband', slot: 'head', name: 'Halo Emas', design: 'halo', icon: '😇', colour: 0xfacc15, metric: 'arrivals', target: 250 },
  { id: 'cap', slot: 'head', name: 'Helmet', icon: '🪖', colour: 0xfacc15, metric: 'played', target: 150 },
  { id: 'hat', slot: 'head', name: 'Topi Pengembara', icon: '👒', colour: 0xd6a65b, metric: 'totalDistance', target: 20000 },
  { id: 'handheld', slot: 'hand', name: 'Tongkat Bintang', icon: '🪄', colour: 0xfacc15, metric: 'totalItems', target: 500 },
  { id: 'jetpack', slot: 'back', name: 'Jetpack', icon: '🚀', colour: 0x94a3b8, metric: 'totalSeconds', target: 14400 },
  { id: 'trident', slot: 'hand', name: 'Trisula', icon: '🔱', colour: 0xfacc15, metric: 'totalCheckpoints', target: 300 },
  { id: 'katanas', slot: 'back', name: 'Dwi Katana', icon: '⚔️', colour: 0x94a3b8, metric: 'played', target: 500 },
];

export function milestoneValue(stats, item) {
  const n = stats?.[item.metric];
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
export const milestoneReached = (stats, item) => milestoneValue(stats, item) >= item.target;
export const isUnlocked = (stats, item, testUnlock = COSMETICS_TEST_UNLOCK) => testUnlock || milestoneReached(stats, item);
export function equippedCosmetics(stats, saved, testUnlock = COSMETICS_TEST_UNLOCK) {
  // Preserve old selections while moving them into body-position slots. Old katana + bag
  // combinations become katana-only because they now occupy the same back slot.
  const legacy = {
    back: saved?.accessory === 'katanas' ? 'katanas' : saved?.backpack,
    head: ['headband', 'cap', 'hat'].includes(saved?.accessory) ? saved.accessory : null,
    face: saved?.accessory === 'glasses' ? 'glasses' : null,
    hand: saved?.accessory === 'handheld' ? 'handheld' : null,
  };
  return Object.fromEntries(Object.keys(SLOTS).map((slot) => {
    let id = Object.hasOwn(saved ?? {}, slot) ? saved[slot] : legacy[slot];
    if (slot === 'face' && id === 'beard') id = 'mask';
    return [slot, COSMETICS.find((item) => item.slot === slot && item.id === id && isUnlocked(stats, item, testUnlock)) ?? null];
  }));
}
export function newlyUnlocked(before, after, testUnlock = COSMETICS_TEST_UNLOCK) {
  if (testUnlock) return [];
  return COSMETICS.filter((item) => !milestoneReached(before, item) && milestoneReached(after, item));
}
const number = (n) => n.toLocaleString('ms-MY', { maximumFractionDigits: 1 });
export function milestoneLabel(item) {
  const target = number(item.target);
  switch (item.metric) {
    case 'played': return `Tamatkan ${target} permainan`;
    case 'bestDistance': return `Capai ${target} m dalam satu larian`;
    case 'totalDistance': return `Kumpul ${number(item.target / 1000)} km keseluruhan`;
    case 'totalSeconds': return `Bermain selama ${number(item.target / 60)} minit`;
    case 'totalCheckpoints': return `Lepasi ${target} mercu tanda`;
    case 'arrivals': return `Sampai tepat masa ${target} kali`;
    case 'totalItems': return `Kutip ${target} item`;
  }
}
export function milestoneProgress(stats, item) {
  const value = Math.min(item.target, milestoneValue(stats, item));
  if (item.metric === 'totalSeconds') return `${number(Math.floor(value / 6) / 10)} / ${number(item.target / 60)} min`;
  if (item.metric === 'totalDistance') return `${number(Math.floor(value / 100) / 10)} / ${number(item.target / 1000)} km`;
  const units = { played: 'permainan', bestDistance: 'm', totalCheckpoints: 'mercu tanda', arrivals: 'ketibaan', totalItems: 'item' };
  return `${number(value)} / ${number(item.target)} ${units[item.metric]}`;
}

const positive = (n) => Number.isFinite(n) ? Math.max(0, n) : 0;
/** Completed runs only. Simulation time excludes pauses, menus and time in the background. */
export function progressionAfterRun(before, run) {
  const st = { ...before };
  st.played = positive(st.played) + 1;
  st.best = Math.max(positive(st.best), positive(run.score));
  st.bestDistance = Math.max(positive(st.bestDistance), Math.floor(positive(run.distance)));
  st.totalDistance = positive(st.totalDistance) + positive(run.distance);
  st.totalSeconds = positive(st.totalSeconds) + positive(run.t);
  st.totalCheckpoints = positive(st.totalCheckpoints) + positive(run.checkpoints);
  st.arrivals = positive(st.arrivals) + (run.status === 'arrived' ? 1 : 0);
  st.totalItems = positive(st.totalItems) + Object.values(run.picked ?? {}).reduce((sum, count) => sum + positive(count), 0);
  return st;
}
