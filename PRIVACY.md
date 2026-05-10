# Privacy Policy

**Last updated:** [2026-05-09 — fill in when you commit]

## Plain language summary

This app does not collect, transmit, store on any server, or share any data about you or your activity. It runs entirely on your device. The developer has no servers, no accounts system, no analytics, and no way to see anything you do in the app.

## In detail

### What data the app collects

None. The app has no analytics, no telemetry, no crash reporting, and no remote logging.

### What data the app stores

The app stores the entries you create in your browser's local storage on your device (specifically, IndexedDB). This data is encrypted at rest using a key derived from a passphrase you provide.

### Where your data goes

Nowhere. The app cannot transmit your data anywhere. There is no network code in the app that sends entries off your device.

### Hosting and the developer's role

The app is hosted as static files on GitHub Pages. When you visit the app's URL, GitHub serves the app's HTML, CSS, JavaScript, and icons to your browser. After that, the app runs on your device with no further communication to GitHub or to the developer.

GitHub may log your IP address and request metadata as part of operating their hosting service. This is the same as visiting any website. The developer does not have access to these logs and does not request them.

### Cookies

The app does not set any cookies.

### Third-party services

The app does not use any third-party services. It does not load fonts, scripts, images, or any other resource from any external service.

### Children's privacy

The app is not directed at children. It does not knowingly collect any information from children — or from anyone, since it does not collect any information.

### Security

Your data is encrypted on your device using AES-GCM with a key derived from a passphrase you provide via PBKDF2. The encryption is performed in your browser using the browser's built-in WebCrypto API. The developer has no access to your passphrase and cannot recover your data if you forget it.

If your device is compromised by malware, your data may be at risk regardless of the app's encryption. The app cannot protect against threats outside the browser.

### Backups

The app provides an export function so you can back up your data to a location you control (e.g., your personal cloud). The developer has no role in backups and no copy of your data exists outside your device unless you make one yourself.

### Account deletion / data deletion

There are no accounts to delete. To delete all data, you can either:
- Use the in-app "Wipe data" function
- Uninstall the app from your home screen
- Clear your browser's storage for the app's URL

Once deleted, the data is permanently gone. The developer cannot recover it.

### Changes to this policy

If the app's behavior ever changes such that any statement in this policy becomes inaccurate, this policy will be updated and the change will appear in the repository's git history.

### Contact

This is a personal project. The developer does not provide individual support. To report a security issue, open a security advisory on the GitHub repository.

### Verification

This entire app is open source. You can verify every claim in this policy by reading the source code at https://github.com/kevindm1989-afk/plivex.

## Auto-lock

Plivex automatically locks itself after a period of inactivity, requiring you to re-enter your passphrase before viewing or modifying entries. The default timeout is 15 minutes; you can change it to 1, 5, 15, 30, or 60 minutes in Settings.

The auto-lock timer is based on wall-clock time. Backgrounding the app, locking your phone, or putting your device to sleep does not pause the timer — when you next interact with the app after the timeout has elapsed, you will be prompted to unlock again.

Auto-lock only clears the master key from the app's working memory. It does not delete any data. After auto-locking, your entries remain encrypted on your device exactly as they were before.

## Accessibility

Plivex uses semantic HTML elements, ARIA roles where applicable, and visible focus indicators on all interactive elements. All buttons that display only an icon include a text label for assistive technology. Touch targets are at least 44 pixels in their smallest dimension. Dialogs trap keyboard focus while open.

Plivex does not claim formal compliance with any accessibility standard such as WCAG, ADA, or AODA. The above describes properties of the code as written; if you encounter accessibility issues, please file an issue on the project's GitHub repository.
