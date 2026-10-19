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

`npm run test:rules` starts the Firestore emulator and runs 48 checks against `../firestore.rules`
(who can read/create/update/delete accounts, the audit log's append-only guarantee, a deactivated
Super Admin losing access, and that existing app behaviour is unchanged). Needs Java.

## Notes and limits

- Approval is recorded (`isVerified`) and shown, but the mobile app does not yet block unapproved barangay
  or cleanup-team members from working. Enforcing it would lock out every existing test account until
  approved, so it is left as a deliberate follow-up.
- New accounts get a generated temporary password shown once, plus (optionally) a password-setup email.
- `src/lib/barangays.ts` must stay in sync with the barangay list in the mobile app.
