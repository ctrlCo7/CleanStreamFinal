/**
 * Adds the build number to app.json. Each APK gets a higher Android versionCode, so a new
 * APK installs over the old one as an UPDATE (data and sign-in kept) instead of needing an
 * uninstall, and the app can tell when GitHub has a newer build (see src/services/appUpdate.ts).
 *
 * The build number is the number of commits on the branch (`git rev-list --count HEAD`). The
 * local script (scripts/build-apk.ps1) and the GitHub workflow (.github/workflows/android-apk.yml)
 * set it in CLEANSTREAM_BUILD, so the same commit always gets the same number.
 */
module.exports = ({ config }) => {
  const build = Number(process.env.CLEANSTREAM_BUILD) || 1;
  const commit = process.env.CLEANSTREAM_COMMIT || 'dev';
  return {
    ...config,
    version: `1.0.${build}`,
    android: { ...config.android, versionCode: build },
    extra: { ...config.extra, build, commit },
  };
};
