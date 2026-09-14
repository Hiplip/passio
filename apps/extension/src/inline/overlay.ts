import { findSuggestableFields } from "../fields";
import {
  ICON_SIZE,
  iconPosition,
  isDecoratable,
  listHeight,
  listPosition,
  type Box,
} from "./anchor";
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
  /** The iframe's real height, reported by the iframe once it has rendered.
   *  Until then `listHeight` supplies an estimate purely to avoid a flash at
   *  the wrong size. */
  let measured = 0;

  /** The passio key mark. Inline SVG rather than a letter: at 20px a glyph reads
   *  as an affordance and a character reads as a typo in the field. */
  const KEY_SVG =
    `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"` +
    ` stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M2.6 10.6a6 6 0 1 0 8.8-8.8 6 6 0 0 0-8.8 8.8Z" transform="translate(9.5 9.5) rotate(180)"/>` +
    `<path d="m10.5 13.5-8 8"/><path d="m6.5 17.5 2 2"/></svg>`;

  function makeButton(field: HTMLInputElement): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "passio suggestions");
    button.style.cssText = `
      position:fixed;width:${ICON_SIZE}px;height:${ICON_SIZE}px;padding:0;
      border:0;border-radius:6px;cursor:pointer;display:none;z-index:${Z};
      background:#0d9488;color:#fff;align-items:center;justify-content:center;
      box-shadow:0 1px 2px rgb(0 0 0/.25);transition:background .12s,transform .12s
    `;
    button.innerHTML = KEY_SVG;
    button.addEventListener("mouseenter", () => {
      button.style.background = "#14b8a6";
      button.style.transform = "scale(1.06)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "#0d9488";
      button.style.transform = "none";
    });
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
      button.style.display = "flex";
      button.style.top = `${icon.top}px`;
      button.style.left = `${icon.left}px`;
    }

    if (anchored?.isConnected) {
      const height = measured || listHeight(0);
      const list = listPosition(box(anchored), viewport(), height);
      frame.style.top = `${list.top}px`;
      frame.style.left = `${list.left}px`;
      frame.style.width = `${list.width}px`;
      frame.style.height = `${height}px`;
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
    measured = 0;
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
    /** The iframe measured itself; size it exactly and reposition, since a
     *  taller list may no longer fit below the field. */
    resize(height: number) {
      if (!anchored) return;
      measured = height;
      place();
    },
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
