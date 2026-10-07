/** Small inline icons and the BlinkRest mark, taken from the design artboards. */

type MarkProps = { size?: number; bolt?: string };

export function LogoMark({ size = 32, bolt = '#FFC93C' }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle
        cx="16"
        cy="16"
        r="11.5"
        fill="none"
        stroke="#FF5A36"
        strokeWidth="4.5"
        strokeDasharray="28 8.13"
        transform="rotate(-30 16 16)"
      />
      <path d="M19.5 2 L8 18.5 H15 L12 30 L24.5 13 H17.5 Z" fill={bolt} />
    </svg>
  );
}

/** On the cream footer the brand coral is a hair under 3:1, so pass `accent` there. */
export function Wordmark({ className = '', accent = 'text-coral' }: { className?: string; accent?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-[-0.02em] ${className}`}>
      Blink<span className={accent}>Rest</span>
    </span>
  );
}

/** The white-ring mark used on the coral tile in the closing section. */
export function LogoTile({ size = 70 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle
        cx="16"
        cy="16"
        r="10.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeDasharray="25 8"
        transform="rotate(-30 16 16)"
      />
      <path
        d="M19 3 L9 18 H15 L12.5 29 L23.5 13.5 H17.5 Z"
        fill="#FFC93C"
        stroke="#C2330F"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Bolt({ size = 20, fill = '#FFC93C' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 1 L4 14 H11 L9 23 L20 9 H13 Z" fill={fill} />
    </svg>
  );
}

export function PhoneDownIcon({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1B1716"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M12 7v7M9 11l3 3 3-3M10.5 18.5h3" />
    </svg>
  );
}

export function PlayIcon({ size = 26, detail = true }: { size?: number; detail?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1B1716"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3.5v17l15-8.5z" />
      {detail ? <path d="M5 3.5l9.5 9.5M5 20.5l9.5-8" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function PlayTriangle({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4l13 8-13 8z" fill="#FFFFFF" />
    </svg>
  );
}

export function PauseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="#1B1716" />
    </svg>
  );
}
