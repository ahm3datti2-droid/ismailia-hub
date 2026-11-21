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
  pendingEdits: [],
  pendingOfferRequests: [],
  pendingJarakProviders: [],
  pendingJarakRequests: [],
  liveJarakRequests: [],
  pendingJarakReviews: [],
  goldPrices: null,
  offers: [],
  banners: [],
  awarenessWarnings: [],
  awarenessReports: [],
  classifieds: [],
  jobs: [],
  users: [],
  usersLoadFailed: false,
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
  pendingEditsList: document.getElementById('pendingEditsList'),
  pendingEditsCount: document.getElementById('pendingEditsCount'),
  pendingOfferRequestsList: document.getElementById('pendingOfferRequestsList'),
  pendingOfferRequestsCount: document.getElementById('pendingOfferRequestsCount'),
  pendingJarakProvidersList: document.getElementById('pendingJarakProvidersList'),
  pendingJarakProvidersCount: document.getElementById('pendingJarakProvidersCount'),
  pendingJarakRequestsList: document.getElementById('pendingJarakRequestsList'),
  pendingJarakRequestsCount: document.getElementById('pendingJarakRequestsCount'),
  liveJarakRequestsList: document.getElementById('liveJarakRequestsList'),
  liveJarakRequestsCount: document.getElementById('liveJarakRequestsCount'),
  pendingJarakReviewsList: document.getElementById('pendingJarakReviewsList'),
  pendingJarakReviewsCount: document.getElementById('pendingJarakReviewsCount'),
  goldForm: document.getElementById('goldForm'),
  goldUpdatedAt: document.getElementById('goldUpdatedAt'),
  goldStatus: document.getElementById('goldStatus'),
  usersList: document.getElementById('usersList'),
  usersCount: document.getElementById('usersCount'),
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
  warningForm: document.getElementById('warningForm'),
  warningsList: document.getElementById('warningsList'),
  reportsList: document.getElementById('reportsList'),
  reportsCount: document.getElementById('reportsCount'),
  classifiedsList: document.getElementById('classifiedsList'),
  classifiedsCount: document.getElementById('classifiedsCount'),
  jobsList: document.getElementById('jobsList'),
  jobsCount: document.getElementById('jobsCount'),
  todayVisitsTotal: document.getElementById('todayVisitsTotal'),
  todayVisitsDate: document.getElementById('todayVisitsDate'),
  todayGroupsList: document.getElementById('todayGroupsList'),
  serviceForm: document.getElementById('serviceForm'),
  formTitle: document.getElementById('formTitle'),
  submitBtn: document.getElementById('submitServiceBtn'),
  bulkImportInput: document.getElementById('bulkImportInput'),
  bulkImportBtn: document.getElementById('bulkImportBtn'),
  bulkImportFileName: document.getElementById('bulkImportFileName'),
  bulkImportStatus: document.getElementById('bulkImportStatus'),
  verifyAllBtn: document.getElementById('verifyAllBtn'),
  verifyAllStatus: document.getElementById('verifyAllStatus'),
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
  await loadPendingEdits();
  await loadPendingOfferRequests();
  await loadPendingJarakProviders();
  await loadPendingJarakRequests();
  await loadLiveJarakRequests();
  await loadPendingJarakReviews();
  await loadGoldPrices();
  await loadOffers();
  await loadBanners();
  await loadAwarenessWarnings();
  await loadAwarenessReports();
  await loadClassifieds();
  await loadJobs();
  await loadUsers();
  await loadDailyStats();
  renderStats();
  renderList();
  renderUsersList();
  renderPendingEdits();
  renderPendingOfferRequests();
  renderPendingJarakProviders();
  renderPendingJarakRequests();
  renderLiveJarakRequests();
  renderPendingJarakReviews();
  renderReviewsQueue();
  renderPendingServicesQueue();
  renderOffersList();
  renderBannersList();
  renderAwarenessWarningsList();
  renderAwarenessReportsList();
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

// المستخدمون المسجلون — إذا فشل التحميل (غالباً قواعد Firestore
// لا تسمح للأدمن بقراءة مجموعة users بعد) تُعرض رسالة توضح السبب
// بدلاً من قائمة فارغة مضللة.
async function loadUsers() {
  try {
    state.users = await db.getAllUsers();
    state.usersLoadFailed = false;
  } catch (_) {
    state.users = [];
    state.usersLoadFailed = true;
  }
}

