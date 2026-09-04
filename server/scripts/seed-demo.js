// seed-demo.js
//
// Fills the report store with sample sessions so a fresh checkout has
// something to look at without anyone having to film a sprint.
//
// These run through the real scoring pipeline — the same code a genuine upload
// hits — using the synthetic runner from lib/synthetic.js instead of pose
// estimation on a video. The numbers are therefore real outputs of the scorer,
// not hand-written fixtures. Each report is flagged `demo: true` so the
// dashboard can say so.
//
//   npm run seed:demo      add the sample sessions
//   npm run seed:demo -- --clear   remove them again

const { makeClip } = require("../lib/synthetic");
const { scoreSprint } = require("../lib/scoring");
const store = require("../lib/store");

const UID = "demo-user";
const FPS = 24;

// An athlete improving over six weeks: the lean settles into the target band,
// knee drive comes up, and cadence quickens.
const SESSIONS = [
  { daysAgo: 42, leanDeg: -4, minKnee: 158, strideHz: 1.6, bounce: 15, asymmetry: 26 },
  { daysAgo: 35, leanDeg: 1, minKnee: 146, strideHz: 1.8, bounce: 13, asymmetry: 22 },
  { daysAgo: 21, leanDeg: 5, minKnee: 132, strideHz: 1.9, bounce: 13, asymmetry: 30 },
  { daysAgo: 12, leanDeg: 8, minKnee: 118, strideHz: 2.0, bounce: 12, asymmetry: 24 },
  { daysAgo: 3, leanDeg: 11, minKnee: 108, strideHz: 2.15, bounce: 11, asymmetry: 19 },
];

function clear() {
  const existing = store.listReports(UID);
  const demos = existing.filter((r) => r.report && r.report.demo);
  if (!demos.length) {
    console.log("No demo sessions to remove.");
    return;
  }
  // The store has no delete, so rewrite the user's list without the demos.
  store.replaceReports(
    UID,
    existing.filter((r) => !(r.report && r.report.demo))
  );
  console.log(`Removed ${demos.length} demo sessions.`);
}

function seed() {
  const now = Date.now();
  let added = 0;

  for (const session of SESSIONS) {
    const frames = makeClip(2.5, FPS, {
      leanDeg: session.leanDeg,
      minKnee: session.minKnee,
      strideHz: session.strideHz,
      bounce: session.bounce,
      asymmetry: session.asymmetry,
      speed: 260,
    });

    const report = scoreSprint(frames, FPS);
    report.demo = true;

    const createdAt = new Date(now - session.daysAgo * 86400000).toISOString();

    store.addReport(UID, {
      id: `demo-${session.daysAgo}`,
      createdAt,
      sport: "Sprint-100m",
      report,
    });

    console.log(
      `  ${createdAt.slice(0, 10)}  score ${String(report.score).padStart(3)}  ` +
        `lean ${report.measurements.avgTorsoLeanDeg}deg  ` +
        `flexion ${report.measurements.peakKneeFlexionDeg}deg`
    );
    added++;
  }

  console.log(`\nAdded ${added} demo sessions for uid "${UID}".`);
  console.log("Start the API and open http://localhost:3000/dashboard to see them.");
  console.log("Remove them later with: npm run seed:demo -- --clear");
}

if (process.argv.includes("--clear")) clear();
else seed();
