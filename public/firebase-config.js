// Firebase Configuration
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
    apiKey: "AIzaSyBIBpH9SsM_8PV3UVDcz2Y-7yjGoF_9HmE",
    authDomain: "revit-publisher-firebase.firebaseapp.com",
    projectId: "revit-publisher-firebase",
    storageBucket: "revit-publisher-firebase.firebasestorage.app",
    messagingSenderId: "386481775049",
    appId: "1:386481775049:web:c2e61a304c03dc2e1a4818",
    measurementId: "G-2X25H505QW"
};

// Note: Firebase credentials are safe to use in client-side code as they
// are meant to identify your Firebase project. Access control is handled by
// Firebase Security Rules, not by keeping these credentials secret.

// Initialize Firebase (if not already initialized)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    try {
        firebase.initializeApp(firebaseConfig);
        console.log('Firebase initialized successfully');
    } catch (error) {
        console.error('Firebase initialization error:', error);
    }
} else if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded');
}
