import { BrandFilm } from './BrandFilm';

export function FilmSection() {
  return (
    <section id="film" className="relative overflow-hidden bg-ink text-cream">
      <div
        className="glow left-1/2 top-[34%] -ml-40 h-80 w-80 bg-coral/[0.32] md:left-auto md:right-[8%] md:top-[18%] md:ml-0 md:h-[560px] md:w-[560px] md:bg-coral/30"
        aria-hidden="true"
      />
      <div className="floor hidden md:block md:!-bottom-[48%]" aria-hidden="true" />

      <div className="relative mx-auto flex max-w-[1240px] flex-col gap-[22px] px-5 pb-14 pt-16 md:flex-row md:flex-wrap md:items-center md:gap-16 md:px-6 md:py-[120px]">
        {/* Heading (and, on desktop, the supporting copy) */}
        <div className="reveal flex min-w-0 flex-col gap-3 md:flex-[1_1_420px] md:gap-6">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-saffron md:text-[13px]">
            Meet BlinkRest
          </span>
          <h2 className="text-[40px] font-extrabold leading-[0.98] text-white md:text-[clamp(40px,5.2vw,72px)]">
            Dine-in, <span className="text-coral">without the chaos.</span>
          </h2>
          <p className="hidden max-w-[500px] text-[19px] leading-[1.6] text-sand md:block">
            Waiters stuck repeating the menu, tables waiting on the bill, orders lost between the floor and the
            kitchen. Fifty seconds on how BlinkRest fixes all of it.
          </p>
          <div className="hidden flex-col gap-3 text-base md:flex">
            <span className="flex items-center gap-3">
              <span className="ck dark" />
              Your waiter ≠ your QR code — guests order on their own
            </span>
            <span className="flex items-center gap-3">
              <span className="ck dark" />
              No app to download — the menu opens in the browser
            </span>
            <span className="flex items-center gap-3">
              <span className="ck dark" />
              Your menu, live and in stock, on every table
            </span>
          </div>
          <p className="hidden text-sm text-sand-2 md:block">Tap the video to unmute or go full screen.</p>
        </div>

        {/* Video */}
        <div className="scene relative flex min-w-0 justify-center md:flex-[1_1_420px]">
          <div
            className="orbit hidden h-[560px] w-[560px] md:block"
            aria-hidden="true"
          >
            <i />
          </div>
          <div className="tilt-in relative flex w-full justify-center">
            <div className="md:spin3d md:[animation-duration:14s]">
              <div className="aspect-[9/16] w-full max-w-[330px] overflow-hidden rounded-[38px] border-8 border-[#2a2422] bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_40px_80px_-24px_rgba(255,90,54,0.45)] md:w-[340px] md:max-w-none md:rounded-[46px] md:border-[10px] md:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_60px_120px_-30px_rgba(255,90,54,0.45),0_40px_80px_-30px_rgba(0,0,0,0.8)]">
                <BrandFilm />
              </div>
            </div>
          </div>
        </div>

        {/* Phone-only caption */}
        <p className="reveal text-base leading-[1.6] text-sand md:hidden">
          Fifty seconds on how BlinkRest ends the back-and-forth between the floor and the kitchen. Tap to unmute.
        </p>
      </div>
    </section>
  );
}
