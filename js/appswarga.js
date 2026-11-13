// AppsWarga mini-app integration: follow the user's AppsWarga theme.
// Bridge docs: AppsWarga repo, docs/miniapp-bridge.md (getTheme, appswargaThemeChange).
// Outside AppsWarga nothing here runs and the CSS defaults (AppsWarga's purple theme) apply.

const HEX = /^#[0-9a-f]{6}$/i;

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes hex colour `a` toward `b` by `t` (0 = a, 1 = b). Done in JS because iOS 15 has no color-mix(). */
function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Game palette derived from an AppsWarga theme ({ primaryColor, gradient, backgroundColor }). */
export function paletteFor(theme) {
  const p = HEX.test(theme?.primaryColor ?? '') ? theme.primaryColor : null;
  if (!p) return null;
  const g1 = theme.gradient?.[1];
  const bg = HEX.test(theme.backgroundColor ?? '') ? theme.backgroundColor : mix(p, '#ffffff', 0.93);
  return {
    '--primary': p,
    '--primary-2': HEX.test(g1 ?? '') ? g1 : mix(p, '#ffffff', 0.3),
    '--bg': bg,
    '--bg-2': mix(p, '#ffffff', 0.88),
    '--surface-2': mix(p, '#ffffff', 0.86),
    '--ink': mix(p, '#111111', 0.82),
    '--ink-2': mix(p, '#333333', 0.6),
    '--muted': mix(p, '#9e9e9e', 0.6),
    '--line': mix(p, '#ffffff', 0.6),
    '--same': mix(p, '#ffffff', 0.86),
    '--key-ink': mix(p, '#111111', 0.75),
    '--key-off': mix(p, '#ffffff', 0.72),
    '--key-off-ink': mix(p, '#ffffff', 0.42),
  };
}

function applyTheme(theme) {
  const palette = paletteFor(theme);
  if (!palette) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(palette)) root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette['--primary']);
}

/** Theme from the CSS variables the bridge sets on <html>, used if getTheme fails. */
function themeFromCssVars() {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();
  return {
    primaryColor: v('--appswarga-primary'),
    gradient: [v('--appswarga-gradient-start')],
    backgroundColor: v('--appswarga-background') || null,
  };
}

async function onBridgeReady() {
  // AppsWarga's screens are light-only, so match them even when the phone is in dark mode.
  document.documentElement.dataset.theme = 'light';
  document.documentElement.classList.add('in-appswarga');
  try {
    const reply = await window.appswarga.callHandler('getTheme');
    applyTheme(reply?.status === 'success' ? reply.data : themeFromCssVars());
  } catch {
    applyTheme(themeFromCssVars());
  }
}

export const inAppsWarga = () => Boolean(window.appswarga?.ready);

export function initAppsWarga() {
  window.addEventListener('appswargaThemeChange', (e) => applyTheme(e.detail));
  // The bridge is injected when the page starts loading and again when it finishes.
  if (inAppsWarga()) onBridgeReady();
  else window.addEventListener('appswargaReady', onBridgeReady, { once: true });
}
