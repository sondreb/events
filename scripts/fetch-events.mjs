#!/usr/bin/env node
/**
 * Daily event-fetching agent.
 *
 * Reads scripts/sources.config.json, pulls events from every configured source
 * for every supported city, normalises and deduplicates them, merges them with
 * the existing dataset, drops stale past events, translates new events into all
 * supported locales and writes the result to public/data/events/<city>.json.
 *
 * Source types:
 *   - 'web'        Any public event-listing web page. The page text is sent to
 *                  an LLM which extracts structured events. Requires a model
 *                  provider (see below).
 *   - 'ics'        A public iCalendar feed.
 *   - 'json'       A JSON endpoint with a field mapping.
 *
 * Model providers (for 'web' extraction and translation), tried in order:
 *   1. GitHub Models — uses COPILOT_SECRET (a fine-grained PAT with Models
 *      access) when set, otherwise the built-in GITHUB_TOKEN (requires
 *      `permissions: models: read` in the workflow).
 *   2. OpenAI — uses OPENAI_API_KEY when set.
 *
 * Discovery (optional): when BRAVE_API_KEY is set, the agent also queries the
 * Brave Search API for upcoming-event pages per city and runs the same LLM
 * extraction over the top results — so events are found even on pages nobody
 * has registered as a source yet.
 *
 * Designed to run unattended in CI (see .github/workflows/update-events.yml).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const CONFIG_PATH = path.join(ROOT, 'scripts', 'sources.config.json');

/** Events that ended more than this many days ago are pruned. */
const KEEP_PAST_DAYS = 14;
/** Locales the agent translates events into ('en' is the canonical base). */
const TARGET_LOCALES = ['me', 'ru'];
const LOCALE_NAMES = { me: 'Montenegrin (Latin script)', ru: 'Russian' };

const USER_AGENT = 'events-agent/1.0 (+https://events.librevore.me)';

// Rate limiting: GitHub Models free tier allows ~15 requests/minute for small
// models, so pace LLM calls generously and retry on 429s with backoff. The
// daily run is unattended — total runtime does not matter.
const MIN_LLM_INTERVAL_MS = 10_000;
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 20_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastLlmCallAt = 0;

/** Ensures at least MIN_LLM_INTERVAL_MS between consecutive LLM requests. */
async function throttle() {
  const wait = lastLlmCallAt + MIN_LLM_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await sleep(wait);
  }
  lastLlmCallAt = Date.now();
}

// ---------------------------------------------------------------------------
// LLM client (GitHub Models or OpenAI).
// ---------------------------------------------------------------------------

function modelProvider() {
  const githubToken = process.env.COPILOT_SECRET || process.env.GITHUB_TOKEN;
  if (githubToken) {
    return {
      name: `GitHub Models (${process.env.COPILOT_SECRET ? 'COPILOT_SECRET' : 'GITHUB_TOKEN'})`,
      url: 'https://models.github.ai/inference/chat/completions',
      model: process.env.MODEL_ID ?? 'openai/gpt-4o-mini',
      headers: {
        authorization: `Bearer ${githubToken}`,
        'content-type': 'application/json',
      },
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'OpenAI',
      url: 'https://api.openai.com/v1/chat/completions',
      model: process.env.MODEL_ID ?? 'gpt-4o-mini',
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
    };
  }
  return null;
}

