import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

import { Button, card, heading, qtyText, rupees } from './ui';

type Line = { id: string; system_qty: number; counted_qty: number | null; item: { name: string; unit: string; cost_per_unit_minor: number } | null };
type Past = { id: string; finalized_at: string; variance_value_minor: number | null };

// A physical count. Items left blank are skipped; counted items are corrected
// to the count, and the difference is the variance (a shortage is possible
// wastage, over-portioning or theft).
export function StocktakeTab() {
  const { membership } = useAuth();
  const canManage = !!membership?.permissions.has('inventory.manage');
  const [openId, setOpenId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [past, setPast] = useState<Past[]>([]);
  const [summary, setSummary] = useState<{ counted: number; variance_value_minor: number } | null>(null);

  const load = useCallback(async () => {
    const [{ data: open }, { data: done }] = await Promise.all([
      supabase.from('stocktakes').select('id').eq('status', 'open').maybeSingle(),
      supabase.from('stocktakes').select('id, finalized_at, variance_value_minor').eq('status', 'finalized').order('finalized_at', { ascending: false }).limit(6),
    ]);
    setPast((done as Past[]) ?? []);
    setOpenId(open?.id ?? null);
    if (open?.id) {
      const { data } = await supabase
        .from('stocktake_lines')
        .select('id, system_qty, counted_qty, item:inventory_items(name, unit, cost_per_unit_minor)')
        .eq('stocktake_id', open.id);
      const rows = ((data as unknown as Line[]) ?? []).sort((a, b) => (a.item?.name ?? '').localeCompare(b.item?.name ?? ''));
      setLines(rows);
      setDraft(Object.fromEntries(rows.filter((r) => r.counted_qty !== null).map((r) => [r.id, qtyText(r.counted_qty as number)])));
    } else {
      setLines([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function start() {
    const { error } = await supabase.rpc('start_stocktake');
    if (error) Alert.alert('Could not start', error.message);
    setSummary(null);
    load();
  }

  async function saveLine(l: Line, v: string) {
    setDraft((d) => ({ ...d, [l.id]: v }));
    const n = v.trim() === '' ? null : Number(v);
    if (n !== null && !Number.isFinite(n)) return;
    await supabase.rpc('save_stocktake_count', { p_line: l.id, p_counted: n });
  }

  async function finish() {
    if (!openId) return;
    const { data, error } = await supabase.rpc('finalize_stocktake', { p_id: openId });
    if (error) {
      Alert.alert('Could not finish', error.message);
      return;
    }
    setSummary(data as { counted: number; variance_value_minor: number });
    load();
  }

  const counted = lines.filter((l) => draft[l.id] !== undefined && draft[l.id].trim() !== '').length;

  return (
    <View style={{ gap: 12 }}>
      {summary ? (
        <View style={{ backgroundColor: summary.variance_value_minor < 0 ? colors.errorBg : colors.successBg, borderRadius: 16, padding: 14 }}>
          <Text style={{ fontFamily: fonts.bodyExtraBold, color: summary.variance_value_minor < 0 ? colors.error : colors.success }}>
            Stocktake done · {summary.counted} items counted · {summary.variance_value_minor < 0 ? 'shortage' : 'surplus'} {rupees(Math.abs(summary.variance_value_minor), 0)}
          </Text>
        </View>
      ) : null}

      {!openId ? (
        <>
          {canManage ? <Button label="Start a stocktake" onPress={start} tone="dark" /> : null}
          <Text style={{ color: colors.ink500, fontSize: 13 }}>Count what is actually on the shelves. BlinkRest compares it with what the system expects and shows the difference.</Text>
        </>
      ) : (
        <>
          <Text style={heading}>COUNTING · {counted} OF {lines.length}</Text>
          {lines.map((l) => {
            const c = draft[l.id];
            const diff = c !== undefined && c.trim() !== '' ? Number(c) - l.system_qty : null;
            return (
              <View key={l.id} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{l.item?.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink500 }}>System: {qtyText(l.system_qty)} {l.item?.unit}</Text>
                  {diff !== null && diff !== 0 ? <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: diff < 0 ? colors.error : colors.success }}>{diff > 0 ? '+' : ''}{qtyText(diff)} {l.item?.unit}</Text> : null}
                </View>
                <TextInput
                  value={c ?? ''}
                  onChangeText={(v) => saveLine(l, v)}
                  placeholder="Count"
                  placeholderTextColor={colors.ink500}
                  keyboardType="decimal-pad"
                  editable={canManage}
                  style={{ width: 96, height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 12, color: colors.ink900, textAlign: 'right' }}
                />
              </View>
            );
          })}
          {canManage ? <Button label="Finish and apply counts" onPress={finish} /> : null}
        </>
      )}

      {past.length > 0 ? (
        <>
          <Text style={heading}>PAST STOCKTAKES</Text>
          {past.map((p) => (
            <View key={p.id} style={[card, { flexDirection: 'row', alignItems: 'center' }]}>
              <Text style={{ flex: 1, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{new Date(p.finalized_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: (p.variance_value_minor ?? 0) < 0 ? colors.error : colors.success }}>
                {(p.variance_value_minor ?? 0) < 0 ? 'Short ' : 'Over '}{rupees(Math.abs(p.variance_value_minor ?? 0), 0)}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
