// لوحة صاحب النشاط — دخول بحساب الموبايل + كلمة السر.
// يعرض خدماتي (المربوطة برقم موبايل حسابي)، وطلبات التعديل والعروض،
/// والتقييمات المعتمدة على خدماتي. أي تعديل أو عرض يروح للأدمن
// للمراجعة قبل النشر — صاحب النشاط لا يكتب في الخدمات مباشرة.
import { GROUPS } from './config.js';
import { db } from './database.js';
import { auth, onAuthStateChanged, signOut, isAdmin } from './firebase.js';
import { signIn, signUp, getProfile, translateAuthError } from './auth.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function refreshIcons() {
  try { window.lucide && window.lucide.createIcons(); } catch (_) {}
}

function categoryName(id) {
  const g = (GROUPS || []).find((x) => x.id === id);
  return g ? g.name : id;
}

const state = {
  user: null,
  profile: null,
  myServices: [],
  myRequests: [],
  myReviews: [],
  editingServiceId: null,
  offerServiceId: null
};

const els = {
  loginSection: document.getElementById('loginSection'),
  dashboardSection: document.getElementById('dashboardSection'),
  loginForm: document.getElementById('loginForm'),
  signupForm: document.getElementById('signupForm'),
  authError: document.getElementById('authError'),
  tabLogin: document.getElementById('tabLogin'),
  tabSignup: document.getElementById('tabSignup'),
  btnLogout: document.getElementById('btnLogout'),
  ownerName: document.getElementById('ownerName'),
  ownerPhone: document.getElementById('ownerPhone'),
  noProfileNote: document.getElementById('noProfileNote'),
  myServicesList: document.getElementById('myServicesList'),
  myServicesCount: document.getElementById('myServicesCount'),
  noServicesHint: document.getElementById('noServicesHint'),
  editRequestBox: document.getElementById('editRequestBox'),
  editServiceName: document.getElementById('editServiceName'),
  editRequestForm: document.getElementById('editRequestForm'),
  editCancelBtn: document.getElementById('editCancelBtn'),
  offerRequestBox: document.getElementById('offerRequestBox'),
  offerServiceName: document.getElementById('offerServiceName'),
  offerRequestForm: document.getElementById('offerRequestForm'),
  offerCancelBtn: document.getElementById('offerCancelBtn'),
  myRequestsList: document.getElementById('myRequestsList'),
  myRequestsCount: document.getElementById('myRequestsCount'),
  myReviewsList: document.getElementById('myReviewsList')
};

function showError(msg) {
  els.authError.textContent = msg;
  els.authError.classList.remove('hidden');
}

