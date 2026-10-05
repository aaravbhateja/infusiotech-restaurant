import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type PendingKyc = {
  tenant_id: string;
  tenant_name: string;
  status: 'submitted' | 'under_review' | 'needs_clarification' | 'verified' | 'rejected';
  legal_business_name: string;
  pan: string;
  aadhar_last4: string;
  bank_account_holder_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  business_type: string;
  business_pan: string | null;
  gstin: string | null;
  razorpay_linked_account_id: string | null;
  submitted_at: string | null;
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  submitted: { bg: colors.saffron50, fg: '#8A5A00' },
  under_review: { bg: colors.saffron50, fg: '#8A5A00' },
  needs_clarification: { bg: colors.saffron50, fg: '#8A5A00' },
  verified: { bg: colors.successBg, fg: colors.success },
  rejected: { bg: colors.errorBg, fg: colors.error },
};

// Razorpay's own webhook drives the happy path automatically (account
// created → under review → activated). These rows only need a human when
// something didn't progress on its own: the automated call never fired
// (still "submitted" after a while), or Razorpay came back asking for more.
const NEEDS_MANUAL_ACTION = new Set(['submitted', 'needs_clarification']);

export default function AdminKycQueue() {
  const [rows, setRows] = useState<PendingKyc[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<'verify' | 'reject' | null>(null);
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_pending_kyc');
    setRows((data as PendingKyc[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  function startAction(tenantId: string, kind: 'verify' | 'reject') {
    setActionId(tenantId);
    setActionKind(kind);
    setLinkedAccountId('');
    setReason('');
  }

  async function confirmAction(tenantId: string) {
    if (actionKind === 'verify' && !linkedAccountId.trim()) return;
    if (actionKind === 'reject' && !reason.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_review_tenant_kyc', {
      p_tenant_id: tenantId,
      p_decision: actionKind === 'verify' ? 'verified' : 'rejected',
      p_reason: actionKind === 'reject' ? reason.trim() : null,
      p_razorpay_linked_account_id: actionKind === 'verify' ? linkedAccountId.trim() : null,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not update', error.message);
      return;
    }
    setActionId(null);
    setActionKind(null);
    load();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, paddingBottom: 0 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="left" size={20} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Restaurant KYC</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}>
        <Text style={{ fontSize: 12, color: colors.ink500 }}>
          Razorpay reviews most submissions on its own — &ldquo;Under review&rdquo; rows need no action. Only act on &ldquo;Submitted&rdquo; (automatic setup never fired) or &ldquo;Needs clarification&rdquo; rows.
        </Text>
        {loading ? <Text style={{ color: colors.ink500 }}>Loading…</Text> : null}
        {!loading && rows.length === 0 ? <Text style={{ color: colors.ink500, textAlign: 'center', padding: 24 }}>No submissions yet.</Text> : null}

        {rows.map((r) => {
          const sc = STATUS_COLOR[r.status];
          const isActing = actionId === r.tenant_id;
          return (
            <View key={r.tenant_id} style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900, flex: 1 }}>{r.tenant_name}</Text>
                <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: sc.bg, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: sc.fg, textTransform: 'uppercase' }}>{r.status}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colors.ink500 }}>
                {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : ''}
              </Text>

              <View style={{ gap: 4, marginTop: 4 }}>
                <DetailRow label="Business type" value={r.business_type} />
                <DetailRow label="Legal name" value={r.legal_business_name} />
                <DetailRow label="PAN" value={r.pan} />
                {r.business_pan ? <DetailRow label="Business PAN" value={r.business_pan} /> : null}
                {r.gstin ? <DetailRow label="GSTIN" value={r.gstin} /> : null}
                <DetailRow label="Aadhar" value={`•••• •••• ${r.aadhar_last4}`} />
                <DetailRow label="Account holder" value={r.bank_account_holder_name} />
                <DetailRow label="Bank account" value={r.bank_account_number} />
                <DetailRow label="IFSC" value={r.bank_ifsc} />
                {r.razorpay_linked_account_id ? <DetailRow label="Razorpay account" value={r.razorpay_linked_account_id} /> : null}
              </View>

              {NEEDS_MANUAL_ACTION.has(r.status) ? (
                isActing ? (
                  <View style={{ gap: 8, marginTop: 6 }}>
                    {actionKind === 'verify' ? (
                      <TextInput
                        value={linkedAccountId}
                        onChangeText={setLinkedAccountId}
                        placeholder="Razorpay Linked Account id (acc_...)"
                        autoCapitalize="none"
                        style={{ borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, padding: 10, fontSize: 14 }}
                      />
                    ) : (
                      <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Reason for rejecting — shown to the restaurant"
                        multiline
                        style={{ borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, padding: 10, fontSize: 14, minHeight: 60, textAlignVertical: 'top' }}
                      />
                    )}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => setActionId(null)} style={{ flex: 1, height: 42, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmAction(r.tenant_id)}
                        disabled={saving || (actionKind === 'verify' ? !linkedAccountId.trim() : !reason.trim())}
                        style={{ flex: 1, height: 42, borderRadius: radius.pill, backgroundColor: actionKind === 'verify' ? colors.success : colors.error, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}
                      >
                        <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{saving ? 'Saving…' : actionKind === 'verify' ? 'Confirm verify' : 'Confirm reject'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <Pressable onPress={() => startAction(r.tenant_id, 'reject')} style={{ flex: 1, height: 42, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.error, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.error }}>Reject</Text>
                    </Pressable>
                    <Pressable onPress={() => startAction(r.tenant_id, 'verify')} style={{ flex: 1, height: 42, borderRadius: radius.pill, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Verify</Text>
                    </Pressable>
                  </View>
                )
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 12, color: colors.ink500 }}>{label}</Text>
      <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{value}</Text>
    </View>
  );
}
