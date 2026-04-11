"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme/theme-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  Users,
  Bot,
  Code,
  BarChart3,
  BookOpen,
  CreditCard,
  Settings,
  Sparkles,
  Terminal,
  GitPullRequest,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Globe,
} from "lucide-react";

const NAV_KEYS = [
  { key: "nav.copilotUsage", href: "/metrics", icon: BarChart3 },
  { key: "nav.codeGeneration", href: "/code-generation", icon: Code },
  { key: "nav.pullRequests", href: "/pull-requests", icon: GitPullRequest },
  { key: "nav.agentImpact", href: "/agents", icon: Bot },
  { key: "nav.cliImpact", href: "/cli", icon: Terminal },
  { key: "nav.copilotLicensing", href: "/seats", icon: CreditCard },
  { key: "nav.premiumRequests", href: "/premium-requests", icon: Sparkles },
  { key: "nav.usersData", href: "/users", icon: Users },
  { key: "nav.metricsReference", href: "/reference", icon: BookOpen },
];

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale, locales } = useTranslation();

  const cycleTheme = () => {
    const order: Array<"system" | "light" | "dark"> = ["system", "light", "dark"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <aside className="flex h-full w-60 flex-col border-e border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <Link href="/" className="flex h-14 items-center gap-2.5 border-b border-gray-200 px-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700">
        <Image src="/favicon.ico" alt="" width={24} height={24} />
        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("common.copilotInsights")}
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV_KEYS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t(item.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-gray-200 px-2 py-3 dark:border-gray-700">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <Settings className="h-4 w-4" />
          {t("common.settings")}
        </Link>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem("dashboard_authenticated");
            window.location.reload();
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <LogOut className="h-4 w-4" />
          {t("common.signOut")}
        </button>
        {/* Theme + Language toggles */}
        <div className="mt-2 flex items-center gap-1 px-3">
          <button
            type="button"
            onClick={cycleTheme}
            title={`${t("theme.label")}: ${t(`theme.${theme}`)}`}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <ThemeIcon className="h-3.5 w-3.5" />
            <span>{t(`theme.${theme}`)}</span>
          </button>
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              onClick={(e) => {
                const menu = e.currentTarget.nextElementSibling;
                if (menu) menu.classList.toggle("hidden");
              }}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{locale.toUpperCase()}</span>
            </button>
            <div className="absolute bottom-full start-0 z-50 mb-1 hidden min-w-[120px] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-700">
              {locales.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={(e) => {
                    setLocale(l.code);
                    const menu = e.currentTarget.parentElement;
                    if (menu) menu.classList.add("hidden");
                  }}
                  className={cn(
                    "block w-full px-3 py-1.5 text-start text-xs hover:bg-gray-50 dark:hover:bg-gray-600",
                    locale === l.code
                      ? "font-medium text-blue-700 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-300"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2 px-3 text-xs text-gray-400 dark:text-gray-500">
          v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}
          <span className="mx-1">·</span>
          {process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}
          <span className="mx-1">·</span>
          {process.env.NEXT_PUBLIC_BUILD_TIME
            ? new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toISOString().split("T")[0]
            : "local"}
        </div>
      </div>
    </aside>
  );
}
