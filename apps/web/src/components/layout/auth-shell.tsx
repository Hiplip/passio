import { Wordmark } from "@passio/ui/wordmark";

/**
 * The frame for every screen shown before the vault is open.
 *
 * One centred column on the bare page ground - no gradient wash behind it, and
 * no card around the wordmark. These screens are the first thing a new user
 * sees and the thing an existing one sees every morning, so they are built to
 * be quiet: the form is the only object on the page.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[26rem]">
        <Wordmark size="md" className="mb-9" />
        {children}
      </div>

      <p className="text-muted-foreground mt-10 max-w-[26rem] text-center text-xs leading-relaxed">
        Your master password never leaves this device, and neither does the key it
        derives.
      </p>
    </div>
  );
}
