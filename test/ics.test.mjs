import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseICS, seriesEnd } from '../scripts/lib/ics.mjs';
import { normalizeEvents, shortLocation } from '../scripts/lib/events.mjs';
import { normalizeBikeReg, enrich, permitKey } from '../scripts/lib/bikereg.mjs';
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

test('real BikeReg API shapes: permit formats and malformed EventUrl', () => {
  assert.equal(permitKey('2026-15418'), '15418');
  assert.equal(permitKey('d5683ddc-12f9-48a8-af9c-0bf79027cf3b:15418'), '15418');
  assert.equal(permitKey('15303'), '15303');
  assert.equal(permitKey(''), '');

  const real = normalizeBikeReg({
    EventId: 73188, EventName: 'Triple D Winter Endurance Race', EventCity: 'Dubuque',
    EventDate: '/Date(1768626000000-0500)/', EventEndDate: '/Date(1768626000000-0500)/',
    EventUrl: 'http://www.BikeReg.comhttp://tripledrace.com/', EventPermalink: 'http://www.BikeReg.com/73188',
    Permit: 'd5683ddc-12f9-48a8-af9c-0bf79027cf3b:15418',
  });
  assert.equal(real.url, 'https://www.bikereg.com/73188');
  assert.equal(real.start, '2026-01-17');

  const r = [{ title: 'Triple D', start: '2026-01-17', permit: '2026-15418' }];
  enrich(r, [real]);
  assert.equal(r[0].matchedBy, 'permit');
  assert.equal(r[0].registration, 'https://www.bikereg.com/73188');
});

test('BikeReg logo URL and common-word false matches', () => {
  const b = normalizeBikeReg({ EventId: 1, EventName: 'Iowa Valley RAGBRAI Charter 2026', EventDate: '2026-07-18', EventLogo: '/BR/VirtualImages/EventLogos/abc.png' });
  assert.equal(b.logo, 'https://www.bikereg.com/BR/VirtualImages/EventLogos/abc.png');
  assert.equal(normalizeBikeReg({ EventId: 2 }).logo, '');

  const r = [{ title: 'Iowa Games TT', start: '2026-07-18', permit: '' }];
  enrich(r, [b]);
  assert.equal(r[0].matchedBy, undefined);

  const ok = [{ title: 'Sugar Bottom Scramble', start: '2026-08-23', permit: '' }];
  enrich(ok, [normalizeBikeReg({ EventId: 3, EventName: 'Sugar Bottom Scramble', EventDate: '2026-08-23', EventPermalink: 'http://www.BikeReg.com/75000', EventLogo: '/x.png' })]);
  assert.equal(ok[0].bikeregUrl, 'https://www.bikereg.com/75000');
  assert.equal(ok[0].logo, 'https://www.bikereg.com/x.png');
});

test('repeating event series end dates', () => {
  assert.equal(seriesEnd('2020-09-22', 'FREQ=WEEKLY;WKST=SU;UNTIL=20201027;BYDAY=TU'), '2020-10-27');
  assert.ok(seriesEnd('2014-05-06', 'FREQ=MONTHLY;COUNT=4;BYDAY=1TU') < '2015-01-01');
  assert.equal(seriesEnd('2026-04-16', 'FREQ=MONTHLY;BYDAY=3TH'), '9999-12-31');
});
