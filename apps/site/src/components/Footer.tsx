import { appStoreHref, playStoreHref, siteConfig, supportMailto } from '@/config/site';

import { LogoMark, Wordmark } from './Icons';

function SupportEmail({ className = '' }: { className?: string }) {
  const href = supportMailto();
  return href ? (
    <a href={href} className={`text-ink-2 no-underline ${className}`}>
      {siteConfig.supportEmail}
    </a>
  ) : (
    <span className={`text-ink-2 ${className}`}>{siteConfig.supportEmail}</span>
  );
}

const link = 'text-ink-2 no-underline hover:text-coral-600';

export function Footer() {
  return (
    <footer className="border-t border-line bg-cream text-ink">
      {/* Desktop */}
      <div className="mx-auto hidden max-w-[1240px] flex-wrap items-start justify-between gap-8 px-6 py-12 md:flex">
        <div className="flex max-w-[320px] flex-col gap-3">
          <span className="flex items-center gap-2.5">
            <LogoMark size={28} bolt="#1B1716" />
            <Wordmark className="text-xl" accent="text-[#F9552F]" />
          </span>
          <p className="text-sm leading-[1.6] text-ink-3">
            The restaurant operating system for Indian owners, managers and kitchen teams. A product by InfusioTech.
          </p>
        </div>
        <div className="flex flex-wrap gap-12">
          <div className="flex flex-col gap-2.5 text-[15px]">
            <span className="font-bold">Product</span>
            <a className={link} href="#features">Features</a>
            <a className={link} href="#roles">For your team</a>
            <a className={link} href="#pricing">Pricing</a>
          </div>
          <div className="flex flex-col gap-2.5 text-[15px]">
            <span className="font-bold">Download</span>
            <a className={link} href={appStoreHref()}>App Store (iPhone)</a>
            <a className={link} href={playStoreHref()}>Google Play (Android)</a>
          </div>
          <div className="flex flex-col gap-2.5 text-[15px]">
            <span className="font-bold">Support</span>
            <a className={link} href="#faq">FAQ</a>
            <span className="text-ink-2">9 AM – 11 PM, all days</span>
            <SupportEmail />
          </div>
          <div className="flex flex-col gap-2.5 text-[15px]">
            <span className="font-bold">Legal</span>
            <a className={link} href={siteConfig.termsUrl}>Terms</a>
            <a className={link} href={siteConfig.privacyUrl}>Privacy Policy</a>
          </div>
        </div>
      </div>
      <div className="mx-auto hidden max-w-[1240px] border-t border-line px-6 pb-8 pt-5 text-[13px] text-ink-3 md:block">
        © 2026 InfusioTech. All rights reserved.
      </div>

      {/* Phones. Bottom padding keeps the fixed download bar clear of the last line. */}
      <div className="flex flex-col gap-5 px-5 pb-[120px] pt-8 md:hidden">
        <span className="flex items-center gap-2">
          <LogoMark size={26} bolt="#1B1716" />
          <Wordmark className="text-[19px]" accent="text-[#F9552F]" />
        </span>
        <p className="text-sm leading-[1.6] text-ink-3">
          The restaurant operating system for Indian owners, managers and kitchen teams. A product by InfusioTech.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[15px]">
          <a className={`${link} min-h-8`} href="#features">Features</a>
          <a className={`${link} min-h-8`} href="#pricing">Pricing</a>
          <a className={`${link} min-h-8`} href="#faq">FAQ</a>
          <SupportEmail />
          <a className={`${link} min-h-8`} href={siteConfig.termsUrl}>Terms</a>
          <a className={`${link} min-h-8`} href={siteConfig.privacyUrl}>Privacy Policy</a>
        </div>
        <p className="text-xs text-ink-3">© 2026 InfusioTech. All rights reserved.</p>
      </div>
    </footer>
  );
}
