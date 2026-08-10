module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must stay last. Reanimated 4 runs its worklet transform through
      // react-native-worklets, and anything ordered after it will not be
      // visible to the worklet compiler.
      'react-native-worklets/plugin',
    ],
  };
};
