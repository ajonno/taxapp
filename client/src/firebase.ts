// Firebase client SDK initialization
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBqx0RDMiF7F9Sw2rNdGm41qKMP7uBX94Q",
  authDomain: "mytax-aj.firebaseapp.com",
  projectId: "mytax-aj",
  storageBucket: "mytax-aj.firebasestorage.app",
  messagingSenderId: "744189567128",
  appId: "1:744189567128:web:a01e9cf0818954033470ed",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
