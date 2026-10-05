# 13 — Store Submission Package

This covers the four remaining pre-submission items. Everything that is pure
writing (descriptions, answers, scripts) is done below, ready to paste. Two
things cannot be done from this sandbox and are marked **YOU DO THIS** —
they need a real phone/Mac and your own store accounts, which this
environment has neither.

---

## 1. App description, category, age rating

### Short description (Google Play, 80 chars max)
```
QR ordering, kitchen display & billing for restaurants and cafes.
```
(67 chars)

### Full description (Google Play, 4000 chars max / Apple "Promotional text" + "Description")
```
BlinkRest turns a phone into a full restaurant point-of-sale: guests order
by scanning a table QR code, the kitchen sees tickets the moment they're
placed, and staff manage billing, tables and the menu from the same app —
no separate hardware required.

FOR GUESTS
• Scan the table QR, browse the menu, and order — no app download needed
• Track order status live, from placed to served
• Call a waiter, or ask for the bill, right from the table
• Pay online (where the restaurant has enabled it) or pay by cash at the
  counter

FOR RESTAURANT STAFF
• Live order queue with kitchen display view
• Table and QR code management — generate, reprint, or rotate codes anytime
• Menu management with photos, pricing and availability toggles
• Role-based staff accounts (owner, manager, kitchen, waiter) with
  fine-grained permissions
• Order notifications the moment a table orders, pays, or needs help
• Sales and performance reporting
• Multi-branch support for restaurant groups

PAYMENTS
Restaurants that want to accept online payments complete a one-time
verification (PAN, Aadhar and bank details) before the option is enabled.
Payments are processed by Razorpay and settle directly to the restaurant's
own bank account.

BlinkRest is built and supported by InfusioTech.
```

### Category
- **Google Play**: Food & Drink (primary). Business is a reasonable
  secondary if the listing form allows only one and you want this framed as
  a restaurant-operations tool instead — but Food & Drink is the better fit
  since guests also use it directly.
- **Apple App Store**: Food & Drink, with Business as a secondary category.

### Age rating
There is no user-generated content guests broadcast to other guests, no
chat between strangers, no gambling, and no mature content anywhere in the
app.
- **Google Play Data Safety / IARC questionnaire**: answer "No" to every
  violence/sexual-content/gambling/user-generated-content question. This
  lands at **PEGI 3 / Everyone**.
- **Apple Age Rating questionnaire**: answer "No" to every category
  (Cartoon/Fantasy Violence, Mature Themes, etc.). This lands at **4+**.

### Screenshots — what to capture, in order
You need real screenshots from a running build (see §4 — this is the part
that needs a real device). Capture these six, in this order, since
listings are judged by the first 2–3 images:
1. Guest menu screen (post table-QR-scan) — your best-looking dish photos
2. Guest order-tracking screen showing live status
3. Staff "Orders" screen with a few orders in different states
4. Kitchen display / order queue
5. Table management with QR codes visible
6. Staff Settings → "Online payments & KYC" screen (shows this isn't a toy
   app — it has real payment infrastructure)

Suggested captions (Google Play allows captions under each; Apple shows the
image alone, so put equivalent text in the description):
1. "Guests order straight from the table — no app, no waiting for staff"
2. "Live order tracking, from kitchen to table"
3. "One queue for every table, every order"
4. "Built for the kitchen — see what to cook next"
5. "QR codes for every table, printable in seconds"
6. "Accept online payments, settled straight to your bank account"

---

## 2. Apple reviewer demo account

Apple's reviewers cannot scan a physical QR code, so the demo account must
let them reach every screen through login alone. **YOU DO THIS PART** —
this sandbox has no production credentials, so none of this can be run
from here.

The safest way to create a correct demo account is to **go through the
app's own signup flow**, not hand-written SQL against tables like
`tenant_memberships` — those rows are deliberately only ever created by
the app's own `create_tenant_and_owner()`/invitation functions (see
`supabase/migrations/0009_onboarding_and_invitations.sql`), and hand
inserts are likely to get a foreign key or role wrong:

1. In the BlinkRest app itself (or the guest/staff web build), sign up a
   brand-new account with:
   ```
   email:    appreview@infusiotech.com
   password: <pick something you'll also paste into App Store Connect>
   ```
2. Complete onboarding as you normally would — name the restaurant
   something obvious, e.g. **"BlinkRest Demo Kitchen"**.
3. As that owner, add one table (Settings → Tables → New table) and one
   menu item with a photo, so the reviewer doesn't land on an empty app.
4. Only the payment-KYC bypass needs raw SQL, because
   `set_tenant_pay_online()` deliberately refuses to enable payments
   without verified KYC (see `supabase/migrations/0047_tenant_payment_kyc.sql`
   lines 211–241) — which is correct for real restaurants but not useful
   for a reviewer who shouldn't need to submit fake PAN/Aadhar/bank
   details. Run this one line in the Supabase SQL Editor (service-role
   access bypasses the function, same mechanism migrations themselves use):
   ```sql
   update public.tenants set pay_online_enabled = true
   where slug = '<the slug your signup step generated>';
   ```

**App Store Connect → App Review Information**, paste:
```
Demo account:
  Email:    appreview@infusiotech.com
  Password: <the one you set>

Notes for the reviewer:
This app has two sides. Guests order by scanning a table's QR code — no
login needed — and reach the guest menu directly. Staff (restaurant owners
and their team) sign in with the account above to manage orders, tables,
and the menu.

To see the guest flow: after signing in to the demo account, open Tables,
tap the table you created, and use "Copy link" (or "Share") to get that
table's guest ordering URL — open it in any browser to reach the guest
menu without needing to scan a physical QR code.

Online payments require a one-time KYC step (PAN, Aadhar, bank details)
before a restaurant can accept them; the demo account already has this
enabled so you can see the paid checkout flow without submitting real KYC
documents.
```


