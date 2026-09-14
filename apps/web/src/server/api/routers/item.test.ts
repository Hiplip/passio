import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { type createTRPCContext } from "~/server/api/trpc";
import { db } from "~/server/db";
import { item, user } from "~/server/db/schema";

/**
 * These tests run against the real dev database. Every row they need is created
 * by the test itself and removed in `beforeEach`, so a failed run leaves nothing
 * behind. Two users are seeded for every test so ownership isolation is
 * exercised with a real second owner rather than a missing row.
 */
const ALICE = "test-item-alice";
const BOB = "test-item-bob";

/**
 * Item ids are chosen by the client, because an item's ciphertext is bound to
 * its id as AES-GCM additional authenticated data. Fixed ids here keep the
 * assertions and the cleanup unambiguous.
 */
const ALICE_ITEM = "11111111-1111-4111-8111-111111111111";
const BOB_ITEM = "22222222-2222-4222-8222-222222222222";
const SECOND_ITEM = "33333333-3333-4333-8333-333333333333";
const ABSENT_ITEM = "44444444-4444-4444-8444-444444444444";

const ALICE_CIPHERTEXT = "v1.alice-iv.alice-payload";
const BOB_CIPHERTEXT = "v1.bob-iv.bob-payload";

type Context = Awaited<ReturnType<typeof createTRPCContext>>;
type Session = NonNullable<Context["session"]>;

function userFixture(id: string) {
  return {
    id,
    name: "Test",
    email: `${id}@example.test`,
    emailVerified: false,
    protectedVaultKey: "v1.aaaa.bbbb",
    recoveryWrappedVaultKey: "v1.cccc.dddd",
    recoveryVerifier: `hashed-verifier-fixture-${id}`,
    kdfVersion: 1,
  };
}

/** One statement, not one per user. Every hook here is a network round trip to
 *  a serverless database, and they are what the run's wall-clock is made of. */
async function seedUsers(...ids: string[]) {
  await db.insert(user).values(ids.map(userFixture));
}

/**
 * The session carries a copy of the user row. Its key material is sentinel
 * text: nothing in this router should ever read it, and if it leaks into a
 * response the assertion that fails will say so plainly.
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

/** Resolves to the TRPCError a rejected call threw, and fails if it resolved. */
async function errorOf(call: Promise<unknown>): Promise<TRPCError> {
  const caught: unknown = await call.then(
    () => new Error("expected the call to reject, but it resolved"),
    (reason: unknown) => reason,
  );
  expect(caught).toBeInstanceOf(TRPCError);
  return caught as TRPCError;
}

/** Reads a row straight from the table, bypassing the router's filters. */
async function rowOf(id: string) {
  const [row] = await db.select().from(item).where(eq(item.id, id)).limit(1);
  return row;
}

/**
 * Per-test cleanup: the rows a test creates, and nothing else.
 *
 * The users are NOT touched here. Every hook is a network round trip to a
 * serverless database whose latency has a long tail - a median around 115ms
 * but individual queries reaching several seconds - and three round trips
 * before every test was enough to put a fixture reset past its timeout about
 * once in five full runs. Seeding the users once per file and clearing only
 * their rows per test cuts that from three to one.
 */
async function removeRows() {
  await db.delete(item).where(inArray(item.userId, [ALICE, BOB]));
}

async function removeFixtures() {
  await removeRows();
  await db.delete(user).where(inArray(user.id, [ALICE, BOB]));
}

beforeAll(async () => {
  // Also clears residue from a run that crashed before its afterAll.
  await removeFixtures();
  await seedUsers(ALICE, BOB);
});

beforeEach(removeRows);
afterAll(removeFixtures);

