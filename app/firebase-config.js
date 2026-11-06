// Firebase-opsætning for Plejer (projekt plejer-9fcbb, data i eur3).
// Værdierne er offentlige web-nøgler. Adgangen til data styres af firestore.rules.
// Sæt PLEJER_FIREBASE til null for at køre i demotilstand, hvor alt ligger på telefonen.
self.PLEJER_FIREBASE = {
  config: {
    apiKey: "AIzaSyACQdqJEe2LD5YL30Xmm_2POx3J7FQCwE0",
    authDomain: "plejer-9fcbb.firebaseapp.com",
    projectId: "plejer-9fcbb",
    storageBucket: "plejer-9fcbb.firebasestorage.app",
    messagingSenderId: "134051275040",
    appId: "1:134051275040:web:8eb8146165b501dfdeb745"
  },
  // Cloud Messaging > Web Push-certifikater > Nøglepar
  vapidKey: "BPwipLqT7a507tz4ECfSw-o-5wcOdIyhKpPHsIOXIsNm5itDpIPNxzVVnU8ASHM8R_QWAk_uMsu07vVHQ0O4jNI"
};