function setTab(mode) {
  const login = mode === 'login';
  els.loginForm.classList.toggle('hidden', !login);
  els.signupForm.classList.toggle('hidden', login);
  els.tabLogin.className = 'py-2.5 rounded-xl text-xs font-extrabold transition ' + (login ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300');
  els.tabSignup.className = 'py-2.5 rounded-xl text-xs font-extrabold transition ' + (!login ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300');
  els.authError.classList.add('hidden');
}

function stars(n) {
  const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function formatDate(ts) {
  try {
    const ms = ts?.toMillis ? ts.toMillis() : 0;
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (_) {
    return '—';
  }
}

async function loadDashboard() {
  const p = state.profile;
  els.ownerName.textContent = p?.name || 'صاحب النشاط';
  els.ownerPhone.textContent = p?.phone || '';
  els.noProfileNote.classList.toggle('hidden', Boolean(p));
  if (!p?.phoneNational) {
    state.myServices = [];
    state.myRequests = [];
    state.myReviews = [];
    renderAll();
    return;
  }
  try {
    state.myServices = await db.getMyServices(p.phoneNational);
  } catch (_) {
    state.myServices = [];
  }
  try {
    const [edits, offers] = await Promise.all([db.getMyEditRequests(), db.getMyOfferRequests()]);
    state.myRequests = [
      ...edits.map((r) => ({ ...r, kind: 'edit' })),
      ...offers.map((r) => ({ ...r, kind: 'offer' }))
    ].sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
  } catch (_) {
    state.myRequests = [];
  }
  state.myReviews = [];
  for (const s of state.myServices) {
    try {
      const revs = await db.getApprovedReviews(s.id);
      for (const r of revs) state.myReviews.push({ ...r, serviceName: s.name });
    } catch (_) {}
  }
  state.myReviews.sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });
  renderAll();
}

function renderAll() {
  renderServices();
  renderRequests();
  renderReviews();
  refreshIcons();
}

function renderServices() {
  els.myServicesCount.textContent = String(state.myServices.length);
  els.noServicesHint.classList.toggle('hidden', state.myServices.length > 0);
  if (!state.myServices.length) {
    els.myServicesList.innerHTML = '';
    return;
  }
  els.myServicesList.innerHTML = state.myServices.map((s) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div class="flex flex-wrap items-start gap-3">
        ${s.imageUrl ? `<img src="${esc(s.imageUrl)}" alt="" class="w-16 h-16 rounded-xl object-cover bg-slate-800 shrink-0">` : ''}
        <div class="min-w-0 flex-1">
          <p class="text-sm font-extrabold text-white">${esc(s.name)}</p>
          <p class="text-[11px] font-bold text-slate-400 mt-0.5">${esc(categoryName(s.category))}${s.subcategory ? ' • ' + esc(s.subcategory) : ''} — ${esc(s.area || '')}</p>
          <p class="text-[11px] font-bold text-amber-400 mt-1"><span dir="ltr">${stars(s.rating)}</span> ${Number(s.rating || 0).toFixed(1)} • ${Number(s.reviewsCount || 0)} تقييم ${s.verified ? '• موثق ✓' : ''}</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <a href="index.html#service-${esc(s.id)}" class="text-[11px] font-extrabold text-sky-400 bg-sky-500/10 px-3 py-2 rounded-full">عرض في الدليل</a>
        <button data-edit="${esc(s.id)}" class="text-[11px] font-extrabold text-amber-400 bg-amber-500/10 px-3 py-2 rounded-full">طلب تعديل</button>
        <button data-offer="${esc(s.id)}" class="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-full">أضف عرض</button>
      </div>
    </div>`).join('');
  els.myServicesList.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openEditForm(b.dataset.edit)));
  els.myServicesList.querySelectorAll('[data-offer]').forEach((b) =>
    b.addEventListener('click', () => openOfferForm(b.dataset.offer)));
}

function renderRequests() {
  els.myRequestsCount.textContent = String(state.myRequests.length);
  if (!state.myRequests.length) {
    els.myRequestsList.innerHTML = `<p class="text-xs text-slate-400 font-semibold bg-slate-900/40 rounded-2xl border border-slate-800/80 p-4 text-center">لا توجد طلبات بعد — طلبات التعديل والعروض تظهر هنا بعد إرسالها.</p>`;
    return;
  }
  const serviceName = (id) => (state.myServices.find((s) => s.id === id) || {}).name || 'نشاط';
  els.myRequestsList.innerHTML = state.myRequests.map((r) => {
    const summary = r.kind === 'edit'
      ? Object.entries(r.changes || {}).map(([k, v]) => `${k}: ${v}`).join('، ')
      : `${esc(r.title || '')}${r.discount ? ' — ' + esc(r.discount) : ''}${r.validUntil ? ' (حتى ' + esc(r.validUntil) + ')' : ''}`;
    return `
    <div class="flex flex-wrap items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl px-3 py-2.5">
      <span class="text-[11px] font-extrabold ${r.kind === 'edit' ? 'text-amber-400' : 'text-emerald-400'} bg-white/5 px-2.5 py-1 rounded-full">${r.kind === 'edit' ? 'طلب تعديل' : 'طلب عرض'}</span>
      <span class="min-w-0 flex-1">
        <span class="block text-xs font-extrabold text-white truncate">${esc(serviceName(r.serviceId))}</span>
        <span class="block text-[11px] font-bold text-slate-400 truncate">${summary}</span>
      </span>
      <span class="text-[11px] font-bold text-sky-400 shrink-0">بانتظار المراجعة • ${formatDate(r.createdAt)}</span>
    </div>`;
  }).join('');
}

function renderReviews() {
  if (!state.myReviews.length) {
    els.myReviewsList.innerHTML = `<p class="text-xs text-slate-400 font-semibold bg-slate-900/40 rounded-2xl border border-slate-800/80 p-4 text-center">لا توجد تقييمات معتمدة على خدماتك بعد.</p>`;
    return;
  }
  els.myReviewsList.innerHTML = state.myReviews.slice(0, 20).map((r) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl px-3 py-2.5">
      <p class="text-xs font-extrabold text-white">${esc(r.serviceName)}</p>
      <p class="text-[11px] font-bold text-amber-400 mt-0.5"><span dir="ltr">${stars(r.rating)}</span> ${Number(r.rating || 0)} من 5 — من: ${esc(r.userName || 'مستخدم')}</p>
      <p class="text-xs text-slate-300 font-semibold mt-1">${esc(r.text || '')}</p>
    </div>`).join('');
}

function openEditForm(serviceId) {
  const s = state.myServices.find((x) => x.id === serviceId);
  if (!s) return;
  state.editingServiceId = serviceId;
  els.editServiceName.textContent = s.name;
  const f = els.editRequestForm;
  f.name.value = s.name || '';
  f.phone.value = s.phone || '';
  f.whatsapp.value = s.whatsapp || '';
  f.address.value = s.address || '';
  f.area.value = s.area || '';
  f.tags.value = s.tags || '';
  f.openHour.value = s.openHour ?? 9;
  f.closeHour.value = s.closeHour ?? 23;
  els.offerRequestBox.classList.add('hidden');
  els.editRequestBox.classList.remove('hidden');
  els.editRequestBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openOfferForm(serviceId) {
  const s = state.myServices.find((x) => x.id === serviceId);
  if (!s) return;
  state.offerServiceId = serviceId;
  els.offerServiceName.textContent = s.name;
  els.editRequestBox.classList.add('hidden');
  els.offerRequestBox.classList.remove('hidden');
  els.offerRequestBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindAuth() {
  els.tabLogin.addEventListener('click', () => setTab('login'));
  els.tabSignup.addEventListener('click', () => setTab('signup'));

  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await signIn({ phone: fd.get('phone'), password: fd.get('password') });
    } catch (err) {
      showError(translateAuthError(err));
    }
  });

  els.signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('password') !== fd.get('confirmPassword')) {
      showError('كلمتا السر غير متطابقتين. تأكد من تأكيد كلمة السر.');
      return;
    }
    try {
      await signUp({ name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), password: fd.get('password') });
    } catch (err) {
      showError(translateAuthError(err));
    }
  });

  els.btnLogout.addEventListener('click', async () => {
    await signOut(auth);
  });
}

