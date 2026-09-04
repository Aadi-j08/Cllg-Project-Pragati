"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { motion } from "framer-motion"
import { ArrowLeft, Upload, TrendingUp, Activity, Award, LogOut } from "lucide-react"

import { auth } from "@/lib/firebase"
import { fetchReports, fetchHealth, type StoredReport } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Chart colours. One series, one hue — bar length already encodes the score,
// so colouring each bar by its value would double-encode and burn the only
// free channel. State is carried by the labelled chip instead.
const SERIES = "#0077B6"
const GRID = "#E5E9ED"
const AXIS = "#C3C9D0"

function scoreState(score: number | null) {
  if (score === null) return { label: "not measured", className: "text-gray-500 bg-gray-100" }
  if (score >= 80) return { label: "on target", className: "text-[#006300] bg-[#E8F5E8]" }
  if (score >= 60) return { label: "needs work", className: "text-[#8A5A00] bg-[#FDF3E0]" }
  return { label: "priority", className: "text-[#B3261E] bg-[#FCEAE8]" }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Score over time. Inline SVG rather than a charting library: one series of at
 * most fifty points does not justify the dependency, and this keeps the bundle
 * honest.
 */
function ScoreTrend({ reports }: { reports: StoredReport[] }) {
  const [hovered, setHovered] = useState<number | null>(null)

  // Oldest first, and only sessions that actually produced a score.
  const points = useMemo(
    () =>
      [...reports]
        .reverse()
        .filter((r) => typeof r.report?.score === "number")
        .map((r) => ({ score: r.report.score as number, date: r.createdAt })),
    [reports]
  )

  if (points.length < 2) return null

  const W = 720
  const H = 240
  const PAD = { top: 20, right: 56, bottom: 36, left: 40 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const x = (i: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (score: number) => PAD.top + plotH - (score / 100) * plotH

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.score)}`).join(" ")
  const last = points.length - 1
  const best = points.reduce((b, p, i) => (p.score > points[b].score ? i : b), 0)

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Technique score over time</CardTitle>
        <p className="text-sm text-gray-600">
          Every session you have analysed, oldest to newest.
        </p>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full min-w-[520px]"
            role="img"
            aria-label={`Line chart of technique score across ${points.length} sessions, most recently ${points[last].score} out of 100.`}
          >
            {/* Hairline grid, solid — dashed grid reads as a threshold it isn't. */}
            {[0, 25, 50, 75, 100].map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={tick === 0 ? AXIS : GRID}
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 10}
                  y={y(tick) + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#8A9098"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {tick}
                </text>
              </g>
            ))}

            <path d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" />

            {points.map((p, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(p.score)}
                r={hovered === i ? 6 : 4.5}
                fill={SERIES}
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            ))}

            {/* Direct-label only the endpoint and the best session, never every point. */}
            <text
              x={x(last) + 10}
              y={y(points[last].score) + 4}
              fontSize="13"
              fontWeight="700"
              fill={SERIES}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {points[last].score}
            </text>
            {best !== last && (
              <text
                x={x(best)}
                y={y(points[best].score) - 12}
                textAnchor="middle"
                fontSize="11"
                fill="#52575E"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                best {points[best].score}
              </text>
            )}

            {/* Hit targets are wider than the markers so hovering is forgiving. */}
            {points.map((p, i) => (
              <rect
                key={`hit-${i}`}
                x={x(i) - plotW / (points.length * 2) - 6}
                y={PAD.top}
                width={plotW / points.length + 12}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}

            <line
              x1={PAD.left}
              x2={PAD.left}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={AXIS}
              strokeWidth="1"
            />
          </svg>

          {hovered !== null && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
              style={{
                left: `${(x(hovered) / W) * 100}%`,
                top: `${(y(points[hovered].score) / H) * 100}%`,
                transform: "translate(-50%, -140%)",
              }}
            >
              <span className="font-semibold">{points[hovered].score}</span>
              <span className="text-gray-300"> · {formatDate(points[hovered].date)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Sub-score breakdown for one session. Nominal categories, so one hue. */
function Breakdown({ report }: { report: StoredReport["report"] }) {
  const rows = Object.entries(report.breakdown || {}).filter(([, v]) => v)
  if (!rows.length) return null

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">What made up that score</CardTitle>
        <p className="text-sm text-gray-600">
          Each component is measured from your pose data, then compared to a coaching target.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {rows.map(([key, sub]) => {
            const state = scoreState(sub.score)
            return (
              <li key={key}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
                  <span className="font-medium text-gray-900">{sub.label}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${state.className}`}>
                    {state.label}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${sub.score ?? 0}%`,
                        backgroundColor: SERIES,
                      }}
                    />
                  </div>
                  <span
                    className="w-10 text-right text-sm font-semibold text-gray-900"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {sub.score ?? "—"}
                  </span>
                </div>

                <p className="mt-1 text-xs text-gray-600">
                  Measured {sub.measured} · target {sub.target}
                </p>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="border-gray-200">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-gray-600 mb-2">
          <Icon className="h-4 w-4" />
          <span className="text-sm">{label}</span>
        </div>
        <div className="text-3xl font-bold text-gray-900">{value}</div>
        {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [reports, setReports] = useState<StoredReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // Ask the API whether it actually requires a signed-in user. A local
        // demo without Firebase configured should still show the dashboard.
        const health = await fetchHealth().catch(() => null)
        const user = auth.currentUser

        if (health?.authenticationRequired && !user) {
          router.replace("/login")
          return
        }

        const data = await fetchReports()
        if (!cancelled) setReports(data)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not reach the analysis service."
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setEmail(user?.email ?? null)
      load()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [router])

  const latest = reports[0]
  const scored = reports.filter((r) => typeof r.report?.score === "number")
  const best = scored.reduce<number | null>(
    (b, r) => (b === null || (r.report.score as number) > b ? (r.report.score as number) : b),
    null
  )

  return (
    <div className="min-h-screen bg-white relative">
      <div className="absolute inset-0 bg-grid-subtle opacity-30 pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" asChild>
            <Link href="/" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>

          {email && (
            <Button
              variant="ghost"
              onClick={async () => {
                await signOut(auth)
                router.push("/login")
              }}
              className="flex items-center gap-2 text-gray-600"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          )}
        </div>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Your progress</h1>
          <p className="text-gray-600">
            {email ? `Signed in as ${email}` : "Every session you have analysed."}
          </p>
        </header>

        {loading && <p className="text-gray-600">Loading your sessions…</p>}

        {!loading && error && (
          <Card className="border-gray-200">
            <CardContent className="pt-6">
              <p className="text-gray-900 font-medium mb-1">Could not load your sessions</p>
              <p className="text-sm text-gray-600 mb-4">{error}</p>
              <p className="text-sm text-gray-600">
                Make sure the analysis API is running on{" "}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">localhost:3001</code>.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && reports.length === 0 && (
          <Card className="border-gray-200">
            <CardContent className="py-12 text-center">
              <Activity className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <h2 className="mb-2 text-xl font-semibold text-gray-900">No sessions yet</h2>
              <p className="mx-auto mb-6 max-w-md text-gray-600">
                Upload a sprint video and we will measure your posture, knee drive and
                cadence from the footage.
              </p>
              <Button asChild className="bg-[#0077B6] text-white hover:bg-[#005a8b]">
                <Link href="/upload" className="inline-flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Analyse your first video
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && reports.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {reports.some((r) => (r.report as any)?.demo) && (
              <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
                Showing sample sessions generated by{" "}
                <code className="rounded bg-gray-200 px-1.5 py-0.5 text-xs">npm run seed:demo</code>.
                Remove them with{" "}
                <code className="rounded bg-gray-200 px-1.5 py-0.5 text-xs">
                  npm run seed:demo -- --clear
                </code>
                .
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile
                icon={TrendingUp}
                label="Latest score"
                value={latest?.report?.score != null ? String(latest.report.score) : "—"}
                hint={latest ? formatDate(latest.createdAt) : undefined}
              />
              <StatTile
                icon={Award}
                label="Best score"
                value={best != null ? String(best) : "—"}
                hint={scored.length ? `across ${scored.length} scored sessions` : "no scored sessions yet"}
              />
              <StatTile
                icon={Activity}
                label="Sessions"
                value={String(reports.length)}
                hint="videos analysed"
              />
            </div>

            <ScoreTrend reports={reports} />

            {latest?.report && <Breakdown report={latest.report} />}

            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Session history</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-600">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Sport</th>
                        <th className="pb-2 font-medium">Score</th>
                        <th className="pb-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id} className="border-b border-gray-100 last:border-0">
                          <td className="py-2.5 text-gray-900">{formatDate(r.createdAt)}</td>
                          <td className="py-2.5 text-gray-600">{r.sport ?? "—"}</td>
                          <td
                            className="py-2.5 font-semibold text-gray-900"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {r.report?.score ?? "—"}
                          </td>
                          <td className="py-2.5 text-gray-600">{r.report?.quality?.level ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="pt-2">
              <Button asChild className="bg-[#0077B6] text-white hover:bg-[#005a8b]">
                <Link href="/upload" className="inline-flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Analyse another video
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
