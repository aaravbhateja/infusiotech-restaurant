type Item = { q: string; a: string };

const desktop: Item[] = [
  {
    q: 'How do guests order from the table?',
    a: 'Every table gets its own QR code. Guests scan it, browse your menu in their browser — no app download — and the order goes straight to your kitchen.',
  },
  {
    q: 'Can guests pay at the counter instead of online?',
    a: 'Yes. Guests choose to pay online (UPI, cards, netbanking and wallets via Razorpay) or at the counter. Counter bills show up in your cashier’s queue; online payments settle automatically.',
  },
  {
    q: 'Can I pause orders during a rush?',
    a: 'Yes — Settings › Accepting orders. QR guests see a friendly "kitchen is busy" message until you turn it back on.',
  },
  {
    q: 'What happens if the internet drops?',
    a: 'Your team keeps working. Updates are saved on the phone and sync automatically once you’re back online. New QR orders can’t arrive while you’re offline, so the app shows when it last synced.',
  },
  {
    q: 'How do I add a staff member?',
    a: 'Invite them by SMS or WhatsApp and pick a role — Manager, Cashier, Waiter or Kitchen. They accept, set a 4-digit shift PIN, and see only what their role allows.',
  },
];

const mobile: Item[] = [
  {
    q: 'How do guests order from the table?',
    a: 'Every table gets its own QR code. Guests scan it, browse your menu in their browser — no app download — and the order goes straight to your kitchen.',
  },
  {
    q: 'Can guests pay at the counter?',
    a: 'Yes. Guests pay online via Razorpay or at the counter. Counter bills show up in your cashier’s queue; online payments settle automatically.',
  },
  {
    q: 'Can I pause orders during a rush?',
    a: 'Yes — Settings › Accepting orders. QR guests see a friendly "kitchen is busy" message until you turn it back on.',
  },
  {
    q: 'What if the internet drops?',
    a: 'Your team keeps working. Updates are saved on the phone and sync automatically once you’re back online.',
  },
];

function List({ items, variant }: { items: Item[]; variant: 'desktop' | 'mobile' }) {
  const d = variant === 'desktop';
  return (
    <div
      className={`reveal on-light overflow-hidden border border-line bg-white ${
        d ? 'hidden rounded-[28px] md:block' : 'rounded-[22px] md:hidden'
      }`}
    >
      {items.map((item, i) => (
        <details key={item.q} className={i === items.length - 1 ? '' : 'border-b border-line'}>
          <summary
            className={`flex items-center justify-between gap-3 font-bold ${
              d ? 'gap-4 px-7 py-6 text-lg' : 'min-h-11 px-5 py-[18px] text-base'
            }`}
          >
            {item.q}
            <span
              className={`faq-plus flex-none leading-none text-coral-600 transition-transform duration-200 ${
                d ? 'text-[26px]' : 'text-2xl'
              }`}
              aria-hidden="true"
            >
              +
            </span>
          </summary>
          <p className={`text-ink-2 ${d ? 'px-7 pb-6 text-base leading-[1.6]' : 'px-5 pb-[18px] text-[15px] leading-[1.6]'}`}>
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}

export function Faq() {
  return (
    <section
      id="faq"
      className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pb-[72px] md:gap-9 md:px-6 md:pb-[120px]"
    >
      <h2 className="reveal text-center text-[34px] font-extrabold leading-[1.04] md:text-[clamp(36px,4.4vw,56px)] md:leading-[1.02]">
        Questions, answered.
      </h2>
      <List items={desktop} variant="desktop" />
      <List items={mobile} variant="mobile" />
    </section>
  );
}
