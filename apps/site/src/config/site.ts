// Everything you need to fill in before launch lives here.
//
// Replace the three bracketed placeholders below, or set the matching
// NEXT_PUBLIC_* environment variable in your host and leave this file alone.

export const siteConfig = {
  /** Apple App Store listing, for example https://apps.apple.com/in/app/blinkrest/id0000000000 */
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL ?? '[APP STORE LINK]',

  /** Google Play listing, for example https://play.google.com/store/apps/details?id=com.infusiotech.blinkrest */
  playStoreUrl: process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? '[PLAY STORE LINK]',

  /** Shown in the footer. Becomes a mailto: link once it is a real address. */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '[YOUR SUPPORT EMAIL]',

  // Not placeholders: where these pages live on blinkrest.com.
  loginUrl: process.env.NEXT_PUBLIC_LOGIN_URL ?? '/login',
  termsUrl: process.env.NEXT_PUBLIC_TERMS_URL ?? '/terms',
  privacyUrl: process.env.NEXT_PUBLIC_PRIVACY_URL ?? '/privacy',

  /** Canonical site address, used for metadata and social cards. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://blinkrest.com',
} as const;

/** True once a value has been filled in (a placeholder looks like [LIKE THIS]). */
export function isFilled(value: string): boolean {
  return !/^\[.*\]$/.test(value.trim());
}

/**
 * Where a store button goes. While a store link is still a placeholder, the
 * button opens an email to support asking for the link, so the live site never
 * has a dead button. Falls back to the download section if there is no email.
 */
function storeHref(url: string, subject: string): string {
  if (isFilled(url)) return url;
  return isFilled(siteConfig.supportEmail)
    ? `mailto:${siteConfig.supportEmail}?subject=${encodeURIComponent(subject)}`
    : '#download';
}
export const appStoreHref = () => storeHref(siteConfig.appStoreUrl, 'BlinkRest for iPhone');
export const playStoreHref = () => storeHref(siteConfig.playStoreUrl, 'BlinkRest for Android');

/** Email link for the footer, or null while the address is still a placeholder. */
export function supportMailto(): string | null {
  return isFilled(siteConfig.supportEmail) ? `mailto:${siteConfig.supportEmail}` : null;
}
