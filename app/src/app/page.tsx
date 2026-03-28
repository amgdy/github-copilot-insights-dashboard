import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  Bot,
  CreditCard,
  Sparkles,
  Users,
  Cpu,
  ArrowRight,
  Code,
  Terminal,
} from "lucide-react";

const sections = [
  {
    title: "Copilot Usage",
    description:
      "Track daily and weekly active users, code completions, chat requests, and model usage trends over time.",
    href: "/metrics",
    icon: BarChart3,
    color: "text-blue-600 bg-blue-50",
  },
  {
    title: "Code Generation",
    description:
      "Analyze lines of code added and deleted across modes, models, and languages with user vs agent breakdown.",
    href: "/code-generation",
    icon: Code,
    color: "text-slate-600 bg-slate-50",
  },
  {
    title: "Agent Impact",
    description:
      "Measure the adoption and productivity impact of Copilot agents across your organization.",
    href: "/agents",
    icon: Bot,
    color: "text-purple-600 bg-purple-50",
  },
  {
    title: "CLI Impact",
    description:
      "Track GitHub Copilot CLI adoption, session and request volumes, token consumption, and version distribution.",
    href: "/cli",
    icon: Terminal,
    color: "text-teal-600 bg-teal-50",
  },
  {
    title: "Copilot Licensing",
    description:
      "View seat assignments, license utilization, and plan distribution for your enterprise.",
    href: "/seats",
    icon: CreditCard,
    color: "text-green-600 bg-green-50",
  },
  {
    title: "Premium Requests",
    description:
      "Monitor premium model request consumption and spending across users and teams.",
    href: "/premium-requests",
    icon: Sparkles,
    color: "text-amber-600 bg-amber-50",
  },
  {
    title: "Users",
    description:
      "Explore individual user activity, engagement patterns, and feature adoption.",
    href: "/users",
    icon: Users,
    color: "text-indigo-600 bg-indigo-50",
  },
  {
    title: "Models",
    description:
      "See which AI models are enabled, their usage volume, and feature breakdown.",
    href: "/models",
    icon: Cpu,
    color: "text-pink-600 bg-pink-50",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 py-8">
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
        <h1 className="text-3xl font-bold text-gray-900">
          GitHub Copilot Insights
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600">
          A centralized analytics dashboard for enterprise GitHub Copilot
          adoption. Visualize usage metrics, license allocation, premium request
          consumption, and AI model activity &mdash; all sourced from the GitHub
          Copilot Usage Metrics API.
        </p>
        <Link
          href="/metrics"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700"
        >
          View Copilot Usage
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
              className="group rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div
                className={`mb-3 inline-flex rounded-lg p-2.5 ${s.color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600">
                {s.title}
              </h2>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                {s.description}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Data source note */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-center text-sm text-blue-800">
        <p className="font-medium">Powered by the GitHub Copilot Usage Metrics API</p>
        <p className="mt-1 text-xs text-blue-600">
          Data is synced periodically from your GitHub enterprise. Configure the
          sync schedule and API token in{" "}
          <Link href="/settings" className="underline hover:text-blue-800">
            Settings
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
