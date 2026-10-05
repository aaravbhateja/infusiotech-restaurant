import { Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  autoCapitalize = 'none',
  editable = true,
  maxLength,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  maxLength?: number;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink500}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry}
        style={{
          height: 52,
          borderRadius: radius.md,
          borderWidth: error ? 2 : 1.5,
          borderColor: error ? colors.error : colors.inputBorder,
          paddingHorizontal: 16,
          fontSize: 16,
          backgroundColor: editable ? colors.surface : colors.disabledBg,
          color: colors.ink900,
        }}
      />
      {error ? (
        <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.error }}>{error}</Text>
      ) : null}
    </View>
  );
}
