// طبقة إدارة البيانات — Firestore أولاً، مع بديل محلي آمن.
// - القراءة: من مجموعة "services" في Firestore، مرتبة بالأحدث أولاً.
//   إذا كانت المجموعة فارغة أو تعذر الوصول إلى Firestore،
//   يظهر الموقع العام فارغاً (لا توجد خدمات افتراضية بعد حذفها).
// - الكتابة (إضافة / تعديل / حذف / نشر الافتراضيات):
//   تتطلب مستخدماً مسجلاً في Firebase Auth، وتتحقق قواعد Firestore
//   من ذلك أيضاً من جهة الخادم. أي كتابة من غير تسجيل دخول ترفض
//   برسالة عربية واضحة.
// - طلبات الزوار من الموقع العام تُرسل إلى مجموعة "pendingServices"
//   في Firestore (بانتظار مراجعة الأدمن) عبر submitService()،
//   ولا تُنشر في مجموعة services إلا بعد موافقة الأدمن.
//   (النسخة المحلية القديمة saveServiceLocally ما زالت موجودة
//   كبديل عند تعذر الاتصال، وتظهر لصاحب الجهاز فقط.)
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
  serverTimestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db as firestoreDb, isAdmin } from './firebase.js';
import { ADMIN_EMAIL } from './config.js';

export const SERVICES_COLLECTION = 'services';
export const REVIEWS_COLLECTION = 'reviews';
export const PENDING_SERVICES_COLLECTION = 'pendingServices';
export const OFFERS_COLLECTION = 'offers';
export const BANNERS_COLLECTION = 'banners';
export const DAILY_STATS_COLLECTION = 'dailyStats';

// تاريخ اليوم المحلي بصيغة YYYY-MM-DD — مفتاح مستند إحصائيات اليوم.
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
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
    menu: Array.isArray(data.menu) ? data.menu : [],
    // ربط النشاط بحساب صاحبه: رقم موبايل الحساب (11 رقماً يبدأ بـ 01)
    // + uid الحساب. يُملأ من الأدمن أو من طلب الإضافة المعتمد.
    ownerId: data.ownerId || '',
    ownerPhone: normalizeOwnerPhone(data.ownerPhone || '')
  };
}

