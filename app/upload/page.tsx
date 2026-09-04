"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Upload, Video, CheckCircle, ShieldCheck, ArrowLeft, AlertTriangle, Download } from "lucide-react"

import { analyzeVideo, fetchHealth, type StoredReport } from "@/lib/api"
import { downloadReportPdf } from "@/lib/report-pdf"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Only sports with real scoring behind them are offered. The API is the source
// of truth; this is the fallback if it cannot be reached.
const FALLBACK_SPORTS = ["Sprint-100m"]

const GENERAL_GUIDELINES = [
  "Keep the camera still — a tripod, a wall, or a friend who does not move",
  "Film from the side so your whole stride is visible",
  "Record in good light with your full body in frame",
  "Wear fitted clothing so your posture is not hidden",
  "Keep the background plain",
]

const SPRINT_GUIDELINES = [
  "Film side-on to capture stride mechanics",
  "Include at least three full strides — five seconds is plenty",
  "Use a straight, flat run-up",
  "Do not zoom or pan mid-run; let the athlete cross the frame",
]

const SCORE_STATE = (score: number | null) => {
  if (score === null) return "text-gray-500"
  if (score >= 80) return "text-[#006300]"
  if (score >= 60) return "text-[#8A5A00]"
  return "text-[#B3261E]"
}

