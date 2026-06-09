import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { CATEGORY_ICONS, CATEGORY_LABELS, City, EventItem } from '../../models/event.model';
import { EventsService } from '../../services/events.service';
import { downloadIcs, googleCalendarUrl } from '../../services/calendar';

@Component({
  selector: 'app-event-detail',
  imports: [DatePipe, RouterLink],
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.css',
})
export class EventDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly eventsService = inject(EventsService);
  private readonly titleService = inject(Title);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly slug = toSignal(this.route.paramMap.pipe(map((p) => p.get('slug') ?? '')), {
    initialValue: '',
  });
  protected readonly eventId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });

  protected readonly city = signal<City | null>(null);
  protected readonly event = signal<EventItem | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly icon = computed(() => {
    const e = this.event();
    return e ? (CATEGORY_ICONS[e.category] ?? '📌') : '';
  });
  protected readonly categoryLabel = computed(() => {
    const e = this.event();
    return e ? (CATEGORY_LABELS[e.category] ?? 'Other') : '';
  });
  protected readonly isPast = computed(() => {
    const e = this.event();
    if (!e) return false;
    return new Date(e.end ?? e.start).getTime() < Date.now();
  });

  protected readonly endFormat = computed(() => {
    const e = this.event();
    if (!e?.end) return 'HH:mm';
    const sameDay = new Date(e.start).toDateString() === new Date(e.end).toDateString();
    return sameDay ? 'HH:mm' : 'EEEE d MMMM y, HH:mm';
  });

  protected readonly location = computed(() => {
    const e = this.event();
    if (!e) return '';
    return [e.venue, e.address].filter(Boolean).join(' · ');
  });

  protected readonly pageUrl = computed(() => {
    const e = this.event();
    return e ? `https://events.librevore.me/city/${this.slug()}/event/${e.id}` : '';
  });

  protected readonly googleUrl = computed(() => {
    const e = this.event();
    return e ? googleCalendarUrl(e, this.pageUrl()) : '';
  });

  protected readonly mapEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const e = this.event();
    if (!e || e.lat == null || e.lon == null) return null;
    const d = 0.006;
    const bbox = `${e.lon - d},${e.lat - d},${e.lon + d},${e.lat + d}`;
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${e.lat}%2C${e.lon}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly mapLink = computed(() => {
    const e = this.event();
    if (!e || e.lat == null || e.lon == null) return null;
    return `https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=17/${e.lat}/${e.lon}`;
  });

  constructor() {
    effect(() => {
      const slug = this.slug();
      const id = this.eventId();
      if (slug && id) {
        void this.load(slug, id);
      }
    });
  }

  private async load(slug: string, id: string): Promise<void> {
    this.error.set(null);
    try {
      const [city, data] = await Promise.all([
        this.eventsService.getCity(slug),
        this.eventsService.getCityEvents(slug),
      ]);
      if (!city) {
        this.error.set('We don’t cover this city yet.');
        return;
      }
      this.city.set(city);
      const event = data.events.find((e) => e.id === id);
      if (!event) {
        this.error.set('This event could not be found — it may have been removed.');
        return;
      }
      this.event.set(event);
      this.titleService.setTitle(`${event.title} — ${city.name} events`);
    } catch {
      this.error.set('Could not load this event. Please try again later.');
    }
  }

  protected addToCalendar(): void {
    const e = this.event();
    if (e) {
      downloadIcs(e, this.pageUrl());
    }
  }

  protected async share(): Promise<void> {
    const e = this.event();
    if (!e) return;
    const shareData = {
      title: e.title,
      text: `${e.title} — ${new Date(e.start).toLocaleString()}`,
      url: this.pageUrl(),
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // fall through to clipboard copy when the user cancels or share fails
      }
    }
    await navigator.clipboard.writeText(this.pageUrl());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
