# Petal Maps on Huawei phones

Huawei phones have no Google Play Services, so Google Maps can't run on them. CleanStream
uses **Petal Maps (HUAWEI Map Kit)** there instead, with the same pins, route and moving
truck. If Petal Maps can't start (for example, no API key yet), the app falls back to
OpenStreetMap automatically, so the map never goes blank.

Petal Maps needs a free API key from Huawei. Until you add one, Huawei phones use the
OpenStreetMap fallback.

## 1. Create the app in AppGallery Connect

1. Sign in at <https://developer.huawei.com/consumer/en/console> with a Huawei ID, and
   complete developer identity verification (individual is fine).
2. Open **AppGallery Connect → My projects → Add project**, name it `CleanStream`.
3. In the project, **Add app**: platform **Android**, package name **`com.cleanstream.app`**
   (must match `app.json`), category **App**.
4. Under **Project settings → Manage APIs**, turn on **Map Kit**.
5. Set the **data storage location** to **Singapore** (Asia-Pacific, which covers the Philippines).

## 2. Register the app's signing fingerprint

Petal Maps only works for apps signed with a certificate you registered.

1. In a terminal in the project folder, run:
   ```
   npx eas-cli credentials --platform android
   ```
   Choose the build profile (`preview`), then **Keystore** and read the **SHA-256 Fingerprint**.
2. In AppGallery Connect, **Project settings → General information → App information**,
   paste it into **SHA-256 certificate fingerprint** and save.

## 3. Add the API key to the app

1. In **Project settings → General information**, copy the **API key** under *App information*.
2. Open `app.json` and put it in `expo.extra.huaweiMapApiKey`:
   ```json
   "extra": {
     "huaweiMapApiKey": "PASTE_THE_KEY_HERE",
     ...
   }
   ```

Alternative: download **agconnect-services.json** from the same page and put it in the
project root (next to `app.json`). The build plugin (`plugins/withHuaweiMaps.js`) picks it up
automatically. You don't need both.

## 4. Build and test

```
npx eas-cli build --platform android --profile preview
```

Install the APK on a Huawei phone (HMS Core must be installed, which it is on Huawei
phones). The Waste Map, the Home map preview and live truck tracking should all show Petal
Maps. If you still see OpenStreetMap, check the logs (`npx expo start`) for lines starting
with `[Petal]`. The usual causes are a wrong SHA-256 fingerprint or Map Kit not enabled.

## How it fits together

| Piece | What it does |
|---|---|
| `src/components/map/PetalMap.tsx` | Petal Maps pins, route and truck; loads Map Kit lazily |
| `src/hooks/useMapFallback.ts` (`useMapEngine`) | Huawei → Petal, others → Google/Apple, then OpenStreetMap if a map doesn't start |
| `src/utils/mapProvider.ts` (`PREFER_PETAL_MAPS`) | Which phones count as Huawei (Honor phones from 2021 on use Google Maps) |
| `plugins/withHuaweiMaps.js` | Adds Huawei's Maven repo, copies the marker icons, optional agconnect file |
| `scripts/generate-map-icons.mjs` | Draws the PNG marker icons (`assets/map-icons/`); rerun after changing them |
