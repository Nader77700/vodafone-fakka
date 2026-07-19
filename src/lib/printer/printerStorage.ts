/**
 * printerStorage — حفظ وقراءة إعدادات الطابعة
 * يستخدم @capacitor/preferences (مشابه AsyncStorage) للتخزين الدائم
 */
import { Preferences } from '@capacitor/preferences';
import type { SavedPrinter } from './types';

const KEY = 'vf_saved_printer';

export async function getSavedPrinter(): Promise<SavedPrinter | null> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return null;
    return JSON.parse(value) as SavedPrinter;
  } catch {
    return null;
  }
}

export async function savePrinter(printer: SavedPrinter): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(printer) });
}

export async function clearSavedPrinter(): Promise<void> {
  await Preferences.remove({ key: KEY });
}
