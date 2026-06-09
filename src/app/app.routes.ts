import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
    title: 'Events — Discover what happens in your city',
  },
  {
    path: 'city/:slug',
    loadComponent: () => import('./pages/city/city').then((m) => m.CityPage),
  },
  {
    path: 'city/:slug/event/:id',
    loadComponent: () => import('./pages/event-detail/event-detail').then((m) => m.EventDetailPage),
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about').then((m) => m.AboutPage),
    title: 'About — Events',
  },
  { path: '**', redirectTo: '' },
];
