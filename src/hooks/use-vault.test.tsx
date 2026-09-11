// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { generateVaultKey } from "~/lib/crypto";

import { useVault, VaultProvider } from "./use-vault";

let key: CryptoKey;
beforeAll(async () => {
  key = await generateVaultKey();
});

function Probe() {
  const { vaultKey, isUnlocked, unlock, lock } = useVault();
  return (
    <div>
      <span data-testid="state">{isUnlocked ? "unlocked" : "locked"}</span>
      <span data-testid="has-key">{vaultKey ? "yes" : "no"}</span>
      <button onClick={() => unlock(key)}>unlock</button>
      <button onClick={lock}>lock</button>
    </div>
  );
}

function setup() {
  render(
    <VaultProvider>
      <Probe />
    </VaultProvider>,
  );
}

function click(label: string) {
  act(() => {
    screen.getByText(label).click();
  });
}

describe("VaultProvider", () => {
  it("starts locked", () => {
    setup();
    expect(screen.getByTestId("state")).toHaveTextContent("locked");
    expect(screen.getByTestId("has-key")).toHaveTextContent("no");
  });

  it("holds the key after unlock", () => {
    setup();
    click("unlock");

    expect(screen.getByTestId("state")).toHaveTextContent("unlocked");
    expect(screen.getByTestId("has-key")).toHaveTextContent("yes");
  });

  it("drops the key on lock", () => {
    setup();
    click("unlock");
    click("lock");

    expect(screen.getByTestId("state")).toHaveTextContent("locked");
    expect(screen.getByTestId("has-key")).toHaveTextContent("no");
  });

  it("never writes anything to persistent storage", () => {
    setup();
    click("unlock");

    // The vault key must live in memory only. A reload re-locks by design.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  it("throws when used outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(/VaultProvider/);
  });
});
