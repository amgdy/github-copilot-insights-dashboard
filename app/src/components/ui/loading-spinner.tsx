"use client";

/**
 * Animated SVG loading spinner with optional message.
 * Uses a pulsating Copilot-style icon with a rotating ring.
 */
export function LoadingSpinner({
  message = "Loading…",
  size = "md",
}: {
  message?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dimensions = { sm: "h-32", md: "h-64", lg: "h-96" };
  const svgSize = { sm: 40, md: 56, lg: 72 };
  const textSize = { sm: "text-xs", md: "text-sm", lg: "text-base" };

  const s = svgSize[size];

  return (
    <div className={`flex ${dimensions[size]} items-center justify-center`}>
      <div className="flex flex-col items-center gap-3">
        <svg
          width={s}
          height={s}
          viewBox="0 0 56 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="animate-pulse"
        >
          {/* Outer rotating ring */}
          <circle
            cx="28"
            cy="28"
            r="24"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="100 50"
            className="text-blue-200"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 28 28"
              to="360 28 28"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Inner spinning arc */}
          <circle
            cx="28"
            cy="28"
            r="24"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="40 110"
            strokeLinecap="round"
            className="text-blue-600"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 28 28"
              to="360 28 28"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Center icon — simplified chart/analytics symbol */}
          <g className="text-blue-600" fill="currentColor">
            <rect x="18" y="30" width="4" height="8" rx="1" opacity="0.6">
              <animate attributeName="height" values="8;12;8" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="y" values="30;26;30" dur="1.2s" repeatCount="indefinite" />
            </rect>
            <rect x="26" y="22" width="4" height="16" rx="1" opacity="0.8">
              <animate attributeName="height" values="16;10;16" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
              <animate attributeName="y" values="22;28;22" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
            </rect>
            <rect x="34" y="26" width="4" height="12" rx="1">
              <animate attributeName="height" values="12;16;12" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
              <animate attributeName="y" values="26;22;26" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
            </rect>
          </g>
        </svg>
        <span className={`${textSize[size]} text-gray-400 dark:text-gray-500`}>{message}</span>
      </div>
    </div>
  );
}
