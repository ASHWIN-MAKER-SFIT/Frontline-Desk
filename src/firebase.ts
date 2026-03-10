import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCiazomyy4gMqoISaZ0nheqhOOy7bw5eHQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "aurixvoice-5d81d.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://aurixvoice-5d81d-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "aurixvoice-5d81d",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "aurixvoice-5d81d.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "607930044526",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:607930044526:web:61822b1477f50b3de7967f",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-C5XWH17TL6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics initialization (only if supported in the environment)
export const analyticsPromise = isSupported().then(yes => yes ? getAnalytics(app) : null);
