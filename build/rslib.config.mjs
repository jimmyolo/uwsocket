import { defineConfig } from '@rslib/core';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const externalsMap = require('./externals.config.js');

const isPublic = process.env['BUILD_TARGET'] === 'npm';

let MINIFY = true;
if (process.env.MINIFY) {
  if (process.env.MINIFY === 'false' || process.env.MINIFY === '0') MINIFY = false;
  else if (process.env.MINIFY === 'true' || process.env.MINIFY === '1') MINIFY = true;
}
if (!isPublic) MINIFY = false;

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: 'es2022',
      autoExternal: false,
      shims: {
        esm: {
          __dirname: true,
        },
      },
      source: {
        entry: {
          index: './src/index.mjs',
        },
      },
      output: {
        externals: [
          Object.fromEntries(
            Object.entries(externalsMap).map(([key, value]) => [key, `node-commonjs ${value}`]),
          ),
          ({ request }, callback) => {
            if (isPublic) return callback();
            if (/^(?:@[^/]+\/)?[^./]/.test(request)) {
              return callback(null, `node-commonjs ${request}`);
            }
            callback();
          },
        ],
      },
    },
    {
      format: 'cjs',
      syntax: 'es2022',
      autoExternal: false,
      source: {
        entry: {
          index: './src/index.js',
        },
      },
      output: {
        externals: [
          Object.fromEntries(
            Object.entries(externalsMap).map(([key, value]) => [key, `node-commonjs ${value}`]),
          ),
          ({ request }, callback) => {
            if (isPublic) return callback();
            if (/^(?:@[^/]+\/)?[^./]/.test(request)) {
              return callback(null, `node-commonjs ${request}`);
            }
            callback();
          },
        ],
      },
    },
  ],
  output: {
    target: 'node',
    distPath: {
      root: 'dist',
    },
    minify: MINIFY,
    legalComments: 'inline',
    copy: [
      { from: 'src/index.d.ts', to: 'index.d.ts' },
    ],
  },
});
