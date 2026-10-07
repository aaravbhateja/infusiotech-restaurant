const included = [
  'QR menu & table ordering',
  'Live orders & kitchen queue',
  'Table management & QR codes',
  'Menu, variants & stock',
  'Staff roles & permissions',
  'UPI, card & cash payments',
  'Offers & promo codes',
  'Customer CRM & reviews',
  'Analytics & report export',
  'Multi-branch management',
  'Offline mode & KOT printing',
  'iPhone & Android apps',
];

const includedMobile = [
  'QR menu, live orders & kitchen queue',
  'Tables, menu & stock',
  'Staff roles & permissions',
  'UPI, card & cash payments',
  'Offers, CRM & reviews',
  'Analytics & multi-branch',
  'iPhone & Android apps',
];

export function Pricing() {
  return (
    <section
      id="pricing"
      className="mx-auto flex max-w-[1040px] flex-col gap-5 px-4 pb-[72px] pt-2 md:gap-12 md:px-6 md:pb-[120px] md:pt-10"
    >
      <div className="reveal flex max-w-[720px] flex-col items-center gap-3 self-center text-center md:gap-4">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-coral-700 md:text-[13px]">Pricing</span>
        <h2 className="text-4xl font-extrabold leading-[1.02] md:text-[clamp(36px,4.6vw,62px)]">
          Every feature. One simple price.
        </h2>
        <p className="hidden text-lg leading-[1.6] text-ink-2 md:block">
          Both plans unlock all of BlinkRest. Just pick how you&apos;d like to pay.
        </p>
      </div>

      {/* Desktop: monthly then yearly */}
      <div className="hidden grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-stretch gap-5 md:grid">
        <div className="reveal">
          <div className="tiltcard box-border flex h-full flex-col gap-6 rounded-[32px] border border-line bg-white p-9">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[26px] font-extrabold">Monthly</h3>
              <p className="text-[15px] text-ink-3">Pay month to month, cancel anytime</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[60px] font-extrabold tracking-[-0.03em]">₹999</span>
              <span className="font-semibold text-ink-3">/ month</span>
            </div>
            <p className="flex-1 text-[15px] leading-normal text-ink-2">
              Full access to every feature, billed every month.
            </p>
            <a
              className="btn rounded-full border-[1.5px] border-[#e5d8cf] p-4 text-center font-bold text-ink no-underline"
              href="#download"
            >
              Start monthly
            </a>
          </div>
        </div>
        <div className="reveal">
          <div className="tiltcard box-border relative flex h-full flex-col gap-6 overflow-hidden rounded-[32px] bg-ink p-9 text-cream">
            <div aria-hidden="true" className="absolute -right-[60px] -top-[60px] h-[180px] w-[180px] rounded-full bg-coral" />
            <div className="relative flex flex-col gap-1.5">
              <span className="mb-1.5 self-start rounded-full bg-saffron px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.06em] text-ink">
                Save ₹1,989
              </span>
              <h3 className="text-[26px] font-extrabold">Yearly</h3>
              <p className="text-[15px] text-sand">Pay once a year and save about 17%</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[60px] font-extrabold tracking-[-0.03em] text-white">₹9,999</span>
              <span className="font-semibold text-sand">/ year</span>
            </div>
            <p className="flex-1 text-[15px] leading-normal text-sand">
              Full access to every feature — works out to about ₹833 a month.
            </p>
            <a
              className="btn rounded-full bg-coral-600 p-4 text-center font-bold text-white no-underline"
              href="#download"
            >
              Start yearly
            </a>
          </div>
        </div>
      </div>

      <div className="reveal hidden flex-col gap-6 rounded-[32px] bg-coral-50 p-[clamp(28px,4vw,44px)] md:flex">
        <h3 className="text-2xl font-extrabold">Everything included in both plans</h3>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-6 gap-y-3.5 p-0 text-base">
          {included.map((t) => (
            <li key={t} className="flex items-center gap-2.5">
              <span className="ck" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <p className="hidden text-center text-sm text-ink-3 md:block">Prices exclude GST.</p>

      {/* Phones: yearly first */}
      <div className="reveal relative flex flex-col gap-4 overflow-hidden rounded-[28px] bg-ink p-[26px] text-cream md:hidden">
        <div aria-hidden="true" className="absolute -right-[50px] -top-[50px] h-[140px] w-[140px] rounded-full bg-coral" />
        <span className="relative self-start rounded-full bg-saffron px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink">
          Save ₹1,989
        </span>
        <div className="relative flex flex-col gap-0.5">
          <h3 className="text-[22px] font-extrabold">Yearly</h3>
          <span className="text-sm text-sand">About ₹833 a month</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-5xl font-extrabold tracking-[-0.03em] text-white">₹9,999</span>
          <span className="font-semibold text-sand">/ year</span>
        </div>
        <a className="rounded-full bg-coral-600 p-[15px] text-center font-bold text-white no-underline" href="#download">
          Start yearly
        </a>
      </div>
      <div className="reveal flex flex-col gap-4 rounded-[28px] border border-line bg-white p-[26px] md:hidden">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[22px] font-extrabold">Monthly</h3>
          <span className="text-sm text-ink-3">Pay month to month, cancel anytime</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-5xl font-extrabold tracking-[-0.03em]">₹999</span>
          <span className="font-semibold text-ink-3">/ month</span>
        </div>
        <a
          className="rounded-full border-[1.5px] border-[#e5d8cf] p-[15px] text-center font-bold text-ink no-underline"
          href="#download"
        >
          Start monthly
        </a>
      </div>
      <div className="reveal flex flex-col gap-3.5 rounded-[28px] bg-coral-50 p-6 md:hidden">
        <h3 className="text-[19px] font-extrabold">Both plans include everything</h3>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px]">
          {includedMobile.map((t) => (
            <li key={t} className="flex items-center gap-2.5">
              <span className="ck" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-center text-[13px] text-ink-3 md:hidden">Prices exclude GST.</p>
    </section>
  );
}
