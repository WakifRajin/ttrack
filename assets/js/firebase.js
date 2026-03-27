import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithRedirect,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ============================================================
// 🔥 INTEGRATED REAL FIREBASE CONFIGURATION
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyC8oo9OfFR_oJfBvK3mKw425TnCoWEG6zs",
  authDomain: "tuitionpro-d1856.firebaseapp.com",
  projectId: "tuitionpro-d1856",
  storageBucket: "tuitionpro-d1856.firebasestorage.app",
  messagingSenderId: "475690490967",
  appId: "1:475690490967:web:6511277326958ee96f5712",
  measurementId: "G-7Y7VHXZ2VL",
};
// ============================================================

const configured = true; // It is configured now!
let auth, db, unsub;

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  // Auth state
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      window.__user = user;
      showApp(user);
      await loadCloud(user.uid);
      startRealtimeSync(user.uid);
    } else {
      window.__user = null;
      if (!window.__offlineMode) showAuthScreen();
    }
  });

  // Sign-in handlers exposed to global scope
  window.__fbSignIn = (email, pass) =>
    signInWithEmailAndPassword(auth, email, pass);
  window.__fbSignUp = async (email, pass, name) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (name) await updateProfile(cred.user, { displayName: name });
    return cred;
  };
  window.__fbSignOut = () => signOut(auth);
  window.__fbGoogleSignIn = () =>
    signInWithRedirect(auth, new GoogleAuthProvider());
  window.__fbReady = true;
} else {
  console.info("TuitionPro: Firebase not configured. Running in local mode.");
  window.__fbReady = false;
}

async function loadCloud(uid) {
  try {
    setSyncStatus("syncing");
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const d = snap.data();
      if (d.appData) {
        window.appData = d.appData;
        window.prefs = d.prefs || window.prefs;
        localStorage.setItem("tuitionData_v2", JSON.stringify(window.appData));
        localStorage.setItem("tuitionPrefs", JSON.stringify(window.prefs));
        window.renderAll?.();
        window.applyPrefs?.();
      }
    }
    setSyncStatus("online");
    showToast("☁️ Data synced");
  } catch (e) {
    console.warn("Load error:", e);
    setSyncStatus("offline");
  }
}

function startRealtimeSync(uid) {
  if (unsub) unsub();
  unsub = onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const d = snap.data();
    if (!d.appData) return;
    const cloudTime = d.lastUpdated?.toMillis() || 0;
    const localTime = window.__lastSaveTime || 0;
    if (cloudTime > localTime) {
      window.appData = d.appData;
      window.prefs = d.prefs || window.prefs;
      localStorage.setItem("tuitionData_v2", JSON.stringify(window.appData));
      window.renderAll?.();
    }
  });
}

window.__saveToCloud = async () => {
  if (!window.__user || !configured) return;
  try {
    setSyncStatus("syncing");
    window.__lastSaveTime = Date.now();
    await setDoc(
      doc(db, "users", window.__user.uid),
      {
        appData: window.appData,
        prefs: window.prefs,
        lastUpdated: serverTimestamp(),
        userEmail: window.__user.email,
        userName: window.__user.displayName || "",
      },
      { merge: true },
    );
    setSyncStatus("online");
  } catch (e) {
    console.warn("Save error:", e);
    setSyncStatus("offline");
  }
};

window.manualSync = async () => {
  if (!window.__user) {
    showToast("⚠️ Not signed in");
    return;
  }
  await loadCloud(window.__user.uid);
  showToast("🔄 Sync complete");
};

