// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBOwsd3bA7o301zZ3cjuzSy6gH0pEQXjQs",
    authDomain: "zenfocus-abd8a.firebaseapp.com",
    projectId: "zenfocus-abd8a",
    storageBucket: "zenfocus-abd8a.firebasestorage.app",
    messagingSenderId: "453053424918",
    appId: "1:453053424918:web:d8364c9cc90b3e56a01c37",
    measurementId: "G-CT1M179ZR7"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();