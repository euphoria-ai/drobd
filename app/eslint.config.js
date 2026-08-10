// https://docs.expo.dev/guides/using-eslint/
// Flat config (ESLint 9+) extending eslint-config-expo.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'expo-env.d.ts'],
  },
  {
    // eslint-plugin-react-hooks v6 (bundled by eslint-config-expo) ships the new
    // React Compiler lint rules. Two of them fundamentally misread this app's
    // native animation code, so they are turned off rather than worked around:
    //   - `immutability` flags reassigning a Reanimated shared value's `.value`,
    //     which is exactly how shared values are meant to be driven.
    //   - `refs` flags reading a ref inside a react-native-gesture-handler
    //     callback, which runs outside render and is the documented pattern.
    // `set-state-in-effect` is a real code smell in general but fires on the
    // legitimate "reset local state when the selected input changes" effects
    // here, so it is downgraded to a warning instead of silenced.
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
