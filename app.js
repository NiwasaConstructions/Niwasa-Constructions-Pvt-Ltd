// Firebase SDKs import කිරීම
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
// Database සහ Auth import කිරීම
import { getFirestore, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

// ඔයාගේ Firebase config එක
const firebaseConfig = {
  apiKey: "AIzaSyCGMzbzofR43a0RfrZxwt_M1--8INcxbxc",
  authDomain: "erp---niwasa-payments.firebaseapp.com",
  projectId: "erp---niwasa-payments",
  storageBucket: "erp---niwasa-payments.firebasestorage.app",
  messagingSenderId: "233686322429",
  appId: "1:233686322429:web:bf5b1ed5e54a09479e8294",
  measurementId: "G-LWC9VL02QS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app); // Database instance එක
const auth = getAuth(app);    // Auth instance එක

// UI Elements
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

// 1. User Login වෙලාද කියලා Check කිරීම
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User ලොග් වෙලා නම් Dashboard එක පෙන්නන්න
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    console.log("User logged in:", user.email);
  } else {
    // ලොග් වෙලා නැත්නම් Login එක පෙන්නන්න
    loginSection.style.display = 'block';
    dashboardSection.style.display = 'none';
  }
});

// 2. Login Button Click එක
loginBtn.addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            alert("Login Successful!");
        })
        .catch((error) => {
            alert("Error: " + error.message);
        });
});

// 3. Logout Button Click එක
logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        alert("Logged out successfully");
    }).catch((error) => {
        console.error(error);
    });
});