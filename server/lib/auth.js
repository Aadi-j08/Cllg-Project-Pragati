// auth.js
//
// Verifies the Firebase ID token the browser sends with every upload.
//
// Credentials are read from the environment, never from a file committed next
// to the code. Set ONE of:
//   FIREBASE_SERVICE_ACCOUNT       the service account JSON, inline
//   GOOGLE_APPLICATION_CREDENTIALS a path to the service account JSON file
//
// With neither set, the server starts in demo mode: authentication is skipped
// and every request is the same demo user. That path is deliberately loud — it
// prints a banner on every start — and it is refused outright when NODE_ENV is
// "production", so the convenience can never reach a deployment.

const admin = require("firebase-admin");

let initialised = false;
let authDisabled = false;

function loadCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) {
    try {
      return admin.credential.cert(JSON.parse(inline));
    } catch (err) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON: ${err.message}`
      );
    }
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // The Admin SDK reads this variable itself.
    return admin.credential.applicationDefault();
  }

  return null;
}

function init() {
  if (initialised) return;
  initialised = true;

  const credential = loadCredential();

  if (credential) {
    admin.initializeApp({ credential });
    console.log("[auth] Firebase Admin ready — uploads require a valid ID token.");
    return;
  }

  // Production must never run without real credentials, whatever the flags say.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT or " +
        "GOOGLE_APPLICATION_CREDENTIALS before running in production."
    );
  }

  // Outside production, an unconfigured checkout runs in demo mode rather than
  // refusing to start — someone evaluating the project should be able to clone
  // it and see it work. The warning makes the trade-off impossible to miss.
  authDisabled = true;
  console.warn(
    "\n[auth] ---------------------------------------------------------------\n" +
      "[auth] Running in DEMO MODE: authentication is disabled.\n" +
      "[auth] Every request is treated as the same demo user.\n" +
      "[auth] Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS\n" +
      "[auth] in server/.env to require real sign-in.\n" +
      "[auth] ---------------------------------------------------------------\n"
  );
}

/**
 * Express middleware. Attaches `req.user = { uid, email }` or rejects with 401.
 */
async function requireAuth(req, res, next) {
  if (authDisabled) {
    req.user = { uid: "demo-user", email: "demo@localhost" };
    return next();
  }

  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      error: "Sign in required. No authentication token was sent with this request.",
    });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err) {
    const expired = err.code === "auth/id-token-expired";
    res.status(401).json({
      error: expired
        ? "Your session expired. Sign in again and retry the upload."
        : "That authentication token was not valid.",
    });
  }
}

module.exports = { init, requireAuth, isAuthDisabled: () => authDisabled };
