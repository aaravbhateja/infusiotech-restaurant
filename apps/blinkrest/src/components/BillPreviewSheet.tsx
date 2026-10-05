import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { buildReceiptHtml, printHtml, type ReceiptItem } from '@/lib/printReceipt';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';

import { Icon } from './Icon';

const mono = Platform.select({ ios: 'Courier', android: 'monospace', default: 'Courier New' });

export type BillOrder = {
  orderNumber: string;
  createdAt: string;
  tableLabel: string | null;
  items: ReceiptItem[];
  totalMinor: number;
};

function Dashed() {
  return <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: '#D9D3D0' }} />;
}

// Shared by the table and order-detail screens — review the bill on screen
// first, print only once the staff member has actually looked at it.
// Styled to match the restaurant's actual printed bill: monospace, boxed
// restaurant name, dashed rules, "the restaurant first, BlinkRest second".
export function BillPreviewSheet({ order, onClose }: { order: BillOrder; onClose: () => void }) {
  const { membership } = useAuth();
  const [printing, setPrinting] = useState(false);

  const subtotalMinor = order.items.reduce((s, i) => s + i.lineTotalMinor, 0);
  const gstMinor = order.totalMinor - subtotalMinor;

  const [tenant, setTenant] = useState<{ name: string; address: string | null; gstin: string | null; fssai_license: string | null; gst_percent: number } | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const { data } = await supabase
      .from('tenants')
      .select('name, address, city, state, pincode, gstin, fssai_license, gst_percent')
      .eq('id', membership.tenantId)
      .maybeSingle();
    if (!data) return;
    const addressParts = [data.address, data.city, data.state, data.pincode].filter(Boolean);
    setTenant({
      name: data.name,
      address: addressParts.length ? addressParts.join(', ') : null,
      gstin: data.gstin,
      fssai_license: data.fssai_license,
      gst_percent: data.gst_percent,
    });
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function handlePrint() {
    if (!tenant) return;
    setPrinting(true);
    try {
      const html = buildReceiptHtml({
        tenantName: tenant.name,
        tenantAddress: tenant.address,
        gstin: tenant.gstin,
        fssai: tenant.fssai_license,
        tableLabel: order.tableLabel,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        items: order.items,
        subtotalMinor,
        gstPercent: tenant.gst_percent,
        gstMinor,
        totalMinor: order.totalMinor,
      });
      await printHtml(html);
    } catch (e) {
      Alert.alert('Could not print', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPrinting(false);
    }
  }

  const metaLine = [
    `Bill #${order.orderNumber}`,
    order.tableLabel,
    new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' }),
    new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(27,23,22,0.45)', justifyContent: 'flex-end' }}>
      <View style={{ backgroundColor: colors.ink900, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 14, maxHeight: '86%' }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' }} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', flex: 1 }}>Bill</Text>
          <Pressable onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={18} stroke={2.2} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, gap: 10 }}>
            <View style={{ borderWidth: 1.5, borderColor: '#81AFE7', padding: 8, alignItems: 'center' }}>
              <Text style={{ fontFamily: mono, fontWeight: '700', fontSize: 15, letterSpacing: 1, color: colors.ink900 }}>
                {(tenant?.name ?? '…').toUpperCase()}
              </Text>
            </View>
            <Text style={{ fontFamily: mono, fontSize: 11, color: colors.ink700, textAlign: 'center' }}>
              {[tenant?.address, tenant?.gstin ? `GSTIN ${tenant.gstin}` : null].filter(Boolean).join(' · ')}
            </Text>
            {tenant?.fssai_license ? (
              <Text style={{ fontFamily: mono, fontSize: 11, color: colors.ink700, textAlign: 'center', marginTop: -6 }}>FSSAI {tenant.fssai_license}</Text>
            ) : null}

            <Dashed />

            <Text style={{ fontFamily: mono, fontSize: 12, color: colors.ink700 }}>{metaLine}</Text>

            <Dashed />

            <View style={{ gap: 4 }}>
              {order.items.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: mono, fontSize: 13, color: colors.ink900, flex: 1 }}>{item.name} × {item.quantity}</Text>
                  <Text style={{ fontFamily: mono, fontSize: 13, color: colors.ink900 }}>{formatMinor(item.lineTotalMinor)}</Text>
                </View>
              ))}
            </View>

            <Dashed />

            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: mono, fontSize: 13, color: colors.ink700 }}>Subtotal</Text>
                <Text style={{ fontFamily: mono, fontSize: 13, color: colors.ink900 }}>{formatMinor(subtotalMinor)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: mono, fontSize: 13, color: colors.ink700 }}>GST ({tenant?.gst_percent ?? '…'}%)</Text>
                <Text style={{ fontFamily: mono, fontSize: 13, color: colors.ink900 }}>{formatMinor(gstMinor)}</Text>
              </View>
            </View>

            <Dashed />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: mono, fontWeight: '700', fontSize: 15, color: colors.ink900 }}>TOTAL</Text>
              <Text style={{ fontFamily: mono, fontWeight: '700', fontSize: 15, color: colors.ink900 }}>{formatMinor(order.totalMinor)}</Text>
            </View>

            <Dashed />

            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontFamily: mono, fontSize: 11, color: colors.ink700 }}>Powered by</Text>
              <Icon name="bolt" size={12} stroke={2.6} color={colors.coral500} />
              <Text style={{ fontFamily: mono, fontSize: 11, fontWeight: '700' }}>
                <Text style={{ color: colors.ink900 }}>Blink</Text>
                <Text style={{ color: colors.coral500 }}>Rest</Text>
              </Text>
            </View>
          </View>
        </ScrollView>

        <Pressable
          disabled={!tenant || printing}
          onPress={handlePrint}
          style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.coral600, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !tenant || printing ? 0.6 : 1 }}
        >
          <Icon name="printer" size={19} color="#FFFFFF" />
          <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, color: '#FFFFFF' }}>{printing ? 'Printing…' : 'Print'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
