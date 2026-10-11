import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Decoder } from './src/Decoder';

/** Entry for the Expo targets (iOS, Android, web). The macOS app has its own entry in macos-app/index.js. */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Decoder />
    </SafeAreaProvider>
  );
}
