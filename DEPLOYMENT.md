# CleanStream: production setup, deployment, backup and recovery

This guide takes CleanStream from the repository to a running system for a barangay or city
office. It assumes the free Firebase (Spark) plan throughout; anything that needs a paid
plan is marked.

## 1. What runs where

| Part | Technology | Hosted on | Cost |
|---|---|---|---|
| Mobile app (citizens, officials, Captains, crews) | Expo SDK 58 / React Native 0.88 | Built on this PC (`npm run build:apk`) or with EAS; installed as APK / App Store | Free |
| Super Admin portal | Vite + React (`superadmin-web/`) | Firebase Hosting | Free |
| Sign-in | Firebase Authentication | Firebase | Free |
| Database and access control | Cloud Firestore + `firestore.rules` | Firebase | Free within Spark quotas |
| Photos | Cloudinary (unsigned upload preset) | Cloudinary | Free tier |
| Waste AI | COCO-SSD + MobileNet on the phone, optional custom classifier | Phone | Free |
| Routing | OSRM | `router.project-osrm.org` (see limits) | Free, demo server |
| Map tiles | OpenFreeMap (MapLibre), Google/Apple maps on phones | OpenFreeMap | Free |
| Weather | Open-Meteo | Open-Meteo | Free, non-commercial terms |
| Push to closed apps | Expo push service | exp.host | Free (needs FCM/APNs keys) |

No secret keys ship in the app. The Firebase web config is public by design (security comes
from `firestore.rules`), and Cloudinary uses an unsigned preset (no API secret).

## 2. One-time project setup

1. **Firebase project** (`cleanstream-b7942`, set in `.firebaserc`): enable Email/Password
   sign-in in Authentication, and create the Firestore database (production mode).
2. **First Super Admin**: follow `superadmin-web/README.md` ("First-time setup"). Every other
   account is created from the portal.
3. **Cloudinary**: in Settings → Upload → the preset used by the app (`tzacbvdk`), keep it
   unsigned but restrict it: allowed formats `jpg, png`, max file size 5 MB, incoming
   transformation limit 2000 px, folder `reports/`. Without limits anyone with the preset name
   could upload large files to the account.
4. **Crew sizes**: in the portal, edit each cleanup crew account and set *Number of workers*;
   cleanup proposals needing more workers are refused.

## 3. Deploying the database rules and indexes

Always test the rules first (needs Java 17+; a portable JRE works):

```
cd superadmin-web
npm install
npm run test:rules          # expects: 306 passed, 0 failed
```

Then deploy from the repository root:

```
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only firestore
```

If asked whether to delete indexes that exist in Firebase but not in the file, answer **No**.
New indexes take a few minutes to build; the app falls back to slower queries meanwhile.

## 4. Deploying the Super Admin portal

```
npx firebase-tools@latest deploy --only hosting
```

`firebase.json` rebuilds the portal (`npm --prefix superadmin-web run build`) before
uploading and sets security headers (CSP, no framing). Supported browsers: current Chrome,
Edge, Firefox and Safari.

## 5. Building the mobile app

Build from the `upgrade/expo-sdk-58` branch. Both ways build what is **committed**.

**On this PC (no Expo account, no monthly limit):**

```
npm run build:apk               # APK lands in builds/CleanStream-<date>-<commit>.apk
npm run build:apk -- -Install   # also installs it on a phone plugged in by USB
```

Needs the Android SDK, the JDK in the Android Studio folder, and CMake + Ninja
(`winget install --id Kitware.CMake -e`, `winget install --id Ninja-build.Ninja -e`). It builds in
`C:\csb`, a short-path copy, because some libraries create file paths longer than Windows allows.
Updates install over the previous APK (same signing key). See `scripts/build-apk.ps1`.

**With EAS (free tier: limited Android builds per month):**

```
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android      # installable APK
npx eas-cli@latest build --profile production --platform android   # Play Store (.aab)
npx eas-cli@latest build --profile production --platform ios       # needs an Apple Developer account
```

From Termux on Android the same commands work after `pkg install nodejs-lts git`; if npm
reports `ETARGET` for eas-cli, run `npm cache clean --force` first.

## 6. Notifications when the app is closed (optional but recommended)

Without this step notifications still appear in the app's list, and as phone notifications
while the app is open or in the background. To reach phones where CleanStream is closed:

