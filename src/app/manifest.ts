import { appLocale, appName } from '@/lib/i18n';
import type { MetadataRoute } from 'next';

/**
 * Web app manifest (/manifest.webmanifest). Colors match the canvas and viewport.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName,
    short_name: appName,
    lang: appLocale,
    description: 'Sistema de recrutamento e seleção.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F4F2',
    theme_color: '#F5F4F2',
    icons: [
      { src: '/brand/rga/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/rga/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/brand/rga/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
