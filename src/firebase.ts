
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyAx26g-gG3rG39FRjSHck7tDhk8YYYkBJE",
  authDomain: 'mindoro-scape.firebaseapp.com',
  projectId: 'mindoro-scape',
  storageBucket: 'mindoro-scape.firebasestorage.app',
  messagingSenderId: '44473060599',
  appId: '1:44473060599:web:61678ca4b80a7732fcd7f2',
  measurementId: 'G-KGRD92ETH7',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

export default app;
