import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Semantic colors for dashboard
        growth: { DEFAULT: "#22c55e", light: "#dcfce7" },
        decline: { DEFAULT: "#ef4444", light: "#fee2e2" },
        attention: { DEFAULT: "#f59e0b", light: "#fef3c7" },
        neutral: { DEFAULT: "#3b82f6", light: "#dbeafe" },
      },
    },
  },
  plugins: [],
};

export default config;
