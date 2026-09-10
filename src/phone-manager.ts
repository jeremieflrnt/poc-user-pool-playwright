import test from "@playwright/test";
import { expect } from "@playwright/test";
import * as fsSync from "fs";
import * as fs from "fs/promises";
import * as path from "path";

// The pool of pre-provisioned test users. In our case users are identified by
// phone number — swap these strings for whatever identifies your pooled users.
export const PHONE_POOL = ["phone-1", "phone-2", "phone-3"] as const;
export type PooledPhone = (typeof PHONE_POOL)[number];

const LOCKS_DIR = ".locks";
const RETRY_HISTORY_DIR = path.join(LOCKS_DIR, "retry-history");

// A lock older than this is considered stale (its worker crashed) and reclaimed.
// Tie it to your test timeout so a legitimately-running test never looks stale.
const LOCK_TIMEOUT_MS = 60_000;

async function ensureDirs() {
  await fs.mkdir(RETRY_HISTORY_DIR, { recursive: true });
}

function lockPathFor(phone: string): string {
  return path.join(LOCKS_DIR, `${phone}.lock`);
}

async function cleanupIfStale(lockPath: string) {
  try {
    const stats = await fs.stat(lockPath);
    if (Date.now() - stats.mtimeMs > LOCK_TIMEOUT_MS) {
      // Another worker might delete it a millisecond before us — ignore failures.
      await fs.unlink(lockPath).catch(() => {});
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error; // already gone = already clean
  }
}

// --- Retry history: remember which phones previous attempts of this test used ---

function retryHistoryPath(testId: string): string {
  return path.join(RETRY_HISTORY_DIR, `${testId}.json`);
}

async function readRetryHistory(testId: string): Promise<string[]> {
  try {
    return JSON.parse(await fs.readFile(retryHistoryPath(testId), "utf-8")) as string[];
  } catch {
    return [];
  }
}

async function writeRetryHistory(testId: string, used: string[]): Promise<void> {
  await fs.writeFile(retryHistoryPath(testId), JSON.stringify(used));
}

async function cleanupRetryHistory(testId: string): Promise<void> {
  await fs.unlink(retryHistoryPath(testId)).catch(() => {});
}

// Fisher-Yates shuffle so workers don't all hammer the pool in the same order.
function shuffle(pool: readonly string[]): string[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export class PhoneManager {
  /**
   * Acquire ANY free phone from the pool. Retried tests automatically exclude
   * phones used by their previous (failed) attempts.
   */
  static async acquirePhone(): Promise<string> {
    await ensureDirs();

    const testInfo = test.info();
    const previouslyUsed = testInfo.retry > 0 ? await readRetryHistory(testInfo.testId) : [];
    const pool = shuffle(PHONE_POOL.filter(p => !previouslyUsed.includes(p)));

    let acquired: string | undefined;

    await expect
      .poll(
        async () => {
          for (const phone of pool) {
            const lockPath = lockPathFor(phone);
            await cleanupIfStale(lockPath);
            try {
              // Atomic: "wx" creates the file only if it doesn't exist.
              // Two workers racing for the same phone → exactly one succeeds.
              await fs.writeFile(lockPath, `worker:${process.env.TEST_PARALLEL_INDEX ?? 0}`, {
                flag: "wx",
              });
              acquired = phone; // first free phone wins
              return acquired;
            } catch (error: any) {
              if (error.code !== "EEXIST") throw error;
            }
          }
          return undefined;
        },
        {
          message: "Waiting for a phone number to be released from the pool",
          intervals: [1_000],
          timeout: LOCK_TIMEOUT_MS,
        }
      )
      .not.toBeUndefined();

    // Record the acquisition so a future retry of this test excludes it.
    await writeRetryHistory(testInfo.testId, [...previouslyUsed, acquired!]);
    testInfo.annotations.push({ type: "phone", description: acquired });

    return acquired!;
  }

  static async releasePhone(phone: string) {
    await fs.unlink(lockPathFor(phone)).catch((error: any) => {
      if (error.code !== "ENOENT") throw error;
    });

    // Clean up retry history once the test is done (passed, or retries exhausted).
    const testInfo = test.info();
    const isLastAttempt = testInfo.retry === testInfo.project.retries;
    const isPassed = testInfo.status !== "failed";
    if (isLastAttempt || isPassed) {
      await cleanupRetryHistory(testInfo.testId);
    }
  }

  /** Synchronous cleanup for global teardown — removes every leftover lock. */
  static cleanupAll(): void {
    try {
      for (const file of fsSync.readdirSync(LOCKS_DIR)) {
        if (file.endsWith(".lock")) fsSync.unlinkSync(path.join(LOCKS_DIR, file));
      }
    } catch {
      // directory doesn't exist — nothing to clean
    }
  }
}
