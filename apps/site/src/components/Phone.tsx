import Image from 'next/image';
import type { CSSProperties } from 'react';

export const shots = {
  owner: '/images/owner-dashboard.webp',
  manager: '/images/manager-home.webp',
  cashier: '/images/cashier-queue.webp',
  waiter: '/images/waiter-tables.webp',
  kitchen: '/images/kitchen-queue.webp',
  liveOrders: '/images/live-orders.webp',
  tables: '/images/tables.webp',
  guestMenu: '/images/guest-qr-menu.webp',
  payment: '/images/payment-success.webp',
} as const;

type PhoneProps = {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
  imgStyle?: CSSProperties;
};

/** A phone frame around one of the 780x1600 app screenshots. */
export function Phone({ src, alt, sizes, className = '', style, priority = false, imgStyle }: PhoneProps) {
  return (
    <div className={`phone ${className}`} style={style}>
      <Image
        src={src}
        alt={alt}
        width={780}
        height={1600}
        sizes={sizes}
        priority={priority}
        fetchPriority={priority ? 'high' : undefined}
        loading={priority ? 'eager' : undefined}
        style={imgStyle}
      />
    </div>
  );
}
