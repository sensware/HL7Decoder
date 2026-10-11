const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * The macOS app bundles code from the repository root (../src), which sits next to the Expo
 * app's node_modules (React Native 0.86). react-native-macos needs React Native 0.83, so every
 * package must come from this folder's node_modules: hierarchical lookup is off and the root
 * node_modules is blocked, otherwise ../src would pick up a second copy of react / react-native.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const root = path.resolve(__dirname, '..');
const escape = (p) => p.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');

const config = {
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    disableHierarchicalLookup: true,
    blockList: [
      new RegExp(`^${escape(path.join(root, 'node_modules'))}[/\\\\].*`),
      new RegExp(`^${escape(path.join(root, '.expo'))}[/\\\\].*`),
      new RegExp(`^${escape(path.join(__dirname, 'macos'))}[/\\\\].*`),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
