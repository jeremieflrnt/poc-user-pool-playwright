import { test, expect } from "./fixtures";

// 6 tests, a pool of 3 phones, 4 workers: at all times at least one test is
// waiting for a phone, and no two tests ever hold the same phone.

for (let i = 1; i <= 6; i++) {
  test(`test ${i} uses a pooled phone`, async ({ user }) => {
    console.log(`test ${i} acquired ${user.phone}`);
    // Simulate real work done "as" that user.
    await new Promise(r => setTimeout(r, 1_000 + Math.random() * 2_000));
    expect(user.phone, "Should have acquired a phone").toMatch(/^phone-/);
  });
}

// Demonstrates retry exclusion: fails on attempt 0, passes on retry with a
// DIFFERENT phone. Watch the console output across the two attempts.
test("flaky test gets a different phone on retry", async ({ user }, testInfo) => {
  console.log(`flaky test attempt ${testInfo.retry} acquired ${user.phone}`);
  if (testInfo.retry === 0) {
    throw new Error("Simulated failure — account is now dirty, retry must get another phone");
  }
  expect(user.phone, "Retry should have acquired a fresh phone").toMatch(/^phone-/);
});
