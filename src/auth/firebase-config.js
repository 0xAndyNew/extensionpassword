/**
 * Firebase Configuration for Aegis Vault Chrome Extension.
 */
export const FIREBASE_CONFIG = {
  apiKey: "*******************************************",
  authDomain: "extension-********.firebaseapp.com",
  projectId: "extension-*********",
  storageBucket: "extension-*********.firebasestorage.app",
  messagingSenderId: "*********",
  appId: "1:************************",
  measurementId: "G-CMGJ******"
};

/**
 * Validates whether the Firebase configuration has been populated with valid keys.
 */
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
