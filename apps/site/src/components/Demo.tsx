import { PauseIcon } from './Icons';

/** The animated order demo. A horizontal track on desktop, a vertical timeline on phones. */

function OrderCard({ compact }: { compact?: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className={`font-display font-extrabold ${compact ? 'text-[19px]' : 'text-xl'}`}>#2047</span>
        <span className="rounded-full bg-line px-2.5 py-1 text-xs font-bold">Table 7</span>
      </div>
      <div className="text-[13px] leading-[1.4] text-ink-2">
        Paneer Tikka, Chicken Dum Biryani ×2, Butter Naan ×3, Mango Lassi ×2
      </div>
      <div className="flex items-center justify-between">
        <span className={`font-display font-extrabold ${compact ? 'text-[21px]' : 'text-[22px]'}`}>₹1,266</span>
        <span className={`relative h-7 ${compact ? 'w-[104px]' : 'w-28 md:h-[30px]'}`}>
          <span className="st st1 bg-[#feecea] text-[#b4231b]">New</span>
          <span className="st st2 bg-[#fff4d6] text-[#8a5a00]">Preparing</span>
          <span className="st st3 bg-success-50 text-success">Ready</span>
          <span className="st st4 bg-[#f1e8ff] text-[#5b21b6]">Paid · UPI</span>
        </span>
      </div>
    </>
  );
}

const stations = [
  { label: 'Guest scans QR', mobile: 'Guest scans the QR', d: '0s', left: '12%' },
  { label: 'Kitchen cooks', mobile: 'Kitchen cooks', d: '-9s', left: '37.33%' },
  { label: 'Waiter serves', mobile: 'Waiter serves', d: '-6s', left: '62.66%' },
  { label: 'Bill paid', mobile: 'Bill paid', d: '-3s', left: '88%' },
];

function Controls({ small }: { small?: boolean }) {
  return (
    <div
      className={`absolute inset-x-0 bottom-0 flex items-center bg-gradient-to-t from-black/[0.55] to-transparent text-white ${
        small ? 'gap-3 px-[18px] py-3.5' : 'gap-4 px-7 py-4'
      }`}
    >
      <span
        className={`flex flex-none items-center justify-center rounded-full bg-white ${
          small ? 'h-8 w-8' : 'h-9 w-9'
        }`}
      >
        <PauseIcon size={small ? 11 : 12} />
      </span>
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
        <span className="timebar block h-full bg-saffron" />
      </span>
      <span className={`font-bold tabular-nums ${small ? 'text-xs' : 'text-[13px]'}`}>0:12</span>
    </div>
  );
}

export function Demo() {
  return (
    <section
      id="demo"
      className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pb-6 pt-[72px] md:gap-10 md:px-6 md:pb-10 md:pt-[120px]"
    >
      <div className="reveal flex max-w-[760px] flex-col gap-3 px-1 md:gap-4 md:px-0">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-coral-700 md:text-[13px]">See it move</span>
        <h2 className="text-4xl font-extrabold leading-[1.02] md:text-[clamp(36px,4.6vw,62px)]">
          One order, from scan to served.
        </h2>
        <p className="hidden max-w-[760px] text-[19px] leading-[1.6] text-ink-2 md:block">
          Watch Table 7&apos;s order travel through BlinkRest — every screen updates the moment it moves.
        </p>
      </div>

      {/* Desktop: horizontal track */}
      <div
        className="tilt-in solid relative hidden min-h-[420px] overflow-hidden rounded-[36px] bg-ink shadow-[0_60px_120px_-40px_rgba(27,23,22,0.6)] [aspect-ratio:16/8.2] md:block"
        role="img"
        aria-label="Animated demo: an order moves from Guest scans QR to Kitchen cooks, Waiter serves and Bill paid"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:48px_48px]"
        />
        <div className="glow -top-[30%] left-[30%] h-[520px] w-[520px] bg-coral/25" aria-hidden="true" />
        <div className="absolute left-7 top-6 flex items-center gap-2.5 text-[13px] font-bold tracking-[0.1em] text-white">
          <span className="pulse h-2.5 w-2.5 rounded-full bg-coral" />
          LIVE DEMO · TABLE 7
        </div>
        <div className="absolute inset-x-[6%] top-1/2 mt-[30px] h-1 rounded-full bg-[#2a2422]">
          <div className="fill absolute inset-y-0 left-[12%] w-[76%] rounded-full bg-coral" />
        </div>
        <div className="absolute inset-x-[6%] top-1/2 mt-14 h-[120px]">
          {stations.map((s) => (
            <div
              key={s.label}
              className="stn absolute -translate-x-1/2 whitespace-nowrap rounded-[14px] px-4 py-2.5 text-center text-sm font-bold"
              style={{ left: s.left, ['--d' as string]: s.d }}
            >
              {s.label}
            </div>
          ))}
        </div>
        <div className="absolute inset-x-[6%] top-1/2 mt-[30px] h-1">
          <div className="track-card -mt-[100px] flex w-[280px] flex-col gap-3 rounded-[22px] bg-white p-[18px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)]">
            <OrderCard />
          </div>
        </div>
        <Controls />
      </div>

      {/* Phones: vertical timeline */}
      <div
        className="tilt-in solid relative h-[540px] overflow-hidden rounded-[28px] bg-ink shadow-[0_40px_80px_-30px_rgba(27,23,22,0.6)] md:hidden"
        role="img"
        aria-label="Animated demo: an order moves from Guest scans the QR to Kitchen cooks, Waiter serves and Bill paid"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:36px_36px]"
        />
        <div className="glow -top-[20%] left-[20%] h-80 w-80 bg-coral/[0.28]" aria-hidden="true" />
        <div className="absolute left-5 top-[18px] flex items-center gap-2 text-xs font-bold tracking-[0.1em] text-white">
          <span className="pulse h-2 w-2 rounded-full bg-coral" />
          LIVE DEMO · TABLE 7
        </div>
        <div className="scene absolute inset-x-5 top-14">
          <div className="hop flex flex-col gap-2.5 rounded-[20px] bg-white p-4 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.7)]">
            <OrderCard compact />
          </div>
        </div>
        <div className="absolute inset-x-5 top-[250px] h-[220px]">
          <div aria-hidden="true" className="absolute inset-y-[22px] left-[21px] w-[3px] rounded-full bg-[#2a2422]" />
          <div
            aria-hidden="true"
            className="fillh absolute inset-y-[22px] left-[21px] w-[3px] rounded-full bg-coral"
          />
          <div className="relative flex flex-col gap-3.5">
            {stations.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3.5">
                <span
                  className="stn flex h-11 w-11 flex-none items-center justify-center rounded-[14px] text-sm font-extrabold"
                  style={{ ['--d' as string]: s.d }}
                >
                  {i + 1}
                </span>
                <span className="text-[15px] font-bold text-white">{s.mobile}</span>
              </div>
            ))}
          </div>
        </div>
        <Controls small />
      </div>
    </section>
  );
}
