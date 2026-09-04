// index.js
//
// The Pragati analysis API.
//
//   POST /analyze   video + sport  -> a scored technique report
//   GET  /reports                  -> this athlete's past reports
//   POST /reports                  -> store a report from the browser
//   GET  /health                   -> readiness, for the frontend to probe
//
// Every route except /health requires a Firebase ID token.

require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const auth = require("./lib/auth");
const store = require("./lib/store");
const { extractFrames, cleanup, SAMPLE_FPS } = require("./lib/frames");
const { estimatePoses } = require("./lib/pose");
const { analysePose, SUPPORTED_SPORTS } = require("./lib/scoring");

const PORT = Number(process.env.PORT) || 3001;
const ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 100;

auth.init();

const app = express();

app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: "2mb" }));

// Videos land in the OS temp directory and are deleted as soon as the frames
// have been read. We never keep an athlete's footage.
const upload = multer({
  dest: path.join(os.tmpdir(), "pragati-uploads"),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("video/")) {
      return cb(Object.assign(new Error("That file is not a video."), { status: 400 }));
    }
    cb(null, true);
  },
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    supportedSports: SUPPORTED_SPORTS,
    sampleFps: SAMPLE_FPS,
    maxUploadMb: MAX_UPLOAD_MB,
    authenticationRequired: !auth.isAuthDisabled(),
  });
});

app.post("/analyze", auth.requireAuth, upload.single("video"), async (req, res, next) => {
  const videoPath = req.file && req.file.path;
  let frameDir = null;

  try {
    if (!videoPath) {
      return res.status(400).json({ error: "No video file was received." });
    }

    const sport = req.body.sport;
    if (!sport) {
      return res.status(400).json({ error: "Choose a sport before uploading." });
    }
    if (!SUPPORTED_SPORTS.includes(sport)) {
      return res.status(400).json({
        error: `Analysis for "${sport}" is not built yet. Currently supported: ${SUPPORTED_SPORTS.join(", ")}.`,
      });
    }

    const started = Date.now();

    const extracted = await extractFrames(videoPath);
    frameDir = extracted.dir;

    const { frames, backend } = await estimatePoses(extracted.files);
    const report = analysePose(sport, frames, extracted.fps);

    report.processing = {
      backend,
      framesAnalysed: extracted.files.length,
      elapsedMs: Date.now() - started,
    };

    // Persist server-side so the athlete's history survives clearing their browser.
    const saved = store.addReport(req.user.uid, {
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      sport,
      report,
    });

    res.json({ id: saved.id, createdAt: saved.createdAt, sport, report });
  } catch (err) {
    next(err);
  } finally {
    // Delete the athlete's video and every extracted frame, always.
    if (videoPath) {
      try {
        fs.unlinkSync(videoPath);
      } catch {
        /* already gone */
      }
    }
    cleanup(frameDir);
  }
});

app.get("/reports", auth.requireAuth, (req, res) => {
  res.json({ reports: store.listReports(req.user.uid) });
});

app.post("/reports", auth.requireAuth, (req, res) => {
  const { report } = req.body || {};
  if (!report || typeof report !== "object") {
    return res.status(400).json({ error: "Expected a report object in the request body." });
  }

  const saved = store.addReport(req.user.uid, {
    id: report.id,
    createdAt: report.createdAt,
    sport: report.sport || (report.report && report.report.sport),
    report: report.report || report,
  });

  res.json({ ok: true, id: saved.id });
});

// Multer's own errors carry a code rather than a status.
app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `That video is over the ${MAX_UPLOAD_MB}MB limit. Trim the clip and try again.`,
    });
  }

  const status = err.status || 500;
  if (status >= 500) console.error("[error]", err);

  res.status(status).json({
    error: status >= 500 ? "Something went wrong while analysing that video." : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`[pragati] analysis API listening on http://localhost:${PORT}`);
  console.log(`[pragati] accepting requests from ${ORIGIN}`);
  console.log(`[pragati] sports with real scoring: ${SUPPORTED_SPORTS.join(", ")}`);
});

module.exports = app;
