// Turns raw calendar entries into race records the site can render.
import { slugify, yearOf, daysBetween } from './util.mjs';

function cleanDescription(raw) {
  // Google Calendar descriptions can contain HTML. Keep text and link targets only.
  let s = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_, href, label) => {
      const l = label.replace(/<[^>]+>/g, '').trim();
      return l && l !== href ? `${l} (${href})` : href;
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

export function shortLocation(loc) {
  if (!loc) return '';
  const m = loc.match(/([A-Za-z .'-]+),\s*(IA|Iowa)\b/);
  if (m) return `${m[1].trim()}, IA`;
  const parts = loc.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 3) return `${parts[parts.length - 3]}, ${parts[parts.length - 2].replace(/\s+\d{5}(-\d{4})?$/, '')}`;
  return loc.length > 60 ? loc.slice(0, 57) + '…' : loc;
}

export function normalizeEvents(raw, disciplines) {
  const byPrefix = new Map(disciplines.map((d) => [d.prefix.toUpperCase(), d.label]));
  const slugsByYear = new Map();
  const races = raw
    .filter((e) => e.summary)
    .sort((a, b) => a.start.localeCompare(b.start) || a.summary.localeCompare(b.summary))
    .map((e) => {
      let title = e.summary;
      let kind = 'Other';
      let cancelled = e.status === 'CANCELLED';
      const stripCancel = () => {
        const cm = title.match(/^\s*(cancel+ed)\s*[:\-–]?\s*/i) || title.match(/\s*[\(\[]\s*(cancel+ed)\s*[\)\]]\s*$/i);
        if (cm) { cancelled = true; title = title.replace(cm[0], '').trim(); }
      };
      stripCancel();
      const m = title.match(/^\s*([A-Za-z]+)\s*[:|]\s*(.+)$/);
      if (m && byPrefix.has(m[1].toUpperCase())) {
        kind = byPrefix.get(m[1].toUpperCase());
        title = m[2].trim();
      }
      stripCancel();

      const fullDescription = cleanDescription(e.description || '');
      const permitMatch = fullDescription.match(/permit\s*(?:#|no\.?|number)?\s*[:#]?\s*(\d{4}-\d{1,6}|\d{3,6})\b/i);
      const urls = [...new Set([e.url, ...(fullDescription.match(URL_RE) || [])].filter(Boolean))];
      // The permit is shown separately on the race page, so drop lines that only state it.
      const description = fullDescription.split('\n').filter((l) => !/^\s*(usac\s+)?permit\b[^a-z]*$/i.test(l)).join('\n').trim();
      const bikereg = urls.find((u) => /bikereg\.com/i.test(u)) || '';
      const website = urls.find((u) => u !== bikereg) || '';

      const year = yearOf(e.start);
      const used = slugsByYear.get(year) || new Set();
      let slug = slugify(title);
      for (let i = 2; used.has(slug); i++) slug = `${slugify(title)}-${i}`;
      used.add(slug);
      slugsByYear.set(year, used);

      return {
        uid: e.uid,
        title,
        kind,
        start: e.start,
        end: e.end,
        days: daysBetween(e.start, e.end) + 1,
        location: e.location,
        city: shortLocation(e.location),
        description,
        permit: permitMatch ? permitMatch[1] : '',
        website,
        registration: bikereg,
        cancelled,
        year,
        path: `/races/${year}/${slug}/`,
      };
    });
  return races;
}
