import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedToggle } from '@/components/AnimatedToggle';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

type KycStatus = 'pending' | 'submitted' | 'under_review' | 'needs_clarification' | 'verified' | 'rejected';
type BusinessType = 'individual' | 'proprietorship' | 'partnership' | 'llp' | 'private_limited';

type Kyc = {
  status: KycStatus;
  legal_business_name?: string;
  pan?: string;
  aadhar_last4?: string;
  bank_account_holder_name?: string;
  bank_account_last4?: string;
  bank_ifsc?: string;
  business_type?: BusinessType;
  business_pan?: string | null;
  gstin?: string | null;
  rejection_reason?: string | null;
  pay_online_enabled: boolean;
};

const STATUS_COPY: Record<KycStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Not submitted', bg: colors.disabledBg, fg: colors.ink700 },
  submitted: { label: 'Setting up with Razorpay…', bg: colors.saffron50, fg: '#8A5A00' },
  under_review: { label: 'Under review by Razorpay', bg: colors.saffron50, fg: '#8A5A00' },
  needs_clarification: { label: 'More info needed', bg: colors.saffron50, fg: '#8A5A00' },
  verified: { label: 'Verified', bg: colors.successBg, fg: colors.success },
  rejected: { label: 'Rejected', bg: colors.errorBg, fg: colors.error },
};

const BUSINESS_TYPES: { key: BusinessType; label: string }[] = [
  { key: 'individual', label: 'Individual' },
  { key: 'proprietorship', label: 'Proprietorship' },
  { key: 'partnership', label: 'Partnership' },
  { key: 'llp', label: 'LLP' },
  { key: 'private_limited', label: 'Private Ltd' },
];

