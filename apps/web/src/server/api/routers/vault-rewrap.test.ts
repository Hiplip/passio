import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { type createTRPCContext } from "~/server/api/trpc";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { account, user } from "~/server/db/schema";

/**
 * Runs against the real dev database. Every row is created here and removed in
 * `afterEach`, so a failed run leaves nothing behind.
 */
const USER_ID = "test-rewrap-user";
const OTHER_ID = "test-rewrap-other";
const CURRENT_AUTH_HASH = "current-auth-hash-fixture";
// Wrong, but long enough to pass input validation and actually reach the
// password check. A short value would be rejected by Zod first and the test
// would prove nothing about authorization.
const WRONG_AUTH_HASH = "wrong-auth-hash-fixture";

type Context = Awaited<ReturnType<typeof createTRPCContext>>;
type Session = NonNullable<Context["session"]>;

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
      createdAt: now,
      updatedAt: now,
    },
  } as unknown as Session;
}

function callerFor(id: string | null) {
  return createCaller({
    db,
    session: id ? sessionFor(id) : null,
    headers: new Headers(),
  });
}

async function remove(id: string) {
  await db.delete(account).where(eq(account.userId, id));
  await db.delete(user).where(eq(user.id, id));
}

async function seed(id: string) {
  const context = await auth.$context;
  // Clear first: a run that crashed before afterEach would otherwise leave rows
  // behind and every later run would fail on a duplicate key.
  await remove(id);
  await db.insert(user).values({
    id,
    name: "Test",
    email: `${id}@example.test`,
    emailVerified: false,
    protectedVaultKey: "v1.old.master",
    recoveryWrappedVaultKey: "v1.old.recovery",
    recoveryVerifier: "hashed-verifier-fixture",
    kdfVersion: 1,
  });
  await db.insert(account).values({
    id: `${id}-credential`,
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await context.password.hash(CURRENT_AUTH_HASH),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

beforeEach(async () => {
  await seed(USER_ID);
  await seed(OTHER_ID);
});

afterEach(async () => {
  for (const id of [USER_ID, OTHER_ID]) await remove(id);
});

const validInput = {
  currentAuthHash: CURRENT_AUTH_HASH,
  newAuthHash: "new-auth-hash-fixture",
  newProtectedVaultKey: "v1.new.master",
};

async function credentialFor(id: string) {
  const [row] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, id), eq(account.providerId, "credential")));
  return row;
}

describe("vault.rewrap", () => {
  it("stores the re-wrapped vault key", async () => {
    await callerFor(USER_ID).vault.rewrap(validInput);

    const [row] = await db.select().from(user).where(eq(user.id, USER_ID));
    expect(row?.protectedVaultKey).toBe("v1.new.master");
  });

  it("sets a credential password that verifies against the new auth hash", async () => {
    await callerFor(USER_ID).vault.rewrap(validInput);

    const context = await auth.$context;
    const credential = await credentialFor(USER_ID);
    expect(
      await context.password.verify({
        hash: credential!.password!,
        password: "new-auth-hash-fixture",
      }),
    ).toBe(true);
  });

  it("leaves the recovery wrapping alone, so the recovery key still works", async () => {
    await callerFor(USER_ID).vault.rewrap(validInput);

    const [row] = await db.select().from(user).where(eq(user.id, USER_ID));
    expect(row?.recoveryWrappedVaultKey).toBe("v1.old.recovery");
    expect(row?.recoveryVerifier).toBe("hashed-verifier-fixture");
  });

  it("refuses a wrong current password and changes nothing", async () => {
    // Assert the CODE, not the message: a message match would silently pass if
    // the procedure threw for some entirely different reason.
    const error = await callerFor(USER_ID)
      .vault.rewrap({ ...validInput, currentAuthHash: WRONG_AUTH_HASH })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("UNAUTHORIZED");

    const [row] = await db.select().from(user).where(eq(user.id, USER_ID));
    expect(row?.protectedVaultKey).toBe("v1.old.master");
  });

  it("requires the current password even though the session is valid", async () => {
    // A stolen session cookie alone must not be enough to take over the account.
    const credentialBefore = await credentialFor(USER_ID);

    await expect(
      callerFor(USER_ID).vault.rewrap({ ...validInput, currentAuthHash: WRONG_AUTH_HASH }),
    ).rejects.toThrow();

    const credentialAfter = await credentialFor(USER_ID);
    expect(credentialAfter!.password).toBe(credentialBefore!.password);
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(callerFor(null).vault.rewrap(validInput)).rejects.toThrow(/UNAUTHORIZED/);
  });

  it("never touches another user's row", async () => {
    await callerFor(USER_ID).vault.rewrap(validInput);

    const [other] = await db.select().from(user).where(eq(user.id, OTHER_ID));
    expect(other?.protectedVaultKey).toBe("v1.old.master");
  });

  it("rejects a malformed ciphertext", async () => {
    await expect(
      callerFor(USER_ID).vault.rewrap({
        ...validInput,
        newProtectedVaultKey: "not-a-cipher",
      }),
    ).rejects.toThrow();
  });
});
