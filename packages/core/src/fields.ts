import type { Item, ItemType } from "./schema";

/**
 * How one field of one item type is presented and handled.
 *
 * The whole point of this table is that adding an item type becomes DATA rather
 * than JSX. Eighteen types times six fields is a hundred inputs; writing those
 * by hand once guarantees they drift, and writing them eighteen times over
 * guarantees it twice.
 */
export interface FieldSpec {
  /** The key on the item. Typed loosely because it spans eighteen shapes; the
   *  table below is checked against those shapes by fields.test.ts. */
  key: string;
  label: string;
  /**
   * `secret` masks and offers reveal-and-copy; `multiline` is a textarea;
   * `month` and `year` are the card expiry's constrained numbers.
   */
  kind: "text" | "secret" | "multiline" | "month" | "year";
  placeholder?: string;
  /** Half-width on wide screens, so short fields share a row. */
  narrow?: boolean;
}

const text = (key: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  key,
  label,
  kind: "text",
  ...extra,
});

const secret = (key: string, label: string): FieldSpec => ({
  key,
  label,
  kind: "secret",
});

export interface TypeSpec {
  label: string;
  plural: string;
  describe: string;
  fields: FieldSpec[];
  /** Fields worth offering on the copy menu, in the order people reach for
   *  them. Keys must appear in `fields`. */
  copyable: Array<{ key: string; label: string }>;
}

