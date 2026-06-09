import { EventItem } from '../models/event.model';

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function defaultEnd(start: string): string {
  const d = new Date(start);
  d.setHours(d.getHours() + 2);
  return d.toISOString();
}

/** Builds an RFC 5545 iCalendar file for a single event. */
export function buildIcs(event: EventItem, pageUrl: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//events.librevore.me//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@events.librevore.me`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(event.start)}`,
    `DTEND:${toIcsDate(event.end ?? defaultEnd(event.start))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description + '\n\n' + pageUrl)}`,
  ];
  const location = [event.venue, event.address].filter(Boolean).join(', ');
  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }
  if (event.lat != null && event.lon != null) {
    lines.push(`GEO:${event.lat};${event.lon}`);
  }
  lines.push(`URL:${pageUrl}`, 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/** Triggers a download of an .ics file for the event. */
export function downloadIcs(event: EventItem, pageUrl: string): void {
  const blob = new Blob([buildIcs(event, pageUrl)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Builds a Google Calendar "add event" URL. */
export function googleCalendarUrl(event: EventItem, pageUrl: string): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toIcsDate(event.start)}/${toIcsDate(event.end ?? defaultEnd(event.start))}`,
    details: `${event.description}\n\n${pageUrl}`,
  });
  const location = [event.venue, event.address].filter(Boolean).join(', ');
  if (location) {
    params.set('location', location);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
