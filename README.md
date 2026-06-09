# Events — everything that happens in your city

**Live site: [events.librevore.me](https://events.librevore.me)**

Easy to use, easy to understand website that lists events for specific cities and regions. Event
information is scattered everywhere — Facebook groups, Meetup, Eventbrite, municipal sites, tourism
portals, posters — with no centralized source. This site fixes that: one place for everything that
happens in your home city.

It's powered by an agent that runs once a day, fetches events from many sources and republishes the
website. There is **no backend**: the agent pre-generates a static JSON database per city which is
loaded and rendered entirely on the client.

## Features

- **City directory** — browse supported cities, grouped by country, with upcoming-event counts
- **Smart filtering** — filter by date (today / this week / this month / past), category and
  free-text search across titles, descriptions, venues and tags
- **Add to calendar** — download an `.ics` file or add directly to Google Calendar
- **Share** — native share sheet on mobile (Web Share API), copy-link fallback on desktop
- **Maps** — every event with coordinates is shown on an embedded OpenStreetMap map
- **Source links** — every event links back to where it was found, for tickets and full details
- **Fast & private** — static site, no tracking, no accounts, no backend

## Supported locations (first version)

- Bar, Montenegro
- Budva, Montenegro
- Kotor, Montenegro
- Tivat, Montenegro
- Ulcinj, Montenegro
- Podgorica, Montenegro
- Vennesla, Norway

Want your city added? [Open an issue](https://github.com/sondreb/events/issues).

## Architecture

```
┌─────────────────────┐   daily cron    ┌──────────────────────────┐
│ GitHub Actions      │ ──────────────► │ scripts/fetch-events.mjs │
│ update-events.yml   │                 │ (the agent)              │
└─────────────────────┘                 └────────────┬─────────────┘
                                                     │ fetch / normalise /
                                                     │ dedupe / prune
                                                     ▼
                                        public/data/events/<city>.json
                                                     │ commit + push
                                                     ▼
┌─────────────────────┐    build        ┌──────────────────────────┐
│ GitHub Actions      │ ──────────────► │ GitHub Pages             │
│ deploy.yml          │                 │ events.librevore.me      │
└─────────────────────┘                 └──────────────────────────┘
```

- **Frontend**: Angular 22 (standalone components, signals, zoneless change detection) with
  runtime localization (English, Montenegrin, Russian), light/dark themes and favorites
- **Data**: static JSON in [public/data](public/data) — [cities.json](public/data/cities.json)
  plus one events file per city in [public/data/events](public/data/events)
- **Agent**: [scripts/fetch-events.mjs](scripts/fetch-events.mjs), a dependency-free Node script.
  Sources are registered per city in
  [scripts/sources.config.json](scripts/sources.config.json) — adding a source is a config
  change, not a code change. Source types:
  - `web` — any public event-listing page; the page text is sent to an LLM which extracts
    structured events (titles, dates, venues, categories) and never invents entries
  - `ics` — public iCalendar feeds
  - `json` — JSON endpoints with a declarative field mapping

  The agent normalises fields, validates categories, deduplicates by title + day + venue, keeps
  stable event ids across runs, prunes events that ended more than a week ago and machine-
  translates every event into Montenegrin and Russian (stored under the event's `t` field).
- **AI**: extraction and translation use **GitHub Models**. The agent prefers the
  `COPILOT_SECRET` repository secret (a fine-grained PAT with Models access), falling back to
  the workflow's built-in `GITHUB_TOKEN` (`permissions: models: read`). Setting an
  `OPENAI_API_KEY` secret switches the agent to the OpenAI API instead.
- **Discovery** (optional): when a `BRAVE_API_KEY` repository secret is set, the agent also
  queries the Brave Search API for fresh “events in <city>” pages each run and extracts events
  from the top results — finding events on pages nobody registered as a source.
- **Hosting**: GitHub Pages with a custom domain. A `404.html` copy of `index.html` provides SPA
  deep-link routing; [public/CNAME](public/CNAME) holds the custom domain.

## Data sources

All configured sources are official, verified public websites:

| City | Sources |
| --- | --- |
| Bar | barinfo.me (Radio Bar), montenegro.travel |
| Budva | budva.travel (TO Budva), montenegro.travel |
| Kotor | radiokotor.info (Radio Kotor), montenegro.travel |
| Tivat | tivat.travel (TO Tivat), montenegro.travel |
| Ulcinj | ul-info.com (UL Info), montenegro.travel |
| Podgorica | podgorica.travel (TO Podgorica) |
| Vennesla | venneslakulturhus.no, vennesla.kommune.no |

The `web` source type means any additional event page (municipal sites, venues, festivals,
local news) can be added with two lines of config — the AI extractor handles the rest.

## Development

```bash
npm install
npm start          # dev server on http://localhost:4200
npm run build      # production build to dist/events/browser
npm run fetch-events  # run the agent locally (set COPILOT_SECRET/GITHUB_TOKEN or OPENAI_API_KEY; optional BRAVE_API_KEY)
```

## Deployment

Pushing to `main` triggers [deploy.yml](.github/workflows/deploy.yml), which builds the site and
publishes it to GitHub Pages. The daily agent workflow commits updated event data, which in turn
triggers a fresh deployment.

Domain setup:

- Website domain: `events.librevore.me`
- CNAME value: `sondreb.github.io`

## Adding a new city

1. Add the city to [public/data/cities.json](public/data/cities.json) (slug, name, country,
   coordinates, timezone, description).
2. Create `public/data/events/<slug>.json` with an empty `events` array.
3. Register data sources for the city in
   [scripts/sources.config.json](scripts/sources.config.json).

## License

[MIT](LICENSE)
