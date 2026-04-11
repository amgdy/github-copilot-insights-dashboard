"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";

interface ConfigStatus {
  tokenConfigured: boolean;
  slugConfigured: boolean;
}

export function ConfigurationBanner() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ConfigStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.settings) {
          setStatus({
            tokenConfigured: data.settings.github_token?.configured ?? false,
            slugConfigured: data.settings.github_enterprise_slug?.configured ?? false,
          });
        }
      })
      .catch(() => {
        /* silently ignore — banner just won't show */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || (status.tokenConfigured && status.slugConfigured)) {
    return null;
  }

  const missingToken = !status.tokenConfigured;
  const missingSlug = !status.slugConfigured;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-900/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t("configBanner.title")}
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            {missingToken && missingSlug
              ? t("configBanner.missingBoth")
              : missingToken
                ? t("configBanner.missingToken")
                : t("configBanner.missingSlug")}
          </p>
          <Link
            href="/settings"
            className="mt-2 inline-flex items-center text-sm font-medium text-amber-800 underline hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
          >
            {t("configBanner.goToSettings")}
          </Link>
        </div>
      </div>
    </div>
  );
}
