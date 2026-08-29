# Persistent admin sign-in

## Goal

Let anyone browse ØkoJitsu while requiring an administrator sign-in before they
can alter custom games or sessions. The signed-in state persists on the current
device after browser restarts.

## Scope

- Add an upper-right `Admin sign in` control to the header.
- Open an accessible password dialog when it is selected.
- Accept the configured administrator password and persist a device-local admin
  flag in browser storage.
- Replace the sign-in control with an `Admin · Sign out` control after success.
- Keep all game and session mutation controls unavailable to visitors.
- Protect creation and editing of custom games, creation and saving of sessions,
  copying a session for editing, and deleting a session.
- Leave browsing, searching, reading game details, and viewing sessions open to
  everyone.

## Behaviour

The app reads the persisted admin flag during startup. A correct password closes
the dialog and enables the administrative controls immediately. A wrong password
leaves the dialog open and displays a concise error. Signing out clears the flag
and removes the protected controls. The flag has no expiry and is scoped to the
current browser profile.

## Security boundary

This is an interface gate for a static browser app. It does not secure the
password, source repository, or browser-stored data against a technically
capable visitor. Repository access remains controlled by the repository host.

## Validation

- Automated tests cover persisted sign-in state and password validation.
- The production build succeeds.
- The published version is opened after a successful private deployment.
