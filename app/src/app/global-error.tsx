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
      <body>
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h2>Something went wrong</h2>
          <pre style={{ color: "red", whiteSpace: "pre-wrap", maxWidth: "800px" }}>
            {error.message}
          </pre>
          {error.stack && (
            <details>
              <summary>Stack trace</summary>
              <pre style={{ fontSize: "12px", whiteSpace: "pre-wrap" }}>
                {error.stack}
              </pre>
            </details>
          )}
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
