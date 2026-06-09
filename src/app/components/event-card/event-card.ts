import { Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CATEGORY_ICONS, EventItem } from '../../models/event.model';
import { FavoritesService } from '../../services/favorites.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-event-card',
  imports: [DatePipe, RouterLink],
  templateUrl: './event-card.html',
  styleUrl: './event-card.css',
})
export class EventCard {
  readonly event = input.required<EventItem>();
  readonly citySlug = input.required<string>();

  protected readonly i18n = inject(I18nService);
  private readonly favoritesService = inject(FavoritesService);

  protected readonly icon = computed(() => CATEGORY_ICONS[this.event().category] ?? '📌');
  protected readonly isPast = computed(() => {
    const end = this.event().end ?? this.event().start;
    return new Date(end).getTime() < Date.now();
  });
  protected readonly month = computed(() =>
    new Date(this.event().start).toLocaleString(this.i18n.intlLocale(), { month: 'short' }),
  );
  protected readonly day = computed(() => new Date(this.event().start).getDate());

  /** True when the event spans more than one calendar day. */
  protected readonly isMultiDay = computed(() => {
    const e = this.event();
    if (!e.end) return false;
    return new Date(e.start).toDateString() !== new Date(e.end).toDateString();
  });

  protected readonly endDay = computed(() => new Date(this.event().end ?? '').getDate());
  protected readonly endMonth = computed(() =>
    new Date(this.event().end ?? '').toLocaleString(this.i18n.intlLocale(), { month: 'short' }),
  );

  protected readonly isFavorite = computed(() => {
    this.favoritesService.favorites();
    return this.favoritesService.isFavorite(this.citySlug(), this.event().id);
  });

  protected toggleFavorite(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.favoritesService.toggle(this.citySlug(), this.event().id);
  }
}
