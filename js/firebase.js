// تهيئة Firebase (SDK v10 — Modular) لتطبيق الإسماعيلية.
// الإعدادات هنا هي إعدادات عميل الويب العامة لمشروع Firebase،
// وهي آمنة للنشر في الكود. الحماية الحقيقية في قواعد Firestore
// (القراءة للجميع، والكتابة في مجموعة services للأدمن فقط،
// وكل مستخدم يملك مستند ملفه في مجموعة users فقط)
// وفي التحقق من بريد الأدمن أدناه.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { FIREBASE_CONFIG, ADMIN_EMAIL } from './config.js';

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

// إعادة تصدير دوال المصادقة حتى تستخدمها باقي الملفات من مكان واحد.
export { onAuthStateChanged, signInWithEmailAndPassword, signOut };

export function isAdmin(user) {
  return Boolean(user && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

export function requireAdmin(user) {
  if (!user) {
    throw new Error('يجب تسجيل الدخول أولاً للقيام بهذا الإجراء.');
  }
  if (!isAdmin(user)) {
    throw new Error('ليس لديك صلاحية الإدارة. هذا الإجراء متاح لحساب الأدمن فقط.');
  }
  return user;
}
