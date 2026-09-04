// scoring.js
//
// Turns per-frame pose measurements into an athlete-facing report.
//
// Design rule: every number in the output must be traceable to something that
// was actually measured. Where the video does not support a measurement, the
// report says so instead of substituting a plausible-looking value.

const {
  buildSeries,
  countSteps,
  mean,
  median,
  stdDev,
} = require("./metrics");

const SUPPORTED_SPORTS = ["Sprint-100m"];

/**
 * Score a value that should sit inside an ideal band.
 * Full marks inside [lo, hi], falling linearly to zero `falloff` units outside.
 */
function bandScore(value, lo, hi, falloff) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (value >= lo && value <= hi) return 100;
  const distance = value < lo ? lo - value : value - hi;
  return Math.max(0, Math.round(100 * (1 - distance / falloff)));
}

/** Score where smaller is strictly better (0 = perfect, `worst` = zero marks). */
function lowerIsBetter(value, best, worst) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (value <= best) return 100;
  if (value >= worst) return 0;
  return Math.round(100 * (1 - (value - best) / (worst - best)));
}

function round(value, places = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/**
 * Split frames into the three phases of a sprint. With a short clip these are
 * simply early/middle/late thirds — honest about what it is, rather than
 * pretending to detect block clearance we cannot see.
 */
function splitPhases(perFrame) {
  const n = perFrame.length;
  const a = Math.floor(n / 3);
  const b = Math.floor((2 * n) / 3);
  return {
    drive: perFrame.slice(0, a),
    acceleration: perFrame.slice(a, b),
    maxVelocity: perFrame.slice(b),
  };
}

/** Peak knee flexion in a window: the SMALLEST knee angle seen (most bent). */
function peakFlexion(window) {
  const angles = [];
  for (const f of window) {
    if (f.knees.left !== null) angles.push(f.knees.left);
    if (f.knees.right !== null) angles.push(f.knees.right);
  }
  if (!angles.length) return null;
  return Math.min(...angles);
}

/** Per-leg range of knee motion, used to compare left against right. */
function kneeRange(perFrame, side) {
  const angles = perFrame.map((f) => f.knees[side]).filter((v) => v !== null);
  if (angles.length < 2) return null;
  return Math.max(...angles) - Math.min(...angles);
}

function describePosture(lean) {
  if (lean === null) return "not measurable";
  const magnitude = Math.abs(round(lean));
  if (lean < -2) return `${magnitude}° leaning back`;
  if (lean < 2) return `${magnitude}° upright`;
  return `${magnitude}° forward lean`;
}

/**
 * Estimate stride length in body heights.
 *
 * Absolute metres are impossible without camera calibration, so this reports a
 * normalised figure. It also returns null when the camera panned with the
 * athlete, because then horizontal displacement is not stride distance.
 */
function strideLength(window, scale, travelSign, totalSteps, totalFrames) {
  if (!scale || travelSign === 0 || totalSteps < 2) return null;

  const hips = window.map((f) => f.hips).filter(Boolean);
  if (hips.length < 2) return null;

  const displacement = Math.abs(hips[hips.length - 1].x - hips[0].x);
  // Steps attributable to this window, proportional to its share of frames.
  const share = window.length / totalFrames;
  const stepsHere = totalSteps * share;
  if (stepsHere < 1) return null;

  return displacement / stepsHere / scale;
}

/**
 * Judge how trustworthy this clip is before scoring anything from it.
 * A blurry or badly framed video produces a low-confidence report rather
 * than a confident wrong one.
 */
function assessQuality(perFrame) {
  const confidences = perFrame.map((f) => f.confidence).filter((v) => v !== null);
  const avgConfidence = mean(confidences);

  const framesWithLegs = perFrame.filter(
    (f) => f.knees.left !== null || f.knees.right !== null
  ).length;
  const legCoverage = perFrame.length ? framesWithLegs / perFrame.length : 0;

  const issues = [];
  if (avgConfidence !== null && avgConfidence < 0.4) {
    issues.push("The athlete is hard to make out — try better lighting or a closer camera.");
  }
  if (legCoverage < 0.6) {
    issues.push("Legs were only visible in part of the clip — keep the whole body in frame.");
  }
  if (perFrame.length < 8) {
    issues.push("The clip is very short — record at least three full strides.");
  }

  let level = "high";
  if (issues.length === 1) level = "medium";
  if (issues.length > 1 || legCoverage < 0.35) level = "low";

  return {
    level,
    issues,
    avgConfidence: round(avgConfidence, 2),
    legCoverage: round(legCoverage, 2),
  };
}

/**
 * Score a sprint clip.
 *
 * @param {Array} frames  [{ keypoints: [...] }] in capture order
 * @param {number} fps    frames per second the clip was sampled at
 */
function scoreSprint(frames, fps) {
  const { perFrame, scale, travelSign } = buildSeries(frames);
  const quality = assessQuality(perFrame);

  const durationSeconds = perFrame.length / fps;
  const { steps, confident: cadenceConfident } = countSteps(
    perFrame.map((f) => f.ankleGap),
    scale
  );

  // --- raw measurements -----------------------------------------------------

  const avgLean = mean(perFrame.map((f) => f.lean));
  const flexion = peakFlexion(perFrame);

  const cadence = cadenceConfident && durationSeconds > 0
    ? (steps / durationSeconds) * 60
    : null;

  const leftRange = kneeRange(perFrame, "left");
  const rightRange = kneeRange(perFrame, "right");
  const asymmetry =
    leftRange !== null && rightRange !== null
      ? Math.abs(leftRange - rightRange)
      : null;

  // Vertical bounce of the hips, as a fraction of body height. Sprinters want
  // energy going forward, not upward.
  const hipYs = perFrame.map((f) => (f.hips ? f.hips.y : null));
  const bounceRaw = stdDev(hipYs);
  const bounce = bounceRaw !== null && scale ? bounceRaw / scale : null;

  // --- sub-scores -----------------------------------------------------------
  // Target bands come from published sprint coaching ranges; each is stated
  // openly in the report so a coach can disagree with the standard, not guess
  // at what the number meant.

  const subScores = {
    posture: {
      label: "Torso lean",
      score: bandScore(avgLean, 5, 15, 20),
      measured: describePosture(avgLean),
      target: "5–15° forward",
    },
    kneeDrive: {
      label: "Knee drive",
      score: bandScore(flexion, 85, 115, 45),
      measured: flexion === null ? "not measurable" : `${round(flexion)}° peak flexion`,
      target: "85–115° peak flexion",
    },
    cadence: {
      label: "Cadence",
      score: bandScore(cadence, 240, 300, 90),
      measured: cadence === null ? "not measurable" : `${Math.round(cadence)} steps/min`,
      target: "240–300 steps/min",
    },
    symmetry: {
      label: "Left/right symmetry",
      score: lowerIsBetter(asymmetry, 8, 45),
      measured: asymmetry === null ? "not measurable" : `${round(asymmetry)}° difference`,
      target: "under 8° difference",
    },
    economy: {
      label: "Vertical bounce",
      score: lowerIsBetter(bounce, 0.04, 0.14),
      measured: bounce === null ? "not measurable" : `${round(bounce * 100)}% of body height`,
      target: "under 4% of body height",
    },
  };

  const WEIGHTS = {
    posture: 0.2,
    kneeDrive: 0.25,
    cadence: 0.2,
    symmetry: 0.2,
    economy: 0.15,
  };

  // Only average the components we could actually measure, and renormalise the
  // weights across them — a missing measurement must not silently score zero.
  let weighted = 0;
  let weightUsed = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const s = subScores[key].score;
    if (s !== null) {
      weighted += s * weight;
      weightUsed += weight;
    }
  }

  const score = weightUsed > 0 ? Math.round(weighted / weightUsed) : null;

  // --- phases ---------------------------------------------------------------

  const windows = splitPhases(perFrame);
  const phaseLabels = {
    drive: "drive",
    acceleration: "acceleration",
    maxVelocity: "max velocity",
  };

  const phases = {};
  for (const [key, window] of Object.entries(windows)) {
    if (!window.length) continue;

    const phaseLean = mean(window.map((f) => f.lean));
    const phaseFlexion = peakFlexion(window);
    const stride = strideLength(window, scale, travelSign, steps, perFrame.length);

    phases[phaseLabels[key]] = {
      strideLength: stride === null ? "not measurable" : `${round(stride, 2)} × body height`,
      posture: describePosture(phaseLean),
      kneeAngle: phaseFlexion === null ? "not measurable" : `${round(phaseFlexion)}° peak flexion`,
      improvement: phaseAdvice(key, phaseLean, phaseFlexion),
    };
  }

  // --- recommendations ------------------------------------------------------

  const recommendations = buildRecommendations(subScores, quality);

  const totalKeypoints = perFrame.reduce((sum, f) => sum + f.visible, 0);

  return {
    sport: "Sprint-100m",
    score,
    keypointsDetected: totalKeypoints,
    summary: buildSummary(score, quality, perFrame.length, durationSeconds),
    recommendations,
    phases,
    breakdown: subScores,
    measurements: {
      framesAnalysed: perFrame.length,
      durationSeconds: round(durationSeconds, 2),
      stepsCounted: steps,
      cadenceStepsPerMin: cadence === null ? null : Math.round(cadence),
      avgTorsoLeanDeg: round(avgLean),
      peakKneeFlexionDeg: round(flexion),
      kneeAsymmetryDeg: round(asymmetry),
      verticalBounceRatio: round(bounce, 3),
      cameraMotion: travelSign === 0 ? "panning or static subject" : "fixed",
    },
    quality,
  };
}

