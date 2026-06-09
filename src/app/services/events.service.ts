import { Injectable, signal } from '@angular/core';
import { City, CityEvents } from '../models/event.model';

@Injectable({ providedIn: 'root' })
export class EventsService {
  private citiesCache: City[] | null = null;
  private readonly eventsCache = new Map<string, CityEvents>();

  readonly loading = signal(false);

  async getCities(): Promise<City[]> {
    if (this.citiesCache) {
      return this.citiesCache;
    }
    this.loading.set(true);
    try {
      const res = await fetch('data/cities.json');
      if (!res.ok) {
        throw new Error(`Failed to load cities (${res.status})`);
      }
      this.citiesCache = (await res.json()) as City[];
      return this.citiesCache;
    } finally {
      this.loading.set(false);
    }
  }

  async getCity(slug: string): Promise<City | undefined> {
    const cities = await this.getCities();
    return cities.find((c) => c.slug === slug);
  }

  async getCityEvents(slug: string): Promise<CityEvents> {
    const cached = this.eventsCache.get(slug);
    if (cached) {
      return cached;
    }
    this.loading.set(true);
    try {
      const res = await fetch(`data/events/${slug}.json`);
      if (!res.ok) {
        throw new Error(`Failed to load events for ${slug} (${res.status})`);
      }
      const data = (await res.json()) as CityEvents;
      data.events.sort((a, b) => a.start.localeCompare(b.start));
      this.eventsCache.set(slug, data);
      return data;
    } finally {
      this.loading.set(false);
    }
  }
}
