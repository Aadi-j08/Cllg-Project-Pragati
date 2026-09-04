// store.js
//
// Report persistence, keyed by Firebase uid.
//
// This is a JSON file on disk, not a database. That is a deliberate scope
// choice: the interface below (list / add) is small enough that swapping in
// Firestore or Postgres later means rewriting this file and nothing else.

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "reports.json");
const MAX_PER_USER = 50;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    // Missing or corrupt file starts a fresh store rather than crashing.
    return {};
  }
}

function writeAll(db) {
  ensureDir();
  // Write to a temp file then rename, so an interrupted write cannot leave
  // the store truncated.
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

/** Every report for one user, newest first. */
function listReports(uid) {
  const db = readAll();
  return db[uid] || [];
}

/**
 * Save a report. Returns the stored record.
 * Re-saving an id that already exists updates it in place, so the frontend
 * can sync the same report twice without creating duplicates.
 */
function addReport(uid, record) {
  const db = readAll();
  const existing = db[uid] || [];

  const stored = {
    id: record.id || String(Date.now()),
    createdAt: record.createdAt || new Date().toISOString(),
    sport: record.sport || null,
    report: record.report,
  };

  const index = existing.findIndex((r) => r.id === stored.id);
  if (index >= 0) {
    existing[index] = stored;
  } else {
    existing.unshift(stored);
  }

  db[uid] = existing.slice(0, MAX_PER_USER);
  writeAll(db);
  return stored;
}

/** Replace a user's whole list. Used by the demo seeder to remove its samples. */
function replaceReports(uid, records) {
  const db = readAll();
  db[uid] = records.slice(0, MAX_PER_USER);
  writeAll(db);
  return db[uid];
}

module.exports = { listReports, addReport, replaceReports, DB_FILE };
