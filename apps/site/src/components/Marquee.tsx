/** The scrolling feature strip. The second copy is hidden from assistive tech. */

type Item = { mobile: string; desktop?: string; desktopOnly?: boolean };

const items: Item[] = [
  { mobile: 'Live orders' },
  { mobile: 'QR menu' },
  { mobile: 'Tables' },
  { mobile: 'Kitchen queue' },
  { mobile: 'Staff', desktop: 'Staff & roles' },
  { mobile: 'Payments' },
  { mobile: 'Offers', desktopOnly: true },
  { mobile: 'Analytics' },
];

function Run({ hidden }: { hidden?: boolean }) {
  return (
    <>
      {items.map((item) => (
        <span
          key={item.mobile}
          aria-hidden={hidden || undefined}
          className={`flex items-center gap-[22px] md:gap-9 ${item.desktopOnly ? 'hidden md:flex' : ''}`}
        >
          <span>
            {item.desktop ? (
              <>
                <span className="md:hidden">{item.mobile}</span>
                <span className="hidden md:inline">{item.desktop}</span>
              </>
            ) : (
              item.mobile
            )}
          </span>
          <span aria-hidden="true">✦</span>
        </span>
      ))}
    </>
  );
}

export function Marquee() {
  return (
    <section
      aria-label="What's included"
      className="overflow-hidden border-y border-ink bg-coral py-3.5 text-ink md:py-[18px]"
    >
      <div className="marquee items-center gap-[22px] font-display text-xl font-extrabold md:gap-9 md:text-[26px]">
        <Run />
        <Run hidden />
      </div>
    </section>
  );
}
