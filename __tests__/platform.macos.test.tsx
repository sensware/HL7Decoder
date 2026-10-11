/**
 * The macOS platform layer (src/platform/index.macos.tsx) forwards clipboard and file requests to the
 * HL7MacBridge native module. The native side is Objective-C, so these tests stand in a fake module
 * and check the JavaScript contract the decoder screen relies on.
 */
import { NativeModules } from 'react-native';

const bridge = {
  getClipboardString: jest.fn(),
  setClipboardString: jest.fn(),
  openTextFiles: jest.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (): typeof import('../src/platform/index.macos') => require('../src/platform/index.macos');

describe('macOS platform services', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (NativeModules as Record<string, unknown>).HL7MacBridge = bridge;
  });

  it('reads the clipboard, treating an empty pasteboard as empty text', async () => {
    bridge.getClipboardString.mockResolvedValueOnce('MSH|^~\\&|A').mockResolvedValueOnce(null);
    expect(await load().readClipboard()).toBe('MSH|^~\\&|A');
    expect(await load().readClipboard()).toBe('');
  });

  it('writes the clipboard', async () => {
    bridge.setClipboardString.mockResolvedValue(undefined);
    await load().writeClipboard('{"a":1}');
    expect(bridge.setClipboardString).toHaveBeenCalledWith('{"a":1}');
  });

  it('returns picked files, or null when the Open panel is cancelled', async () => {
    const files = [{ name: 'adt.hl7', text: 'MSH|^~\\&|' }];
    bridge.openTextFiles.mockResolvedValueOnce(files).mockResolvedValueOnce(null);
    expect(await load().pickTextFiles()).toEqual(files);
    expect(await load().pickTextFiles()).toBeNull();
  });

  it('explains a missing native module instead of crashing on undefined', async () => {
    delete (NativeModules as Record<string, unknown>).HL7MacBridge;
    await expect(load().readClipboard()).rejects.toThrow('HL7MacBridge native module is missing');
  });
});
