#!/usr/bin/env node
/**
 * Daily event-fetching agent.
 *
 * Reads scripts/sources.config.json, pulls events from every configured source
 * for every supported city, normalises and deduplicates them, merges them with
 * the existing dataset, drops stale past events and writes the result to
 * public/data/events/<city>.json.
 *
 * Designed to run unattended in CI (see .github/workflows/update-events.yml).
 * Adding a new data source is a config change, not a code change — unless it
 * is a new source *type*, in which case add a fetcher to FETCHERS below.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const CONFIG_PATH = path.join(ROOT, 'scripts', 'sources.config.json');

/** Events that ended more than this many days ago are pruned. */
const KEEP_PAST_DAYS = 7;

// ---------------------------------------------------------------------------
// Source fetchers — one per source type.
// ---------------------------------------------------------------------------

/** Fetch and parse a public iCalendar (.ics) feed. */
async function fetchIcs(source, city) {
  const res = await fetch(source.url, { headers: { 'user-agent': 'events-agent/1.0' } });
  if (!res.ok) throw new Error(`ICS fetch failed (${res.status}) for ${source.url}`);
  const text = await res.text();
  const events = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const block of blocks) {
    const get = (key) => {
      const match = block.match(new RegExp(`^${key}[^:\\n]*:(.*)$`, 'mi'));
      return match ? unfoldIcsValue(match[1]) : undefined;
    };
    const start = parseIcsDate(get('DTSTART'));
    if (!start) continue;
    events.push({
      title: get('SUMMARY') ?? 'Untitled event',
      description: get('DESCRIPTION') ?? '',
      start,
      end: parseIcsDate(get('DTEND')),
      venue: get('LOCATION'),
      url: get('URL'),
      category: source.category ?? 'other',
      source: source.name,
    });
  }
  return events;
}

function unfoldIcsValue(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .trim();
}

function parseIcsDate(value) {
  if (!value) return undefined;
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return undefined;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Fetch events from the Eventbrite API near a coordinate. Requires EVENTBRITE_TOKEN. */
async function fetchEventbrite(source, city) {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) {
    console.warn(`  [skip] Eventbrite source for ${city.slug}: EVENTBRITE_TOKEN not set`);
    return [];
  }
  const params = new URLSearchParams({
    'location.latitude': String(source.lat ?? city.lat),
    'location.longitude': String(source.lon ?? city.lon),
    'location.within': `${source.radiusKm ?? 25}km`,
    expand: 'venue',
  });
  const res = await fetch(`https://www.eventbriteapi.com/v3/events/search/?${params}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Eventbrite fetch failed (${res.status})`);
  const body = await res.json();
  return (body.events ?? []).map((e) => ({
    title: e.name?.text ?? 'Untitled event',
    description: e.description?.text ?? '',
    start: e.start?.utc,
    end: e.end?.utc,
    venue: e.venue?.name,
    address: e.venue?.address?.localized_address_display,
    lat: e.venue?.latitude ? Number(e.venue.latitude) : undefined,
    lon: e.venue?.longitude ? Number(e.venue.longitude) : undefined,
    url: e.url,
    price: e.is_free ? 'Free' : undefined,
    category: source.category ?? 'other',
    source: 'Eventbrite',
  }));
}

/** Fetch a generic JSON endpoint and map its fields via the config. */
async function fetchJson(source, city) {
  const res = await fetch(source.url, { headers: { 'user-agent': 'events-agent/1.0' } });
  if (!res.ok) throw new Error(`JSON fetch failed (${res.status}) for ${source.url}`);
  const body = await res.json();
  const items = source.itemsPath ? getPath(body, source.itemsPath) : body;
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const mapped = { category: source.category ?? 'other', source: source.name };
    for (const [target, srcPath] of Object.entries(source.fields ?? {})) {
      mapped[target] = getPath(item, srcPath);
    }
    return mapped;
  });
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => acc?.[key], obj);
}

const FETCHERS = {
  ics: fetchIcs,
  eventbrite: fetchEventbrite,
  json: fetchJson,
};

