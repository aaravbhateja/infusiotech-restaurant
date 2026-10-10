import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Chip, Field, card, heading } from '@/components/inventory/ui';
import { shareCsv, shareText } from '@/lib/csv';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PERIODS = [
  ['today', 'Today'],
  ['week', 'Last 7 days'],
  ['month', 'This month'],
  ['last', 'Last month'],
] as const;

function range(k: (typeof PERIODS)[number][0]): [string, string] {
  const now = new Date();
  if (k === 'today') return [ymd(now), ymd(now)];
  if (k === 'week') {
    const f = new Date();
    f.setDate(f.getDate() - 6);
    return [ymd(f), ymd(now)];
  }
  if (k === 'month') return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now)];
  return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))];
}

// GST register (CSV) and Tally import file (XML) for the accountant.
export function AccountingExport() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>('last');
  const [busy, setBusy] = useState(false);
  const [sales, setSales] = useState('Sales');
  const [cgst, setCgst] = useState('CGST');
  const [sgst, setSgst] = useState('SGST');
  const [cash, setCash] = useState('Cash');
  const [upi, setUpi] = useState('UPI Receipts');
  const [cardL, setCardL] = useState('Card Receipts');
  const [debtors, setDebtors] = useState('Sundry Debtors');

  async function run(kind: 'gst' | 'tally') {
    const [from, to] = range(period);
    setBusy(true);
    try {
      if (kind === 'gst') {
        const { data, error } = await supabase.rpc('export_gst_register_csv', { p_from: from, p_to: to });
        if (error) throw error;
        await shareCsv(`gst-register-${from}-to-${to}.csv`, data as string, 'GST register');
      } else {
        const { data, error } = await supabase.rpc('export_tally_xml', {
          p_from: from,
          p_to: to,
          p_sales_ledger: sales,
          p_cgst_ledger: cgst,
          p_sgst_ledger: sgst,
          p_cash_ledger: cash,
          p_upi_ledger: upi,
          p_card_ledger: cardL,
          p_account_ledger: debtors,
        });
        if (error) throw error;
        await shareText(`tally-sales-${from}-to-${to}.xml`, data as string, 'text/xml', 'Tally sales vouchers');
      }
    } catch (e) {
      Alert.alert('Could not export', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PERIODS.map(([k, l]) => <Chip key={k} label={l} on={period === k} onPress={() => setPeriod(k)} />)}
      </View>

      <View style={card}>
        <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>GST sales register</Text>
        <Text style={{ fontSize: 13, color: colors.ink700 }}>One row per paid bill with taxable value, CGST, SGST and total. Hand it to your CA for GSTR-1 and GSTR-3B.</Text>
        <Button label="Download GST register (CSV)" onPress={() => run('gst')} disabled={busy} />
      </View>

      <View style={card}>
        <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Tally sales vouchers</Text>
        <Text style={{ fontSize: 13, color: colors.ink700 }}>
          One Sales voucher per day, split by how it was paid, with GST posted to CGST and SGST. In Tally: Import → Vouchers and choose the downloaded file. The ledgers below must already exist in Tally with exactly these names.
        </Text>
        <Text style={heading}>LEDGER NAMES</Text>
        <Field label="Sales" value={sales} onChangeText={setSales} />
        <Field label="CGST" value={cgst} onChangeText={setCgst} />
        <Field label="SGST" value={sgst} onChangeText={setSgst} />
        <Field label="Cash" value={cash} onChangeText={setCash} />
        <Field label="UPI and online payments" value={upi} onChangeText={setUpi} />
        <Field label="Card" value={cardL} onChangeText={setCardL} />
        <Field label="House accounts (credit sales)" value={debtors} onChangeText={setDebtors} />
        <Text style={{ fontSize: 12, color: colors.ink500 }}>Any rupee difference between what was collected and what was billed is posted to a ledger called Round Off.</Text>
        <Button label="Download for Tally (XML)" tone="dark" onPress={() => run('tally')} disabled={busy} />
      </View>
    </>
  );
}
