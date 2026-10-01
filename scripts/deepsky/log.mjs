// The deep-sky builds' log, docs/data/deepsky-build-log.txt: each script keeps a section of its own, replaced when it
// runs again, so the file always holds the latest run of each.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const LOG = 'docs/data/deepsky-build-log.txt';
const lines = [];

/** Print a line and keep it for the log. */
export function say(s, quiet = false) {
  if (!quiet) console.log(s);
  lines.push(s);
}

/** Write this run's lines as the section `name` of the log (the script's file name). */
export function writeLog(name) {
  const start = `=== ${name} ===`;
  const end = `=== end of ${name} ===`;
  const body = [start, ...lines.filter((l, i) => i > 0 || l !== ''), end].join('\n');
  let text = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a >= 0 && b > a) text = text.slice(0, a) + body + text.slice(b + end.length);
  else text = `${text.trimEnd()}${text.trim() ? '\n\n' : ''}${body}\n`;
  writeFileSync(LOG, text.endsWith('\n') ? text : `${text}\n`);
}
