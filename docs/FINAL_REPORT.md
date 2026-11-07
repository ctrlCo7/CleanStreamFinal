# CleanStream: finalization report

Branch `upgrade/expo-sdk-58`. Written 7 November 2026 (Philippine time).
Companion documents: `DEPLOYMENT.md` (setup, deploy, backup and recovery) and the online Demo Kit
(feature summary, readiness checklist, timed demo script).

Every status below says how it was checked. "Verified" means a test was actually run or the feature
was used on a device; anything else is listed as not fully verified.

---

## A. Completion report

### Integrated and finished in this round
| Item | What was done |
|---|---|
| Cleanup team account requests (officials and Captains) | New app screen (Profile → Request a cleanup team account, also offered when a barangay has no crew), form checks, list of the barangay's requests with status, withdraw while waiting. |
| Super Admin crew requests | Portal page with live sidebar badge, pop-up, desktop notification, count in the browser tab. Account form opens filled in from the request. Request re-checked just before the account is created, so it can't be approved twice. Decline needs a reason. Requester is notified; both decisions are written to the audit log. |
| Security rules for requests | Only ID-approved officials and Captains of that barangay can request, in their own name; only the Super Admin answers; answered requests are final; never deleted. 26 new rule tests. |
| Reports leaking between accounts | Signing out clears the report list; a different account starts empty; a late reply for the previous account is ignored. 3 regression tests. |
| Release APK crashing on launch | SDK 58 turned on R8 code shrinking, which removed part of WorkManager. Config plugin `plugins/withReleaseShrinkingOff.js` turns it off for every build. |
| App crashing after sign-in on phones with Google services | Google Maps key was stripped from the build; now passed to the maps plugin. Verified on an emulator with Google services, then on the team's phones. |
| Live tracking "Signal lost" at start | Heartbeat every 15 s independent of GPS, no distance filter, phone-clock differences ignored, sharing resumes when the app is reopened. 4 tests. |
| Portal Overview | Added: waiting for verification, verified awaiting cleanup, cleanups scheduled or under way, cleaned up, barangays on CleanStream (of all Cebu City barangays), trucks on the way now, crew requests waiting. All from live data. |
| Portal Analytics | Added: severity of open reports, report workflow pipeline with completion rate. Monthly trend now grouped in Philippine time. |
| Portal City map | Map tiles were blocked by the hosting security policy; policy updated (deployed earlier). Trips silent for 30 minutes are hidden. |
| One-command APK build | `npm run build:apk` builds a release APK on this PC; verified twice (APK produced; the same build was installed and run). |
| Email confirmation | Citizens, officials and Captains who sign themselves up get a confirmation email and see a "Confirm your email" screen (resend with a 60-second wait, automatic check on returning to the app). The security rules refuse reports and staff powers until the email is confirmed. Accounts from before this change and accounts the Super Admin creates are not affected. 10 rule tests. |
| Debug output | Remaining debug logging limited to development builds. |
| Documentation | `DEPLOYMENT.md` updated for SDK 58 and local builds; this report. |

### Known gaps (not done in this round)
- **Translations:** only 4 screens (citizen home, report, AI result, profile) use the translation system. 41 screens, including all staff screens, are English only. Switching language changes only those 4 screens.
- **Full visual redesign** of every screen across five roles was not attempted; screens keep the existing green design system, with dark mode on all screens that use the theme.
- **Phone push from the portal:** decisions on crew requests reach the requester's notification bell, not as a push when the app is closed.
- **Linting:** ESLint is configured but its packages are not installed, so there is no lint run. Type checking is strict and passes.
- **Demonstration data and accounts** were not created, because that needs the Super Admin's sign-in. See section E.

---

## B. Testing report

All numbers below are from runs on 7 November 2026.

| Suite | Command | Result |
|---|---|---|
| App type check | `npx tsc --noEmit` | 0 errors in `src/` |
| App unit tests | `cd superadmin-web && npm run test:mobile-ai` | **126 passed, 0 failed** (11 files) |
| Portal type check | `cd superadmin-web && npx tsc --noEmit` | 0 errors |
| Portal unit tests | `cd superadmin-web && npx vitest run` | **74 passed, 0 failed** (8 files) |
| Security rules (Firestore emulator) | `cd superadmin-web && npm run test:rules` | **342 passed, 0 failed** (306 existing + 26 crew requests + 10 email confirmation) |
| Portal production build | `cd superadmin-web && npm run build` | Built successfully |
| App JavaScript bundle | `npx expo export --platform android` | Built successfully |
| Release APK | `npm run build:apk` | See the build result added at the end of section C |
| Lint | — | Not run (ESLint packages not installed) |

