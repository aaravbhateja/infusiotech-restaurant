import { Phone, shots } from './Phone';

const screens = [
  shots.owner,
  shots.liveOrders,
  shots.tables,
  shots.guestMenu,
  shots.payment,
  shots.manager,
  shots.waiter,
  shots.kitchen,
  shots.cashier,
];

export function Carousel() {
  return (
    <section
      aria-labelledby="car-h"
      className="relative mt-12 overflow-hidden bg-ink text-cream md:mt-20"
    >
      <div
        className="glow left-1/2 top-[45%] -ml-[170px] h-60 w-[340px] bg-coral/[0.28] md:top-[40%] md:-ml-[350px] md:h-[400px] md:w-[700px] md:bg-coral/25"
        aria-hidden="true"
      />
      <div className="reveal relative mx-auto flex max-w-[860px] flex-col items-center gap-2.5 px-5 pt-16 text-center md:gap-4 md:px-6 md:pt-[110px]">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-saffron md:text-[13px]">
          Inside the app
        </span>
        <h2
          id="car-h"
          className="text-[34px] font-extrabold leading-[1.04] text-white md:text-[clamp(36px,4.6vw,62px)] md:leading-[1.02]"
        >
          Every screen built for the rush.
        </h2>
        <p className="hidden text-lg leading-[1.6] text-sand md:block">Hover to pause the spin.</p>
      </div>
      <div
        className="carousel"
        role="img"
        aria-label="Rotating carousel of BlinkRest app screens: dashboard, live orders, tables, QR menu, payment, manager, waiter, kitchen and cashier"
      >
        <div className="ring">
          {screens.map((src, i) => (
            <Phone key={src} src={src} alt="" sizes="(min-width: 768px) 220px, 150px" style={{ ['--i' as string]: i }} />
          ))}
        </div>
      </div>
    </section>
  );
}
