"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, X } from "lucide-react";

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  label?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "All",
  label,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = options.filter((o) =>
    !search || o.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = useCallback(
    (item: string) => {
      onChange(
        selected.includes(item)
          ? selected.filter((s) => s !== item)
          : [...selected, item]
      );
    },
    [selected, onChange]
  );

  const selectAll = useCallback(() => onChange([]), [onChange]);

  const displayText =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      {label && (
        <span className="mr-1.5 text-xs text-gray-500 dark:text-gray-400">{label}</span>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 shadow-xs hover:bg-gray-50 focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <span className="max-w-[160px] truncate">{displayText}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={selectAll}
          className="ml-1 inline-flex items-center rounded-full p-0.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          title="Clear filter"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          <div className="border-b border-gray-100 p-2 dark:border-gray-700">
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-sm border border-gray-200 px-2.5 py-1.5 text-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              autoFocus
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={selectAll}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  selected.length === 0
                    ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                All
              </button>
            </li>
            {filtered.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 truncate dark:hover:bg-gray-700 ${
                    selected.includes(item)
                      ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span className="mr-2 inline-block w-3.5 text-center">
                    {selected.includes(item) ? "✓" : ""}
                  </span>
                  {item}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