async function chat(systemPrompt, userPrompt) {
  const provider = modelProvider();
  if (!provider) {
    throw new Error('No model provider configured (set GITHUB_TOKEN or OPENAI_API_KEY).');
  }
  await throttle();
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: provider.headers,
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`${provider.name} returned an empty response.`);
      }
      return JSON.parse(content);
    }
    const body = await res.text();
    lastError = new Error(
      `${provider.name} request failed (${res.status}): ${body.slice(0, 300)}`,
    );
    // Retry on rate limits and transient server errors, honouring Retry-After.
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `  [retry] ${provider.name} returned ${res.status}; waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }
    break;
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Source fetchers — one per source type.
// ---------------------------------------------------------------------------

/** Strips HTML to readable text, capped to keep prompts small. */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|article|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, 18_000);
}

const EXTRACTION_SYSTEM_PROMPT = `You extract real-world public events from web page text.
Return JSON: {"events": [...]}. Each event:
{
  "title": "string (in English; translate if the page is in another language)",
  "description": "string, 1-3 sentences in English summarising the event",
  "start": "ISO 8601 date-time with timezone offset, e.g. 2026-06-14T17:00:00+02:00",
  "end": "ISO 8601 date-time (optional, omit if unknown)",
  "venue": "string (optional)",
  "address": "string (optional)",
  "category": "one of: music|culture|sports|food|family|market|festival|community|nightlife|tech|other",
  "price": "string (optional, e.g. 'Free' or '€10')",
  "url": "absolute URL to the event page (optional)"
}
Rules:
- ONLY include events explicitly present in the text with a determinable date. Never invent events.
- ONLY include events taking place in or immediately around the city given by the user; skip events in other cities.
- Skip events without a clear date. Skip ads, navigation, hotel listings and non-event content.
- If only a date (no time) is known, use 00:00:00 as the time.
- Resolve relative dates using the "today" date given by the user.
- If the year is missing, assume the next occurrence from today.
- Return {"events": []} if no events are found.`;

/** Fetch a web page and extract events using an LLM. */
async function fetchWeb(source, city) {
  if (!modelProvider()) {
    console.warn(`  [skip] ${source.name}: no model provider for 'web' extraction`);
    return [];
  }
  const res = await fetch(source.url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Page fetch failed (${res.status}) for ${source.url}`);
  const text = htmlToText(await res.text());
  if (text.length < 200) throw new Error(`Page yielded too little text: ${source.url}`);

  const result = await chat(
    EXTRACTION_SYSTEM_PROMPT,
    `Today is ${new Date().toISOString().slice(0, 10)}. City: ${city.name}, ${city.country} (timezone ${city.timezone}).
Page URL: ${source.url}

Page text:
${text}`,
  );
  return (result.events ?? []).map((e) => ({
    ...e,
    source: source.name,
    url: e.url ?? source.url,
  }));
}

