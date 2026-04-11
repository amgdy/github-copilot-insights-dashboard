"use client";

import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  Bot,
  CreditCard,
  GitPullRequest,
  Sparkles,
  Users,
  ArrowRight,
  Code,
  Terminal,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { ConfigurationBanner } from "@/components/layout/configuration-banner";

export default function LandingPage() {
  const { t } = useTranslation();

  const sections = [
    {
      title: t("landing.copilotUsage"),
      description: t("landing.copilotUsageDesc"),
      href: "/metrics",
      icon: BarChart3,
      color: "text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400",
    },
    {
      title: t("landing.codeGeneration"),
      description: t("landing.codeGenerationDesc"),
      href: "/code-generation",
      icon: Code,
      color: "text-slate-600 bg-slate-50 dark:bg-slate-900/30 dark:text-slate-400",
    },
    {
      title: t("landing.pullRequests"),
      description: t("landing.pullRequestsDesc"),
      href: "/pull-requests",
      icon: GitPullRequest,
      color: "text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400",
    },
    {
      title: t("landing.agentImpact"),
      description: t("landing.agentImpactDesc"),
      href: "/agents",
      icon: Bot,
      color: "text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400",
    },
    {
      title: t("landing.cliImpact"),
      description: t("landing.cliImpactDesc"),
      href: "/cli",
      icon: Terminal,
      color: "text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400",
    },
    {
      title: t("landing.copilotLicensing"),
      description: t("landing.copilotLicensingDesc"),
      href: "/seats",
      icon: CreditCard,
      color: "text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400",
    },
    {
      title: t("landing.premiumRequests"),
      description: t("landing.premiumRequestsDesc"),
      href: "/premium-requests",
      icon: Sparkles,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400",
    },
    {
      title: t("landing.usersTitle"),
      description: t("landing.usersDesc"),
      href: "/users",
      icon: Users,
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10 py-8">
      <ConfigurationBanner />
      {/* Hero */}
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <Image
            src="/copilot-icon.svg"
            alt="GitHub Copilot"
            width={72}
            height={72}
            priority
          />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          {t("landing.title")}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600 dark:text-gray-400">
          {t("landing.subtitle")}
        </p>
        <Link
          href="/metrics"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700"
        >
          {t("landing.viewCopilotUsage")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Section Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <div
                className={`mb-3 inline-flex rounded-lg p-2.5 ${s.color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
                {s.title}
              </h2>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
                {s.description}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Data source note */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-center text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        <p className="font-medium">{t("landing.poweredBy")}</p>
        <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
          Data is synced periodically from your GitHub enterprise. Configure the
          sync schedule and API token in{" "}
          <Link href="/settings" className="underline hover:text-blue-800 dark:hover:text-blue-300">
            Settings
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
