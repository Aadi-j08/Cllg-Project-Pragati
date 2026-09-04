// api.ts
//
// One place that knows where the analysis API lives and how to talk to it.
// Previously three different files hardcoded two different localhost ports.

import { auth } from "@/lib/firebase"

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export interface PhaseDetail {
  strideLength: string
  posture: string
  kneeAngle: string
  improvement: string
}

export interface SubScore {
  label: string
  score: number | null
  measured: string
  target: string
}

export interface AnalysisReport {
  sport: string
  score: number | null
  keypointsDetected: number
  summary: string
  recommendations: string[]
  phases: Record<string, PhaseDetail>
  breakdown: Record<string, SubScore>
  measurements: {
    framesAnalysed: number
    durationSeconds: number | null
    stepsCounted: number
    cadenceStepsPerMin: number | null
    avgTorsoLeanDeg: number | null
    peakKneeFlexionDeg: number | null
    kneeAsymmetryDeg: number | null
    verticalBounceRatio: number | null
    cameraMotion: string
  }
  quality: {
    level: "high" | "medium" | "low"
    issues: string[]
    avgConfidence: number | null
    legCoverage: number | null
  }
  processing?: {
    backend: string
    framesAnalysed: number
    elapsedMs: number
  }
}

export interface StoredReport {
  id: string
  createdAt: string
  sport: string | null
  report: AnalysisReport
}

/**
 * Attach a Firebase ID token when the athlete is signed in.
 *
 * We deliberately do not throw when there is no user: the server decides
 * whether authentication is required, and returns a clear 401 if it is. That
 * keeps a Firebase-less local demo working without a second code path here.
 */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await auth.currentUser?.getIdToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

/** Turn any failed response into an Error carrying the server's own message. */
async function raise(response: Response): Promise<never> {
  let message = `Request failed (${response.status})`
  try {
    const body = await response.json()
    if (body?.error) message = body.error
  } catch {
    // Non-JSON error body; keep the status message.
  }
  throw new Error(message)
}

/** Upload a clip for analysis. Returns the stored report record. */
export async function analyzeVideo(
  file: File,
  sport: string
): Promise<StoredReport> {
  const formData = new FormData()
  formData.append("video", file)
  formData.append("sport", sport)

  const response = await fetch(`${API_URL}/analyze`, {
    method: "POST",
    headers: await authHeaders(),
    body: formData,
  })

  if (!response.ok) await raise(response)
  return response.json()
}

/** Every past report for the signed-in athlete, newest first. */
export async function fetchReports(): Promise<StoredReport[]> {
  const response = await fetch(`${API_URL}/reports`, {
    headers: await authHeaders(),
  })

  if (!response.ok) await raise(response)
  const body = await response.json()
  return body.reports ?? []
}

/** Ask the API what it supports, so the UI can reflect reality. */
export async function fetchHealth(): Promise<{
  supportedSports: string[]
  maxUploadMb: number
  authenticationRequired: boolean
}> {
  const response = await fetch(`${API_URL}/health`)
  if (!response.ok) await raise(response)
  return response.json()
}
