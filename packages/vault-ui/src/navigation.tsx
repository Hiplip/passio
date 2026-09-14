"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";

export interface LinkProps {
  href: string;
  className?: string;
  children?: ReactNode;
}

/**
 * How this surface moves between screens.
 *
 * The web app routes with Next; the extension runs in a single page with a hash
 * router. Injecting both the imperative `navigate` and the declarative `Link`
 * keeps every vault component free of either, so one set of components serves
 * both - which is the entire reason this package exists.
 */
export interface Navigation {
  navigate: (to: string) => void;
  Link: ComponentType<LinkProps>;
}

const NavigationContext = createContext<Navigation | null>(null);

export function NavigationProvider({
  value,
  children,
}: {
  value: Navigation;
  children: ReactNode;
}) {
  return (
    <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
  );
}

export function useNavigation(): Navigation {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used inside a NavigationProvider");
  }
  return context;
}

/** Every route the vault UI can reach, named once so a typo is a compile error. */
export const routes = {
  vault: "/vault",
  newItem: "/vault/new",
  item: (id: string) => `/vault/${id}`,
  settings: "/settings",
  unlock: "/unlock",
} as const;
