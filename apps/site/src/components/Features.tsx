import type { ReactNode } from 'react';

import { Phone, shots } from './Phone';

function IconTile({ bg, children, small }: { bg: string; children: ReactNode; small?: boolean }) {
  return (
    <span
      className={`flex items-center justify-center ${
        small ? 'h-10 w-10 rounded-xl' : 'h-[52px] w-[52px] rounded-2xl'
      }`}
      style={{ background: bg }}
    >
      {children}
    </span>
  );
}

function Svg({ stroke, size, children }: { stroke: string; size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const cards = [
  {
    title: 'Menu & stock',
    bg: '#FFF1EC',
    stroke: '#D9381A',
    desktop: 'Variants, add-ons, veg and Jain tags. Mark a dish sold out and the QR menu updates instantly.',
    mobile: 'Mark sold out in one tap.',
    icon: <path d="M7 2v9M4 2v5a3 3 0 0 0 6 0V2M7 11v11M17 2c-2 1.5-3 4-3 7h3v13" />,
  },
  {
    title: 'Payments',
    bg: '#E8F7EE',
    stroke: '#087A3E',
    desktop: 'UPI, card and cash in one ledger, with pending bills, refunds and your next settlement in view.',
    mobile: 'UPI, card and cash in one ledger.',
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M2 10h20M6 15h4" />
      </>
    ),
  },
  {
    title: 'Offers',
    bg: '#FFF4D6',
    stroke: '#8A5A00',
    desktop: 'Percentage, flat or free-item promo codes, scheduled by day with usage limits.',
    mobile: 'Promo codes with limits.',
    icon: (
      <>
        <path d="M19 5L5 19" />
        <circle cx="7" cy="7" r="2.5" />
        <circle cx="17" cy="17" r="2.5" />
      </>
    ),
  },
  {
    title: 'Customers',
    bg: '#EAF1FF',
    stroke: '#1F5BD6',
    desktop: 'Lifetime spend, favourite dishes and visit history for every regular, plus staff-only notes.',
    mobile: 'Know every regular.',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 3.5 6" />
      </>
    ),
  },
  {
    title: 'Analytics',
    bg: '#F1E8FF',
    stroke: '#5B21B6',
    desktop: 'Revenue, best sellers and peak hours. Export the full report as PDF or Excel.',
    mobile: 'Peak hours, best sellers.',
    icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
  {
    title: 'Reviews',
    bg: '#FEECEB',
    stroke: '#B4231B',
    desktop: 'Food, service and speed ratings tied to each order. Reply in the app.',
    mobile: 'Reply right in the app.',
    icon: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  },
];

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] font-semibold">
      <span className="h-3 w-3 rounded-[4px] box-border" style={swatchStyle(swatch)} />
      {label}
    </span>
  );
}

function swatchStyle(kind: string): React.CSSProperties {
  switch (kind) {
    case 'occupied':
      return { background: '#FF5A36' };
    case 'reserved':
      return { background: '#EAF1FF', border: '1.5px solid #1F5BD6' };
    case 'cleaning':
      return { border: '1.5px dashed #8A5A00' };
    default:
      return { background: '#E8F7EE', border: '1.5px solid #087A3E' };
  }
}

