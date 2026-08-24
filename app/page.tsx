import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50 px-6 text-center">
      <h1 className="text-xl font-medium text-stone-900">
        Express Your Surf — recorder prototype
      </h1>
      <p className="max-w-md text-sm text-stone-500">
        This is the first working piece of the real app: the review and
        recording tool. Nothing else (login, payments, submissions) is built
        yet — this page just proves the core tool works.
      </p>
      <Link
        href="/review"
        className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white"
      >
        Open the review tool
      </Link>
    </main>
  );
}
