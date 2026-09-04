# Pragati — AI Sports Lab

Technique analysis for young athletes. Upload a video of a sprint, and pose
estimation measures posture, knee drive, cadence and symmetry from the footage,
then scores the run against coaching targets.

Built for athletes in villages and low-income communities, where a coach's eye is
scarce but a phone camera is not.

---

## What it actually does

A video goes in. ffmpeg samples it into frames, MoveNet finds 17 body landmarks
in each one, and a scoring pass turns that motion into five measured components:

| Component | Measured from | Target |
|---|---|---|
| Torso lean | Shoulder–hip line against vertical, signed by direction of travel | 5–15° forward |
| Knee drive | Smallest hip–knee–ankle angle reached in the cycle | 85–115° peak flexion |
| Cadence | Zero crossings of the signed ankle gap over clip duration | 240–300 steps/min |
| Symmetry | Difference between left and right knee ranges of motion | under 8° |
| Vertical bounce | Standard deviation of hip height, over body height | under 4% |

Weighted into a 0–100 score. **Every number traces back to a measurement** — where
the video does not support one, the report says "not measurable" rather than
guessing. A clip filmed with a panning camera disables stride length; a clip too
dark to read reports low confidence instead of a confident wrong answer.

Currently only **Sprint-100m** has real scoring behind it. Other sports are
refused by the API rather than given invented numbers.

---

## Running it

Needs Node 18+. **No configuration required** — clone it and both halves run.

Two processes: the analysis API and the site.

```bash
# 1. the analysis API
cd server
npm install
npm run seed:demo     # optional: sample sessions so the dashboard is not empty
npm start             # http://localhost:3001

# 2. the site, in a second terminal
cd ..
npm install
npm run dev           # http://localhost:3000
```

With no `.env` present the API starts in **demo mode**: authentication is
skipped, every request is the same demo user, and it prints a banner saying so.
It refuses to start that way when `NODE_ENV=production`.

### Turning the real features on

Copy `.env.example` to `.env.local` (site) and `server/.env.example` to
`server/.env` (API), then fill in what you need:

| To enable | Set |
|---|---|
| Sign in / sign up | the `NEXT_PUBLIC_FIREBASE_*` values in `.env.local` |
| Real auth on the API | `FIREBASE_SERVICE_ACCOUNT` or `GOOGLE_APPLICATION_CREDENTIALS` in `server/.env` |
| The site chatbot | `N8N_WEBHOOK_URL` in `.env.local` |

Without them the site still builds and runs; sign-in and the chatbot report a
clear error rather than breaking the page.

### Seeing the analysis without filming a sprint

`npm run seed:demo` in `server/` writes five sample sessions showing an athlete
improving over six weeks. They are scored by the **real pipeline** — the same
code an upload hits, fed the synthetic runner from `lib/synthetic.js` instead of
pose estimation on a video — so the numbers are genuine scorer output, not
hand-written fixtures. The dashboard labels them as samples.
Remove them with `npm run seed:demo -- --clear`.

To analyse an actual video, film side-on for about five seconds and upload it at
`/upload`. The first analysis downloads the MoveNet model, so it needs an
internet connection and takes longer than later ones.

---

## Layout

```
app/
  page.tsx           landing page
  login/             sign in and sign up (Firebase Auth)
  upload/            record guidelines, upload, analysis result
  dashboard/         score history, trend, per-session breakdown
  api/chat/          chatbot route, proxies to an n8n workflow
components/ui/       the 11 UI primitives this project actually uses
hero-section.tsx     landing hero with the photo crossfade
lib/
  api.ts             the only place that knows the API's address
  firebase.js        Firebase client init, tolerant of missing config
  report-pdf.ts      report → PDF, jsPDF loaded on demand
server/
  index.js           Express app
  lib/metrics.js     pure geometry over keypoints — no I/O, fully testable
  lib/scoring.js     measurements → score, phases, recommendations
  lib/pose.js        MoveNet runner with backend selection
  lib/frames.js      ffmpeg frame sampling
  lib/auth.js        Firebase ID token verification
  lib/store.js       report persistence
  lib/synthetic.js   a runner built from known geometry, for tests and the seeder
  scripts/seed-demo  sample sessions for a fresh checkout
  test/              23 tests over the scoring maths
```

## API

| Route | Purpose |
|---|---|
| `POST /analyze` | video + sport → a scored report |
| `GET /reports` | the signed-in athlete's past reports |
| `POST /reports` | store a report |
| `GET /health` | what the API supports; the UI reads this so it can never offer a sport the backend would reject |

Every route except `/health` requires a Firebase ID token — unless the API is
running in demo mode, where the check is skipped and announced at startup.

## Tests

```bash
cd server && npm test
```

The scoring maths is tested against a synthetic runner built from known geometry
(`lib/synthetic.js`) —
a figure generated at a 12° lean measures 12°, a 100° knee flexion measures 100°,
a 2 Hz stride produces four steps per second. That means the tests check real
values rather than just "it returned something", and they run without needing a
video, a model, or a GPU.

## Notes on some choices

**No native build dependencies.** The obvious stack here is `@tensorflow/tfjs-node`
plus the `canvas` package, and both need a C++ toolchain that makes the project
painful to set up — especially on Windows. Instead `pose.js` picks the fastest
backend actually present: native if installed, otherwise WASM, otherwise plain
JavaScript. PNGs are decoded with `pngjs`. Installing
`@tensorflow/tfjs-node` in `server/` is an optional speed-up, not a requirement.

**Frames are sampled, not exhaustive.** Sprint cadence tops out near 5 steps per
second, so by Nyquist anything above ~10 fps can resolve it. Sampling at 24 fps
leaves headroom while roughly halving the model invocations on 60 fps phone
footage. On the WASM backend a 3-second clip analyses in about 20 seconds.

**Distances are normalised, not absolute.** Stride length in metres needs camera
calibration we do not have, so it is reported in body heights — shoulder-to-ankle
span scaled by the standard 0.82 shoulder-height ratio.

**The athlete's video is never kept.** It is written to a temp directory, read
into frames, and both are deleted in a `finally` block whether the analysis
succeeds or fails.

## Not done yet

- Only Sprint-100m is scored. Long jump, shot put and swimming each need their
  own measurement model.
- Reports are stored in a JSON file, not a database. The `listReports` /
  `addReport` interface is small enough that swapping in Firestore means
  rewriting `server/lib/store.js` and nothing else.
- The chatbot needs an n8n workflow URL in `N8N_WEBHOOK_URL` to answer anything.
