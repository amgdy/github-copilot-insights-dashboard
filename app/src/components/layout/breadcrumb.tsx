import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BreadcrumbItem } from "@/types/filters";

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {items.map((item, i) => (
        <span key={item.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />}
          {i === items.length - 1 ? (
            <span className="font-medium text-gray-900 dark:text-gray-100">{item.label}</span>
          ) : (
            <Link
              href={item.href}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {item.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
