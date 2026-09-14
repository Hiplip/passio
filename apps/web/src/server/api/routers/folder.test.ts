import { TRPCError } from "@trpc/server";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { type createTRPCContext } from "~/server/api/trpc";
import { db } from "~/server/db";
import { folder, item, user } from "~/server/db/schema";

/**
 * These tests run against the real dev database. Every row they need is created
 * by the test itself and removed in `beforeEach`, so a failed run leaves nothing
 * behind. Two users are seeded for every test so ownership isolation is
 * exercised with a real second owner rather than a missing row.
 */
const ALICE = "test-folder-alice";
const BOB = "test-folder-bob";

/**
 * Folder ids are chosen by the client, because a folder's ciphertext is bound
 * to its id as AES-GCM additional authenticated data. Fixed ids here keep the
 * assertions and the cleanup unambiguous.
 */
const ALICE_FOLDER = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const SECOND_FOLDER = "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa";
const THIRD_FOLDER = "aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa";
const BOB_FOLDER = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const ABSENT_FOLDER = "cccccccc-1111-4111-8111-cccccccccccc";
const ALICE_ITEM = "dddddddd-1111-4111-8111-dddddddddddd";

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
  const [row] = await db
    .select()
    .from(folder)
    .where(eq(folder.id, id))
    .limit(1);
  return row;
}

/**
 * Inserts a folder with an explicit `createdAt`. Two `create` calls in the same
 * millisecond would tie, and a tie is not a stable ordering assertion, so the
 * ordering tests set the timestamps themselves rather than racing the clock.
 */
async function seedFolder(
  userId: string,
  id: string,
  ciphertext: string,
  createdAt: Date,
) {
  await db
    .insert(folder)
    .values({ id, userId, ciphertext, createdAt, updatedAt: createdAt });
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
  await db.delete(folder).where(inArray(folder.userId, [ALICE, BOB]));
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

describe("folder.create", () => {
  it("creates a folder the caller can read back", async () => {
    const created = await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });
    expect(created.id).toBe(ALICE_FOLDER);

    const rows = await callerFor(ALICE).folder.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(ALICE_FOLDER);
    expect(rows[0]?.ciphertext).toBe(ALICE_CIPHERTEXT);
  });

  it("stores the folder against the calling user, not the id in the input", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });

    expect((await rowOf(ALICE_FOLDER))?.userId).toBe(ALICE);
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
        callerFor(ALICE).folder.create({
          id: ALICE_FOLDER,
          ciphertext: malformed,
        }),
      );
      expect(error.code).toBe("BAD_REQUEST");
    }

    expect(await rowOf(ALICE_FOLDER)).toBeUndefined();
  });

  it("rejects an id that is not a uuid", async () => {
    const error = await errorOf(
      callerFor(ALICE).folder.create({
        id: "not-a-uuid",
        ciphertext: ALICE_CIPHERTEXT,
      }),
    );
    expect(error.code).toBe("BAD_REQUEST");
  });

  it("rejects a duplicate id rather than overwriting the row", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const error = await errorOf(
      callerFor(ALICE).folder.create({
        id: ALICE_FOLDER,
        ciphertext: "v1.second.attempt",
      }),
    );
    expect(error.code).toBe("CONFLICT");

    const rows = await callerFor(ALICE).folder.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ciphertext).toBe(ALICE_CIPHERTEXT);
  });

  it("refuses a duplicate id owned by another user without revealing the owner", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });

    // Bob guesses Alice's id. He must not overwrite her row, must not learn
    // that the collision is with someone else, and must not create a row.
    const collisionWithAlice = await errorOf(
      callerFor(BOB).folder.create({
        id: ALICE_FOLDER,
        ciphertext: BOB_CIPHERTEXT,
      }),
    );

    // The same failure Bob would see colliding with one of his own rows.
    await callerFor(BOB).folder.create({
      id: BOB_FOLDER,
      ciphertext: BOB_CIPHERTEXT,
    });
    const collisionWithSelf = await errorOf(
      callerFor(BOB).folder.create({
        id: BOB_FOLDER,
        ciphertext: BOB_CIPHERTEXT,
      }),
    );

    expect(collisionWithAlice.code).toBe("CONFLICT");
    expect(collisionWithAlice.code).toBe(collisionWithSelf.code);
    expect(collisionWithAlice.message).toBe(collisionWithSelf.message);
    expect(collisionWithAlice.message).not.toContain(ALICE);

    // Alice's row is untouched and Bob gained nothing but his own folder.
    const alicesRow = await rowOf(ALICE_FOLDER);
    expect(alicesRow?.userId).toBe(ALICE);
    expect(alicesRow?.ciphertext).toBe(ALICE_CIPHERTEXT);
    expect(await callerFor(BOB).folder.list()).toHaveLength(1);
  });
});

