import { siteConfig } from '@/config/site';

import { LogoMark, Wordmark } from './Icons';
import { MobileMenu } from './MobileMenu';

const links = [
  { href: '#demo', label: 'Demo' },
  { href: '#features', label: 'Features' },
  { href: '#roles', label: 'For your team' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-ink/[0.78] backdrop-blur-[14px] md:bg-ink/[0.72]">
      <nav
        aria-label="Main"
        className="relative mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-2.5 md:gap-6 md:px-6 md:py-3.5"
      >
        <a
          href="#top"
          aria-label="BlinkRest home"
          className="flex min-h-11 items-center gap-2 text-white no-underline md:gap-2.5"
        >
          <span className="md:hidden">
            <LogoMark size={28} />
          </span>
          <span className="hidden md:block">
            <LogoMark size={32} />
          </span>
          <Wordmark className="text-xl text-white md:text-[22px]" />
        </a>

        <div className="ml-6 hidden gap-7 text-[15px] font-semibold lg:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sand no-underline hover:text-white">
              {link.label}
            </a>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <a
            href={siteConfig.loginUrl}
            className="hidden px-2 py-3 text-[15px] font-bold text-white no-underline lg:inline"
          >
            Log in
          </a>
          <a
            href="#download"
            className="btn box-border inline-flex min-h-11 items-center rounded-full bg-coral px-4 text-sm font-bold text-ink no-underline md:px-5 md:text-[15px]"
          >
            Get the app
          </a>
          <MobileMenu items={[...links, { href: siteConfig.loginUrl, label: 'Log in' }]} />
        </div>
      </nav>
    </header>
  );
}
