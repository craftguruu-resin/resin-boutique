# CraftGuru Android App

This wraps the existing CraftGuru storefront in a native Android shell using Capacitor. The same website, login, wishlist, cart, checkout and APIs are used; there is no separate mobile backend.

## Local APK testing

Requirements:
- Node.js 20+
- Android Studio
- Android SDK + platform tools
- A USB-connected Android phone with Developer Options + USB debugging enabled

From the repository root:

```bash
npm install
npx cap add android
npm run mobile:sync
npm run mobile:android
```

In Android Studio, select the connected phone and press **Run**.

Or build a debug APK:

```npm run mobile:build
```

APK output:
`android/app/build/outputs/apk/debug/app-debug.apk`

Install it directly on the phone. Play Store publishing is not required.

## Test the current production site

By default the app loads:

`https://craftguruindia.com`

This keeps the app connected to the existing Cloud Run/Neon/Cloudinary stack.

## Test a local frontend on a physical phone

Start the frontend from a machine on the same Wi-Fi network and set:

```bash
export CRAFTGURU_APP_URL=http://YOUR_COMPUTER_LAN_IP:PORT
npx cap sync android
```

For an Android emulator, use the host loopback address appropriate to the emulator (commonly `10.0.2.2`).

Do not commit local LAN URLs or credentials.
