import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { City, EventItem } from '../../models/event.model';
import { EventsService } from '../../services/events.service';
import { FavoritesService } from '../../services/favorites.service';
import { ClockService } from '../../services/clock.service';
import { I18nService } from '../../services/i18n.service';

interface FavoriteEntry {
  city: City;
  event: EventItem;
}

@Component({
  selector: 'app-home',
  imports: [DatePipe, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomePage {
  private readonly eventsService = inject(EventsService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly clock = inject(ClockService);
  protected readonly i18n = inject(I18nService);

  protected readonly cities = signal<City[]>([]);
  protected readonly query = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly eventCounts = signal<Record<string, number>>({});
  private readonly eventsByCity = signal<ReadonlyMap<string, EventItem[]>>(new Map());

  protected readonly filteredCities = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) {
      return this.cities();
    }
    return this.cities().filter(
      (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
    );
  });

  protected readonly countries = computed(() => {
    const grouped = new Map<string, City[]>();
    for (const city of this.filteredCities()) {
      const list = grouped.get(city.country) ?? [];
      list.push(city);
      grouped.set(city.country, list);
    }
    return [...grouped.entries()].map(([country, cities]) => ({ country, cities }));
  });

  /** Upcoming (or currently running) starred events, soonest first. */
  protected readonly favoriteEvents = computed<FavoriteEntry[]>(() => {
    this.favoritesService.favorites();
    const byCity = this.eventsByCity();
    const cities = this.cities();
    const now = this.clock.now();
    const out: FavoriteEntry[] = [];
    for (const { citySlug, eventId } of this.favoritesService.entries()) {
      const city = cities.find((c) => c.slug === citySlug);
      const event = byCity.get(citySlug)?.find((e) => e.id === eventId);
      if (!city || !event) continue;
      const end = new Date(event.end ?? event.start).getTime();
      if (end < now) continue;
      out.push({ city, event });
    }
    return out.sort((a, b) => a.event.start.localeCompare(b.event.start));
  });

  protected readonly hasFavorites = computed(() => this.favoritesService.favorites().size > 0);

  protected timing(event: EventItem): string {
    return this.i18n.eventTiming(event.start, event.end, this.clock.now());
  }

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const cities = await this.eventsService.getCities();
      this.cities.set(cities);
      const counts: Record<string, number> = {};
      const byCity = new Map<string, EventItem[]>();
      await Promise.all(
        cities.map(async (city) => {
          try {
            const data = await this.eventsService.getCityEvents(city.slug);
            byCity.set(city.slug, data.events);
            const now = Date.now();
            counts[city.slug] = data.events.filter(
              (e) => new Date(e.end ?? e.start).getTime() >= now,
            ).length;
          } catch {
            counts[city.slug] = 0;
          }
        }),
      );
      this.eventCounts.set(counts);
      this.eventsByCity.set(byCity);
    } catch {
      this.error.set(this.i18n.t('err.cities'));
    }
  }
}
