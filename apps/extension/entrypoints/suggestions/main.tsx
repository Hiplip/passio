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

/** The site the list is for, shown so a wrong match is obvious rather than
 *  silently filled. */
function siteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "this site";
  }
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-popover text-popover-foreground overflow-hidden rounded-xl border shadow-xl">
      {children}
    </div>
  );
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Panel>
      <div className="flex items-center gap-2.5 px-3 py-3">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-muted-foreground text-xs">{children}</span>
      </div>
    </Panel>
  );
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
    return (
      <Notice icon={<KeyRound className="size-3.5" />}>Looking in your vault…</Notice>
    );
  }

  if (state.kind === "locked") {
    return (
      <Notice icon={<Lock className="size-3.5" />}>
        passio is locked. Open it from the toolbar to unlock.
      </Notice>
    );
  }

  if (state.items.length === 0) {
    return (
      <Notice icon={<KeyRound className="size-3.5" />}>
        No saved logins for {siteLabel(pageUrl)}.
      </Notice>
    );
  }

  return (
    <Panel>
      <p className="text-muted-foreground bg-muted/50 border-b px-3 py-1.5 text-[11px]">
        passio · {siteLabel(pageUrl)}
      </p>

      <ul className="max-h-[188px] overflow-y-auto py-1">
        {state.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => choose(item.id)}
              className="hover:bg-accent focus-visible:bg-accent flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left transition-colors outline-none"
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
    </Panel>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
