import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  City,
  EventCategory,
  EventItem,
} from '../../models/event.model';
import { EventsService } from '../../services/events.service';
import { EventCard } from '../../components/event-card/event-card';

type DateFilter = 'upcoming' | 'today' | 'week' | 'month' | 'past';

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'past', label: 'Past' },
];

@Component({
  selector: 'app-city',
  imports: [DatePipe, RouterLink, EventCard],
  templateUrl: './city.html',
  styleUrl: './city.css',
})
export class CityPage {
  private readonly route = inject(ActivatedRoute);
  private readonly eventsService = inject(EventsService);
  private readonly titleService = inject(Title);

  protected readonly slug = toSignal(this.route.paramMap.pipe(map((p) => p.get('slug') ?? '')), {
    initialValue: '',
  });

  protected readonly city = signal<City | null>(null);
  protected readonly events = signal<EventItem[]>([]);
  protected readonly updatedAt = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loaded = signal(false);

  protected readonly query = signal('');
  protected readonly category = signal<EventCategory | 'all'>('all');
  protected readonly dateFilter = signal<DateFilter>('upcoming');

  protected readonly dateFilters = DATE_FILTERS;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly categoryIcons = CATEGORY_ICONS;

  protected readonly availableCategories = computed(() => {
    const present = new Set(this.events().map((e) => e.category));
    return (Object.keys(CATEGORY_LABELS) as EventCategory[]).filter((c) => present.has(c));
  });

  protected readonly filteredEvents = computed(() => {
    const now = new Date();
    const q = this.query().trim().toLowerCase();
    const category = this.category();
    const dateFilter = this.dateFilter();

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date(endOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - ((now.getDay() + 6) % 7) - 1));
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    return this.events().filter((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end ?? event.start);

      if (dateFilter === 'past') {
        if (end.getTime() >= now.getTime()) return false;
      } else {
        if (end.getTime() < now.getTime()) return false;
        if (dateFilter === 'today' && start.getTime() > endOfToday.getTime()) return false;
        if (dateFilter === 'week' && start.getTime() > endOfWeek.getTime()) return false;
        if (dateFilter === 'month' && start.getTime() > endOfMonth.getTime()) return false;
      }

      if (category !== 'all' && event.category !== category) return false;

      if (q) {
        const haystack = [event.title, event.description, event.venue, event.address, ...(event.tags ?? [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  constructor() {
    effect(() => {
      const slug = this.slug();
      if (slug) {
        void this.load(slug);
      }
    });
  }

  private async load(slug: string): Promise<void> {
    this.loaded.set(false);
    this.error.set(null);
    try {
      const city = await this.eventsService.getCity(slug);
      if (!city) {
        this.error.set('We don’t cover this city yet.');
        return;
      }
      this.city.set(city);
      this.titleService.setTitle(`${city.name} events — everything happening in ${city.name}`);
      const data = await this.eventsService.getCityEvents(slug);
      this.events.set(data.events);
      this.updatedAt.set(data.updatedAt);
    } catch {
      this.error.set('Could not load events for this city. Please try again later.');
    } finally {
      this.loaded.set(true);
    }
  }
}
