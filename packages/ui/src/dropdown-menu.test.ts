import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DropdownMenuGroupLabel, DropdownMenuLabel } from "./dropdown-menu";

/**
 * A heading in a menu must not be able to take a page down with it.
 *
 * `DropdownMenuLabel` used to render Base UI's `Menu.GroupLabel`, which calls
 * `useMenuGroupRootContext()` and THROWS when there is no `<Menu.Group>` above
 * it. A throw during render unmounts the tree, so the symptom was the whole
 * extension popup going blank with nothing on screen to say why - and neither
 * the type nor the name gave any hint the constraint existed. It shipped.
 *
 * These run on the `node` environment: no DOM is needed to prove which of the
 * two throws, because the throw happens during render.
 */
describe("DropdownMenuLabel", () => {
  it("renders outside a menu instead of throwing", () => {
    const markup = renderToStaticMarkup(
      createElement(DropdownMenuLabel, null, "Folders"),
    );
    expect(markup).toContain("Folders");
  });

  it("carries the slot the styles hang off", () => {
    const markup = renderToStaticMarkup(
      createElement(DropdownMenuLabel, null, "Folders"),
    );
    expect(markup).toContain('data-slot="dropdown-menu-label"');
  });

  it("keeps a caller's className", () => {
    const markup = renderToStaticMarkup(
      createElement(DropdownMenuLabel, { className: "text-[11px]" }, "Folders"),
    );
    expect(markup).toContain("text-[11px]");
  });
});

describe("DropdownMenuGroupLabel", () => {
  it("still refuses to render outside a group", () => {
    // Not a defect - it is the Base UI part, and its whole job is to label the
    // group it is inside. The name is what changed, so the requirement is
    // visible at the call site rather than at runtime in a blank window.
    expect(() =>
      renderToStaticMarkup(createElement(DropdownMenuGroupLabel, null, "Folders")),
    ).toThrow(/MenuGroupContext|Menu\.Group/);
  });
});
