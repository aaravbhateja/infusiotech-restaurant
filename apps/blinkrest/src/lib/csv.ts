import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// Saves CSV text as a file and hands it to the OS: a browser download on web,
// the share sheet (Save to Files, WhatsApp, Gmail, Drive...) on a phone.
export async function shareCsv(filename: string, csv: string, dialogTitle?: string) {
  if (Platform.OS === 'web') {
    // BOM so Excel reads rupee signs and non-English dish names correctly.
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write('﻿' + csv);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { dialogTitle, mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
}

// Web only: let the user pick a .csv file and return its text.
export function pickCsvFileWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.click();
  });
}
