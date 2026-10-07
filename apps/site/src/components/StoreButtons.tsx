import { appStoreHref, playStoreHref } from '@/config/site';

import { PhoneDownIcon, PlayIcon } from './Icons';

type Kind = 'ios' | 'android';

const copy = {
  ios: { href: appStoreHref, label: 'Download on the App Store', small: 'Download on the', name: 'App Store' },
  android: { href: playStoreHref, label: 'Get it on Google Play', small: 'Get it on', name: 'Google Play' },
} as const;

/**
 * Large store button used in the hero and the closing section.
 * Full width and centred on phones, a compact left-aligned button on desktop.
 */
export function StoreButton({ kind, align = 'start' }: { kind: Kind; align?: 'start' | 'center' }) {
  const c = copy[kind];
  const Icon = kind === 'ios' ? PhoneDownIcon : PlayIcon;
  return (
    <a
      className={`btn box-border flex min-h-[58px] items-center gap-3 rounded-2xl bg-white px-4 py-2.5 text-ink no-underline md:inline-flex md:min-h-[60px] md:w-auto md:pr-[22px] ${
        align === 'center' ? 'justify-center md:justify-start' : 'justify-center md:justify-start'
      }`}
      href={c.href()}
      aria-label={c.label}
    >
      <Icon size={26} />
      <span className="flex flex-col text-left leading-[1.15]">
        <span className="text-[11px] font-medium text-ink-2 md:text-xs">{c.small}</span>
        <span className="text-lg font-bold md:text-[19px]">{c.name}</span>
      </span>
    </a>
  );
}

/** Fixed download bar for phones. Hidden from the tablet width up. */
export function DownloadBar() {
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex gap-2 rounded-[20px] bg-ink/95 p-2.5 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-[12px] md:hidden">
      <a
        href={appStoreHref()}
        aria-label="Download on the App Store"
        className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-white text-sm font-bold text-ink no-underline"
      >
        <PhoneDownIcon size={20} />
        App Store
      </a>
      <a
        href={playStoreHref()}
        aria-label="Get it on Google Play"
        className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-coral text-sm font-bold text-ink no-underline"
      >
        <PlayIcon size={20} detail={false} />
        Google Play
      </a>
    </div>
  );
}
