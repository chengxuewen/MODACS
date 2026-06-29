import { build } from 'esbuild';

// Bundle the server entry point
await build({
  entryPoints: ['apps/server/src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: 'dist/server.mjs',
  external: ['hono', '@hono/node-server'],
});

// Bundle the base plugin entry point
await build({
  entryPoints: ['apps/base/src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: 'dist/base.mjs',
  external: ['hono', '@hono/node-server'],
});

console.log('Build complete: dist/server.mjs, dist/base.mjs');