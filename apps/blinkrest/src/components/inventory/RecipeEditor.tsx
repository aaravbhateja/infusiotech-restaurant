import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

import { Button, Chip, Field, card, heading, qtyText, rupees, type InvItem } from './ui';

type Line = { id: string; qty_per_portion: number; item: { id: string; name: string; unit: string; cost_per_unit_minor: number } | null };

// What goes into one portion of a dish. Stock is deducted automatically when
// the dish is served, and the cost / margin is worked out from current costs.
export function RecipeEditor({ menuItemId, priceMinor }: { menuItemId: string; priceMinor: number }) {
  const { membership } = useAuth();
  const canView = !!membership?.permissions.has('inventory.view');
  const canManage = !!membership?.permissions.has('inventory.manage');
  const [lines, setLines] = useState<Line[]>([]);
  const [items, setItems] = useState<InvItem[]>([]);
  const [adding, setAdding] = useState<InvItem | null>(null);
  const [qty, setQty] = useState('');

  const load = useCallback(async () => {
    if (!canView) return;
    const [{ data: l }, { data: i }] = await Promise.all([
      supabase.from('recipe_lines').select('id, qty_per_portion, item:inventory_items(id, name, unit, cost_per_unit_minor)').eq('menu_item_id', menuItemId),
      supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
    ]);
    setLines((l as unknown as Line[]) ?? []);
    setItems((i as InvItem[]) ?? []);
  }, [menuItemId, canView]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  if (!canView) return null;

  const cost = lines.reduce((s, l) => s + l.qty_per_portion * (l.item?.cost_per_unit_minor ?? 0), 0);
  const margin = priceMinor > 0 ? Math.round(((priceMinor - cost) / priceMinor) * 1000) / 10 : 0;
  const unused = items.filter((i) => !lines.some((l) => l.item?.id === i.id));

  async function addLine() {
    if (!adding || !membership) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Enter a quantity', `How many ${adding.unit} go into one portion?`);
      return;
    }
    const { error } = await supabase.from('recipe_lines').insert({ tenant_id: membership.tenantId, menu_item_id: menuItemId, inventory_item_id: adding.id, qty_per_portion: n });
    if (error) Alert.alert('Could not add', error.message);
    setAdding(null);
    setQty('');
    load();
  }

  async function removeLine(id: string) {
    await supabase.from('recipe_lines').delete().eq('id', id);
    load();
  }

  return (
    <View style={{ ...card, padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Recipe & cost</Text>
      {lines.length > 0 ? (
        <Text style={{ fontSize: 13, color: colors.ink700 }}>
          Costs {rupees(cost, 2)} per portion · {margin}% margin at {rupees(priceMinor, 0)}
        </Text>
      ) : (
        <Text style={{ fontSize: 13, color: colors.ink500 }}>No recipe yet. Add ingredients so stock is deducted automatically and the dish is costed.</Text>
      )}
      {lines.map((l) => (
        <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{l.item?.name}</Text>
          <Text style={{ color: colors.ink700 }}>{qtyText(l.qty_per_portion)} {l.item?.unit}</Text>
          {canManage ? <Pressable onPress={() => removeLine(l.id)}><Text style={{ color: colors.error, fontFamily: fonts.bodyExtraBold, fontSize: 12 }}>Remove</Text></Pressable> : null}
        </View>
      ))}

      {canManage ? (
        <>
          <Text style={heading}>ADD INGREDIENT</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {unused.map((i) => <Chip key={i.id} label={i.name} on={adding?.id === i.id} onPress={() => setAdding(i)} />)}
            {unused.length === 0 ? <Text style={{ color: colors.ink500, fontSize: 12 }}>Add ingredients under More → Inventory first.</Text> : null}
          </View>
          {adding ? (
            <>
              <Field label={`${adding.name}: how many ${adding.unit} per portion?`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
              <Button label="Add to recipe" onPress={addLine} />
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
