/* Firebase React
 src/firebase.js
 2026-02-16 - Joao Taveira (jltaveira@gmail.com) */
 
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBxuRL9jqitNP4AMhGT5jTLvv-zyRMbksg",
  authDomain: "azimute-b1655.firebaseapp.com",
  projectId: "azimute-b1655",
  storageBucket: "azimute-b1655.firebasestorage.app",
  messagingSenderId: "905979775988",
  appId: "1:905979775988:web:991c25ac4150f136a587a1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);