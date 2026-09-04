// synthetic.js
//
// A runner built from known geometry, used two ways:
//
//   - the test suite asserts that a figure generated at a 12 degree lean
//     measures 12 degrees, so the scoring maths is checked against values we
//     can derive by hand rather than against "it returned something"
//   - the demo seeder turns it into sample sessions, so a fresh checkout has
//     something on the dashboard without anyone having to film a sprint
//
// Coordinates are in image space: y increases downward, matching MoveNet.

const THIGH = 90;
const SHANK = 90;
const TORSO = 120;
const HIP_HALF_WIDTH = 30;

/** Point `length` away from `origin`, `angleDeg` from straight down. */
function limbEnd(origin, angleDeg, length) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: origin.x + length * Math.sin(rad),
    y: origin.y + length * Math.cos(rad),
  };
}

/**
 * One frame of a runner.
 *
 * @param {number} t  seconds since the clip started
 * @param {object} opts
 *   leanDeg     torso lean from vertical, positive leans forward (+x)
 *   strideHz    full stride cycles per second (one cycle is two steps)
 *   minKnee     tightest knee angle reached during the cycle
 *   speed       horizontal pixels per second
 *   confidence  keypoint score stamped on every landmark
 *   bounce      vertical hip oscillation in pixels
 *   asymmetry   degrees of extra knee extension on the right leg only, so the
 *               two legs move through different ranges — real runners are
 *               never perfectly even, and the scorer should see the difference
 */
function makeFrame(t, opts = {}) {
  const {
    leanDeg = 10,
    strideHz = 2.1,
    minKnee = 100,
    speed = 260,
    confidence = 0.85,
    bounce = 8,
    asymmetry = 0,
  } = opts;

  const phase = 2 * Math.PI * strideHz * t;

  const hipCentre = {
    x: 120 + speed * t,
    y: 300 + bounce * Math.sin(2 * phase),
  };

  const leftHip = { x: hipCentre.x - HIP_HALF_WIDTH, y: hipCentre.y };
  const rightHip = { x: hipCentre.x + HIP_HALF_WIDTH, y: hipCentre.y };

  const shoulderCentre = {
    x: hipCentre.x + TORSO * Math.sin((leanDeg * Math.PI) / 180),
    y: hipCentre.y - TORSO * Math.cos((leanDeg * Math.PI) / 180),
  };
  const leftShoulder = { x: shoulderCentre.x - 40, y: shoulderCentre.y };
  const rightShoulder = { x: shoulderCentre.x + 40, y: shoulderCentre.y };

  // Legs swing half a cycle apart.
  function leg(hip, legPhase, tightestKnee) {
    const thighAngle = 28 * Math.sin(legPhase);
    const flexion = Math.max(0, Math.sin(legPhase));
    const kneeAngle = 172 - (172 - tightestKnee) * flexion;
    const shankAngle = thighAngle + (180 - kneeAngle);

    const knee = limbEnd(hip, thighAngle, THIGH);
    const ankle = limbEnd(knee, shankAngle, SHANK);
    return { knee, ankle };
  }

  const left = leg(leftHip, phase, minKnee);
  // The right leg bends less by `asymmetry` degrees, narrowing its range.
  const right = leg(rightHip, phase + Math.PI, minKnee + asymmetry);

  const points = {
    nose: { x: shoulderCentre.x, y: shoulderCentre.y - 45 },
    left_eye: { x: shoulderCentre.x - 8, y: shoulderCentre.y - 50 },
    right_eye: { x: shoulderCentre.x + 8, y: shoulderCentre.y - 50 },
    left_ear: { x: shoulderCentre.x - 16, y: shoulderCentre.y - 46 },
    right_ear: { x: shoulderCentre.x + 16, y: shoulderCentre.y - 46 },
    left_shoulder: leftShoulder,
    right_shoulder: rightShoulder,
    left_elbow: { x: leftShoulder.x - 10, y: leftShoulder.y + 55 },
    right_elbow: { x: rightShoulder.x + 10, y: rightShoulder.y + 55 },
    left_wrist: { x: leftShoulder.x - 4, y: leftShoulder.y + 100 },
    right_wrist: { x: rightShoulder.x + 4, y: rightShoulder.y + 100 },
    left_hip: leftHip,
    right_hip: rightHip,
    left_knee: left.knee,
    right_knee: right.knee,
    left_ankle: left.ankle,
    right_ankle: right.ankle,
  };

  return {
    keypoints: Object.entries(points).map(([name, p]) => ({
      name,
      x: p.x,
      y: p.y,
      score: confidence,
    })),
  };
}

/** A whole clip's worth of frames. */
function makeClip(seconds, fps, opts = {}) {
  const frames = [];
  const total = Math.round(seconds * fps);
  for (let i = 0; i < total; i++) frames.push(makeFrame(i / fps, opts));
  return frames;
}

module.exports = { makeFrame, makeClip, THIGH, SHANK, TORSO, HIP_HALF_WIDTH };
