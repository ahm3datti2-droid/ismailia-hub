// لوحة تحكم الإدارة — الدخول عبر Firebase Auth فقط.
// لا يوجد أي رقم سري في هذا الملف. الأدمن الوحيد هو البريد
// المحدد في js/config.js (ADMIN_EMAIL)، وأي بريد آخر مسجل
// يظهر له "لا تملك صلاحية" ويُسجَّل خروجه فوراً.
// كل عمليات الكتابة تمر عبر js/database.js (Firestore).
import { CATEGORIES, GROUPS, AREAS, ADMIN_EMAIL } from './config.js';
import { db, INITIAL_SERVICES, todayKey } from './database.js';
import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  isAdmin
} from './firebase.js';
import { getOpenStatus, armDeleteConfirm, downscaleImageToDataUrl } from './ui.js';

// تسجيل Service Worker حتى يمكن تثبيت اللوحة كتطبيق (PWA) من /admin.html.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const state = {
  services: [],
  remoteCount: 0,
  pendingReviews: [],
  pendingServices: [],
  offers: [],
  banners: [],
  dailyStats: { visits: 0, groups: {} },
  approvingPendingId: null,
  editingId: null,
  editingBannerId: null,
  // صورة مختارة من الجهاز (Data URL بعد التصغير) لنموذج الخدمة/الإعلان.
  // تُحفظ داخل المستند عند الحفظ؛ null تعني الاعتماد على حقل الرابط النصي.
  servicePhotoDataUrl: null,
  bannerPhotoDataUrl: null,
  searchQuery: '',
  categoryFilter: 'all'
};

let deniedEmail = null;

const els = {
  loginSection: document.getElementById('loginSection'),
  deniedSection: document.getElementById('deniedSection'),
  dashboardSection: document.getElementById('dashboardSection'),
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginError: document.getElementById('loginError'),
  deniedEmail: document.getElementById('deniedEmailText'),
  adminEmailLabel: document.getElementById('adminEmailLabel'),
  statsGrid: document.getElementById('statsGrid'),
  categoryStats: document.getElementById('categoryStats'),
  searchInput: document.getElementById('adminSearch'),
  categoryFilter: document.getElementById('adminCategoryFilter'),
  servicesList: document.getElementById('adminServicesList'),
  resultsCount: document.getElementById('adminResultsCount'),
  seedBtn: document.getElementById('btnSeed'),
  seedNote: document.getElementById('seedNote'),
  pendingReviewsList: document.getElementById('pendingReviewsList'),
  pendingReviewsCount: document.getElementById('pendingReviewsCount'),
  pendingServicesList: document.getElementById('pendingServicesList'),
  pendingServicesCount: document.getElementById('pendingServicesCount'),
  offerForm: document.getElementById('offerForm'),
  offerServiceSelect: document.getElementById('offerServiceSelect'),
  offersList: document.getElementById('offersList'),
  bannerForm: document.getElementById('bannerForm'),
  bannerLinkType: document.getElementById('bannerLinkType'),
  bannerServiceSelect: document.getElementById('bannerServiceSelect'),
  bannerUrlInput: document.getElementById('bannerUrlInput'),
  bannersList: document.getElementById('bannersList'),
  bannerSubmitBtn: document.getElementById('bannerSubmitBtn'),
  bannerCancelEdit: document.getElementById('bannerCancelEdit'),
  todayVisitsTotal: document.getElementById('todayVisitsTotal'),
  todayVisitsDate: document.getElementById('todayVisitsDate'),
  todayGroupsList: document.getElementById('todayGroupsList'),
  serviceForm: document.getElementById('serviceForm'),
  formTitle: document.getElementById('formTitle'),
  submitBtn: document.getElementById('submitServiceBtn'),
  adminPhotoInput: document.getElementById('adminPhotoInput'),
  adminPhotoPreview: document.getElementById('adminPhotoPreview'),
  adminPhotoActions: document.getElementById('adminPhotoActions'),
  adminPhotoRemove: document.getElementById('adminPhotoRemove'),
  adminPhotoDownload: document.getElementById('adminPhotoDownload'),
  bannerPhotoInput: document.getElementById('bannerPhotoInput'),
  bannerPhotoPreview: document.getElementById('bannerPhotoPreview'),
  bannerPhotoActions: document.getElementById('bannerPhotoActions'),
  bannerPhotoRemove: document.getElementById('bannerPhotoRemove'),
  bannerPhotoDownload: document.getElementById('bannerPhotoDownload')
};

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showSection(which) {
  els.loginSection.classList.toggle('hidden', which !== 'login');
  els.deniedSection.classList.toggle('hidden', which !== 'denied');
  els.dashboardSection.classList.toggle('hidden', which !== 'dashboard');
}

