import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { build: 80 } } } }));

import { checkForUpdate, currentBuild, pickUpdate } from '../appUpdate';

const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'build-81',
  body: '- Fix offline reports\n- Show full tab names',
  assets: [{ name: 'CleanStream-build81-abc1234.apk', browser_download_url: 'https://github.com/x/releases/download/build-81/app.apk' }],
  ...over,
});

describe('in-app update', () => {
  it('offers a newer build with its APK and what changed', () => {
    expect(pickUpdate(release(), 80)).toEqual({
      build: 81,
      apkUrl: 'https://github.com/x/releases/download/build-81/app.apk',
      notes: '- Fix offline reports\n- Show full tab names',
    });
  });

  it('offers nothing when the phone already has that build or a newer one', () => {
    expect(pickUpdate(release(), 81)).toBeNull();
    expect(pickUpdate(release(), 90)).toBeNull();
  });

  it('ignores drafts, pre-releases, other tags and releases without an APK', () => {
    expect(pickUpdate(release({ draft: true }), 80)).toBeNull();
    expect(pickUpdate(release({ prerelease: true }), 80)).toBeNull();
    expect(pickUpdate(release({ tag_name: 'v2.0' }), 80)).toBeNull();
    expect(pickUpdate(release({ assets: [{ name: 'notes.txt', browser_download_url: 'https://x/n.txt' }] }), 80)).toBeNull();
    expect(pickUpdate(null, 80)).toBeNull();
  });

  it('reads its own build number from the app config', () => {
    expect(currentBuild()).toBe(80);
  });

  it('treats no connection as "no update" instead of failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network request failed'); }));
    await expect(checkForUpdate(80)).resolves.toBeNull();
  });

  it('never offers updates to development builds', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkForUpdate(1)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