// Auth UI helpers (called from non-module script)
window.submitAuth = async () => {
  if (!window.__fbReady) {
    window.useOffline();
    return;
  }
  const email = document.getElementById("auth-email").value.trim();
  const pass = document.getElementById("auth-password").value;
  const isSignup = document
    .getElementById("tab-signup")
    .classList.contains("active");
  const errEl = document.getElementById("auth-error");
  errEl.style.display = "none";
  if (!email || !pass) {
    showAuthErr("Please fill in all fields.");
    return;
  }
  const btn = document.getElementById("auth-submit-btn");
  btn.textContent = "⏳ Please wait…";
  btn.disabled = true;
  try {
    if (isSignup) {
      const confirm = document.getElementById("auth-confirm").value;
      const name = document.getElementById("auth-name").value.trim();
      if (pass !== confirm) {
        showAuthErr("Passwords do not match.");
        resetBtn();
        return;
      }
      if (pass.length < 6) {
        showAuthErr("Password must be 6+ characters.");
        resetBtn();
        return;
      }
      await window.__fbSignUp(email, pass, name);
    } else {
      await window.__fbSignIn(email, pass);
    }
  } catch (e) {
    const msgs = {
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/email-already-in-use": "Email already registered.",
      "auth/invalid-email": "Invalid email address.",
      "auth/too-many-requests": "Too many attempts. Try again later.",
      "auth/network-request-failed": "Network error. Check your connection.",
      "auth/invalid-credential": "Invalid email or password.",
    };
    showAuthErr(msgs[e.code] || e.message);
    resetBtn();
  }
  function resetBtn() {
    btn.textContent = isSignup ? "Create Account" : "Sign In";
    btn.disabled = false;
  }
};

window.signInGoogle = async () => {
  if (!window.__fbReady) {
    window.useOffline();
    return;
  }
  try {
    await window.__fbGoogleSignIn();
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user") showAuthErr(e.message);
  }
};

window.signOutUser = async () => {
  if (unsub) unsub();
  if (window.__fbReady) await window.__fbSignOut();
  window.__user = null;
  window.__offlineMode = false;
  window.appData = { students: [], sessions: [], payments: [] };
  hideApp();
  showAuthScreen();
  showToast("👋 Signed out");
};

function showApp(user) {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("main-header").classList.remove("hidden");
  document.getElementById("main-content").classList.remove("hidden");
  document.getElementById("main-nav").classList.remove("hidden");
  const init = (user.displayName || user.email || "?").charAt(0).toUpperCase();
  document.getElementById("avatar-btn").textContent = init;
  document.getElementById("panel-name").textContent =
    user.displayName || "User";
  document.getElementById("panel-email").textContent =
    user.email || "Offline mode";
  document.getElementById("settings-sync-info").innerHTML = user.email
    ? `Signed in as <strong>${user.email}</strong>.<br>Data syncs automatically to the cloud.`
    : `Running in <strong>offline mode</strong>. Data stored locally only.`;
  window.renderAll?.();
  window.applyPrefs?.();
}

function hideApp() {
  ["main-header", "main-content", "main-nav"].forEach((id) =>
    document.getElementById(id).classList.add("hidden"),
  );
}

function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
}

function setSyncStatus(s) {
  const bar = document.getElementById("sync-bar");
  const dot = document.getElementById("sync-dot");
  const txt = document.getElementById("sync-txt");
  const btn = document.getElementById("sync-btn");
  if (s === "syncing") {
    bar.className = "syncing";
    dot && (dot.className = "sync-dot syncing");
    txt && (txt.textContent = "Syncing…");
    btn && (btn.textContent = "🔄");
  } else if (s === "online") {
    bar.className = "done";
    setTimeout(() => {
      bar.className = "";
    }, 900);
    dot && (dot.className = "sync-dot");
    txt && (txt.textContent = "Synced ✓");
    btn && (btn.textContent = "☁️");
  } else {
    bar.className = "";
    dot && (dot.className = "sync-dot offline");
    txt && (txt.textContent = "Offline");
    btn && (btn.textContent = "⚠️");
  }
}

function showAuthErr(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = "⚠️ " + msg;
  el.style.display = "block";
}

window.useOffline = () => {
  window.__offlineMode = true;
  showApp({ displayName: "Local User", email: null });
  setSyncStatus("offline");
};

// If Firebase not configured, make offline automatic after 0.5s
if (!configured) {
  setTimeout(() => {
    if (!window.__user) window.useOffline();
  }, 500);
}
