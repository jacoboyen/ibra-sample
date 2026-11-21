import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseICS } from '../scripts/lib/ics.mjs';
import { normalizeEvents, shortLocation } from '../scripts/lib/events.mjs';
import { normalizeBikeReg, enrich } from '../scripts/lib/bikereg.mjs';
import { rangeText } from '../scripts/lib/util.mjs';

const site = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url)));
const ics = readFileSync(new URL('./fixtures/calendar.ics', import.meta.url), 'utf8');
const races = normalizeEvents(parseICS(ics).events, site.disciplines);
const byTitle = (t) => races.find((r) => r.title === t);

test('all-day DTEND is exclusive', () => {
  const r = byTitle('Sample Spring Road Race');
  assert.equal(r.start, '2027-04-11');
  assert.equal(r.end, '2027-04-11');
  assert.equal(r.days, 1);
});

test('multi-day and cross-month spans', () => {
  assert.equal(byTitle('Sample Stage Race').end, '2027-05-17');
  const crit = byTitle('Sample Criterium Weekend');
  assert.equal(crit.end, '2027-06-01');
  assert.equal(rangeText(crit.start, crit.end), 'May 30 – Jun 1, 2027');
});

test('timed events use the Iowa date', () => {
  const r = races.find((x) => x.kind === 'Mountain bike');
  assert.equal(r.start, '2027-06-06');
  assert.equal(r.end, '2027-06-06');
});

test('prefixes become disciplines, cancellations are detected', () => {
  assert.equal(byTitle('Sample Gravel Classic').kind, 'Gravel');
  const c = byTitle('Sample Cancelled Race');
  assert.equal(c.cancelled, true);
  assert.equal(c.kind, 'Road');
  assert.equal(byTitle('Sample Race Without A Prefix').kind, 'Other');
});

test('permit numbers, folded lines and HTML descriptions', () => {
  const r = byTitle('Sample Spring Road Race');
  assert.equal(r.permit, '2027-1001');
  assert.equal(r.registration, 'https://www.bikereg.com/sample-spring-road-race');
  assert.equal(byTitle('Sample Stage Race').website, 'https://example.org/stage-race');
});

test('short locations', () => {
  assert.equal(shortLocation('Sample Park, 100 Main St, Des Moines, IA 50309, USA'), 'Des Moines, IA');
  assert.equal(shortLocation('Muscatine, IA'), 'Muscatine, IA');
});

test('BikeReg matching by permit and date conflicts', () => {
  const br = JSON.parse(readFileSync(new URL('./fixtures/bikereg.json', import.meta.url))).MatchingEvents.map(normalizeBikeReg);
  const copy = structuredClone(races);
  const problems = enrich(copy, br);
  assert.equal(copy.find((r) => r.title === 'Sample Criterium Weekend').registration, 'https://www.bikereg.com/sample-crit-weekend');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Gravel Classic/);
});