describe("folder.list", () => {
  it("returns the caller's folders oldest first", async () => {
    // Seeded out of order so a table-order fluke cannot pass for sorting.
    await seedFolder(
      ALICE,
      SECOND_FOLDER,
      "v1.second.payload",
      new Date("2024-02-01T00:00:00.000Z"),
    );
    await seedFolder(
      ALICE,
      THIRD_FOLDER,
      "v1.third.payload",
      new Date("2024-03-01T00:00:00.000Z"),
    );
    await seedFolder(
      ALICE,
      ALICE_FOLDER,
      ALICE_CIPHERTEXT,
      new Date("2024-01-01T00:00:00.000Z"),
    );

    const rows = await callerFor(ALICE).folder.list();
    expect(rows.map((row) => row.id)).toEqual([
      ALICE_FOLDER,
      SECOND_FOLDER,
      THIRD_FOLDER,
    ]);
  });

  it("keeps the order stable when a folder is renamed", async () => {
    await seedFolder(
      ALICE,
      ALICE_FOLDER,
      ALICE_CIPHERTEXT,
      new Date("2024-01-01T00:00:00.000Z"),
    );
    await seedFolder(
      ALICE,
      SECOND_FOLDER,
      "v1.second.payload",
      new Date("2024-02-01T00:00:00.000Z"),
    );

    await callerFor(ALICE).folder.rename({
      id: ALICE_FOLDER,
      ciphertext: "v1.alice-iv.renamed",
    });

    const rows = await callerFor(ALICE).folder.list();
    expect(rows.map((row) => row.id)).toEqual([ALICE_FOLDER, SECOND_FOLDER]);
  });

  it("never includes another user's folders", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });

    expect(await callerFor(BOB).folder.list()).toEqual([]);

    await callerFor(BOB).folder.create({
      id: BOB_FOLDER,
      ciphertext: BOB_CIPHERTEXT,
    });
    const bobsRows = await callerFor(BOB).folder.list();
    expect(bobsRows.map((row) => row.id)).toEqual([BOB_FOLDER]);
    expect(JSON.stringify(bobsRows)).not.toContain(ALICE_CIPHERTEXT);
  });
});

describe("folder.rename", () => {
  it("replaces the ciphertext and advances updatedAt", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });
    const before = await rowOf(ALICE_FOLDER);

    await callerFor(ALICE).folder.rename({
      id: ALICE_FOLDER,
      ciphertext: "v1.alice-iv.renamed",
    });

    const after = await rowOf(ALICE_FOLDER);
    expect(after?.ciphertext).toBe("v1.alice-iv.renamed");
    expect(after?.updatedAt.getTime()).toBeGreaterThan(
      before!.updatedAt.getTime(),
    );
    expect(after?.createdAt.getTime()).toBe(before!.createdAt.getTime());
  });

  it("rejects a malformed ciphertext", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const error = await errorOf(
      callerFor(ALICE).folder.rename({
        id: ALICE_FOLDER,
        ciphertext: "garbage",
      }),
    );
    expect(error.code).toBe("BAD_REQUEST");
    expect((await rowOf(ALICE_FOLDER))?.ciphertext).toBe(ALICE_CIPHERTEXT);
  });

  it("rejects an id that is not a uuid", async () => {
    const error = await errorOf(
      callerFor(ALICE).folder.rename({
        id: "not-a-uuid",
        ciphertext: ALICE_CIPHERTEXT,
      }),
    );
    expect(error.code).toBe("BAD_REQUEST");
  });

  it("refuses to rename another user's folder and leaves it unchanged", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });
    const before = await rowOf(ALICE_FOLDER);

    const error = await errorOf(
      callerFor(BOB).folder.rename({
        id: ALICE_FOLDER,
        ciphertext: "v1.bob.tampered",
      }),
    );
    expect(error.code).toBe("NOT_FOUND");

    const after = await rowOf(ALICE_FOLDER);
    expect(after?.ciphertext).toBe(ALICE_CIPHERTEXT);
    expect(after?.userId).toBe(ALICE);
    expect(after?.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
  });

  it("reports a folder that does not exist the same way as another user's", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const others = await errorOf(
      callerFor(BOB).folder.rename({
        id: ALICE_FOLDER,
        ciphertext: "v1.bob.tampered",
      }),
    );
    const absent = await errorOf(
      callerFor(BOB).folder.rename({
        id: ABSENT_FOLDER,
        ciphertext: "v1.bob.tampered",
      }),
    );

    expect(others.code).toBe(absent.code);
    expect(others.message).toBe(absent.message);
  });
});

