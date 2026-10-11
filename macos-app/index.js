/**
 * Entry for the macOS app. The screen is the shared one in ../src; Metro resolves its platform
 * files (src/platform/index.macos.tsx) and maps `react-native` to `react-native-macos`.
 */
import { AppRegistry } from 'react-native';
import { Decoder } from '../src/Decoder';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => Decoder);
