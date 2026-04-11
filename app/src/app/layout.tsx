import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { AuthGate } from "@/components/auth/auth-gate";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitHub Copilot Insights",
  description:
    "Enterprise analytics dashboard for GitHub Copilot usage and impact",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 text-gray-900 antialiased dark:bg-gray-900 dark:text-gray-100">
        <ThemeProvider>
          <LocaleProvider>
            <AuthGate>
              <div className="flex h-screen">
                <Sidebar />
                <main className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6">{children}</div>
                </main>
              </div>
            </AuthGate>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