1. Firebase console → Project settings → add an **Android app** with package
   `com.cleanstream.app`, download `google-services.json` to the repository root, and add
   `"googleServicesFile": "./google-services.json"` under `expo.android` in `app.json`.
2. Firebase console → Project settings → Service accounts → generate a key, then upload it to
   EAS: `npx eas-cli@latest credentials` → Android → *Google Service Account Key for FCM V1*.
3. iPhone: create an APNs key in the Apple Developer account; EAS asks for it during the iOS build.
4. Rebuild the app. Each phone registers its token on sign-in (`pushTokens/{uid}`).

Firebase Cloud Messaging itself is free on the Spark plan. Phones without Google services
(most Huawei) can't receive these pushes; they keep in-app delivery.

## 7. Production checklist

- [ ] `npm run test:rules` passes (306/306), rules and indexes deployed
- [ ] First Super Admin created; Captain, official and crew accounts created per barangay
- [ ] Each crew has a phone number and a number of workers
- [ ] Waterway checkpoints created with days, times and assigned officials
- [ ] Cloudinary preset restricted (section 2.3)
- [ ] Push set up (section 6), or staff told notifications need the app open
- [ ] Routing: replace the OSRM demo server before city-wide use (section 9)
- [ ] One full test of each workflow on real phones (report → verify → propose → approve →
      crew → tracking → confirm; checkpoint inspection; offline report)
- [ ] First backup taken and a test restore done on the emulator (section 8)

## 8. Backup and recovery

**What holds data:** Firestore (all records), Firebase Authentication (accounts), Cloudinary
(photos). The app and portal themselves are rebuilt from this repository.

**Firestore backups (free plan).** The managed export needs the paid plan, so use the
included script (Admin SDK):

```
cd functions && npm install && cd ..
set GOOGLE_APPLICATION_CREDENTIALS=C:\secure\cleanstream-service-account.json
node scripts/backup/firestore-backup.mjs backup backups/cleanstream-YYYY-MM-DD.json
```

It saves every collection and sub-collection with their types (timestamps, map points,
references). Run it **daily** (Windows Task Scheduler or cron) and keep at least 30 days of
files on encrypted storage; the files contain personal data. The service-account key gives
full database access: store it outside the repository and never commit it.

**Restore.** Test on the emulator first, then on production:

```
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080                  # emulator test only
node scripts/backup/firestore-backup.mjs restore backups/cleanstream-YYYY-MM-DD.json
```

Restore adds and overwrites documents; it never deletes newer ones. It was verified on the
emulator: documents, sub-collections and field types come back exactly after a full wipe.

**Accounts.** Export sign-ins with `npx firebase-tools@latest auth:export accounts.json
--format=json` (store securely; contains password hashes) and re-import with
`auth:import` if the project is ever recreated.

**Photos.** Cloudinary keeps uploads until deleted; enable Cloudinary's backup option, or
periodically download the `reports/` folder with Cloudinary's Admin API.

**Targets.** With daily backups, at most one day of data can be lost (RPO 24 h); a restore
of a typical barangay database takes minutes (RTO under 1 hour).

## 9. Known limitations and external dependencies

- **Routing** uses the public OSRM demo server, which is not meant for production use and
  may throttle or block heavy use. For city-wide deployment, self-host OSRM with the
  Philippines extract from Geofabrik, or use a routing provider with a service agreement.
  Change the URL in `src/services/crewTrackingService.ts` (`OSRM`).
- **Open-Meteo** is free for non-commercial use; confirm the terms for government use.
- **Conflict detection and other privileged steps** run in the app and are enforced by the
  security rules and Firestore transactions, not by server code (Cloud Functions need the
  paid plan). With the paid plan, move scheduling decisions into a Cloud Function.
- **AI accuracy**: on the 14 labelled reports available, the general models recognised none
  of the e-waste or hazardous items. Collect at least 50 official-labelled photos per class
  (portal → Training data), train the custom classifier with `ml/train_waste_classifier.py`,
  and enable it in System settings. Official verification stays mandatory until then.
- **Huawei phones** work without Google services (own map and location) but can't receive
  closed-app pushes.

## 10. Running the tests

```
cd superadmin-web
npm run test:mobile-ai   # app logic: scheduling, conflicts, checkpoints, tracking, PHT, routing, ...
npm test                 # Super Admin portal
npm run test:rules       # security rules on the Firestore emulator (needs Java)
cd .. && npx tsc --noEmit -p .   # app typecheck
npx expo export --platform android   # production bundle check
```