describe("item.create", () => {
  it("creates an item the caller can read back", async () => {
    const created = await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });
    expect(created.id).toBe(ALICE_ITEM);

    const rows = await callerFor(ALICE).item.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(ALICE_ITEM);
    expect(rows[0]?.ciphertext).toBe(ALICE_CIPHERTEXT);
  });

  it("stores the item against the calling user, not the id in the input", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    expect((await rowOf(ALICE_ITEM))?.userId).toBe(ALICE);
  });

  it("rejects a ciphertext that is not a v1 envelope", async () => {
    for (const malformed of [
      "not-a-cipher",
      "v1.only-two-parts",
      "v2.iv.payload",
      "v1..payload",
      "v1.iv.payload.extra",
      "v1.iv+bad.payload",
      "",
    ]) {
      const error = await errorOf(
        callerFor(ALICE).item.create({ id: ALICE_ITEM, ciphertext: malformed }),
      );
      expect(error.code).toBe("BAD_REQUEST");
    }

    expect(await rowOf(ALICE_ITEM)).toBeUndefined();
  });

  it("rejects an id that is not a uuid", async () => {
    const error = await errorOf(
      callerFor(ALICE).item.create({
        id: "not-a-uuid",
        ciphertext: ALICE_CIPHERTEXT,
      }),
    );
    expect(error.code).toBe("BAD_REQUEST");
  });

  it("rejects a duplicate id rather than overwriting the row", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const error = await errorOf(
      callerFor(ALICE).item.create({
        id: ALICE_ITEM,
        ciphertext: "v1.second.attempt",
      }),
    );
    expect(error.code).toBe("CONFLICT");

    const rows = await callerFor(ALICE).item.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ciphertext).toBe(ALICE_CIPHERTEXT);
  });

  it("refuses a duplicate id owned by another user without revealing the owner", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    // Bob guesses Alice's id. He must not overwrite her row, must not learn
    // that the collision is with someone else, and must not create a row.
    const collisionWithAlice = await errorOf(
      callerFor(BOB).item.create({
        id: ALICE_ITEM,
        ciphertext: BOB_CIPHERTEXT,
      }),
    );

    // The same failure Bob would see colliding with one of his own rows.
    await callerFor(BOB).item.create({
      id: BOB_ITEM,
      ciphertext: BOB_CIPHERTEXT,
    });
    const collisionWithSelf = await errorOf(
      callerFor(BOB).item.create({ id: BOB_ITEM, ciphertext: BOB_CIPHERTEXT }),
    );

    expect(collisionWithAlice.code).toBe("CONFLICT");
    expect(collisionWithAlice.code).toBe(collisionWithSelf.code);
    expect(collisionWithAlice.message).toBe(collisionWithSelf.message);
    expect(collisionWithAlice.message).not.toContain(ALICE);

    // Alice's row is untouched and Bob gained nothing but his own item.
    const alicesRow = await rowOf(ALICE_ITEM);
    expect(alicesRow?.userId).toBe(ALICE);
    expect(alicesRow?.ciphertext).toBe(ALICE_CIPHERTEXT);
    expect(await callerFor(BOB).item.list()).toHaveLength(1);
  });
});

describe("item.list", () => {
  it("returns the caller's items newest-updated first", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });
    await callerFor(ALICE).item.create({
      id: SECOND_ITEM,
      ciphertext: "v1.second.payload",
    });

    // Touching the older item must float it to the top.
    await callerFor(ALICE).item.update({
      id: ALICE_ITEM,
      ciphertext: "v1.alice-iv.updated",
    });

    const rows = await callerFor(ALICE).item.list();
    expect(rows.map((row) => row.id)).toEqual([ALICE_ITEM, SECOND_ITEM]);
  });

  it("never includes another user's items", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    expect(await callerFor(BOB).item.list()).toEqual([]);

    await callerFor(BOB).item.create({
      id: BOB_ITEM,
      ciphertext: BOB_CIPHERTEXT,
    });
    const bobsRows = await callerFor(BOB).item.list();
    expect(bobsRows.map((row) => row.id)).toEqual([BOB_ITEM]);
    expect(JSON.stringify(bobsRows)).not.toContain(ALICE_CIPHERTEXT);
  });
});

describe("item.update", () => {
  it("replaces the ciphertext and advances updatedAt", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });
    const before = await rowOf(ALICE_ITEM);

    await callerFor(ALICE).item.update({
      id: ALICE_ITEM,
      ciphertext: "v1.alice-iv.updated",
    });

    const after = await rowOf(ALICE_ITEM);
    expect(after?.ciphertext).toBe("v1.alice-iv.updated");
    expect(after?.updatedAt.getTime()).toBeGreaterThan(
      before!.updatedAt.getTime(),
    );
    expect(after?.createdAt.getTime()).toBe(before!.createdAt.getTime());
  });

  it("rejects a malformed ciphertext", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const error = await errorOf(
      callerFor(ALICE).item.update({ id: ALICE_ITEM, ciphertext: "garbage" }),
    );
    expect(error.code).toBe("BAD_REQUEST");
    expect((await rowOf(ALICE_ITEM))?.ciphertext).toBe(ALICE_CIPHERTEXT);
  });

  it("refuses to update another user's item and leaves it unchanged", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const error = await errorOf(
      callerFor(BOB).item.update({
        id: ALICE_ITEM,
        ciphertext: "v1.bob.tampered",
      }),
    );
    expect(error.code).toBe("NOT_FOUND");

    const row = await rowOf(ALICE_ITEM);
    expect(row?.ciphertext).toBe(ALICE_CIPHERTEXT);
    expect(row?.userId).toBe(ALICE);
  });

  it("reports an item that does not exist the same way as another user's", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const mine = await errorOf(
      callerFor(BOB).item.update({
        id: ALICE_ITEM,
        ciphertext: "v1.bob.tampered",
      }),
    );
    const absent = await errorOf(
      callerFor(BOB).item.update({
        id: ABSENT_ITEM,
        ciphertext: "v1.bob.tampered",
      }),
    );

    expect(mine.code).toBe(absent.code);
    expect(mine.message).toBe(absent.message);
  });
});

describe("item.delete", () => {
  it("soft-deletes: the row leaves the list but survives in the table", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    await callerFor(ALICE).item.delete({ id: ALICE_ITEM });

    expect(await callerFor(ALICE).item.list()).toEqual([]);
    const row = await rowOf(ALICE_ITEM);
    expect(row).toBeDefined();
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.ciphertext).toBe(ALICE_CIPHERTEXT);
  });

  it("refuses to delete another user's item", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const error = await errorOf(callerFor(BOB).item.delete({ id: ALICE_ITEM }));
    expect(error.code).toBe("NOT_FOUND");

    expect(await callerFor(ALICE).item.list()).toHaveLength(1);
    expect((await rowOf(ALICE_ITEM))?.deletedAt).toBeNull();
  });
});

