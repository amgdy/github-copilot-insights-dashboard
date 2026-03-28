"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Users,
  Bot,
  Code,
  BarChart3,
  BookOpen,
  CreditCard,
  Settings,
  Cpu,
  Sparkles,
  Terminal,
} from "lucide-react";

const navItems = [
  { label: "Copilot Usage", href: "/metrics", icon: BarChart3 },
  { label: "Code Generation", href: "/code-generation", icon: Code },
  { label: "Agent Impact", href: "/agents", icon: Bot },
  { label: "CLI Impact", href: "/cli", icon: Terminal },
  { label: "Copilot Licensing", href: "/seats", icon: CreditCard },
  { label: "Premium Requests", href: "/premium-requests", icon: Sparkles },
  { label: "Users Data", href: "/users", icon: Users },
  { label: "Models", href: "/models", icon: Cpu },
  { label: "Metrics Reference", href: "/reference", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white">
      <Link href="/" className="flex h-14 items-center gap-2.5 border-b border-gray-200 px-4 hover:bg-gray-50 transition-colors">
        <Image src="/favicon.ico" alt="" width={24} height={24} />
        <span className="text-lg font-semibold text-gray-900">
          Copilot Insights
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
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
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-gray-200 px-2 py-3">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <div className="mt-2 px-3 text-xs text-gray-400">
          v{process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}
          <span className="mx-1">·</span>
          {process.env.NEXT_PUBLIC_BUILD_TIME
            ? new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toISOString().split("T")[0]
            : "local"}
        </div>
      </div>
    </aside>
  );
}
