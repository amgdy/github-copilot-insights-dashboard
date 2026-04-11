"use client";

import { useCallback, useState, useRef } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";

/**
 * Export the content of a referenced HTML element to a polished, executive-ready
 * PDF report.  Each chart or table section renders on its own landscape page.
 * Interactive UI elements (buttons, inputs, selects, dropdowns) are hidden.
 * The first page includes a branded text header with the report title, date
 * range and generation timestamp.
 */
export function PdfExportButton({
  targetRef,
  fileName = "report",
  label = "Export PDF",
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  fileName?: string;
  label?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const { t } = useTranslation();

  const handleExport = useCallback(async () => {
    if (!targetRef.current) return;
    setExporting(true);

    const widthOverrides: { el: HTMLElement; prev: string }[] = [];

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas-pro"),
      ]);

      const el = targetRef.current;
      const PAGE_W = 297; // A4 landscape width mm
      const PAGE_H = 210; // A4 landscape height mm
      const MARGIN = 12;
      const CONTENT_W = PAGE_W - 2 * MARGIN;

      // ── Extract report metadata ──
      const titleEl = el.querySelector("h1");
      const subtitleEl = titleEl?.parentElement?.querySelector("p");
      const reportTitle = titleEl?.textContent ?? fileName;
      const reportSubtitle = subtitleEl?.textContent ?? "";
      const generatedAt = new Date().toLocaleString("en-US", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });

      // ── Hide interactive / UI-only elements during capture via CSS class ──
      el.classList.add("pdf-capturing");

      await new Promise((r) => setTimeout(r, 200));

      // ── Collect sections (direct children of the report ref) ──
      const children = Array.from(el.children) as HTMLElement[];
      // First child is the header area (title + filters); skip it — we render text instead
      const headerChild = children[0];
      const sections = children.slice(1);

      const pdf = new jsPDF("l", "mm", "a4");

      // ── Render text header on page 1 ──
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.setTextColor(17, 24, 39); // gray-900
      pdf.text(reportTitle, MARGIN, MARGIN + 10);

      let headerY = MARGIN + 18;
      if (reportSubtitle) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(107, 114, 128); // gray-500
        pdf.text(reportSubtitle.replace(/\s—\s/, "  ·  "), MARGIN, headerY);
        headerY += 6;
      }
      pdf.setFontSize(9);
      pdf.setTextColor(156, 163, 175); // gray-400
      pdf.text(`Generated: ${generatedAt}`, MARGIN, headerY);
      headerY += 4;

      // Divider line
      pdf.setDrawColor(229, 231, 235); // gray-200
      pdf.setLineWidth(0.3);
      pdf.line(MARGIN, headerY, PAGE_W - MARGIN, headerY);
      headerY += 6;

      // ── Force tables to 100% width for capture ──
      el.querySelectorAll<HTMLElement>("table").forEach((tbl) => {
        widthOverrides.push({ el: tbl, prev: tbl.style.width });
        tbl.style.width = "100%";
      });
      // Also force table containers
      el.querySelectorAll<HTMLElement>(".overflow-x-auto, .overflow-auto").forEach((c) => {
        widthOverrides.push({ el: c, prev: c.style.width });
        c.style.width = "100%";
      });

      // ── Render each section on its own page (first section on page 1) ──
      let isFirstSection = true;
      for (const section of sections) {
        // Skip non-visible or empty elements
        if (section.offsetHeight === 0) continue;

        // Temporarily set section width to match container for full-width capture
        const prevWidth = section.style.width;
        const prevMinWidth = section.style.minWidth;
        section.style.width = `${el.clientWidth}px`;
        section.style.minWidth = `${el.clientWidth}px`;

        const canvas = await html2canvas(section, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: el.scrollWidth,
        });

        // Restore section width
        section.style.width = prevWidth;
        section.style.minWidth = prevMinWidth;

        // Skip blank pages — check if canvas has any non-white content
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          let isBlank = true;
          // Sample every 200th pixel for performance
          for (let i = 0; i < px.length; i += 200 * 4) {
            if (px[i] < 250 || px[i + 1] < 250 || px[i + 2] < 250) {
              isBlank = false;
              break;
            }
          }
          if (isBlank) continue;
        }

        const imgData = canvas.toDataURL("image/png");
        const imgW = CONTENT_W;
        const imgH = (canvas.height * imgW) / canvas.width;

        if (isFirstSection) {
          // Fit first section on page 1 below text header
          const availH = PAGE_H - headerY - MARGIN;
          if (imgH <= availH) {
            pdf.addImage(imgData, "PNG", MARGIN, headerY, imgW, imgH);
          } else {
            // Scale to fit available space
            const scale = availH / imgH;
            pdf.addImage(imgData, "PNG", MARGIN, headerY, imgW * scale, availH);
          }
          isFirstSection = false;
        } else {
          pdf.addPage();

          // Add small header on each page
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(156, 163, 175);
          pdf.text(reportTitle, MARGIN, MARGIN + 4);
          pdf.setDrawColor(243, 244, 246); // gray-100
          pdf.setLineWidth(0.2);
          pdf.line(MARGIN, MARGIN + 6, PAGE_W - MARGIN, MARGIN + 6);

          const contentY = MARGIN + 10;
          const availH = PAGE_H - contentY - MARGIN;
          if (imgH <= availH) {
            pdf.addImage(imgData, "PNG", MARGIN, contentY, imgW, imgH);
          } else {
            // Scale to fit
            const scale = availH / imgH;
            pdf.addImage(imgData, "PNG", MARGIN, contentY, imgW * scale, availH);
          }
        }
      }

      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      // ── Restore hidden elements (always, even on error) ──
      if (targetRef.current) {
        targetRef.current.classList.remove("pdf-capturing");
        for (const o of widthOverrides) {
          o.el.style.width = o.prev;
        }
      }
      setExporting(false);
    }
  }, [targetRef, fileName]);

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      data-pdf-export-btn
      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-blue-700 disabled:opacity-40"
      title="Export as PDF"
    >
      {exporting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {exporting ? t("common.exporting") : label}
    </button>
  );
}

/**
 * Hook to create a ref + PdfExportButton combination for a page.
 */
export function usePdfExport(fileName: string) {
  const ref = useRef<HTMLDivElement>(null);
  const ExportButton = useCallback(
    () => <PdfExportButton targetRef={ref} fileName={fileName} />,
    [fileName]
  );
  return { ref, ExportButton };
}