### Tested on a device
- Emulator (Pixel 6, Android 14, Google services): old APK crashed after sign-in with "API key not found"; fixed APK opened, signed in, showed the home screen with the Google map and the Waste Map with pins, hotspots and live badge. No crash.
- The team's physical phones: the fixed APK installed and ran without crashing (reported by the team).
- Backup and wipe scripts: run against the local Firestore emulator; the wipe deleted only report data and kept users, checkpoints and chats.

### Not tested end to end on devices in this round
The five workflows in the brief were not each run through on phones in this round. Their logic is covered by unit and rule tests (scheduling conflicts, crew size, report ownership, tracking status, notification routing, request validation), but the full chain across four phones has to be rehearsed before the demo (see the Demo Kit checklist).

---

## C. Deployment package

| Part | Where | How |
|---|---|---|
| Source | GitHub, branch `upgrade/expo-sdk-58` | |
| Database rules and indexes | `firestore.rules`, `firebase.indexes.json` | `npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes` |
| Super Admin portal | `superadmin-web/` | `npx firebase-tools@latest deploy --only hosting` (builds first) |
| Android APK | `builds/CleanStream-<date>-<commit>.apk` | `npm run build:apk`; install by Google Drive, USB copy, or `npm run build:apk -- -Install` |
| Environment | No secret keys in the app. Firebase web config is public by design; Cloudinary uses an unsigned preset. Service-account keys stay outside the project folder and are git-ignored. |

**Database changes:** one new collection, `crewRequests`, created on first use, and a new profile field `emailVerificationRequired` set only on new self sign-ups. No migration of existing data is needed and no existing data is changed.

