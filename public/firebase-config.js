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

// reCAPTCHA Enterprise key ID for Firebase App Check (public — safe to embed, same as
// apiKey above; plain reCAPTCHA v3 is deprecated and no longer accepted for new App
// Check registrations). Create a "Website" key in GCP Console -> Security -> reCAPTCHA
// (score-based / no checkbox challenge), add domains rvtpub.digibuild.ch + localhost,
// then register that Key ID in Firebase Console -> App Check -> Apps -> reCAPTCHA
// Enterprise. See CAPTCHA_APP_CHECK_SETUP.md.
const APP_CHECK_RECAPTCHA_ENTERPRISE_KEY = '6LfWELQtAAAAALS7zKkWe_2aSP16szr8zPtFN60S';

// Initialize Firebase (if not already initialized)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    try {
        firebase.initializeApp(firebaseConfig);
        console.log('Firebase initialized successfully');

        // Activate App Check immediately after init, before any other Firebase calls.
        if (typeof firebase.appCheck === 'function'
            && APP_CHECK_RECAPTCHA_ENTERPRISE_KEY
            && APP_CHECK_RECAPTCHA_ENTERPRISE_KEY !== 'REPLACE_WITH_RECAPTCHA_ENTERPRISE_KEY_ID') {
            firebase.appCheck().activate(
                new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_RECAPTCHA_ENTERPRISE_KEY),
                true // auto-refresh tokens
            );
            console.log('App Check activated (reCAPTCHA Enterprise)');
        } else {
            console.warn('App Check not activated: reCAPTCHA Enterprise key not configured or SDK not loaded');
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
    }
} else if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded');
}
