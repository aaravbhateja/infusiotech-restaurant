import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Request = {
  id: string;
  kind: 'void_item' | 'refund' | 'price_change';
  summary: string | null;
  reason: string;
  created_at: string;
};

const KIND_LABEL: Record<Request['kind'], string> = {
  void_item: 'Remove item',
  refund: 'Refund',
  price_change: 'Price change',
};

// Pending sensitive actions (item voids, refunds) raised by staff who can't do
// them directly. Shown to whoever may approve them; renders nothing otherwise.
export function ApprovalRequests() {
  const { membership } = useAuth();
  const canReview = !!(membership?.permissions.has('orders.void') || membership?.permissions.has('payments.refund') || membership?.permissions.has('menu.price.edit'));
  const [requests, setRequests] = useState<Request[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canReview) return;
    const { data } = await supabase
      .from('approval_requests')
      .select('id, kind, summary, reason, created_at')
      .eq('status', 'pending')
      .order('created_at');
    setRequests((data as Request[]) ?? []);
  }, [canReview]);

  useRealtimeRefresh('approvalstsx', tenantSubs(canReview ? membership?.tenantId : undefined, ['approval_requests']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function review(req: Request, approve: boolean) {
    setBusy(req.id);
    const { error } = await supabase.rpc('review_approval_request', { p_request_id: req.id, p_approve: approve, p_note: null });
    setBusy(null);
    if (error) Alert.alert('Could not update request', error.message);
    load();
  }

  if (!canReview || requests.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900, marginHorizontal: 4 }}>Approvals</Text>
      {requests.map((req) => (
        <View key={req.id} style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.saffron50, justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: '#8A5A00' }}>{KIND_LABEL[req.kind].toUpperCase()}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{req.summary}</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.ink700 }}>Reason: {req.reason}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              disabled={busy === req.id}
              onPress={() => review(req, false)}
              style={{ flex: 1, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#F4C7C1', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.error }}>Reject</Text>
            </Pressable>
            <Pressable
              disabled={busy === req.id}
              onPress={() => review(req, true)}
              style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', opacity: busy === req.id ? 0.6 : 1 }}
            >
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Approve</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
