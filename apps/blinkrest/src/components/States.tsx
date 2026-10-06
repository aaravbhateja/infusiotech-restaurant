import { useEffect } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { colors, fonts, radius } from '@/theme/tokens';

// Empty / error / confirm / toast / validation primitives from the design's
// "States" boards. Copy says what happened and what to do next.

export function EmptyState({
  icon = 'list',
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 84, height: 84, borderRadius: 28, backgroundColor: colors.saffron50, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon name={icon} size={36} stroke={1.8} color={colors.warning} />
      </View>
      <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900, textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ fontSize: 14, color: colors.ink700, textAlign: 'center', lineHeight: 20 }}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 10 }}>
          <Button title={actionLabel} onPress={onAction} />
          {secondaryLabel && onSecondary ? <Button title={secondaryLabel} onPress={onSecondary} variant="outline" /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({
  icon = 'chart',
  title,
  body = 'Something went wrong on our side. Your orders and payments are not affected.',
  code,
  onRetry,
  onContact,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  code?: string;
  onRetry?: () => void;
  onContact?: () => void;
}) {
  const stamp = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 84, height: 84, borderRadius: 28, backgroundColor: colors.coral50, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon name={icon} size={36} stroke={1.8} color={colors.coral600} />
      </View>
      <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 14, color: colors.ink700, textAlign: 'center', lineHeight: 20 }}>{body}</Text>
      {code ? <Text style={{ fontSize: 11, color: colors.ink500 }}>Error {code} · {stamp}</Text> : null}
      {onRetry ? (
        <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <Button title="Try again" onPress={onRetry} variant="secondary" style={{ alignSelf: 'stretch' }} />
          {onContact ? (
            <Pressable onPress={onContact} hitSlop={8}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral600, textDecorationLine: 'underline' }}>Contact support</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Sensitive actions confirm with the consequence spelled out.
export function ConfirmDialog({
  visible,
  title,
  bullets,
  confirmLabel,
  danger = true,
  icon = 'logout',
  checkboxLabel,
  checked,
  onToggleCheck,
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  bullets?: string[];
  confirmLabel: string;
  danger?: boolean;
  icon?: IconName;
  checkboxLabel?: string;
  checked?: boolean;
  onToggleCheck?: () => void;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(27,23,22,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: 20, gap: 12, alignSelf: 'stretch' }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: danger ? colors.coral50 : colors.infoBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={20} color={danger ? colors.coral600 : colors.info} />
          </View>
          <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>{title}</Text>
          {bullets?.map((b) => (
            <View key={b} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ color: colors.ink700 }}>•</Text>
              <Text style={{ flex: 1, fontSize: 13, color: colors.ink700, lineHeight: 19 }}>{b}</Text>
            </View>
          ))}
          {checkboxLabel && onToggleCheck ? (
            <Pressable onPress={onToggleCheck} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: checked ? colors.coral600 : colors.surface, borderWidth: checked ? 0 : 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                {checked ? <Icon name="check" size={14} stroke={3} color="#FFFFFF" /> : null}
              </View>
              <Text style={{ flex: 1, fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{checkboxLabel}</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button title="Cancel" onPress={onCancel} variant="outline" style={{ flex: 1 }} />
            <Button title={confirmLabel} onPress={onConfirm} loading={busy} style={{ flex: 1, backgroundColor: danger ? colors.error : colors.coral600 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

const TOAST_STYLE: Record<ToastKind, { bg: string; fg: string; icon: IconName }> = {
  success: { bg: colors.ink900, fg: '#FFFFFF', icon: 'checkc' },
  error: { bg: colors.error, fg: '#FFFFFF', icon: 'alert' },
  info: { bg: colors.infoBg, fg: colors.ink900, icon: 'info' },
  warning: { bg: colors.warningBg, fg: colors.warning, icon: 'alert' },
};

// A bottom snackbar that clears itself; routine actions get an Undo
// instead of a confirm dialog.
export function Snackbar({
  message,
  kind = 'success',
  actionLabel,
  onAction,
  onDismiss,
  duration = 5000,
}: {
  message: string | null;
  kind?: ToastKind;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  duration?: number;
}) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  if (!message) return null;
  const s = TOAST_STYLE[kind];
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(160)}
      style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 72, zIndex: 40, backgroundColor: s.bg, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      <Icon name={s.icon} size={18} color={s.fg} />
      <Text style={{ flex: 1, fontSize: 13, fontFamily: fonts.bodyBold, color: s.fg }}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={() => {
            onAction();
            onDismiss();
          }}
          hitSlop={8}
        >
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.saffron400 }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

// Form validation summary shown above the fields.
export function FormErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={{ backgroundColor: colors.errorBg, borderRadius: radius.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name="alert" size={16} color={colors.error} />
      <Text style={{ flex: 1, fontSize: 13, fontFamily: fonts.bodyBold, color: colors.error }}>{message}</Text>
    </View>
  );
}
