// Local server laid out like GitHub Pages: /warga-games/ is this repo and /arcade/ is the hub
// (../arked), so a game's ‹ back to Arked works locally.
//   node tools/dev-server.mjs [port]      then open http://localhost:8080/warga-games/ular/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SITES = {
  'warga-games': here,
  arcade: resolve(here, '../arked'),
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
const port = Number(process.argv[2] || process.env.PORT || 8080);

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const [, site, ...rest] = path.split('/');
  const root = SITES[site];
  if (!root) {
    res.writeHead(302, { Location: '/warga-games/' }).end();
    return;
  }
  if (rest.length === 0) {
    res.writeHead(301, { Location: `/${site}/` }).end();
    return;
  }
  let file = normalize(join(root, ...rest));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Warga Games: http://localhost:${port}/warga-games/ (hub: /arcade/)`));