**Order matters:** install the new APK on phones before or right after deploying the rules. Once the new rules are live, sign-ups from the **old** APK are refused (it doesn't set the email confirmation field).

**Deploy status:** the rules, indexes and portal for this round are **not deployed yet**. The deploy needs your Firebase sign-in:

```
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes,hosting --project cleanstream-b7942
```

Until it runs, crew requests are refused by the live database, and the portal shows the previous version.

---

## D. System documentation

### Architecture
```
 Phones (Expo SDK 58 / React Native 0.88)          Super Admin portal (Vite + React)
   citizen · official · Captain · crew                Firebase Hosting
              │                                              │
              ├──── Firebase Authentication ─────────────────┤
              ├──── Cloud Firestore + firestore.rules ───────┤  (all access control lives in the rules)
              ├──── Cloudinary (photos, unsigned preset)
              ├──── On-phone AI (TensorFlow.js models)
              ├──── OSRM (road routes) · OpenFreeMap / Google / Apple maps · Open-Meteo (weather)
              └──── Expo push service (phone notifications)
```
There is no custom server: privileged steps are protected by Firestore security rules and transactions (Cloud Functions need the paid plan).

### Database (Firestore collections)
| Collection | Holds |
|---|---|
| `users` | Profiles and roles |
| `verifications` | ID and face checks for staff sign-ups (Super Admin only) |
| `reports` | Waste reports, AI results, status history |
| `cleanupTasks` | Proposed, approved and finished cleanups |
| `crewTracking` | Live truck position per task |
| `scheduleLocks` | Per-barangay, per-day lock that prevents double booking |
| `checkpoints`, `checkpointAlarms`, `fieldCheckpoints` | Waterway checkpoints, daily alarm time, inspection reports |
| `cleanupEvents` | Volunteer events and participants |
| `notifications`, `pushTokens` | In-app notices and phone push addresses |
| `barangayStaff` | Which accounts handle each barangay (ids only) |
| `conversations` | Chats and the barangay inbox |
| `crewRequests` | Cleanup team account requests (new) |
| `activityLogs` | Barangay activity (Captain reads) |
| `auditLogs` | Account and admin changes (write-once, Super Admin reads) |
| `barangays`, `systemSettings`, `announcements`, `analytics`, `feedback` | Reference data and settings |

### "API"
The app and portal talk to Firestore directly through these modules: `src/services/*Service.ts` (app) and `superadmin-web/src/lib/*.ts` (portal). Each operation is allowed or refused by `firestore.rules`.

### Role and permission matrix
| Can… | Citizen | Official | Captain | Crew | Super Admin |
|---|---|---|---|---|---|
| File reports | ✓ | ✓ | — | — | — |
| Read reports | own + own barangay's | own barangay | own barangay | own barangay | all |
| Verify or reject reports | — | ✓ own barangay | ✓ own barangay | — | — |
| Propose cleanups | — | ✓ | ✓ | — | — |
| Approve cleanups | — | — | ✓ own barangay | — | — |
| Update task progress, share location | — | record for crews without phones | — | ✓ assigned | — |
| Request a crew account | — | ✓ own barangay | ✓ own barangay | — | — |
| Create, change, remove accounts | — | — | — | — | ✓ |
| Approve staff ID checks | — | — | — | — | ✓ |
| Read audit log | — | — | — | — | ✓ (nobody can edit it) |
| Change own role | — | — | — | — | — |

### Maintenance
- Backup and restore: `node scripts/backup/firestore-backup.mjs backup|restore <file>` (see `DEPLOYMENT.md` §8).
- Clear report data, keeping accounts and setup: `node scripts/backup/wipe-report-data.mjs` counts only; add `--yes` to back up then delete; `--messages` also clears chats.
- Both need `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service-account key kept outside the project.

---

## E. Presentation package

The online Demo Kit has the full feature summary, a readiness checklist, the device cast and a timed 15-minute script with fallbacks.

### Demo accounts (to create in the portal → Accounts → Create account)
Use clearly marked demo emails so they are never confused with real users, for example:

| Role | Suggested email | Barangay |
|---|---|---|
| Citizen | `demo.citizen@cleanstream.test` | the demo barangay |
| Barangay Official | `demo.official@cleanstream.test` | the demo barangay |
| Barangay Captain | `demo.captain@cleanstream.test` | the demo barangay |
| Cleanup Crew | `demo.crew@cleanstream.test` (or create it live through a crew request) | the demo barangay |
| Super Admin | your existing Super Admin | — |

Passwords: use the generated ones the portal shows once, and keep them off slides.

### Demo data
Real reports filed through the app, not seeded fakes:
1. Back up, then clear old test data with the wipe script.
2. File 3 reports within about 50 m of each other (makes a hotspot), plus 1–2 elsewhere in different severities.
3. Verify one, schedule and approve one, and complete one beforehand, so every status appears on the maps and charts.
4. Add one checkpoint with an inspection and one volunteer event.

### Known demo limitations
- Waste-type AI: 57% right on a 14-photo test; e-waste and hazardous 0 of 5. Present it as an assistant that officials confirm.
- The app does not keep people signed in after it is closed; sign in beforehand.
- Maps, routing and weather need internet.
- Language switching changes only the citizen home, report, AI result and profile screens.
- Phone pushes reach closed apps only where push credentials are set up; never on Huawei phones without Google services.

---

## F. Final status

### COMPLETE AND VERIFIED
- Security rules for every role and barangay, including crew requests and email confirmation: 342 of 342 rule tests.
- App launches, signs in and shows Google maps on phones with Google services (emulator and team phones).
- Report isolation between accounts on one phone: regression tests.
- Live-tracking status logic, notification routing, request validation, schedule-conflict and crew-size logic, hotspot and duplicate rules: unit tests (126 app, 74 portal).
- Portal production build; app JavaScript bundle.
- `npm run build:apk`: produces an installable release APK.
- Wipe script (count-only by default, backup before delete): run on the Firestore emulator.

### IMPLEMENTED BUT NOT FULLY VERIFIED
- Cleanup team requests end to end on real devices (code and rules tested; the live rules are not deployed yet).
- Email confirmation on a real phone and inbox (rules tested; the email itself depends on Firebase's sender and may land in spam).
- New Overview and Analytics figures in the browser (builds and unit tests pass; not looked at with live data).
- Full five-workflow chain across four phones (report → verify → approve → track → complete; checkpoint issue; conflict; offline sync).
- Background location on iPhone and on Huawei phones (permissions and fallbacks are in place; not tested on those devices).
- Phone push to closed apps (needs FCM/APNs keys).

### BLOCKED BY EXTERNAL DEPENDENCY
- Deploying rules, indexes and portal: needs your Firebase sign-in (command in section C).
- Creating demo accounts and data: needs the Super Admin's portal sign-in.
- iPhone build: needs an Apple Developer account.
- EAS cloud builds: free monthly quota used until 1 December 2026 (local builds work).
- Road routing uses the public OSRM demo server.

### NOT YET IMPLEMENTED
- Tagalog and Cebuano for 41 of 45 screens.
- A full visual redesign pass across all five roles.
- A general notification centre in the portal (alerts exist for crew requests only).
- Lint tooling.
