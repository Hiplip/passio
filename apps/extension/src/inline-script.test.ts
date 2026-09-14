import { describe, expect, it } from "vitest";

import type { PermissionApi } from "./inline-permission";
import {
  INLINE_SCRIPT_ID,
  syncInlineScript,
  type ScriptingApi,
} from "./inline-script";

function fakes(granted: boolean, alreadyRegistered = false) {
  const registered = new Set(alreadyRegistered ? [INLINE_SCRIPT_ID] : []);
  const actions: string[] = [];

  const scripting: ScriptingApi = {
    getRegisteredContentScripts: () =>
      Promise.resolve([...registered].map((id) => ({ id }))),
    registerContentScripts: (scripts) => {
      actions.push("register");
      for (const s of scripts) registered.add(s.id);
      return Promise.resolve();
    },
    unregisterContentScripts: ({ ids }) => {
      actions.push("unregister");
      for (const id of ids) registered.delete(id);
      return Promise.resolve();
    },
  };

  const permissions: PermissionApi = {
    contains: () => Promise.resolve(granted),
    request: () => Promise.resolve(true),
    remove: () => Promise.resolve(true),
  };

  return { scripting, permissions, registered, actions };
}

describe("syncInlineScript", () => {
  it("registers once access is granted", async () => {
    const { scripting, permissions, registered } = fakes(true);
    expect(await syncInlineScript(scripting, permissions)).toBe(true);
    expect([...registered]).toEqual([INLINE_SCRIPT_ID]);
  });

  it("registers nothing without access", async () => {
    // The whole point of the opt-in: a default install runs no script on any
    // page, so there is nothing to have a bug in.
    const { scripting, permissions, registered } = fakes(false);
    expect(await syncInlineScript(scripting, permissions)).toBe(false);
    expect([...registered]).toEqual([]);
  });

  it("unregisters when access is taken away", async () => {
    // Revoking in chrome://extensions fires the permission listener, which
    // calls this. Without it the script keeps running until a reload.
    const { scripting, permissions, registered } = fakes(false, true);
    await syncInlineScript(scripting, permissions);
    expect([...registered]).toEqual([]);
  });

  it("is idempotent when already correct", async () => {
    const granted = fakes(true, true);
    await syncInlineScript(granted.scripting, granted.permissions);
    expect(granted.actions).toEqual([]);

    const denied = fakes(false, false);
    await syncInlineScript(denied.scripting, denied.permissions);
    expect(denied.actions).toEqual([]);
  });

  it("registers only on http and https, top frame only", async () => {
    const seen: chrome.scripting.RegisteredContentScript[] = [];
    const { permissions } = fakes(true);
    const scripting: ScriptingApi = {
      getRegisteredContentScripts: () => Promise.resolve([]),
      registerContentScripts: (scripts) => {
        seen.push(...scripts);
        return Promise.resolve();
      },
      unregisterContentScripts: () => Promise.resolve(),
    };

    await syncInlineScript(scripting, permissions);

    expect(seen[0]!.matches).toEqual(["http://*/*", "https://*/*"]);
    // Cross-origin iframe filling is out of scope, and a login form inside
    // someone else's frame is where getting it wrong would be worst.
    expect(seen[0]!.allFrames).toBe(false);
  });
});
