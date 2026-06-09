import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CATEGORY_ICONS, CATEGORY_LABELS, EventItem } from '../../models/event.model';

@Component({
  selector: 'app-event-card',
  imports: [DatePipe, RouterLink],
  templateUrl: './event-card.html',
  styleUrl: './event-card.css',
})
export class EventCard {
  readonly event = input.required<EventItem>();
  readonly citySlug = input.required<string>();

  protected readonly icon = computed(() => CATEGORY_ICONS[this.event().category] ?? '📌');
  protected readonly categoryLabel = computed(
    () => CATEGORY_LABELS[this.event().category] ?? 'Other',
  );
  protected readonly isPast = computed(() => {
    const end = this.event().end ?? this.event().start;
    return new Date(end).getTime() < Date.now();
  });
  protected readonly month = computed(() =>
    new Date(this.event().start).toLocaleString('en', { month: 'short' }),
  );
  protected readonly day = computed(() => new Date(this.event().start).getDate());
}
