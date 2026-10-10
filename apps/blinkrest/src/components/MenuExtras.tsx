import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

export const ALLERGENS = ['gluten', 'dairy', 'egg', 'nuts', 'peanuts', 'soy', 'fish', 'shellfish', 'sesame'] as const;
export const SPICE = ['Mild', 'Medium', 'Hot'] as const;

export type Combo = { menu_item_id: string; qty: number }[];

const input = { height: 46, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 16, color: colors.ink900 } as const;
const label = { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 } as const;

function Pill({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900, textTransform: 'capitalize' }}>{text}</Text>
    </Pressable>
  );
}

// Allergens, spice level and Hindi name / description for a dish.
export function MenuExtras({
  allergens, setAllergens, spice, setSpice, nameHi, setNameHi, descHi, setDescHi,
}: {
  allergens: string[]; setAllergens: (v: string[]) => void;
  spice: number | null; setSpice: (v: number | null) => void;
  nameHi: string; setNameHi: (v: string) => void;
  descHi: string; setDescHi: (v: string) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <Text style={label}>Contains (allergens)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ALLERGENS.map((a) => (
            <Pill key={a} text={a} on={allergens.includes(a)} onPress={() => setAllergens(allergens.includes(a) ? allergens.filter((x) => x !== a) : [...allergens, a])} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={label}>Spice level</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pill text="None" on={spice === null} onPress={() => setSpice(null)} />
          {SPICE.map((s, i) => <Pill key={s} text={s} on={spice === i + 1} onPress={() => setSpice(i + 1)} />)}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={label}>Hindi name (optional)</Text>
        <TextInput value={nameHi} onChangeText={setNameHi} placeholder="जैसे: पनीर टिक्का" placeholderTextColor={colors.ink500} style={input} />
        <TextInput value={descHi} onChangeText={setDescHi} placeholder="Hindi description (optional)" placeholderTextColor={colors.ink500} style={input} />
      </View>
    </View>
  );
}

// Make a dish a combo: the dishes it includes and how many of each. Stock and
// cost follow the included dishes automatically.
export function ComboEditor({ itemId, value, onChange }: { itemId: string; value: Combo; onChange: (v: Combo) => void }) {
  const [menu, setMenu] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase.from('menu_items').select('id, name').neq('id', itemId).order('name').then(({ data }) => setMenu(data ?? []));
  }, [itemId]);

  const nameOf = (id: string) => menu.find((m) => m.id === id)?.name ?? 'Dish';
  const setQty = (id: string, q: number) => onChange(q <= 0 ? value.filter((v) => v.menu_item_id !== id) : value.map((v) => (v.menu_item_id === id ? { ...v, qty: q } : v)));

  return (
    <View style={{ gap: 10 }}>
      <Text style={label}>Combo contents</Text>
      <Text style={{ fontSize: 12, color: colors.ink500 }}>Leave empty for a normal dish. Add dishes to make this a combo or thali.</Text>
      {value.map((v) => (
        <View key={v.menu_item_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{nameOf(v.menu_item_id)}</Text>
          <Pressable onPress={() => setQty(v.menu_item_id, v.qty - 1)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: fonts.bodyExtraBold }}>−</Text></Pressable>
          <Text style={{ minWidth: 20, textAlign: 'center', fontFamily: fonts.bodyExtraBold }}>{v.qty}</Text>
          <Pressable onPress={() => setQty(v.menu_item_id, v.qty + 1)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: fonts.bodyExtraBold }}>+</Text></Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {menu.filter((m) => !value.some((v) => v.menu_item_id === m.id)).slice(0, 40).map((m) => (
          <Pill key={m.id} text={`+ ${m.name}`} on={false} onPress={() => onChange([...value, { menu_item_id: m.id, qty: 1 }])} />
        ))}
      </View>
    </View>
  );
}
