# 0002 — Local data protection

Status: accepted · Spec: §14 · Gap: G-19

## Context

Phase 1 keeps everything on the device: PowerSync's SQLite in the browser, attachment files in
browser storage, and backup files the user downloads. §14 says local database encryption must be
evaluated against the SDK's real capabilities and the threat model, and that we must not claim
data is encrypted at rest unless the implementation and key management have been verified.

## Threat model

Protected by the browser, not by Tend:

- Other websites cannot read Tend's data: browsers isolate storage by origin.

Not protected:

- Anyone who can use the device and browser profile can open Tend and read everything. Tend has
  no passcode or lock.
- Malware or a malicious browser extension running as the user.
- Anyone who obtains the device without disk encryption, or a copy of the browser profile.
- Anyone who obtains a backup file. Backups (JSON and zip) are plain, unencrypted files.

Out of scope: a determined attacker with full access to an unlocked, running device.

The app is a maintenance and reminders tracker, and it tells people never to enter passwords,
authentication secrets or recovery codes (G-12). What it holds is low sensitivity: household and
asset upkeep, dates, notes, optional prices and attached documents such as receipts and manuals.
Attachments are the most sensitive thing it can hold.

## Decision

1. **Phase 1 does not encrypt local data and has no app lock.** Encryption is not claimed
   anywhere. The Settings page has a "Privacy on this device" section that says so, and the
   backup section says backup files are not encrypted.
2. **Wording rule:** the words "encrypted", "protected", "secure" and "safe" must not describe
   Tend's own data handling. The storage-persistence section was reworded from "protected" to
   "kept", because it only concerns the browser not evicting data. A test fails if the Settings
   page claims encryption or protection.
3. Users are pointed to the device's own protection (screen lock, disk encryption) for shared or
   portable devices.

## Not decided: Phase 2

Revisit when sync arrives, since data then also lives on a server (Supabase, with row-level
security). Options to evaluate then:

- **Encrypted local database.** Check whether the PowerSync web SDK version in use supports an
  encrypted SQLite build, and what it costs in size and speed. The hard part is the key: a key
  stored in the browser protects little, while a user passphrase means forgotten passphrases
  lose data. It also needs encrypted backups so the protection is not bypassed by exporting.
- **App lock.** A passcode screen keeps casual onlookers out but encrypts nothing, so any wording
  must say exactly that.
- **Encrypted attachments or backups** on their own, if the full database is out of reach.
