// report-pdf.ts
//
// Renders an analysis report as a PDF the athlete can keep or hand to a coach.
// jsPDF is imported dynamically so it never lands in the initial bundle — most
// visitors never press the download button.

import type { StoredReport } from "@/lib/api"

const MARGIN = 14
const PAGE_WIDTH = 210 // A4 portrait, millimetres
const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2

export async function downloadReportPdf(stored: StoredReport) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const report = stored.report

  let y = 20

  /** Write wrapped text and advance the cursor, starting a page when needed. */
  const write = (
    text: string,
    { size = 10, style = "normal" as "normal" | "bold", gap = 5, indent = 0 } = {}
  ) => {
    doc.setFontSize(size)
    doc.setFont("helvetica", style)
    const lines = doc.splitTextToSize(text, TEXT_WIDTH - indent)
    for (const line of lines) {
      if (y > 275) {
        doc.addPage()
        y = 20
      }
      doc.text(line, MARGIN + indent, y)
      y += gap
    }
  }

  write("Pragati — Technique Analysis", { size: 18, style: "bold", gap: 8 })
  write(
    `${stored.sport ?? report.sport} · ${new Date(stored.createdAt).toLocaleDateString()}`,
    { size: 10, gap: 9 }
  )

  write(`Score: ${report.score ?? "not scored"} / 100`, { size: 14, style: "bold", gap: 7 })
  write(report.summary, { gap: 6 })
  y += 3

  if (report.quality?.level !== "high" && report.quality?.issues?.length) {
    write("Video quality notes", { size: 12, style: "bold", gap: 6 })
    for (const issue of report.quality.issues) write(`• ${issue}`, { indent: 3 })
    y += 3
  }

  write("Score breakdown", { size: 12, style: "bold", gap: 6 })
  for (const sub of Object.values(report.breakdown || {})) {
    write(`${sub.label}: ${sub.score ?? "—"}  (measured ${sub.measured}, target ${sub.target})`, {
      indent: 3,
    })
  }
  y += 3

  write("What to work on", { size: 12, style: "bold", gap: 6 })
  report.recommendations.forEach((rec, i) => write(`${i + 1}. ${rec}`, { indent: 3 }))
  y += 3

  if (Object.keys(report.phases || {}).length) {
    write("Phase by phase", { size: 12, style: "bold", gap: 6 })
    for (const [phase, details] of Object.entries(report.phases)) {
      write(phase.replace(/^./, (c) => c.toUpperCase()), { style: "bold", indent: 3 })
      write(`Stride length: ${details.strideLength}`, { indent: 6 })
      write(`Posture: ${details.posture}`, { indent: 6 })
      write(`Knee angle: ${details.kneeAngle}`, { indent: 6 })
      write(details.improvement, { indent: 6, gap: 6 })
    }
  }

  write("Raw measurements", { size: 12, style: "bold", gap: 6 })
  for (const [key, value] of Object.entries(report.measurements || {})) {
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())
    write(`${label}: ${value === null ? "not measurable" : value}`, { indent: 3 })
  }

  const date = new Date(stored.createdAt).toISOString().slice(0, 10)
  doc.save(`pragati-${(stored.sport ?? "analysis").toLowerCase()}-${date}.pdf`)
}
