"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="p-8 font-sans">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <pre className="mt-2 max-w-3xl whitespace-pre-wrap text-red-600 dark:text-red-400">
            {error.message}
          </pre>
          {error.stack && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400">Stack trace</summary>
              <pre className="mt-1 whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-400">
                {error.stack}
              </pre>
            </details>
          )}
          <button
            onClick={() => reset()}
            className="mt-4 cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
