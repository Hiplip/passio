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
export function usePath(): string {
  const read = () => window.location.hash.slice(1) || "/vault";
  const [path, setPath] = useState(read);

  useEffect(() => {
    const onChange = () => setPath(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

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
