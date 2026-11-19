// A self-contained PNG result card. Files are prepared before the share-button gesture.
import { NON_UITM_CAMPUS } from '../../shared/profile-options.js';
import { createPreview } from './preview.js';
import { ROLES } from './config.js';
import { MODE_LABELS } from './modes.js';
import { formatDistance, formatTime, formatPoints, formatDate, formatClock } from './score.js';

function profileCampus(profile) {
  const campus = typeof profile?.campus === 'string' ? profile.campus.trim() : '';
  return profile?.userType === 'awam' || campus === NON_UITM_CAMPUS ? '' : campus;
}

export function resultCardContent(result) {
  return {
    nickname: result.profile?.nickname || ROLES[result.role].label,
    role: ROLES[result.role].label,
    campus: profileCampus(result.profile),
    mode: `${MODE_LABELS[result.plan.mode]}${result.plan.day ? ` · ${formatDate(result.plan.day)}` : ''}`,
    title: result.reason === 'arrived' ? 'SAMPAI TEPAT MASA!' : result.reason === 'crash' ? 'TERLANGGAR!' : 'DAH PUKUL 8:00!',
    destination: result.plan.destination?.short ?? 'Tanpa Henti',
    score: formatPoints(result.score),
    distance: formatDistance(result.distance),
    time: formatTime(result.seconds),
    checkpoints: String(result.checkpoints),
    clock: formatClock(result.timeLeft),
  };
}

export function avatarCardContent(avatar) {
  const stats = avatar.stats ?? {};
  return {
    nickname: avatar.profile?.nickname || ROLES[avatar.role].label,
    role: ROLES[avatar.role].label,
    campus: profileCampus(avatar.profile),
    mode: 'WATAK & PENCAPAIAN',
    title: 'GAYA KAMPUS SAYA',
    destination: ROLES[avatar.role].mission,
    note: 'Gaya sahaja. Kebolehan sama.',
    cells: [
      ['MARKAH TERBAIK', formatPoints(stats.best ?? 0)],
      ['JARAK TERJAUH', formatDistance(stats.bestDistance ?? 0)],
      ['MASA BERMAIN', formatTime(stats.totalSeconds ?? 0)],
      ['PERMAINAN', String(stats.played ?? 0)],
    ],
  };
}

export const createResultImage = (result) => createCardImage(resultCardContent(result), result, 'kejar-lapan-keputusan.png');
export const createAvatarImage = (avatar) => createCardImage(avatarCardContent(avatar), avatar, 'kejar-lapan-avatar.png');

async function createCardImage(data, appearance, filename) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  const font = "'Lexend', system-ui, sans-serif";
  function box(x, y, w, h, fill, border = null) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 4; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); }
  }
  function text(value, x, y, size, colour = '#ffffff', weight = 700, maxWidth = 960) {
    ctx.fillStyle = colour;
    ctx.font = `${weight} ${size}px ${font}`;
    let label = String(value);
    if (ctx.measureText(label).width > maxWidth) {
      while (label.length && ctx.measureText(`${label}…`).width > maxWidth) label = Array.from(label).slice(0, -1).join('');
      label += '…';
    }
    ctx.fillText(label, x, y);
  }
  function polygon(points, fill, stroke = null, width = 4) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  box(0, 0, 1080, 1350, '#180e2b');
  // Layered, chamfered foil frame and a single full-height character illustration.
  polygon([[66, 22], [1014, 22], [1058, 66], [1058, 1284], [1014, 1328], [66, 1328], [22, 1284], [22, 66]], '#d6a942', '#fef08a', 6);
  polygon([[76, 42], [1004, 42], [1038, 76], [1038, 1274], [1004, 1308], [76, 1308], [42, 1274], [42, 76]], '#28133f', '#7c3aed', 5);
  const hero = ctx.createLinearGradient(0, 190, 0, 980);
  hero.addColorStop(0, '#5b2b83');
  hero.addColorStop(0.5, '#ac80d4');
  hero.addColorStop(1, '#38204f');
  box(70, 190, 940, 790, hero);
  ctx.save();
  ctx.beginPath();ctx.rect(70, 190, 940, 790);ctx.clip();
  for (let i = -5; i < 10; i++) {
    polygon([[540, 600], [i * 220, 190], [i * 220 + 80, 190]], '#ffffff0c');
    polygon([[540, 600], [i * 220, 980], [i * 220 + 80, 980]], '#ffffff08');
  }
  for (let i = 0; i < 28; i++) {
    const x = 100 + (i * 173) % 860;
    const y = 240 + (i * 127) % 660;
    const size = i % 3 === 0 ? 12 : 6;
    box(x, y, size, size, i % 2 ? '#fef08a80' : '#ffffff50');
  }
  const portrait = createPreview(document.createElement('canvas'), { thumbnail: true, width: 860, height: 850 });
  try { ctx.drawImage(portrait.portrait(appearance.role, appearance.cosmetics ?? {}), 110, 145, 860, 850); }
  finally { portrait.dispose(); }
  ctx.restore();

  // Title plate and role crest sit over the illustration, like an inventory card.
  polygon([[70, 70], [1010, 70], [1010, 174], [70, 174]], '#301747', '#d6a942');
  text('KEJAR LAPAN', 96, 110, 23, '#facc15', 800);
  text(data.nickname, 96, 153, 37, '#ffffff', 800, 720);
  polygon([[884, 84], [962, 84], [988, 110], [962, 158], [884, 158], [858, 110]], '#4c1d75', '#facc15', 3);
  ctx.textAlign = 'center';
  text(data.role.toUpperCase(), 923, 128, 18, '#fef08a', 800, 100);
  ctx.textAlign = 'left';
  box(90, 210, 900, 46, '#28133fe6');
  text(data.mode, 108, 241, 21, '#ede9fe', 600, 858);

  polygon([[70, 888], [1010, 888], [1010, 978], [70, 978]], '#27123deF', '#c4a05f', 3);
  text(data.title, 94, 929, 35, '#fef08a', 800, 892);
  text(data.destination, 94, 960, 21, '#ede9fe', 600, 892);

  const cells = data.cells ?? [['MARKAH', data.score], ['JARAK', data.distance], ['MASA LARIAN', data.time], ['MERCU TANDA', data.checkpoints]];
  cells.forEach(([label, value], i) => {
    const x = 70 + (i % 2) * 478;
    const y = 997 + Math.floor(i / 2) * 104;
    box(x, y + 5, 462, 90, '#130b21');
    box(x, y, 462, 90, '#3c2057', '#846092');
    box(x, y, 6, 90, '#d6a942');
    text(label, x + 22, y + 27, 18, '#d8c7e5');
    text(value, x + 22, y + 72, 38, '#ffffff', 800, 418);
  });
  text(data.note ?? `Jam kampus ${data.clock}`, 74, 1235, 20, '#e9d5ff', 500, 930);
  box(70, 1250, 940, 2, '#846092');
  text('ARKED WARGA', 74, 1283, 18, '#facc15', 800);
  ctx.textAlign = 'right';
  text(data.campus, 1006, 1283, 18, '#c4b5fd', 600, 540);
  ctx.textAlign = 'left';
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
  return new File([blob], filename, { type: 'image/png' });
}

export function downloadResultImage(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** No text-only fallback. An unsupported or failed file share downloads the PNG. */
export async function shareResultImage(file, nav = navigator, download = downloadResultImage) {
  try {
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: 'Kejar Lapan' });
      return 'shared';
    }
  } catch (err) {
    if (err.name === 'AbortError') return 'cancelled';
  }
  download(file);
  return 'downloaded';
}
