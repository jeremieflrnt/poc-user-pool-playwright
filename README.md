# User Pool for Playwright — boilerplate

Playwright 1.63's `{ lock: 'name' }` serializes tests on a **known, named** resource.
This boilerplate covers the case it can't express: **allocating any free user from a
pool** and handing it to the test, with retry-aware exclusion.

Companion article: *Beyond Playwright Test Locks* (Medium).

## How it works

- `src/phone-manager.ts` — the pool. `acquirePhone()` claims a free phone via an
  atomic `fs.writeFile(..., { flag: "wx" })` (create-only-if-absent), polling until
  one is available. `releasePhone()` frees it.
- **Retry exclusion** — a JSON history file per test ID remembers which phones earlier
  attempts used; retried tests never get a phone a previous attempt dirtied.
- **Stale-lock recovery** — a lock older than `LOCK_TIMEOUT_MS` is reclaimed, so a
  crashed worker never leaks a lock forever.
- `tests/fixtures.ts` — wraps acquire/release in a fixture so tests just destructure
  `user.phone`.
- `tests/phone-pool.spec.ts` — 6 tests over a pool of 3 phones with 4 workers, plus a
  deliberately flaky test to demo retry exclusion.

## Run it

```bash
npm install
npx playwright install --no-shell chromium  # not strictly needed, no browser is opened
npm test
```

Watch the console: each test logs the phone it acquired, and the flaky test's retry
logs a **different** phone than its first attempt.

```
Running 7 tests using 4 workers

test 2 acquired phone-2
test 4 acquired phone-3
test 3 acquired phone-1
test 5 acquired phone-1
test 6 acquired phone-3
flaky test attempt 0 acquired phone-3
test 1 acquired phone-2
flaky test attempt 1 acquired phone-1   # ← not phone-3, which attempt 0 dirtied

1 flaky, 6 passed
```

## Adapt it

Replace `PHONE_POOL` with whatever identifies your pooled users (emails, account IDs…).
Point `LOCK_TIMEOUT_MS` at your test timeout. If your locks must survive across
separate machines (CI shards on different hosts), swap the filesystem for Redis —
the acquire/release/retry-history API stays identical.
