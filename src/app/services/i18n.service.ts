import { Injectable, computed, signal } from '@angular/core';
import { eventActiveUntil, scheduledEventEnd } from './event-time';

export type Locale = 'en' | 'me' | 'ru';

const STORAGE_KEY = 'events.locale';

const TRANSLATIONS: Record<Locale, Record<string, string>> = {
  en: {
    'nav.cities': 'Cities',
    'nav.about': 'About',
    'theme.light': 'Switch to light mode',
    'theme.dark': 'Switch to dark mode',
    'lang.label': 'Language',

    'hero.line1': 'Everything that happens',
    'hero.line2': 'in your city.',
    'hero.sub':
      "Events are scattered across Facebook, Meetup, Eventbrite, local sites and posters on lampposts. We gather them all in one place — updated every day.",
    'hero.search': 'Search for your city…',

    'home.upcoming': '{n} upcoming',
    'home.explore': 'Explore events →',
    'home.noMatch': 'No city matches “{q}” yet. Want your city added?',
    'home.request': 'Request it on GitHub',
    'home.fav.title': '⭐ Your starred events',
    'home.fav.empty': 'Star events you care about and they will show up here with a countdown.',
    'home.fav.upcoming': 'Upcoming',
    'home.fav.expired': 'Expired',
    'home.fav.noExpired': 'No expired starred events.',

    'how.title': 'How it works',
    'how.1.title': 'We search everywhere',
    'how.1.text':
      "An agent scans Facebook, Meetup, Eventbrite, municipal sites and local sources every day so you don't have to.",
    'how.2.title': 'We tidy it up',
    'how.2.text':
      'Duplicates are merged, dates and venues are normalised, and every event gets mapped and categorised.',
    'how.3.title': 'You just show up',
    'how.3.text':
      'Browse, filter, add events to your calendar and share them with friends — all in one fast, free website.',

    'err.cities': 'Could not load the list of cities. Please try again later.',

    'city.all': 'All cities',
    'city.updated': 'Last updated',
    'city.search': 'Search events, venues, tags…',
    'city.count.one': '1 event',
    'city.count.many': '{n} events',
    'city.empty': 'No events match your filters. Try widening the date range or clearing the search.',
    'city.none':
      'No events listed here yet. Our agent gathers new events from local sources every day — check back soon.',
    'city.notCovered': 'We don’t cover this city yet.',
    'city.error': 'Could not load events for this city. Please try again later.',
    'city.browse': 'Browse cities',

    'filter.upcoming': 'Upcoming',
    'filter.today': 'Today',
    'filter.week': 'This week',
    'filter.month': 'This month',
    'filter.past': 'Past',
    'filter.allCats': 'All categories',

    'cat.music': 'Music',
    'cat.culture': 'Culture',
    'cat.sports': 'Sports',
    'cat.food': 'Food & Drink',
    'cat.family': 'Family',
    'cat.market': 'Markets',
    'cat.festival': 'Festivals',
    'cat.community': 'Community',
    'cat.nightlife': 'Nightlife',
    'cat.tech': 'Tech',
    'cat.other': 'Other',

    'ev.addCalendar': 'Add to calendar (.ics)',
    'ev.gcal': 'Google Calendar',
    'ev.share': 'Share',
    'ev.copied': 'Link copied!',
    'ev.source': 'Source',
    'ev.about': 'About this event',
    'ev.where': 'Where to find it',
    'ev.osm': 'Open in OpenStreetMap →',
    'ev.gmaps': 'Open in Google Maps →',
    'ev.past': 'Past event',
    'ev.back': 'Back to events',
    'ev.notFound': 'This event could not be found — it may have been removed.',
    'ev.error': 'Could not load this event. Please try again later.',
    'ev.discovered': 'Discovered via {s}.',
    'ev.fav': 'Save',
    'ev.unfav': 'Saved',
    'ev.favAria': 'Save to favorites',
    'ev.unfavAria': 'Remove from favorites',

    'count.in': 'Starts in {t}',
    'count.ago': 'Ended {t} ago',
    'count.now': 'Happening now',
    'count.today': 'Happening today',
    'unit.d': 'd',
    'unit.h': 'h',
    'unit.m': 'm',
    'unit.s': 's',

    'footer.tagline': '— one place for everything that happens in your city.',
    'footer.open1': 'Event data is aggregated daily from public sources. Open source on',
    'footer.warning':
      '⚠️ Event information may be incomplete, outdated or wrong. Always verify details with the original source before making plans.',

    'about.title': 'About this site',
    'about.intro':
      "Finding out what's happening in your city shouldn't require checking ten different websites, three Facebook groups and a poster wall. events.librevore.me collects events from many sources into one fast, simple website.",
    'about.src.title': 'Where the data comes from',
    'about.src.text':
      'An automated agent runs once a day. It searches public sources — Facebook, Meetup, Eventbrite, municipal and tourism websites, plus city-specific sources — then cleans, deduplicates and categorises what it finds. The result is published as a static dataset, so the site is fast, private and works without a backend.',
    'about.feat.title': 'Features',
    'about.feat.1': 'Browse events by city, category, date and free-text search',
    'about.feat.2': 'Add any event to your calendar (.ics download or Google Calendar)',
    'about.feat.3': 'Share events with one tap',
    'about.feat.4': 'Star your favorite events and see a countdown to them',
    'about.feat.5': 'See every event on a map, with links back to the original source',
    'about.missing.title': 'Your city missing?',
    'about.missing.text': 'The project is open source. Request a new city — or contribute a data source — on',
    'about.company.title': 'Who is behind this',
    'about.company.text':
      'This site is built and run by Librevore, a software development company based in Bar, Montenegro, offering cloud architecture, software development, AI training and DevOps services to clients at home and abroad. Learn more at',
  },

  me: {
    'nav.cities': 'Gradovi',
    'nav.about': 'O sajtu',
    'theme.light': 'Prebaci na svijetli režim',
    'theme.dark': 'Prebaci na tamni režim',
    'lang.label': 'Jezik',

    'hero.line1': 'Sve što se dešava',
    'hero.line2': 'u tvom gradu.',
    'hero.sub':
      'Događaji su rasuti po Facebooku, Meetupu, Eventbriteu, lokalnim sajtovima i plakatima. Mi ih skupljamo na jednom mjestu — ažurirano svakog dana.',
    'hero.search': 'Pronađi svoj grad…',

    'home.upcoming': '{n} predstojećih',
    'home.explore': 'Istraži događaje →',
    'home.noMatch': 'Nijedan grad ne odgovara pretrazi “{q}”. Želiš da dodamo tvoj grad?',
    'home.request': 'Zatraži na GitHubu',
    'home.fav.title': '⭐ Tvoji sačuvani događaji',
    'home.fav.empty': 'Označi zvjezdicom događaje koji te zanimaju i pojaviće se ovdje sa odbrojavanjem.',
    'home.fav.upcoming': 'Predstojeći',
    'home.fav.expired': 'Prošli',
    'home.fav.noExpired': 'Nema prošlih sačuvanih događaja.',

    'how.title': 'Kako funkcioniše',
    'how.1.title': 'Pretražujemo svuda',
    'how.1.text':
      'Agent svakodnevno pretražuje Facebook, Meetup, Eventbrite, opštinske sajtove i lokalne izvore umjesto tebe.',
    'how.2.title': 'Sređujemo podatke',
    'how.2.text':
      'Duplikati se spajaju, datumi i mjesta se normalizuju, a svaki događaj dobija kategoriju i mjesto na mapi.',
    'how.3.title': 'Ti samo dođeš',
    'how.3.text':
      'Pregledaj, filtriraj, dodaj događaje u kalendar i podijeli ih s prijateljima — sve na jednom brzom, besplatnom sajtu.',

    'err.cities': 'Ne mogu da učitam listu gradova. Pokušaj ponovo kasnije.',

    'city.all': 'Svi gradovi',
    'city.updated': 'Posljednje ažuriranje',
    'city.search': 'Pretraži događaje, mjesta, oznake…',
    'city.count.one': '1 događaj',
    'city.count.many': '{n} događaja',
    'city.empty': 'Nijedan događaj ne odgovara filterima. Probaj proširiti period ili obrisati pretragu.',
    'city.none':
      'Ovdje još nema događaja. Naš agent svakodnevno prikuplja nove događaje iz lokalnih izvora — navrati uskoro.',
    'city.notCovered': 'Još ne pokrivamo ovaj grad.',
    'city.error': 'Ne mogu da učitam događaje za ovaj grad. Pokušaj ponovo kasnije.',
    'city.browse': 'Pregledaj gradove',

    'filter.upcoming': 'Predstojeći',
    'filter.today': 'Danas',
    'filter.week': 'Ove sedmice',
    'filter.month': 'Ovog mjeseca',
    'filter.past': 'Prošli',
    'filter.allCats': 'Sve kategorije',

    'cat.music': 'Muzika',
    'cat.culture': 'Kultura',
    'cat.sports': 'Sport',
    'cat.food': 'Hrana i piće',
    'cat.family': 'Porodica',
    'cat.market': 'Pijace',
    'cat.festival': 'Festivali',
    'cat.community': 'Zajednica',
    'cat.nightlife': 'Noćni život',
    'cat.tech': 'Tehnologija',
    'cat.other': 'Ostalo',

    'ev.addCalendar': 'Dodaj u kalendar (.ics)',
    'ev.gcal': 'Google kalendar',
    'ev.share': 'Podijeli',
    'ev.copied': 'Link kopiran!',
    'ev.source': 'Izvor',
    'ev.about': 'O događaju',
    'ev.where': 'Gdje se nalazi',
    'ev.osm': 'Otvori u OpenStreetMap →',
    'ev.gmaps': 'Otvori u Google mapama →',
    'ev.past': 'Prošli događaj',
    'ev.back': 'Nazad na događaje',
    'ev.notFound': 'Ovaj događaj nije pronađen — možda je uklonjen.',
    'ev.error': 'Ne mogu da učitam ovaj događaj. Pokušaj ponovo kasnije.',
    'ev.discovered': 'Pronađeno preko: {s}.',
    'ev.fav': 'Sačuvaj',
    'ev.unfav': 'Sačuvano',
    'ev.favAria': 'Sačuvaj u omiljene',
    'ev.unfavAria': 'Ukloni iz omiljenih',

    'count.in': 'Počinje za {t}',
    'count.ago': 'Završio se prije {t}',
    'count.now': 'Upravo traje',
    'count.today': 'Danas se dešava',
    'unit.d': 'd',
    'unit.h': 'h',
    'unit.m': 'min',
    'unit.s': 's',

    'footer.tagline': '— sve što se dešava u tvom gradu, na jednom mjestu.',
    'footer.open1': 'Podaci o događajima se prikupljaju svakodnevno iz javnih izvora. Otvoreni kod na',
    'footer.warning':
      '⚠️ Informacije o događajima mogu biti nepotpune, zastarjele ili pogrešne. Uvijek provjeri detalje kod originalnog izvora prije planiranja.',

    'about.title': 'O sajtu',
    'about.intro':
      'Da bi saznao šta se dešava u tvom gradu, ne bi trebalo da provjeravaš deset sajtova, tri Facebook grupe i zid sa plakatima. events.librevore.me skuplja događaje iz mnogo izvora na jedan brz i jednostavan sajt.',
    'about.src.title': 'Odakle dolaze podaci',
    'about.src.text':
      'Automatski agent radi jednom dnevno. Pretražuje javne izvore — Facebook, Meetup, Eventbrite, opštinske i turističke sajtove i izvore specifične za grad — zatim čisti, uklanja duplikate i kategorizuje pronađeno. Rezultat se objavljuje kao statički skup podataka, pa je sajt brz, privatan i radi bez servera.',
    'about.feat.title': 'Mogućnosti',
    'about.feat.1': 'Pregledaj događaje po gradu, kategoriji, datumu i pretrazi',
    'about.feat.2': 'Dodaj bilo koji događaj u kalendar (.ics ili Google kalendar)',
    'about.feat.3': 'Podijeli događaje jednim klikom',
    'about.feat.4': 'Sačuvaj omiljene događaje i prati odbrojavanje do njih',
    'about.feat.5': 'Vidi svaki događaj na mapi, sa linkom ka originalnom izvoru',
    'about.missing.title': 'Nema tvog grada?',
    'about.missing.text': 'Projekat je otvorenog koda. Zatraži novi grad — ili doprinesi izvorom podataka — na',
    'about.company.title': 'Ko stoji iza ovoga',
    'about.company.text':
      'Ovaj sajt razvija i održava Librevore, kompanija za razvoj softvera sa sjedištem u Baru, Crna Gora, koja nudi usluge cloud arhitekture, razvoja softvera, AI obuke i DevOps-a klijentima u zemlji i inostranstvu. Saznaj više na',
  },

  ru: {
    'nav.cities': 'Города',
    'nav.about': 'О сайте',
    'theme.light': 'Включить светлую тему',
    'theme.dark': 'Включить тёмную тему',
    'lang.label': 'Язык',

    'hero.line1': 'Всё, что происходит',
    'hero.line2': 'в твоём городе.',
    'hero.sub':
      'События разбросаны по Facebook, Meetup, Eventbrite, местным сайтам и афишам. Мы собираем их в одном месте — обновляется каждый день.',
    'hero.search': 'Найди свой город…',

    'home.upcoming': 'впереди: {n}',
    'home.explore': 'Смотреть события →',
    'home.noMatch': 'Ни один город не подходит под запрос «{q}». Хочешь добавить свой город?',
    'home.request': 'Запросить на GitHub',
    'home.fav.title': '⭐ Твои избранные события',
    'home.fav.empty': 'Отмечай интересные события звёздочкой — они появятся здесь с обратным отсчётом.',
    'home.fav.upcoming': 'Предстоящие',
    'home.fav.expired': 'Прошедшие',
    'home.fav.noExpired': 'Нет прошедших избранных событий.',

    'how.title': 'Как это работает',
    'how.1.title': 'Мы ищем везде',
    'how.1.text':
      'Агент ежедневно сканирует Facebook, Meetup, Eventbrite, муниципальные сайты и местные источники — вместо тебя.',
    'how.2.title': 'Мы наводим порядок',
    'how.2.text':
      'Дубликаты объединяются, даты и места нормализуются, каждое событие получает категорию и отметку на карте.',
    'how.3.title': 'Тебе остаётся прийти',
    'how.3.text':
      'Просматривай, фильтруй, добавляй события в календарь и делись с друзьями — всё на одном быстром бесплатном сайте.',

    'err.cities': 'Не удалось загрузить список городов. Попробуй позже.',

    'city.all': 'Все города',
    'city.updated': 'Последнее обновление',
    'city.search': 'Поиск событий, мест, тегов…',
    'city.count.one': '1 событие',
    'city.count.many': 'Событий: {n}',
    'city.empty': 'Ни одно событие не подходит под фильтры. Попробуй расширить период или очистить поиск.',
    'city.none':
      'Здесь пока нет событий. Наш агент ежедневно собирает новые события из местных источников — загляни позже.',
    'city.notCovered': 'Этот город мы пока не охватываем.',
    'city.error': 'Не удалось загрузить события этого города. Попробуй позже.',
    'city.browse': 'Смотреть города',

    'filter.upcoming': 'Предстоящие',
    'filter.today': 'Сегодня',
    'filter.week': 'На этой неделе',
    'filter.month': 'В этом месяце',
    'filter.past': 'Прошедшие',
    'filter.allCats': 'Все категории',

    'cat.music': 'Музыка',
    'cat.culture': 'Культура',
    'cat.sports': 'Спорт',
    'cat.food': 'Еда и напитки',
    'cat.family': 'Семья',
    'cat.market': 'Рынки',
    'cat.festival': 'Фестивали',
    'cat.community': 'Сообщество',
    'cat.nightlife': 'Ночная жизнь',
    'cat.tech': 'Технологии',
    'cat.other': 'Другое',

    'ev.addCalendar': 'Добавить в календарь (.ics)',
    'ev.gcal': 'Google Календарь',
    'ev.share': 'Поделиться',
    'ev.copied': 'Ссылка скопирована!',
    'ev.source': 'Источник',
    'ev.about': 'О событии',
    'ev.where': 'Где это находится',
    'ev.osm': 'Открыть в OpenStreetMap →',
    'ev.gmaps': 'Открыть в Google Картах →',
    'ev.past': 'Прошедшее событие',
    'ev.back': 'Назад к событиям',
    'ev.notFound': 'Событие не найдено — возможно, оно было удалено.',
    'ev.error': 'Не удалось загрузить это событие. Попробуй позже.',
    'ev.discovered': 'Найдено через: {s}.',
    'ev.fav': 'Сохранить',
    'ev.unfav': 'Сохранено',
    'ev.favAria': 'Добавить в избранное',
    'ev.unfavAria': 'Убрать из избранного',

    'count.in': 'Начнётся через {t}',
    'count.ago': 'Закончилось {t} назад',
    'count.now': 'Идёт прямо сейчас',
    'count.today': 'Сегодня',
    'unit.d': 'д',
    'unit.h': 'ч',
    'unit.m': 'мин',
    'unit.s': 'с',

    'footer.tagline': '— всё, что происходит в твоём городе, в одном месте.',
    'footer.open1': 'Данные о событиях ежедневно собираются из открытых источников. Открытый код на',
    'footer.warning':
      '⚠️ Информация о событиях может быть неполной, устаревшей или неверной. Всегда проверяй детали у первоисточника, прежде чем строить планы.',

    'about.title': 'О сайте',
    'about.intro':
      'Чтобы узнать, что происходит в городе, не нужно проверять десять сайтов, три группы в Facebook и стену с афишами. events.librevore.me собирает события из множества источников на одном быстром и простом сайте.',
    'about.src.title': 'Откуда данные',
    'about.src.text':
      'Автоматический агент запускается раз в день. Он ищет по открытым источникам — Facebook, Meetup, Eventbrite, муниципальным и туристическим сайтам, а также городским источникам, — затем очищает, убирает дубликаты и распределяет по категориям. Результат публикуется как статический набор данных, поэтому сайт быстрый, приватный и работает без сервера.',
    'about.feat.title': 'Возможности',
    'about.feat.1': 'Просматривай события по городу, категории, дате и через поиск',
    'about.feat.2': 'Добавляй события в календарь (.ics или Google Календарь)',
    'about.feat.3': 'Делись событиями в одно касание',
    'about.feat.4': 'Сохраняй избранные события и следи за обратным отсчётом',
    'about.feat.5': 'Смотри каждое событие на карте со ссылкой на первоисточник',
    'about.missing.title': 'Нет твоего города?',
    'about.missing.text': 'Проект с открытым кодом. Запроси новый город — или добавь источник данных — на',
    'about.company.title': 'Кто за этим стоит',
    'about.company.text':
      'Этот сайт создан и поддерживается компанией Librevore — разработчиком программного обеспечения из Бара, Черногория. Компания предлагает услуги облачной архитектуры, разработки ПО, обучения ИИ и DevOps клиентам в стране и за рубежом. Узнай больше на',
  },
};

