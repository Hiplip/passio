import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recoveryRouter } from "~/server/api/routers/recovery";
import {
  createCallerFactory,
  createTRPCRouter,
  type createTRPCContext,
} from "~/server/api/trpc";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { account, session, user } from "~/server/db/schema";

/**
 * These tests run against the real dev database. Every row they need is created
 * by the test itself and removed in `afterEach`, so a failed run leaves nothing
 * behind. The ids are deliberately distinctive so cleanup is unambiguous.
 *
 * The router is called through its own caller factory rather than through the
 * app router: registration in `root.ts` is a separate concern, and this file
 * should fail for reasons about recovery only.
 */
const createCaller = createCallerFactory(
  createTRPCRouter({ recovery: recoveryRouter }),
);

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const USER_ID = "test-recovery-user";
const EMAIL = "test-recovery-user@example.test";
const UNKNOWN_EMAIL = "test-recovery-nobody@example.test";

const OLD_PROTECTED = "v1.oldmaster.oldmasterbody";
const OLD_RECOVERY_WRAPPED = "v1.oldrecovery.oldrecoverybody";
const RECOVERY_AUTH_HASH = "recovery-auth-hash-fixture";
const OLD_AUTH_HASH = "old-auth-hash";

/** The exact shape `wrapVaultKey` produces: a 12-byte IV and a 48-byte body
 *  (32 key bytes plus the 16-byte GCM tag), each base64url, no padding. */
const WRAPPING_SHAPE = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{64}$/;

/** Public procedures never read the session, so an anonymous context is the
 *  only context the recovery flow is ever called with. */
function caller() {
  const ctx: Context = { db, session: null, headers: new Headers() };
  return createCaller(ctx);
}

const validInput = {
  email: EMAIL,
  recoveryAuthHash: RECOVERY_AUTH_HASH,
  newAuthHash: "new-auth-hash",
  newProtectedVaultKey: "v1.newmaster.newmasterbody",
  newRecoveryWrappedVaultKey: "v1.newrecovery.newrecoverybody",
  newRecoveryVerifier: "new-recovery-auth-hash",
};

async function seed() {
  const context = await auth.$context;
  const now = new Date();

  await db.insert(user).values({
    id: USER_ID,
    name: "Recovery",
    email: EMAIL,
    emailVerified: false,
    protectedVaultKey: OLD_PROTECTED,
    recoveryWrappedVaultKey: OLD_RECOVERY_WRAPPED,
    // Stored the way signup stores it: hashed, never the value received.
    recoveryVerifier: await context.password.hash(RECOVERY_AUTH_HASH),
    kdfVersion: 1,
  });

  await db.insert(account).values({
    id: `${USER_ID}-credential`,
    accountId: USER_ID,
    providerId: "credential",
    userId: USER_ID,
    password: await context.password.hash(OLD_AUTH_HASH),
    createdAt: now,
    updatedAt: now,
  });
}

async function seedSession(suffix: string) {
  const now = new Date();
  await db.insert(session).values({
    id: `${USER_ID}-session-${suffix}`,
    token: `${USER_ID}-token-${suffix}`,
    userId: USER_ID,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
  });
}

async function readUser() {
  const [row] = await db.select().from(user).where(eq(user.id, USER_ID));
  return row;
}

async function readCredential() {
  const [row] = await db
    .select()
    .from(account)
    .where(
      and(eq(account.userId, USER_ID), eq(account.providerId, "credential")),
    );
  return row;
}

beforeEach(seed);

