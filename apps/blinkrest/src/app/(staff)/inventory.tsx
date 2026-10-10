import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { InsightsTab } from '@/components/inventory/InsightsTab';
import { PurchasesTab } from '@/components/inventory/PurchasesTab';
import { StockTab } from '@/components/inventory/StockTab';
import { StocktakeTab } from '@/components/inventory/StocktakeTab';
import { Chip } from '@/components/inventory/ui';
import { RequireAccess } from '@/components/RequireAccess';
import { colors, fonts } from '@/theme/tokens';

const TABS = [
  ['stock', 'Stock'],
  ['purchases', 'Purchases'],
  ['count', 'Stocktake'],
  ['insights', 'Insights'],
] as const;

function InventoryScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('stock');
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Inventory</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map(([k, label]) => <Chip key={k} label={label} on={tab === k} onPress={() => setTab(k)} />)}
        </ScrollView>
        {tab === 'stock' ? <StockTab /> : tab === 'purchases' ? <PurchasesTab /> : tab === 'count' ? <StocktakeTab /> : <InsightsTab />}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Inventory() {
  return (
    <RequireAccess permission="inventory.view">
      <InventoryScreen />
    </RequireAccess>
  );
}
