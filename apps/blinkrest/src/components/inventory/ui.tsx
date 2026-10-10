import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

export type InvItem = {
  id: string;
  name: string;
  unit: 'kg' | 'g' | 'l' | 'ml' | 'pcs';
  purchase_unit: string | null;
  purchase_factor: number;
  current_qty: number;
  cost_per_unit_minor: number;
  min_qty: number;
  perishable: boolean;
  is_active: boolean;
};

export const UNITS = ['kg', 'g', 'l', 'ml', 'pcs'] as const;

export const qtyText = (n: number) => String(Math.round(n * 1000) / 1000);
// Cost values are stored per base unit in paise.
export const rupees = (paise: number, digits = 2) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const card = { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 8 } as const;
export const heading = { fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 } as const;

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{label}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, tone = 'primary', disabled }: { label: string; onPress: () => void; tone?: 'primary' | 'dark' | 'ghost' | 'danger'; disabled?: boolean }) {
  const bg = tone === 'primary' ? colors.coral600 : tone === 'dark' ? colors.ink900 : tone === 'danger' ? colors.error : colors.surface;
  const fg = tone === 'ghost' ? colors.ink900 : '#FFFFFF';
  return (
    <Pressable disabled={disabled} onPress={onPress} style={{ height: 46, borderRadius: radius.pill, backgroundColor: bg, borderWidth: tone === 'ghost' ? 1.5 : 0, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ fontFamily: fonts.bodyExtraBold, color: fg, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }: { label?: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: KeyboardTypeOptions; multiline?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink500}
        keyboardType={keyboardType}
        multiline={multiline}
        style={{ minHeight: 46, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink900, backgroundColor: colors.surface }}
      />
    </View>
  );
}

// Bottom sheet used for every inventory form.
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30, gap: 12, maxHeight: '90%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>{title}</Text>
            <Pressable onPress={onClose} style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
