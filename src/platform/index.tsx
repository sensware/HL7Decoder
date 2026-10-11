import type { ReactNode } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

/**
 * Platform services for the Expo targets (iOS, Android, web). The macOS app gets index.macos.tsx
 * instead: Metro picks the `.macos` file when bundling for macOS, so the screen never imports Expo there.
 */

export type PickedFile = { name: string; text: string };

export const readClipboard = (): Promise<string> => Clipboard.getStringAsync();

export const writeClipboard = async (text: string): Promise<void> => {
  await Clipboard.setStringAsync(text);
};

/** Lets the user pick one or more files and reads them as text. Resolves to null if they cancel. */
export async function pickTextFiles(): Promise<PickedFile[] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return null;
  return Promise.all(result.assets.map(async (a) => ({
    name: a.name,
    text: Platform.OS === 'web' ? await (a.file ? a.file.text() : (await fetch(a.uri)).text()) : await new File(a.uri).text(),
  })));
}

/** The screen's root view, kept clear of the notch and status bar. */
export function Screen({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <SafeAreaView style={style} edges={['top', 'left', 'right']}>{children}</SafeAreaView>;
}
