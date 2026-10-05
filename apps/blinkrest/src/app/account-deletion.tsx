import { router } from 'expo-router';
import { Text } from 'react-native';

import { LegalPage, type LegalSection } from '@/components/LegalPage';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { colors, fonts } from '@/theme/tokens';

// Public page with no sign-in needed: Google Play asks for a web address
// where people can learn how to delete their account and data.
const SECTIONS: LegalSection[] = [
  {
    heading: 'In the app',
    body: [
      {
        bullets: [
          'Open BlinkRest and sign in.',
          'Go to More, then tap Delete account.',
          'Read what will happen, type DELETE and confirm.',
        ],
      },
      'Your account is deleted straight away and you are signed out.',
    ],
  },
  {
    heading: 'If you can’t sign in',
    body: [
      `Email ${SUPPORT_EMAIL} from the address on your account, with the subject “Delete my account”. We will confirm it is you and delete the account within 30 days.`,
    ],
  },
  {
    heading: 'What is deleted',
    body: [
      {
        bullets: [
          'Your login and profile: name, email and phone number.',
          'Your role and permissions at every restaurant you belong to.',
          'Your notification tokens and shift records.',
        ],
      },
    ],
  },
  {
    heading: 'What is kept',
    body: [
      'Order, payment and invoice records belong to the restaurant and must be kept for tax and accounting. They stay, but they no longer name you. Activity records, such as who accepted an order, stay without your name.',
      'Deleted data may remain in routine backups for a short time until they are overwritten.',
    ],
  },
  {
    heading: 'If you own a restaurant',
    body: [
      {
        bullets: [
          'If you are its only owner and it has no other active team members, deleting your account also closes the restaurant. Ordering stops, its QR codes stop working, the subscription is cancelled, and its bank and verification details, guest names and phone numbers, and pending invitations are erased. Its order and payment records are kept.',
          'If it still has active team members, remove them first (More, then Staff). We do not delete an owner’s account while staff depend on the restaurant.',
          'If another owner exists, the restaurant carries on without you.',
        ],
      },
    ],
  },
  {
    heading: 'If you ordered as a guest',
    body: [
      `Guests do not have accounts. To have the name and number you gave at checkout erased, email ${SUPPORT_EMAIL} or ask the restaurant.`,
    ],
  },
];

export default function AccountDeletion() {
  return (
    <LegalPage
      title="Delete your account"
      updated="5 October 2026"
      intro="You can delete your BlinkRest account at any time. This page explains how, and what happens to your information."
      sections={SECTIONS}
    >
      <Text
        onPress={() => router.push('/privacy' as never)}
        style={{ fontSize: 15, fontFamily: fonts.bodyBold, color: colors.coral600, textDecorationLine: 'underline' }}
      >
        Read our Privacy Policy
      </Text>
    </LegalPage>
  );
}
