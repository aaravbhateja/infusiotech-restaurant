import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Field, Sheet } from '@/components/inventory/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

// Managers and owners set a 4-6 digit PIN. A waiter or cashier can then type
// it to approve a void or refund on the spot instead of waiting for a request
// to be approved on another phone.
export function ApprovalPinSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [hasPin, setHasPin] = useState(false);

  useEffect(() => {
    if (!visible) return;
    supabase.rpc('has_approval_pin').then(({ data }) => setHasPin(!!data));
  }, [visible]);

  async function save() {
    if (!/^[0-9]{4,6}$/.test(pin)) {
      Alert.alert('Check the PIN', 'Use 4 to 6 digits.');
      return;
    }
    if (pin !== again) {
      Alert.alert('PINs do not match', 'Type the same PIN twice.');
      return;
    }
    const { error } = await supabase.rpc('set_approval_pin', { p_pin: pin });
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setPin('');
    setAgain('');
    Alert.alert('PIN saved', 'Staff can now ask you to type this PIN to approve a void or refund at the counter. Keep it private.');
    onClose();
  }

  return (
    <Sheet visible={visible} title="Approval PIN" onClose={onClose}>
      <Text style={{ fontSize: 13, color: colors.ink700 }}>
        {hasPin ? 'You already have a PIN. Saving a new one replaces it.' : 'Set a PIN so you can approve voids and refunds in person.'}
      </Text>
      <Field label="New PIN (4–6 digits)" value={pin} onChangeText={setPin} keyboardType="number-pad" />
      <Field label="Type it again" value={again} onChangeText={setAgain} keyboardType="number-pad" />
      <Button label="Save PIN" onPress={save} />
    </Sheet>
  );
}
