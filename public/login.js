// Login Page JavaScript
// Firebase is already initialized in firebase-config.js

const auth = firebase.auth();
const db = firebase.firestore();

// Server URL
const serverURL = window.location.origin;

// Rate limiting (more user-friendly settings)
let loginAttempts = parseInt(localStorage.getItem('loginAttempts') || '0');
const MAX_LOGIN_ATTEMPTS = 10; // Increased from 5 to 10
const LOCKOUT_TIME = 5 * 60 * 1000; // Reduced from 15 to 5 minutes
let lockoutUntil = parseInt(localStorage.getItem('lockoutUntil') || '0') || null;

// Flag to prevent auto-redirect after manual logout
let justLoggedOut = false;

// Store email for resend verification
let pendingVerificationEmail = null;

// Initialize event listeners
function initializeEventListeners() {
    // Purchase button
    const purchaseBtn = document.getElementById('purchaseBtn');
    if (purchaseBtn) {
        purchaseBtn.addEventListener('click', () => {
            window.location.href = '/purchase';
        });
    }
    
    // Resend verification button
    const resendVerificationBtn = document.getElementById('resendVerificationBtn');
    if (resendVerificationBtn) {
        resendVerificationBtn.addEventListener('click', resendVerificationEmail);
    }
    
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Forgot password link
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('resetPasswordModal').style.display = 'flex';
            const email = document.getElementById('email').value;
            if (email) {
                document.getElementById('resetEmail').value = email;
            }
        });
    }
    
    // Reset password form
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handlePasswordReset);
    }
    
    // Close modal button
    const closeResetModalBtn = document.getElementById('closeResetModalBtn');
    if (closeResetModalBtn) {
        closeResetModalBtn.addEventListener('click', closeResetModal);
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('resetPasswordModal');
        if (event.target === modal) {
            closeResetModal();
        }
    });
}

// Check if user is already logged in
auth.onAuthStateChanged(async (user) => {
    // If user just logged out, don't auto-redirect
    if (justLoggedOut) {
        return;
    }
    
    if (user) {
        // Force reload user to get latest emailVerified status
        await user.reload();
        
        // Check if email is verified
        if (!user.emailVerified) {
            showAlert('Please verify your email before logging in. Check your inbox.', 'error');
            await auth.signOut();
            return;
        }
        
        // Show "Already logged in" message instead of auto-redirecting
        showAlert('You are already logged in. Click Logout to sign out or wait to be redirected.', 'info');
        
        // Delay redirect by 3 seconds to give user time to logout if needed
        setTimeout(async () => {
            try {
                // Get auth token
                const token = await user.getIdToken();
                
                // Validate login with server
                const response = await fetch(`${window.location.origin}/api/auth/verify`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                const data = await response.json();
                
                if (!response.ok || !data.success) {
                    showAlert(data.error || 'Login validation failed', 'error');
                    await auth.signOut();
                    return;
                }
                
                // Update last login time
                await fetch(`${window.location.origin}/api/auth/update-last-login`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                // Redirect based on user role
                showAlert('Login successful! Redirecting...', 'success');
                if (data.user.isAdmin) {
                    window.location.href = '/admin';
                } else {
                    window.location.href = '/';
                }
                
            } catch (error) {
                console.error('Error validating login:', error);
                showAlert('Error validating login. Please try again.', 'error');
                await auth.signOut();
            }
        }, 3000); // 3 second delay
    }
});

// Login Form Handler
async function handleLogin(e) {
    e.preventDefault();
    
    // Hide email not verified section
    document.getElementById('emailNotVerified').style.display = 'none';
    
    // Check rate limiting
    if (lockoutUntil && Date.now() < lockoutUntil) {
        const remainingTime = Math.ceil((lockoutUntil - Date.now()) / 60000);
        showAlert(`Too many failed attempts. Please try again in ${remainingTime} minutes.`, 'error');
        return;
    }
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    
    loginBtn.disabled = true;
    loginBtn.innerHTML = 'Logging in... <span class="loading-spinner"></span>';
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Force reload user to get latest emailVerified status from server
        await user.reload();
        
        // Check email verification
        if (!user.emailVerified) {
            pendingVerificationEmail = user;
            document.getElementById('emailNotVerified').style.display = 'block';
            document.getElementById('alertMessage').style.display = 'none';
            await auth.signOut();
            loginBtn.disabled = false;
            loginBtn.innerHTML = 'Log In';
            return;
        }
        
        // Reset login attempts on success
        loginAttempts = 0;
        lockoutUntil = null;
        localStorage.removeItem('loginAttempts');
        localStorage.removeItem('lockoutUntil');
        
        showAlert('Login successful! Redirecting...', 'success');
        // Redirect handled by onAuthStateChanged
        
    } catch (error) {
        console.error('Login error:', error);
        loginAttempts++;
        localStorage.setItem('loginAttempts', loginAttempts.toString());
        
        if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            lockoutUntil = Date.now() + LOCKOUT_TIME;
            localStorage.setItem('lockoutUntil', lockoutUntil.toString());
            showAlert(`Too many failed attempts. Please try again in 5 minutes.`, 'error');
        } else {
            let errorMessage = 'Login failed. Please check your credentials.';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email.';
                    break;
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    errorMessage = `Incorrect email or password. ${MAX_LOGIN_ATTEMPTS - loginAttempts} attempts remaining. Forgot your password?`;
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address format.';
                    break;
                case 'auth/user-disabled':
                    errorMessage = 'This account has been disabled. Contact support.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Too many requests. Please try again later.';
                    break;
            }
            
            showAlert(errorMessage, 'error');
        }
        
        loginBtn.disabled = false;
        loginBtn.innerHTML = 'Log In';
    }
}

