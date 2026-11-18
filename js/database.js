// طبقة إدارة البيانات — Firestore أولاً، مع بديل محلي آمن.
// - القراءة: من مجموعة "services" في Firestore، مرتبة بالأحدث أولاً.
//   إذا كانت المجموعة فارغة أو تعذر الوصول إلى Firestore،
//   يظهر الموقع العام فارغاً (لا توجد خدمات افتراضية بعد حذفها).
// - الكتابة (إضافة / تعديل / حذف / نشر الافتراضيات):
//   تتطلب مستخدماً مسجلاً في Firebase Auth، وتتحقق قواعد Firestore
//   من ذلك أيضاً من جهة الخادم. أي كتابة من غير تسجيل دخول ترفض
//   برسالة عربية واضحة.
// - طلبات الزوار من الموقع العام تُحفظ محلياً فقط (بانتظار مراجعة الأدمن)
//   عبر saveServiceLocally()، ولا تُنشر في Firestore إلا بعد موافقة الأدمن.
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db as firestoreDb, isAdmin } from './firebase.js';
import { ADMIN_EMAIL } from './config.js';

export const SERVICES_COLLECTION = 'services';
export const REVIEWS_COLLECTION = 'reviews';
const PENDING_KEY = 'ismailia_pending_services_v1';

export const INITIAL_SERVICES = [];

function cloneInitialServices() {
  return JSON.parse(JSON.stringify(INITIAL_SERVICES));
}

function getPendingLocalServices() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function requireSignedIn() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يجب تسجيل الدخول أولاً للقيام بهذا الإجراء.');
  }
  return user;
}

function requireAdminUser() {
  const user = requireSignedIn();
  if (!isAdmin(user)) {
    throw new Error('ليس لديك صلاحية الإدارة. هذا الإجراء متاح لحساب الأدمن فقط.');
  }
  return user;
}

function normaliseService(id, data) {
  return {
    id,
    name: data.name || '',
    category: data.category || 'maintenance',
    subcategory: data.subcategory || '',
    area: data.area || '',
    address: data.address || '',
    phone: data.phone || '',
    whatsapp: data.whatsapp || '',
    mapUrl: data.mapUrl || '',
    imageUrl: data.imageUrl || '',
    openHour: Number(data.openHour ?? 9),
    closeHour: Number(data.closeHour ?? 23),
    isEmergency: Boolean(data.isEmergency),
    verified: Boolean(data.verified),
    rating: Number(data.rating ?? 5),
    reviewsCount: Number(data.reviewsCount ?? 1),
    tags: data.tags || '',
    menu: Array.isArray(data.menu) ? data.menu : []
  };
}

class DatabaseService {
  async getAllServices() {
    let remote = [];
    try {
      // نحاول الترتيب بالأحدث أولاً؛ وإذا فشل (مثلاً لعدم وجود الحقل
      // في مستندات قديمة) نعيد المحاولة بدون ترتيب.
      let snap;
      try {
        snap = await getDocs(query(collection(firestoreDb, SERVICES_COLLECTION), orderBy('createdAt', 'desc')));
      } catch (_) {
        snap = await getDocs(collection(firestoreDb, SERVICES_COLLECTION));
      }
      snap.forEach((d) => remote.push(normaliseService(d.id, d.data())));
    } catch (err) {
      console.warn('تعذر الوصول إلى Firestore، سيتم عرض الخدمات الافتراضية:', err);
      remote = [];
    }

    const base = remote.length ? remote : cloneInitialServices();
    // طلبات الزوار المحفوظة محلياً تظهر لصاحب الجهاز فقط، بانتظار مراجعة الأدمن.
    const pending = getPendingLocalServices()
      .filter((p) => !base.some((s) => s.id === p.id))
      .map((p) => normaliseService(p.id, p));
    return [...base, ...pending];
  }

  // عدد المستندات الموجودة فعلاً في Firestore (بدون البديل المحلي).
  async countRemoteServices() {
    try {
      const snap = await getDocs(collection(firestoreDb, SERVICES_COLLECTION));
      return snap.size;
    } catch (_) {
      return 0;
    }
  }

