import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeRu from '@angular/common/locales/ru';
import localeSrLatn from '@angular/common/locales/sr-Latn';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

registerLocaleData(localeRu);
registerLocaleData(localeSrLatn);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
  ],
};
