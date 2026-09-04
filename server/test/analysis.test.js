// analysis.test.js
//
// The scoring pipeline is tested against a synthetic runner built from known
// geometry, so every assertion checks a value we can derive by hand. Run with:
//   npm test

const test = require("node:test");
const assert = require("node:assert");

const {
  jointAngle,
  torsoLean,
  countSteps,
  byName,
  median,
  mean,
} = require("../lib/metrics");

const {
  analysePose,
  scoreSprint,
  bandScore,
  lowerIsBetter,
  peakFlexion,
  describePosture,
} = require("../lib/scoring");

// The synthetic runner lives in lib/synthetic.js so the demo seeder can use
// the same geometry these tests assert against.
const { makeFrame, makeClip } = require("../lib/synthetic");

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

test("jointAngle measures a right angle", () => {
  const a = { x: 0, y: 0, score: 1 };
  const b = { x: 0, y: 10, score: 1 };
  const c = { x: 10, y: 10, score: 1 };
  assert.strictEqual(Math.round(jointAngle(a, b, c)), 90);
});

test("jointAngle measures a straight limb as 180 degrees", () => {
  const a = { x: 0, y: 0, score: 1 };
  const b = { x: 0, y: 10, score: 1 };
  const c = { x: 0, y: 20, score: 1 };
  assert.strictEqual(Math.round(jointAngle(a, b, c)), 180);
});

test("jointAngle refuses to guess when a landmark is low confidence", () => {
  const a = { x: 0, y: 0, score: 1 };
  const b = { x: 0, y: 10, score: 0.05 };
  const c = { x: 10, y: 10, score: 1 };
  assert.strictEqual(jointAngle(a, b, c), null);
});

test("torsoLean reports forward lean as positive when running right", () => {
  const kp = byName(makeFrame(0, { leanDeg: 12 }).keypoints);
  const lean = torsoLean(kp, 1);
  assert.ok(Math.abs(lean - 12) < 0.5, `expected ~12, got ${lean}`);
});

test("torsoLean flips sign with direction of travel", () => {
  const kp = byName(makeFrame(0, { leanDeg: 12 }).keypoints);
  assert.ok(torsoLean(kp, -1) < 0);
});

test("torsoLean reports leaning back as negative", () => {
  const kp = byName(makeFrame(0, { leanDeg: -7 }).keypoints);
  const lean = torsoLean(kp, 1);
  assert.ok(lean < 0, `expected negative, got ${lean}`);
});

// ---------------------------------------------------------------------------
// Step counting
// ---------------------------------------------------------------------------

test("countSteps finds two steps per stride cycle", () => {
  const fps = 30;
  const strideHz = 2;
  const seconds = 3;
  const frames = makeClip(seconds, fps, { strideHz });

  const gaps = frames.map((f) => {
    const kp = byName(f.keypoints);
    return kp.left_ankle.x - kp.right_ankle.x;
  });

  const scale = 400;
  const { steps, confident } = countSteps(gaps, scale);

  assert.ok(confident, "should be confident about a clean signal");
  const expected = seconds * strideHz * 2;
  assert.ok(
    Math.abs(steps - expected) <= 2,
    `expected about ${expected} steps, got ${steps}`
  );
});

test("countSteps refuses to count when the legs barely move", () => {
  const flat = new Array(40).fill(0.4);
  const { steps, confident } = countSteps(flat, 400);
  assert.strictEqual(steps, 0);
  assert.strictEqual(confident, false);
});

test("countSteps ignores jitter around zero", () => {
  const jitter = Array.from({ length: 40 }, (_, i) => (i % 2 ? 1.5 : -1.5));
  const { confident } = countSteps(jitter, 400);
  assert.strictEqual(confident, false);
});

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

test("bandScore gives full marks inside the band and decays outside", () => {
  assert.strictEqual(bandScore(10, 5, 15, 20), 100);
  assert.strictEqual(bandScore(5, 5, 15, 20), 100);
  assert.strictEqual(bandScore(25, 5, 15, 20), 50);
  assert.strictEqual(bandScore(35, 5, 15, 20), 0);
  assert.strictEqual(bandScore(null, 5, 15, 20), null);
});

test("lowerIsBetter rewards small values", () => {
  assert.strictEqual(lowerIsBetter(5, 8, 45), 100);
  assert.strictEqual(lowerIsBetter(45, 8, 45), 0);
  assert.strictEqual(lowerIsBetter(null, 8, 45), null);
});

test("peakFlexion returns the most bent knee angle seen", () => {
  const frames = [
    { knees: { left: 150, right: 160 } },
    { knees: { left: 102, right: 140 } },
    { knees: { left: null, right: 175 } },
  ];
  assert.strictEqual(peakFlexion(frames), 102);
});

test("describePosture distinguishes forward, upright and backward", () => {
  assert.match(describePosture(12), /forward/);
  assert.match(describePosture(0.5), /upright/);
  assert.match(describePosture(-9), /leaning back/);
  assert.strictEqual(describePosture(null), "not measurable");
});

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

