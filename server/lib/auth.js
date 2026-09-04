// auth.js
//
// Verifies the Firebase ID token the browser sends with every upload.
//
// Credentials are read from the environment, never from a file committed next
// to the code. Set ONE of:
//   FIREBASE_SERVICE_ACCOUNT       the service account JSON, inline
//   GOOGLE_APPLICATION_CREDENTIALS a path to the service account JSON file
//
// For local demos without a Firebase project, set ALLOW_UNAUTHENTICATED=true.
// That path is deliberately loud: it logs a warning on every start, and it will
// refuse to run when NODE_ENV is "production".

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

  if (process.env.ALLOW_UNAUTHENTICATED === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ALLOW_UNAUTHENTICATED cannot be used in production. Configure Firebase credentials."
      );
    }
    authDisabled = true;
    console.warn(
      "\n[auth] WARNING: running with authentication DISABLED (ALLOW_UNAUTHENTICATED=true).\n" +
        "[auth] Every request will be treated as the same demo user. Local use only.\n"
    );
    return;
  }

  throw new Error(
    "No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT or " +
      "GOOGLE_APPLICATION_CREDENTIALS, or set ALLOW_UNAUTHENTICATED=true for a local demo."
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