afterEach(async () => {
  await db.delete(session).where(eq(session.userId, USER_ID));
  await db.delete(account).where(eq(account.userId, USER_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
});

describe("recovery.recover", () => {
  it("rotates both wrappings and stamps the new recovery key", async () => {
    await caller().recovery.recover(validInput);

    const row = await readUser();
    expect(row?.protectedVaultKey).toBe(validInput.newProtectedVaultKey);
    expect(row?.recoveryWrappedVaultKey).toBe(
      validInput.newRecoveryWrappedVaultKey,
    );
    expect(row?.recoveryKeyCreatedAt).toBeInstanceOf(Date);
  });

  it("sets a credential password that verifies against the new auth hash", async () => {
    await caller().recovery.recover(validInput);

    const context = await auth.$context;
    const credential = await readCredential();
    expect(credential?.password).toBeTruthy();
    expect(credential?.password).not.toBe(validInput.newAuthHash);

    expect(
      await context.password.verify({
        hash: credential!.password!,
        password: validInput.newAuthHash,
      }),
    ).toBe(true);
    expect(
      await context.password.verify({
        hash: credential!.password!,
        password: OLD_AUTH_HASH,
      }),
    ).toBe(false);
  });

  it("stores the new recovery verifier hashed, never in the clear", async () => {
    await caller().recovery.recover(validInput);

    const row = await readUser();
    expect(row?.recoveryVerifier).not.toBe(validInput.newRecoveryVerifier);
    expect(row?.recoveryVerifier).not.toContain(validInput.newRecoveryVerifier);

    const context = await auth.$context;
    expect(
      await context.password.verify({
        hash: row!.recoveryVerifier,
        password: validInput.newRecoveryVerifier,
      }),
    ).toBe(true);
    expect(
      await context.password.verify({
        hash: row!.recoveryVerifier,
        password: RECOVERY_AUTH_HASH,
      }),
    ).toBe(false);
  });

  it("normalizes the email before looking the account up", async () => {
    await expect(
      caller().recovery.recover({ ...validInput, email: `  ${EMAIL.toUpperCase()} ` }),
    ).resolves.toEqual({ ok: true });
  });

  it("deletes every session, because they all predate the recovery", async () => {
    await seedSession("a");
    await seedSession("b");

    await caller().recovery.recover(validInput);

    const rows = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, USER_ID));
    expect(rows).toHaveLength(0);
  });

  it("rejects a wrong recovery key with UNAUTHORIZED and changes nothing", async () => {
    const error = await caller()
      .recovery.recover({ ...validInput, recoveryAuthHash: "wrong" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("UNAUTHORIZED");

    const row = await readUser();
    expect(row?.protectedVaultKey).toBe(OLD_PROTECTED);
    expect(row?.recoveryWrappedVaultKey).toBe(OLD_RECOVERY_WRAPPED);
    expect(row?.recoveryKeyCreatedAt).toBeNull();

    const context = await auth.$context;
    expect(
      await context.password.verify({
        hash: (await readCredential())!.password!,
        password: OLD_AUTH_HASH,
      }),
    ).toBe(true);
  });

  it("counts failures and does not lock out before the fifth", async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(
        caller().recovery.recover({ ...validInput, recoveryAuthHash: "wrong" }),
      ).rejects.toThrow();

      const row = await readUser();
      expect(row?.recoveryFailedAttempts).toBe(attempt);
      expect(row?.recoveryLockedUntil).toBeNull();
    }
  });

  it("locks the account after five failures and then refuses even a correct key", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(
        caller().recovery.recover({ ...validInput, recoveryAuthHash: "wrong" }),
      ).rejects.toThrow();
    }

    const locked = await readUser();
    expect(locked?.recoveryFailedAttempts).toBe(5);
    expect(locked?.recoveryLockedUntil).toBeInstanceOf(Date);
    expect(locked!.recoveryLockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const error = await caller()
      .recovery.recover(validInput)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("TOO_MANY_REQUESTS");

    // The correct key was refused, so nothing rotated.
    expect((await readUser())?.protectedVaultKey).toBe(OLD_PROTECTED);
  });

  it("resets the counter and the lockout after a successful recovery", async () => {
    await expect(
      caller().recovery.recover({ ...validInput, recoveryAuthHash: "wrong" }),
    ).rejects.toThrow();

    await caller().recovery.recover(validInput);

    const row = await readUser();
    expect(row?.recoveryFailedAttempts).toBe(0);
    expect(row?.recoveryLockedUntil).toBeNull();
  });

  it("gives an unknown email the byte-identical error a wrong key gets", async () => {
    const wrongKey = (await caller()
      .recovery.recover({ ...validInput, recoveryAuthHash: "wrong" })
      .catch((caught: unknown) => caught)) as TRPCError;
    const unknownEmail = (await caller()
      .recovery.recover({ ...validInput, email: UNKNOWN_EMAIL })
      .catch((caught: unknown) => caught)) as TRPCError;

    expect(unknownEmail.message).toBe(wrongKey.message);
    expect(unknownEmail.code).toBe(wrongKey.code);
    expect(unknownEmail.message).not.toContain(UNKNOWN_EMAIL);
  });
});

describe("recovery.getWrappedKey", () => {
  it("returns the stored wrapping for a known email", async () => {
    expect(await caller().recovery.getWrappedKey({ email: EMAIL })).toEqual({
      recoveryWrappedVaultKey: OLD_RECOVERY_WRAPPED,
    });
  });

  it("normalizes the email", async () => {
    expect(
      await caller().recovery.getWrappedKey({ email: `  ${EMAIL.toUpperCase()} ` }),
    ).toEqual({ recoveryWrappedVaultKey: OLD_RECOVERY_WRAPPED });
  });

  it("answers an unknown email with a decoy shaped like a real wrapping", async () => {
    const { recoveryWrappedVaultKey } = await caller().recovery.getWrappedKey({
      email: UNKNOWN_EMAIL,
    });

    expect(recoveryWrappedVaultKey).toMatch(WRAPPING_SHAPE);
    expect(recoveryWrappedVaultKey).not.toBe(OLD_RECOVERY_WRAPPED);
  });

  it("returns the same decoy every time, so a repeat call is not a tell", async () => {
    const first = await caller().recovery.getWrappedKey({ email: UNKNOWN_EMAIL });
    const second = await caller().recovery.getWrappedKey({ email: UNKNOWN_EMAIL });
    const normalized = await caller().recovery.getWrappedKey({
      email: `  ${UNKNOWN_EMAIL.toUpperCase()} `,
    });

    expect(second).toEqual(first);
    expect(normalized).toEqual(first);
  });

  it("gives different unknown emails different decoys", async () => {
    const one = await caller().recovery.getWrappedKey({
      email: "test-recovery-ghost-one@example.test",
    });
    const two = await caller().recovery.getWrappedKey({
      email: "test-recovery-ghost-two@example.test",
    });

    expect(one.recoveryWrappedVaultKey).not.toBe(two.recoveryWrappedVaultKey);
  });
});

describe("test hygiene", () => {
  it("leaves no seeded rows behind", async () => {
    // `beforeEach` has just re-seeded, so prove the previous test's rows are
    // the only ones that ever existed: exactly one, created moments ago.
    const rows = await db.select({ id: user.id }).from(user).where(eq(user.id, USER_ID));
    expect(rows).toHaveLength(1);
  });
});
