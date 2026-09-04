// firebase.js
//
// Firebase client setup.
//
// A fresh clone has no .env.local, and the Firebase SDK throws
// `auth/invalid-api-key` the moment getAuth() runs with an empty key — which
// used to break the build for anyone who had not configured Firebase yet.
// So we fall back to inert placeholder values and expose a flag saying whether
// the real thing is configured. The app builds and runs out of the box; only
// sign-in is unavailable until real credentials are supplied.

import { initializeApp, getApps, getApp } from "firebase/app"
import { getAuth } from "firebase/auth"

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

/** True only when a real Firebase project has been configured. */
export const isFirebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.appId
)

// Placeholders are syntactically valid so the SDK initialises quietly; any
// actual auth call against them fails, which is the correct outcome.
const firebaseConfig = isFirebaseConfigured
  ? config
  : {
      apiKey: "not-configured",
      authDomain: "not-configured.firebaseapp.com",
      projectId: "not-configured",
      storageBucket: "not-configured.appspot.com",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:0000000000000000000000",
    }

// getApps() guards against re-initialising during hot reload.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth = getAuth(app)
export default app
