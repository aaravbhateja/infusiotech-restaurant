import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Registers this device for push on the currently active restaurant.
// Silently no-ops on web (a different delivery mechanism entirely) and on
// Expo Go on Android (Expo dropped remote push there from SDK 53 — this
// needs a development/production build to actually receive anything,
// though the registration call itself is harmless either way).
export function usePushNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web' || !Device.isDevice) return;
    let cancelled = false;

    async function register() {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status !== 'granted') return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) return; // no EAS project linked yet — nothing to register against

        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled || !expoPushToken) return;

        await supabase.rpc('register_push_token', { p_expo_push_token: expoPushToken, p_platform: Platform.OS });
      } catch {
        // Best-effort — a guest device, a simulator, or a missing EAS
        // project should never block the app from loading.
      }
    }

    register();
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
