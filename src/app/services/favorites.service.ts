import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'events.favorites';

function favKey(citySlug: string, eventId: string): string {
  return `${citySlug}::${eventId}`;
}

function load(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((x) => typeof x === 'string'));
      }
    }
  } catch {
    // corrupted or unavailable storage — start fresh
  }
  return new Set();
}

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  readonly favorites = signal<ReadonlySet<string>>(load());

  isFavorite(citySlug: string, eventId: string): boolean {
    return this.favorites().has(favKey(citySlug, eventId));
  }

  toggle(citySlug: string, eventId: string): void {
    const next = new Set(this.favorites());
    const key = favKey(citySlug, eventId);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.favorites.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // ignore storage failures
    }
  }

  /** Returns favorites as { citySlug, eventId } pairs. */
  entries(): { citySlug: string; eventId: string }[] {
    return [...this.favorites()].map((key) => {
      const idx = key.indexOf('::');
      return { citySlug: key.slice(0, idx), eventId: key.slice(idx + 2) };
    });
  }
}