function Tag({ children, bg, fg, small }: { children: ReactNode; bg: string; fg: string; small?: boolean }) {
  return (
    <span
      className={`self-start rounded-full font-bold ${small ? 'px-[11px] py-[5px] text-[13px]' : 'px-3 py-1.5 text-sm'}`}
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

export function Features() {
  return (
    <section
      id="features"
      className="mx-auto flex max-w-[1240px] flex-col gap-16 px-4 pb-6 pt-16 md:gap-[120px] md:px-6 md:pb-10 md:pt-[100px]"
    >
      <div className="reveal flex max-w-[760px] flex-col gap-3 px-1 md:gap-4 md:px-0">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-coral-700 md:text-[13px]">Features</span>
        <h2 className="text-4xl font-extrabold leading-[1.02] md:text-[clamp(36px,4.6vw,62px)]">
          Every part of service, one blink away.
        </h2>
      </div>

      {/* ---------- Desktop ---------- */}
      <div className="hidden flex-wrap items-center gap-[72px] md:flex">
        <div className="reveal flex min-w-0 flex-[1_1_400px] flex-col gap-[22px]">
          <Tag bg="#FFF1EC" fg="#C2330F">
            01 · Live orders
          </Tag>
          <h3 className="text-[clamp(30px,3.2vw,44px)] font-extrabold leading-[1.06]">
            Accept the order before the guest finishes their lassi.
          </h3>
          <p className="text-lg leading-[1.6] text-ink-2">
            Dine-in, takeaway and delivery land in one queue — with the table, items, notes and how long it&apos;s been
            waiting.
          </p>
          <div className="flex flex-col gap-3.5 text-base leading-normal">
            {[
              'New orders ring with sound and a banner — even when the phone is locked.',
              'New → Accepted → Preparing → Ready → Served, each a single tap.',
              'Late orders turn red, so nothing quietly sits in the queue.',
            ].map((t) => (
              <div key={t} className="flex gap-3">
                <span className="ck" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex h-[600px] min-w-0 flex-[1_1_440px] justify-center">
          <div aria-hidden="true" className="absolute inset-x-5 inset-y-10 rounded-[40px] bg-coral-50" />
          <div
            aria-hidden="true"
            className="parallax-up absolute right-[30px] top-20 h-[120px] w-[120px] rounded-full border-[22px] border-coral opacity-[0.85]"
          />
          <div className="tilt-in relative w-[290px] self-center">
            <Phone src={shots.liveOrders} alt="Live orders screen with new, accepted and preparing orders" sizes="290px" />
          </div>
        </div>
      </div>

      <div className="hidden flex-wrap-reverse items-center gap-[72px] md:flex">
        <div className="relative flex h-[600px] min-w-0 flex-[1_1_440px] justify-center">
          <div aria-hidden="true" className="absolute inset-x-5 inset-y-10 rounded-[40px] bg-saffron-50" />
          <div
            aria-hidden="true"
            className="parallax-up absolute bottom-[70px] left-9 h-24 w-24 rotate-12 rounded-[26px] bg-saffron"
          />
          <div className="tilt-in relative w-[290px] self-center">
            <Phone
              src={shots.tables}
              alt="Tables screen showing occupied, reserved, cleaning and free tables"
              sizes="290px"
            />
          </div>
        </div>
        <div className="reveal flex min-w-0 flex-[1_1_400px] flex-col gap-[22px]">
          <Tag bg="#FFF4D6" fg="#8A5A00">
            02 · Tables
          </Tag>
          <h3 className="text-[clamp(30px,3.2vw,44px)] font-extrabold leading-[1.06]">
            See the whole floor in one glance.
          </h3>
          <p className="text-lg leading-[1.6] text-ink-2">
            Occupied, reserved, needs cleaning or ready to seat — every table shows guests, running bill and time
            seated. Bill asked, new order and delayed tags jump out.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Legend swatch="occupied" label="Occupied" />
            <Legend swatch="reserved" label="Reserved" />
            <Legend swatch="cleaning" label="Needs cleaning" />
            <Legend swatch="available" label="Available" />
          </div>
        </div>
      </div>

      <div className="reveal relative hidden flex-wrap items-center gap-14 overflow-hidden rounded-[44px] bg-coral p-[clamp(32px,5vw,72px)] md:flex">
        <div
          aria-hidden="true"
          className="absolute -right-[150px] -top-[150px] h-[440px] w-[440px] rounded-full border-[72px] border-white/[0.14]"
        />
        <div className="relative flex min-w-0 flex-[1_1_380px] flex-col gap-[22px]">
          <span className="self-start rounded-full bg-ink px-3 py-1.5 text-sm font-bold text-saffron">
            03 · QR ordering
          </span>
          <h3 className="text-[clamp(32px,3.6vw,50px)] font-extrabold leading-[1.04] text-ink">
            Guests scan, order and pay — right from the table.
          </h3>
          <p className="text-lg leading-[1.6] text-ink">
            Your menu opens in the browser, no download needed. Orders go straight to the kitchen and the bill lands on
            the guest&apos;s WhatsApp.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 rounded-[20px] bg-white p-[18px]">
              <span className="text-base font-bold">Pay online now</span>
              <span className="text-sm leading-normal text-ink-2">
                UPI, cards, netbanking and wallets, secured by Razorpay.
              </span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-[20px] bg-white p-[18px]">
              <span className="text-base font-bold">Or pay at counter</span>
              <span className="text-sm leading-normal text-ink-2">The order still goes to the kitchen right away.</span>
            </div>
          </div>
        </div>
        <div className="scene relative flex h-[520px] min-w-0 flex-[1_1_420px] justify-center gap-5">
          <div className="spin3d flex items-start gap-[22px]">
            <Phone
              src={shots.guestMenu}
              alt="Guest QR menu for Saffron Tadka"
              sizes="220px"
              className="w-[220px] !rounded-[38px] !border-8 [&_img]:!rounded-[30px]"
            />
            <Phone
              src={shots.payment}
              alt="Payment successful with live order tracking"
              sizes="220px"
              className="mt-[60px] w-[220px] !rounded-[38px] !border-8 [&_img]:!rounded-[30px]"
            />
          </div>
        </div>
      </div>

      <div className="hidden grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5 md:grid">
        {cards.map((c) => (
          <div key={c.title} className="reveal">
            <div className="tiltcard box-border flex h-full flex-col gap-3 rounded-[28px] border border-line bg-white p-[30px]">
              <IconTile bg={c.bg}>
                <Svg stroke={c.stroke} size={24}>
                  {c.icon}
                </Svg>
              </IconTile>
              <h4 className="text-[22px] font-bold">{c.title}</h4>
              <p className="text-base leading-[1.55] text-ink-2">{c.desktop}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Phones ---------- */}
      <div className="flex flex-col gap-[22px] md:hidden">
        <div className="relative flex h-[470px] items-center justify-center">
          <div aria-hidden="true" className="absolute inset-x-0 inset-y-6 rounded-[32px] bg-coral-50" />
          <div className="tilt-in relative w-[210px]">
            <Phone src={shots.liveOrders} alt="Live orders screen" sizes="210px" />
          </div>
        </div>
        <div className="reveal flex flex-col gap-3.5 px-1">
          <Tag bg="#FFF1EC" fg="#C2330F" small>
            01 · Live orders
          </Tag>
          <h3 className="text-[28px] font-extrabold leading-[1.08]">
            Accept the order before the guest finishes their lassi.
          </h3>
          <p className="text-base leading-[1.6] text-ink-2">
            Dine-in, takeaway and delivery in one queue. New orders ring even when the phone is locked; late ones turn
            red.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-[22px] md:hidden">
        <div className="relative flex h-[470px] items-center justify-center">
          <div aria-hidden="true" className="absolute inset-x-0 inset-y-6 rounded-[32px] bg-saffron-50" />
          <div className="tilt-in relative w-[210px]">
            <Phone src={shots.tables} alt="Tables screen" sizes="210px" />
          </div>
        </div>
        <div className="reveal flex flex-col gap-3.5 px-1">
          <Tag bg="#FFF4D6" fg="#8A5A00" small>
            02 · Tables
          </Tag>
          <h3 className="text-[28px] font-extrabold leading-[1.08]">See the whole floor in one glance.</h3>
          <p className="text-base leading-[1.6] text-ink-2">
            Occupied, reserved, needs cleaning or ready to seat — with guests, running bill and time seated on every
            table.
          </p>
        </div>
      </div>

      <div className="reveal relative flex flex-col gap-[18px] overflow-hidden rounded-[32px] bg-coral px-5 pt-7 md:hidden">
        <div
          aria-hidden="true"
          className="absolute -right-[90px] -top-[90px] h-60 w-60 rounded-full border-[44px] border-white/[0.14]"
        />
        <span className="relative self-start rounded-full bg-ink px-[11px] py-[5px] text-[13px] font-bold text-saffron">
          03 · QR ordering
        </span>
        <h3 className="relative text-[30px] font-extrabold leading-[1.04]">
          Guests scan, order and pay from the table.
        </h3>
        <p className="relative text-base leading-[1.6]">
          No download needed. Pay online via Razorpay or at the counter — the bill lands on WhatsApp.
        </p>
        <div className="scene mt-2 flex h-[330px] justify-center overflow-hidden">
          <div className="spin3d">
            <Phone src={shots.guestMenu} alt="Guest QR menu" sizes="200px" className="w-[200px] !border-b-0" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        {cards.map((c) => (
          <div key={c.title} className="reveal flex flex-col gap-2 rounded-[22px] border border-line bg-white p-[18px]">
            <IconTile bg={c.bg} small>
              <Svg stroke={c.stroke} size={20}>
                {c.icon}
              </Svg>
            </IconTile>
            <h4 className="text-[17px] font-bold">{c.title}</h4>
            <p className="text-[13px] leading-normal text-ink-2">{c.mobile}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
