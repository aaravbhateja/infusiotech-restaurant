'use client';

import { useEffect, useRef } from 'react';

/**
 * The brand film. It is muted and loops, with controls so a visitor can unmute
 * or go full screen.
 *
 * The file is about 3 MB, so nothing is downloaded until the film is near the
 * screen (preload="none"). It plays while visible and pauses when scrolled
 * away. Visitors who prefer reduced motion get the poster and press play
 * themselves.
 */
export function BrandFilm() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.25, rootMargin: '200px 0px' },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src="/video/brand-film.mp4"
      poster="/video/brand-film-poster.webp"
      muted
      loop
      playsInline
      controls
      preload="none"
      aria-label="BlinkRest brand film: Dine-in, without the chaos"
      className="block h-full w-full rounded-[30px] object-cover md:rounded-[36px]"
    />
  );
}
