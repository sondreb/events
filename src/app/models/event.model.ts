export interface City {
  slug: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  timezone: string;
  description: string;
}

export type EventCategory =
  | 'music'
  | 'culture'
  | 'sports'
  | 'food'
  | 'family'
  | 'market'
  | 'festival'
  | 'community'
  | 'nightlife'
  | 'tech'
  | 'other';

export interface EventItem {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  /** ISO 8601 start date/time */
  start: string;
  /** ISO 8601 end date/time */
  end?: string;
  venue?: string;
  address?: string;
  lat?: number;
  lon?: number;
  /** Free-form price text, e.g. "Free" or "€15" */
  price?: string;
  /** Link to the original source of the event */
  url?: string;
  /** Name of the source the event was discovered from */
  source?: string;
  image?: string;
  tags?: string[];
}

export interface CityEvents {
  citySlug: string;
  updatedAt: string;
  events: EventItem[];
}

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  music: 'Music',
  culture: 'Culture',
  sports: 'Sports',
  food: 'Food & Drink',
  family: 'Family',
  market: 'Markets',
  festival: 'Festivals',
  community: 'Community',
  nightlife: 'Nightlife',
  tech: 'Tech',
  other: 'Other',
};

export const CATEGORY_ICONS: Record<EventCategory, string> = {
  music: '🎵',
  culture: '🎭',
  sports: '⚽',
  food: '🍽️',
  family: '👨‍👩‍👧',
  market: '🛍️',
  festival: '🎪',
  community: '🤝',
  nightlife: '🌙',
  tech: '💻',
  other: '📌',
};
