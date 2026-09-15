import { z } from "zod";

/**
 * The shape of a decrypted item.
 *
 * Validation happens AFTER decryption. The ciphertext is authenticated, so we
 * know the vault key wrote it - but the plaintext inside is still parsed JSON,
 * and an older or corrupted item could be any shape at all. Nothing in the UI
 * should trust it before it passes through here.
 *
 * The item type lives inside the encrypted blob, never in a database column, so
 * the server cannot tell a password from a credit card.
 */
const nonEmpty = z.string().trim().min(1, "required");

/**
 * A field the user invented.
 *
 * Inside the blob rather than in a column, so the server cannot see how many
 * fields an item has or what they are called - the shape of an item is itself a
 * hint about what it is. This is also what makes import lossless: Bitwarden and
 * 1Password both export arbitrary fields, and with nowhere to put them an
 * import silently drops data, which is the worst failure a password manager
 * has.
 */
export const customFieldSchema = z.object({
  name: z.string(),
  value: z.string(),
  /** `hidden` masks like a password. `boolean` stores "true"/"false" as text,
   *  so the blob stays a flat, forward-compatible shape. */
  kind: z.enum(["text", "hidden", "boolean"]).default("text"),
});

export type CustomField = z.infer<typeof customFieldSchema>;

/** How a saved address is compared against the page you are on. */
export const URI_MATCH_MODES = [
  "domain",
  "host",
  "startsWith",
  "exact",
  "regex",
  "never",
] as const;

export const uriMatchSchema = z.enum(URI_MATCH_MODES);
export type UriMatch = z.infer<typeof uriMatchSchema>;

/**
 * One address a login applies to.
 *
 * A single string could not say "this works on example.com AND example.co.uk",
 * which is the commonest autofill complaint in every competitor's tracker.
 * `domain` is the old behaviour and stays the default; `never` is how a user
 * says "offer nothing here" for one specific login.
 */
export const uriEntrySchema = z.object({
  uri: z.string(),
  match: uriMatchSchema.default("domain"),
});

export type UriEntry = z.infer<typeof uriEntrySchema>;

/**
 * A password this item used to have.
 *
 * Inside the blob for the same reason as everything else: a separate table
 * would tell the server exactly when each password changed, which is a usage
 * pattern worth hiding. Capped by `HISTORY_LIMIT` - a blob that grows without
 * bound eventually costs real time to decrypt on a phone.
 */