describe("item.restore", () => {
  it("brings a soft-deleted item back into the list", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });
    await callerFor(ALICE).item.delete({ id: ALICE_ITEM });

    await callerFor(ALICE).item.restore({ id: ALICE_ITEM });

    const rows = await callerFor(ALICE).item.list();
    expect(rows.map((row) => row.id)).toEqual([ALICE_ITEM]);
    expect((await rowOf(ALICE_ITEM))?.deletedAt).toBeNull();
  });

  it("refuses to restore another user's item", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });
    await callerFor(ALICE).item.delete({ id: ALICE_ITEM });

    const error = await errorOf(callerFor(BOB).item.restore({ id: ALICE_ITEM }));
    expect(error.code).toBe("NOT_FOUND");

    expect((await rowOf(ALICE_ITEM))?.deletedAt).toBeInstanceOf(Date);
    expect(await callerFor(BOB).item.list()).toEqual([]);
  });
});

describe("item authentication", () => {
  it("rejects every procedure for an unauthenticated caller", async () => {
    const anonymous = callerFor(null);
    // Started one at a time: a rejected promise left sitting in an array until
    // its turn is an unhandled rejection, which fails the run for the wrong
    // reason.
    const calls: (() => Promise<unknown>)[] = [
      () => anonymous.item.list(),
      () =>
        anonymous.item.create({ id: ALICE_ITEM, ciphertext: ALICE_CIPHERTEXT }),
      () =>
        anonymous.item.update({ id: ALICE_ITEM, ciphertext: ALICE_CIPHERTEXT }),
      () => anonymous.item.delete({ id: ALICE_ITEM }),
      () => anonymous.item.restore({ id: ALICE_ITEM }),
    ];

    for (const call of calls) {
      expect((await errorOf(call())).code).toBe("UNAUTHORIZED");
    }

    expect(await rowOf(ALICE_ITEM)).toBeUndefined();
  });
});

describe("test hygiene", () => {
  it("leaves no seeded rows behind", async () => {
    await removeFixtures();

    const items = await db
      .select({ id: item.id })
      .from(item)
      .where(inArray(item.userId, [ALICE, BOB]));
    const users = await db
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.id, [ALICE, BOB]));

    expect(items).toHaveLength(0);
    expect(users).toHaveLength(0);

    // Put back what this test deliberately tore down. The users are seeded once
    // per file now, not before every test, so leaving them deleted breaks
    // everything that runs after this.
    await seedUsers(ALICE, BOB);
  });
});

describe("item.listDeleted", () => {
  it("lists the caller's deleted items and nothing else", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });
    await callerFor(ALICE).item.create({
      id: SECOND_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });
    await callerFor(ALICE).item.delete({ id: ALICE_ITEM });

    const deleted = await callerFor(ALICE).item.listDeleted();

    expect(deleted.map((row) => row.id)).toEqual([ALICE_ITEM]);
  });

  it("is the mirror of list: an item appears in exactly one of them", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });

    expect((await callerFor(ALICE).item.list()).map((r) => r.id)).toEqual([ALICE_ITEM]);
    expect(await callerFor(ALICE).item.listDeleted()).toEqual([]);

    await callerFor(ALICE).item.delete({ id: ALICE_ITEM });

    expect(await callerFor(ALICE).item.list()).toEqual([]);
    expect((await callerFor(ALICE).item.listDeleted()).map((r) => r.id)).toEqual([
      ALICE_ITEM,
    ]);
  });

  it("never includes another user's deleted items", async () => {
    await callerFor(BOB).item.create({ id: BOB_ITEM, ciphertext: BOB_CIPHERTEXT });
    await callerFor(BOB).item.delete({ id: BOB_ITEM });

    expect(await callerFor(ALICE).item.listDeleted()).toEqual([]);
  });

  it("drops an item back out again once it is restored", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });
    await callerFor(ALICE).item.delete({ id: ALICE_ITEM });
    await callerFor(ALICE).item.restore({ id: ALICE_ITEM });

    expect(await callerFor(ALICE).item.listDeleted()).toEqual([]);
    expect((await callerFor(ALICE).item.list()).map((r) => r.id)).toEqual([ALICE_ITEM]);
  });

  it("still returns the ciphertext, so a deleted item can be decrypted and shown", async () => {
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: ALICE_CIPHERTEXT,
    });
    await callerFor(ALICE).item.delete({ id: ALICE_ITEM });

    const [row] = await callerFor(ALICE).item.listDeleted();

    expect(row?.ciphertext).toBe(ALICE_CIPHERTEXT);
  });

  it("rejects an unauthenticated caller", async () => {
    expect((await errorOf(callerFor(null).item.listDeleted())).code).toBe("UNAUTHORIZED");
  });
});
