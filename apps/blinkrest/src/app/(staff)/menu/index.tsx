import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { BottomNav } from '@/components/BottomNav';
import { Icon } from '@/components/Icon';
import { MenuCsvSheet } from '@/components/MenuCsvSheet';
import { RequireAccess } from '@/components/RequireAccess';
import { MenuItemSkeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/States';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { menuImageUrl } from '@/lib/menuImage';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type Category = { id: string; name: string };
type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  is_available: boolean;
  dietary_labels: string[];
  image_path: string | null;
};

function MenuScreen() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data: cats }, { data: menuItems }] = await Promise.all([
      supabase.from('menu_categories').select('id, name').eq('tenant_id', membership.tenantId).eq('is_active', true).order('sort_order'),
      supabase
        .from('menu_items')
        .select('id, category_id, name, description, price_minor, currency, is_available, dietary_labels, image_path')
        .eq('tenant_id', membership.tenantId)
        .order('sort_order'),
    ]);
    setCategories(cats ?? []);
    setItems((menuItems as MenuItem[]) ?? []);
    setLoading(false);
  }, [membership]);

  useRealtimeRefresh('menuindextsx', tenantSubs(membership?.tenantId, ['menu_items', 'menu_categories']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = { All: items.length };
    for (const cat of categories) c[cat.name] = items.filter((i) => i.category_id === cat.id).length;
    return c;
  }, [items, categories]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const catName = categories.find((c) => c.id === item.category_id)?.name;
      const matchesCat = activeCategory === 'All' || catName === activeCategory;
      const matchesQuery = !q || item.name.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [items, categories, activeCategory, query]);

  const availableCount = items.filter((i) => i.is_available).length;
  const outCount = items.length - availableCount;

  async function toggleAvailability(item: MenuItem) {
    if (!guardOnline(isOnline)) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_available: !i.is_available } : i)));
    const { error } = await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id);
    if (error) {
      Alert.alert('Could not update item', error.message);
      await load();
    }
  }

  if (!membership) return null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <MenuCsvSheet visible={csvOpen} onClose={() => setCsvOpen(false)} onImported={load} />
      <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>Menu</Text>
            <Text style={{ fontSize: 13, color: colors.ink700, marginTop: 2 }}>
              {items.length} items · {categories.length} categories
            </Text>
          </View>
          {membership.permissions.has('menu.edit') ? (
            <Pressable
              onPress={() => setCsvOpen(true)}
              style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center', marginRight: 8 }}
            >
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>CSV</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push('/(staff)/preview/menu' as never)}
            style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Icon name="eye" size={17} color={colors.ink900} />
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Preview</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <View style={{ height: 52, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 }}>
          <Icon name="search" size={20} color={colors.ink700} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search dishes, e.g. biryani"
            placeholderTextColor={colors.ink500}
            style={{ flex: 1, fontSize: 15, color: colors.ink900 }}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, gap: 8 }}>
        <View style={{ flex: 1, backgroundColor: colors.successBg, borderRadius: 16, padding: 10 }}>
          <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.success }}>{availableCount}</Text>
          <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.success }}>Available</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.errorBg, borderRadius: 16, padding: 10 }}>
          <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.error }}>{outCount}</Text>
          <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.error }}>Sold out</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}>
        {['All', ...categories.map((c) => c.name)].map((name) => {
          const active = activeCategory === name;
          return (
            <AnimatedPressable
              key={name}
              onPress={() => setActiveCategory(name)}
              style={{
                height: 42,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.coral600 : colors.surface,
                borderWidth: active ? 0 : 1.5,
                borderColor: colors.inputBorder,
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontFamily: active ? fonts.bodyExtraBold : fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900 }}>
                {name} · {categoryCounts[name] ?? 0}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 10, paddingBottom: 100 }}>
        {loading ? (
          <>
            <MenuItemSkeleton />
            <MenuItemSkeleton />
            <MenuItemSkeleton />
          </>
        ) : null}
        {!loading && visible.map((item, i) => (
          <Animated.View key={item.id} entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(260)} style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 12, ...shadow.card }}>
            {item.image_path ? (
              <Image
                source={{ uri: menuImageUrl(item.image_path) ?? undefined }}
                style={{ width: 72, height: 72, borderRadius: 18, opacity: item.is_available ? 1 : 0.45 }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 18,
                  backgroundColor: colors.coral50,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: item.is_available ? 1 : 0.45,
                }}
              >
                <Icon name="flame" size={28} color={colors.coral600} />
              </View>
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    borderWidth: 1.6,
                    borderColor: item.dietary_labels.includes('veg') ? '#0E8F4A' : '#A0361C',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.dietary_labels.includes('veg') ? '#0E8F4A' : '#A0361C' }} />
                </View>
                <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900, flex: 1 }} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
              {item.description ? (
                <Text style={{ fontSize: 12, color: colors.ink500 }} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>
                {formatMinor(item.price_minor, item.currency)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <Switch
                  value={item.is_available}
                  onValueChange={() => toggleAvailability(item)}
                  trackColor={{ true: '#0E8F4A', false: '#D8CCC4' }}
                  thumbColor="#FFFFFF"
                />
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: item.is_available ? colors.success : colors.error }}>
                  {item.is_available ? 'In stock' : 'Sold out'}
                </Text>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => router.push(`/(staff)/menu/${item.id}` as never)}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="edit" size={18} color={colors.ink900} />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        ))}
        {!loading && items.length === 0 ? (
          <EmptyState
            icon="menu"
            title="Your menu is empty"
            body="Add your dishes one by one — guests see them the moment you save."
            actionLabel="Add first dish"
            onAction={() => router.push('/(staff)/menu/new')}
          />
        ) : null}
        {!loading && items.length > 0 && visible.length === 0 ? (
          <Animated.View entering={FadeInDown} style={{ borderWidth: 1.5, borderColor: colors.inputBorder, borderStyle: 'dashed', borderRadius: 22, padding: 28, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>No dishes match</Text>
            <Text style={{ fontSize: 13, color: colors.ink500, textAlign: 'center' }}>Try another name or add it as a new item.</Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      <AnimatedPressable
        onPress={() => router.push('/(staff)/menu/new')}
        style={{
          position: 'absolute',
          right: 16,
          bottom: 100,
          height: 58,
          paddingHorizontal: 22,
          borderRadius: radius.pill,
          backgroundColor: colors.coral600,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          ...shadow.sheet,
        }}
      >
        <Icon name="plus" size={22} stroke={2.6} color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 16 }}>Add item</Text>
      </AnimatedPressable>
      <BottomNav active="menu" />
    </SafeAreaView>
  );
}

export default function Menu() {
  return (
    <RequireAccess permission="menu.view">
      <MenuScreen />
    </RequireAccess>
  );
}
