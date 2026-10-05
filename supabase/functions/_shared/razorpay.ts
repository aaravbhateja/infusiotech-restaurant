// Thin, explicit wrapper around Razorpay's REST API — no SDK, matching the
// style already used in create-order / create-razorpay-order. Centralised
// here once a third function (submit-tenant-kyc) needed the same Basic-auth
// request pattern for Razorpay's Route Account/Stakeholder/Product APIs.

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;

function authHeader(): string {
  return `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`;
}

export class RazorpayError extends Error {
  constructor(public status: number, public detail: string) {
    super(`razorpay_request_failed: ${status}`);
  }
}

export async function razorpayFetch(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown) {
  const res = await fetch(`https://api.razorpay.com/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new RazorpayError(res.status, data ? JSON.stringify(data) : await res.text().catch(() => ''));
  }
  return data;
}

type BusinessType = 'individual' | 'proprietorship' | 'partnership' | 'llp' | 'private_limited';

// Razorpay's own business_type enum doesn't match ours one-to-one.
const BUSINESS_TYPE_MAP: Record<BusinessType, string> = {
  individual: 'individual',
  proprietorship: 'proprietorship',
  partnership: 'partnership',
  llp: 'llp',
  private_limited: 'private_limited',
};

// Creates a Razorpay Route Linked Account for a restaurant, attaches the
// authorized signatory as a Stakeholder, and requests the `route` product
// with settlement bank details — the three calls Razorpay's own onboarding
// docs describe as the minimum to get a linked account into review.
// Returns the account id and Razorpay's own status for it; it is NOT
// instantly "activated" just because these calls succeeded — that's
// Razorpay's own underwriting decision, reported later via webhook.
export async function createRazorpayLinkedAccount(input: {
  legalBusinessName: string;
  businessType: BusinessType;
  pan: string;
  businessPan: string | null;
  gstin: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  bankAccountHolderName: string;
  bankAccountNumber: string;
  bankIfsc: string;
}): Promise<{ accountId: string; status: string }> {
  const account = await razorpayFetch('v2/accounts', 'POST', {
    email: input.contactEmail,
    phone: input.contactPhone,
    type: 'route',
    legal_business_name: input.legalBusinessName,
    business_type: BUSINESS_TYPE_MAP[input.businessType],
    contact_name: input.contactName,
    profile: {
      category: 'food',
      subcategory: 'restaurant',
      addresses: {},
    },
    legal_info: {
      pan: input.businessType === 'individual' ? input.pan : input.businessPan ?? input.pan,
      gst: input.gstin ?? undefined,
    },
  });

  const accountId: string = account.id;

  await razorpayFetch(`v2/accounts/${accountId}/stakeholders`, 'POST', {
    name: input.contactName,
    email: input.contactEmail,
    kyc: { pan: input.pan },
  });

  const product = await razorpayFetch(`v2/accounts/${accountId}/products`, 'POST', {
    product_name: 'route',
    tnc_accepted: true,
    settlements: {
      account_number: input.bankAccountNumber,
      ifsc_code: input.bankIfsc,
      beneficiary_name: input.bankAccountHolderName,
    },
  });

  return { accountId, status: typeof product.activation_status === 'string' ? product.activation_status : account.status };
}
