// لوحة تحكم الإدارة — الدخول عبر Firebase Auth فقط.
// لا يوجد أي رقم سري في هذا الملف. الأدمن الوحيد هو البريد
// المحدد في js/config.js (ADMIN_EMAIL)، وأي بريد آخر مسجل
// يظهر له "لا تملك صلاحية" ويُسجَّل خروجه فوراً.
// كل عمليات الكتابة تمر عبر js/database.js (Firestore).
import { CATEGORIES, GROUPS, AREAS, ADMIN_EMAIL } from './config.js';
import { db, INITIAL_SERVICES } from './database.js';
import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  isAdmin
} from './firebase.js';
import { getOpenStatus } from './ui.js';

const state = {
  services: [],
  remoteCount: 0,
  pendingReviews: [],
  editingId: null,
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
  serviceForm: document.getElementById('serviceForm'),
  formTitle: document.getElementById('formTitle'),
  submitBtn: document.getElementById('submitServiceBtn')
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
  renderStats();
  renderList();
  renderReviewsQueue();
  updateSeedButton();
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
    btn.addEventListener('click', async () => {
      if (!confirm('هل أنت متأكد من حذف هذا التقييم نهائياً؟')) return;
      try {
        await db.deleteReview(btn.dataset.deleteReview);
        await loadServices();
      } catch (err) {
        alert(err.message || 'تعذر حذف التقييم.');
      }
    });
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

  els.statsGrid.innerHTML = [
    { label: 'إجمالي الخدمات', value: total, icon: 'layout-grid', color: 'text-amber-400' },
    { label: 'خدمات طوارئ', value: emergency, icon: 'siren', color: 'text-rose-400' },
    { label: 'خدمات موثقة', value: verified, icon: 'badge-check', color: 'text-sky-400' },
    { label: 'متوسط التقييم', value: avgRating, icon: 'star', color: 'text-emerald-400' },
    { label: 'تقييمات بانتظار المراجعة', value: state.pendingReviews.length, icon: 'messages-square', color: 'text-violet-400' }
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
    btn.addEventListener('click', () => deleteService(btn.dataset.del));
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
    imageUrl: String(fd.get('imageUrl') || '').trim(),
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
  f.area.value = srv.area || '';
  f.address.value = srv.address || '';
  f.phone.value = srv.phone || '';
  f.whatsapp.value = srv.whatsapp || '';
  f.mapUrl.value = srv.mapUrl || '';
  f.imageUrl.value = srv.imageUrl || '';
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
  els.serviceForm.reset();
  els.formTitle.textContent = 'إضافة خدمة جديدة';
  els.submitBtn.textContent = 'حفظ الخدمة';
}

async function deleteService(id) {
  const srv = state.services.find((s) => s.id === id);
  if (!confirm(`هل أنت متأكد من حذف "${srv ? srv.name : id}" نهائياً؟`)) return;
  try {
    await db.deleteService(id);
    await loadServices();
  } catch (err) {
    alert(err.message || 'تعذر حذف الخدمة.');
  }
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

  els.serviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm();
    if (!data.name || !data.address || !data.phone) {
      alert('الاسم والعنوان ورقم الهاتف حقول إلزامية.');
      return;
    }
    try {
      if (state.editingId) {
        await db.updateService(state.editingId, data);
        alert('تم حفظ التعديلات بنجاح.');
      } else {
        await db.addService(data);
        alert('تمت إضافة الخدمة ونشرها بنجاح.');
      }
      resetForm();
      await loadServices();
    } catch (err) {
      alert(err.message || 'تعذر حفظ الخدمة.');
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
