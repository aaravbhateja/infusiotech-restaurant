'use client';

import { useRef, useState } from 'react';

import { Phone, shots } from './Phone';

type Role = {
  key: string;
  label: string;
  img: string;
  alt: string;
  title: string;
  desc: string;
  points: string[];
  pointsMobile: string[];
};

const roles: Role[] = [
  {
    key: 'owner',
    label: 'Owner',
    img: shots.owner,
    alt: 'Owner home with live orders, revenue and quick actions',
    title: 'The whole business, in your pocket.',
    desc: 'Open the app and know how tonight is going before you reach the restaurant.',
    points: [
      'Live orders, today’s revenue and average order value at a glance',
      'Payouts, settlements and subscription stay owner-only',
      'Switch between branches in one tap',
    ],
    pointsMobile: [
      'Live orders and today’s revenue at a glance',
      'Payouts and subscription stay owner-only',
      'Switch branches in one tap',
    ],
  },
  {
    key: 'manager',
    label: 'Manager',
    img: shots.manager,
    alt: 'Manager home with items that need attention',
    title: 'Run the shift, not the spreadsheet.',
    desc: 'Everything that needs a decision shows up first, so the floor never waits on you.',
    points: [
      'Approve discount requests from the floor',
      'Spot late tables, bill requests and dishes running low',
      'See who’s on shift and how loaded the kitchen is',
    ],
    pointsMobile: [
      'Approve discount requests from the floor',
      'Spot late tables and dishes running low',
      'See who’s on shift and kitchen load',
    ],
  },
  {
    key: 'cashier',
    label: 'Cashier',
    img: shots.cashier,
    alt: 'Cashier counter queue with bills to collect',
    title: 'A counter queue that clears itself.',
    desc: 'Online payments settle on their own. Only pay-at-counter bills land here.',
    points: [
      'Guests waiting at the counter are listed first',
      'Scan a guest’s order code to pull up their bill',
      'Count the cash drawer and close the shift',
    ],
    pointsMobile: [
      'Guests waiting at the counter come first',
      'Scan a guest’s code to pull up the bill',
      'Count the drawer and close the shift',
    ],
  },
  {
    key: 'waiter',
    label: 'Waiter',
    img: shots.waiter,
    alt: 'Waiter view of assigned tables and ready food',
    title: 'Every table, every call, one screen.',
    desc: 'Waiters see only their tables — and exactly what each one needs next.',
    points: [
      'Ready-at-the-pass alerts to mark food served',
      'Guest calls from the QR menu: water, plates, the bill',
      'Take orders and add items table by table',
    ],
    pointsMobile: [
      'Ready-at-the-pass alerts',
      'Guest calls from the QR menu',
      'Take orders table by table',
    ],
  },
  {
    key: 'kitchen',
    label: 'Kitchen',
    img: shots.kitchen,
    alt: 'Kitchen queue with tickets, timers and instructions',
    title: 'Tickets that tell the chef everything.',
    desc: 'A dark, high-contrast queue built to be read from across a busy kitchen.',
    points: [
      'Queue by station with a live timer on every ticket',
      'Jain, less-spicy and add-on notes in red, right on the item',
      'Start cooking and mark ready in one tap',
    ],
    pointsMobile: [
      'Live timer on every ticket',
      'Jain and less-spicy notes in red',
      'Start cooking, mark ready — one tap',
    ],
  },
];

export function Roles() {
  const [current, setCurrent] = useState(roles[0].key);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = roles.find((r) => r.key === current) ?? roles[0];

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % roles.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + roles.length) % roles.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = roles.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setCurrent(roles[next].key);
    tabRefs.current[roles[next].key]?.focus();
  };

  return (
    <section id="roles" className="border-t border-white/[0.08] bg-ink text-cream md:relative md:overflow-hidden">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-16 md:relative md:gap-11 md:px-6 md:py-[110px]">
        <div className="reveal flex max-w-[760px] flex-col gap-3 px-1 md:gap-4 md:px-0">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-saffron md:text-[13px]">
            For your whole team
          </span>
          <h2 className="text-[34px] font-extrabold leading-[1.04] text-white md:text-[clamp(36px,4.6vw,62px)] md:leading-[1.02]">
            <span className="md:hidden">One app. Five roles.</span>
            <span className="hidden md:inline">One app. Five roles. Everyone sees just their job.</span>
          </h2>
          <p className="text-base leading-[1.6] text-sand md:text-[19px]">
            <span className="md:hidden">Everyone sees just their job — permissions are checked on our servers.</span>
            <span className="hidden md:inline">
              Invite staff by SMS or WhatsApp. Every permission is checked on our servers — not just hidden in the app.
            </span>
          </p>
        </div>

        <div className="hscroll" role="tablist" aria-label="Roles">
          {roles.map((r, i) => {
            const on = r.key === current;
            return (
              <button
                key={r.key}
                ref={(el) => {
                  tabRefs.current[r.key] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${r.key}`}
                aria-selected={on}
                aria-controls="role-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setCurrent(r.key)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`min-h-11 flex-none cursor-pointer rounded-full border-[1.5px] px-[18px] text-[15px] font-bold transition-colors duration-200 md:min-h-12 md:px-[22px] md:py-3 md:text-base ${
                  on
                    ? 'border-coral bg-coral text-ink'
                    : 'border-ink-2 bg-transparent text-cream hover:border-sand-2'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <div
          id="role-panel"
          role="tabpanel"
          aria-labelledby={`tab-${active.key}`}
          className="flex flex-col gap-6 md:flex-row md:flex-wrap md:items-center md:gap-14"
        >
          {/* Phone first on mobile, to the right on desktop */}
          <div className="scene order-first flex h-[470px] items-center justify-center md:order-last md:h-[640px] md:min-w-0 md:flex-[1_1_380px]">
            <div className="spin3d">
              <Phone
                key={active.key}
                src={active.img}
                alt={active.alt}
                sizes="(min-width: 768px) 290px, 220px"
                className="w-[220px] !border-[#3a3331] !bg-[#3a3331] md:w-[290px]"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-6 px-1 md:flex-[1_1_400px] md:gap-[22px] md:px-0">
            <h3 className="text-[26px] font-extrabold leading-[1.1] text-white md:text-[clamp(30px,3.2vw,44px)] md:leading-[1.08]">
              {active.title}
            </h3>
            <p className="hidden text-lg leading-[1.6] text-sand md:block">{active.desc}</p>
            <ul className="m-0 hidden list-none flex-col gap-3.5 p-0 md:flex">
              {active.points.map((t) => (
                <li key={t} className="flex gap-3 text-[17px] leading-normal">
                  <span className="ck dark" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
              {active.pointsMobile.map((t) => (
                <li key={t} className="flex gap-2.5 text-[15px] leading-normal">
                  <span className="ck dark" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