export default function VideoUploadPage() {
  const [sports, setSports] = useState<string[]>(FALLBACK_SPORTS)
  const [maxUploadMb, setMaxUploadMb] = useState(100)
  const [selectedSport, setSelectedSport] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [ackGuidelines, setAckGuidelines] = useState(false)

  const [isUploading, setIsUploading] = useState(false)
  const [result, setResult] = useState<StoredReport | null>(null)
  const [error, setError] = useState("")

  // Let the API tell the UI what it can actually analyse, so the dropdown can
  // never offer a sport the backend will reject.
  useEffect(() => {
    fetchHealth()
      .then((health) => {
        if (health.supportedSports?.length) setSports(health.supportedSports)
        if (health.maxUploadMb) setMaxUploadMb(health.maxUploadMb)
      })
      .catch(() => {
        /* Offline: keep the fallback list. */
      })
  }, [])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setError("")
    if (!file) return

    if (!file.type.startsWith("video/")) {
      setError("That file is not a video. Choose an MP4 or MOV clip.")
      return
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      setError(`That clip is over the ${maxUploadMb}MB limit. Trim it and try again.`)
      return
    }

    setSelectedFile(file)
    setResult(null)
  }

  const handleUpload = async () => {
    if (!selectedFile || !selectedSport || !ackGuidelines) return

    setIsUploading(true)
    setError("")

    try {
      const stored = await analyzeVideo(selectedFile, selectedSport)
      setResult(stored)
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const resetForm = () => {
    setSelectedFile(null)
    setSelectedSport("")
    setAckGuidelines(false)
    setResult(null)
    setError("")
  }

  const report = result?.report

  return (
    <div className="min-h-screen bg-white relative">
      <div className="absolute inset-0 bg-grid-subtle opacity-30 pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" asChild>
            <Link href="/" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/dashboard">Your progress</Link>
          </Button>
        </div>

        <header className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Analyse your technique</h1>
          <p className="text-gray-600">
            Upload a clip and we measure your posture, knee drive and cadence from the footage.
          </p>
        </header>

        {!report ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6"
            >
              <Card className="border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-gray-900">
                    <ShieldCheck className="h-5 w-5 text-[#0077B6]" />
                    Before you record
                  </CardTitle>
                  <CardDescription>
                    The measurements are only as good as the video. These matter.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-gray-700">
                  <ul className="space-y-1.5 text-gray-600">
                    {GENERAL_GUIDELINES.map((g) => (
                      <li key={g} className="flex items-start gap-2">
                        <span className="mt-1 text-[#0077B6]">•</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>

                  {selectedSport === "Sprint-100m" && (
                    <div>
                      <h3 className="mb-2 font-semibold">For sprints specifically</h3>
                      <ul className="space-y-1.5 text-gray-600">
                        {SPRINT_GUIDELINES.map((g) => (
                          <li key={g} className="flex items-start gap-2">
                            <span className="mt-1 text-[#0077B6]">•</span>
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <label className="flex items-start gap-2 pt-1">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={ackGuidelines}
                      onChange={(e) => setAckGuidelines(e.target.checked)}
                    />
                    <span>I have read these and my clip follows them.</span>
                  </label>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="border-gray-200 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-[#0077B6]" />
                    Upload your clip
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="sport-category">Sport</Label>
                    <Select value={selectedSport} onValueChange={setSelectedSport}>
                      <SelectTrigger id="sport-category">
                        <SelectValue placeholder="Choose a sport" />
                      </SelectTrigger>
                      <SelectContent>
                        {sports.map((sport) => (
                          <SelectItem key={sport} value={sport}>
                            {sport}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      More sports are coming. We only list the ones with real analysis behind them.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="video-file">Video file</Label>
                    <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-[#0077B6]">
                      <input
                        id="video-file"
                        type="file"
                        accept="video/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <label htmlFor="video-file" className="cursor-pointer">
                        <Upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                        <p className="mb-1 text-sm text-gray-600">Click to choose a video</p>
                        <p className="text-xs text-gray-500">MP4 or MOV, up to {maxUploadMb}MB</p>
                      </label>
                    </div>

                    {selectedFile && (
                      <div className="mt-2 rounded-lg bg-blue-50 p-3">
                        <p className="text-sm text-gray-700">
                          <strong>Selected:</strong> {selectedFile.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-lg bg-[#FCEAE8] p-3 text-sm text-[#B3261E]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                      <span>{error}</span>
                    </div>
                  )}

                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || !selectedSport || !ackGuidelines || isUploading}
                    className="w-full bg-[#0077B6] text-white hover:bg-[#005a8b]"
                  >
                    {isUploading ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                        Analysing — this takes about 30 seconds
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Analyse video
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            <Card className="border-gray-200 shadow-lg">
              <CardContent className="pt-8 text-center">
                <CheckCircle className="mx-auto mb-4 h-14 w-14 text-green-500" />
                <p className="mb-1 text-sm uppercase tracking-wide text-gray-500">
                  Technique score
                </p>
                <div className={`text-6xl font-bold ${SCORE_STATE(report.score)}`}>
                  {report.score ?? "—"}
                </div>
                <p className="mx-auto mt-4 max-w-md text-gray-600">{report.summary}</p>
              </CardContent>
            </Card>

            {report.quality?.level !== "high" && report.quality?.issues?.length > 0 && (
              <Card className="border-[#8A5A00]/30 bg-[#FDF3E0]">
                <CardContent className="pt-6">
                  <div className="mb-2 flex items-center gap-2 font-semibold text-[#8A5A00]">
                    <AlertTriangle className="h-4 w-4" />
                    Video quality limited this analysis
                  </div>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {report.quality.issues.map((issue) => (
                      <li key={issue}>• {issue}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">What to work on</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700">
                  {report.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 text-[#0077B6]">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {Object.keys(report.phases || {}).length > 0 && (
              <Card className="border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Phase by phase</CardTitle>
                  <CardDescription>
                    Your run split into thirds, measured separately.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(report.phases).map(([phase, details]) => (
                    <div key={phase} className="rounded-lg bg-gray-50 p-4">
                      <h4 className="mb-2 font-semibold capitalize text-gray-900">{phase}</h4>
                      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-gray-500">Stride length</dt>
                          <dd className="text-gray-900">{details.strideLength}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Posture</dt>
                          <dd className="text-gray-900">{details.posture}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Knee angle</dt>
                          <dd className="text-gray-900">{details.kneeAngle}</dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-sm text-gray-600">{details.improvement}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Raw measurements</CardTitle>
                <CardDescription>
                  Everything above is derived from these. Nothing is estimated.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {Object.entries(report.measurements || {}).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4 border-b border-gray-100 py-1">
                      <dt className="text-gray-600">
                        {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                      </dt>
                      <dd
                        className="font-medium text-gray-900"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {value === null ? "not measurable" : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {report.processing && (
                  <p className="mt-3 text-xs text-gray-500">
                    {report.processing.framesAnalysed} frames on {report.processing.backend} in{" "}
                    {(report.processing.elapsedMs / 1000).toFixed(1)}s
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3">
              <Button variant="outline" onClick={resetForm} className="w-full bg-white">
                Analyse another
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadReportPdf(result)}
                className="w-full bg-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
              <Button asChild className="w-full bg-[#0077B6] text-white hover:bg-[#005a8b]">
                <Link href="/dashboard">See your progress</Link>
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
