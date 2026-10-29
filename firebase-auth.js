const config = window.NORTHGATE_FIREBASE_CONFIG || {};
const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const isConfigured = requiredConfigKeys.every((key) => (
  typeof config[key] === 'string'
  && config[key].trim() !== ''
  && !config[key].includes('YOUR_')
));

let auth = null;
let currentUser = null;
let sdkError = null;
let createUserWithEmailAndPassword;
let onAuthStateChanged;
let reload;
let signInWithEmailAndPassword;
let sendEmailVerification;
let signOut;
let updateProfile;

const LOGIN_ATTEMPTS_STORAGE_KEY = 'northgateFirebaseLoginAttempts';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MILLISECONDS = 30 * 60 * 1000;

async function loginAttemptStorageKey(email) {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readLoginAttempts() {
  const stored = localStorage.getItem(LOGIN_ATTEMPTS_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

function writeLoginAttempts(attempts) {
  localStorage.setItem(LOGIN_ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
}

const ready = (async () => {
  if (!isConfigured) return null;

  try {
    const [appSdk, authSdk] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js'),
    ]);
    createUserWithEmailAndPassword = authSdk.createUserWithEmailAndPassword;
    onAuthStateChanged = authSdk.onAuthStateChanged;
    reload = authSdk.reload;
    signInWithEmailAndPassword = authSdk.signInWithEmailAndPassword;
    sendEmailVerification = authSdk.sendEmailVerification;
    signOut = authSdk.signOut;
    updateProfile = authSdk.updateProfile;
    auth = authSdk.getAuth(appSdk.initializeApp(config));

    return await new Promise((resolve) => {
      onAuthStateChanged(auth, (user) => {
        currentUser = user;
        resolve(user);
      }, (error) => {
        sdkError = error;
        console.error('Firebase Authentication could not restore the sign-in state.', error);
        resolve(null);
      });
    });
  } catch (error) {
    sdkError = error;
    console.error('Firebase Authentication could not load.', error);
    return null;
  }
})();

async function ensureReady() {
  await ready;
  if (!isConfigured) throw new Error('Firebase is not configured yet. Follow the free setup steps in DEPLOYING.md.');
  if (sdkError) throw new Error('Firebase Authentication could not load. Check the Firebase setup and refresh the page.');
}

function emailVerificationSettings() {
  return {
    url: `${window.location.origin}${window.location.pathname}`,
  };
}

async function sendVerificationLink(user) {
  try {
    await sendEmailVerification(user, emailVerificationSettings());
    return true;
  } catch (error) {
    if (error.code !== 'auth/unauthorized-continue-uri') throw error;
    await sendEmailVerification(user);
    return false;
  }
}

window.northgateFirebaseAuth = {
  isConfigured,
  ready,
  get currentUser() {
    return currentUser;
  },
  async createAccount(email, password, displayName) {
    await ensureReady();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    try {
      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }
      const returnsToSite = await sendVerificationLink(credential.user);
      return returnsToSite;
    } finally {
      await signOut(auth);
    }
  },
  async signIn(email, password) {
    await ensureReady();
    const storageKey = await loginAttemptStorageKey(email);
    const attempts = readLoginAttempts();
    let attempt = attempts[storageKey];
    if (attempt?.lockedUntil > Date.now()) {
      const minutes = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
      throw new Error(`Too many failed sign-in attempts. Try again in ${minutes} minutes.`);
    }
    if (attempt?.lockedUntil) {
      delete attempts[storageKey];
      writeLoginAttempts(attempts);
      attempt = null;
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      delete attempts[storageKey];
      writeLoginAttempts(attempts);
      await reload(credential.user);
      if (!credential.user.emailVerified) {
        let returnsToSite;
        try {
          returnsToSite = await sendVerificationLink(credential.user);
        } finally {
          await signOut(auth);
        }
        throw new Error(returnsToSite
          ? 'Verify your email using the link we sent before signing in. We sent another verification link.'
          : 'Verify your email using the link we sent. Firebase may show a confirmation page; return here and sign in afterward.');
      }
      return credential.user;
    } catch (error) {
      if ([
        'auth/invalid-credential',
        'auth/invalid-login-credentials',
        'auth/wrong-password',
        'auth/user-not-found',
      ].includes(error.code)) {
        const failedAttempts = (attempt?.failedAttempts || 0) + 1;
        if (failedAttempts >= LOGIN_MAX_ATTEMPTS) {
          attempts[storageKey] = { failedAttempts, lockedUntil: Date.now() + LOGIN_LOCKOUT_MILLISECONDS };
          writeLoginAttempts(attempts);
          throw new Error('Too many failed sign-in attempts. Try again in 30 minutes.');
        }
        attempts[storageKey] = { failedAttempts, lockedUntil: 0 };
        writeLoginAttempts(attempts);
      }
      throw error;
    }
  },
  async signOut() {
    await ensureReady();
    await signOut(auth);
  },
};
