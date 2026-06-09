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

- **Frontend**: Angular 22 (standalone components, signals, zoneless change detection)
- **Data**: static JSON in [public/data](public/data) — [cities.json](public/data/cities.json)
  plus one events file per city in [public/data/events](public/data/events)
- **Agent**: [scripts/fetch-events.mjs](scripts/fetch-events.mjs), a dependency-free Node script
  with pluggable source fetchers (iCalendar feeds, generic JSON endpoints, Eventbrite API).
  Sources are registered per city in
  [scripts/sources.config.json](scripts/sources.config.json) — adding a source is a config
  change, not a code change. The agent normalises fields, validates categories, deduplicates by
  title + day + venue, keeps stable event ids across runs and prunes events that ended more than
  a week ago.
- **Hosting**: GitHub Pages with a custom domain. A `404.html` copy of `index.html` provides SPA
  deep-link routing; [public/CNAME](public/CNAME) holds the custom domain.

## Data sources

The agent is designed to aggregate from many places:

- Facebook events, Meetup, Eventbrite
- Municipal and government websites (e.g. city culture calendars)
- Tourism portals and region-specific event sites
- Any public iCalendar (`.ics`) feed or JSON endpoint

Sources requiring API keys (e.g. Eventbrite) read tokens from repository secrets — see
[.github/workflows/update-events.yml](.github/workflows/update-events.yml).

## Development

```bash
npm install
npm start          # dev server on http://localhost:4200
npm run build      # production build to dist/events/browser
npm run fetch-events  # run the agent locally
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