// ---------------------------------------------------------------------------
// Normalisation, deduplication and merging.
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = new Set([
  'music',
  'culture',
  'sports',
  'food',
  'family',
  'market',
  'festival',
  'community',
  'nightlife',
  'tech',
  'other',
]);

function normalise(raw, citySlug) {
  if (!raw?.title || !raw?.start) return null;
  const start = new Date(raw.start);
  if (Number.isNaN(start.getTime())) return null;
  const category = VALID_CATEGORIES.has(raw.category) ? raw.category : 'other';
  const id =
    raw.id ??
    `${citySlug}-${crypto
      .createHash('sha1')
      .update(`${raw.title}|${start.toISOString()}|${raw.venue ?? ''}`)
      .digest('hex')
      .slice(0, 12)}`;
  return {
    id,
    title: String(raw.title).trim().slice(0, 200),
    description: String(raw.description ?? '').trim().slice(0, 2000),
    category,
    start: start.toISOString(),
    ...(raw.end ? { end: new Date(raw.end).toISOString() } : {}),
    ...(raw.venue ? { venue: String(raw.venue).trim() } : {}),
    ...(raw.address ? { address: String(raw.address).trim() } : {}),
    ...(typeof raw.lat === 'number' ? { lat: raw.lat } : {}),
    ...(typeof raw.lon === 'number' ? { lon: raw.lon } : {}),
    ...(raw.price ? { price: String(raw.price).trim() } : {}),
    ...(raw.url ? { url: String(raw.url).trim() } : {}),
    ...(raw.source ? { source: String(raw.source).trim() } : {}),
    ...(Array.isArray(raw.tags) && raw.tags.length ? { tags: raw.tags.slice(0, 10) } : {}),
  };
}

/** Two events are duplicates when title + start date + venue roughly match. */
function dedupeKey(event) {
  const title = event.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const day = event.start.slice(0, 10);
  const venue = (event.venue ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${title}|${day}|${venue}`;
}

function mergeEvents(existing, incoming) {
  const byKey = new Map();
  for (const event of existing) {
    byKey.set(dedupeKey(event), event);
  }
  for (const event of incoming) {
    const key = dedupeKey(event);
    const current = byKey.get(key);
    // Newly fetched data wins, but keep the stable id of the existing entry.
    byKey.set(key, current ? { ...current, ...event, id: current.id } : event);
  }
  const cutoff = Date.now() - KEEP_PAST_DAYS * 24 * 60 * 60 * 1000;
  return [...byKey.values()]
    .filter((e) => new Date(e.end ?? e.start).getTime() >= cutoff)
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const cities = JSON.parse(await readFile(path.join(DATA_DIR, 'cities.json'), 'utf8'));

  for (const city of cities) {
    const cityConfig = config.cities[city.slug];
    const sources = cityConfig?.sources ?? [];
    console.log(`\n${city.name} (${sources.length} source${sources.length === 1 ? '' : 's'})`);

    const fetched = [];
    for (const source of sources) {
      const fetcher = FETCHERS[source.type];
      if (!fetcher) {
        console.warn(`  [skip] Unknown source type '${source.type}'`);
        continue;
      }
      try {
        const events = await fetcher(source, city);
        console.log(`  [ok] ${source.name ?? source.type}: ${events.length} events`);
        fetched.push(...events);
      } catch (err) {
        console.error(`  [error] ${source.name ?? source.type}: ${err.message}`);
      }
    }

    const incoming = fetched.map((raw) => normalise(raw, city.slug)).filter(Boolean);

    const filePath = path.join(DATA_DIR, 'events', `${city.slug}.json`);
    let existing = [];
    try {
      existing = JSON.parse(await readFile(filePath, 'utf8')).events ?? [];
    } catch {
      // First run for this city — start from an empty dataset.
    }

    const events = mergeEvents(existing, incoming);
    const payload = {
      citySlug: city.slug,
      updatedAt: new Date().toISOString(),
      events,
    };
    await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`  [write] ${events.length} events -> ${path.relative(ROOT, filePath)}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
