import { createRequire } from 'node:module';
const require = createRequire(process.argv[2] + '/');
const { connect } = require('@tursodatabase/database');
const db = await connect(process.argv[4]);
if (process.argv[3] === 'memory') await db.exec('PRAGMA temp_store = MEMORY');
await db.exec(
  `CREATE TABLE IF NOT EXISTS sync_rows (table_name TEXT NOT NULL, row_id TEXT NOT NULL, data TEXT NOT NULL, rev TEXT NOT NULL, origin TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (table_name, row_id))`,
);
await db.exec(`CREATE TABLE IF NOT EXISTS sync_info (key TEXT NOT NULL PRIMARY KEY, value TEXT)`);
const n = Number(process.argv[5] ?? 200);
await db.exec('BEGIN');
const ins = db.prepare('INSERT INTO sync_rows VALUES (?,?,?,?,?,?)');
for (let i = 0; i < n; i++)
  await ins.run([
    'transactions',
    'r' + i,
    JSON.stringify({ id: 'r' + i, note: 'x'.repeat(200) }),
    'v1',
    'p',
    i,
  ]);
await db.exec('COMMIT');
const T = ['transactions', 'accounts', 'categories', 'ledgers'];
const cases = {
  summarizeCloud: [
    `SELECT table_name, data FROM sync_rows WHERE table_name IN (${T.map(() => '?').join(', ')})`,
    T,
  ],
  sync_info: ['SELECT key, value FROM sync_info', []],
  fetchByIds: [
    `SELECT row_id, data, rev FROM sync_rows WHERE table_name = ? AND row_id IN (?,?,?)`,
    ['transactions', 'r1', 'r2', 'r3'],
  ],
  all: ['SELECT table_name, row_id, rev FROM sync_rows', []],
};
for (const [name, [sql, args]] of Object.entries(cases)) {
  try {
    const r = await db.prepare(sql).all(args);
    console.log(`ok    ${name} (${r.length} rows)`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}
