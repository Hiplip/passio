import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { type createTRPCContext } from "~/server/api/trpc";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";

/**
 * These tests run against the real dev database. Every row they need is created
 * by the test itself and removed in `afterEach`, so a failed run leaves nothing
 * behind. The ids are deliberately distinctive so cleanup is unambiguous.
 */
const USER_A = "test-vault-user-a";
const USER_B = "test-vault-user-b";

const KEYS = {
  [USER_A]: {
    protectedVaultKey: "v1.aaaa.bbbb",
    recoveryWrappedVaultKey: "v1.cccc.dddd",
    recoveryVerifier: "hashed-verifier-fixture-a",
  },
  [USER_B]: {
    protectedVaultKey: "v1.eeee.ffff",
    recoveryWrappedVaultKey: "v1.gggg.hhhh",
    recoveryVerifier: "hashed-verifier-fixture-b",
  },
} as const;

async function seedUser(id: string) {
  await db.insert(user).values({
    id,
    name: "Test",
    email: `${id}@example.test`,
    emailVerified: false,
    ...KEYS[id as keyof typeof KEYS],
    kdfVersion: 1,
  });
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;
type Session = NonNullable<Context["session"]>;

/**
 * The session carries a copy of the user row, so a router could satisfy
 * `getKeys` from the session alone. That would be wrong — the session is a
 * snapshot and the database is the source of truth — so the session fixture
 * carries sentinel key material that must never appear in a response.
 */
function sessionFor(id: string): Session {
  const now = new Date();
  return {
    session: {
      id: `${id}-session`,
      token: `${id}-token`,
      userId: id,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    },
    user: {
      id,
      name: "Test",
      email: `${id}@example.test`,
      emailVerified: false,
      image: null,
      createdAt: now,
      updatedAt: now,
      protectedVaultKey: "SENTINEL-session-copy-must-not-be-returned",
      recoveryWrappedVaultKey: "SENTINEL-session-copy-must-not-be-returned",
      recoveryVerifier: "SENTINEL-session-copy-must-not-be-returned",
      kdfVersion: 99,
    },
  };
}

function callerFor(id: string | null) {
  const ctx: Context = {
    db,
    session: id ? sessionFor(id) : null,
    headers: new Headers(),
  };
  return createCaller(ctx);
}

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, [USER_A, USER_B]));
});

describe("vault.getKeys", () => {
  it("returns the caller's wrapped vault key", async () => {
    await seedUser(USER_A);

    const result = await callerFor(USER_A).vault.getKeys();

    expect(result.protectedVaultKey).toBe(KEYS[USER_A].protectedVaultKey);
    expect(result.kdfVersion).toBe(1);
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(callerFor(null).vault.getKeys()).rejects.toThrow(
      /UNAUTHORIZED/,
    );

    const error = await callerFor(null)
      .vault.getKeys()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("UNAUTHORIZED");
  });

  it("never returns the recovery wrapping — that is only used by the recovery flow", async () => {
    await seedUser(USER_A);

    const result = await callerFor(USER_A).vault.getKeys();

    expect(result).not.toHaveProperty("recoveryWrappedVaultKey");
    expect(result).not.toHaveProperty("recoveryVerifier");
    expect(Object.keys(result).sort()).toEqual([
      "kdfVersion",
      "protectedVaultKey",
    ]);
    expect(JSON.stringify(result)).not.toContain(
      KEYS[USER_A].recoveryWrappedVaultKey,
    );
    expect(JSON.stringify(result)).not.toContain(KEYS[USER_A].recoveryVerifier);
  });

  it("never returns another user's key material", async () => {
    await seedUser(USER_A);
    await seedUser(USER_B);

    const result = await callerFor(USER_B).vault.getKeys();

    expect(result.protectedVaultKey).toBe(KEYS[USER_B].protectedVaultKey);
    expect(result.protectedVaultKey).not.toBe(KEYS[USER_A].protectedVaultKey);
  });

  it("reads the database rather than the session copy", async () => {
    await seedUser(USER_A);

    const result = await callerFor(USER_A).vault.getKeys();

    expect(result.protectedVaultKey).not.toContain("SENTINEL");
    expect(result.kdfVersion).toBe(1);
  });

  it("throws NOT_FOUND when the caller has no row", async () => {
    const error = await callerFor(USER_A)
      .vault.getKeys()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("NOT_FOUND");
  });
});

describe("account.status", () => {
  it("reports registration closed once an account exists", async () => {
    await seedUser(USER_A);

    expect(await callerFor(null).account.status()).toEqual({
      registrationOpen: false,
    });
  });

  // The "registration is open" branch is deliberately NOT covered here.
  //
  // It is only true when the WHOLE user table is empty, and five test files
  // seed and delete rows in one shared database, so no test can hold that
  // precondition. Two attempts to assert it were flaky, and a third - emptying
  // the table inside a rolled-back transaction - would have taken a table-wide
  // lock in a database other tests are using. The closed branch below is
  // deterministic: any row at all means closed, so concurrent rows only
  // reinforce it.

  it("is visible to an authenticated caller too", async () => {
    await seedUser(USER_A);

    expect(await callerFor(USER_A).account.status()).toEqual({
      registrationOpen: false,
    });
  });
});

describe("test hygiene", () => {
  it("leaves no seeded rows behind", async () => {
    const rows = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, USER_A));
    expect(rows).toHaveLength(0);
  });
});
