import { test as base } from "@playwright/test";
import { PhoneManager } from "../src/phone-manager";

interface PooledUser {
  phone: string;
}

// Tests just destructure `user` — acquire/release lives entirely in the fixture.
export const test = base.extend<{ user: PooledUser }>({
  user: async ({}, use) => {
    const phone = await PhoneManager.acquirePhone();
    try {
      await use({ phone });
    } finally {
      await PhoneManager.releasePhone(phone);
    }
  },
});

export { expect } from "@playwright/test";
