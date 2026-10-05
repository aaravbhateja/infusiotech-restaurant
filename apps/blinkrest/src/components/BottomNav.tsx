import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/useAuth';
import { homePathForRole } from '@/lib/roleHome';
import { colors, fonts } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

type NavItem = { key: string; label: string; icon: IconName; href: string };

// Built from the signed-in member's actual role + effective permissions
// (role defaults plus any per-person overrides), not a hardcoded table —
// so an Owner editing a role's defaults (e.g. removing menu.view from
// Waiter) immediately hides that tab for everyone in that role, instead of
// leaving a tab that leads to an "access denied" screen.
function useNavItems(): NavItem[] {
  const { membership } = useAuth();
  const roleName = membership?.roleName;
  const can = (key: string) => membership?.permissions.has(key) ?? false;

  const homeItem: NavItem =
    roleName === 'Cashier'
      ? { key: 'home', label: 'Counter', icon: 'cash', href: homePathForRole(roleName) }
      : roleName === 'Waiter'
        ? { key: 'home', label: 'My tables', icon: 'tables', href: homePathForRole(roleName) }
        : roleName === 'Kitchen Staff'
          ? { key: 'home', label: 'Queue', icon: 'chef', href: homePathForRole(roleName) }
          : { key: 'home', label: 'Home', icon: 'home', href: homePathForRole(roleName) };

  const items: NavItem[] = [homeItem];

  if (can('orders.view')) items.push({ key: 'orders', label: 'Orders', icon: 'orders', href: '/(staff)/orders' });
  if (can('menu.view')) {
    items.push(
      roleName === 'Kitchen Staff'
        ? { key: 'menu', label: 'Stock', icon: 'list', href: '/(staff)/menu' }
        : { key: 'menu', label: 'Menu', icon: 'menu', href: '/(staff)/menu' },
    );
  }
  // A Waiter's home screen is already their table view — a second generic
  // Tables tab would be redundant.
  if (can('tables.view') && roleName !== 'Waiter') items.push({ key: 'tables', label: 'Tables', icon: 'tables', href: '/(staff)/tables' });

  const isOwnerOrManager = roleName === 'Owner' || roleName === 'Manager';
  items.push(isOwnerOrManager ? { key: 'more', label: 'More', icon: 'more', href: '/(staff)/more' } : { key: 'more', label: 'Profile', icon: 'user', href: '/(staff)/more' });

  return items;
}

export function BottomNav({ active }: { active: string }) {
  const insets = useSafeAreaInsets();
  const items = useNavItems();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 16),
        paddingHorizontal: 8,
      }}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Pressable
            key={item.key}
            onPress={() => router.replace(item.href as never)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 56 }}
          >
            {isActive ? (
              <View
                style={{
                  width: 56,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.coral50,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={item.icon} size={22} stroke={2.1} color={colors.coral700} />
              </View>
            ) : (
              <View style={{ width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={item.icon} size={22} stroke={1.9} color={colors.ink500} />
              </View>
            )}
            <Text
              style={{
                fontSize: 12,
                fontFamily: isActive ? fonts.bodyExtraBold : fonts.bodySemi,
                color: isActive ? colors.coral700 : colors.ink500,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
