import { initializeApp } from 'firebase/app';
import { doc, initializeFirestore, onSnapshot, setDoc } from 'firebase/firestore';

const app = initializeApp({
    apiKey: 'AIzaSyBM0DZHR1EimSQ7ryKuteskO7-jSqw2BKk',
    authDomain: 'brownbook-a3b2a.firebaseapp.com',
    projectId: 'brownbook-a3b2a',
    storageBucket: 'brownbook-a3b2a.firebasestorage.app',
    messagingSenderId: '1094771313188',
    appId: '1:1094771313188:web:5791fe85b1e9a9e5fb66b1'
});

// Auto-detect long polling so proxies/VPNs that break WebChannel streaming fall back
// automatically instead of hanging the connection.
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
export { doc, onSnapshot, setDoc };
