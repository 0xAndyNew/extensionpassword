/**
 * Firebase Configuration for Aegis Vault Chrome Extension.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD2GbYxdplwoaar3hsbqL2QJYpie7Ui3Ds",
  authDomain: "extension-login-60851.firebaseapp.com",
  projectId: "extension-login-60851",
  storageBucket: "extension-login-60851.firebasestorage.app",
  messagingSenderId: "846050632481",
  appId: "1:846050632481:web:fa5fa47cf12824f2b19460",
  measurementId: "G-CMGJYS07X4"
};

/**
 * Validates whether the Firebase configuration has been populated with valid keys.
 */
export function isFirebaseConfigured() {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
    !FIREBASE_CONFIG.apiKey.includes("YOUR_FIREBASE_API_KEY") &&
    FIREBASE_CONFIG.projectId &&
    !FIREBASE_CONFIG.projectId.includes("YOUR_PROJECT_ID")
  );
}
