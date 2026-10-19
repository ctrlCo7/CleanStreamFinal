# CleanStream Super Admin portal

A website where the **Super Admin** manages every CleanStream account. It replaces the account
management that used to live in the mobile Admin screens.

| Who | Can do |
| --- | --- |
| **Super Admin** (this portal only) | Create, edit, approve, deactivate, remove and restore every kind of account; reset passwords; read the audit log |
| **Admin** (mobile app) | Monitoring, scheduling, alerts, analytics. Can still *read* accounts, but can no longer change them |
| Barangay officials, cleanup team, citizens | Unchanged. Barangay and cleanup-team sign-ups now wait in the Super Admin's **Approvals** queue |

## What the portal does

- **Overview**: totals, accounts by role, who needs approval, recent activity.
- **Accounts**: search (name, email, barangay, ID), filter by role/status, create, edit, approve,
  deactivate/reactivate, send password-reset email, remove/restore, export CSV.
- **Approvals**: barangay officials and cleanup-team members who registered in the app.
- **Audit log**: an append-only record of every change (who, what, when). Entries cannot be edited or deleted.

Safety rails: you can't deactivate, remove or change the role of your own account, or of the last active Super Admin.
A deactivated or removed Super Admin loses all powers immediately (enforced in the security rules, not just the page).

## ID and face verification (Admin and Barangay Official sign-ups)

Anyone can tap "Admin" or "Barangay" when signing up, so these two roles are verified before they get any power:

1. **In the app**: the applicant picks an ID type, photographs the ID, then takes three live selfies (look
   straight, smile, turn the head). The phone checks that a face is on the ID, the text is readable and the
   name matches what they typed, and that each selfie really shows the requested pose. They tick a consent box.
2. **The account starts as `pending`** (`idVerification: 'pending'`). The security rules give a pending or
   rejected Admin/Barangay account **no staff powers at all** (it can't read accounts, verify reports, etc.),
   and the app only shows a "Your account is under review" screen. Self sign-up can't skip this: the rules
   refuse an Admin/Barangay profile that doesn't start as pending, and applicants can't approve themselves.
3. **In this portal** ("Approvals → Review ID") the Super Admin sees the ID and selfies side by side. The
   browser runs a face comparison (open face-api models, served from `public/models`, nothing sent to a third
   party) and shows **Strong match / Likely match / Uncertain / Does not match / Could not compare**, plus the
   distance for each selfie and a warning if the three selfies look like different people.
4. The Super Admin ticks "I have compared the photos myself" and approves, or rejects with a reason the
   applicant sees (they can then send new photos).
5. **The photos are deleted the moment a decision is made.** Only the outcome, reason, reviewer and the
   face-check result are kept. The images are stored in `verifications/{uid}`, readable only by the applicant
   and the Super Admin.

**How reliable is the face check?** Measured on real portraits and simulated ID photos (small, soft, compressed):
at the "likely match" threshold the right person passed about 85% of the time per photo (97% when the best of
three selfies counts) and a different person about 0.1% of the time per photo. Real IDs (glare, holograms, worn
print, older photos) are harder, so **the score only guides the reviewer; a person always decides**.

**Limits to be aware of**

- Three selfies with a smile and a head turn stop someone holding up a printed photo, but not a determined
  attacker with a video of the person. This is a reasonable check, not bank-grade liveness detection.
- The phone's own checks (face found, pose, name match) are shown to the reviewer as *reported by the phone*,
  because a modified app could fake them. The reviewer's own look at the photos is the real control.
- Accounts created before this feature, and accounts the Super Admin creates in the portal, have no
  `idVerification` field and are unaffected.
- The face models are MIT-licensed (`@vladmandic/face-api`) and total about 12 MB in `public/models`. They load only
  when a review is opened.
- Storing government IDs, even briefly, is regulated personal data (Philippine Data Privacy Act). The consent
  text, deletion on decision and restricted access are built in; check your organisation's own policy too.

### What "remove" means

Removing an account blocks it from signing in and hides it from the default list; **their reports and history
are kept** and it can be restored. The sign-in record itself is not deleted: that needs server-side admin
access (Cloud Functions, which need Firebase's paid plan). The result is the same for users: they can't get in.

## First-time setup: create the first Super Admin

The portal can't create its own first administrator (that would be a security hole), so do this once in the
Firebase console for project `cleanstream-b7942`:

1. **Authentication → Users → Add user**: enter the Super Admin's email and a strong password. Copy the **User UID**.
2. **Firestore Database → `users` collection → Add document**:
   - **Document ID**: the UID you copied
   - Fields (all strings except the two booleans): `uid` = the UID, `email`, `firstName`, `lastName`,
     `role` = `superadmin`, `isActive` = `true` (boolean), `isVerified` = `true` (boolean)
3. Deploy the updated rules (below), then sign in at the portal.

From then on the Super Admin creates every other account (including more Super Admins) from the portal.

## Develop

```bash
cd superadmin-web
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (account rules, search, passwords, CSV)
npm run build        # type-check + production build into dist/
```

To try it safely without touching real data, run the Firebase emulators (needs Java) and start the portal
with `VITE_USE_EMULATORS=true npm run dev`.

## Deploy (free: Firebase Hosting + Firestore rules, no billing plan needed)

From the repository root:

```bash
cd superadmin-web && npm install && npm run build && cd ..
npx firebase-tools@latest deploy --only firestore:rules,hosting --project cleanstream-b7942
```

The site is served at `https://cleanstream-b7942.web.app` with security headers (no framing, strict
Content-Security-Policy). **Deploy the rules and the mobile app update together**: once the rules are live,
Admins can no longer manage accounts, so older app builds' Admin "Manage user accounts" button stops working.

## Security rules tests

`npm run test:rules` starts the Firestore emulator and runs 85 checks against `../firestore.rules`
(who can read/create/update/delete accounts, the audit log's append-only guarantee, a deactivated
Super Admin losing access, and that existing app behaviour is unchanged). Needs Java.

## Notes and limits

- Cleanup-team sign-ups (no ID check) are approved with one click; that approval is recorded (`isVerified`) but the
  app does not yet block unapproved cleanup-team members. Barangay Officials and Admins, who sign up with the ID
  check, are blocked until approved.
- New accounts get a generated temporary password shown once, plus (optionally) a password-setup email.
- `src/lib/barangays.ts` must stay in sync with the barangay list in the mobile app.
