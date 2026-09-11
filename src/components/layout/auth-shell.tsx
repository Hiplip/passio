/**
 * The frame for every screen shown before the vault is open.
 *
 * `vault-locked` neutralises the accent token, so these screens render
 * monochrome. Colour returns only once the vault is actually unlocked, which
 * makes the accent a report of state rather than decoration.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="vault-locked flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[26rem]">
        <p className="mb-8 text-sm font-medium tracking-tight text-[var(--muted)]">
          passio
        </p>
        {children}
      </div>
    </div>
  );
}
