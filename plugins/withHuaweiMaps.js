/**
 * Expo config plugin for Petal Maps (HUAWEI Map Kit, @hmscore/react-native-hms-map).
 * The android/ folder is generated on every build, so these Gradle changes have to be
 * made here rather than by hand:
 *
 *  1. Huawei's Maven repository, where the Map Kit SDK is published.
 *  2. The PNG marker icons (assets/map-icons/) copied into the Android app's assets,
 *     because Petal Maps markers can only show image files.
 *  3. Optional: if agconnect-services.json (downloaded from AppGallery Connect) is in the
 *     project root, the AppGallery Connect Gradle plugin and that file. Without it the
 *     app passes the API key from app.json (expo.extra.huaweiMapApiKey) at runtime.
 */
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod, withProjectBuildGradle } = require('expo/config-plugins');

const HUAWEI_REPO = "maven { url 'https://developer.huawei.com/repo/' }";
const AGCP_CLASSPATH = "classpath('com.huawei.agconnect:agcp:1.9.1.301')";
const AGC_FILE = 'agconnect-services.json';

const addRepo = (gradle, block) => {
  // Add Huawei's repo inside `<block> { repositories { ... } }`, once.
  const re = new RegExp(`(${block}\\s*\\{[\\s\\S]*?repositories\\s*\\{)`);
  if (!re.test(gradle)) return gradle;
  return gradle.replace(re, `$1\n        ${HUAWEI_REPO}`);
};

const withHuaweiRepos = (config, useAgc) =>
  withProjectBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes('developer.huawei.com/repo')) {
      gradle = addRepo(gradle, 'buildscript');
      gradle = addRepo(gradle, 'allprojects');
      if (!/allprojects\s*\{[\s\S]*developer\.huawei\.com/.test(gradle)) {
        gradle += `\nallprojects {\n    repositories {\n        ${HUAWEI_REPO}\n    }\n}\n`;
      }
    }
    if (useAgc && !gradle.includes('com.huawei.agconnect:agcp')) {
      gradle = gradle.replace(/(buildscript\s*\{[\s\S]*?dependencies\s*\{)/, `$1\n        ${AGCP_CLASSPATH}`);
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });

const withAgcPlugin = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("com.huawei.agconnect")) {
      cfg.modResults.contents += "\napply plugin: 'com.huawei.agconnect'\n";
    }
    return cfg;
  });

const withFiles = (config, useAgc) =>
  withDangerousMod(config, ['android', async (cfg) => {
    const root = cfg.modRequest.projectRoot;
    const appDir = path.join(cfg.modRequest.platformProjectRoot, 'app');

    const iconsSrc = path.join(root, 'assets', 'map-icons');
    const iconsDest = path.join(appDir, 'src', 'main', 'assets', 'map-icons');
    if (fs.existsSync(iconsSrc)) {
      fs.mkdirSync(iconsDest, { recursive: true });
      for (const f of fs.readdirSync(iconsSrc).filter((n) => n.endsWith('.png'))) {
        fs.copyFileSync(path.join(iconsSrc, f), path.join(iconsDest, f));
      }
    }
    if (useAgc) fs.copyFileSync(path.join(root, AGC_FILE), path.join(appDir, AGC_FILE));
    return cfg;
  }]);

module.exports = function withHuaweiMaps(config) {
  const useAgc = fs.existsSync(path.join(process.cwd(), AGC_FILE));
  config = withHuaweiRepos(config, useAgc);
  if (useAgc) config = withAgcPlugin(config);
  return withFiles(config, useAgc);
};