test("a clean sprint clip scores well and reports real measurements", () => {
  const fps = 24;
  const frames = makeClip(2.5, fps, {
    leanDeg: 10,
    strideHz: 2.2,
    minKnee: 100,
    speed: 260,
  });

  const report = scoreSprint(frames, fps);

  assert.strictEqual(report.sport, "Sprint-100m");
  assert.ok(report.score >= 70, `expected a good score, got ${report.score}`);
  assert.ok(report.score <= 100);

  // Measurements must reflect the geometry we generated.
  assert.ok(
    Math.abs(report.measurements.avgTorsoLeanDeg - 10) < 2,
    `lean should be ~10, got ${report.measurements.avgTorsoLeanDeg}`
  );
  assert.ok(
    Math.abs(report.measurements.peakKneeFlexionDeg - 100) < 5,
    `flexion should be ~100, got ${report.measurements.peakKneeFlexionDeg}`
  );
  assert.ok(report.measurements.stepsCounted >= 8);
  assert.strictEqual(report.quality.level, "high");

  // The UI reads these exact fields.
  assert.ok(report.phases["max velocity"]);
  for (const phase of Object.values(report.phases)) {
    assert.ok(typeof phase.strideLength === "string");
    assert.ok(typeof phase.posture === "string");
    assert.ok(typeof phase.kneeAngle === "string");
    assert.ok(typeof phase.improvement === "string");
  }

  assert.ok(Array.isArray(report.recommendations));
  assert.ok(report.recommendations.length > 0);
});

test("leaning backwards scores worse than leaning forwards", () => {
  const fps = 24;
  const good = scoreSprint(makeClip(2.5, fps, { leanDeg: 10 }), fps);
  const bad = scoreSprint(makeClip(2.5, fps, { leanDeg: -12 }), fps);

  assert.ok(
    bad.breakdown.posture.score < good.breakdown.posture.score,
    "leaning back should be penalised"
  );
  assert.ok(bad.score < good.score);
});

test("poor knee drive is detected and coached", () => {
  const fps = 24;
  const stiff = scoreSprint(makeClip(2.5, fps, { minKnee: 165 }), fps);

  assert.ok(stiff.breakdown.kneeDrive.score < 60);
  assert.ok(
    stiff.recommendations.some((r) => /knee/i.test(r)),
    "should recommend knee drive work"
  );
});

test("the score is not random — the same clip scores the same twice", () => {
  const fps = 24;
  const frames = makeClip(2.5, fps, { leanDeg: 10 });
  assert.strictEqual(scoreSprint(frames, fps).score, scoreSprint(frames, fps).score);
});

test("an unreadable clip reports low confidence instead of a number", () => {
  const fps = 24;
  const frames = makeClip(2.5, fps, { confidence: 0.12 });
  const report = scoreSprint(frames, fps);

  assert.strictEqual(report.quality.level, "low");
  assert.ok(report.quality.issues.length > 0);
  assert.ok(
    report.recommendations.some((r) => /lighting|frame|short/i.test(r)),
    "should tell the athlete how to reshoot"
  );
});

test("a panning camera disables stride length rather than inventing it", () => {
  const fps = 24;
  // speed 0 means the athlete never moves across frame, as with a panning camera.
  const frames = makeClip(2.5, fps, { speed: 0 });
  const report = scoreSprint(frames, fps);

  assert.strictEqual(report.measurements.cameraMotion, "panning or static subject");
  for (const phase of Object.values(report.phases)) {
    assert.strictEqual(phase.strideLength, "not measurable");
  }
});

test("unsupported sports are refused, not faked", () => {
  assert.throws(
    () => analysePose("Swimming", makeClip(1, 24, {}), 24),
    /not implemented yet/
  );
});

test("Sprint-100m is accepted through the public entry point", () => {
  const report = analysePose("Sprint-100m", makeClip(2.5, 24, {}), 24);
  assert.ok(typeof report.score === "number");
});

test("uneven legs are detected and coached", () => {
  const fps = 24;
  const even = scoreSprint(makeClip(2.5, fps, { asymmetry: 0 }), fps);
  const uneven = scoreSprint(makeClip(2.5, fps, { asymmetry: 30 }), fps);

  assert.ok(
    uneven.measurements.kneeAsymmetryDeg > even.measurements.kneeAsymmetryDeg,
    "a leg moving through a smaller range should measure as asymmetric"
  );
  assert.ok(uneven.breakdown.symmetry.score < even.breakdown.symmetry.score);
  assert.ok(
    uneven.recommendations.some((r) => /left and right|symmet|single-leg/i.test(r)),
    "should recommend evening the legs out"
  );
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

test("mean and median ignore nulls", () => {
  assert.strictEqual(mean([2, null, 4]), 3);
  assert.strictEqual(median([5, null, 1, 3]), 3);
  assert.strictEqual(mean([null]), null);
});
