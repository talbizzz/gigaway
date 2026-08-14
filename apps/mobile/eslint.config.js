// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    rules: {
      // This app is deliberately copy-heavy — the empty states, verification
      // wording and safety notices are doing real work and get edited often.
      // Escaping every apostrophe in "you're" and "don't" would make that copy
      // materially harder to read and revise, and modern React renders these
      // correctly. The rule guards against an ambiguity we do not have.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