function formatUserDate(u) {
  try {
    const ms = u.createdAt?.toMillis ? u.createdAt.toMillis() : 0;
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (_) {
    return '—';
  }
}

function renderUsersList() {
  if (!els.usersList) return;
  els.usersCount.textContent = String(state.users.length);
  if (state.usersLoadFailed) {
    els.usersList.innerHTML = `
      <div class="text-center py-6 bg-slate-900/40 rounded-3xl border border-slate-800/80">
        <p class="text-amber-400 text-xs font-bold">تعذر تحميل المستخدمين — قواعد Firestore لا تسمح للأدمن بقراءة مجموعة users بعد.</p>
        <p class="text-slate-400 text-[11px] font-semibold mt-1">حدّث القواعد من Firebase Console (Firestore ← Rules) ثم أعد تحميل اللوحة.</p>
      </div>`;
    return;
  }
  if (!state.users.length) {
    els.usersList.innerHTML = `
      <div class="text-center py-6 bg-slate-900/40 rounded-3xl border border-slate-800/80">
        <p class="text-slate-400 text-xs font-semibold">لا يوجد مستخدمون مسجلون بعد — تظهر هنا حسابات منشأة من صفحة "حسابي" فور إنشائها.</p>
      </div>`;
    return;
  }
  els.usersList.innerHTML = state.users.map((u) => `
    <div class="flex flex-wrap items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl px-3 py-2.5">
      <span class="w-9 h-9 shrink-0 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-black text-sm">${esc((u.name || 'م')[0] || 'م')}</span>
      <span class="min-w-0 flex-1">
        <span class="block text-xs font-extrabold text-white truncate">${esc(u.name || 'مستخدم')}</span>
        <span class="block text-[11px] font-bold text-slate-400" dir="ltr">${esc(u.phone || '')}${u.email ? ' • ' + esc(u.email) : ''}</span>
      </span>
      <span class="text-[11px] font-bold text-slate-400 shrink-0">${formatUserDate(u)}</span>
      ${u.phone ? `<a href="tel:${esc(u.phone.replace(/[^0-9+]/g, ''))}" class="shrink-0 text-[11px] font-extrabold text-sky-400 bg-sky-500/10 px-2.5 py-1.5 rounded-full">اتصال</a>` : ''}
    </div>`).join('');
  refreshIcons();
}

// طلبات تعديل وعروض أصحاب الأنشطة — إذا فشل التحميل تُعرض القائمة
// فارغة بدلاً من كسر اللوحة.
async function loadPendingEdits() {
  try {
    state.pendingEdits = await db.getPendingEditRequests();
  } catch (_) {
    state.pendingEdits = [];
  }
}

async function loadPendingOfferRequests() {
  try {
    state.pendingOfferRequests = await db.getPendingOfferRequests();
  } catch (_) {
    state.pendingOfferRequests = [];
  }
}

async function loadGoldPrices() {
  try {
    state.goldPrices = await db.getGoldPrices();
  } catch (_) {
    state.goldPrices = null;
  }
  fillGoldForm();
}

function fillGoldForm() {
  const g = state.goldPrices;
  const f = els.goldForm;
  if (!f) return;
  f.price24.value = g?.price24 || '';
  f.price21.value = g?.price21 || '';
  f.price18.value = g?.price18 || '';
  f.pound.value = g?.pound || '';
  if (els.goldUpdatedAt) {
    try {
      const ms = g?.updatedAt?.toMillis ? g.updatedAt.toMillis() : 0;
      els.goldUpdatedAt.textContent = ms
        ? new Date(ms).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
        : '—';
    } catch (_) {
      els.goldUpdatedAt.textContent = '—';
    }
  }
}

function serviceNameById(id) {
  const s = state.services.find((x) => x.id === id);
  return s ? s.name : 'نشاط';
}

function renderPendingEdits() {
  if (!els.pendingEditsList) return;
  els.pendingEditsCount.textContent = String(state.pendingEdits.length);
  if (!state.pendingEdits.length) {
    els.pendingEditsList.innerHTML = `
      <div class="text-center py-6 bg-slate-900/40 rounded-3xl border border-slate-800/80">
        <p class="text-slate-400 text-xs font-semibold">لا توجد طلبات تعديل بانتظار المراجعة</p>
      </div>`;
    return;
  }
  els.pendingEditsList.innerHTML = state.pendingEdits.map((r) => {
    const changes = Object.entries(r.changes || {}).map(([k, v]) => `<p class="text-[11px] text-slate-300 font-semibold">• ${esc(k)}: ${esc(String(v))}</p>`).join('');
    return `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <p class="text-xs font-extrabold text-white">${esc(serviceNameById(r.serviceId))}</p>
      <div class="mt-2 space-y-0.5">${changes}</div>
      <div class="flex gap-2 mt-3">
        <button data-approve-edit="${esc(r.id)}" class="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-full">موافقة وتطبيق</button>
        <button data-reject-edit="${esc(r.id)}" class="text-[11px] font-extrabold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-full">رفض</button>
      </div>
    </div>`;
  }).join('');
  els.pendingEditsList.querySelectorAll('[data-approve-edit]').forEach((b) =>
    b.addEventListener('click', () => handleApproveEdit(b.dataset.approveEdit, b)));
  els.pendingEditsList.querySelectorAll('[data-reject-edit]').forEach((b) =>
    b.addEventListener('click', () => armDeleteConfirm(b, async () => {
      try { await db.rejectEditRequest(b.dataset.rejectEdit); await loadServices(); } catch (err) { alert(err.message || 'تعذر رفض الطلب.'); }
    })));
}

async function handleApproveEdit(id, btn) {
  try {
    if (btn) btn.disabled = true;
    await db.approveEditRequest(id);
    await loadServices();
    alert('تم تطبيق التعديل على الخدمة.');
  } catch (err) {
    alert(err.message || 'تعذر تطبيق التعديل.');
    if (btn) btn.disabled = false;
  }
}

function renderPendingOfferRequests() {
  if (!els.pendingOfferRequestsList) return;
  els.pendingOfferRequestsCount.textContent = String(state.pendingOfferRequests.length);
  if (!state.pendingOfferRequests.length) {
    els.pendingOfferRequestsList.innerHTML = `
      <div class="text-center py-6 bg-slate-900/40 rounded-3xl border border-slate-800/80">
        <p class="text-slate-400 text-xs font-semibold">لا توجد طلبات عروض بانتظار المراجعة</p>
      </div>`;
    return;
  }
  els.pendingOfferRequestsList.innerHTML = state.pendingOfferRequests.map((r) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <p class="text-xs font-extrabold text-white">${esc(serviceNameById(r.serviceId))}</p>
      <p class="text-[11px] text-slate-300 font-semibold mt-1">${esc(r.title || '')}${r.discount ? ' — ' + esc(r.discount) : ''}${r.validUntil ? ' (حتى ' + esc(r.validUntil) + ')' : ''}</p>
      <div class="flex gap-2 mt-3">
        <button data-approve-offer-req="${esc(r.id)}" class="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-full">موافقة ونشر</button>
        <button data-reject-offer-req="${esc(r.id)}" class="text-[11px] font-extrabold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-full">رفض</button>
      </div>
    </div>`).join('');
  els.pendingOfferRequestsList.querySelectorAll('[data-approve-offer-req]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        b.disabled = true;
        await db.approveOfferRequest(b.dataset.approveOfferReq);
        await loadServices();
        alert('تم نشر العرض في "عروض اليوم".');
      } catch (err) {
        alert(err.message || 'تعذر نشر العرض.');
        b.disabled = false;
      }
    }));
  els.pendingOfferRequestsList.querySelectorAll('[data-reject-offer-req]').forEach((b) =>
    b.addEventListener('click', () => armDeleteConfirm(b, async () => {
      try { await db.rejectOfferRequest(b.dataset.rejectOfferReq); await loadServices(); } catch (err) { alert(err.message || 'تعذر رفض الطلب.'); }
    })));
}

// جارك — قوائم المراجعة (مزودون/طلبات/تقييمات). الفشل الصامت يترك
// القائمة فارغة بدل كسر اللوحة.
async function loadPendingJarakProviders() {
  try { state.pendingJarakProviders = await db.getPendingJarakProviders(); } catch (_) { state.pendingJarakProviders = []; }
}
async function loadPendingJarakRequests() {
  try { state.pendingJarakRequests = await db.getPendingJarakRequests(); } catch (_) { state.pendingJarakRequests = []; }
}
async function loadPendingJarakReviews() {
  try { state.pendingJarakReviews = await db.getPendingJarakReviews(); } catch (_) { state.pendingJarakReviews = []; }
}
async function loadLiveJarakRequests() {
  try { state.liveJarakRequests = await db.getLiveJarakRequests(); } catch (_) { state.liveJarakRequests = []; }
}

function emptyQueueHtml(msg) {
  return `
      <div class="text-center py-6 bg-slate-900/40 rounded-3xl border border-slate-800/80">
        <p class="text-slate-400 text-xs font-semibold">${msg}</p>
      </div>`;
}

function renderPendingJarakProviders() {
  if (!els.pendingJarakProvidersList) return;
  els.pendingJarakProvidersCount.textContent = String(state.pendingJarakProviders.length);
  if (!state.pendingJarakProviders.length) {
    els.pendingJarakProvidersList.innerHTML = emptyQueueHtml('لا يوجد مزودون بانتظار الاعتماد');
    return;
  }
  els.pendingJarakProvidersList.innerHTML = state.pendingJarakProviders.map((p) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <p class="text-xs font-extrabold text-white">${esc(p.name)}</p>
      <p class="text-[11px] text-slate-300 font-semibold mt-1">${esc((p.categories || []).join('، '))} • ${esc(p.area || '')} • <span dir="ltr">${esc(p.phone || '')}</span></p>
      <div class="flex gap-2 mt-3">
        <button data-approve-jarak-provider="${esc(p.id)}" class="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-full">اعتماد المزود</button>
        <button data-reject-jarak-provider="${esc(p.id)}" class="text-[11px] font-extrabold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-full">رفض وحذف</button>
      </div>
    </div>`).join('');
  els.pendingJarakProvidersList.querySelectorAll('[data-approve-jarak-provider]').forEach((b) =>
    b.addEventListener('click', async () => {
      try { b.disabled = true; await db.approveJarakProvider(b.dataset.approveJarakProvider); await loadServices(); }
      catch (err) { alert(err.message || 'تعذر الاعتماد.'); b.disabled = false; }
    }));
  els.pendingJarakProvidersList.querySelectorAll('[data-reject-jarak-provider]').forEach((b) =>
    b.addEventListener('click', () => armDeleteConfirm(b, async () => {
      try { await db.rejectJarakProvider(b.dataset.rejectJarakProvider); await loadServices(); } catch (err) { alert(err.message || 'تعذر الرفض.'); }
    })));
}

function renderPendingJarakRequests() {
  if (!els.pendingJarakRequestsList) return;
  els.pendingJarakRequestsCount.textContent = String(state.pendingJarakRequests.length);
  if (!state.pendingJarakRequests.length) {
    els.pendingJarakRequestsList.innerHTML = emptyQueueHtml('لا توجد طلبات جارك بانتظار المراجعة');
    return;
  }
  els.pendingJarakRequestsList.innerHTML = state.pendingJarakRequests.map((r) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <p class="text-xs font-extrabold text-white">${esc(r.title)}</p>
      <p class="text-[11px] text-slate-300 font-semibold mt-1">${esc(r.category || '')} • ${esc(r.area || '')} • يعرض ${Number(r.price || 0).toLocaleString('en-US')} جنيه • <span dir="ltr">${esc(r.customerPhone || '')}</span></p>
      ${r.description ? `<p class="text-[11px] text-slate-400 font-semibold mt-1">${esc(r.description)}</p>` : ''}
      <div class="flex gap-2 mt-3">
        <button data-approve-jarak-request="${esc(r.id)}" class="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-full">نشر الطلب</button>
        <button data-reject-jarak-request="${esc(r.id)}" class="text-[11px] font-extrabold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-full">رفض وحذف</button>
      </div>
    </div>`).join('');
  els.pendingJarakRequestsList.querySelectorAll('[data-approve-jarak-request]').forEach((b) =>
    b.addEventListener('click', async () => {
      try { b.disabled = true; await db.approveJarakRequest(b.dataset.approveJarakRequest); await loadServices(); }
      catch (err) { alert(err.message || 'تعذر النشر.'); b.disabled = false; }
    }));
  els.pendingJarakRequestsList.querySelectorAll('[data-reject-jarak-request]').forEach((b) =>
    b.addEventListener('click', () => armDeleteConfirm(b, async () => {
      try { await db.rejectJarakRequest(b.dataset.rejectJarakRequest); await loadServices(); } catch (err) { alert(err.message || 'تعذر الرفض.'); }
    })));
}

function renderLiveJarakRequests() {
  if (!els.liveJarakRequestsList) return;
  els.liveJarakRequestsCount.textContent = String(state.liveJarakRequests.length);
  if (!state.liveJarakRequests.length) {
    els.liveJarakRequestsList.innerHTML = emptyQueueHtml('لا توجد طلبات جارك منشورة');
    return;
  }
  els.liveJarakRequestsList.innerHTML = state.liveJarakRequests.map((r) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <p class="text-xs font-extrabold text-white">${esc(r.title)} <span class="text-[11px] font-bold text-slate-400">(${esc(r.status === 'accepted' ? 'قيد التنفيذ' : 'مفتوح')})</span></p>
      <p class="text-[11px] text-slate-300 font-semibold mt-1">${esc(r.category || '')} • ${esc(r.area || '')} • يعرض ${Number(r.price || 0).toLocaleString('en-US')} جنيه • <span dir="ltr">${esc(r.customerPhone || '')}</span></p>
      <div class="flex gap-2 mt-3">
        <button data-delete-jarak-request="${esc(r.id)}" class="text-[11px] font-extrabold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-full">حذف الطلب</button>
      </div>
    </div>`).join('');
  els.liveJarakRequestsList.querySelectorAll('[data-delete-jarak-request]').forEach((b) =>
    b.addEventListener('click', () => armDeleteConfirm(b, async () => {
      try { await db.deleteJarakRequest(b.dataset.deleteJarakRequest); await loadServices(); } catch (err) { alert(err.message || 'تعذر الحذف.'); }
    })));
}

function renderPendingJarakReviews() {
  if (!els.pendingJarakReviewsList) return;
  els.pendingJarakReviewsCount.textContent = String(state.pendingJarakReviews.length);
  if (!state.pendingJarakReviews.length) {
    els.pendingJarakReviewsList.innerHTML = emptyQueueHtml('لا توجد تقييمات جارك بانتظار المراجعة');
    return;
  }
  els.pendingJarakReviewsList.innerHTML = state.pendingJarakReviews.map((r) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <p class="text-xs font-extrabold text-white">${'★'.repeat(Number(r.rating || 0))} — مزود: ${esc(r.providerId.slice(0, 8))}…</p>
      <p class="text-[11px] text-slate-300 font-semibold mt-1">${esc(r.text || '')}</p>
      <div class="flex gap-2 mt-3">
        <button data-approve-jarak-review="${esc(r.id)}" class="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-full">اعتماد التقييم</button>
        <button data-reject-jarak-review="${esc(r.id)}" class="text-[11px] font-extrabold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-full">حذف</button>
      </div>
    </div>`).join('');
  els.pendingJarakReviewsList.querySelectorAll('[data-approve-jarak-review]').forEach((b) =>
    b.addEventListener('click', async () => {
      try { b.disabled = true; await db.approveJarakReview(b.dataset.approveJarakReview); await loadServices(); }
      catch (err) { alert(err.message || 'تعذر الاعتماد.'); b.disabled = false; }
    }));
  els.pendingJarakReviewsList.querySelectorAll('[data-reject-jarak-review]').forEach((b) =>
    b.addEventListener('click', () => armDeleteConfirm(b, async () => {
      try { await db.deleteJarakReview(b.dataset.rejectJarakReview); await loadServices(); } catch (err) { alert(err.message || 'تعذر الحذف.'); }
    })));
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

// مركز الوعي الرقمي — التحذيرات والبلاغات (المرحلة 4).
// لو القواعد لسه متنشرتش، التحميل بيفشل بهدوء والقوايم بتفضل فاضية.
async function loadAwarenessWarnings() {
  try {
    state.awarenessWarnings = await db.getAllAwarenessWarnings();
  } catch (_) {
    state.awarenessWarnings = [];
  }
}
async function loadAwarenessReports() {
  try {
    state.awarenessReports = await db.getAwarenessReports();
  } catch (_) {
    state.awarenessReports = [];
  }
}

async function loadClassifieds() {
  try {
    state.classifieds = await db.getAllClassifieds();
  } catch (_) {
    state.classifieds = [];
  }
  renderClassifiedsList();
}
async function loadJobs() {
  try {
    state.jobs = await db.getAllJobs();
  } catch (_) {
    state.jobs = [];
  }
  renderJobsList();
}

function renderClassifiedsList() {
  if (!els.classifiedsList) return;
  const list = state.classifieds;
  if (els.classifiedsCount) els.classifiedsCount.textContent = String(list.filter((c) => c.status === 'pending').length);
  if (!list.length) {
    els.classifiedsList.innerHTML = `<p class="text-xs text-slate-400 font-semibold">لا توجد إعلانات بعد.</p>`;
    return;
  }
  els.classifiedsList.innerHTML = list.map((c) => {
    const when = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : '';
    return `
      <article class="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-extrabold text-white">${esc(c.title)} <span class="text-amber-400">(${c.status === 'approved' ? 'منشور' : 'بانتظار المراجعة'})</span></p>
          <span class="text-[11px] text-slate-500 font-bold">${esc(when)}${c.area ? ` • ${esc(c.area)}` : ''}</span>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed mt-1.5">${esc(c.description)}</p>
        <p class="text-[11px] text-slate-400 mt-1">السعر: ${c.price != null && c.price !== '' ? esc(Number(c.price).toLocaleString('en-US')) + ' ج.م' : 'غير محدد'} • للتواصل: <a href="tel:${esc(c.phone)}" dir="ltr" class="text-amber-400">${esc(c.phone)}</a></p>
        ${c.photo ? `<img src="${esc(c.photo)}" alt="صورة الإعلان" class="w-full max-h-48 object-contain bg-white rounded-xl mt-2">` : ''}
        <div class="flex gap-1.5 mt-3">
          ${c.status !== 'approved' ? `<button data-approve-classified="${esc(c.id)}" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition">نشر</button>` : ''}
          <button data-delete-classified="${esc(c.id)}" class="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-extrabold transition">حذف</button>
        </div>
      </article>`;
  }).join('');
  els.classifiedsList.querySelectorAll('[data-approve-classified]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await db.setClassifiedStatus(btn.dataset.approveClassified, 'approved');
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر نشر الإعلان.');
      }
    });
  });
  els.classifiedsList.querySelectorAll('[data-delete-classified]').forEach((btn) => {
    btn.addEventListener('click', () => armDeleteConfirm(btn, async () => {
      try {
        await db.deleteClassified(btn.dataset.deleteClassified);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر حذف الإعلان.');
      }
    }));
  });
}

function renderJobsList() {
  if (!els.jobsList) return;
  const list = state.jobs;
  if (els.jobsCount) els.jobsCount.textContent = String(list.filter((j) => j.status === 'pending').length);
  if (!list.length) {
    els.jobsList.innerHTML = `<p class="text-xs text-slate-400 font-semibold">لا توجد وظايف بعد.</p>`;
    return;
  }
  els.jobsList.innerHTML = list.map((j) => {
    const when = j.createdAt?.toDate ? j.createdAt.toDate().toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : '';
    return `
      <article class="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-extrabold text-white">${esc(j.title)} — ${esc(j.company)} <span class="text-amber-400">(${j.status === 'approved' ? 'منشورة' : 'بانتظار المراجعة'})</span></p>
          <span class="text-[11px] text-slate-500 font-bold">${esc(when)}${j.area ? ` • ${esc(j.area)}` : ''}</span>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed mt-1.5">${esc(j.description)}</p>
        <p class="text-[11px] text-slate-400 mt-1">${j.salary ? `الراتب: ${esc(j.salary)} • ` : ''}للتواصل: <a href="tel:${esc(j.phone)}" dir="ltr" class="text-amber-400">${esc(j.phone)}</a></p>
        <div class="flex gap-1.5 mt-3">
          ${j.status !== 'approved' ? `<button data-approve-job="${esc(j.id)}" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition">نشر</button>` : ''}
          <button data-delete-job="${esc(j.id)}" class="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-extrabold transition">حذف</button>
        </div>
      </article>`;
  }).join('');
  els.jobsList.querySelectorAll('[data-approve-job]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await db.setJobStatus(btn.dataset.approveJob, 'approved');
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر نشر الوظيفة.');
      }
    });
  });
  els.jobsList.querySelectorAll('[data-delete-job]').forEach((btn) => {
    btn.addEventListener('click', () => armDeleteConfirm(btn, async () => {
      try {
        await db.deleteJob(btn.dataset.deleteJob);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر حذف الوظيفة.');
      }
    }));
  });
}

const WARNING_LEVELS = { high: 'تحذير عاجل', medium: 'تنبيه', info: 'معلومة' };
const REPORT_STATUSES = { new: 'جديد', reviewed: 'قيد المراجعة', resolved: 'تم التعامل معه' };

function renderAwarenessWarningsList() {
  if (!els.warningsList) return;
  const list = state.awarenessWarnings;
  if (!list.length) {
    els.warningsList.innerHTML = `<p class="text-xs text-slate-400 font-semibold">لا توجد تحذيرات بعد — انشر أول تحذير من النموذج أعلاه بعد التأكد من مصدر رسمي.</p>`;
    return;
  }
  els.warningsList.innerHTML = list.map((w) => `
      <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
        <div class="min-w-0">
          <p class="text-xs font-extrabold text-white truncate">${esc(w.title)} <span class="text-amber-400">(${esc(WARNING_LEVELS[w.level] || w.level)})</span></p>
          <p class="text-[11px] text-slate-400 mt-0.5">${esc(String(w.body || '').slice(0, 120))}${String(w.body || '').length > 120 ? '…' : ''}</p>
          ${w.sourceUrl ? `<a href="${esc(w.sourceUrl)}" target="_blank" rel="noopener" class="text-[11px] text-sky-400 font-bold">${esc(w.sourceName || w.sourceUrl)}</a>` : ''}
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button data-toggle-warning="${esc(w.id)}" data-active="${w.active ? '0' : '1'}" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-extrabold transition">${w.active ? 'إيقاف' : 'تفعيل'}</button>
          <button data-delete-warning="${esc(w.id)}" class="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-extrabold transition">حذف</button>
        </div>
      </div>`).join('');

  els.warningsList.querySelectorAll('[data-toggle-warning]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await db.setAwarenessWarningActive(btn.dataset.toggleWarning, btn.dataset.active === '1');
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر تغيير حالة التحذير.');
      }
    });
  });
  els.warningsList.querySelectorAll('[data-delete-warning]').forEach((btn) => {
    btn.addEventListener('click', () => armDeleteConfirm(btn, async () => {
      try {
        await db.deleteAwarenessWarning(btn.dataset.deleteWarning);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر حذف التحذير.');
      }
    }));
  });
}

function renderAwarenessReportsList() {
  if (!els.reportsList) return;
  const list = state.awarenessReports;
  if (els.reportsCount) els.reportsCount.textContent = String(list.filter((r) => r.status === 'new').length);
  if (!list.length) {
    els.reportsList.innerHTML = `<p class="text-xs text-slate-400 font-semibold">لا توجد بلاغات بعد.</p>`;
    return;
  }
  els.reportsList.innerHTML = list.map((r) => {
    const when = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : '';
    return `
      <article class="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-extrabold text-white">${esc(r.type)} <span class="text-amber-400">(${esc(REPORT_STATUSES[r.status] || r.status)})</span></p>
          <span class="text-[11px] text-slate-500 font-bold">${esc(when)}${r.date ? ` • الواقعة: ${esc(r.date)}` : ''}</span>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed mt-1.5">${esc(r.details)}</p>
        ${r.source ? `<p class="text-[11px] text-slate-400 mt-1">المصدر/الرابط: <span dir="ltr">${esc(r.source)}</span></p>` : ''}
        ${r.contact ? `<p class="text-[11px] text-slate-400 mt-0.5">للتواصل: <span dir="ltr">${esc(r.contact)}</span></p>` : ''}
        ${r.screenshot ? `<a href="${esc(r.screenshot)}" target="_blank" rel="noopener"><img src="${esc(r.screenshot)}" alt="سكرين شوت مرفق" class="w-full max-h-48 object-contain bg-white rounded-xl mt-2"></a>` : ''}
        <div class="flex gap-1.5 mt-3">
          ${r.status !== 'reviewed' ? `<button data-report-status="${esc(r.id)}" data-status="reviewed" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-extrabold transition">قيد المراجعة</button>` : ''}
          ${r.status !== 'resolved' ? `<button data-report-status="${esc(r.id)}" data-status="resolved" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition">تم التعامل معه</button>` : ''}
          <button data-delete-report="${esc(r.id)}" class="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-extrabold transition">حذف</button>
        </div>
      </article>`;
  }).join('');

  els.reportsList.querySelectorAll('[data-report-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await db.setAwarenessReportStatus(btn.dataset.reportStatus, btn.dataset.status);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر تغيير حالة البلاغ.');
      }
    });
  });
  els.reportsList.querySelectorAll('[data-delete-report]').forEach((btn) => {
    btn.addEventListener('click', () => armDeleteConfirm(btn, async () => {
      try {
        await db.deleteAwarenessReport(btn.dataset.deleteReport);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر حذف البلاغ.');
      }
    }));
  });
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
    { label: 'مستخدمون مسجلون', value: state.users.length, icon: 'users', color: 'text-emerald-400' },
    { label: 'طلبات إضافة بانتظار المراجعة', value: state.pendingServices.length, icon: 'inbox', color: 'text-sky-400' },
    { label: 'طلبات جارك بانتظار المراجعة', value: state.pendingJarakProviders.length + state.pendingJarakRequests.length + state.pendingJarakReviews.length, icon: 'map-pin-house', color: 'text-emerald-400' },
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

function normalizeOwnerPhoneInput(p) {
  const d = String(p || '').replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.length === 12 && d.startsWith('20')) return '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('1')) return '0' + d;
  return d;
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
    ownerPhone: normalizeOwnerPhoneInput(fd.get('ownerPhone')),
    whatsapp: String(fd.get('whatsapp') || '').trim(),
    facebook: String(fd.get('facebook') || '').trim(),
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
  f.ownerPhone.value = srv.ownerPhone || srv.submitterPhone || '';
  f.whatsapp.value = srv.whatsapp || '';
  f.facebook.value = srv.facebook || '';
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

// استيراد جماعي من ملف JSON: كل عنصر فيه name وphone وaddress وarea
// وtarget_group وtarget_subcategory وimageUrl (مسار /images/... بعد رفع الصور).
// - تُتخطى العناصر بلا اسم أو بلا تليفون ولا حساب فيسبوك، أو بتصنيف غير موجود.
// - تُتخطى المكررة بنفس رقم الهاتف (مقارنة بالأرقام فقط) أو نفس حساب فيسبوك
//   سواء كانت موجودة في الدليل أصلاً أو تكررت داخل الملف نفسه.
// - كل خدمة تُحفظ موثقة (verified) بتقييم 5 — نفس افتراضيات النموذج.
async function handleBulkImport(file) {
  if (!file) { alert('اختر ملف JSON أولاً.'); return; }
  const setStatus = (t) => { if (els.bulkImportStatus) els.bulkImportStatus.textContent = t; };
  let items;
  try {
    items = JSON.parse(await file.text());
  } catch (_) {
    alert('ملف JSON غير صالح.');
    return;
  }
  if (!Array.isArray(items) || !items.length) {
    alert('الملف يجب أن يحتوي على قائمة خدمات غير فارغة.');
    return;
  }
  const groupIds = new Map(GROUPS.map((g) => [g.id, new Set(g.subs.map((s) => s.id))]));
  const existingPhones = new Set(state.services.map((s) => String(s.phone || '').replace(/\D/g, '')));
  const existingFb = new Set(state.services.map((s) => String(s.facebook || '').trim().toLowerCase()).filter(Boolean));
  const seenPhones = new Set();
  const seenFb = new Set();
  let added = 0, skippedDup = 0, skippedBad = 0;
  els.bulkImportBtn.disabled = true;
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const name = String(it.name || '').trim();
    const phone = String(it.phone || '').trim();
    const facebook = String(it.facebook || '').trim();
    const digits = phone.replace(/\D/g, '');
    const fbKey = facebook.toLowerCase();
    const validCat = groupIds.has(it.target_group) && groupIds.get(it.target_group).has(it.target_subcategory);
    if (!name || (!phone && !facebook) || !validCat) { skippedBad++; continue; }
    if ((digits && (existingPhones.has(digits) || seenPhones.has(digits))) || (fbKey && (existingFb.has(fbKey) || seenFb.has(fbKey)))) { skippedDup++; continue; }
    if (digits) seenPhones.add(digits);
    if (fbKey) seenFb.add(fbKey);
    setStatus(`جارٍ الاستيراد… ${i + 1}/${items.length} (أُضيف ${added} حتى الآن)`);
    try {
      await db.addService({
        name,
        category: it.target_group,
        subcategory: it.target_subcategory,
        area: String(it.area || 'الإسماعيلية'),
        address: String(it.address || ''),
        phone,
        whatsapp: '',
        facebook,
        imageUrl: String(it.imageUrl || ''),
        tags: '',
        isEmergency: false,
        openHour: 9,
        closeHour: 23,
        verified: true,
        rating: 5
      });
      if (digits) existingPhones.add(digits);
      if (fbKey) existingFb.add(fbKey);
      added++;
    } catch (_) {
      skippedBad++;
    }
  }
  els.bulkImportBtn.disabled = false;
  setStatus(`اكتمل الاستيراد: أُضيف ${added} • مكرر ${skippedDup} • غير صالح ${skippedBad}`);
  await loadServices();
  alert(`اكتمل الاستيراد: أُضيف ${added} خدمة • مكرر ${skippedDup} • غير صالح ${skippedBad}.`);
}

// توثيق كل الخدمات غير الموثقة التي لها صورة حقيقية وتليفون.
// الصورة الحقيقية: imageUrl غير فارغ وليس رابط مشاركة فيسبوك (روابط
// المشاركة لا تعرض صورة). تُتخطى الخدمات بلا صورة أو بلا تليفون
// وتُعرض أسماؤها وأسباب تخطيها في التقرير.
async function handleVerifyAll() {
  const setStatus = (t) => { if (els.verifyAllStatus) els.verifyAllStatus.textContent = t; };
  const isShareLink = (u) => /facebook\.com\/share|fb\.watch|l\.facebook\.com/i.test(String(u || ''));
  const hasRealPhoto = (s) => {
    const u = String(s.imageUrl || '').trim();
    return u !== '' && !isShareLink(u);
  };
  const unverified = state.services.filter((s) => !s.verified);
  const eligible = unverified.filter((s) => hasRealPhoto(s) && String(s.phone || '').trim() !== '');
  const skipped = unverified.filter((s) => !eligible.includes(s));
  if (!eligible.length) {
    setStatus(`لا توجد خدمات قابلة للتوثيق — ${skipped.length} متبقية بلا صورة حقيقية أو بلا تليفون.`);
    alert('لا توجد خدمات قابلة للتوثيق.');
    return;
  }
  els.verifyAllBtn.disabled = true;
  let done = 0, failed = 0;
  for (let i = 0; i < eligible.length; i++) {
    const s = eligible[i];
    setStatus(`جارٍ التوثيق… ${i + 1}/${eligible.length} (تم ${done})`);
    try {
      await db.updateService(s.id, { verified: true });
      done++;
    } catch (_) {
      failed++;
    }
  }
  els.verifyAllBtn.disabled = false;
  const skippedNames = skipped.map((s) => `${s.name} (${!hasRealPhoto(s) ? 'بلا صورة' : 'بلا تليفون'})`);
  const msg = `اكتمل التوثيق: وُثّق ${done} • فشل ${failed} • تُخطّى ${skipped.length}${skippedNames.length ? ' — ' + skippedNames.join('، ') : ''}`;
  setStatus(msg);
  await loadServices();
  alert(msg);
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

  // استيراد جماعي من ملف JSON.
  let bulkImportFile = null;
  els.bulkImportInput?.addEventListener('change', () => {
    bulkImportFile = els.bulkImportInput.files && els.bulkImportInput.files[0];
    if (els.bulkImportFileName) els.bulkImportFileName.textContent = bulkImportFile ? bulkImportFile.name : '';
  });
  els.bulkImportBtn?.addEventListener('click', () => handleBulkImport(bulkImportFile));

  // توثيق كل الخدمات المكتملة (صورة حقيقية + تليفون).
  els.verifyAllBtn?.addEventListener('click', () => handleVerifyAll());

  // حفظ أسعار الذهب اليوم.
  els.goldForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(els.goldForm);
    try {
      await db.setGoldPrices({
        price24: fd.get('price24'),
        price21: fd.get('price21'),
        price18: fd.get('price18'),
        pound: fd.get('pound')
      });
      if (els.goldStatus) els.goldStatus.textContent = 'تم حفظ أسعار الذهب — تظهر في الرئيسية فوراً.';
      await loadGoldPrices();
    } catch (err) {
      if (els.goldStatus) els.goldStatus.textContent = err.message || 'تعذر حفظ الأسعار.';
    }
  });

  els.serviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm();
    if (!data.name || (!data.phone && !data.facebook)) {
      alert('الاسم إلزامي، ولازم رقم هاتف أو حساب فيسبوك على الأقل.');
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

  els.warningForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await db.addAwarenessWarning({
        title: fd.get('title'),
        body: fd.get('body'),
        level: fd.get('level'),
        sourceName: fd.get('sourceName'),
        sourceUrl: fd.get('sourceUrl'),
        active: true
      });
      els.warningForm.reset();
      await loadServices();
      alert('تم نشر التحذير بنجاح.');
    } catch (err) {
      alert(err.message || 'تعذر نشر التحذير.');
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
      // لا نسجّل خروج المستخدم هنا: جلسة المصادقة مشتركة بين كل التبويبات،
      // فتسجيل الخروج من صفحة الأدمن كان يطرد المستخدم من كل الصفحات المفتوحة
      // (بما فيها جارك) — وُجد حياً 2026-11-20. يبقى مسجلاً ويرى رسالة الرفض،
      // وزر "تسجيل الخروج" في صفحة الرفض موجود لمن يريد الخروج بنفسه.
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