/** Fetch and parse a public iCalendar (.ics) feed. */
async function fetchIcs(source) {
  const res = await fetch(source.url, { headers: { 'user-agent': USER_AGENT } });
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

/** Fetch a generic JSON endpoint and map its fields via the config. */
async function fetchJson(source) {
  const res = await fetch(source.url, { headers: { 'user-agent': USER_AGENT } });
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
  web: fetchWeb,
  ics: fetchIcs,
  json: fetchJson,
};

// ---------------------------------------------------------------------------
// Brave Search discovery (optional, requires BRAVE_API_KEY).
// ---------------------------------------------------------------------------

/** Hosts that are never useful as event sources. */
const DISCOVERY_BLOCKLIST = [
  'facebook.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'tiktok.com',
  'youtube.com',
  'tripadvisor.',
  'booking.com',
  'airbnb.',
  'wikipedia.org',
  'events.librevore.me',
];

/** Search the web for event pages for a city and extract events from them. */
async function discoverEvents(city) {
  const key = process.env.BRAVE_API_KEY;
  if (!key || !modelProvider()) return [];

  const month = new Date().toLocaleString('en', { month: 'long', year: 'numeric' });
  const queries = [
    `events in ${city.name} ${city.country} ${month}`,
    `${city.name} ${city.country} concerts festivals what's on`,
  ];

  const urls = new Set();
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q, count: '6', freshness: 'pm' })}`,
        { headers: { accept: 'application/json', 'x-subscription-token': key } },
      );
      if (!res.ok) {
        console.warn(`  [warn] Brave search failed (${res.status}) for "${q}"`);
        continue;
      }
      const data = await res.json();
      for (const item of data.web?.results ?? []) {
        const url = item.url;
        if (!url || DISCOVERY_BLOCKLIST.some((b) => url.includes(b))) continue;
        urls.add(url);
      }
    } catch (err) {
      console.warn(`  [warn] Brave search error: ${err.message}`);
    }
  }

  const events = [];
  for (const url of [...urls].slice(0, 5)) {
    try {
      const found = await fetchWeb({ type: 'web', name: new URL(url).hostname, url }, city);
      if (found.length) {
        console.log(`  [discover] ${url}: ${found.length} events`);
        events.push(...found);
      }
    } catch {
      // Discovered pages are best-effort; skip quietly on failure.
    }
  }
  return events;
}

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
    ...(raw.t ? { t: raw.t } : {}),
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
    // Newly fetched data wins, but keep stable id and existing translations.
    byKey.set(
      key,
      current ? { ...current, ...event, id: current.id, t: current.t ?? event.t } : event,
    );
  }
  const cutoff = Date.now() - KEEP_PAST_DAYS * 24 * 60 * 60 * 1000;
  return [...byKey.values()]
    .filter((e) => new Date(e.end ?? e.start).getTime() >= cutoff)
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ---------------------------------------------------------------------------
// Translation.
// ---------------------------------------------------------------------------

/** Adds missing `t.<locale>.{title,description}` translations to events. */
async function translateEvents(events, cityName) {
  if (!modelProvider()) {
    console.warn('  [skip] translation: no model provider configured');
    return events;
  }
  const pending = events.filter((e) =>
    TARGET_LOCALES.some((loc) => !e.t?.[loc]?.title || !e.t?.[loc]?.description),
  );
  if (pending.length === 0) return events;

  // Translate in batches to keep prompts small.
  const BATCH = 8;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const payload = batch.map((e) => ({ id: e.id, title: e.title, description: e.description }));
    try {
      const result = await chat(
        `You translate event listings. Translate each event's "title" and "description" into the requested languages.
Keep proper nouns (artist names, venue names, festival names) unchanged. Keep the tone concise and natural.
Return JSON: {"translations": {"<event id>": {"me": {"title": "...", "description": "..."}, "ru": {"title": "...", "description": "..."}}}}`,
        `Languages: ${TARGET_LOCALES.map((l) => `${l} = ${LOCALE_NAMES[l]}`).join(', ')}.
City context: ${cityName}.
Events:
${JSON.stringify(payload, null, 1)}`,
      );
      for (const event of batch) {
        const tr = result.translations?.[event.id];
        if (!tr) continue;
        event.t = event.t ?? {};
        for (const loc of TARGET_LOCALES) {
          if (tr[loc]?.title && tr[loc]?.description) {
            event.t[loc] = {
              title: String(tr[loc].title).slice(0, 200),
              description: String(tr[loc].description).slice(0, 2000),
            };
          }
        }
      }
      console.log(`  [i18n] translated ${batch.length} event(s)`);
    } catch (err) {
      console.error(`  [error] translation batch failed: ${err.message}`);
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const cities = JSON.parse(await readFile(path.join(DATA_DIR, 'cities.json'), 'utf8'));
  const provider = modelProvider();
  console.log(`Model provider: ${provider ? `${provider.name} (${provider.model})` : 'none'}`);
  console.log(`Brave Search discovery: ${process.env.BRAVE_API_KEY ? 'enabled' : 'disabled'}`);

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

    fetched.push(...(await discoverEvents(city)));

    const incoming = fetched.map((raw) => normalise(raw, city.slug)).filter(Boolean);

    const filePath = path.join(DATA_DIR, 'events', `${city.slug}.json`);
    let existing = [];
    try {
      existing = JSON.parse(await readFile(filePath, 'utf8')).events ?? [];
    } catch {
      // First run for this city — start from an empty dataset.
    }

    const events = mergeEvents(existing, incoming);
    await translateEvents(events, `${city.name}, ${city.country}`);

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
