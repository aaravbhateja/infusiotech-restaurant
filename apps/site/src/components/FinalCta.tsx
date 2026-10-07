import { siteConfig } from '@/config/site';

import { LogoTile } from './Icons';
import { StoreButton } from './StoreButtons';

export function FinalCta() {
  return (
    <section id="signup" className="relative overflow-hidden bg-ink text-cream">
      <div className="floor md:!-bottom-[45%]" aria-hidden="true" />
      <div
        className="orbit top-[34%] h-[520px] w-[520px] !border-cream/[0.12] md:top-[46%] md:h-[900px] md:w-[900px] md:!border-cream/10"
        aria-hidden="true"
      >
        <i />
      </div>
      <div
        className="orbit top-[34%] hidden h-[600px] w-[600px] !border-coral/30 [animation-direction:reverse] [animation-duration:11s] md:top-[46%] md:block"
        aria-hidden="true"
      >
        <i className="!bg-coral" />
      </div>
      <div
        className="glow left-1/2 top-[6%] -ml-[150px] h-[300px] w-[300px] bg-coral/[0.32] md:top-[10%] md:-ml-[250px] md:h-[500px] md:w-[500px] md:bg-coral/30"
        aria-hidden="true"
      />

      <div className="reveal relative mx-auto flex max-w-[900px] flex-col items-center gap-[22px] px-5 pb-16 pt-20 text-center md:gap-[30px] md:px-6 md:py-[130px]">
        <div className="spin3d flex h-[92px] w-[92px] items-center justify-center rounded-3xl bg-coral shadow-[0_24px_60px_-10px_rgba(255,90,54,0.7)] md:h-28 md:w-28 md:rounded-[30px] md:shadow-[0_0_0_1px_rgba(255,255,255,0.15)_inset,0_30px_70px_-10px_rgba(255,90,54,0.7)]">
          <span className="md:hidden">
            <LogoTile size={58} />
          </span>
          <span className="hidden md:block">
            <LogoTile size={70} />
          </span>
        </div>
        <h2 className="text-[40px] font-extrabold leading-none text-white md:text-[clamp(40px,5.6vw,78px)] md:leading-[0.98]">
          Run your restaurant at the speed of a <span className="text-coral">blink.</span>
        </h2>
        <p className="text-base leading-[1.6] text-sand md:max-w-[560px] md:text-[19px]">
          <span className="md:hidden">Download BlinkRest and set up in an afternoon.</span>
          <span className="hidden md:inline">Download BlinkRest and set up your restaurant in an afternoon.</span>
        </p>
        <div className="hidden flex-wrap justify-center gap-3 md:flex">
          <StoreButton kind="ios" />
          <StoreButton kind="android" />
        </div>
        <p className="text-sm text-sand-2 md:text-[15px]">
          Joining a team?{' '}
          <a href={siteConfig.loginUrl} className="font-bold text-saffron">
            Use your invite
          </a>
        </p>
      </div>
    </section>
  );
}
