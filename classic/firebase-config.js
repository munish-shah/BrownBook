import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBM0DZHR1EimSQ7ryKuteskO7-jSqw2BKk",
  authDomain: "brownbook-a3b2a.firebaseapp.com",
  projectId: "brownbook-a3b2a",
  storageBucket: "brownbook-a3b2a.firebasestorage.app",
  messagingSenderId: "1094771313188",
  appId: "1:1094771313188:web:5791fe85b1e9a9e5fb66b1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Data Reference is now managed dynamically in app.js based on localStorage ID

export { db, doc, onSnapshot, setDoc, getDoc };
