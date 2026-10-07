import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { colors, fonts } from '@/theme/tokens';

export type LegalBlock = string | { bullets: string[] } | { label: string };
export type LegalSection = { heading: string; body: LegalBlock[] };

// Shared reading layout for public text pages (privacy policy, account
// deletion). Lives outside the staff area so it works signed out, on the web
// and inside the app, and so store listings can link straight to it.
export function LegalPage({
  title,
  updated,
  intro,
  sections,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
  children?: ReactNode;
}) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 20, paddingBottom: 48 }}>
        <View style={{ width: '100%', maxWidth: 720, gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              accessibilityLabel="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
            </Pressable>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>{title}</Text>
          </View>

          <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink500 }}>Last updated {updated}</Text>
          {intro ? <Text style={{ fontSize: 15, lineHeight: 23, color: colors.ink700 }}>{intro}</Text> : null}

          {sections.map((s) => (
            <View key={s.heading} style={{ gap: 8 }}>
              <Text style={{ fontSize: 17, fontFamily: fonts.bodyExtraBold, color: colors.ink900, marginTop: 6 }}>{s.heading}</Text>
              {s.body.map((b, i) =>
                typeof b === 'string' ? (
                  <Text key={i} style={{ fontSize: 15, lineHeight: 23, color: colors.ink700 }}>
                    {b}
                  </Text>
                ) : 'label' in b ? (
                  <Text key={i} style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900, marginTop: 6 }}>
                    {b.label}
                  </Text>
                ) : (
                  <View key={i} style={{ gap: 6, paddingLeft: 4 }}>
                    {b.bullets.map((item) => (
                      <View key={item} style={{ flexDirection: 'row', gap: 10 }}>
                        <Text style={{ fontSize: 15, lineHeight: 23, color: colors.ink500 }}>{'•'}</Text>
                        <Text style={{ flex: 1, fontSize: 15, lineHeight: 23, color: colors.ink700 }}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ),
              )}
            </View>
          ))}

          {children}

          <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10, marginTop: 6 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Questions or requests?</Text>
            <Text style={{ fontSize: 14, lineHeight: 21, color: colors.ink700 }}>
              InfusioTech is the company behind BlinkRest. This is also our contact for privacy questions and complaints.
            </Text>
            <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}>
              <Icon name="mail" size={18} color={colors.coral600} />
              <Text style={{ fontSize: 15, fontFamily: fonts.bodyBold, color: colors.coral600 }}>{SUPPORT_EMAIL}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
