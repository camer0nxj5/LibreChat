import fs from 'node:fs';

const file = new URL('../cj-revision.json', import.meta.url);
const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
// Use the deployment's calendar day even when builds run in UTC containers.
const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).formatToParts(new Date());
const get = (type) => parts.find((part) => part.type === type).value;
const date = `${get('year')}-${get('month')}-${get('day')}`;
const revision = previous.date === date ? previous.revision + 1 : 1;
if (!Number.isSafeInteger(revision) || revision < 1) {
  throw new Error('Invalid CJ revision counter');
}
fs.writeFileSync(file, JSON.stringify({ date, revision }, null, 2) + '\n');
console.log(`CJ rev. ${get('month')}.${get('day')}.${get('year').slice(-2)} v.${revision}`);
