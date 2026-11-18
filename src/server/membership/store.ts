import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { dataFilePath } from "./config";
import {
  emptySnapshot,
  type MembershipSnapshot,
  type Plan,
  type Payment,
  type Member,
  type Membership,
  type AuditEvent,
} from "./types";

/**
 * Storage abstraction for the membership domain.
 *
 * The prototype ships with a single-process JSON file store so it can run on a
 * developer machine with zero infrastructure. It is *not* suitable for
 * production or multiple concurrent instances: replace `JsonFileStore` with a
 * transactional database implementation before deploying (see docs/membership.md).
 */
export interface MembershipStore {
  read(): Promise<MembershipSnapshot>;
  /** Apply a mutation atomically and return its result. */
  update<T>(mutator: (draft: MembershipSnapshot) => T): Promise<T>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** In-memory store: used by tests and by the dev self-test endpoint. */
export class MemoryStore implements MembershipStore {
  private snapshot: MembershipSnapshot;

  constructor(initial: MembershipSnapshot = emptySnapshot()) {
    this.snapshot = clone(initial);
  }

  read(): Promise<MembershipSnapshot> {
    return Promise.resolve(clone(this.snapshot));
  }

  update<T>(mutator: (draft: MembershipSnapshot) => T): Promise<T> {
    const draft = clone(this.snapshot);
    const result = mutator(draft);
    this.snapshot = draft;
    return Promise.resolve(result);
  }
}

/**
 * File-backed store with an in-process write queue.
 *
 * Writes go to a temporary file and are renamed into place so a crash cannot
 * leave a half-written ledger. Safe for a single Node process only.
 */
export class JsonFileStore implements MembershipStore {
  private readonly filePath: string;
  private queue: Promise<unknown> = Promise.resolve();
  private cache: MembershipSnapshot | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async read(): Promise<MembershipSnapshot> {
    if (this.cache) return clone(this.cache);
    const loaded = await this.load();
    this.cache = loaded;
    return clone(loaded);
  }

  update<T>(mutator: (draft: MembershipSnapshot) => T): Promise<T> {
    const run = async (): Promise<T> => {
      const current = this.cache ?? (await this.load());
      const draft = clone(current);
      const result = mutator(draft);
      await this.persist(draft);
      this.cache = draft;
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async load(): Promise<MembershipSnapshot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<MembershipSnapshot>;
      return {
        version: 1,
        plans: (parsed.plans ?? []) as Plan[],
        members: (parsed.members ?? []) as Member[],
        payments: (parsed.payments ?? []) as Payment[],
        memberships: (parsed.memberships ?? []) as Membership[],
        events: (parsed.events ?? []) as AuditEvent[],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptySnapshot();
      }
      throw error;
    }
  }

  private async persist(snapshot: MembershipSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    );

    // Windows can briefly lock the destination (antivirus, OneDrive sync).
    // Retry instead of failing the whole request.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporary, this.filePath);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
          attempt >= 5 ||
          (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")
        ) {
          throw error;
        }
        await delay(20 * (attempt + 1));
      }
    }
  }
}

/**
 * One store per process.
 *
 * Next.js evaluates server modules once per route bundle, so a module-level
 * singleton would give each route its own cache and write queue — and those
 * concurrent writers would clobber the ledger. `globalThis` keeps a single
 * instance for the whole Node process.
 */
const STORE_KEY = "__foh_membership_store__";

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: MembershipStore;
};

export function getDefaultStore(): MembershipStore {
  const scope = globalThis as GlobalWithStore;
  if (!scope[STORE_KEY]) {
    scope[STORE_KEY] = new JsonFileStore(dataFilePath());
  }
  return scope[STORE_KEY];
}
