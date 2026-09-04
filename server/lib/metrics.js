// metrics.js
//
// Pure biomechanics math over MoveNet keypoints. No I/O, no TensorFlow, no
// Express — everything here is a plain function over plain data, so it can be
// unit tested without a video, a model, or a GPU.
//
// MoveNet returns 17 COCO keypoints per frame, each { x, y, score, name },
// with x/y in pixels and y increasing DOWNWARD (image coordinates).

const KEYPOINT_NAMES = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
];

// A keypoint below this confidence is treated as "not seen" rather than
// silently used as if it were a real measurement.
const MIN_CONFIDENCE = 0.3;

/** Index a frame's keypoint array by name for readable access. */
function byName(keypoints) {
  const map = Object.create(null);
  for (const kp of keypoints || []) {
    if (kp && kp.name) map[kp.name] = kp;
  }
  return map;
}

/** A keypoint is usable only if it exists and the model was confident enough. */
function ok(kp) {
  return Boolean(kp) && typeof kp.x === "number" && typeof kp.y === "number" &&
    (kp.score === undefined || kp.score >= MIN_CONFIDENCE);
}

function midpoint(a, b) {
  if (!ok(a) || !ok(b)) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Interior angle at joint `b`, formed by segments b->a and b->c, in degrees.
 * For a knee this is hip-knee-ankle: 180 = fully extended leg, 90 = deeply bent.
 */
function jointAngle(a, b, c) {
  if (!ok(a) || !ok(b) || !ok(c)) return null;

  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };

  const m1 = Math.hypot(v1.x, v1.y);
  const m2 = Math.hypot(v2.x, v2.y);
  if (m1 === 0 || m2 === 0) return null;

  const cos = (v1.x * v2.x + v1.y * v2.y) / (m1 * m2);
  // Guard against floating point drift pushing us outside acos's domain.
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/**
 * Estimated full body height in pixels, used to normalise every distance so
 * results do not depend on how far the athlete stood from the camera.
 *
 * Shoulders sit at roughly 82% of standing height, so the shoulder-to-ankle
 * span is scaled by 1/0.82 to approximate the whole body.
 */
const SHOULDER_HEIGHT_RATIO = 0.82;

function bodyScale(kp) {
  const shoulders = midpoint(kp.left_shoulder, kp.right_shoulder);
  const ankles = midpoint(kp.left_ankle, kp.right_ankle);
  const span = distance(shoulders, ankles);
  if (!span) return null;
  return span / SHOULDER_HEIGHT_RATIO;
}

/**
 * Torso lean away from vertical, in degrees.
 *
 * Returned SIGNED against the direction of travel: positive means the athlete
 * is leaning forward into the run, negative means leaning back. Sprinters want
 * a small positive lean at top speed; leaning back is a braking fault.
 */
function torsoLean(kp, travelSign) {
  const shoulders = midpoint(kp.left_shoulder, kp.right_shoulder);
  const hips = midpoint(kp.left_hip, kp.right_hip);
  if (!shoulders || !hips) return null;

  // Vector from hips up to shoulders. y is negative because up is -y.
  const dx = shoulders.x - hips.x;
  const dy = shoulders.y - hips.y;
  if (dy === 0) return null;

  // Angle from vertical. atan2 of horizontal over vertical rise.
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;

  // Flip so "forward" is always positive regardless of which way they run.
  return travelSign < 0 ? -deg : deg;
}

/** Knee angles for both legs on one frame. */
function kneeAngles(kp) {
  return {
    left: jointAngle(kp.left_hip, kp.left_knee, kp.left_ankle),
    right: jointAngle(kp.right_hip, kp.right_knee, kp.right_ankle),
  };
}

/** Elbow angles for both arms on one frame. */
function elbowAngles(kp) {
  return {
    left: jointAngle(kp.left_shoulder, kp.left_elbow, kp.left_wrist),
    right: jointAngle(kp.right_shoulder, kp.right_elbow, kp.right_wrist),
  };
}

/**
 * Which way is the athlete running? Compares hip position in the first and
 * last quarter of the clip. Returns +1 (moving right), -1 (moving left), or
 * 0 when there is not enough horizontal movement to tell — which happens when
 * the camera pans to follow, and is reported rather than guessed at.
 */
function travelDirection(hipTrack, scale) {
  const points = hipTrack.filter(Boolean);
  if (points.length < 4 || !scale) return 0;

  const cut = Math.max(1, Math.floor(points.length / 4));
  const startX = mean(points.slice(0, cut).map((p) => p.x));
  const endX = mean(points.slice(-cut).map((p) => p.x));

  const shift = endX - startX;
  // Less than a third of a body height of drift is treated as "static camera".
  if (Math.abs(shift) < scale * 0.33) return 0;
  return shift > 0 ? 1 : -1;
}

/**
 * Count steps by watching the signed horizontal gap between the ankles.
 *
 * The gap swings from positive to negative once per step as the legs cross,
 * so each zero crossing is one footfall. A minimum amplitude gate stops
 * detector jitter around zero from being counted as running.
 */
function countSteps(ankleGap, scale) {
  const series = ankleGap.filter((v) => v !== null);
  if (series.length < 4 || !scale) return { steps: 0, confident: false };

  const amplitude = Math.max(...series.map(Math.abs));
  // Legs must separate by at least 15% of body height for this to be a stride.
  if (amplitude < scale * 0.15) return { steps: 0, confident: false };

  const gate = amplitude * 0.2;
  let steps = 0;
  let armed = series[0] > 0 ? 1 : -1;

  for (const value of series) {
    if (armed === 1 && value < -gate) {
      steps++;
      armed = -1;
    } else if (armed === -1 && value > gate) {
      steps++;
      armed = 1;
    }
  }

  return { steps, confident: steps >= 2 };
}

function mean(values) {
  const nums = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(values) {
  const nums = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (nums.length < 2) return null;
  const m = mean(nums);
  const variance = mean(nums.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

function median(values) {
  const nums = values
    .filter((v) => typeof v === "number" && !Number.isNaN(v))
    .sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Reduce a sequence of frames into the per-frame series the scorer needs.
 * Every series keeps `null` for frames where the model could not see the
 * relevant joints, so downstream code can tell "not measured" from "zero".
 */
function buildSeries(frames) {
  const perFrame = frames.map((frame) => {
    const kp = byName(frame.keypoints);

    const hips = midpoint(kp.left_hip, kp.right_hip);
    const scale = bodyScale(kp);
    const knees = kneeAngles(kp);
    const elbows = elbowAngles(kp);

    const ankleGap =
      ok(kp.left_ankle) && ok(kp.right_ankle)
        ? kp.left_ankle.x - kp.right_ankle.x
        : null;

    const confidences = (frame.keypoints || [])
      .map((k) => (k && typeof k.score === "number" ? k.score : null))
      .filter((v) => v !== null);

    return {
      kp,
      hips,
      scale,
      knees,
      elbows,
      ankleGap,
      visible: (frame.keypoints || []).filter(ok).length,
      confidence: mean(confidences),
    };
  });

  const scale = median(perFrame.map((f) => f.scale));
  const travelSign = travelDirection(perFrame.map((f) => f.hips), scale);

  for (const f of perFrame) {
    f.lean = torsoLean(f.kp, travelSign);
  }

  return { perFrame, scale, travelSign };
}

module.exports = {
  KEYPOINT_NAMES,
  MIN_CONFIDENCE,
  byName,
  ok,
  midpoint,
  distance,
  jointAngle,
  bodyScale,
  torsoLean,
  kneeAngles,
  elbowAngles,
  travelDirection,
  countSteps,
  buildSeries,
  mean,
  median,
  stdDev,
};