export const historyEntrySchema = z.object({
  password: z.string(),
  changedAt: z.string(),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const HISTORY_LIMIT = 10;

/**
 * Fields every item type shares.
 *
 * `folderId` lives inside the encrypted blob, not in a database column, so the
 * server cannot tell which items are grouped together - grouping is itself a
 * hint about what the items are.
 */
const commonFields = {
  title: nonEmpty,
  folderId: z.string().uuid().optional(),
  fields: z.array(customFieldSchema).optional(),
  favourite: z.boolean().optional(),
  /** Require the master password again before revealing this item's secrets.
   *  Enforced in custody, not in the UI - see `reprompt` in the extension. */
  reprompt: z.boolean().optional(),
  notes: z.string().optional(),
};

export const totpConfigSchema = z.object({
  /** Base32, as every authenticator app presents it. */
  secret: z.string().trim().min(1),
  digits: z.number().int().positive().optional(),
  period: z.number().int().positive().optional(),
  algorithm: z.string().optional(),
});

export const loginItemSchema = z.object({
  type: z.literal("login"),
  ...commonFields,
  username: z.string().optional(),
  password: z.string().optional(),
  /** Legacy single address. Still read, so existing items need no migration;
   *  new items write `uris` instead. See `urisOf`. */
  uri: z.string().optional(),
  uris: z.array(uriEntrySchema).optional(),
  history: z.array(historyEntrySchema).optional(),
  totp: totpConfigSchema.optional(),
});

export const noteItemSchema = z.object({
  type: z.literal("note"),
  ...commonFields,
  body: z.string().optional(),
});

export const cardItemSchema = z.object({
  type: z.literal("card"),
  ...commonFields,
  cardholderName: z.string().optional(),
  // A string, never a number: a leading zero is significant and 16 digits
  // exceeds what a JS number represents exactly.
  number: z.string().optional(),
  brand: z.string().optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2000).max(2100).optional(),
  cvv: z.string().optional(),
});

/** Name, address and contact details, for filling checkout and signup forms. */
export const identityItemSchema = z.object({
  type: z.literal("identity"),
  ...commonFields,
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

export const bankAccountItemSchema = z.object({
  type: z.literal("bankAccount"),
  ...commonFields,
  bankName: z.string().optional(),
  accountHolder: z.string().optional(),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  iban: z.string().optional(),
  swift: z.string().optional(),
  pin: z.string().optional(),
});

export const passportItemSchema = z.object({
  type: z.literal("passport"),
  ...commonFields,
  fullName: z.string().optional(),
  number: z.string().optional(),
  nationality: z.string().optional(),
  issuedOn: z.string().optional(),
  expiresOn: z.string().optional(),
  placeOfBirth: z.string().optional(),
});

export const driversLicenceItemSchema = z.object({
  type: z.literal("driversLicence"),
  ...commonFields,
  fullName: z.string().optional(),
  number: z.string().optional(),
  issuingAuthority: z.string().optional(),
  classes: z.string().optional(),
  issuedOn: z.string().optional(),
  expiresOn: z.string().optional(),
});

export const sshKeyItemSchema = z.object({
  type: z.literal("sshKey"),
  ...commonFields,
  privateKey: z.string().optional(),
  publicKey: z.string().optional(),
  fingerprint: z.string().optional(),
  passphrase: z.string().optional(),
});

export const apiCredentialItemSchema = z.object({
  type: z.literal("apiCredential"),
  ...commonFields,
  service: z.string().optional(),
  clientId: z.string().optional(),
  secretKey: z.string().optional(),
  endpoint: z.string().optional(),
  expiresOn: z.string().optional(),
});

export const softwareLicenceItemSchema = z.object({
  type: z.literal("softwareLicence"),
  ...commonFields,
  product: z.string().optional(),
  licenceKey: z.string().optional(),
  version: z.string().optional(),
  licensedTo: z.string().optional(),
  purchasedOn: z.string().optional(),
});

export const serverItemSchema = z.object({
  type: z.literal("server"),
  ...commonFields,
  hostname: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  port: z.string().optional(),
});

export const databaseItemSchema = z.object({
  type: z.literal("database"),
  ...commonFields,
  engine: z.string().optional(),
  host: z.string().optional(),
  port: z.string().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  connectionString: z.string().optional(),
});

export const wirelessRouterItemSchema = z.object({
  type: z.literal("wirelessRouter"),
  ...commonFields,
  networkName: z.string().optional(),
  wifiPassword: z.string().optional(),
  adminUsername: z.string().optional(),
  adminPassword: z.string().optional(),
  adminUrl: z.string().optional(),
});

export const emailAccountItemSchema = z.object({
  type: z.literal("emailAccount"),
  ...commonFields,
  address: z.string().optional(),
  password: z.string().optional(),
  incomingHost: z.string().optional(),
  outgoingHost: z.string().optional(),
  username: z.string().optional(),
});

export const membershipItemSchema = z.object({
  type: z.literal("membership"),
  ...commonFields,
  organisation: z.string().optional(),
  memberName: z.string().optional(),
  memberId: z.string().optional(),
  expiresOn: z.string().optional(),
});

export const rewardProgramItemSchema = z.object({
  type: z.literal("rewardProgram"),
  ...commonFields,
  company: z.string().optional(),
  memberId: z.string().optional(),
  pin: z.string().optional(),
  memberName: z.string().optional(),
});

export const medicalRecordItemSchema = z.object({
  type: z.literal("medicalRecord"),
  ...commonFields,
  patientName: z.string().optional(),
  provider: z.string().optional(),
  policyNumber: z.string().optional(),
  groupNumber: z.string().optional(),
});

/**
 * A seed phrase and the wallet it opens.
 *
 * The single highest-value item a vault can hold: a seed phrase is bearer
 * access to funds with no recovery and no chargeback. Treated as a secret
 * everywhere it appears.
 */
export const cryptoWalletItemSchema = z.object({
  type: z.literal("cryptoWallet"),
  ...commonFields,
  walletName: z.string().optional(),
  seedPhrase: z.string().optional(),
  privateKey: z.string().optional(),
  publicAddress: z.string().optional(),
  passphrase: z.string().optional(),
  derivationPath: z.string().optional(),
});

export const itemSchema = z.discriminatedUnion("type", [
  loginItemSchema,
  noteItemSchema,
  cardItemSchema,
  identityItemSchema,
  bankAccountItemSchema,
  passportItemSchema,
  driversLicenceItemSchema,
  sshKeyItemSchema,
  apiCredentialItemSchema,
  softwareLicenceItemSchema,
  serverItemSchema,
  databaseItemSchema,
  wirelessRouterItemSchema,
  emailAccountItemSchema,
  membershipItemSchema,
  rewardProgramItemSchema,
  medicalRecordItemSchema,
  cryptoWalletItemSchema,
]);

export type LoginItem = z.infer<typeof loginItemSchema>;
export type NoteItem = z.infer<typeof noteItemSchema>;
export type CardItem = z.infer<typeof cardItemSchema>;
export type IdentityItem = z.infer<typeof identityItemSchema>;
export type BankAccountItem = z.infer<typeof bankAccountItemSchema>;
export type PassportItem = z.infer<typeof passportItemSchema>;
export type DriversLicenceItem = z.infer<typeof driversLicenceItemSchema>;
export type SshKeyItem = z.infer<typeof sshKeyItemSchema>;
export type ApiCredentialItem = z.infer<typeof apiCredentialItemSchema>;
export type SoftwareLicenceItem = z.infer<typeof softwareLicenceItemSchema>;
export type ServerItem = z.infer<typeof serverItemSchema>;
export type DatabaseItem = z.infer<typeof databaseItemSchema>;
export type WirelessRouterItem = z.infer<typeof wirelessRouterItemSchema>;
export type EmailAccountItem = z.infer<typeof emailAccountItemSchema>;
export type MembershipItem = z.infer<typeof membershipItemSchema>;
export type RewardProgramItem = z.infer<typeof rewardProgramItemSchema>;
export type MedicalRecordItem = z.infer<typeof medicalRecordItemSchema>;
export type CryptoWalletItem = z.infer<typeof cryptoWalletItemSchema>;
export type TotpConfig = z.infer<typeof totpConfigSchema>;
export type Item = z.infer<typeof itemSchema>;
export type ItemType = Item["type"];

/** Every type, in the order they are offered. Login first because it is what
 *  almost every item is. */
export const ITEM_TYPES = [
  "login",
  "note",
  "card",
  "identity",
  "bankAccount",
  "emailAccount",
  "passport",
  "driversLicence",
  "cryptoWallet",
  "sshKey",
  "apiCredential",
  "server",
  "database",
  "softwareLicence",
  "wirelessRouter",
  "membership",
  "rewardProgram",
  "medicalRecord",
] as const;

export function newItem(type: ItemType): Item {
  switch (type) {
    case "login":
      return { type: "login", title: "Untitled" };
    case "note":
      return { type: "note", title: "Untitled note" };
    case "card":
      return { type: "card", title: "Untitled card" };
    case "identity":
      return { type: "identity", title: "Untitled identity" };
    case "bankAccount":
      return { type: "bankAccount", title: "Untitled account" };
    case "passport":
      return { type: "passport", title: "Untitled passport" };
    case "driversLicence":
      return { type: "driversLicence", title: "Untitled licence" };
    case "sshKey":
      return { type: "sshKey", title: "Untitled key" };
    case "apiCredential":
      return { type: "apiCredential", title: "Untitled credential" };
    case "softwareLicence":
      return { type: "softwareLicence", title: "Untitled licence" };
    case "server":
      return { type: "server", title: "Untitled server" };
    case "database":
      return { type: "database", title: "Untitled database" };
    case "wirelessRouter":
      return { type: "wirelessRouter", title: "Untitled router" };
    case "emailAccount":
      return { type: "emailAccount", title: "Untitled email account" };
    case "membership":
      return { type: "membership", title: "Untitled membership" };
    case "rewardProgram":
      return { type: "rewardProgram", title: "Untitled reward program" };
    case "medicalRecord":
      return { type: "medicalRecord", title: "Untitled record" };
    case "cryptoWallet":
      return { type: "cryptoWallet", title: "Untitled wallet" };
  }
}

export function newLoginItem(): LoginItem {
  return { type: "login", title: "Untitled" };
}

export function newNoteItem(): NoteItem {
  return { type: "note", title: "Untitled note" };
}

export function newCardItem(): CardItem {
  return { type: "card", title: "Untitled card" };
}

/**
 * Every address a login applies to, old shape or new.
 *
 * Existing items carry a single `uri` string and must keep working without a
 * migration step - the server cannot perform one, because it cannot read them.
 * So the legacy field is read here rather than rewritten anywhere.
 */
export function urisOf(item: Item): UriEntry[] {
  if (item.type !== "login") return [];
  const entries = [...(item.uris ?? [])];
  if (item.uri && item.uri.trim().length > 0) {
    const already = entries.some((e) => e.uri === item.uri);
    if (!already) entries.push({ uri: item.uri, match: "domain" });
  }
  return entries;
}

/** The decrypted contents of a folder row. Its name is a secret like any other. */
export const folderSchema = z.object({
  name: nonEmpty,
});

export type Folder = z.infer<typeof folderSchema>;
