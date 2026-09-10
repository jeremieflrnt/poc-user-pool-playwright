import { defineConfig } from "@playwright/test";
import { PhoneManager } from "./src/phone-manager";

export default defineConfig({
  testDir: "./tests",
  workers: 4,
  fullyParallel: true, // tests in the same file also run in parallel
  retries: 1, // enables the retry-exclusion demo
  reporter: "list",
  use: {
    // No browser needed for this demo — the mechanism is pure test-runner logic.
    // Point your own tests at a baseURL as usual.
  },
});

process.on("exit", () => PhoneManager.cleanupAll());
