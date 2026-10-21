// Production server: serves the built site from dist/ and the Convai proxy.
// Run `npm run build` first, then `npm start`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConvaiHandler } from './convaiHandler.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 8080;
const convai = createConvaiHandler(process.env);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.normalize(path.join(dist, urlPath));
  if (!file.startsWith(dist)) {
    res.statusCode = 403;
    return res.end();
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  const ext = path.extname(file);
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  if (urlPath.startsWith('/assets/') && ext !== '.html') {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  fs.createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    convai(req, res, () => serveStatic(req, res)).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end();
      }
    });
  })
  .listen(port, () => console.log(`NSK AI assistant on http://localhost:${port}`));