function phaseAdvice(phase, lean, flexion) {
  if (phase === "drive") {
    if (lean !== null && lean < 10) {
      return "Stay lower out of the start — a steeper forward lean here converts more force into speed.";
    }
    return "Good drive angle. Hold it a beat longer before standing tall.";
  }

  if (phase === "acceleration") {
    if (flexion !== null && flexion > 115) {
      return "Pick the knees up higher through this phase to lengthen your stride.";
    }
    return "Knee height looks strong. Focus on rising gradually rather than popping upright.";
  }

  if (lean !== null && lean < 0) {
    return "You are leaning back at top speed, which brakes you. Run tall through the hips instead.";
  }
  return "Hold your form as you tire — this is where technique usually slips first.";
}

function buildRecommendations(subScores, quality) {
  const tips = [];

  // Data problems come first: no point coaching off a clip we cannot read.
  for (const issue of quality.issues) tips.push(issue);

  const scored = Object.entries(subScores)
    .filter(([, v]) => v.score !== null)
    .sort((a, b) => a[1].score - b[1].score);

  const ADVICE = {
    posture:
      "Work on torso angle — film yourself from the side and aim for a slight, steady forward lean.",
    kneeDrive:
      "Add high-knee and A-skip drills. Your knees are not coming through high enough to open the stride.",
    cadence:
      "Practise quicker ground contact with fast-feet ladder drills; turnover matters more than reach.",
    symmetry:
      "Your left and right legs are moving differently. Single-leg strength work should even this out.",
    economy:
      "Too much of your energy is going upward. Think about driving forward, not bouncing.",
  };

  for (const [key, value] of scored) {
    if (value.score < 70 && ADVICE[key]) {
      tips.push(`${ADVICE[key]} (measured ${value.measured}, target ${value.target})`);
    }
    if (tips.length >= 4) break;
  }

  if (!tips.length) {
    tips.push("Technique looks solid across every measure. Repeat this test in two weeks to track progress.");
  }

  return tips;
}