function PaymentsKycScreen() {
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [loading, setLoading] = useState(true);
  const [legalBusinessName, setLegalBusinessName] = useState('');
  const [pan, setPan] = useState('');
  const [aadhar, setAadhar] = useState('');
  const [bankHolderName, setBankHolderName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('individual');
  const [businessPan, setBusinessPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [togglingPayOnline, setTogglingPayOnline] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_tenant_kyc');
    setKyc(data ? { ...data, status: data.status ?? 'pending' } : { status: 'pending', pay_online_enabled: false });
    setLegalBusinessName(data?.legal_business_name ?? '');
    setBusinessType((data?.business_type as BusinessType) ?? 'individual');
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function submit() {
    if (!legalBusinessName.trim() || !pan.trim() || !aadhar.trim() || !bankHolderName.trim() || !bankAccountNumber.trim() || !bankIfsc.trim()) {
      Alert.alert('Missing details', 'Fill in every field — all of them are required to accept online payments.');
      return;
    }
    if (businessType !== 'individual' && !businessPan.trim()) {
      Alert.alert('Missing details', 'Enter the business PAN for this business type.');
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('submit-tenant-kyc', {
      body: {
        legalBusinessName: legalBusinessName.trim(),
        pan: pan.trim(),
        aadharNumber: aadhar.trim(),
        bankAccountHolderName: bankHolderName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        bankIfsc: bankIfsc.trim(),
        businessType,
        businessPan: businessType !== 'individual' ? businessPan.trim() : null,
        gstin: gstin.trim() || null,
      },
    });
    setSubmitting(false);
    if (error) {
      Alert.alert('Could not submit', error.message);
      return;
    }
    if (data?.error) {
      Alert.alert('Could not submit', data.error);
      return;
    }
    setPan('');
    setAadhar('');
    setBankAccountNumber('');
    setBankIfsc('');
    setBankHolderName('');
    setBusinessPan('');
    setGstin('');
    if (data?.razorpay_error) {
      Alert.alert(
        'Saved — setup needs a follow-up',
        "We've saved your details, but couldn't start Razorpay's automatic setup just now. Our team will set this up manually and let you know.",
      );
    } else {
      Alert.alert('Submitted', "We've sent your details to Razorpay for verification. This can take anywhere from a few minutes to a couple of business days.");
    }
    load();
  }

  async function togglePayOnline(next: boolean) {
    setTogglingPayOnline(true);
    const { error } = await supabase.rpc('set_tenant_pay_online', { p_enabled: next });
    setTogglingPayOnline(false);
    if (error) {
      Alert.alert('Could not update', error.message);
      return;
    }
    load();
  }

  if (loading || !kyc) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <Text style={{ padding: 20, color: colors.ink500 }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const status = STATUS_COPY[kyc.status] ?? STATUS_COPY.pending;
  const canResubmit = kyc.status === 'pending' || kyc.status === 'rejected' || kyc.status === 'needs_clarification';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Online payments</Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: status.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="shield" size={19} stroke={2.1} color={status.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>KYC status</Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: status.fg }}>{status.label}</Text>
            </View>
          </View>
          {(kyc.status === 'rejected' || kyc.status === 'needs_clarification') && kyc.rejection_reason ? (
            <Text style={{ fontSize: 13, color: colors.error }}>Reason: {kyc.rejection_reason}</Text>
          ) : null}
          {kyc.status === 'submitted' || kyc.status === 'under_review' ? (
            <Text style={{ fontSize: 13, color: colors.ink500 }}>
              Razorpay is verifying your PAN, business and bank details automatically. You&rsquo;ll be able to turn on online payments as soon as they approve it — no action needed from you right now.
            </Text>
          ) : null}
          {kyc.status === 'needs_clarification' ? (
            <Text style={{ fontSize: 13, color: colors.ink500 }}>
              Razorpay needs corrected or additional details before they can approve this. Update the form below and resubmit.
            </Text>
          ) : null}
        </View>

        {kyc.status === 'verified' ? (
          <Pressable
            disabled={togglingPayOnline}
            onPress={() => togglePayOnline(!kyc.pay_online_enabled)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: kyc.pay_online_enabled ? colors.successBg : colors.disabledBg, borderRadius: 20, padding: 14 }}
          >
            <Icon name="card" size={22} color={kyc.pay_online_enabled ? colors.success : colors.ink700} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
                {kyc.pay_online_enabled ? 'Accepting online payments' : 'Online payments off'}
              </Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink500 }}>
                97% settles to your bank account · 3% platform fee
              </Text>
            </View>
            <AnimatedToggle value={kyc.pay_online_enabled} onValueChange={() => togglePayOnline(!kyc.pay_online_enabled)} onColor={colors.success} disabled={togglingPayOnline} />
          </Pressable>
        ) : null}

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <View>
            <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.ink900 }}>
              {kyc.status === 'verified' ? 'Verified details' : 'Complete KYC to accept online payments'}
            </Text>
            <Text style={{ fontSize: 12, color: colors.ink500, marginTop: 2 }}>
              Required for Razorpay to settle customer payments directly to your bank account.
            </Text>
          </View>

          {kyc.status === 'verified' ? (
            <View style={{ gap: 10 }}>
              <Row label="Business type" value={BUSINESS_TYPES.find((b) => b.key === kyc.business_type)?.label} />
              <Row label="Business name" value={kyc.legal_business_name} />
              <Row label="PAN" value={kyc.pan} />
              {kyc.business_pan ? <Row label="Business PAN" value={kyc.business_pan} /> : null}
              {kyc.gstin ? <Row label="GSTIN" value={kyc.gstin} /> : null}
              <Row label="Aadhar" value={kyc.aadhar_last4 ? `•••• •••• ${kyc.aadhar_last4}` : undefined} />
              <Row label="Bank account" value={kyc.bank_account_last4 ? `•••• ${kyc.bank_account_last4}` : undefined} />
              <Row label="IFSC" value={kyc.bank_ifsc} />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Business type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {BUSINESS_TYPES.map((b) => {
                    const active = businessType === b.key;
                    return (
                      <Pressable
                        key={b.key}
                        disabled={!canResubmit}
                        onPress={() => setBusinessType(b.key)}
                        style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: active ? colors.ink900 : colors.surface, borderWidth: active ? 0 : 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 13, fontFamily: active ? fonts.bodyExtraBold : fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900 }}>{b.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <TextField label="Legal business name" value={legalBusinessName} onChangeText={setLegalBusinessName} placeholder="As registered with GST/FSSAI" autoCapitalize="words" editable={canResubmit} />
              <TextField label="PAN (owner / signatory)" value={pan} onChangeText={(v) => setPan(v.toUpperCase())} placeholder="ABCDE1234F" autoCapitalize="characters" maxLength={10} editable={canResubmit} />
              {businessType !== 'individual' ? (
                <>
                  <TextField label="Business PAN" value={businessPan} onChangeText={(v) => setBusinessPan(v.toUpperCase())} placeholder="Company/firm PAN" autoCapitalize="characters" maxLength={10} editable={canResubmit} />
                  <TextField label="GSTIN (optional)" value={gstin} onChangeText={(v) => setGstin(v.toUpperCase())} placeholder="15-character GSTIN" autoCapitalize="characters" maxLength={15} editable={canResubmit} />
                </>
              ) : null}
              <TextField label="Aadhar number" value={aadhar} onChangeText={(v) => setAadhar(v.replace(/\D/g, ''))} placeholder="12-digit Aadhar number" keyboardType="number-pad" maxLength={12} editable={canResubmit} />
              <TextField label="Bank account holder name" value={bankHolderName} onChangeText={setBankHolderName} placeholder="As per bank records" autoCapitalize="words" editable={canResubmit} />
              <TextField label="Bank account number" value={bankAccountNumber} onChangeText={(v) => setBankAccountNumber(v.replace(/\D/g, ''))} placeholder="Account number" keyboardType="number-pad" editable={canResubmit} />
              <TextField label="IFSC code" value={bankIfsc} onChangeText={(v) => setBankIfsc(v.toUpperCase())} placeholder="e.g. HDFC0001234" autoCapitalize="characters" maxLength={11} editable={canResubmit} />

              {canResubmit ? (
                <Button title={submitting ? 'Submitting…' : 'Submit for verification'} onPress={submit} loading={submitting} />
              ) : (
                <Text style={{ fontSize: 12, color: colors.ink500, textAlign: 'center' }}>Your details are under review — you&rsquo;ll be notified once they&rsquo;re verified.</Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 13, color: colors.ink500 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{value ?? '—'}</Text>
    </View>
  );
}

export default function PaymentsKyc() {
  return (
    <RequireAccess permission="payments.kyc.manage">
      <PaymentsKycScreen />
    </RequireAccess>
  );
}