// رقم موبايل مالك النشاط بصيغة موحدة: أرقام فقط، بصفر بادئ (01xxxxxxxxx).
function normalizeOwnerPhone(p) {
  const d = String(p || '').replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.length === 12 && d.startsWith('20')) return '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('1')) return '0' + d;
  return d;
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

  // ===== طلبات إضافة خدمات من أصحاب المحلات (مجموعة pendingServices) =====
  // - أي مستخدم مسجل يرسل طلبه؛ الطلب لا يظهر للعامة أبداً.
  // - الأدمن يراجع الطلبات من لوحة التحكم: يوافق (ينشر الخدمة في
  //   مجموعة services مع الصورة المرفقة) أو يرفض (يحذف الطلب).
  // - الصورة يختارها صاحب المحل من جهازه فتُصغَّر داخل المتصفح
  //   (downscaleImageToDataUrl في js/ui.js) وتُحفظ مع الطلب —
  //   بدون رفع خارجي، لأن Firebase Storage يحتاج خطة Blaze المدفوعة.
  //   والأدمن يتحقق منها قبل النشر؛ قاعدة "لا نشر بدون صورة" تظل
  //   سارية عند الموافقة. من قائمة الطلبات يمكن للأدمن تحميل الصورة
  //   ورفعها على GitHub كمسار /images/... بدلاً من نسخة البيانات.
  async submitService(payload) {
    const user = requireSignedIn();
    const name = String(payload?.name || '').trim();
    const phone = String(payload?.phone || '').trim();
    if (name.length < 2) throw new Error('اكتب اسم النشاط التجاري.');
    if (!phone) throw new Error('اكتب رقم الهاتف للتواصل.');
    const ref = await addDoc(collection(firestoreDb, PENDING_SERVICES_COLLECTION), {
      name,
      category: String(payload.category || 'maintenance'),
      subcategory: String(payload.subcategory || ''),
      area: String(payload.area || ''),
      address: String(payload.address || '').trim(),
      phone,
      whatsapp: String(payload.whatsapp || '').trim(),
      tags: String(payload.tags || '').trim(),
      imageUrl: String(payload.imageUrl || '').trim(),
      isEmergency: Boolean(payload.isEmergency),
      openHour: Number(payload.openHour ?? 9),
      closeHour: Number(payload.closeHour ?? 23),
      submittedBy: user.uid,
      submitterName: String(payload.submitterName || ''),
      submitterPhone: String(payload.submitterPhone || ''),
      status: 'pending',
      createdAt: serverTimestamp()
    });
    return ref.id;
  }

  // طلبات الإضافة بانتظار المراجعة — للأدمن فقط.
  async getPendingServices() {
    requireAdminUser();
    const snap = await getDocs(query(
      collection(firestoreDb, PENDING_SERVICES_COLLECTION),
      where('status', '==', 'pending')
    ));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  // المستخدمون المسجلون (للأدمن فقط): كل مستندات مجموعة users.
  // ملاحظة: قواعد Firestore يجب أن تسمح للأدمن بقراءة المجموعة
  // كلها، وإلا رفض هذا الاستعلام (permission-denied).
  async getAllUsers() {
    requireAdminUser();
    const snap = await getDocs(collection(firestoreDb, 'users'));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  // ===== لوحة صاحب النشاط =====
  // خدماتي: كل الخدمات المربوطة برقم موبايل حسابي.
  async getMyServices(ownerPhone) {
    const phone = normalizeOwnerPhone(ownerPhone);
    if (!phone) return [];
    const all = await this.getAllServices();
    return all.filter((s) => normalizeOwnerPhone(s.ownerPhone) === phone);
  }

  // الحقول التي يُسمح لصاحب النشاط بطلب تعديلها (لا تشمل الصورة
  // ولا التوثيق ولا التقييم ولا الملكية — تلك تبقى بيد الأدمن).
  static EDITABLE_FIELDS = ['name', 'phone', 'whatsapp', 'address', 'area', 'openHour', 'closeHour', 'tags'];

  async submitServiceEditRequest({ serviceId, changes }) {
    const user = requireSignedIn();
    if (!serviceId) throw new Error('خدمة غير معروفة.');
    const clean = {};
    for (const k of DatabaseService.EDITABLE_FIELDS) {
      if (changes && changes[k] !== undefined && changes[k] !== '') clean[k] = changes[k];
    }
    if (!Object.keys(clean).length) throw new Error('اكتب التعديل المطلوب أولاً.');
    const ref = await addDoc(collection(firestoreDb, 'serviceEditRequests'), {
      serviceId,
      ownerId: user.uid,
      changes: clean,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    return ref.id;
  }

  async getMyEditRequests() {
    const user = requireSignedIn();
    const snap = await getDocs(query(
      collection(firestoreDb, 'serviceEditRequests'),
      where('ownerId', '==', user.uid)
    ));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  async getPendingEditRequests() {
    requireAdminUser();
    const snap = await getDocs(query(
      collection(firestoreDb, 'serviceEditRequests'),
      where('status', '==', 'pending')
    ));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  async approveEditRequest(requestId) {
    requireAdminUser();
    const ref = doc(firestoreDb, 'serviceEditRequests', requestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('الطلب غير موجود.');
    const req = snap.data();
    const clean = {};
    for (const k of DatabaseService.EDITABLE_FIELDS) {
      if (req.changes && req.changes[k] !== undefined) clean[k] = req.changes[k];
    }
    if (Object.keys(clean).length) await this.updateService(req.serviceId, clean);
    await deleteDoc(ref);
    return true;
  }

  async rejectEditRequest(requestId) {
    requireAdminUser();
    await deleteDoc(doc(firestoreDb, 'serviceEditRequests', requestId));
    return true;
  }

  // طلب عرض (خصم) من صاحب النشاط — يراجعه الأدمن قبل النشر.
  async submitOfferRequest({ serviceId, title, discount, validUntil }) {
    const user = requireSignedIn();
    if (!serviceId) throw new Error('خدمة غير معروفة.');
    if (!String(title || '').trim()) throw new Error('اكتب عنوان العرض.');
    const ref = await addDoc(collection(firestoreDb, 'offerRequests'), {
      serviceId,
      ownerId: user.uid,
      title: String(title).trim().slice(0, 120),
      discount: String(discount || '').trim().slice(0, 120),
      validUntil: String(validUntil || ''),
      status: 'pending',
      createdAt: serverTimestamp()
    });
    return ref.id;
  }

  async getMyOfferRequests() {
    const user = requireSignedIn();
    const snap = await getDocs(query(
      collection(firestoreDb, 'offerRequests'),
      where('ownerId', '==', user.uid)
    ));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  async getPendingOfferRequests() {
    requireAdminUser();
    const snap = await getDocs(query(
      collection(firestoreDb, 'offerRequests'),
      where('status', '==', 'pending')
    ));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  async approveOfferRequest(requestId) {
    requireAdminUser();
    const ref = doc(firestoreDb, 'offerRequests', requestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('الطلب غير موجود.');
    const req = snap.data();
    await this.addOffer({
      serviceId: req.serviceId,
      title: req.title,
      discount: req.discount || '',
      validUntil: req.validUntil || '',
      active: true
    });
    await deleteDoc(ref);
    return true;
  }

  async rejectOfferRequest(requestId) {
    requireAdminUser();
    await deleteDoc(doc(firestoreDb, 'offerRequests', requestId));
    return true;
  }

  // ===== سعر الذهب اليوم (مستند واحد siteMeta/gold) =====
  async getGoldPrices() {
    try {
      const snap = await getDoc(doc(firestoreDb, 'siteMeta', 'gold'));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    } catch (_) {
      return null;
    }
  }

  async setGoldPrices(data) {
    requireAdminUser();
    const clean = {
      price24: Number(data.price24 || 0),
      price21: Number(data.price21 || 0),
      price18: Number(data.price18 || 0),
      pound: Number(data.pound || 0),
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(firestoreDb, 'siteMeta', 'gold'), clean, { merge: true });
    return clean;
  }

  // الموافقة على طلب: نشر الخدمة ثم حذف الطلب.
  async approvePendingService(pendingId, serviceData) {
    requireAdminUser();
    const created = await this.addService(serviceData);
    await deleteDoc(doc(firestoreDb, PENDING_SERVICES_COLLECTION, pendingId));
    return created;
  }

  async deletePendingService(pendingId) {
    requireAdminUser();
    await deleteDoc(doc(firestoreDb, PENDING_SERVICES_COLLECTION, pendingId));
  }

  // ===== العروض والخصومات (مجموعة offers) =====
  // - العرض ينشئه الأدمن من لوحة التحكم (خدمة + عنوان + خصم + تاريخ انتهاء).
  // - العرض الظاهر للعامة هو فقط active=true ولم ينتهِ تاريخه بعد.
  async getActiveOffers() {
    const snap = await getDocs(query(
      collection(firestoreDb, OFFERS_COLLECTION),
      where('active', '==', true)
    ));
    const today = new Date().toISOString().slice(0, 10);
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => !o.validUntil || String(o.validUntil) >= today);
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  async getAllOffers() {
    requireAdminUser();
    const snap = await getDocs(collection(firestoreDb, OFFERS_COLLECTION));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  async addOffer(data) {
    requireAdminUser();
    if (!data.serviceId) throw new Error('اختر الخدمة صاحبة العرض.');
    if (!String(data.title || '').trim()) throw new Error('اكتب عنوان العرض.');
    const ref = await addDoc(collection(firestoreDb, OFFERS_COLLECTION), {
      serviceId: String(data.serviceId),
      title: String(data.title).trim().slice(0, 120),
      details: String(data.details || '').trim().slice(0, 300),
      discount: String(data.discount || '').trim().slice(0, 40),
      validUntil: String(data.validUntil || ''),
      active: data.active !== false,
      createdAt: serverTimestamp()
    });
    return ref.id;
  }

  async deleteOffer(offerId) {
    requireAdminUser();
    await deleteDoc(doc(firestoreDb, OFFERS_COLLECTION, offerId));
  }

  async setOfferActive(offerId, active) {
    requireAdminUser();
    await updateDoc(doc(firestoreDb, OFFERS_COLLECTION, offerId), { active: Boolean(active) });
  }

  // ===== شاشة العرض — إعلانات الرئيسية (مجموعة banners) =====
  // - الإعلان ينشئه الأدمن من لوحة التحكم: صورة + عنوان + سطر ثانٍ
  //   اختياري + رابط (خدمة من الدليل أو رابط خارجي أو بلا رابط)
  //   + ترتيب + تفعيل. الصورة مسار /images/... أو رابط مباشر.
  // - الظاهر للعامة فقط active=true، مرتبة بالترتيب ثم الأحدث.
  async getActiveBanners() {
    const snap = await getDocs(query(
      collection(firestoreDb, BANNERS_COLLECTION),
      where('active', '==', true)
    ));
    const today = new Date().toISOString().slice(0, 10);
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => !b.validUntil || String(b.validUntil) >= today);
    list.sort((a, b) => (Number(a.order || 0) - Number(b.order || 0))
      || ((b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0)));
    return list;
  }

  async getAllBanners() {
    requireAdminUser();
    const snap = await getDocs(collection(firestoreDb, BANNERS_COLLECTION));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (Number(a.order || 0) - Number(b.order || 0))
      || ((b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0)));
    return list;
  }

  async addBanner(data) {
    requireAdminUser();
    if (!String(data.title || '').trim()) throw new Error('اكتب عنوان الإعلان.');
    if (!String(data.imageUrl || '').trim()) throw new Error('اكتب رابط صورة الإعلان.');
    const ref = await addDoc(collection(firestoreDb, BANNERS_COLLECTION), {
      title: String(data.title).trim().slice(0, 120),
      subtitle: String(data.subtitle || '').trim().slice(0, 200),
      imageUrl: String(data.imageUrl).trim(),
      linkType: data.linkType === 'url' ? 'url' : (data.linkType === 'service' ? 'service' : 'none'),
      serviceId: String(data.serviceId || ''),
      url: String(data.url || '').trim(),
      order: Number(data.order || 0),
      validUntil: String(data.validUntil || ''),
      active: data.active !== false,
      createdAt: serverTimestamp()
    });
    return ref.id;
  }

  async updateBanner(bannerId, data) {
    requireAdminUser();
    if (!String(data.title || '').trim()) throw new Error('اكتب عنوان الإعلان.');
    if (!String(data.imageUrl || '').trim()) throw new Error('اكتب رابط صورة الإعلان.');
    await updateDoc(doc(firestoreDb, BANNERS_COLLECTION, bannerId), {
      title: String(data.title).trim().slice(0, 120),
      subtitle: String(data.subtitle || '').trim().slice(0, 200),
      imageUrl: String(data.imageUrl).trim(),
      linkType: data.linkType === 'url' ? 'url' : (data.linkType === 'service' ? 'service' : 'none'),
      serviceId: String(data.serviceId || ''),
      url: String(data.url || '').trim(),
      order: Number(data.order || 0),
      validUntil: String(data.validUntil || ''),
      active: data.active !== false
    });
  }

  async deleteBanner(bannerId) {
    requireAdminUser();
    await deleteDoc(doc(firestoreDb, BANNERS_COLLECTION, bannerId));
  }

  async setBannerActive(bannerId, active) {
    requireAdminUser();
    await updateDoc(doc(firestoreDb, BANNERS_COLLECTION, bannerId), { active: Boolean(active) });
  }

  // ===== إحصائيات الزيارات اليومية (مجموعة dailyStats) =====
  // - مستند واحد لكل يوم (المفتاح = YYYY-MM-DD): visits + groups{groupId: n}.
  // - العدّ مرة واحدة لكل جهاز في اليوم (مفتاح في localStorage) حتى لا
  //   تضخّم إعادة التحميل الأرقام؛ والكتابة لا تُظهر أي خطأ للمستخدم أبداً.
  // - تُقرأ من لوحة التحكم فقط (قراءة واحدة لمستند اليوم).
  async logVisit() {
    try {
      const key = todayKey();
      if (localStorage.getItem(`ism_stat_visit_${key}`)) return;
      localStorage.setItem(`ism_stat_visit_${key}`, '1');
      await setDoc(doc(firestoreDb, DAILY_STATS_COLLECTION, key), {
        visits: increment(1),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (_) { /* الإحصائيات تحسين إضافي — فشلها لا يؤثر على الموقع */ }
  }

  async logGroupView(groupId) {
    try {
      if (!groupId) return;
      const key = todayKey();
      const flag = `ism_stat_group_${groupId}_${key}`;
      if (localStorage.getItem(flag)) return;
      localStorage.setItem(flag, '1');
      await setDoc(doc(firestoreDb, DAILY_STATS_COLLECTION, key), {
        groups: { [groupId]: increment(1) },
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (_) { /* الإحصائيات تحسين إضافي — فشلها لا يؤثر على الموقع */ }
  }

  async getDailyStats(dateKey) {
    requireAdminUser();
    const snap = await getDoc(doc(firestoreDb, DAILY_STATS_COLLECTION, dateKey || todayKey()));
    if (!snap.exists()) return { visits: 0, groups: {} };
    const data = snap.data() || {};
    return { visits: Number(data.visits || 0), groups: data.groups || {} };
  }

  // ===== مزامنة المحفوظات مع حساب المستخدم =====
  // المحفوظات تُحفظ محلياً دائماً (حتى للضيوف)، وإن كان المستخدم
  // مسجلاً تُزامَن أيضاً مع مجموعة users/{uid}/favorites في Firestore
  // حتى تظهر على أي جهاز يسجل دخوله منه.
  async getRemoteFavorites() {
    const user = auth.currentUser;
    if (!user) return [];
    try {
      const snap = await getDocs(collection(firestoreDb, 'users', user.uid, 'favorites'));
      return snap.docs.map((d) => d.id);
    } catch (_) {
      return [];
    }
  }

  async setFavoriteRemote(serviceId, on) {
    const user = auth.currentUser;
    if (!user || !serviceId) return;
    try {
      const ref = doc(firestoreDb, 'users', user.uid, 'favorites', serviceId);
      if (on) await setDoc(ref, { serviceId, createdAt: serverTimestamp() });
      else await deleteDoc(ref);
    } catch (_) {
      // المزامنة تحسين إضافي — فشلها لا يمنع الحفظ المحلي.
    }
  }
}

export const db = new DatabaseService();
export { ADMIN_EMAIL };