// Reset Password Form Handler
async function handlePasswordReset(e) {
    e.preventDefault();
    
    const email = document.getElementById('resetEmail').value.trim();
    const resetBtn = document.getElementById('resetBtn');
    
    resetBtn.disabled = true;
    resetBtn.innerHTML = 'Sending... <span class="loading-spinner"></span>';
    
    try {
        // Use Firebase's native password reset (more reliable than custom backend)
        await auth.sendPasswordResetEmail(email, {
            url: `${window.location.origin}/login`,
            handleCodeInApp: false
        });
        
        showModalAlert('Password reset email sent! Check your inbox.', 'success');
        
        setTimeout(() => {
            closeResetModal();
        }, 3000);
        
    } catch (error) {
        console.error('Password reset error:', error);
        
        let errorMessage = 'Failed to send reset email.';
        switch (error.code) {
            case 'auth/user-not-found':
                // Don't reveal if email exists for security
                errorMessage = 'If an account exists with this email, a password reset link will be sent.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many requests. Please try again later.';
                break;
            default:
                errorMessage = error.message || errorMessage;
        }
        
        showModalAlert(errorMessage, error.code === 'auth/user-not-found' ? 'success' : 'error');
    } finally {
        resetBtn.disabled = false;
        resetBtn.innerHTML = 'Send Reset Link';
    }
}

// Resend Verification Email
async function resendVerificationEmail() {
    try {
        const email = document.getElementById('email').value.trim();
        
        if (!email) {
            showAlert('Please enter your email address first.', 'error');
            return;
        }
        
        // Call backend API to resend verification
        const response = await fetch(`${serverURL}/api/auth/resend-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to resend verification email');
        }
        
        // Show success message
        document.getElementById('emailNotVerified').style.display = 'none';
        showAlert('Verification email sent! Please check your inbox (including spam folder).', 'success');
        
    } catch (error) {
        console.error('Resend verification error:', error);
        showAlert(error.message || 'Failed to resend verification email. Please try again.', 'error');
    }
}

// Helper Functions
function showAlert(message, type) {
    const alert = document.getElementById('alertMessage');
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.style.display = 'block';
    document.getElementById('emailNotVerified').style.display = 'none';
    
    if (type === 'success') {
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }
}

function showModalAlert(message, type) {
    const alert = document.getElementById('modalAlert');
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.style.display = 'block';
}

function closeResetModal() {
    document.getElementById('resetPasswordModal').style.display = 'none';
    document.getElementById('modalAlert').style.display = 'none';
    document.getElementById('resetPasswordForm').reset();
}

// Logout function (exposed globally for potential use)
window.handleLogout = async function() {
    try {
        justLoggedOut = true; // Prevent auto-redirect
        
        // Sign out from Firebase
        await auth.signOut();
        
        // Clear all local storage
        localStorage.clear();
        
        // Clear session storage
        sessionStorage.clear();
        
        // Clear any cookies (if applicable)
        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        
        showAlert('Logged out successfully. You can now login as a different user.', 'success');
        
        // Keep the flag set to prevent re-login
        setTimeout(() => {
            justLoggedOut = false; // Reset after 2 seconds
        }, 2000);
        
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('Error logging out. Please try again.', 'error');
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeEventListeners);
