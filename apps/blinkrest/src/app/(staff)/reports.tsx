import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountingExport } from '@/components/AccountingExport';
import { Icon } from '@/components/Icon';
import { Button, Chip, Field, Sheet, card, heading, rupees } from '@/components/inventory/ui';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

const TABS = [
  ['pnl', 'Profit & loss'],
  ['pay', 'Payments'],
  ['ctl', 'Controls'],
  ['staff', 'Staff'],
  ['acct', 'Accounting'],
] as const;

const RANGES = [
  [1, 'Today'],
  [7, '7 days'],
  [30, '30 days'],
] as const;

const CATEGORIES = ['rent', 'salary', 'utilities', 'raw_material', 'marketing', 'maintenance', 'delivery', 'other'] as const;
const label = (s: string) => s.replace('_', ' ').replace(/^./, (c) => c.toUpperCase());

type Pnl = {
  orders: number; gross_sales_minor: number; discounts_minor: number; refunds_minor: number; net_sales_minor: number;
  gst_collected_minor: number; cogs_minor: number; gross_profit_minor: number; expenses_minor: number; operating_profit_minor: number;
  expenses_by_category: { category: string; amount_minor: number }[];
};
type Recon = {
  by_mode: { mode: string; count: number; amount_minor: number }[];
  refunded_minor: number; pending_refunds: number; cash_with_waiters_minor: number; handovers_pending: number; handover_shortage_minor: number;
  unreconciled_gateway: number; paid_orders_without_payment: number; orders_total_vs_payments_mismatch: number;
};
type Loss = {
  discount_total_minor: number; discount_orders: number; manual_discount_requests: number; manual_discounts_approved_minor: number;
  voided_items: number; voided_value_minor: number; refunds_count: number; refunds_minor: number; cancelled_orders: number; rejected_orders: number; bill_reprints: number;
  voids_by_staff: { name: string; count: number; value_minor: number }[]; top_void_reasons: { reason: string; count: number }[];
};
type StaffRow = { name: string; role: string; orders_served: number; collected_minor: number; voids: number; refunds: number; reprints: number; actions: number };
type Attendance = { name: string; role: string; days_worked: number; shifts: number; worked_minutes: number; break_minutes: number; net_minutes: number; on_shift_now: boolean };
type Expense = { id: string; category: string; amount_minor: number; expense_date: string; note: string | null; paid_via: string };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function ReportsScreen() {
  const { membership } = useAuth();
  const canExpense = !!membership?.permissions.has('expenses.manage');
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('pnl');
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [recon, setRecon] = useState<Recon | null>(null);
  const [loss, setLoss] = useState<Loss | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('rent');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [via, setVia] = useState<'cash' | 'upi' | 'card' | 'bank'>('cash');

  const load = useCallback(async () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    const args = { p_from: ymd(from), p_to: ymd(to) };
    const [p, r, l, s, e, a] = await Promise.all([
      supabase.rpc('profit_loss', args),
      supabase.rpc('payment_reconciliation', args),
      supabase.rpc('loss_prevention', args),
      supabase.rpc('staff_activity', args),
      supabase.from('expenses').select('id, category, amount_minor, expense_date, note, paid_via').gte('expense_date', args.p_from).lte('expense_date', args.p_to).order('expense_date', { ascending: false }),
      supabase.rpc('attendance_report', args),
    ]);
    setPnl((p.data as Pnl) ?? null);
    setRecon((r.data as Recon) ?? null);
    setLoss((l.data as Loss) ?? null);
    setStaff((s.data as StaffRow[]) ?? []);
    setExpenses((e.data as Expense[]) ?? []);
    setAttendance((a.data as Attendance[]) ?? []);
  }, [days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function saveExpense() {
    if (!membership) return;
    const n = Math.round(Number(amount) * 100);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Enter an amount', 'The amount must be more than zero.');
      return;
    }
    const { error } = await supabase.from('expenses').insert({ tenant_id: membership.tenantId, category: cat, amount_minor: n, paid_via: via, note: note.trim() || null, created_by: membership.id });
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setAdding(false);
    setAmount('');
    setNote('');
    load();
  }

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id);
    load();
  }

  const stat = (k: string, v: string, tone: string = colors.ink900) => (
    <View key={k} style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 18, padding: 14, gap: 2 }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.display, color: tone }}>{v}</Text>
      <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{k}</Text>
    </View>
  );
  const row = (k: string, v: string, tone: string = colors.ink900, bold = false) => (
    <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: colors.ink700, fontFamily: bold ? fonts.bodyExtraBold : fonts.body }}>{k}</Text>
      <Text style={{ color: tone, fontFamily: bold ? fonts.display : fonts.bodyBold, fontSize: bold ? 17 : 14 }}>{v}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Financial reports</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map(([k, l]) => <Chip key={k} label={l} on={tab === k} onPress={() => setTab(k)} />)}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {RANGES.map(([d, l]) => <Chip key={d} label={l} on={days === d} onPress={() => setDays(d)} />)}
        </View>

        {tab === 'pnl' && pnl ? (
          <>
            <View style={card}>
              {row('Gross sales (before GST)', rupees(pnl.gross_sales_minor, 0))}
              {row('Discounts', `− ${rupees(pnl.discounts_minor, 0)}`, colors.warning)}
              {row('Refunds', `− ${rupees(pnl.refunds_minor, 0)}`, colors.warning)}
              {row('Net sales', rupees(pnl.net_sales_minor, 0), colors.ink900, true)}
              {row('Cost of food used', `− ${rupees(pnl.cogs_minor, 0)}`)}
              {row('Gross profit', rupees(pnl.gross_profit_minor, 0), colors.ink900, true)}
              {row('Expenses', `− ${rupees(pnl.expenses_minor, 0)}`)}
              {row('Operating profit (estimate)', rupees(pnl.operating_profit_minor, 0), pnl.operating_profit_minor < 0 ? colors.error : colors.success, true)}
            </View>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>
              An estimate for planning, not an accounting statement. Cost of food needs recipes and stock set up under Inventory. GST collected ({rupees(pnl.gst_collected_minor, 0)}) is excluded from sales.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[heading, { flex: 1 }]}>EXPENSES</Text>
              {canExpense ? <Button label="Add expense" onPress={() => setAdding(true)} tone="dark" /> : null}
            </View>
            {expenses.map((e) => (
              <View key={e.id} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{label(e.category)}{e.note ? ` · ${e.note}` : ''}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink500 }}>{new Date(e.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {e.paid_via}</Text>
                </View>
                <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.ink900 }}>{rupees(e.amount_minor, 0)}</Text>
                {canExpense ? <Pressable onPress={() => deleteExpense(e.id)}><Text style={{ color: colors.error, fontFamily: fonts.bodyExtraBold, fontSize: 12 }}>Delete</Text></Pressable> : null}
              </View>
            ))}
            {expenses.length === 0 ? <Text style={{ color: colors.ink500 }}>No expenses recorded in this period.</Text> : null}
          </>
        ) : null}

        {tab === 'pay' && recon ? (
          <>
            <Text style={heading}>MONEY IN BY PAYMENT MODE</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {recon.by_mode.map((m) => stat(`${label(m.mode)} · ${m.count} payments`, rupees(m.amount_minor, 0)))}
            </View>
            {recon.by_mode.length === 0 ? <Text style={{ color: colors.ink500 }}>No payments in this period.</Text> : null}
            <Text style={heading}>CHECKS</Text>
            <View style={card}>
              {row('Refunded', rupees(recon.refunded_minor, 0), recon.refunded_minor > 0 ? colors.warning : colors.ink900)}
              {row('Online refunds still to complete', String(recon.pending_refunds), recon.pending_refunds > 0 ? colors.error : colors.ink900)}
              {row('Cash still with waiters', rupees(recon.cash_with_waiters_minor, 0), recon.cash_with_waiters_minor > 0 ? colors.warning : colors.ink900)}
              {row('Handovers waiting for the cashier', String(recon.handovers_pending), recon.handovers_pending > 0 ? colors.warning : colors.ink900)}
              {row('Cash shortage on handovers', rupees(recon.handover_shortage_minor, 0), recon.handover_shortage_minor > 0 ? colors.error : colors.ink900)}
              {row('Online payments to reconcile', String(recon.unreconciled_gateway))}
              {row('Paid orders with no payment record', String(recon.paid_orders_without_payment), recon.paid_orders_without_payment > 0 ? colors.error : colors.success)}
              {row('Orders where payments do not match the total', String(recon.orders_total_vs_payments_mismatch), recon.orders_total_vs_payments_mismatch > 0 ? colors.error : colors.success)}
            </View>
          </>
        ) : null}

        {tab === 'ctl' && loss ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {stat('Discounts given', rupees(loss.discount_total_minor, 0), loss.discount_total_minor > 0 ? colors.warning : colors.ink900)}
              {stat('Orders with a discount', String(loss.discount_orders))}
              {stat('Items voided', `${loss.voided_items} · ${rupees(loss.voided_value_minor, 0)}`, loss.voided_items > 0 ? colors.warning : colors.ink900)}
              {stat('Refunds', `${loss.refunds_count} · ${rupees(loss.refunds_minor, 0)}`)}
              {stat('Cancelled orders', String(loss.cancelled_orders))}
              {stat('Rejected orders', String(loss.rejected_orders))}
              {stat('Bill reprints', String(loss.bill_reprints))}
              {stat('Manual discount requests', `${loss.manual_discount_requests} · ${rupees(loss.manual_discounts_approved_minor, 0)} approved`)}
            </View>
            {loss.voids_by_staff.length > 0 ? (
              <>
                <Text style={heading}>VOIDS BY STAFF</Text>
                {loss.voids_by_staff.map((v) => (
                  <View key={v.name} style={[card, { flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={{ flex: 1, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{v.name}</Text>
                    <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{v.count} · {rupees(v.value_minor, 0)}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {loss.top_void_reasons.length > 0 ? (
              <>
                <Text style={heading}>TOP VOID REASONS</Text>
                {loss.top_void_reasons.map((r) => (
                  <View key={r.reason} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                    <Text style={{ color: colors.ink700, textTransform: 'capitalize' }}>{r.reason}</Text>
                    <Text style={{ fontFamily: fonts.bodyBold, color: colors.ink900 }}>{r.count}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'acct' ? <AccountingExport /> : null}

        {tab === 'staff' ? (
          <>
            {staff.map((s) => (
              <View key={s.name + s.role} style={card}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{s.name}</Text>
                  <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink500 }}>{s.role}</Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.ink700 }}>
                  {s.orders_served} served · {rupees(s.collected_minor, 0)} collected · {s.voids} voids · {s.refunds} refunds · {s.reprints} reprints · {s.actions} actions logged
                </Text>
              </View>
            ))}
            {staff.length === 0 ? <Text style={{ color: colors.ink500 }}>No staff activity yet.</Text> : null}

            <Text style={[heading, { marginTop: 8 }]}>ATTENDANCE (SHIFT HOURS)</Text>
            {attendance.map((a) => (
              <View key={a.name + a.role} style={card}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{a.name}</Text>
                  {a.on_shift_now ? <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.success }}>ON SHIFT</Text> : null}
                </View>
                <Text style={{ fontSize: 13, color: colors.ink700 }}>
                  {a.days_worked} days · {a.shifts} shifts · {Math.floor(a.net_minutes / 60)}h {Math.round(a.net_minutes % 60)}m worked · {Math.round(a.break_minutes)} min on breaks
                </Text>
              </View>
            ))}
            {attendance.length === 0 ? <Text style={{ color: colors.ink500 }}>No shifts recorded in this period.</Text> : null}
          </>
        ) : null}
      </ScrollView>

      <Sheet visible={adding} title="Add expense" onClose={() => setAdding(false)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{CATEGORIES.map((c) => <Chip key={c} label={label(c)} on={cat === c} onPress={() => setCat(c)} />)}</View>
        <Field label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <View style={{ flexDirection: 'row', gap: 6 }}>{(['cash', 'upi', 'card', 'bank'] as const).map((v) => <Chip key={v} label={label(v)} on={via === v} onPress={() => setVia(v)} />)}</View>
        <Field label="Note (optional)" value={note} onChangeText={setNote} />
        <Button label="Save expense" onPress={saveExpense} />
      </Sheet>
    </SafeAreaView>
  );
}

export default function Reports() {
  return (
    <RequireAccess permission="reports.financial.view">
      <ReportsScreen />
    </RequireAccess>
  );
}
