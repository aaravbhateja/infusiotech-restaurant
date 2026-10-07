const steps = [
  {
    n: '01',
    title: 'Download & sign in',
    desktop: 'Get the app, then sign in with your mobile number and a 6-digit OTP — or get the code on WhatsApp.',
    mobile: 'Mobile number and a 6-digit OTP.',
  },
  {
    n: '02',
    title: 'Tell us about your restaurant',
    desktop: 'Logo, cuisine, address, GSTIN and FSSAI, how you serve and how many tables you have.',
    mobile: 'Logo, cuisine, GSTIN, FSSAI and tables.',
  },
  {
    n: '03',
    title: 'Add your menu',
    desktop: "Add dishes one by one, or snap your printed menu and we'll fill it in for you to review.",
    mobile: 'One by one, or snap your printed menu.',
  },
  {
    n: '04',
    title: 'Go live',
    desktop: 'Print a QR code for every table, invite your team, and take your first order.',
    mobile: 'Print table QRs and invite your team.',
  },
];

export function HowItWorks() {
  return (
    <section
      id="how"
      className="mx-auto flex max-w-[1240px] flex-col gap-7 px-4 py-[72px] md:gap-14 md:px-6 md:py-[120px]"
    >
      <div className="reveal flex max-w-[700px] flex-col gap-3 px-1 md:gap-4 md:px-0">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-coral-700 md:text-[13px]">
          How it works
        </span>
        <h2 className="text-4xl font-extrabold leading-[1.02] md:text-[clamp(36px,4.6vw,62px)]">
          <span className="md:hidden">Download to first order in four steps.</span>
          <span className="hidden md:inline">From download to first order in four steps.</span>
        </h2>
      </div>

      {/* Desktop: horizontal */}
      <div className="relative hidden md:block">
        <div aria-hidden="true" className="absolute inset-x-0 top-[34px] h-[3px] rounded-full bg-line" />
        <div
          aria-hidden="true"
          className="grow-line absolute inset-x-0 top-[34px] h-[3px] origin-left rounded-full bg-coral"
        />
        <ol className="relative m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-6 p-0">
          {steps.map((s, i) => (
            <li key={s.n} className="reveal flex flex-col gap-4">
              <span
                className={`flex h-[70px] w-[70px] items-center justify-center rounded-[22px] font-display text-[26px] font-extrabold ${
                  i === 3 ? 'bg-coral text-ink' : 'border-2 border-coral bg-white text-coral-600'
                }`}
              >
                {s.n}
              </span>
              <h3 className="font-display text-[22px] font-bold">{s.title}</h3>
              <p className="text-[15px] leading-[1.55] text-ink-2">{s.desktop}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Phones: vertical */}
      <div className="relative pl-1 md:hidden">
        <div aria-hidden="true" className="absolute bottom-7 left-[31px] top-7 w-[3px] rounded-full bg-line" />
        <div
          aria-hidden="true"
          className="grow-v absolute bottom-7 left-[31px] top-7 w-[3px] origin-top rounded-full bg-coral"
        />
        <ol className="relative m-0 flex list-none flex-col gap-[22px] p-0">
          {steps.map((s, i) => (
            <li key={s.n} className="reveal flex gap-4">
              <span
                className={`box-border flex h-[58px] w-[58px] flex-none items-center justify-center rounded-[18px] font-display text-xl font-extrabold ${
                  i === 3 ? 'bg-coral text-ink' : 'border-2 border-coral bg-white text-coral-600'
                }`}
              >
                {s.n}
              </span>
              <span className="flex flex-col gap-1 pt-1">
                <h3 className="font-display text-lg font-bold">{s.title}</h3>
                <span className="text-sm leading-normal text-ink-2">{s.mobile}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