  async addService(newService) {
    const user = requireSignedIn();
    if (!isAdmin(user)) {
      throw new Error('إضافة الخدمات للنشر العام متاحة لحساب الأدمن فقط. تم حفظ طلبك محلياً للمراجعة.');
    }
    const payload = {
      ...newService,
      rating: Number(newService.rating ?? 5),
      reviewsCount: Number(newService.reviewsCount ?? 1),
      verified: newService.verified !== false,
      menu: Array.isArray(newService.menu) ? newService.menu : [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    const ref = await addDoc(collection(firestoreDb, SERVICES_COLLECTION), payload);
    return normaliseService(ref.id, payload);
  }

  async updateService(id, patch) {
    requireAdminUser();
    const ref = doc(firestoreDb, SERVICES_COLLECTION, id);
    const payload = { ...patch, updatedAt: serverTimestamp() };
    delete payload.id;
    delete payload.createdAt;
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      // الخدمة الافتراضية لم تُنشر بعد في Firestore: ننشئها بنفس المعرّف.
      const base = INITIAL_SERVICES.find((s) => s.id === id);
      await setDoc(ref, { ...(base || {}), ...payload, createdAt: serverTimestamp() });
    }
    const snap = await getDoc(ref);
    return normaliseService(id, snap.data() || payload);
  }

  async deleteService(id) {
    requireAdminUser();
    await deleteDoc(doc(firestoreDb, SERVICES_COLLECTION, id));
    // إزالتها أيضاً من الطلبات المحلية إن وُجدت.
    const pending = getPendingLocalServices().filter((p) => p.id !== id);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }

  // حفظ طلب زائر محلياً فقط — لا ينشر في Firestore.
  saveServiceLocally(newService) {
    const pending = getPendingLocalServices();
    const record = {
      ...newService,
      id: 'srv_' + Date.now(),
      rating: 5.0,
      reviewsCount: 1,
      verified: false,
      menu: Array.isArray(newService.menu) ? newService.menu : []
    };
    pending.unshift(record);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    return record;
  }

  // نشر الخدمات الافتراضية في Firestore — للأدمن فقط،
  // وفقط عندما تكون المجموعة فارغة تماماً. (القائمة الافتراضية فارغة الآن.)
  async seedInitialServices() {
    const user = requireAdminUser();
    const existing = await getDocs(collection(firestoreDb, SERVICES_COLLECTION));
    if (!existing.empty) {
      return { seeded: 0, skipped: true, message: 'مجموعة الخدمات ليست فارغة — لم يتم نشر أي خدمة جديدة.' };
    }
    for (const srv of INITIAL_SERVICES) {
      const { id, ...rest } = srv;
      await setDoc(doc(firestoreDb, SERVICES_COLLECTION, id), {
        ...rest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    return { seeded: INITIAL_SERVICES.length, skipped: false, message: `تم نشر ${INITIAL_SERVICES.length} خدمات افتراضية في Firestore بنجاح.` };
  }

  // ===== التقييمات الحقيقية (مجموعة reviews) =====
  // - أي مستخدم مسجل يستطيع إضافة تقييم واحد لكل خدمة.
  // - التقييم الجديد يُحفظ بموافقة معلّقة (approved=false) ولا يظهر
  //   للعامة إلا بعد موافقة الأدمن من لوحة التحكم.
  // - عند الموافقة أو الحذف يُعاد حساب متوسط تقييم الخدمة وعدد
  //   تقييماتها من التقييمات المعتمدة فقط. بلا تقييمات معتمدة تعود
  //   الخدمة للقيمة الافتراضية (5 من 1) كما كانت قبل التقييمات.
  // - الاستعلامات تستخدم مساواة فقط (==) بلا ترتيب من الخادم حتى لا
  //   تتطلب فهارس مركّبة؛ الترتيب يتم محلياً.
  async addReview({ serviceId, rating, text, userName }) {
    const user = requireSignedIn();
    const cleanRating = Number(rating);
    if (!serviceId) throw new Error('خدمة غير معروفة.');
    if (!(cleanRating >= 1 && cleanRating <= 5)) {
      throw new Error('اختار تقييم من نجمة واحدة إلى 5 نجوم.');
    }
    const cleanText = String(text || '').trim().slice(0, 500);
    if (cleanText.length < 2) throw new Error('اكتب رأيك في سطر على الأقل.');
    const existing = await this.getUserReview(serviceId, user.uid);
    if (existing) {
      throw new Error('لقد قيّمت هذه الخدمة من قبل. تقييم واحد لكل خدمة.');
    }
    const ref = await addDoc(collection(firestoreDb, REVIEWS_COLLECTION), {
      serviceId,
      userId: user.uid,
      userName: String(userName || 'مستخدم') .slice(0, 60),
      rating: cleanRating,
      text: cleanText,
      approved: false,
      createdAt: serverTimestamp()
    });
    return ref.id;
  }

  // تقييم المستخدم الحالي لخدمة معينة (أي حالة: معلّق أو معتمد).
  async getUserReview(serviceId, userId) {
    if (!serviceId || !userId) return null;
    const snap = await getDocs(query(
      collection(firestoreDb, REVIEWS_COLLECTION),
      where('serviceId', '==', serviceId),
      where('userId', '==', userId)
    ));
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }

  // التقييمات المعتمدة لخدمة — للعرض العام، مرتبة بالأحدث أولاً.
  async getApprovedReviews(serviceId) {
    const snap = await getDocs(query(
      collection(firestoreDb, REVIEWS_COLLECTION),
      where('serviceId', '==', serviceId),
      where('approved', '==', true)
    ));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  // التقييمات بانتظار المراجعة — للأدمن فقط.
  async getPendingReviews() {
    requireAdminUser();
    const snap = await getDocs(query(
      collection(firestoreDb, REVIEWS_COLLECTION),
      where('approved', '==', false)
    ));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  async approveReview(reviewId) {
    requireAdminUser();
    const ref = doc(firestoreDb, REVIEWS_COLLECTION, reviewId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('التقييم غير موجود.');
    await updateDoc(ref, { approved: true });
    await this.recomputeServiceRating(snap.data().serviceId);
  }

  async deleteReview(reviewId) {
    requireAdminUser();
    const ref = doc(firestoreDb, REVIEWS_COLLECTION, reviewId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('التقييم غير موجود.');
    const serviceId = snap.data().serviceId;
    await deleteDoc(ref);
    await this.recomputeServiceRating(serviceId);
  }

  // إعادة حساب متوسط تقييم الخدمة وعدد تقييماتها من المعتمد فقط.
  async recomputeServiceRating(serviceId) {
    if (!serviceId) return;
    const approved = await this.getApprovedReviews(serviceId);
    const patch = approved.length
      ? {
          rating: Math.round((approved.reduce((s, r) => s + Number(r.rating || 0), 0) / approved.length) * 10) / 10,
          reviewsCount: approved.length
        }
      : { rating: 5, reviewsCount: 1 };
    await updateDoc(doc(firestoreDb, SERVICES_COLLECTION, serviceId), {
      ...patch,
      updatedAt: serverTimestamp()
    });
  }
}

export const db = new DatabaseService();
export { ADMIN_EMAIL };