Google Play's review is mostly automated and rarely needs a demo account,
but if you're asked for one in the Play Console review notes, give the
same credentials and notes.

---

## 3. Google Data Safety form / Apple App Privacy questionnaire

These answers are grounded in the actual code (checked in this session):
no analytics SDK, no ad SDK, no crash-reporting SDK, no location access,
no social login — just Supabase (auth + database) and Razorpay (payments).

### Data collected

| Data type | Collected? | Purpose | Shared with |
|---|---|---|---|
| Name | Yes (staff + restaurant profile) | Account functionality | Not shared |
| Email address | Yes (staff login) | Account creation, auth (OTP/password) | Supabase (processor) |
| Phone number | Yes (restaurant contact number) | App functionality (guest-facing contact) | Not shared externally |
| Physical address | Yes (restaurant address) | App functionality | Not shared |
| Photos | Yes (menu/dish photos, logo) | App functionality | Supabase Storage (processor) |
| Financial info — PAN, Aadhar, bank account/IFSC | Yes, restaurant owners only, during KYC | Required by Razorpay to enable split settlements to the restaurant's bank account | Razorpay (payment processor) |
| Payment info (card/UPI) — guests | Yes, handled by Razorpay Checkout, not stored in this app's database | Processing guest payments | Razorpay |
| Push notification token | Yes | Order/status notifications to staff | Firebase Cloud Messaging (delivery only) |
| Precise/approximate location | No | — | — |
| Contacts | No | — | — |
| Browsing/search history | No | — | — |
| Advertising ID | No | — | — |
| Analytics/crash identifiers | No (no analytics or crash-reporting SDK is integrated) | — | — |

### Google Play Data Safety form — answers
- "Does your app collect or share any of the required user data types?" → **Yes**
- Data types to check: **Personal info** (name, email, address, phone),
  **Financial info** (payment info, and for restaurant owners: other
  financial info — PAN/Aadhar/bank details), **Photos**, **App activity**
  is NOT required (no analytics).
- For each: "Is this data shared with third parties?" → Yes, for payment
  processing (Razorpay) and push delivery (Firebase/Google); financial KYC
  data also shared with Razorpay.
- "Is data collection required or optional?" → Required for core
  functionality (an account can't be created without name/email; a
  restaurant can't accept online payments without KYC).
- "Is data encrypted in transit?" → **Yes** (HTTPS/TLS throughout, Supabase + Razorpay).
- "Can users request data deletion?" → **Yes** — link
  `https://<your-domain>/account-deletion` (the in-app Settings → Delete
  account flow already built this session).
- Security practices section: check "Data is encrypted in transit" and
  "You can request that data be deleted."

### Apple App Privacy (App Store Connect → App Privacy) — answers
Apple's form is organized by data type Apple itself defines. Map as:
- **Contact Info** → Name, Email Address, Phone Number — linked to
  identity, used for App Functionality.
- **Financial Info** → Payment Info, Other Financial Info (PAN/Aadhar/bank,
  restaurant owners only) — linked to identity, used for App Functionality,
  NOT used for tracking.
- **User Content** → Photos or Videos (menu images) — linked to identity,
  App Functionality.
- **Identifiers** → Device ID only if a push token is treated as a device
  identifier (it is) — used for App Functionality (notifications), NOT for
  tracking.
- Everything else (Location, Browsing History, Search History, Usage Data,
  Diagnostics, Contacts, Health, etc.) → **not collected**, leave unchecked.
- "Data Used to Track You" → **None.** (No ad SDK, no cross-app tracking —
  this means you do **not** need an App Tracking Transparency prompt.)

---

## 4. Real-device walkthrough — YOU DO THIS

I cannot do this from this sandbox: there's no Android SDK, no Xcode, no
emulator, no physical phone, and EAS cloud builds need outbound network
this container's policy doesn't allow. Everything I've verified is code
correctness (migrations run against a real local Postgres, RLS/permission
logic tested adversarially, the generated Android manifest/gradle
inspected) and a browser-rendered build of the guest web flow — never the
native app itself on a device. Browser and code checks do not catch
native-only bugs (camera/QR-scanner permission prompts, push notification
delivery, app icon rendering, splash timing on a cold start, keyboard
behavior, safe-area insets on a notch, Android back-gesture behavior).

Build and install a real APK, then run this checklist:

```
eas build --platform android --profile preview
```

**Checklist (check off on a real phone, not Expo Go — a `preview` APK):**
- [ ] Fresh install → splash screen plays once, no flash of wrong content
- [ ] Sign up with a real email → OTP arrives → login succeeds
- [ ] As a staff member: create a table → QR code renders → scan it with
      a second phone (or the same phone's camera app) → guest menu opens
- [ ] Guest: add items, place an order → staff device gets a push
      notification within a few seconds, with the correct total (not ₹0)
- [ ] Mark order served → "Call waiter for bill" button appears (not
      before) → guest taps it → staff sees the request
- [ ] Guest pays online (if KYC/test mode allows) vs. "Cash to be
      collected" label shows correctly for unpaid orders
- [ ] Settings → Delete account → confirm flow works and actually signs
      the device out afterward
- [ ] Settings → Privacy policy → opens and renders
- [ ] Kill the app from the recent-apps tray, reopen → session persists,
      no crash
- [ ] Android back button/gesture doesn't exit the app from a nested
      screen unexpectedly
- [ ] App icon and name look correct on the home screen (not the default
      Expo icon)

Do this before submitting — a native-only crash found by Apple/Google
review costs a multi-day resubmission cycle; found by you now, it's a
same-day fix.
