import { useCallback, useEffect, useMemo, useState } from "react";

import type { LinkProps, Navigation } from "@passio/vault-ui/navigation";

/**
 * Routing for a single extension page.
 *
 * The shared vault UI navigates with paths like "/vault/{id}". An extension
 * page is one HTML file, so those become fragments: "#/vault/{id}". Nothing in
 * the shared components knows the difference - that is the point of injecting
 * Navigation rather than importing a router.
 */
/**
 * The current route, from the URL fragment.
 *
 * `fallback` differs by surface: the full page opens on the vault list, while
 * the popup opens on its fill list at "/" and only enters "/vault/..." when
 * someone chooses to edit. Sharing one default would send the popup straight
 * into an editor with no item.
 */
export function usePath(fallback: string): string {
  const read = useCallback(
    () => window.location.hash.slice(1) || fallback,
    [fallback],
  );
  const [path, setPath] = useState(read);

  useEffect(() => {
    const onChange = () => setPath(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, [read]);

  return path;
}

export function useHashNavigation(): Navigation {
  const navigate = useCallback((to: string) => {
    window.location.hash = to;
  }, []);

  const Link = useCallback(
    ({ href, className, children }: LinkProps) => (
      <a href={`#${href}`} className={className}>
        {children}
      </a>
    ),
    [],
  );

  return useMemo(() => ({ navigate, Link }), [navigate, Link]);
}
