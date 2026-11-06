/**
 * Turns off R8 code shrinking for Android release builds.
 *
 * The SDK 58 Android template switches it on (android.enableMinifyInReleaseBuilds=true). R8
 * then strips classes that are only created by reflection (e.g. WorkManager's Room database,
 * used by expo-notifications), and the release APK crashes on launch with
 * "Failed to create an instance of class androidx.work.impl.WorkDatabase". Earlier builds
 * ran without shrinking, so this restores that. Applied on every prebuild, local or EAS.
 */
const { withGradleProperties } = require('expo/config-plugins');

const OFF = {
  'android.enableMinifyInReleaseBuilds': 'false',
  'android.enableShrinkResourcesInReleaseBuilds': 'false',
};

module.exports = function withReleaseShrinkingOff(config) {
  return withGradleProperties(config, (c) => {
    c.modResults = c.modResults.filter((p) => !(p.type === 'property' && p.key in OFF));
    for (const [key, value] of Object.entries(OFF)) c.modResults.push({ type: 'property', key, value });
    return c;
  });
};
