import type { EventItem } from '../models/event.model';

const FALLBACK_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

export function scheduledEventEnd(event: Pick<EventItem, 'start' | 'end'>): number {
  return event.end
    ? new Date(event.end).getTime()
    : new Date(event.start).getTime() + FALLBACK_EVENT_DURATION_MS;
}

export function endOfLocalDay(time: number): number {
  const date = new Date(time);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function eventActiveUntil(event: Pick<EventItem, 'start' | 'end'>): number {
  const start = new Date(event.start).getTime();
  return Math.max(scheduledEventEnd(event), endOfLocalDay(start));
}

export function isEventPast(event: Pick<EventItem, 'start' | 'end'>, now = Date.now()): boolean {
  return eventActiveUntil(event) < now;
}