// Kejar Lapan: every number that shapes the game, in one place. Distances are metres, times
// seconds, speeds metres a second. The sim, the course and the tests all read from here.

/** x of the three lanes (left, middle, right). */
export const LANES = [-3.3, 0, 3.3];
/** Sideways speed while changing lane: one lane takes 3.3 / 22 = 0.15 s. */
export const LANE_SPEED = 22;

/** The player's hitbox: half its width and half its depth along the road. */
export const PLAYER_HALF_W = 0.3;
export const PLAYER_HALF_D = 0.3;

export const GRAVITY = -40;
/** Jump take-off speed: a 2.9 m high, 0.76 s jump. */
export const JUMP_SPEED = 15.2;
/** A jump pressed this long before landing still happens, on touchdown. */
export const JUMP_BUFFER = 0.15;
/** Slide (tunduk) length. */
export const SLIDE_TIME = 0.65;
/** Pressing slide in the air drops the player at this speed. */
export const DROP_SPEED = -26;

/** Running speed: starts at `start`, gains `perMetre` each metre, tops out at `max`. */
export const SPEED = { start: 22, max: 40, perMetre: 0.006 };
/** Boost (pecut): speed multiplier and length. Obstacles hit while boosting are smashed. */
export const BOOST = { factor: 1.5, time: 5 };
/** Shield protects one hit for at most ten active-play seconds; pickups refresh it. */
export const SHIELD = { time: 10, warning: 3 };

/**
 * Obstacles. `len` along the road and `w` across it make the hitbox; `clear` is how to get
 * past one in your lane: 'jump' (be at least `clearY` high), 'slide', or 'none' (change lane).
 */
export const OBSTACLES = {
  cone: { len: 1.2, w: 1.15, clear: 'jump', clearY: 1.0 },
  pothole: { len: 2.2, w: 2.3, clear: 'jump', clearY: 0.3 },
  monkey: { len: 1.0, w: 1.0, clear: 'jump', clearY: 1.3 },
  barrier: { len: 0.5, w: 2.9, clear: 'slide' },
  car: { len: 4.4, w: 2.05, clear: 'none' },
  bus: { len: 7.2, w: 2.55, clear: 'none' },
};
export const JUMPERS = ['cone', 'pothole', 'monkey'];
export const BLOCKERS = ['car', 'bus'];

/** Obstacle rows: the first row's distance, and the time between rows (easy → hard). */
export const ROWS = { first: 60, easyTime: 1.5, hardTime: 0.95, hardAt: 4000, minGap: 22 };
/** Difficulty tiers by distance: which row patterns may appear. */
export const TIERS = [0, 500, 1500, 3000];

/** Items: what each kind gives, and how often each gap between rows holds one. */
export const ITEMS = {
  points: { value: 25 },
  boost: { value: 25 },
  shield: { value: 25 },
  time: { value: 25, seconds: 5 },
};
/** Per gap: a line of three points items, or else one power-up (these chances, in order). */
/** One +5 s clock in a random lane each twelfth row, with room to approach and leave it. */
export const TIME_SUPPORT = { everyRows: 12, minGap: 60 };
export const ITEM_CHANCE = { line: 0.55, boost: 0.1, shield: 0.07, time: 0.04 };
/** An item is collected within this distance along the road and across it. */
export const PICKUP = { halfD: 0.9, halfW: 1.1, maxY: 2.3 };

/**
 * The clock: real seconds left before 8:00. It starts at `start`, can't go above `max`, and each
 * checkpoint adds `cpFirst` seconds, one fewer each time, never below `cpMin`.
 * The campus clock on screen runs `scale` times faster: 40 s left shows 07:55:00.
 */
export const CLOCK = { start: 40, max: 50, cpFirst: 16, cpMin: 8, scale: 300 / 40 };
/** Checkpoints (landmarks): the first at `first` m, each gap `grow` m longer than the last. */
export const CHECKPOINTS = { first: 300, grow: 40 };

/** Score: one point a metre, plus items, plus this for each checkpoint. */
export const CHECKPOINT_POINTS = 200;
/** arked_record's caps for kejar-lapan (hub repo, supabase/arked.sql: arked_games). */
export const SERVER = { maxPoints: 100000, maxPointsPerSec: 300 };

/** The fixed simulation step. */
export const STEP = 1 / 60;

/** The UiTM Shah Alam landmarks, passed in this order and then again from the second. */
export const LANDMARKS = [
  { name: 'Pintu Gerbang Utama UiTM', short: 'Pintu Gerbang', type: 'gate' },
  { name: 'Kolej Perindu & Seroja', short: 'Kolej Perindu', type: 'kolej' },
  { name: 'Menara SAAS (Canseleri)', short: 'Menara SAAS', type: 'saas' },
  { name: 'Masjid Tuanku Mizan', short: 'Masjid', type: 'masjid' },
  { name: 'Perpustakaan Tun Abdul Razak', short: 'PTAR', type: 'ptar' },
  { name: 'Dewan Agung Tuanku Canselor', short: 'DATC', type: 'datc' },
  { name: 'Fakulti Sains Komputer & Matematik', short: 'FSKM', type: 'fakulti' },
  { name: 'Kompleks Kejuruteraan', short: 'Kejuruteraan', type: 'engineering' },
];

/** The four characters, from the Arked profile's user type. Items differ in look and name only. */
export const ROLES = {
  pelajar: {
    label: 'Pelajar',
    mission: 'Kelas pagi pukul 8:00',
    late: 'Anda terlewat ke kelas pagi!',
    items: { points: 'Buku', boost: 'Kopi', shield: 'Kad Matrik', time: 'Jam' },
  },
  staf: {
    label: 'Staf',
    mission: 'Punch card pukul 8:00',
    late: 'Anda terlewat punch card!',
    items: { points: 'Fail', boost: 'Teh Tarik', shield: 'Kad Staf', time: 'Jam' },
  },
  alumni: {
    label: 'Alumni',
    mission: 'Konvokesyen di DATC pukul 8:00',
    late: 'Anda terlewat ke majlis konvokesyen!',
    items: { points: 'Skrol', boost: 'Kopi', shield: 'Kad Alumni', time: 'Jam' },
  },
  awam: {
    label: 'Awam',
    mission: 'Lawatan kampus pukul 8:00',
    late: 'Anda terlewat ke lawatan kampus!',
    items: { points: 'Risalah', boost: 'Air Kelapa', shield: 'Pas Pelawat', time: 'Jam' },
  },
};
