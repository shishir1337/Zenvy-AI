import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight">
          Zenvy AI
        </h1>
        <p className="mb-8 text-lg text-muted-foreground">
          End-to-end AI-powered automation platform for F-Commerce businesses.
          Manage products, orders, conversations, and more — all from one place.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Get Started
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
