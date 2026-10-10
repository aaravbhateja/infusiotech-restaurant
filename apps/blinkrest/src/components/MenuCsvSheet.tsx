import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { pickCsvFileWeb, shareCsv } from '@/lib/csv';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

const TEMPLATE =
  'Category,Name,Description,Price,Veg,Available,Station,Prep minutes\n' +
  'Starters,Paneer Tikka,Smoky cottage cheese,249,yes,yes,tandoor,15\n' +
  'Mains,Butter Chicken,Creamy tomato gravy,320,no,yes,curry,20\n';

type Result = { created: number; updated: number; errors: { row: number; error: string }[] };

// Export the whole menu as CSV, download a blank template, or import a CSV
// (new dishes are created, existing ones matched by category + name are
// updated). Works from a pasted/clipboard CSV on every platform, and from a
// file on web.
export function MenuCsvSheet({ visible, onClose, onImported }: { visible: boolean; onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function exportMenu() {
    setBusy(true);
    const { data, error } = await supabase.rpc('export_menu_csv');
    setBusy(false);
    if (error) {
      Alert.alert('Could not export', error.message);
      return;
    }
    try {
      await shareCsv('blinkrest-menu.csv', data as string, 'Menu CSV');
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  async function downloadTemplate() {
    try {
      await shareCsv('blinkrest-menu-template.csv', TEMPLATE, 'Menu CSV template');
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  async function paste() {
    setText(await Clipboard.getStringAsync());
  }

  async function chooseFile() {
    const t = await pickCsvFileWeb();
    if (t) setText(t);
  }

  async function runImport() {
    if (text.trim().length === 0) {
      Alert.alert('Nothing to import', 'Paste your CSV first.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('import_menu_csv', { p_csv: text });
    setBusy(false);
    if (error) {
      Alert.alert(
        'Could not import',
        error.message === 'bad_header' ? 'The first line must be the header: Category,Name,Description,Price,Veg,Available,Station,Prep minutes.' : error.message,
      );
      return;
    }
    setResult(data as Result);
    setText('');
    onImported();
  }

  function close() {
    setResult(null);
    setText('');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 12, maxHeight: '88%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>Menu CSV</Text>
            <Pressable onPress={close} style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable disabled={busy} onPress={exportMenu} style={{ flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Export menu</Text>
              </Pressable>
              <Pressable onPress={downloadTemplate} style={{ flex: 1, height: 46, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Get template</Text>
              </Pressable>
            </View>

            <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6, marginTop: 6 }}>IMPORT</Text>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>
              Columns: Category, Name, Description, Price, Veg (yes/no), Available (yes/no), Station, Prep minutes. Dishes with the same category and name are updated; new ones are created.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={paste} style={{ flex: 1, height: 42, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900, fontSize: 13 }}>Paste from clipboard</Text>
              </Pressable>
              {Platform.OS === 'web' ? (
                <Pressable onPress={chooseFile} style={{ flex: 1, height: 42, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900, fontSize: 13 }}>Choose file</Text>
                </Pressable>
              ) : null}
            </View>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Or paste your CSV text here"
              placeholderTextColor={colors.ink500}
              style={{ minHeight: 110, maxHeight: 180, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, padding: 12, color: colors.ink900, textAlignVertical: 'top', fontSize: 12 }}
            />
            <Pressable disabled={busy} onPress={runImport} style={{ height: 50, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Import</Text>}
            </Pressable>

            {result ? (
              <View style={{ backgroundColor: colors.successBg, borderRadius: 16, padding: 14, gap: 4 }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.success }}>
                  {result.created} added · {result.updated} updated{result.errors.length ? ` · ${result.errors.length} skipped` : ''}
                </Text>
                {result.errors.slice(0, 8).map((e) => (
                  <Text key={e.row} style={{ fontSize: 12, color: colors.error }}>
                    Row {e.row}: {e.error}
                  </Text>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
