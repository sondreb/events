import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { CATEGORY_ICONS, City, EventItem } from '../../models/event.model';
import { EventsService } from '../../services/events.service';
import { FavoritesService } from '../../services/favorites.service';
import { ClockService } from '../../services/clock.service';
import { I18nService } from '../../services/i18n.service';
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
  private readonly favoritesService = inject(FavoritesService);
  private readonly clock = inject(ClockService);
  protected readonly i18n = inject(I18nService);

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

  protected readonly isPast = computed(() => {
    const e = this.event();
    if (!e) return false;
    return new Date(e.end ?? e.start).getTime() < this.clock.now();
  });

  /** Live countdown / time-ago line, ticking every second. */
  protected readonly timing = computed(() => {
    const e = this.event();
    if (!e) return '';
    return this.i18n.eventTiming(e.start, e.end, this.clock.now());
  });

  protected readonly isFavorite = computed(() => {
    this.favoritesService.favorites();
    const e = this.event();
    return e ? this.favoritesService.isFavorite(this.slug(), e.id) : false;
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

  /** Full location string used for address-based map fallback. */
  private readonly mapQuery = computed(() => {
    const e = this.event();
    const city = this.city();
    if (!e) return null;
    const parts = [e.venue, e.address].filter(Boolean);
    if (parts.length === 0) return null;
    // Append the city name to disambiguate when the address lacks it.
    const query = parts.join(', ');
    return city && !query.toLowerCase().includes(city.name.toLowerCase())
      ? `${query}, ${city.name}, ${city.country}`
      : query;
  });

  protected readonly mapEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const e = this.event();
    if (!e) return null;
    if (e.lat != null && e.lon != null) {
      const d = 0.006;
      const bbox = `${e.lon - d},${e.lat - d},${e.lon + d},${e.lat + d}`;
      const url = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${e.lat}%2C${e.lon}`;
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
    // No coordinates — fall back to an address-search map embed.
    const query = this.mapQuery();
    if (!query) return null;
    const url = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly mapLink = computed(() => {
    const e = this.event();
    if (!e) return null;
    if (e.lat != null && e.lon != null) {
      return `https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=17/${e.lat}/${e.lon}`;
    }
    const query = this.mapQuery();
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
  });

  /** True when the map uses coordinates (OSM); false when address-based (Google). */
  protected readonly mapIsOsm = computed(() => {
    const e = this.event();
    return !!e && e.lat != null && e.lon != null;
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
        this.error.set(this.i18n.t('city.notCovered'));
        return;
      }
      this.city.set(city);
      const event = data.events.find((e) => e.id === id);
      if (!event) {
        this.error.set(this.i18n.t('ev.notFound'));
        return;
      }
      this.event.set(event);
      this.titleService.setTitle(`${event.title} — ${city.name}`);
    } catch {
      this.error.set(this.i18n.t('ev.error'));
    }
  }

  protected toggleFavorite(): void {
    const e = this.event();
    if (e) {
      this.favoritesService.toggle(this.slug(), e.id);
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
      text: `${e.title} — ${new Date(e.start).toLocaleString(this.i18n.intlLocale())}`,
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
