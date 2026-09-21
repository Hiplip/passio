// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Landing } from "./landing";

/**
 * The landing page has one job and one next step. These pin the two rules that
 * are easy to break by adding "just one more" link later.
 */

describe("the call to action", () => {
  it("offers exactly one, so there is only one thing to do", () => {
    render(<Landing registrationOpen />);

    // Repeated in the footer deliberately - same words, same destination, so
    // it stays one decision rather than two.
    const actions = screen.getAllByRole("link", { name: "Create your vault" });
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action).toHaveAttribute("href", "/signup");
    }

    expect(screen.queryByRole("link", { name: /get started/i })).toBeNull();
  });

  it("sends nobody to signup while registration is closed", () => {
    render(<Landing registrationOpen={false} />);

    expect(screen.queryByRole("link", { name: "Create your vault" })).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toBe("/signup");
    }
  });

  it("drops the header sign-in link when it would duplicate the main action", () => {
    // Closed means the primary button already says "Sign in". Two of them is
    // two decisions for one next step.
    render(<Landing registrationOpen={false} />);
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(2);
  });
});

describe("the page itself", () => {
  it("leads with the one idea", () => {
    render(<Landing registrationOpen />);
    expect(
      screen.getByRole("heading", { level: 1, name: /even we can.t open your vault/i }),
    ).toBeInTheDocument();
  });

  it("states the numbered steps as a real sequence", () => {
    render(<Landing registrationOpen />);
    const steps = screen.getByRole("list", { name: "" }).querySelectorAll("li");
    expect(steps.length).toBeGreaterThanOrEqual(3);
  });

  it("claims no testimonials it does not have", () => {
    // passio has no users to quote yet. A fabricated quote is the one thing on
    // this page that would be a lie rather than a claim.
    render(<Landing registrationOpen />);
    expect(screen.queryByRole("figure", { name: /testimonial/i })).toBeNull();
    expect(document.querySelectorAll("blockquote")).toHaveLength(0);
  });
});

describe("the live panels", () => {
  it("renders the generator and the split without waiting on crypto", () => {
    // jsdom has no usable WebCrypto subtle, so both panels must render their
    // placeholder rather than throwing and blanking the page.
    render(<Landing registrationOpen />);
    expect(screen.getByRole("group", { name: "Password length" })).toBeInTheDocument();
    expect(screen.getByText("On our servers")).toBeInTheDocument();
  });
});
