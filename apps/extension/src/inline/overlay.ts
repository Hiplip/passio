import { findLoginFields } from "../fields";
import {
  ICON_SIZE,
  iconPosition,
  isDecoratable,
  listPosition,
  type Box,
} from "./anchor";

const LIST_HEIGHT = 232;
/** Above almost everything, below nothing that matters. Sites use z-indexes in
 *  the millions; this has to win or the button is invisible on them. */
const Z = 2147483000;

function box(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * The in-page half of the suggestion overlay.
 *
 * Everything it adds is `position: fixed` in its own container, never a child
 * of the page's form. Injecting into someone else's layout breaks on any site
 * with a transformed ancestor, `overflow: hidden`, or its own absolutely
 * positioned decorations - which is most of them.
 *
 * The button lives in a shadow root so page CSS cannot restyle it. The list
 * lives in an iframe on the extension's origin, because page script can walk a
 * shadow root but cannot read across an origin.
 */
export function createOverlay() {
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0";
  const root = host.attachShadow({ mode: "closed" });

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "passio suggestions");
  button.style.cssText = `
    position:fixed;width:${ICON_SIZE}px;height:${ICON_SIZE}px;padding:0;
    border:0;border-radius:5px;cursor:pointer;display:none;z-index:${Z};
    background:#0f766e;color:#fff;font:600 11px system-ui,sans-serif;
    line-height:${ICON_SIZE}px;text-align:center;box-shadow:0 1px 3px rgb(0 0 0/.3)
  `;
  button.textContent = "p";

  const frame = document.createElement("iframe");
  frame.style.cssText = `
    position:fixed;border:0;display:none;z-index:${Z};color-scheme:normal;
    background:transparent
  `;
  frame.setAttribute("allowtransparency", "true");

  root.append(button, frame);
  document.documentElement.append(host);

  let anchor: HTMLInputElement | null = null;
  let open = false;

  function place() {
    if (!anchor?.isConnected) return hide(true);

    const field = box(anchor);
    if (!isDecoratable(field, viewport())) {
      button.style.display = "none";
      if (open) hide();
      return;
    }

    const icon = iconPosition(field);
    button.style.display = "block";
    button.style.top = `${icon.top}px`;
    button.style.left = `${icon.left}px`;

    if (open) {
      const list = listPosition(field, viewport(), LIST_HEIGHT);
      frame.style.top = `${list.top}px`;
      frame.style.left = `${list.left}px`;
      frame.style.width = `${list.width}px`;
      frame.style.height = `${LIST_HEIGHT}px`;
    }
  }

  function show() {
    if (open) return;
    open = true;
    // Rebuilt each time so the list is current: a vault that locked, or an item
    // added since, must not be served from a stale frame.
    frame.src = chrome.runtime.getURL(
      `suggestions.html?u=${encodeURIComponent(window.location.href)}`,
    );
    frame.style.display = "block";
    place();
  }

  function hide(alsoButton = false) {
    open = false;
    frame.style.display = "none";
    frame.removeAttribute("src");
    if (alsoButton) {
      button.style.display = "none";
      anchor = null;
    }
  }

  button.addEventListener("mousedown", (e) => {
    // mousedown, not click: the field is about to lose focus and some pages
    // tear their form down on blur.
    e.preventDefault();
    e.stopPropagation();
    if (open) hide();
    else show();
  });

  /** Re-scans the page and attaches to the login field, if there is one. */
  function scan() {
    const fields = findLoginFields(document);
    const next = fields.password ?? fields.username;
    if (next === anchor) return place();

    anchor = next;
    if (!anchor) return hide(true);
    hide();
    place();
  }

  const onScroll = () => place();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") hide();
  };
  const onClickAway = (e: MouseEvent) => {
    if (open && e.target !== host) hide();
  };

  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("mousedown", onClickAway, true);

  // Every SPA login page swaps its form in after load, so a single scan at
  // document_idle finds nothing on a large share of real sites.
  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scan();

  return {
    /** Called after a fill lands, and when the vault locks. */
    close: () => hide(),
    destroy() {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onClickAway, true);
      host.remove();
    },
  };
}
