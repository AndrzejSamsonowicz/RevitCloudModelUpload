// Registration Page Logic
const serverURL = window.location.origin;

// Function to wait for Firebase to be ready
function waitForFirebase(callback, maxAttempts = 50) {
    let attempts = 0;
    const checkInterval = setInterval(() => {
        attempts++;
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            clearInterval(checkInterval);
            console.log('Firebase is ready');
            callback();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.error('Firebase failed to initialize after maximum attempts');
            showAlert('Application error: Firebase failed to load. Please refresh the page.', 'error');
        }
    }, 100);
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    waitForFirebase(() => {
        initializeRegistrationForm();
    });
});

function initializeRegistrationForm() {
    // Format license key input
    const licenseKeyInput = document.getElementById('licenseKey');
    if (licenseKeyInput) {
        licenseKeyInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            let formatted = value.match(/.{1,4}/g)?.join('-') || value;
            e.target.value = formatted;
        });
    }
    
    // Password validation
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('input', (e) => {
            const password = e.target.value;
            const requirements = document.getElementById('passwordRequirements');
            
            if (!requirements) return;
            
            const hasLength = password.length >= 8;
            const hasUpper = /[A-Z]/.test(password);
            const hasLower = /[a-z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            
            if (hasLength && hasUpper && hasLower && hasNumber) {
                requirements.className = 'password-requirements valid';
                requirements.textContent = '✓ Password meets requirements';
            } else {
                requirements.className = 'password-requirements invalid';
                requirements.textContent = 'Must be at least 8 characters with uppercase, lowercase, and number';
            }
        });
    }
    
    // Registration Form Handler
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegistration);
    }
}

async function handleRegistration(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const licenseKey = document.getElementById('licenseKey').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const registerBtn = document.getElementById('registerBtn');
    
    // Validate password match
    if (password !== confirmPassword) {
        showAlert('Passwords do not match!', 'error');
        return;
    }
    
    // Validate password strength
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        showAlert('Password does not meet requirements!', 'error');
        return;
    }
    
    registerBtn.disabled = true;
    registerBtn.innerHTML = 'Creating Account... <span class="loading-spinner"></span>';
    
    try {
        const auth = firebase.auth();
        const db = firebase.firestore();
        
        // Step 1: Validate license key with server (if provided)
        // DISABLED: Manual license activation required via admin dashboard
        let licenseData = null;
        /*
        if (licenseKey) {
            const licenseResponse = await fetch(`${serverURL}/api/validate-license`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey, email })
            });
            
            licenseData = await licenseResponse.json();
            
            if (!licenseResponse.ok) {
                throw new Error(licenseData.error || 'Invalid license key');
            }
        }
        */
        
        // Step 2: Create Firebase user (native Firebase registration)
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Step 3: Send email verification (Firebase native - no backend needed!)
        const actionCodeSettings = {
            url: `${window.location.origin}/login?verified=true`,
            handleCodeInApp: false
        };
        await user.sendEmailVerification(actionCodeSettings);
        
        // Step 4: Create user document in Firestore
        await db.collection('users').doc(user.uid).set({
            email: email,
            licenseKey: licenseKey || null,
            licenseExpiry: null,
            licenseStatus: 'pending',
            emailVerified: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: null,
            encryptedClientId: '',
            encryptedClientSecret: '',
            encryptionIV: ''
        });
        
        // Step 5: Log analytics (non-blocking - don't fail registration if this fails)
        try {
            await db.collection('analytics').add({
                action: 'registration',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    email: email,
                    licenseKey: licenseKey || null
                }
            });
        } catch (analyticsError) {
            // Analytics logging failed, but registration succeeded - don't show error
            console.log('Analytics logging failed (non-critical):', analyticsError);
        }
        
        const successMessage = '✅ Account created successfully! Please check your email to verify your account. Redirecting to login...';
        showAlert(successMessage, 'success');
        
        // Disable form
        const form = document.getElementById('registerForm');
        if (form) {
            form.style.opacity = '0.5';
            form.style.pointerEvents = 'none';
        }
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
            window.location.href = '/login';
        }, 3000);
        
    } catch (error) {
        console.error('Registration error:', error);
        
        let errorMessage = 'Registration failed. Please try again.';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'An account with this email already exists.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address format.';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password is too weak. Please use a stronger password.';
                break;
            default:
                errorMessage = error.message || errorMessage;
        }
        
        showAlert(errorMessage, 'error');
        registerBtn.disabled = false;
        registerBtn.innerHTML = 'Create Account';
    }
}

// Helper Functions
function showAlert(message, type) {
    const alert = document.getElementById('alertMessage');
    if (!alert) return;
    
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.style.display = 'block';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
