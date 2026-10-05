import { Platform } from 'react-native';

export type RazorpayResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };

let scriptPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if ((window as any).Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection and try again.'));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

// Opens Razorpay's hosted checkout (web only — the real customer ordering
// flow is always a browser reached via QR scan, never the native app
// directly, so there is no native Razorpay SDK wired up here). Resolves
// with the payment proof to send to create-order for signature
// verification, or rejects if the customer closes the sheet or it fails.
export function openRazorpayCheckout(opts: {
  keyId: string;
  amountMinor: number;
  currency: string;
  razorpayOrderId: string;
  name: string;
  description: string;
  prefill?: { name?: string; contact?: string };
}): Promise<RazorpayResult> {
  if (Platform.OS !== 'web') {
    return Promise.reject(new Error('Online payment is available on the web ordering page.'));
  }
  return loadCheckoutScript().then(
    () =>
      new Promise<RazorpayResult>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: opts.keyId,
          amount: opts.amountMinor,
          currency: opts.currency,
          name: opts.name,
          description: opts.description,
          order_id: opts.razorpayOrderId,
          prefill: opts.prefill ?? {},
          theme: { color: '#D9381A' },
          handler: (res: RazorpayResult) => resolve(res),
          modal: { ondismiss: () => reject(new Error('cancelled')) },
        });
        rzp.on('payment.failed', () => reject(new Error('Payment failed. Please try again.')));
        rzp.open();
      }),
  );
}
