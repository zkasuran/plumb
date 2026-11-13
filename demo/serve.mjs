// A tiny static file server that behaves like a typical static host: it serves 404.html
// (with a 404 status) for paths that do not exist. Used to serve the demo site.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), process.argv[2] ?? 'lantern');
const listen = Number(process.env.SITE_PORT ?? 4173);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    return createReadStream(file).pipe(res);
  }
  const nf = join(root, '404.html');
  res.writeHead(404, { 'content-type': existsSync(nf) ? MIME['.html'] : 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(existsSync(nf) ? readFileSync(nf) : 'Not found');
}).listen(listen, '127.0.0.1');
