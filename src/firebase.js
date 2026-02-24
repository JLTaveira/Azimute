/* Firebase React
 src/firebase.js
 2026-02-16 - Joao Taveira (jltaveira@gmail.com) */
 
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions"; // 🚨 Importante para as Cloud Functions

const firebaseConfig = {
  apiKey: "AIzaSyBxuRL9jqitNP4AMhGT5jTLvv-zyRMbksg",
  authDomain: "azimute-b1655.firebaseapp.com",
  projectId: "azimute-b1655",
  storageBucket: "azimute-b1655.firebasestorage.app",
  messagingSenderId: "905979775988",
  appId: "1:905979775988:web:991c25ac4150f136a587a1"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Inicializa os serviços
const auth = getAuth(app);
const db = getFirestore(app);

// Inicializa as Functions com a região correta (Portugal usa europe-west1)
// Se não definires a região aqui, ele assume 'us-central1' e vai dar erro ao chamar
const functions = getFunctions(app, "europe-west1"); 

// 🚨 EXPORTAÇÃO ÚNICA E LIMPA NO FINAL
export { auth, db, functions };