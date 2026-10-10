import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

import { Chip, card, heading, qtyText, rupees } from './ui';

type Report = {
  sales_minor: number;
  cogs_minor: number;
  food_cost_pct: number | null;
  purchases_minor: number;
  wastage_minor: number;
  staff_meal_minor: number;
  stocktake_variance_minor: number;
  stock_value_minor: number;
  top_variance: { name: string; qty: number; value_minor: number }[];
};
type Suggestion = { inventory_item_id: string; name: string; unit: string; current_qty: number; avg_daily_use: number; days_left: number | null; suggested_qty: number };
type Costing = { menu_item_id: string; name: string; category: string; price_minor: number; cost_minor: number; margin_pct: number; has_recipe: boolean };

export function InsightsTab() {
  const [days, setDays] = useState<7 | 30>(30);
  const [report, setReport] = useState<Report | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [costing, setCosting] = useState<Costing[]>([]);

  const load = useCallback(async () => {
    const to = new Date();
    to.setHours(24, 0, 0, 0);
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    const [{ data: r }, { data: s }, { data: c }] = await Promise.all([
      supabase.rpc('inventory_report', { p_from: from.toISOString(), p_to: to.toISOString() }),
      supabase.rpc('reorder_suggestions'),
      supabase.rpc('recipe_costing'),
    ]);
    setReport((r as Report) ?? null);
    setSuggestions((s as Suggestion[]) ?? []);
    setCosting((c as Costing[]) ?? []);
  }, [days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const stat = (label: string, value: string, tone: string = colors.ink900) => (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 18, padding: 14, gap: 2 }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.display, color: tone }}>{value}</Text>
      <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{label}</Text>
    </View>
  );

  const withRecipe = costing.filter((c) => c.has_recipe);
  const withoutRecipe = costing.filter((c) => !c.has_recipe);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="7 days" on={days === 7} onPress={() => setDays(7)} />
        <Chip label="30 days" on={days === 30} onPress={() => setDays(30)} />
      </View>

      {report ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {stat('Food cost % of sales', report.food_cost_pct === null ? '—' : `${report.food_cost_pct}%`, report.food_cost_pct !== null && report.food_cost_pct > 35 ? colors.error : colors.ink900)}
          {stat('Cost of food sold', rupees(report.cogs_minor, 0))}
          {stat('Purchases', rupees(report.purchases_minor, 0))}
          {stat('Stock value now', rupees(report.stock_value_minor, 0))}
          {stat('Wastage', rupees(report.wastage_minor, 0), report.wastage_minor > 0 ? colors.warning : colors.ink900)}
          {stat('Staff meals', rupees(report.staff_meal_minor, 0))}
          {stat('Stocktake variance', `${report.stocktake_variance_minor < 0 ? '−' : '+'}${rupees(Math.abs(report.stocktake_variance_minor), 0)}`, report.stocktake_variance_minor < 0 ? colors.error : colors.success)}
        </View>
      ) : null}

      {report && report.top_variance.length > 0 ? (
        <>
          <Text style={heading}>BIGGEST SHORTAGES (STOCKTAKE)</Text>
          {report.top_variance.map((v) => (
            <View key={v.name} style={[card, { flexDirection: 'row', alignItems: 'center' }]}>
              <Text style={{ flex: 1, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{v.name}</Text>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.error }}>{qtyText(v.qty)} · {rupees(Math.abs(v.value_minor), 0)}</Text>
            </View>
          ))}
        </>
      ) : null}

      <Text style={heading}>SUGGESTED REORDER</Text>
      {suggestions.map((s) => (
        <View key={s.inventory_item_id} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{s.name}</Text>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>
              {qtyText(s.current_qty)} {s.unit} left{s.days_left !== null ? ` · about ${s.days_left} days` : ''} · uses {qtyText(s.avg_daily_use)}/day
            </Text>
          </View>
          <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>Order {qtyText(s.suggested_qty)} {s.unit}</Text>
        </View>
      ))}
      {suggestions.length === 0 ? <Text style={{ color: colors.ink500 }}>Nothing needs reordering right now.</Text> : null}

      <Text style={heading}>DISH MARGINS (LOWEST FIRST)</Text>
      {withRecipe.map((c) => (
        <View key={c.menu_item_id} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{c.name}</Text>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>Sells {rupees(c.price_minor, 0)} · costs {rupees(c.cost_minor, 2)}</Text>
          </View>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: c.margin_pct < 55 ? colors.error : colors.success }}>{c.margin_pct}%</Text>
        </View>
      ))}
      {withRecipe.length === 0 ? <Text style={{ color: colors.ink500 }}>Add recipes to your dishes (Menu → a dish → Recipe) to see costs and margins.</Text> : null}
      {withoutRecipe.length > 0 ? <Text style={{ fontSize: 12, color: colors.ink500 }}>{withoutRecipe.length} dishes have no recipe yet, so their stock is not tracked.</Text> : null}
    </View>
  );
}
