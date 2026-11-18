// حسابات المستخدمين العاديين لتطبيق الإسماعيلية.
//
// الدخول برقم الموبايل + كلمة السر. Firebase Auth نفسه يتطلب بريداً
// إلكترونياً، لذلك نولّد بريداً داخلياً من رقم الموبايل
// (مثال: 201012345678@users.ismailia-hub.app) ولا يظهر للمستخدم أبداً.
// البريد الحقيقي اختياري ويُحفظ في ملف المستخدم في Firestore فقط.
// بيانات المستخدم تُحفظ في مجموعة `users` بمستند لكل حساب (المفتاح = uid).
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteUser
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db, ADMIN_EMAIL } from './firebase.js';

const AUTH_EMAIL_DOMAIN = 'users.ismailia-hub.app';

// تطبيع رقم موبايل مصري إلى الصيغة الدولية بدون علامة +
// (مثال: 01012345678 أو +201012345678 أو 201012345678 ← 201012345678).
// يرمي خطأً عربياً إذا لم يكن الرقم موبايل مصري صحيح.
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[\s\-()]/g, '');
  let national = digits;
  if (national.startsWith('+20')) national = '0' + national.slice(3);
  else if (national.startsWith('20')) national = '0' + national.slice(2);
  if (!/^01[0-25]\d{8}$/.test(national)) {
    throw new Error('رقم الموبايل غير صحيح. اكتب رقم موبايل مصري صحيح يبدأ بـ 01 (11 رقم).');
  }
  return {
    national,
    international: '20' + national.slice(1),
    display: '+20 ' + national.slice(1, 4) + ' ' + national.slice(4, 7) + ' ' + national.slice(7)
  };
}

function phoneToAuthEmail(phone) {
  return `${phone.international}@${AUTH_EMAIL_DOMAIN}`;
}

function validateEmailOptional(email) {
  if (!email) return '';
  const value = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    throw new Error('البريد الإلكتروني غير صحيح.');
  }
  if (value === ADMIN_EMAIL.toLowerCase()) {
    throw new Error('هذا البريد محجوز لحساب الإدارة.');
  }
  return value;
}

export function translateAuthError(err) {
  const code = err && err.code ? err.code : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'رقم الموبايل ده مسجّل قبل كده. جرّب تسجيل الدخول.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'رقم الموبايل أو كلمة السر غلط. تأكد وحاول تاني.';
    case 'auth/weak-password':
      return 'كلمة السر لازم تكون 6 أحرف على الأقل.';
    case 'auth/too-many-requests':
      return 'محاولات كتير في وقت قصير. استنى شوية وحاول تاني.';
    case 'auth/network-request-failed':
      return 'مشكلة في الاتصال بالإنترنت. تحقق من الشبكة وحاول تاني.';
    case 'auth/invalid-email':
      return 'رقم الموبايل غير صحيح.';
    default:
      return (err && err.message) || 'حصل خطأ غير متوقع. حاول مرة أخرى.';
  }
}

// إنشاء حساب جديد: الاسم + رقم الموبايل + كلمة السر (+ بريد اختياري).
export async function signUp({ name, phone, email, password }) {
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) {
    throw new Error('اكتب الاسم بالكامل.');
  }
  const cleanPhone = normalizePhone(phone);
  const cleanEmail = validateEmailOptional(email);
  if (!password || String(password).length < 6) {
    throw new Error('كلمة السر لازم تكون 6 أحرف على الأقل.');
  }

  const cred = await createUserWithEmailAndPassword(
    auth,
    phoneToAuthEmail(cleanPhone),
    String(password)
  );
  const profile = {
    name: cleanName,
    phone: cleanPhone.display,
    phoneNational: cleanPhone.national,
    email: cleanEmail,
    createdAt: serverTimestamp()
  };
  try {
    await setDoc(doc(db, 'users', cred.user.uid), profile);
  } catch (err) {
    // فشل حفظ الملف: نحذف حساب المصادقة حتى لا يبقى حساب بلا بيانات.
    try { await deleteUser(cred.user); } catch (_) {}
    throw err;
  }
  return { user: cred.user, profile };
}

// تسجيل الدخول برقم الموبايل + كلمة السر.
export async function signIn({ phone, password }) {
  const cleanPhone = normalizePhone(phone);
  if (!password) {
    throw new Error('اكتب كلمة السر.');
  }
  const cred = await signInWithEmailAndPassword(
    auth,
    phoneToAuthEmail(cleanPhone),
    String(password)
  );
  const profile = await getProfile(cred.user.uid);
  return { user: cred.user, profile };
}

// قراءة ملف المستخدم (null إذا لم يوجد — مثل حساب الأدمن).
export async function getProfile(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (_) {
    return null;
  }
}
