import type { ReactNode } from 'react';
import { NativeModules, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PickedFile } from './index';

/**
 * Platform services for the macOS app (react-native-macos). Clipboard and file opening go through
 * HL7MacBridge, a small native module in macos-app/macos/HL7DecoderMac-macOS/HL7MacBridge.m that
 * wraps NSPasteboard and NSOpenPanel. Expo modules are not used on macOS.
 */

type Bridge = {
  getClipboardString(): Promise<string | null>;
  setClipboardString(text: string): Promise<void>;
  openTextFiles(): Promise<PickedFile[] | null>;
};

function bridge(): Bridge {
  const native = NativeModules.HL7MacBridge as Bridge | undefined;
  if (!native) throw new Error('HL7MacBridge native module is missing. Rebuild the macOS app.');
  return native;
}

export type { PickedFile };

export const readClipboard = async (): Promise<string> => (await bridge().getClipboardString()) ?? '';

export const writeClipboard = (text: string): Promise<void> => bridge().setClipboardString(text);

/** Shows the standard Open panel and reads the chosen files as text. Resolves to null if the user cancels. */
export const pickTextFiles = (): Promise<PickedFile[] | null> => bridge().openTextFiles();

/** A desktop window has no notch, so the screen is a plain view. */
export function Screen({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={style}>{children}</View>;
}