function arabicAuthError(err) {
  const code = err?.code || '';
  if (code === 'auth/invalid-email') return 'صيغة البريد الإلكتروني غير صحيحة.';
  if (code === 'auth/user-disabled') return 'هذا الحساب معطّل. تواصل مع الإدارة.';
  if (code === 'auth/too-many-requests') return 'محاولات كثيرة فاشلة. انتظر قليلاً ثم حاول مجدداً.';
  if (code === 'auth/network-request-failed') return 'تعذر الاتصال بالشبكة. تحقق من الإنترنت وحاول مجدداً.';
  if (
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential'
  ) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  return err?.message || 'تعذر تسجيل الدخول. حاول مرة أخرى.';
}

function parseMenuText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+-\s+/);
      if (parts.length >= 2) {
        return { item: parts.slice(0, -1).join(' - '), price: parts[parts.length - 1] };
      }
      return { item: line, price: '' };
    });
}

function menuToText(menu) {
  return (menu || []).map((m) => `${m.item} - ${m.price}`).join('\n');
}

function categoryName(id) {
  return (CATEGORIES.find((c) => c.id === id) || {}).name || id;
}

function subcategoryName(groupId, subId) {
  const g = GROUPS.find((x) => x.id === groupId);
  return (g && g.subs.find((s) => s.id === subId) || {}).name || '';
}

function fillSubSelect(groupId, selectedSub) {
  const sel = document.getElementById('adminSubSelect');
  if (!sel) return;
  const g = GROUPS.find((x) => x.id === groupId);
  sel.innerHTML = (g ? g.subs : []).map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  if (selectedSub) sel.value = selectedSub;
}

async function loadServices() {
  try {
    state.services = await db.getAllServices();
    state.remoteCount = await db.countRemoteServices();
  } catch (err) {
    alert(err.message || 'تعذر تحميل الخدمات.');
    state.services = [];
    state.remoteCount = 0;
  }
  await loadPendingReviews();
  await loadPendingServices();
  await loadOffers();
  await loadBanners();
  await loadDailyStats();
  renderStats();
  renderList();
  renderReviewsQueue();
  renderPendingServicesQueue();
  renderOffersList();
  renderBannersList();
  renderDailyStats();
  fillOfferServiceSelect();
  fillBannerServiceSelect();
  updateSeedButton();
}

// زيارات اليوم — إذا فشل التحميل (مثلاً قواعد Firestore لم
// تُحدَّث بعد) تُعرض القيم صفراً بدلاً من كسر اللوحة.
async function loadDailyStats() {
  try {
    state.dailyStats = await db.getDailyStats();
  } catch (_) {
    state.dailyStats = { visits: 0, groups: {} };
  }
}

