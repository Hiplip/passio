import { findSuggestableFields } from "../fields";
import {
  ICON_SIZE,
  iconPosition,
  isDecoratable,
  listPosition,
  type Box,
} from "./anchor";

const LIST_HEIGHT = 232;
/** Above almost everything. Sites use z-indexes in the millions; this has to
 *  win or the button is invisible on them. */
const Z = 2147483000;

function box(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * The in-page half of the suggestion overlay.
 *
 * Everything it adds is `position: fixed` inside its own container, never a
 * child of the page's form. Injecting into someone else's layout breaks on any
 * site with a transformed ancestor, `overflow: hidden`, or its own absolutely
 * positioned decorations - which is most of them.
 *
 * The buttons live in a closed shadow root so page CSS cannot restyle them. The
 * list lives in an iframe on the extension's origin, because page script can
 * walk a shadow root but cannot read across an origin.
 */
export function createOverlay() {
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0";
  const root = host.attachShadow({ mode: "closed" });

  const frame = document.createElement("iframe");
  frame.style.cssText =
    `position:fixed;border:0;display:none;z-index:${Z};background:transparent`;
  root.append(frame);
  document.documentElement.append(host);

  /** One button per decorated field. Bitwarden decorates the username field as
   *  well as the password field, and on a two-step login the username field is
   *  the only one there is. */
  const buttons = new Map<HTMLInputElement, HTMLButtonElement>();
  let anchored: HTMLInputElement | null = null;

  function makeButton(field: HTMLInputElement): HTMLButtonElement {
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
    button.addEventListener("mousedown", (e) => {
      // mousedown, not click: the field is about to lose focus and some pages
      // tear their form down on blur.
      e.preventDefault();
      e.stopPropagation();
      if (anchored === field) hide();
      else show(field);
    });
    root.append(button);
    return button;
  }

  function place() {
    for (const [field, button] of buttons) {
      if (!field.isConnected) {
        button.remove();
        buttons.delete(field);
        if (anchored === field) hide();
        continue;
      }

      const rect = box(field);
      if (!isDecoratable(rect, viewport())) {
        button.style.display = "none";
        if (anchored === field) hide();
        continue;
      }

      const icon = iconPosition(rect);
      button.style.display = "block";
      button.style.top = `${icon.top}px`;
      button.style.left = `${icon.left}px`;
    }

    if (anchored?.isConnected) {
      const list = listPosition(box(anchored), viewport(), LIST_HEIGHT);
      frame.style.top = `${list.top}px`;
      frame.style.left = `${list.left}px`;
      frame.style.width = `${list.width}px`;
      frame.style.height = `${LIST_HEIGHT}px`;
    }
  }

  function show(field: HTMLInputElement) {
    if (anchored === field) return;
    anchored = field;
    // Rebuilt each time so the list is current: a vault that locked, or an item
    // added since, must not be served from a stale frame.
    frame.src = chrome.runtime.getURL(
      `suggestions.html?u=${encodeURIComponent(window.location.href)}`,
    );
    frame.style.display = "block";
    place();
  }

  function hide() {
    anchored = null;
    frame.style.display = "none";
    frame.removeAttribute("src");
  }

  function scan() {
    const { username, password } = findSuggestableFields(document);
    const wanted = [username, password].filter((f): f is HTMLInputElement => f !== null);

    for (const [field, button] of buttons) {
      if (!wanted.includes(field)) {
        button.remove();
        buttons.delete(field);
        if (anchored === field) hide();
      }
    }
    for (const field of wanted) {
      if (!buttons.has(field)) buttons.set(field, makeButton(field));
    }

    place();
  }

  // Focusing a decorated field opens the list. This is Bitwarden's default -
  // its "Display suggestions when icon is selected" option is OFF out of the
  // box - and it is the behaviour that makes the feature feel like part of the
  // browser rather than something you have to go and click.
  const onFocus = (e: FocusEvent) => {
    const field = e.target;
    if (field instanceof HTMLInputElement && buttons.has(field)) show(field);
  };

  const onScroll = () => place();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") hide();
  };
  const onClickAway = (e: MouseEvent) => {
    if (anchored && e.target !== host && e.target !== anchored) hide();
  };

  window.addEventListener("focusin", onFocus, true);
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
    close: hide,
    destroy() {
      observer.disconnect();
      window.removeEventListener("focusin", onFocus, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onClickAway, true);
      host.remove();
    },
  };
}
