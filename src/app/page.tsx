import Link from "next/link";

// Replaced in Task 1.18 with real routing by auth/lock state.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">passio</h1>
      <p className="text-sm opacity-70">A zero-knowledge password manager.</p>
      <div className="flex gap-4">
        <Link className="underline" href="/signup">
          Create account
        </Link>
        <Link className="underline" href="/login">
          Log in
        </Link>
      </div>
    </main>
  );
}
