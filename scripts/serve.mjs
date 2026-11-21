#!/usr/bin/env node
// Local preview of ./dist at http://localhost:8080 (build first with SITE_URL unset).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf' };
const port = Number(process.env.PORT || 8080);

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.includes('..')) { res.writeHead(400).end(); return; }
  let file = join(dist, p);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': types['.html'] }).end(await readFile(join(dist, '404.html')).catch(() => 'Not found'));
  }
}).listen(port, () => console.log(`Preview: http://localhost:${port}`));
