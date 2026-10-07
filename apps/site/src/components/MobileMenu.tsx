'use client';

import { useEffect, useRef, useState } from 'react';

type Item = { href: string; label: string };

/** Hamburger button and drop-down for screens narrower than the desktop nav. */
export function MobileMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/[0.18] bg-transparent lg:hidden"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
        </svg>
      </button>
      {open ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-white/[0.08] bg-ink/95 backdrop-blur-[14px] lg:hidden"
        >
          <ul className="m-0 flex list-none flex-col gap-1 px-4 py-3">
            {items.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center rounded-xl px-3 text-base font-semibold text-white no-underline hover:bg-white/[0.06]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
