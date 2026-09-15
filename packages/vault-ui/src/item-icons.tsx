import {
  Award,
  BadgeCheck,
  Banknote,
  BookUser,
  CreditCard,
  Database,
  Globe,
  IdCard,
  KeyRound,
  Mail,
  Plane,
  Router,
  ScrollText,
  Server,
  Stethoscope,
  StickyNote,
  Terminal,
  Wallet,
} from "lucide-react";

import type { ItemType } from "@passio/core/schema";

/**
 * One icon per item type.
 *
 * Kept apart from `@passio/core/fields`, which holds the labels and the field
 * tables: core has no React and must not grow a dependency on an icon library
 * to stay usable from a plain Node script.
 */
export const TYPE_ICONS: Record<ItemType, typeof KeyRound> = {
  login: KeyRound,
  note: StickyNote,
  card: CreditCard,
  identity: BookUser,
  bankAccount: Banknote,
  emailAccount: Mail,
  passport: Plane,
  driversLicence: IdCard,
  cryptoWallet: Wallet,
  sshKey: Terminal,
  apiCredential: Globe,
  server: Server,
  database: Database,
  softwareLicence: ScrollText,
  wirelessRouter: Router,
  membership: BadgeCheck,
  rewardProgram: Award,
  medicalRecord: Stethoscope,
};