export const TYPE_SPECS: Record<ItemType, TypeSpec> = {
  login: {
    label: "Login",
    plural: "Logins",
    describe: "A username, password and one-time codes.",
    fields: [
      text("username", "Username", { narrow: true }),
      secret("password", "Password"),
    ],
    copyable: [
      { key: "username", label: "Copy username" },
      { key: "password", label: "Copy password" },
    ],
  },
  note: {
    label: "Secure note",
    plural: "Notes",
    describe: "Free text, encrypted like everything else.",
    fields: [{ key: "body", label: "Note", kind: "multiline" }],
    copyable: [{ key: "body", label: "Copy note" }],
  },
  card: {
    label: "Credit card",
    plural: "Cards",
    describe: "Card number, expiry and security code.",
    fields: [
      text("cardholderName", "Cardholder name"),
      text("number", "Card number"),
      text("brand", "Brand", { narrow: true }),
      { key: "expMonth", label: "Expiry month", kind: "month", narrow: true },
      { key: "expYear", label: "Expiry year", kind: "year", narrow: true },
      secret("cvv", "Security code"),
    ],
    copyable: [
      { key: "number", label: "Copy card number" },
      { key: "cvv", label: "Copy security code" },
    ],
  },
  identity: {
    label: "Identity",
    plural: "Identities",
    describe: "Name, address and contact details, for filling forms.",
    fields: [
      text("firstName", "First name", { narrow: true }),
      text("middleName", "Middle name", { narrow: true }),
      text("lastName", "Last name", { narrow: true }),
      text("company", "Company", { narrow: true }),
      text("email", "Email", { narrow: true }),
      text("phone", "Phone", { narrow: true }),
      text("address1", "Address line 1"),
      text("address2", "Address line 2"),
      text("city", "City", { narrow: true }),
      text("state", "State or region", { narrow: true }),
      text("postalCode", "Postcode", { narrow: true }),
      text("country", "Country", { narrow: true }),
    ],
    copyable: [
      { key: "email", label: "Copy email" },
      { key: "phone", label: "Copy phone" },
    ],
  },
  bankAccount: {
    label: "Bank account",
    plural: "Bank accounts",
    describe: "Account numbers, IBAN and the PIN.",
    fields: [
      text("bankName", "Bank", { narrow: true }),
      text("accountHolder", "Account holder", { narrow: true }),
      secret("accountNumber", "Account number"),
      secret("routingNumber", "Routing number"),
      secret("iban", "IBAN"),
      text("swift", "SWIFT / BIC", { narrow: true }),
      secret("pin", "PIN"),
    ],
    copyable: [
      { key: "accountNumber", label: "Copy account number" },
      { key: "iban", label: "Copy IBAN" },
    ],
  },
  emailAccount: {
    label: "Email account",
    plural: "Email accounts",
    describe: "Mailbox credentials and server settings.",
    fields: [
      text("address", "Email address", { narrow: true }),
      text("username", "Username", { narrow: true }),
      secret("password", "Password"),
      text("incomingHost", "Incoming server", { narrow: true }),
      text("outgoingHost", "Outgoing server", { narrow: true }),
    ],
    copyable: [
      { key: "address", label: "Copy address" },
      { key: "password", label: "Copy password" },
    ],
  },
  passport: {
    label: "Passport",
    plural: "Passports",
    describe: "Passport number, nationality and dates.",
    fields: [
      text("fullName", "Full name"),
      secret("number", "Passport number"),
      text("nationality", "Nationality", { narrow: true }),
      text("placeOfBirth", "Place of birth", { narrow: true }),
      text("issuedOn", "Issued", { narrow: true, placeholder: "YYYY-MM-DD" }),
      text("expiresOn", "Expires", { narrow: true, placeholder: "YYYY-MM-DD" }),
    ],
    copyable: [{ key: "number", label: "Copy passport number" }],
  },
  driversLicence: {
    label: "Driving licence",
    plural: "Driving licences",
    describe: "Licence number, classes and expiry.",
    fields: [
      text("fullName", "Full name"),
      secret("number", "Licence number"),
      text("issuingAuthority", "Issuing authority", { narrow: true }),
      text("classes", "Classes", { narrow: true }),
      text("issuedOn", "Issued", { narrow: true, placeholder: "YYYY-MM-DD" }),
      text("expiresOn", "Expires", { narrow: true, placeholder: "YYYY-MM-DD" }),
    ],
    copyable: [{ key: "number", label: "Copy licence number" }],
  },
  cryptoWallet: {
    label: "Crypto wallet",
    plural: "Crypto wallets",
    describe: "Seed phrase, keys and derivation path.",
    fields: [
      text("walletName", "Wallet", { narrow: true }),
      text("publicAddress", "Public address"),
      secret("seedPhrase", "Recovery phrase"),
      secret("privateKey", "Private key"),
      secret("passphrase", "Passphrase"),
      text("derivationPath", "Derivation path", { narrow: true }),
    ],
    copyable: [
      { key: "publicAddress", label: "Copy public address" },
      { key: "seedPhrase", label: "Copy recovery phrase" },
    ],
  },
  sshKey: {
    label: "SSH key",
    plural: "SSH keys",
    describe: "A key pair and its passphrase.",
    fields: [
      { key: "privateKey", label: "Private key", kind: "secret" },
      { key: "publicKey", label: "Public key", kind: "multiline" },
      text("fingerprint", "Fingerprint"),
      secret("passphrase", "Passphrase"),
    ],
    copyable: [
      { key: "publicKey", label: "Copy public key" },
      { key: "privateKey", label: "Copy private key" },
    ],
  },
  apiCredential: {
    label: "API credential",
    plural: "API credentials",
    describe: "Keys and tokens for a service.",
    fields: [
      text("service", "Service", { narrow: true }),
      text("clientId", "Client ID", { narrow: true }),
      secret("secretKey", "Secret"),
      text("endpoint", "Endpoint"),
      text("expiresOn", "Expires", { narrow: true, placeholder: "YYYY-MM-DD" }),
    ],
    copyable: [
      { key: "secretKey", label: "Copy secret" },
      { key: "clientId", label: "Copy client ID" },
    ],
  },
  server: {
    label: "Server",
    plural: "Servers",
    describe: "Hostname and login for a machine.",
    fields: [
      text("hostname", "Hostname", { narrow: true }),
      text("port", "Port", { narrow: true }),
      text("username", "Username", { narrow: true }),
      secret("password", "Password"),
    ],
    copyable: [
      { key: "hostname", label: "Copy hostname" },
      { key: "password", label: "Copy password" },
    ],
  },
  database: {
    label: "Database",
    plural: "Databases",
    describe: "Connection details and credentials.",
    fields: [
      text("engine", "Engine", { narrow: true }),
      text("host", "Host", { narrow: true }),
      text("port", "Port", { narrow: true }),
      text("database", "Database", { narrow: true }),
      text("username", "Username", { narrow: true }),
      secret("password", "Password"),
      secret("connectionString", "Connection string"),
    ],
    copyable: [
      { key: "connectionString", label: "Copy connection string" },
      { key: "password", label: "Copy password" },
    ],
  },
  softwareLicence: {
    label: "Software licence",
    plural: "Software licences",
    describe: "A licence key and who it belongs to.",
    fields: [
      text("product", "Product", { narrow: true }),
      text("version", "Version", { narrow: true }),
      secret("licenceKey", "Licence key"),
      text("licensedTo", "Licensed to", { narrow: true }),
      text("purchasedOn", "Purchased", { narrow: true, placeholder: "YYYY-MM-DD" }),
    ],
    copyable: [{ key: "licenceKey", label: "Copy licence key" }],
  },
  wirelessRouter: {
    label: "Wi-Fi router",
    plural: "Wi-Fi routers",
    describe: "Network name, Wi-Fi password and admin login.",
    fields: [
      text("networkName", "Network name", { narrow: true }),
      secret("wifiPassword", "Wi-Fi password"),
      text("adminUrl", "Admin address", { narrow: true }),
      text("adminUsername", "Admin username", { narrow: true }),
      secret("adminPassword", "Admin password"),
    ],
    copyable: [
      { key: "wifiPassword", label: "Copy Wi-Fi password" },
      { key: "adminPassword", label: "Copy admin password" },
    ],
  },
  membership: {
    label: "Membership",
    plural: "Memberships",
    describe: "Member number and expiry.",
    fields: [
      text("organisation", "Organisation", { narrow: true }),
      text("memberName", "Member name", { narrow: true }),
      text("memberId", "Member number", { narrow: true }),
      text("expiresOn", "Expires", { narrow: true, placeholder: "YYYY-MM-DD" }),
    ],
    copyable: [{ key: "memberId", label: "Copy member number" }],
  },
  rewardProgram: {
    label: "Reward program",
    plural: "Reward programs",
    describe: "Loyalty number and PIN.",
    fields: [
      text("company", "Company", { narrow: true }),
      text("memberName", "Member name", { narrow: true }),
      text("memberId", "Member number", { narrow: true }),
      secret("pin", "PIN"),
    ],
    copyable: [{ key: "memberId", label: "Copy member number" }],
  },
  medicalRecord: {
    label: "Medical record",
    plural: "Medical records",
    describe: "Policy and provider details.",
    fields: [
      text("patientName", "Patient name", { narrow: true }),
      text("provider", "Provider", { narrow: true }),
      secret("policyNumber", "Policy number"),
      text("groupNumber", "Group number", { narrow: true }),
    ],
    copyable: [{ key: "policyNumber", label: "Copy policy number" }],
  },
};

/** Reads a field off an item without the caller having to narrow the union. */
export function fieldValue(item: Item, key: string): string | undefined {
  const value = (item as unknown as Record<string, unknown>)[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

/** Writes a field onto an item, preserving its type tag. */
export function withField(item: Item, key: string, value: string): Item {
  return { ...item, [key]: value };
}