function renderDailyStats() {
  if (!els.todayVisitsTotal) return;
  const stats = state.dailyStats || { visits: 0, groups: {} };
  els.todayVisitsTotal.textContent = String(stats.visits || 0);
  try {
    els.todayVisitsDate.textContent = new Date().toLocaleDateString('ar-EG', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch (_) {
    els.todayVisitsDate.textContent = todayKey();
  }
  const rows = Object.entries(stats.groups || {})
    .map(([id, n]) => ({ id, name: id === 'all' ? 'كل الخدمات' : categoryName(id), count: Number(n || 0) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!rows.length) {
    els.todayGroupsList.innerHTML = `<p class="text-xs text-slate-400 font-semibold">لا توجد زيارات مسجلة اليوم بعد — تظهر الأقسام هنا فور دخول أول زائر.</p>`;
    return;
  }
  const max = rows[0].count;
  els.todayGroupsList.innerHTML = rows.map((r) => `
    <div class="flex items-center gap-3">
      <span class="text-xs font-bold text-slate-300 w-40 shrink-0 truncate">${esc(r.name)}</span>
      <div class="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full bg-amber-400 rounded-full" style="width:${Math.max(4, Math.round((r.count / max) * 100))}%"></div>
      </div>
      <span class="text-xs font-black text-white w-8 text-left shrink-0">${r.count}</span>
    </div>`).join('');
  refreshIcons();
}

// طلبات إضافة خدمات بانتظار المراجعة — إذا فشل التحميل (مثلاً قواعد
// Firestore لم تُحدَّث بعد) تُعرض القائمة فارغة بدلاً من كسر اللوحة.
async function loadPendingServices() {
  try {
    state.pendingServices = await db.getPendingServices();
  } catch (_) {
    state.pendingServices = [];
  }
}

async function loadOffers() {
  try {
    state.offers = await db.getAllOffers();
  } catch (_) {
    state.offers = [];
  }
}

// قائمة طلبات الإضافة: "مراجعة ونشر" يملأ نموذج الخدمة ببيانات الطلب
// (والأدمن يضيف صورة موثقة قبل الحفظ)، و"رفض" يحذف الطلب.
function renderPendingServicesQueue() {
  const list = state.pendingServices;
  if (!els.pendingServicesList) return;
  els.pendingServicesCount.textContent = String(list.length);
  if (!list.length) {
    els.pendingServicesList.innerHTML = `
      <div class="text-center py-6 bg-slate-900/40 rounded-3xl border border-slate-800/80">
        <p class="text-slate-400 text-xs font-semibold">لا توجد طلبات إضافة بانتظار المراجعة</p>
      </div>`;
    return;
  }
  els.pendingServicesList.innerHTML = list.map((p) => `
    <article class="bg-slate-900/90 border border-sky-500/20 rounded-2xl p-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <p class="font-extrabold text-white text-sm">${esc(p.name)}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">${esc(categoryName(p.category))}${subcategoryName(p.category, p.subcategory) ? ' • ' + esc(subcategoryName(p.category, p.subcategory)) : ''} • ${esc(p.area || '')}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">من: ${esc(p.submitterName || 'مستخدم')} • ${esc(p.submitterPhone || '')}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button data-approve-service="${esc(p.id)}" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition">مراجعة ونشر</button>
          <button data-reject-service="${esc(p.id)}" class="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-extrabold transition">رفض</button>
        </div>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed">${esc(p.address || 'بدون عنوان')}${p.phone ? ` • <span dir="ltr">${esc(p.phone)}</span>` : ''}</p>
      ${p.imageUrl ? `<a href="${esc(p.imageUrl)}" target="_blank" rel="noopener"><img src="${esc(p.imageUrl)}" alt="صورة مرفقة" referrerpolicy="no-referrer" class="w-full max-h-40 object-contain bg-white rounded-xl mt-2" onerror="this.remove()"></a>${String(p.imageUrl).startsWith('data:') ? `<a href="${esc(p.imageUrl)}" download="${esc(p.name)}.jpg" class="inline-block mt-2 text-sky-400 font-bold text-[11px]">⬇ تحميل الصورة (لرفعها على GitHub عند النشر)</a>` : ''}` : `<p class="text-[11px] text-amber-400 mt-1.5">بدون صورة مرفقة — أضف صورة موثقة من صفحة المحل قبل النشر.</p>`}
    </article>`).join('');

  els.pendingServicesList.querySelectorAll('[data-approve-service]').forEach((btn) => {
    btn.addEventListener('click', () => startApprovePending(btn.dataset.approveService));
  });
  els.pendingServicesList.querySelectorAll('[data-reject-service]').forEach((btn) => {
    btn.addEventListener('click', () => armDeleteConfirm(btn, async () => {
      try {
        await db.deletePendingService(btn.dataset.rejectService);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر رفض الطلب.');
      }
    }));
  });
}

function startApprovePending(id) {
  const p = state.pendingServices.find((x) => x.id === id);
  if (!p) return;
  state.approvingPendingId = id;
  state.editingId = null;
  fillForm({
    ...p,
    verified: true,
    rating: 5,
    tags: p.tags || '',
    menu: []
  });
  els.formTitle.textContent = 'مراجعة طلب: ' + p.name;
  els.submitBtn.textContent = 'نشر الخدمة (موافقة)';
  els.serviceForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// قائمة العروض في لوحة التحكم (إضافة / إيقاف / حذف).
function renderOffersList() {
  if (!els.offersList) return;
  const list = state.offers;
  if (!list.length) {
    els.offersList.innerHTML = `<p class="text-xs text-slate-400 font-semibold">لا توجد عروض بعد — أضف أول عرض من النموذج أعلاه.</p>`;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  els.offersList.innerHTML = list.map((o) => {
    const srv = state.services.find((s) => s.id === o.serviceId);
    const expired = o.validUntil && String(o.validUntil) < today;
    return `
      <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
        <div class="min-w-0">
          <p class="text-xs font-extrabold text-white truncate">${esc(o.title)} ${o.discount ? `<span class="text-amber-400">(${esc(o.discount)})</span>` : ''}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">${esc(srv ? srv.name : 'خدمة محذوفة')}${o.validUntil ? ` • حتى ${esc(o.validUntil)}` : ''} • ${o.active && !expired ? '<span class="text-emerald-400 font-bold">ساري</span>' : '<span class="text-slate-500 font-bold">متوقف / منتهي</span>'}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button data-toggle-offer="${esc(o.id)}" data-active="${o.active ? '0' : '1'}" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-extrabold transition">${o.active ? 'إيقاف' : 'تفعيل'}</button>
          <button data-delete-offer="${esc(o.id)}" class="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-extrabold transition">حذف</button>
        </div>
      </div>`;
  }).join('');

  els.offersList.querySelectorAll('[data-toggle-offer]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await db.setOfferActive(btn.dataset.toggleOffer, btn.dataset.active === '1');
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر تغيير حالة العرض.');
      }
    });
  });
  els.offersList.querySelectorAll('[data-delete-offer]').forEach((btn) => {
    btn.addEventListener('click', () => armDeleteConfirm(btn, async () => {
      try {
        await db.deleteOffer(btn.dataset.deleteOffer);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر حذف العرض.');
      }
    }));
  });
}

function fillOfferServiceSelect() {
  const sel = els.offerServiceSelect;
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— اختر الخدمة —</option>' + state.services
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
    .join('');
  if (current) sel.value = current;
}

// شاشة العرض — إذا فشل التحميل (مثلاً قواعد Firestore لم
// تُحدَّث بعد) تُعرض القائمة فارغة بدلاً من كسر اللوحة.
async function loadBanners() {
  try {
    state.banners = await db.getAllBanners();
  } catch (_) {
    state.banners = [];
  }
}

function bannerLinkLabel(b) {
  if (b.linkType === 'service') {
    const srv = state.services.find((s) => s.id === b.serviceId);
    return `خدمة: ${srv ? srv.name : 'محذوفة'}`;
  }
  if (b.linkType === 'url') return `رابط: ${b.url || ''}`;
  return 'بدون رابط';
}

function renderBannersList() {
  if (!els.bannersList) return;
  const list = state.banners;
  if (!list.length) {
    els.bannersList.innerHTML = `<p class="text-xs text-slate-400 font-semibold">لا توجد إعلانات بعد — أضف أول إعلان من النموذج أعلاه وسيظهر في شاشة العرض أول الموقع.</p>`;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  els.bannersList.innerHTML = list.map((b) => {
    const expired = b.validUntil && String(b.validUntil) < today;
    return `
    <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
      <div class="flex items-center gap-3 min-w-0">
        <img src="${esc(b.imageUrl)}" alt="" referrerpolicy="no-referrer" class="w-16 h-10 object-cover rounded-lg bg-white shrink-0" onerror="this.remove()">
        <div class="min-w-0">
          <p class="text-xs font-extrabold text-white truncate">${esc(b.title)} <span class="text-amber-400 font-bold">#${Number(b.order || 0)}</span></p>
          <p class="text-[11px] text-slate-400 mt-0.5 truncate">${esc(bannerLinkLabel(b))}${b.validUntil ? ` • حتى ${esc(b.validUntil)}` : ''} • ${expired ? '<span class="text-rose-400 font-bold">منتهي</span>' : (b.active ? '<span class="text-emerald-400 font-bold">مفعّل</span>' : '<span class="text-slate-500 font-bold">متوقف</span>')}</p>
        </div>
      </div>
      <div class="flex gap-1.5 shrink-0">
        <button data-toggle-banner="${esc(b.id)}" data-active="${b.active ? '0' : '1'}" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-extrabold transition">${b.active ? 'إيقاف' : 'تفعيل'}</button>
        <button data-edit-banner="${esc(b.id)}" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-extrabold transition">تعديل</button>
        <button data-delete-banner="${esc(b.id)}" class="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-extrabold transition">حذف</button>
      </div>
    </div>`;
  }).join('');

  els.bannersList.querySelectorAll('[data-toggle-banner]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await db.setBannerActive(btn.dataset.toggleBanner, btn.dataset.active === '1');
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر تغيير حالة الإعلان.');
      }
    });
  });
  els.bannersList.querySelectorAll('[data-edit-banner]').forEach((btn) => {
    btn.addEventListener('click', () => startEditBanner(btn.dataset.editBanner));
  });
  els.bannersList.querySelectorAll('[data-delete-banner]').forEach((btn) => {
    btn.addEventListener('click', () => armDeleteConfirm(btn, async () => {
      try {
        await db.deleteBanner(btn.dataset.deleteBanner);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر حذف الإعلان.');
      }
    }));
  });
}

