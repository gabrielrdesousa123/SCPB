// client/js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
// 🔥 1. TEM QUE TER ESTA IMPORTAÇÃO AQUI EM CIMA:
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js"; 

const firebaseConfig = {
  apiKey: "AIzaSyBkRrK1SmHi2IfnArOOTQzm4m8mr783-6s",
  authDomain: "bochabr.firebaseapp.com",
  projectId: "bochabr",
  storageBucket: "bochabr.firebasestorage.app",
  messagingSenderId: "636665908582",
  appId: "1:636665908582:web:24749bc17a0b5b83e88ca7"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
// 🔥 2. E TEM QUE TER ESTA LINHA AQUI NO FINAL EXPORTANDO:
export const storage = getStorage(app); 

console.log("🔥 Firebase inicializado e conectado à nuvem!");