import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';

import { siteConfig } from '@/config/site';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bricolage',
  axes: ['opsz'],
});

// One variable file instead of four static weights: fewer requests and fewer bytes.
const figtree = Figtree({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-figtree',
});

const title = 'BlinkRest: restaurant management and QR ordering for India';
const description =
  'Orders, menu, tables, staff and payments in one app for owners, managers and kitchen teams. Guests scan a table QR to order and pay. Available on iPhone and Android.';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title,
  description,
  applicationName: 'BlinkRest',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'BlinkRest',
    title: 'BlinkRest: your restaurant, one blink away',
    description,
    url: '/',
    images: [{ url: '/video/brand-film-poster.jpg', width: 720, height: 1280, alt: 'BlinkRest brand film' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/video/brand-film-poster.jpg'] },
};

export const viewport: Viewport = {
  themeColor: '#1B1716',
  width: 'device-width',
  initialScale: 1,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'BlinkRest',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'iOS, Android',
  description,
  url: siteConfig.siteUrl,
  publisher: { '@type': 'Organization', name: 'InfusioTech', url: 'https://www.infusiotech.com' },
  offers: [
    { '@type': 'Offer', price: '999', priceCurrency: 'INR', description: 'Monthly, excluding GST' },
    { '@type': 'Offer', price: '9999', priceCurrency: 'INR', description: 'Yearly, excluding GST' },
  ],
};

// Runs before first paint. Browsers without scroll-driven animations get the
// IntersectionObserver fallback (see ScrollEffects), and visitors who prefer
// reduced motion get everything shown at once.
const noSdaScript =
  "try{if(!CSS.supports('animation-timeline','view()')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('no-sda')}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${figtree.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noSdaScript }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
