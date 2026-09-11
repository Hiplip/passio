# passio

password manager similar to 1pass or bitwarden - support totp

The global CLAUDE.md already defines the stack, the gates, and the deploy rules.
This file adds only what is specific to this project.

## Design constraints

These apply when designing or planning, before any code exists.

- Every phase of the implementation plan merges to main and deploys live. Each phase
  must leave the app in a working, shippable state on its own.
- Phases are vertical slices, not layers. "Signup works end to end" is a phase.
  "All the database schemas" is not — it deploys nothing a user can reach.
- Target 4 to 8 phases. Fewer and larger beats many and small.
- Each phase names the route or flow that proves it works, so the smoke check
  can cover it.
- This is built unattended by an agent with no one to ask. Ambiguity becomes a guess
  that ships. Prefer over-specification to elegance.
- No phase may depend on work from a later phase.

## Codebase facts

<empty until phase 1 — the agent fills this in with the real package.json scripts,
key file paths, migration commands, and the routes the smoke check covers>
