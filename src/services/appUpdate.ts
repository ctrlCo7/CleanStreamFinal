/**
 * "Update available": every push to GitHub builds a new APK (.github/workflows/android-apk.yml)
 * and publishes it as a GitHub Release tagged build-<number>. The app compares that number with
 * its own and offers the new APK. Android installs it over this one as an update (same signing
 * key, higher versionCode): no uninstall, and the sign-in and saved reports are kept.
 */
import Constants from 'expo-constants';

export const UPDATE_REPO = 'ctrlCo7/CleanStreamFinal';
const LATEST_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

export interface AppUpdate {
  build: number;
  apkUrl: string;
  /** What changed, from the release notes (the commit messages). */
  notes: string;
}

interface GitHubRelease {
  tag_name?: string;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name?: string; browser_download_url?: string }[];
}

/** This APK's build number (1 for development builds, which never offer updates). */
export const currentBuild = (): number => Number(Constants.expoConfig?.extra?.build) || 1;

/** The update a release offers to a phone on `installed`, if it is newer and has an APK. */
export function pickUpdate(release: GitHubRelease | null | undefined, installed: number): AppUpdate | null {
  if (!release || release.draft || release.prerelease) return null;
  const build = Number(/^build-(\d+)$/.exec(release.tag_name ?? '')?.[1]);
  if (!build || build <= installed) return null;
  const apk = release.assets?.find((a) => a.name?.toLowerCase().endsWith('.apk') && a.browser_download_url);
  if (!apk?.browser_download_url) return null;
  const notes = (release.body ?? '').trim().split('\n').slice(0, 8).join('\n');
  return { build, apkUrl: apk.browser_download_url, notes };
}

/** Asks GitHub for the newest build. Never throws: no connection just means "no update". */
export async function checkForUpdate(installed = currentBuild(), timeoutMs = 8000): Promise<AppUpdate | null> {
  if (installed <= 1) return null; // a development build: nothing to compare with
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal });
    if (!res.ok) return null;
    return pickUpdate((await res.json()) as GitHubRelease, installed);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
