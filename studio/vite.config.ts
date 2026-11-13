import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Production-only hardening: a strict Content-Security-Policy meta tag (the no-flash theme
 * script is allowed by its hash), a 404.html copy so deep links work on static hosts, and
 * a _headers file for the things a meta tag cannot set (frame-ancestors, nosniff, ...).
 */
function hardening(): Plugin {
  let outDir = 'dist';
  return {
    name: 'plumb-hardening',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
      // The shipped build must carry recorded runs only, never development sample data.
      const idx = join(c.root, 'public', 'data', 'index.json');
      if (existsSync(idx) && JSON.parse(readFileSync(idx, 'utf8')).sample && !process.env.ALLOW_SAMPLE) {
        throw new Error('public/data holds sample data. Run `plumb export` to replace it, or set ALLOW_SAMPLE=1 for a throwaway build.');
      }
    },
    transformIndexHtml(html) {
      const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
      const hash = createHash('sha256').update(inline).digest('base64');
      const policy = [
        "default-src 'none'",
        `script-src 'self' 'sha256-${hash}'`,
        "style-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' http://127.0.0.1:4310 http://localhost:4310",
        "manifest-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
      ].join('; ');
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
    closeBundle() {
      const index = join(outDir, 'index.html');
      if (existsSync(index)) copyFileSync(index, join(outDir, '404.html'));
      writeFileSync(
        join(outDir, '_headers'),
        ['/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: no-referrer', '  X-Frame-Options: DENY', "  Content-Security-Policy: frame-ancestors 'none'", '  Strict-Transport-Security: max-age=31536000; includeSubDomains', '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()', ''].join('\n')
      );
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), hardening()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4310' } },
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
});
