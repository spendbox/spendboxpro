// Puts every database part (game-db/NNN_*.sql) together, in order, into a few files to paste into
// a NEW, empty Supabase project's SQL Editor one after another (docs/TESTING.md): the test
// database, or a fresh start. Run with: node scripts/sql-setup-parts.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const files = readdirSync("game-db").filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
const LIMIT = 330_000;
const parts = [];
let cur = "";
let from = "";
for (const f of files) {
  const sql = `-- ======================================================== ${f}\n${readFileSync(`game-db/${f}`, "utf8")}\n`;
  if (cur && cur.length + sql.length > LIMIT) {
    parts.push({ from, sql: cur });
    cur = "";
  }
  if (!cur) from = f;
  cur += sql;
}
if (cur) parts.push({ from, sql: cur });
rmSync("game-db/setup", { recursive: true, force: true });
mkdirSync("game-db/setup");
parts.forEach((p, i) => {
  const head = `-- Newtown database, set-up part ${i + 1} of ${parts.length} (made by scripts/sql-setup-parts.mjs from game-db/).\n-- Paste the parts into a NEW Supabase project's SQL Editor in order, running each before the next.\n\n`;
  writeFileSync(`game-db/setup/part-${i + 1}-of-${parts.length}.sql`, head + p.sql);
});
console.log(`${files.length} files in ${parts.length} parts`);
