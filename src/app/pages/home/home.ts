import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { City, EventItem } from '../../models/event.model';
import { EventsService } from '../../services/events.service';
import { FavoritesService } from '../../services/favorites.service';
import { ClockService } from '../../services/clock.service';
import { I18nService } from '../../services/i18n.service';
import { eventActiveUntil, isEventPast } from '../../services/event-time';

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
  protected readonly error = signal<string | null>(null);
  protected readonly eventCounts = signal<Record<string, number>>({});
  private readonly eventsByCity = signal<ReadonlyMap<string, EventItem[]>>(new Map());

  protected readonly countries = computed(() => {
    const grouped = new Map<string, City[]>();
    for (const city of this.cities()) {
      const list = grouped.get(city.country) ?? [];
      list.push(city);
      grouped.set(city.country, list);
    }
    return [...grouped.entries()].map(([country, cities]) => ({ country, cities }));
  });

  /** All starred events that still exist in the datasets. */
  private readonly favoriteEntries = computed<FavoriteEntry[]>(() => {
    this.favoritesService.favorites();
    const byCity = this.eventsByCity();
    const cities = this.cities();
    const out: FavoriteEntry[] = [];
    for (const { citySlug, eventId } of this.favoritesService.entries()) {
      const city = cities.find((c) => c.slug === citySlug);
      const event = byCity.get(citySlug)?.find((e) => e.id === eventId);
      if (!city || !event) continue;
      out.push({ city, event });
    }
    return out.sort((a, b) => a.event.start.localeCompare(b.event.start));
  });

  protected readonly upcomingFavorites = computed(() =>
    this.favoriteEntries().filter((e) => !isEventPast(e.event, this.clock.now())),
  );

  protected readonly expiredFavorites = computed(() =>
    this.favoriteEntries()
      .filter((e) => isEventPast(e.event, this.clock.now()))
      .reverse(),
  );

  /** When true, the starred section shows expired events instead of upcoming. */
  protected readonly showExpired = signal(false);

  protected readonly favoriteEvents = computed<FavoriteEntry[]>(() =>
    this.showExpired() ? this.expiredFavorites() : this.upcomingFavorites(),
  );

  protected readonly hasFavorites = computed(() => this.favoritesService.favorites().size > 0);

  protected isPast(event: EventItem): boolean {
    return isEventPast(event, this.clock.now());
  }

  protected isMultiDay(event: EventItem): boolean {
    if (!event.end) return false;
    return new Date(event.start).toDateString() !== new Date(event.end).toDateString();
  }

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
            counts[city.slug] = data.events.filter((e) => eventActiveUntil(e) >= now).length;
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