function fillBannerServiceSelect() {
  const sel = els.bannerServiceSelect;
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— اختر الخدمة —</option>' + state.services
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
    .join('');
  if (current) sel.value = current;
}

function updateBannerLinkFields() {
  if (!els.bannerLinkType) return;
  const t = els.bannerLinkType.value;
  els.bannerServiceSelect?.classList.toggle('hidden', t !== 'service');
  els.bannerUrlInput?.classList.toggle('hidden', t !== 'url');
}

function startEditBanner(id) {
  const b = state.banners.find((x) => x.id === id);
  if (!b || !els.bannerForm) return;
  state.editingBannerId = id;
  const f = els.bannerForm;
  f.title.value = b.title || '';
  if (b.imageUrl && String(b.imageUrl).startsWith('data:')) {
    state.bannerPhotoDataUrl = b.imageUrl;
    f.imageUrl.value = '';
    showPhotoPreview('banner', b.imageUrl);
  } else {
    state.bannerPhotoDataUrl = null;
    clearPhotoPreview('banner');
    f.imageUrl.value = b.imageUrl || '';
  }
  f.subtitle.value = b.subtitle || '';
  f.linkType.value = b.linkType || 'service';
  f.serviceId.value = b.serviceId || '';
  f.url.value = b.url || '';
  f.order.value = b.order ?? 0;
  f.validUntil.value = b.validUntil || '';
  f.active.checked = b.active !== false;
  updateBannerLinkFields();
  if (els.bannerSubmitBtn) els.bannerSubmitBtn.textContent = 'حفظ التعديلات';
  els.bannerCancelEdit?.classList.remove('hidden');
  els.bannerForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelBannerEdit() {
  state.editingBannerId = null;
  state.bannerPhotoDataUrl = null;
  clearPhotoPreview('banner');
  els.bannerForm?.reset();
  if (els.bannerSubmitBtn) els.bannerSubmitBtn.textContent = 'إضافة الإعلان';
  els.bannerCancelEdit?.classList.add('hidden');
  updateBannerLinkFields();
}

// التقييمات بانتظار المراجعة — إذا فشل التحميل (مثلاً قواعد
// Firestore لم تُحدَّث بعد) تُعرض القائمة فارغة بدلاً من كسر اللوحة.
async function loadPendingReviews() {
  try {
    state.pendingReviews = await db.getPendingReviews();
  } catch (_) {
    state.pendingReviews = [];
  }
}

function renderReviewsQueue() {
  const list = state.pendingReviews;
  els.pendingReviewsCount.textContent = String(list.length);
  if (!list.length) {
    els.pendingReviewsList.innerHTML = `
      <div class="text-center py-6 bg-slate-900/40 rounded-3xl border border-slate-800/80">
        <p class="text-slate-400 text-xs font-semibold">لا توجد تقييمات بانتظار المراجعة</p>
      </div>`;
    refreshIcons();
    return;
  }
  els.pendingReviewsList.innerHTML = list.map((r) => {
    const srv = state.services.find((s) => s.id === r.serviceId);
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<span class="${i < Math.round(Number(r.rating) || 0) ? 'text-amber-400' : 'text-slate-600'}">★</span>`).join('');
    return `
      <article class="bg-slate-900/90 border border-amber-500/20 rounded-2xl p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <p class="font-extrabold text-white text-sm">${esc(srv ? srv.name : 'خدمة محذوفة')}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">من: ${esc(r.userName || 'مستخدم')} • <span dir="ltr">${stars}</span> ${r.rating} من 5</p>
          </div>
          <div class="flex gap-1.5 shrink-0">
            <button data-approve-review="${esc(r.id)}" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition">✓ نشر</button>
            <button data-delete-review="${esc(r.id)}" class="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-extrabold transition">✕ حذف</button>
          </div>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed">${esc(r.text)}</p>
      </article>`;
  }).join('');

  els.pendingReviewsList.querySelectorAll('[data-approve-review]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await db.approveReview(btn.dataset.approveReview);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر نشر التقييم.');
      }
    });
  });
  els.pendingReviewsList.querySelectorAll('[data-delete-review]').forEach((btn) => {
    btn.addEventListener('click', () => armDeleteConfirm(btn, async () => {
      try {
        await db.deleteReview(btn.dataset.deleteReview);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر حذف التقييم.');
      }
    }));
  });
  refreshIcons();
}

function updateSeedButton() {
  const empty = state.remoteCount === 0;
  els.seedBtn.disabled = !empty;
  els.seedBtn.classList.toggle('opacity-40', !empty);
  els.seedBtn.classList.toggle('cursor-not-allowed', !empty);
  els.seedNote.textContent = empty
    ? 'مجموعة خدمات Firestore فارغة — لا توجد خدمات افتراضية للنشر.'
    : `يوجد ${state.remoteCount} خدمة في Firestore — زر النشر معطّل حتى لا تتكرر الخدمات.`;
}

function renderStats() {
  const total = state.services.length;
  const emergency = state.services.filter((s) => s.isEmergency).length;
  const verified = state.services.filter((s) => s.verified).length;
  const avgRating = total
    ? (state.services.reduce((sum, s) => sum + Number(s.rating || 0), 0) / total).toFixed(1)
    : '—';
  const today = new Date().toISOString().slice(0, 10);
  const activeOffers = state.offers.filter((o) => o.active && (!o.validUntil || String(o.validUntil) >= today)).length;

  els.statsGrid.innerHTML = [
    { label: 'إجمالي الخدمات', value: total, icon: 'layout-grid', color: 'text-amber-400' },
    { label: 'خدمات طوارئ', value: emergency, icon: 'siren', color: 'text-rose-400' },
    { label: 'خدمات موثقة', value: verified, icon: 'badge-check', color: 'text-sky-400' },
    { label: 'متوسط التقييم', value: avgRating, icon: 'star', color: 'text-emerald-400' },
    { label: 'تقييمات بانتظار المراجعة', value: state.pendingReviews.length, icon: 'messages-square', color: 'text-violet-400' },
    { label: 'طلبات إضافة بانتظار المراجعة', value: state.pendingServices.length, icon: 'inbox', color: 'text-sky-400' },
    { label: 'عروض سارية', value: activeOffers, icon: 'badge-percent', color: 'text-amber-400' }
  ].map((s) => `
    <div class="admin-stat bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
      <div class="flex items-center gap-2 mb-1">
        <i data-lucide="${s.icon}" class="w-4 h-4 ${s.color}"></i>
        <span class="text-[11px] font-bold text-slate-400">${s.label}</span>
      </div>
      <p class="text-2xl font-black text-white">${s.value}</p>
    </div>
  `).join('');

  els.categoryStats.innerHTML = CATEGORIES.filter((c) => c.id !== 'all').map((c) => {
    const count = state.services.filter((s) => s.category === c.id).length;
    return `
      <div class="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-xs">
        <span class="flex items-center gap-2 font-bold text-slate-300">
          <i data-lucide="${c.icon}" class="w-4 h-4 text-amber-400"></i>${c.name}
        </span>
        <span class="font-black text-white">${count}</span>
      </div>
    `;
  }).join('');
  refreshIcons();
}

function filteredServices() {
  return state.services.filter((srv) => {
    const matchCat = state.categoryFilter === 'all' || srv.category === state.categoryFilter;
    const q = state.searchQuery;
    const matchQuery = !q ||
      srv.name.toLowerCase().includes(q) ||
      srv.area.toLowerCase().includes(q) ||
      srv.tags.toLowerCase().includes(q) ||
      srv.address.toLowerCase().includes(q);
    return matchCat && matchQuery;
  });
}

function renderList() {
  const list = filteredServices();
  els.resultsCount.textContent = `${list.length} خدمة`;

  if (!list.length) {
    els.servicesList.innerHTML = `
      <div class="text-center py-10 bg-slate-900/40 rounded-3xl border border-slate-800/80">
        <i data-lucide="search-x" class="w-10 h-10 text-slate-600 mx-auto mb-2"></i>
        <p class="text-slate-400 text-sm font-semibold">لا توجد خدمات مطابقة</p>
      </div>`;
    refreshIcons();
    return;
  }

  els.servicesList.innerHTML = list.map((srv) => {
    const status = getOpenStatus(srv.openHour, srv.closeHour);
    return `
      <article class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
        <div class="flex justify-between items-start gap-2">
          <div>
            <div class="flex flex-wrap items-center gap-1.5 mb-1">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-amber-400">${esc(srv.area)}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">${esc(categoryName(srv.category))}${subcategoryName(srv.category, srv.subcategory) ? ' • ' + esc(subcategoryName(srv.category, srv.subcategory)) : ''}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-md border ${status.color}">${status.text}</span>
              ${srv.verified ? '<span class="text-[10px] text-sky-400 font-bold">موثق</span>' : '<span class="text-[10px] text-slate-500 font-bold">غير موثق</span>'}
              ${srv.isEmergency ? '<span class="text-[10px] text-rose-400 font-bold">طوارئ</span>' : ''}
            </div>
            <h3 class="font-extrabold text-white">${esc(srv.name)}</h3>
            <p class="text-xs text-slate-400 mt-0.5">${esc(srv.address)} • ${esc(srv.phone)}</p>
            <p class="text-[11px] text-slate-500 mt-1">التقييم ${srv.rating} (${srv.reviewsCount}) • ${esc(srv.tags)}</p>
          </div>
          <div class="flex gap-1.5 shrink-0">
            <button data-edit="${esc(srv.id)}" class="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-amber-400" title="تعديل">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>
            <button data-del="${esc(srv.id)}" class="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white" title="حذف">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </article>`;
  }).join('');

  els.servicesList.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => startEdit(btn.dataset.edit));
  });
  els.servicesList.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => deleteService(btn.dataset.del, btn));
  });
  refreshIcons();
}

function readForm() {
  const fd = new FormData(els.serviceForm);
  return {
    name: String(fd.get('name') || '').trim(),
    category: String(fd.get('category') || 'maintenance'),
    subcategory: String(fd.get('subcategory') || ''),
    area: String(fd.get('area') || ''),
    address: String(fd.get('address') || '').trim(),
    phone: String(fd.get('phone') || '').trim(),
    whatsapp: String(fd.get('whatsapp') || '').trim(),
    mapUrl: String(fd.get('mapUrl') || '').trim(),
    // الصورة المختارة من الجهاز (Data URL) تتقدم على حقل الرابط النصي.
    imageUrl: state.servicePhotoDataUrl || String(fd.get('imageUrl') || '').trim(),
    openHour: Number(fd.get('openHour') ?? 9),
    closeHour: Number(fd.get('closeHour') ?? 23),
    isEmergency: fd.get('isEmergency') === 'on',
    verified: fd.get('verified') === 'on',
    rating: Number(fd.get('rating') ?? 5),
    tags: String(fd.get('tags') || '').trim(),
    menu: parseMenuText(fd.get('menuText'))
  };
}

function fillForm(srv) {
  const f = els.serviceForm;
  f.name.value = srv.name || '';
  f.category.value = srv.category || 'maintenance';
  fillSubSelect(srv.category || 'maintenance', srv.subcategory || '');
  // إن كانت المنطقة المحفوظة ليست من خيارات القائمة (مثل "الإسماعيلية")، أضفها مؤقتاً حتى لا تضيع عند الحفظ.
  const areaSel = f.area;
  if (srv.area && !Array.from(areaSel.options).some((o) => o.value === srv.area)) {
    const opt = document.createElement('option');
    opt.value = srv.area;
    opt.textContent = srv.area;
    areaSel.appendChild(opt);
  }
  f.area.value = srv.area || '';
  f.address.value = srv.address || '';
  f.phone.value = srv.phone || '';
  f.whatsapp.value = srv.whatsapp || '';
  f.mapUrl.value = srv.mapUrl || '';
  // صورة محفوظة كبيانات داخل المستند (من جهاز) تُعرض في المعاينة
  // وتُحفَظ كما هي عند الحفظ؛ أما الرابط/المسار فيبقى في الحقل النصي.
  if (srv.imageUrl && String(srv.imageUrl).startsWith('data:')) {
    state.servicePhotoDataUrl = srv.imageUrl;
    f.imageUrl.value = '';
    showPhotoPreview('service', srv.imageUrl);
  } else {
    state.servicePhotoDataUrl = null;
    clearPhotoPreview('service');
    f.imageUrl.value = srv.imageUrl || '';
  }
  f.openHour.value = srv.openHour ?? 9;
  f.closeHour.value = srv.closeHour ?? 23;
  f.isEmergency.checked = Boolean(srv.isEmergency);
  f.verified.checked = Boolean(srv.verified);
  f.rating.value = srv.rating ?? 5;
  f.tags.value = srv.tags || '';
  f.menuText.value = menuToText(srv.menu);
}

function startEdit(id) {
  const srv = state.services.find((s) => s.id === id);
  if (!srv) return;
  state.editingId = id;
  fillForm(srv);
  els.formTitle.textContent = 'تعديل خدمة: ' + srv.name;
  els.submitBtn.textContent = 'حفظ التعديلات';
  els.serviceForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  state.editingId = null;
  state.approvingPendingId = null;
  state.servicePhotoDataUrl = null;
  clearPhotoPreview('service');
  els.serviceForm.reset();
  els.formTitle.textContent = 'إضافة خدمة جديدة';
  els.submitBtn.textContent = 'حفظ الخدمة';
}

// صورة من الجهاز لنموذجي الخدمة والإعلان: تُصغَّر داخل المتصفح
// وتُحفظ كـ Data URL في state، ويظهر زر تحميلها لرفعها على GitHub لاحقاً.
function showPhotoPreview(kind, dataUrl) {
  const preview = kind === 'banner' ? els.bannerPhotoPreview : els.adminPhotoPreview;
  const actions = kind === 'banner' ? els.bannerPhotoActions : els.adminPhotoActions;
  const download = kind === 'banner' ? els.bannerPhotoDownload : els.adminPhotoDownload;
  if (!preview) return;
  preview.src = dataUrl;
  preview.classList.remove('hidden');
  actions?.classList.remove('hidden');
  if (download) download.href = dataUrl;
}

function clearPhotoPreview(kind) {
  const input = kind === 'banner' ? els.bannerPhotoInput : els.adminPhotoInput;
  const preview = kind === 'banner' ? els.bannerPhotoPreview : els.adminPhotoPreview;
  const actions = kind === 'banner' ? els.bannerPhotoActions : els.adminPhotoActions;
  if (input) input.value = '';
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  actions?.classList.add('hidden');
  if (kind === 'banner') state.bannerPhotoDataUrl = null;
  else state.servicePhotoDataUrl = null;
}

async function handlePhotoPicked(kind, file) {
  if (!file) return;
  try {
    const dataUrl = await downscaleImageToDataUrl(file, kind === 'banner' ? 1200 : 900, 0.72);
    if (kind === 'banner') state.bannerPhotoDataUrl = dataUrl;
    else state.servicePhotoDataUrl = dataUrl;
    showPhotoPreview(kind, dataUrl);
  } catch (err) {
    alert(err.message || 'تعذرت معالجة الصورة.');
  }
}

async function deleteService(id, btn) {
  armDeleteConfirm(btn, async () => {
    try {
      await db.deleteService(id);
      await loadServices();
    } catch (err) {
      alert(err.message || 'تعذر حذف الخدمة.');
    }
  });
}

function bindEvents() {
  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.loginError.classList.add('hidden');
    els.loginError.textContent = '';
    try {
      await signInWithEmailAndPassword(auth, els.loginEmail.value.trim(), els.loginPassword.value);
      // onAuthStateChanged يتولى إظهار اللوحة أو رسالة عدم الصلاحية.
    } catch (err) {
      els.loginError.textContent = arabicAuthError(err);
      els.loginError.classList.remove('hidden');
    }
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    deniedEmail = null;
    await signOut(auth);
  });
  document.getElementById('btnDeniedLogout').addEventListener('click', async () => {
    deniedEmail = null;
    await signOut(auth);
    showSection('login');
  });
  document.getElementById('btnBackHome').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  els.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderList();
  });
  els.categoryFilter.addEventListener('change', (e) => {
    state.categoryFilter = e.target.value;
    renderList();
  });
  document.getElementById('adminGroupSelect')?.addEventListener('change', (e) => {
    fillSubSelect(e.target.value, '');
  });

  els.seedBtn.addEventListener('click', async () => {
    if (!confirm('لا توجد خدمات افتراضية للنشر. متابعة؟')) return;
    try {
      const result = await db.seedInitialServices();
      alert(result.message);
      await loadServices();
    } catch (err) {
      alert(err.message || 'تعذر نشر الخدمات الافتراضية.');
    }
  });

  document.getElementById('btnNewService').addEventListener('click', () => {
    resetForm();
    els.serviceForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('btnCancelEdit').addEventListener('click', resetForm);

  // اختيار صورة من الجهاز لنموذج الخدمة.
  els.adminPhotoInput?.addEventListener('change', () => {
    handlePhotoPicked('service', els.adminPhotoInput.files && els.adminPhotoInput.files[0]);
  });
  els.adminPhotoRemove?.addEventListener('click', () => clearPhotoPreview('service'));

  // اختيار صورة من الجهاز لنموذج الإعلان.
  els.bannerPhotoInput?.addEventListener('change', () => {
    handlePhotoPicked('banner', els.bannerPhotoInput.files && els.bannerPhotoInput.files[0]);
  });
  els.bannerPhotoRemove?.addEventListener('click', () => clearPhotoPreview('banner'));

  els.serviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm();
    if (!data.name || !data.phone) {
      alert('الاسم ورقم الهاتف حقول إلزامية.');
      return;
    }
    try {
      if (state.editingId) {
        await db.updateService(state.editingId, data);
        alert('تم حفظ التعديلات بنجاح.');
      } else {
        await db.addService(data);
        if (state.approvingPendingId) {
          await db.deletePendingService(state.approvingPendingId);
          state.approvingPendingId = null;
          alert('تم نشر الخدمة وحذف الطلب من قائمة المراجعة.');
        } else {
          alert('تمت إضافة الخدمة ونشرها بنجاح.');
        }
      }
      resetForm();
      await loadServices();
    } catch (err) {
      alert(err.message || 'تعذر حفظ الخدمة.');
    }
  });

  els.offerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await db.addOffer({
        serviceId: fd.get('serviceId'),
        title: fd.get('title'),
        discount: fd.get('discount'),
        validUntil: fd.get('validUntil'),
        details: fd.get('details'),
        active: true
      });
      els.offerForm.reset();
      await loadServices();
      alert('تمت إضافة العرض بنجاح.');
    } catch (err) {
      alert(err.message || 'تعذر إضافة العرض.');
    }
  });

  // شاشة العرض: إضافة إعلان جديد أو حفظ تعديلات إعلان موجود.
  els.bannerLinkType?.addEventListener('change', updateBannerLinkFields);
  els.bannerCancelEdit?.addEventListener('click', cancelBannerEdit);
  els.bannerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      title: fd.get('title'),
      subtitle: fd.get('subtitle'),
      // الصورة المختارة من الجهاز (Data URL) تتقدم على حقل الرابط النصي.
      imageUrl: state.bannerPhotoDataUrl || fd.get('imageUrl'),
      linkType: fd.get('linkType'),
      serviceId: fd.get('serviceId'),
      url: fd.get('url'),
      order: fd.get('order'),
      validUntil: fd.get('validUntil'),
      active: fd.get('active') === 'on'
    };
    try {
      if (state.editingBannerId) {
        await db.updateBanner(state.editingBannerId, data);
        alert('تم حفظ تعديلات الإعلان بنجاح.');
      } else {
        await db.addBanner(data);
        alert('تمت إضافة الإعلان بنجاح — سيظهر في شاشة العرض أول الموقع.');
      }
      cancelBannerEdit();
      await loadServices();
    } catch (err) {
      alert(err.message || 'تعذر حفظ الإعلان.');
    }
  });
}

function initAdmin() {
  // قائمة الفئات في فلتر اللوحة.
  CATEGORIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    els.categoryFilter.appendChild(opt);
  });
  // قائمة الأقسام في نموذج الخدمة — من GROUPS حتى تظهر أي أقسام جديدة تلقائياً.
  const groupSelect = document.getElementById('adminGroupSelect');
  if (groupSelect) {
    groupSelect.innerHTML = GROUPS.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
  }
  // قائمة المناطق في نموذج الخدمة.
  const areaSelect = document.querySelector('select[name="area"]');
  AREAS.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    areaSelect.appendChild(opt);
  });
  // التصنيفات الفرعية في النموذج تتبع القسم الرئيسي (الافتراضي: الأغذية).
  fillSubSelect('food', '');

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (deniedEmail) {
        els.deniedEmail.textContent = deniedEmail;
        showSection('denied');
      } else {
        showSection('login');
      }
      return;
    }
    if (!isAdmin(user)) {
      deniedEmail = user.email;
      els.deniedEmail.textContent = deniedEmail;
      showSection('denied');
      // تسجيل خروج فوري — لا يبقى أي مستخدم غير أدمن مسجلاً.
      await signOut(auth);
      return;
    }
    deniedEmail = null;
    els.adminEmailLabel.textContent = user.email;
    showSection('dashboard');
    await loadServices();
  });

  bindEvents();
  refreshIcons();
}

initAdmin();
