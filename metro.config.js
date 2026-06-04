const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable package.json "exports" field resolution and prioritise the
// "react-native" condition so Firebase (and similar packages) load their
// React Native builds instead of the browser builds.
config.resolver.unstable_enablePackageExports = true;
config.resolver.conditionNames = ['react-native', 'require', 'import', 'browser', 'default'];

module.exports = config;
