import "@passio/ui/styles.css";

import { matchItemsToUrl } from "@passio/core/match";
import { KeyRound, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { vault } from "../../src/client";
import { ItemGlyph } from "../../src/item-glyph";
import type { ItemSummary } from "../../src/messages";

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

  const frame = "bg-popover text-popover-foreground rounded-lg border shadow-lg";

  if (state.kind === "loading") {
    return <div className={`${frame} text-muted-foreground p-3 text-xs`}>Loading…</div>;
  }

  if (state.kind === "locked") {
    return (
      <div className={`${frame} flex items-center gap-2 p-3`}>
        <Lock className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-xs">
          passio is locked. Open it from the toolbar to unlock.
        </span>
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <div className={`${frame} flex items-center gap-2 p-3`}>
        <KeyRound className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground text-xs">
          No saved logins for this site.
        </span>
      </div>
    );
  }

  return (
    <ul className={`${frame} max-h-[220px] overflow-y-auto py-1`}>
      {state.items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => choose(item.id)}
            className="hover:bg-muted/60 flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors"
          >
            <ItemGlyph type={item.type} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{item.title}</span>
              {item.username ? (
                <span className="text-muted-foreground block truncate text-[11px]">
                  {item.username}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
