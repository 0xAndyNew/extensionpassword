/**
 * Firebase Configuration template for Aegis Vault Chrome Extension.
 * Copy this file to firebase-config.js and replace the placeholders locally.
 * Never commit firebase-config.js with live project values.
 */
export const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

export function isFirebaseConfigured() {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
    !FIREBASE_CONFIG.apiKey.includes("YOUR_FIREBASE_API_KEY") &&
    !FIREBASE_CONFIG.apiKey.includes("*") &&
    FIREBASE_CONFIG.projectId &&
    !FIREBASE_CONFIG.projectId.includes("YOUR_PROJECT_ID") &&
    !FIREBASE_CONFIG.projectId.includes("*")
  );
}