describe("folder.delete", () => {
  it("hard-deletes: the row is gone from the table, not flagged", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });

    await callerFor(ALICE).folder.delete({ id: ALICE_FOLDER });

    expect(await callerFor(ALICE).folder.list()).toEqual([]);
    expect(await rowOf(ALICE_FOLDER)).toBeUndefined();
  });

  it("deletes only the named folder", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });
    await callerFor(ALICE).folder.create({
      id: SECOND_FOLDER,
      ciphertext: "v1.second.payload",
    });

    await callerFor(ALICE).folder.delete({ id: ALICE_FOLDER });

    const rows = await callerFor(ALICE).folder.list();
    expect(rows.map((row) => row.id)).toEqual([SECOND_FOLDER]);
  });

  it("leaves the caller's items alone: membership is inside their ciphertext", async () => {
    // The server cannot read which items referenced the folder, so there is
    // deliberately no cascade. The items simply become unfiled.
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });
    await callerFor(ALICE).item.create({
      id: ALICE_ITEM,
      ciphertext: "v1.item-iv.item-payload",
    });

    await callerFor(ALICE).folder.delete({ id: ALICE_FOLDER });

    const items = await callerFor(ALICE).item.list();
    expect(items.map((row) => row.id)).toEqual([ALICE_ITEM]);
    expect(items[0]?.ciphertext).toBe("v1.item-iv.item-payload");
  });

  it("refuses to delete another user's folder", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const error = await errorOf(
      callerFor(BOB).folder.delete({ id: ALICE_FOLDER }),
    );
    expect(error.code).toBe("NOT_FOUND");

    const row = await rowOf(ALICE_FOLDER);
    expect(row?.userId).toBe(ALICE);
    expect(row?.ciphertext).toBe(ALICE_CIPHERTEXT);
    expect(await callerFor(ALICE).folder.list()).toHaveLength(1);
  });

  it("rejects an id that is not a uuid", async () => {
    const error = await errorOf(
      callerFor(ALICE).folder.delete({ id: "not-a-uuid" }),
    );
    expect(error.code).toBe("BAD_REQUEST");
  });
});

describe("folder authentication", () => {
  it("rejects every procedure for an unauthenticated caller", async () => {
    const anonymous = callerFor(null);
    // Started one at a time: a rejected promise left sitting in an array until
    // its turn is an unhandled rejection, which fails the run for the wrong
    // reason.
    const calls: (() => Promise<unknown>)[] = [
      () => anonymous.folder.list(),
      () =>
        anonymous.folder.create({
          id: ALICE_FOLDER,
          ciphertext: ALICE_CIPHERTEXT,
        }),
      () =>
        anonymous.folder.rename({
          id: ALICE_FOLDER,
          ciphertext: ALICE_CIPHERTEXT,
        }),
      () => anonymous.folder.delete({ id: ALICE_FOLDER }),
    ];

    for (const call of calls) {
      expect((await errorOf(call())).code).toBe("UNAUTHORIZED");
    }

    expect(await rowOf(ALICE_FOLDER)).toBeUndefined();
  });

  it("does not let an unauthenticated caller touch an existing folder", async () => {
    await callerFor(ALICE).folder.create({
      id: ALICE_FOLDER,
      ciphertext: ALICE_CIPHERTEXT,
    });

    const error = await errorOf(
      callerFor(null).folder.delete({ id: ALICE_FOLDER }),
    );
    expect(error.code).toBe("UNAUTHORIZED");

    expect((await rowOf(ALICE_FOLDER))?.ciphertext).toBe(ALICE_CIPHERTEXT);
  });
});

describe("test hygiene", () => {
  it("leaves no seeded rows behind", async () => {
    await removeFixtures();

    const folders = await db
      .select({ id: folder.id })
      .from(folder)
      .where(inArray(folder.userId, [ALICE, BOB]))
      .orderBy(asc(folder.createdAt));
    const users = await db
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.id, [ALICE, BOB]));

    expect(folders).toHaveLength(0);
    expect(users).toHaveLength(0);

    // Put back what this test deliberately tore down. It currently runs last,
    // so nothing notices - but the users are seeded once per file now, and a
    // test that leaves shared fixtures deleted should not depend on being last.
    await seedUsers(ALICE, BOB);
  });
});
