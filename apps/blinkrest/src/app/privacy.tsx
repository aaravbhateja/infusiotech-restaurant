import { router } from 'expo-router';
import { Text } from 'react-native';

import { LegalPage, type LegalSection } from '@/components/LegalPage';
import { colors, fonts } from '@/theme/tokens';

// Drafted from what the product actually does. Keep it in step with the
// code (new data collected, new service providers) and have counsel review
// it — docs/11_Terms_Privacy_Data_Processing is an outline, not final text.
const SECTIONS: LegalSection[] = [
  {
    heading: '1. Who is responsible for your data',
    body: [
      {
        bullets: [
          'Restaurant owners and staff: InfusioTech decides how your account information is used, so we are responsible for it.',
          'Guests who order through a table QR code: the restaurant you order from decides what to do with your order details. We process them on the restaurant’s behalf to run the service.',
        ],
      },
    ],
  },
  {
    heading: '2. Information we collect',
    body: [
      { label: 'Restaurant owners and staff' },
      {
        bullets: [
          'Name, email address and, if you give it, phone number.',
          'Your role and permissions, and sign-in session details.',
          'A notification token for your device, if you allow notifications.',
          'Activity records, such as which team member accepted an order.',
        ],
      },
      { label: 'Restaurants' },
      {
        bullets: [
          'Restaurant name, address, contact details, GST and FSSAI details, logo and photos.',
          'Menu, prices, tables, offers and settings.',
        ],
      },
      { label: 'Guests (no account needed)' },
      {
        bullets: [
          'The name and mobile number you enter at checkout.',
          'What you ordered, any special instructions, and the order’s status.',
          'Ratings and comments, if you choose to leave them.',
          'Whether and how an order was paid (for example UPI or card).',
        ],
      },
      { label: 'Restaurants that accept online payments' },
      {
        bullets: [
          'Business type and legal name, PAN, and business PAN and GSTIN where they apply.',
          'Bank account holder name, account number and IFSC code, used to pay the restaurant.',
          'The last four digits of the Aadhar number and an irreversible hash of it. We never store the full Aadhar number.',
        ],
      },
      { label: 'Technical information' },
      {
        bullets: [
          'IP address, device and browser type, and logs created when you use the service. We use these for security and troubleshooting.',
        ],
      },
      'We do not access your camera, microphone, contacts or location. The app asks for photo access only so you can pick a picture to upload (such as a dish photo) or save a table QR code to your photos.',
    ],
  },
  {
    heading: '3. How we use it',
    body: [
      {
        bullets: [
          'To run BlinkRest: orders, menus, tables, staff and payments.',
          'To sign you in with a one-time code or password and keep accounts secure.',
          'To take online payments and pay restaurants.',
          'To check a restaurant’s details before online payments are switched on.',
          'To send notifications about orders, payments and your account.',
          'To give support, fix problems and prevent fraud and misuse.',
          'To meet legal duties, such as tax and accounting rules.',
        ],
      },
      'We do not sell personal data and we do not use it for third-party advertising.',
      'We rely on your consent (for example, notifications, photo access, and the details you enter at checkout), on what is needed to provide the service you asked for, and on our legal obligations.',
    ],
  },
  {
    heading: '4. Payments',
    body: [
      'Online payments are handled by Razorpay. Your card, UPI and bank details are entered on Razorpay’s checkout and do not reach our servers or the restaurant. We keep only a payment reference, the type of payment, the amount and the status. Razorpay’s own privacy policy applies to what you give them.',
      'Each online payment is split automatically between the restaurant and InfusioTech’s platform fee.',
    ],
  },
  {
    heading: '5. Who we share it with',
    body: [
      'We share information only as needed to run the service:',
      {
        bullets: [
          'The restaurant you order from, which sees your name, number and order.',
          'Supabase: database, sign-in, file storage and server functions.',
          'Razorpay: payments, and the payout account and verification for restaurants. For restaurants we send PAN, business details, bank account and contact details. We do not send Aadhar.',
          'Expo, Google (Firebase Cloud Messaging) and Apple: delivering push notifications.',
          'Resend: sending sign-in code emails.',
          'Vercel: hosting the website and table ordering pages.',
          'Authorities or courts, when the law requires it.',
          'A buyer or successor, if InfusioTech’s business is ever transferred. Your information would stay covered by this policy.',
        ],
      },
      'Some of these providers may process data on servers outside India.',
    ],
  },
  {
    heading: '6. Cookies and local storage',
    body: [
      'We do not use advertising or analytics cookies. On the web, your browser’s local storage keeps staff signed in and remembers a guest’s latest order so the page keeps working after a refresh. Clearing your site data removes it.',
    ],
  },
  {
    heading: '7. How long we keep it',
    body: [
      {
        bullets: [
          'Account information: until you delete your account.',
          'Order, payment and invoice records: for as long as tax and accounting laws require. After an account is deleted these stay, but no longer name the deleted person.',
          'Guest names and numbers: kept by the restaurant while it uses BlinkRest, and erased when the restaurant closes.',
          'Bank and verification details: kept while the restaurant accepts online payments, and erased from our systems when its account is closed. Razorpay keeps its own records under its policies.',
          'Backups and logs: deleted data can remain in routine backups and logs for a limited time until they are overwritten.',
        ],
      },
    ],
  },
  {
    heading: '8. Deleting your account',
    body: [
      'In the app, go to More, then Delete account. If you cannot sign in, email us from the address on your account. The page below explains exactly what is erased and what is kept.',
    ],
  },
  {
    heading: '9. Your rights',
    body: [
      'You can ask to see the information we hold about you, correct it, delete it, or withdraw a consent you gave. You can also complain to us about how your data is handled. Email or call us using the details below. We may need to confirm who you are first, and we aim to reply within 30 days.',
      'If you ordered as a guest, you can also ask the restaurant you ordered from.',
    ],
  },
  {
    heading: '10. Security',
    body: [
      'Data is sent over encrypted connections. Each restaurant can see only its own data, enforced by role-based permissions and database access rules. Table QR codes are stored only as hashes, and we never keep a full Aadhar number. No system is perfectly secure. If a breach affects you, we will tell you and the authorities as the law requires.',
    ],
  },
  {
    heading: '11. Children',
    body: ['BlinkRest is for businesses and their customers. It is not directed at anyone under 18, and we do not knowingly collect their information.'],
  },
  {
    heading: '12. Changes to this policy',
    body: ['If we change this policy we will update the date above, and tell you in the app if the change is significant.'],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="5 October 2026"
      intro={
        'BlinkRest is a restaurant ordering and management app from InfusioTech (“we”). This policy explains what we collect, why, who we share it with, how long we keep it, and the choices you have. It covers the BlinkRest app, the website and the table QR ordering pages.'
      }
      sections={SECTIONS}
    >
      <Text
        onPress={() => router.push('/account-deletion' as never)}
        style={{ fontSize: 15, fontFamily: fonts.bodyBold, color: colors.coral600, textDecorationLine: 'underline' }}
      >
        How to delete your account and what happens to your data
      </Text>
    </LegalPage>
  );
}