function bindForms() {
  els.editCancelBtn.addEventListener('click', () => {
    els.editRequestBox.classList.add('hidden');
    state.editingServiceId = null;
  });
  els.offerCancelBtn.addEventListener('click', () => {
    els.offerRequestBox.classList.add('hidden');
    state.offerServiceId = null;
  });

  els.editRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = state.myServices.find((x) => x.id === state.editingServiceId);
    if (!s) return;
    const fd = new FormData(e.target);
    const changes = {};
    const strFields = ['name', 'phone', 'whatsapp', 'address', 'area', 'tags'];
    for (const k of strFields) {
      const v = String(fd.get(k) || '').trim();
      if (v && v !== String(s[k] || '').trim()) changes[k] = v;
    }
    for (const k of ['openHour', 'closeHour']) {
      const v = Number(fd.get(k));
      if (!Number.isNaN(v) && v !== Number(s[k])) changes[k] = v;
    }
    try {
      await db.submitServiceEditRequest({ serviceId: s.id, changes });
      alert('تم إرسال طلب التعديل للأدمن للمراجعة.');
      els.editRequestBox.classList.add('hidden');
      state.editingServiceId = null;
      await loadDashboard();
    } catch (err) {
      alert(err.message || 'تعذر إرسال الطلب.');
    }
  });

  els.offerRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = state.myServices.find((x) => x.id === state.offerServiceId);
    if (!s) return;
    const fd = new FormData(e.target);
    try {
      await db.submitOfferRequest({
        serviceId: s.id,
        title: fd.get('title'),
        discount: fd.get('discount'),
        validUntil: fd.get('validUntil')
      });
      alert('تم إرسال طلب العرض للأدمن للمراجعة.');
      els.offerRequestBox.classList.add('hidden');
      state.offerServiceId = null;
      e.target.reset();
      await loadDashboard();
    } catch (err) {
      alert(err.message || 'تعذر إرسال الطلب.');
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  state.user = user || null;
  if (!user) {
    state.profile = null;
    els.loginSection.classList.remove('hidden');
    els.dashboardSection.classList.add('hidden');
    els.btnLogout.classList.add('hidden');
    return;
  }
  els.loginSection.classList.add('hidden');
  els.dashboardSection.classList.remove('hidden');
  els.btnLogout.classList.remove('hidden');
  try {
    state.profile = await getProfile(user.uid);
  } catch (_) {
    state.profile = null;
  }
  if (isAdmin(user)) {
    els.noProfileNote.textContent = 'حساب الأدمن — لوحة صاحب النشاط مخصصة لأصحاب الأنشطة العاديين. لإدارة الدليل افتح لوحة التحكم.';
    els.noProfileNote.classList.remove('hidden');
  }
  await loadDashboard();
  refreshIcons();
});

bindAuth();
bindForms();
refreshIcons();
