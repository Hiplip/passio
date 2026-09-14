import "@passio/ui/styles.css";

import { matchItemsToUrl } from "@passio/core/match";
import { KeyRound, Lock, SquareArrowOutUpRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { vault } from "../../src/client";
import { ItemGlyph } from "../../src/item-glyph";
import type { ItemSummary } from "../../src/messages";
import { popOut } from "../../src/pop-out";

/**
 * The suggestion list, rendered on the extension's own origin inside an iframe.
 *
 * This is why it is an iframe and not a shadow root: page script cannot read
 * across an origin boundary, but it can walk a shadow root. A list of which
 * accounts you hold for a site is worth that isolation.
 *
 * Even so, it never holds a secret. Entries carry a title and a username;
 * choosing one sends the item's ID to the service worker, which resolves the
 * values and hands them to the content script. The password never travels
 * through this document.
 */
type State =
  | { kind: "loading" }
  | { kind: "locked" }
  | { kind: "ready"; items: ItemSummary[] };

/**
 * Reports this document's real height, so the content script can size the
 * iframe to it.
 *
 * A ResizeObserver rather than one measurement: the panel changes height when
 * the list arrives, and a notice that wraps to two lines is taller than one
 * that does not. Estimating from a match count got both wrong, which is what
 * produced a scrollbar inside an already small panel.
 */
function useReportHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let last = 0;
    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height === 0 || height === last) return;
      last = height;
      void chrome.runtime.sendMessage({
        target: "background",
        kind: "inlineResize",
        height,
      });
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function Panel({ children }: { children: React.ReactNode }) {
  const ref = useReportHeight<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="bg-popover text-popover-foreground overflow-hidden rounded-xl border shadow-2xl"
    >
      {children}
    </div>
  );
}

function Notice({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <div className="flex items-center gap-2.5 px-3.5 py-3.5">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-muted-foreground text-xs leading-snug">{children}</span>
      </div>
    </Panel>
  );
}

function siteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "this site";
  }
}

function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const pageUrl = new URLSearchParams(window.location.search).get("u") ?? "";

  useEffect(() => {
    void (async () => {
      try {
        const { items } = await vault.items();
        setState({ kind: "ready", items: matchItemsToUrl(items, pageUrl) });
      } catch {
        setState({ kind: "locked" });
      }
    })();
  }, [pageUrl]);

  function choose(itemId: string) {
    void chrome.runtime.sendMessage({
      target: "background",
      kind: "inlineFill",
      itemId,
    });
  }

  if (state.kind === "loading") {
    return <Notice icon={<KeyRound className="size-4" />}>Checking your vault…</Notice>;
  }

  if (state.kind === "locked") {
    return (
      <Notice icon={<Lock className="size-4" />}>
        passio is locked — open it from the toolbar to unlock.
      </Notice>
    );
  }

  if (state.items.length === 0) {
    return (
      <Notice icon={<KeyRound className="size-4" />}>
        No saved logins for {siteLabel(pageUrl)}.
      </Notice>
    );
  }

  return (
    <Panel>
      {/* No header. The list is anchored to the field it fills, which is
          context enough - a title bar just makes it look like a dialog that
          landed on the page. */}
      <ul className="max-h-[204px] overflow-y-auto py-1.5">
        {state.items.map((item) => (
          <li key={item.id} className="group/row relative">
            <button
              type="button"
              onClick={() => choose(item.id)}
              className="hover:bg-accent focus-visible:bg-accent flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 pr-10 text-left transition-colors outline-none"
            >
              <ItemGlyph type={item.type} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {item.title}
                </span>
                {item.username ? (
                  <span className="text-muted-foreground block truncate text-[11px]">
                    {item.username}
                  </span>
                ) : null}
              </span>
            </button>

            {/* Opens the item in the vault window, for when you want to look at
                it rather than fill it. */}
            <button
              type="button"
              aria-label={`Open ${item.title} in passio`}
              onClick={() => void popOut(`/vault/${item.id}`)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:text-foreground absolute top-1/2 right-2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md opacity-0 transition-all outline-none group-hover/row:opacity-100 focus-visible:opacity-100"
            >
              <SquareArrowOutUpRight className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
