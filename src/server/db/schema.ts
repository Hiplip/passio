import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),

  // --- passio vault key material (Better Auth user.additionalFields) ---
  // These live on `user` rather than in a side table on purpose. Better Auth
  // mounts a public /api/auth/sign-up/email route, so a side table written by
  // application code could be bypassed, producing a user with no key material:
  // a permanently un-unlockable account. notNull() makes that unrepresentable.
  protectedVaultKey: text("protected_vault_key").notNull(),
  recoveryWrappedVaultKey: text("recovery_wrapped_vault_key").notNull(),
  // A hash of deriveRecoveryAuthHash(recoveryKey). Proves possession of the
  // recovery key without the server ever holding it.
  recoveryVerifier: text("recovery_verifier").notNull(),
  kdfVersion: integer("kdf_version").notNull().default(1),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
});

export const userRelations = relations(user, ({ many }) => ({
  account: many(account),
  session: many(session),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

/**
 * A vault item. The server cannot read any of this.
 *
 * Note what is absent: no type, no title, no username, no url, no tags. Every
 * field lives inside `ciphertext`. The client decrypts the whole vault on
 * unlock and searches in memory, so server-side filtering was never needed and
 * the metadata leak is minimised for free.
 */
export const item = pgTable(
  "item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ciphertext: text("ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete: one column and a filter, and a mis-click in a password
    // manager is otherwise unrecoverable.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("item_user_id_idx").on(table.userId)],
);

/**
 * Schema groundwork for a future multi-user direction. Nothing at MVP reads or
 * writes this. There is no invite UI and no redemption flow: registration is
 * simply closed once any account exists. Do not build an invite flow.
 */
export const invite = pgTable("invite", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const itemRelations = relations(item, ({ one }) => ({
  user: one(user, { fields: [item.userId], references: [user.id] }),
}));
