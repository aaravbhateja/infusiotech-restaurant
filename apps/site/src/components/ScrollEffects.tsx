'use client';

import { useEffect } from 'react';

/**
 * Fallback for browsers without CSS scroll-driven animations.
 *
 * The layout script adds `no-sda` to <html> when `animation-timeline: view()`
 * is unsupported. In that case this component reveals `.reveal`, `.tilt-in`
 * and the progress lines with an IntersectionObserver, and drives the top
 * progress bar from the scroll position. Where the CSS works, it does nothing.
 */
export function ScrollEffects() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('no-sda')) return;

    const targets = document.querySelectorAll('.reveal, .tilt-in, .grow-line, .grow-v');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    targets.forEach((el) => observer.observe(el));

    const bar = document.querySelector<HTMLElement>('.progress');
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!bar) return;
      const max = root.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = `scaleX(${progress})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
