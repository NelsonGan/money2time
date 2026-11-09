import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Every API route must refuse other hosts, other sites and non-JSON writes
// first thing (src/app/api/_guard.ts). Not a middleware: Next cuts a
// middleware's copy of a request body at 10 MB, and uploads are larger.
const API = new URL('../src/app/api/', import.meta.url).pathname;

function routes(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === 'route.ts' ? [full] : [];
  });
}

test('every API handler calls localOnly before anything else', () => {
  const files = routes(API);
  assert.ok(files.length >= 10, 'found the API routes');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const handlers = [...source.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\((\w+)[^)]*\) \{\n\s*(.*)\n\s*(.*)\n/g)];
    assert.ok(handlers.length > 0, `${file} exports a handler`);
    for (const [, method, param, first, second] of handlers) {
      assert.equal(first.trim(), `const refused = localOnly(${param});`, `${path.relative(API, file)} ${method}`);
      assert.equal(second.trim(), 'if (refused) return refused;', `${path.relative(API, file)} ${method}`);
    }
  }
});

test('there is no middleware: it would cut upload bodies at 10 MB', () => {
  assert.throws(() => statSync(new URL('../src/middleware.ts', import.meta.url)));
});
