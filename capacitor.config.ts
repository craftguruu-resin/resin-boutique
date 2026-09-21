import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.craftguru.craftguru",
  appName: "CraftGuru",
  webDir: ".",
  server: {
    url: process.env.CRAFTGURU_APP_URL || "https://craftguruindia.com",
    cleartext: false,
    androidScheme: "https",
  },
};

export default config;