function buildSummary(score, quality, frameCount, duration) {
  if (score === null) {
    return `Could not score this clip: too few body landmarks were visible across ${frameCount} frames.`;
  }

  const band =
    score >= 85 ? "strong technique" :
    score >= 70 ? "solid technique with clear room to improve" :
    score >= 55 ? "developing technique" :
    "early-stage technique";

  const caveat =
    quality.level === "high" ? "" :
    quality.level === "medium" ? " Read this as indicative — video quality limited some measurements." :
    " Treat this as a rough read only — the video quality was too low for confident measurement.";

  return `Analysed ${frameCount} frames over ${duration.toFixed(1)}s and measured ${band}.${caveat}`;
}

/**
 * Entry point. Only sports with real scoring implemented are accepted —
 * an unsupported sport returns an honest refusal rather than invented numbers.
 */
function analysePose(sport, frames, fps) {
  if (!SUPPORTED_SPORTS.includes(sport)) {
    const error = new Error(
      `Analysis for "${sport}" is not implemented yet. Currently supported: ${SUPPORTED_SPORTS.join(", ")}.`
    );
    error.status = 400;
    throw error;
  }
  return scoreSprint(frames, fps);
}

module.exports = {
  SUPPORTED_SPORTS,
  analysePose,
  scoreSprint,
  bandScore,
  lowerIsBetter,
  splitPhases,
  peakFlexion,
  kneeRange,
  assessQuality,
  describePosture,
};
