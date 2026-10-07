import type { CSSProperties } from 'react';

import { Bolt } from './Icons';
import { Phone, shots } from './Phone';
import { StoreButton } from './StoreButtons';
import { PlayTriangle } from './Icons';

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

function Check({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 md:gap-2">
      <span className="ck dark" />
      {children}
    </span>
  );
}

export function Hero() {
  return (
    <section
      id="top"
      className="relative -mt-[65px] overflow-hidden bg-ink pt-[65px] text-cream md:-mt-[73px] md:pt-[73px]"
    >
      <div className="floor" aria-hidden="true" />
      <div
        className="glow right-[-60px] top-[380px] h-[360px] w-[360px] bg-coral/[0.42] md:right-[4%] md:top-[12%] md:h-[620px] md:w-[620px] md:bg-coral/[0.38]"
        aria-hidden="true"
      />
      <div
        className="glow right-[34%] top-[56%] hidden h-[320px] w-[320px] bg-saffron/[0.18] md:block"
        aria-hidden="true"
      />

      <div className="hero-grid relative mx-auto max-w-[1240px] md:px-6 md:pb-[120px] md:pt-[88px]">
        {/* Text */}
        <div className="hero-text flex flex-col gap-5 px-5 pb-8 pt-10 md:gap-7 md:p-0">
          <div className="fade-in inline-flex items-center gap-2 self-start rounded-full border border-white/[0.12] bg-white/[0.06] py-1.5 pl-2 pr-3 text-[13px] font-semibold text-[#f1e7e0] md:gap-2.5 md:py-2 md:pr-4 md:text-sm">
            <span className="pulse ml-1 h-2 w-2 rounded-full bg-coral md:h-2.5 md:w-2.5" />
            <span className="md:hidden">Restaurant OS for India</span>
            <span className="hidden md:inline">The restaurant operating system for India</span>
          </div>

          <h1 className="text-[48px] font-extrabold leading-[0.96] tracking-[-0.04em] [perspective:500px] md:text-[clamp(50px,6.8vw,96px)] md:[perspective:600px]">
            <span className="word" style={delay(0.05)}>
              Your
            </span>{' '}
            <span className="word" style={delay(0.15)}>
              Restaurant.
            </span>
            <br />
            <span className="word text-coral" style={delay(0.3)}>
              One
            </span>{' '}
            <span className="word text-coral" style={delay(0.42)}>
              Blink
            </span>{' '}
            <span className="word text-coral" style={delay(0.54)}>
              Away<span className="blink">.</span>
            </span>
          </h1>

          <p
            className="fade-in max-w-[520px] text-[17px] leading-[1.55] text-sand md:text-[clamp(18px,1.6vw,21px)]"
            style={delay(0.7)}
          >
            <span className="md:hidden">
              Orders, menu, tables, staff and payments in one app — built to keep up with a Friday-night rush.
            </span>
            <span className="hidden md:inline">
              Orders, menu, tables, staff and payments in one app for owners, managers and kitchen teams — built to
              keep up with a Friday-night rush.
            </span>
          </p>
        </div>

        {/* 3D scene */}
        <div className="hero-scene flex justify-center">
          <div className="scene relative -mt-2 h-[520px] w-full max-w-[600px] md:mt-0 md:h-[680px]">
            <div
              className="orbit h-[420px] w-[420px] md:h-[640px] md:w-[640px]"
              aria-hidden="true"
            >
              <i />
            </div>
            <div
              className="orbit h-[300px] w-[300px] border-saffron/30 [animation-direction:reverse] [animation-duration:11s] md:h-[460px] md:w-[460px] md:[animation-duration:12s]"
              aria-hidden="true"
            >
              <i className="!bg-coral !shadow-[0_0_18px_4px_rgba(255,90,54,0.6)]" />
            </div>

            <div className="tilt-wrap hero-scroll absolute inset-0">
              <div className="stage absolute inset-0">
                <Phone
                  src={shots.guestMenu}
                  alt="Guest QR menu"
                  sizes="210px"
                  className="absolute left-0 top-[110px] hidden w-[210px] md:block [transform:translateZ(-140px)_rotateY(18deg)]"
                />
                <Phone
                  src={shots.kitchen}
                  alt="Kitchen queue"
                  sizes="210px"
                  className="absolute right-0 top-[70px] hidden w-[210px] md:block [transform:translateZ(-120px)_rotateY(-14deg)]"
                />
                <Phone
                  src={shots.owner}
                  alt="BlinkRest owner dashboard with 15 live orders and today's revenue"
                  sizes="(min-width: 768px) 270px, 220px"
                  priority
                  className="absolute left-1/2 top-2.5 -ml-[110px] w-[220px] [transform:translateZ(30px)] md:-ml-[135px] md:w-[270px] md:[transform:translateZ(40px)]"
                />

                <div
                  className="glass bob absolute bottom-[70px] left-2.5 flex w-[248px] items-center gap-2.5 p-3 text-ink [--z:150px] md:-left-2.5 md:bottom-[120px] md:w-[290px] md:gap-3 md:px-4 md:py-3.5 md:[--z:180px]"
                >
                  <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-ink md:h-11 md:w-11 md:rounded-xl">
                    <Bolt size={18} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px md:gap-0.5">
                    <span className="text-sm font-bold md:text-[15px]">New order · Table 7</span>
                    <span className="text-xs text-ink-3 md:text-[13px]">
                      4 items · ₹1,266<span className="hidden md:inline"> · just now</span>
                    </span>
                  </span>
                  <span className="pulse flex-none rounded-full bg-coral-600 px-[11px] py-[7px] text-xs font-bold text-white md:px-3.5 md:py-2 md:text-[13px]">
                    Accept
                  </span>
                </div>

                <div
                  className="glass bob absolute right-2 top-[200px] flex w-[150px] flex-col gap-[3px] px-3.5 py-3 text-ink [--z:190px] [animation-delay:-2s] md:-right-1.5 md:top-[330px] md:w-[196px] md:gap-1 md:px-[18px] md:py-4 md:[--z:220px]"
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 md:text-xs">
                    <span className="md:hidden">Today</span>
                    <span className="hidden md:inline">Today&apos;s revenue</span>
                  </span>
                  <span className="font-display text-2xl font-extrabold tracking-[-0.03em] md:text-[30px]">
                    ₹48,620
                  </span>
                  <span className="self-start rounded-full bg-success-50 px-[7px] py-0.5 text-[11px] font-bold text-success md:px-2 md:py-[3px] md:text-xs">
                    <span className="md:hidden">↑ 12.4%</span>
                    <span className="hidden md:inline">↑ 12.4% vs last Fri</span>
                  </span>
                </div>

                <div
                  className="bob absolute bottom-10 right-[70px] hidden w-[150px] flex-col gap-1.5 rounded-[18px] bg-coral p-3.5 text-ink shadow-[0_30px_50px_-20px_rgba(0,0,0,0.5)] [--z:140px] [animation-delay:-4s] md:flex"
                >
                  <span className="flex items-baseline justify-between">
                    <span className="font-display text-2xl font-extrabold">T7</span>
                    <span className="text-xs font-bold">3/4</span>
                  </span>
                  <span className="text-xs font-bold">Occupied · 14m</span>
                  <span className="font-display text-lg font-extrabold">₹1,266</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Download */}
        <div id="download" className="hero-dl flex flex-col gap-2.5 px-5 pb-12 md:gap-0 md:p-0">
          <div className="fade-in flex flex-col gap-2.5 md:flex-row md:flex-wrap md:gap-3" style={delay(0.85)}>
            <StoreButton kind="ios" />
            <StoreButton kind="android" />
            <a
              className="btn box-border hidden min-h-[60px] items-center gap-2.5 px-[18px] py-2.5 text-base font-bold text-white no-underline md:inline-flex"
              href="#film"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-white/30">
                <PlayTriangle />
              </span>
              Watch demo
            </a>
          </div>
          <div
            className="fade-in mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[13px] font-semibold text-sand md:mt-7 md:justify-start md:gap-x-[22px] md:gap-y-2.5 md:text-sm"
            style={delay(1)}
          >
            <Check>UPI, card &amp; cash</Check>
            <Check>
              <span className="md:hidden">GST-ready bills</span>
              <span className="hidden md:inline">GST-ready bills &amp; KOTs</span>
            </Check>
            <Check>
              <span className="md:hidden">QR ordering</span>
              <span className="hidden md:inline">QR table ordering</span>
            </Check>
          </div>
        </div>
      </div>
    </section>
  );
}
