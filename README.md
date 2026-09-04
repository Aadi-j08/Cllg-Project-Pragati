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

Two processes: the Next.js site and the analysis API.

### 1. The analysis API

```bash
cd server
npm install
cp .env.example .env      # then edit it
npm start
```

Listens on `http://localhost:3001`.

Authentication is on by default and needs Firebase Admin credentials — set
`FIREBASE_SERVICE_ACCOUNT` (the JSON inline) or `GOOGLE_APPLICATION_CREDENTIALS`
(a path to it) in `server/.env`. For a local demo without a Firebase project, set
`ALLOW_UNAUTHENTICATED=true`; it prints a warning on every start and refuses to
run when `NODE_ENV=production`.

### 2. The site

```bash
npm install
npm run dev
```

Runs on `http://localhost:3000`. Copy the Firebase web config into `.env.local`
to enable sign-in.

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
  firebase.ts        Firebase client init
  report-pdf.ts      report → PDF, jsPDF loaded on demand
server/
  index.js           Express app
  lib/metrics.js     pure geometry over keypoints — no I/O, fully testable
  lib/scoring.js     measurements → score, phases, recommendations
  lib/pose.js        MoveNet runner with backend selection
  lib/frames.js      ffmpeg frame sampling
  lib/auth.js        Firebase ID token verification
  lib/store.js       report persistence
  test/              22 tests over the scoring maths
```

## API

| Route | Purpose |
|---|---|
| `POST /analyze` | video + sport → a scored report |
| `GET /reports` | the signed-in athlete's past reports |
| `POST /reports` | store a report |
| `GET /health` | what the API supports; the UI reads this so it can never offer a sport the backend would reject |

Every route except `/health` requires a Firebase ID token.

## Tests

```bash
cd server && npm test
```

The scoring maths is tested against a synthetic runner built from known geometry —
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
