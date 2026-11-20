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
  '.mp3': 'audio/mpeg',
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
    const headers = {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
    };
    // Browser audio needs byte ranges to seek to the shared musical timeline.
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const suffix = match && !match[1];
      const start = match ? (suffix ? Math.max(0, body.length - Number(match[2])) : Number(match[1])) : NaN;
      const end = match ? (suffix || !match[2] ? body.length - 1 : Math.min(body.length - 1, Number(match[2]))) : NaN;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= body.length) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${body.length}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 });
      res.end(body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': body.length });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Warga Games: http://localhost:${port}/warga-games/ (hub: /arcade/)`));
