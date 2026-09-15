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

  /**
   * The passio mark, as it appears on other people's pages.
   *
   * The dial, reversed out of a filled disc. Filled rather than the bare ring
   * used everywhere else, because this is the one instance that lands on a
   * background nobody controls - an input can be white, grey, or near-black,
   * and only a solid shape guarantees it is visible on all three.
   *
   * Every value is literal and the geometry is paths only. This element lives
   * in a closed shadow root inside a page we do not control, so it inherits
   * nothing - not our stylesheet, not our tokens, not a font - and an `id` on
   * a mask or a clip path could collide with one belonging to the page.
   */
  const INK = "#221f2b";
  const IRIS = "#6355d6";

  const DIAL = [
    `<svg viewBox="0 0 100 100" width="13" height="13" fill="#fff" aria-hidden="true">`,
    ...[0, 90, 180, 270].map(
      (a) =>
        `<path d="M78 86.49A46 46 0 0 1 22 86.49L31.74 73.8A30 30 0 0 0 68.26 73.8Z"` +
        ` transform="rotate(${a} 50 50)"/>`,
    ),
    `<circle cx="50" cy="50" r="12"/>`,
    `</svg>`,
  ].join("");

  function makeButton(field: HTMLInputElement): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "passio suggestions");
    button.style.cssText = `
      position:fixed;width:${ICON_SIZE}px;height:${ICON_SIZE}px;padding:0;
      border:0;border-radius:50%;cursor:pointer;display:none;z-index:${Z};
      background:${INK};align-items:center;justify-content:center;
      box-shadow:0 1px 3px rgb(0 0 0/.22);transition:background .12s,transform .12s
    `;
    button.innerHTML = DIAL;
    button.addEventListener("mouseenter", () => {
      button.style.background = IRIS;
      button.style.transform = "scale(1.08)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = INK;
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
