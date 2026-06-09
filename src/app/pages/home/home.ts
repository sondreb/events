import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { City } from '../../models/event.model';
import { EventsService } from '../../services/events.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomePage {
  private readonly eventsService = inject(EventsService);

  protected readonly cities = signal<City[]>([]);
  protected readonly query = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly eventCounts = signal<Record<string, number>>({});

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

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const cities = await this.eventsService.getCities();
      this.cities.set(cities);
      const counts: Record<string, number> = {};
      await Promise.all(
        cities.map(async (city) => {
          try {
            const data = await this.eventsService.getCityEvents(city.slug);
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
    } catch {
      this.error.set('Could not load the list of cities. Please try again later.');
    }
  }
}