export const LOCALE_OPTIONS: { code: Locale; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'me', label: 'Crnogorski', short: 'ME' },
  { code: 'ru', label: 'Русский', short: 'RU' },
];

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'me' || stored === 'ru') {
      return stored;
    }
  } catch {
    // localStorage unavailable — fall through to browser detection
  }
  for (const lang of navigator.languages ?? [navigator.language]) {
    if (/^ru\b/i.test(lang)) return 'ru';
    if (/^(cnr|sr|me|bs|hr|sh)\b/i.test(lang)) return 'me';
    if (/^en\b/i.test(lang)) return 'en';
  }
  return 'en';
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<Locale>(detectLocale());
  readonly options = LOCALE_OPTIONS;

  /** Locale id for Angular's DatePipe (must be registered in app.config). */
  readonly dateLocale = computed(() => {
    const l = this.locale();
    return l === 'me' ? 'sr-Latn' : l === 'ru' ? 'ru' : 'en-US';
  });

  /** Locale for Intl APIs (month names etc.). */
  readonly intlLocale = computed(() => {
    const l = this.locale();
    return l === 'me' ? 'sr-Latn-ME' : l === 'ru' ? 'ru' : 'en';
  });

  constructor() {
    this.applyHtmlLang(this.locale());
  }

  setLocale(locale: Locale): void {
    this.locale.set(locale);
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore storage failures
    }
    this.applyHtmlLang(locale);
  }

  t(key: string, params?: Record<string, string | number>): string {
    const dict = TRANSLATIONS[this.locale()];
    let text = dict[key] ?? TRANSLATIONS.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }

  /** Formats a millisecond duration like "3d 4h" using translated unit labels. */
  duration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86_400);
    const h = Math.floor((total % 86_400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const u = (k: string) => this.t(`unit.${k}`);
    if (d > 0) return `${d}${u('d')} ${h}${u('h')}`;
    if (h > 0) return `${h}${u('h')} ${m}${u('m')}`;
    if (m > 0) return `${m}${u('m')} ${s}${u('s')}`;
    return `${s}${u('s')}`;
  }

  /** "Starts in 3d 4h" / "Happening now" / "Ended 2h 10m ago" for an event. */
  eventTiming(startIso: string, endIso: string | undefined, now: number): string {
    const event = { start: startIso, end: endIso };
    const start = new Date(startIso).getTime();
    const scheduledEnd = scheduledEventEnd(event);
    const activeUntil = eventActiveUntil(event);
    if (now < start) return this.t('count.in', { t: this.duration(start - now) });
    if (now <= scheduledEnd) return this.t('count.now');
    if (now <= activeUntil) return this.t('count.today');
    return this.t('count.ago', { t: this.duration(now - activeUntil) });
  }

  /** Returns the event's title in the active locale, falling back to English. */
  eventTitle(event: { title: string; t?: Partial<Record<string, { title: string }>> }): string {
    const locale = this.locale();
    if (locale === 'en') return event.title;
    return event.t?.[locale]?.title ?? event.title;
  }

  /** Returns the event's description in the active locale, falling back to English. */
  eventDescription(event: {
    description: string;
    t?: Partial<Record<string, { description: string }>>;
  }): string {
    const locale = this.locale();
    if (locale === 'en') return event.description;
    return event.t?.[locale]?.description ?? event.description;
  }

  private applyHtmlLang(locale: Locale): void {
    document.documentElement.lang = locale === 'me' ? 'cnr' : locale;
  }
}
