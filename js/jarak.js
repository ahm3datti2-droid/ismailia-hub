// جارك — اقتصاد الجيران داخل الدليل.
// الدخول بحساب الدليل (موبايل + كلمة سر). بلا تحقق بالبطاقة إطلاقاً
// (قرار المالك): الثقة من حساب موثق بالموبايل + مراجعة الأدمن
// للمزودين والطلبات + التقييمات بعد التنفيذ.
import { AREAS, JARAK_CATEGORIES, jarakCategoryName } from './config.js';
import { db } from './database.js';
import { auth, onAuthStateChanged, signOut } from './firebase.js';
import { signIn, signUp, getProfile, translateAuthError } from './auth.js';
import { toWhatsAppNumber, armDeleteConfirm } from './ui.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function refreshIcons() {
  try { window.lucide && window.lucide.createIcons(); } catch (_) {}
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

const STATUS_LABEL = { pending: 'بانتظار المراجعة', open: 'مفتوح', accepted: 'قيد التنفيذ', done: 'مكتمل', cancelled: 'ملغي' };
const OFFER_STATUS_LABEL = { pending: 'بانتظار رد العميل', accepted: 'مقبول', rejected: 'مرفوض' };

const state = {
  user: null,
  profile: null,
  myProvider: null,
  providers: [],
  openRequests: [],
  myRequests: [],
  myOffers: [],
  reviewsByProvider: {},
  verifiedPhones: new Set(),
  activeTab: 'providers',
  providerCategory: 'all',
  providerArea: 'all'
};

const els = {
  loginSection: document.getElementById('loginSection'),
  jarakSection: document.getElementById('jarakSection'),
  loginForm: document.getElementById('loginForm'),
  signupForm: document.getElementById('signupForm'),
  authError: document.getElementById('authError'),
  tabLogin: document.getElementById('tabLogin'),
  tabSignup: document.getElementById('tabSignup'),
  btnLogout: document.getElementById('btnLogout'),
  providerCategoryChips: document.getElementById('providerCategoryChips'),
  providerAreaFilter: document.getElementById('providerAreaFilter'),
  providersList: document.getElementById('providersList'),
  requestForm: document.getElementById('requestForm'),
  requestFormError: document.getElementById('requestFormError'),
  providerFormError: document.getElementById('providerFormError'),
  requestCategory: document.getElementById('requestCategory'),
  requestArea: document.getElementById('requestArea'),
  requestPrice: document.getElementById('requestPrice'),
  requestPriceLabel: document.getElementById('requestPriceLabel'),
  myRequestsList: document.getElementById('myRequestsList'),
  providerRegisterBox: document.getElementById('providerRegisterBox'),
  providerForm: document.getElementById('providerForm'),
  providerArea: document.getElementById('providerArea'),
  providerCategories: document.getElementById('providerCategories'),
  providerDashboardBox: document.getElementById('providerDashboardBox'),
  providerDashName: document.getElementById('providerDashName'),
  providerDashMeta: document.getElementById('providerDashMeta'),
  providerDashApproval: document.getElementById('providerDashApproval'),
  availabilityToggle: document.getElementById('availabilityToggle'),
  availabilityError: document.getElementById('availabilityError'),
  statEarnings: document.getElementById('statEarnings'),
  statOffers: document.getElementById('statOffers'),
  statAccepted: document.getElementById('statAccepted'),
  openRequestsForMe: document.getElementById('openRequestsForMe'),
  myOffersList: document.getElementById('myOffersList')
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

function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll('[data-tab]').forEach((b) =>
    b.classList.toggle('jarak-tab--active', b.dataset.tab === name));
  ['providers', 'request', 'myRequests', 'earn'].forEach((t) =>
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== name));
  if (name === 'providers') renderProviders();
  if (name === 'myRequests') renderMyRequests();
  if (name === 'earn') renderEarn();
  refreshIcons();
}

function providerRating(providerId) {
  const list = state.reviewsByProvider[providerId] || [];
  if (!list.length) return null;
  const avg = list.reduce((s, r) => s + Number(r.rating || 0), 0) / list.length;
  return { avg, count: list.length };
}

async function loadAll() {
  try { state.profile = await getProfile(state.user.uid); } catch (_) { state.profile = null; }
  try { state.myProvider = await db.getMyJarakProvider(); } catch (_) { state.myProvider = null; }
  try { state.providers = await db.getAvailableJarakProviders(); } catch (_) { state.providers = []; }
  try {
    const all = await db.getAllApprovedJarakReviews();
    state.reviewsByProvider = {};
    for (const r of all) {
      (state.reviewsByProvider[r.providerId] = state.reviewsByProvider[r.providerId] || []).push(r);
    }
  } catch (_) { state.reviewsByProvider = {}; }
  try {
    const services = await db.getAllServices();
    state.verifiedPhones = new Set(services.map((s) => String(s.ownerPhone || '')).filter(Boolean));
  } catch (_) { state.verifiedPhones = new Set(); }
  try { state.openRequests = await db.getOpenJarakRequests(); } catch (_) { state.openRequests = []; }
  try { state.myRequests = await db.getMyJarakRequests(); } catch (_) { state.myRequests = []; }
  try { state.myOffers = await db.getMyJarakOffers(); } catch (_) { state.myOffers = []; }
  renderProviders();
  renderMyRequests();
  renderEarn();
  refreshIcons();
}

function renderProviders() {
  const chips = [{ id: 'all', name: 'الكل' }, ...JARAK_CATEGORIES];
  els.providerCategoryChips.innerHTML = chips.map((c) => `
    <button data-cat="${c.id}" class="text-[11px] font-extrabold px-3 py-1.5 rounded-full transition ${state.providerCategory === c.id ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300'}">${esc(c.name)}</button>`).join('');
  els.providerCategoryChips.querySelectorAll('[data-cat]').forEach((b) =>
    b.addEventListener('click', () => { state.providerCategory = b.dataset.cat; renderProviders(); }));

  const filtered = state.providers.filter((p) =>
    (state.providerCategory === 'all' || (p.categories || []).includes(state.providerCategory)) &&
    (state.providerArea === 'all' || p.area === state.providerArea));
  if (!filtered.length) {
    els.providersList.innerHTML = `<p class="text-xs text-slate-400 font-semibold bg-slate-900/40 rounded-2xl border border-slate-800/80 p-4 text-center">لا يوجد مزودون متاحون الآن في هذا التصنيف — جرّب تصنيفاً آخر أو سجّل كمزوّد من "اكسب في طريقك".</p>`;
    return;
  }
  els.providersList.innerHTML = filtered.map((p) => {
    const rating = providerRating(p.id);
    const verified = state.verifiedPhones.has(String(p.phone || ''));
    return `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-black text-sm shrink-0">${esc((p.name || '?')[0])}</span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-extrabold text-white">${esc(p.name)} ${verified ? '<span class="jarak-verified">موثق من الدليل ✓</span>' : ''}</p>
          <p class="text-[11px] font-bold text-slate-400 mt-0.5">${esc(p.area || '')} • ${rating ? `<span class="text-amber-400" dir="ltr">${stars(rating.avg)}</span> ${rating.avg.toFixed(1)} (${rating.count})` : 'جديد — بلا تقييمات بعد'}</p>
        </div>
        <span class="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full shrink-0">متاح الآن</span>
      </div>
      <div class="flex flex-wrap gap-1.5 mt-2">${(p.categories || []).map((c) => `<span class="jarak-chip">${esc(jarakCategoryName(c))}</span>`).join('')}</div>
      <div class="flex gap-2 mt-3">
        <a href="https://wa.me/${esc(toWhatsAppNumber(p.phone))}" target="_blank" rel="noopener" class="flex-1 text-center text-[11px] font-extrabold text-white bg-emerald-500 hover:bg-emerald-400 px-3 py-2 rounded-full">واتساب</a>
        <a href="tel:${esc(p.phone)}" class="flex-1 text-center text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-full" dir="ltr">${esc(p.phone)}</a>
      </div>
    </div>`;
  }).join('');
}

async function renderMyRequests() {
  if (!state.myRequests.length) {
    els.myRequestsList.innerHTML = `<p class="text-xs text-slate-400 font-semibold bg-slate-900/40 rounded-2xl border border-slate-800/80 p-4 text-center">لا توجد طلبات بعد — اطلب خدمة من تبويب "اطلب خدمة".</p>`;
    return;
  }
  const cards = [];
  for (const r of state.myRequests) {
    let offers = [];
    try { offers = await db.getOffersForRequest(r.id); } catch (_) { offers = []; }
    const accepted = offers.find((o) => o.status === 'accepted');
    let review = null;
    if (r.status === 'done') {
      try { review = await db.getMyJarakReview(r.id); } catch (_) { review = null; }
    }
    const offersHtml = offers.length ? offers.map((o) => `
      <div class="flex flex-wrap items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-extrabold text-white">${esc(o.providerName)} — <span class="text-emerald-400">${Number(o.price).toLocaleString('en-US')} جنيه</span></span>
          <span class="block text-[11px] font-bold text-slate-400">${esc(OFFER_STATUS_LABEL[o.status] || o.status)}</span>
        </span>
        ${o.status === 'pending' && r.status === 'open' ? `
          <button data-accept-offer="${o.id}" class="text-[11px] font-extrabold text-white bg-emerald-500 px-3 py-1.5 rounded-full">قبول</button>
          <button data-decline-offer="${o.id}" class="text-[11px] font-extrabold text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-full">رفض</button>` : ''}
        ${o.status === 'accepted' ? `<a href="https://wa.me/${esc(toWhatsAppNumber(o.providerPhone))}" target="_blank" rel="noopener" class="text-[11px] font-extrabold text-white bg-emerald-500 px-3 py-1.5 rounded-full">واتساب المزود</a>` : ''}
      </div>`).join('') : `<p class="text-[11px] text-slate-400 font-semibold">لم تصل عروض بعد.</p>`;
    cards.push(`
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm font-extrabold text-white flex-1 min-w-0">${esc(r.title)}</p>
        <span class="jarak-status jarak-status--${r.status}">${esc(STATUS_LABEL[r.status] || r.status)}</span>
      </div>
      <p class="text-[11px] font-bold text-slate-400 mt-1">${esc(jarakCategoryName(r.category))} • ${esc(r.area || '')} • ${formatDate(r.createdAt)}</p>
      ${r.description ? `<p class="text-xs text-slate-300 font-semibold mt-1">${esc(r.description)}</p>` : ''}
      <p class="text-xs font-bold text-emerald-400 mt-2">السعر المعروض: ${Number(r.price).toLocaleString('en-US')} جنيه</p>
      ${r.status === 'open' ? `
        <div class="flex gap-2 mt-3">
          <label class="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300">عدّل سعرك
            <input type="number" data-price-edit="${r.id}" value="${Number(r.price)}" min="10" max="5000" class="w-20 bg-transparent text-white font-bold focus:outline-none" dir="ltr"> جنيه
          </label>
          <button data-save-price="${r.id}" class="text-[11px] font-extrabold text-white bg-emerald-500 px-3 py-2 rounded-full">حفظ</button>
          <button data-cancel-req="${r.id}" class="text-[11px] font-extrabold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-full">إلغاء الطلب</button>
        </div>` : ''}
      ${r.status === 'accepted' && accepted ? `
        <div class="mt-3">
          <p class="text-xs font-bold text-sky-400">المزود: ${esc(accepted.providerName)} — <a href="tel:${esc(accepted.providerPhone)}" class="underline" dir="ltr">${esc(accepted.providerPhone)}</a></p>
          <button data-complete-req="${r.id}" class="mt-2 text-[11px] font-extrabold text-white bg-sky-500 px-3 py-2 rounded-full">تم التنفيذ ✓</button>
        </div>` : ''}
      ${r.status === 'done' && !review ? `
        <form data-review-form="${r.id}" class="mt-3 space-y-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
          <p class="text-xs font-extrabold text-white">قيّم ${esc(accepted ? accepted.providerName : 'المزود')}</p>
          <select name="rating" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs">
            <option value="5">5 — ممتاز</option><option value="4">4 — جيد جداً</option>
            <option value="3">3 — جيد</option><option value="2">2 — مقبول</option><option value="1">1 — سيئ</option>
          </select>
          <input type="text" name="text" maxlength="500" placeholder="رأيك في المهمة (اختياري)" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs">
          <button type="submit" class="w-full bg-amber-500 text-slate-950 font-extrabold py-2.5 rounded-xl text-xs">إرسال التقييم</button>
        </form>` : ''}
      ${r.status === 'done' && review ? `<p class="text-[11px] font-bold text-slate-400 mt-2">قيّمت هذه المهمة ${Number(review.rating)} من 5${review.approved ? '' : ' (بانتظار موافقة الأدمن)'}.</p>` : ''}
      <div class="mt-3 space-y-2">
        <p class="text-xs font-extrabold text-slate-200">العروض (${offers.length})</p>
        ${offersHtml}
      </div>
    </div>`);
  }
  els.myRequestsList.innerHTML = cards.join('');
  els.myRequestsList.querySelectorAll('[data-accept-offer]').forEach((b) =>
    b.addEventListener('click', async () => {
      try { await db.acceptJarakOffer(b.dataset.acceptOffer); await loadAll(); alert('تم قبول العرض — تواصل مع المزود لتنسيق التنفيذ.'); }
      catch (err) { alert(err.message || 'تعذر قبول العرض.'); }
    }));
  els.myRequestsList.querySelectorAll('[data-decline-offer]').forEach((b) =>
    b.addEventListener('click', async () => {
      try { await db.declineJarakOffer(b.dataset.declineOffer); await loadAll(); }
      catch (err) { alert(err.message || 'تعذر رفض العرض.'); }
    }));
  els.myRequestsList.querySelectorAll('[data-save-price]').forEach((b) =>
    b.addEventListener('click', async () => {
      const input = els.myRequestsList.querySelector(`[data-price-edit="${b.dataset.savePrice}"]`);
      try { await db.updateJarakRequestPrice(b.dataset.savePrice, input.value); await loadAll(); alert('تم تحديث السعر.'); }
      catch (err) { alert(err.message || 'تعذر تحديث السعر.'); }
    }));
  els.myRequestsList.querySelectorAll('[data-cancel-req]').forEach((b) =>
    b.addEventListener('click', () => armDeleteConfirm(b, async () => {
      try { await db.cancelJarakRequest(b.dataset.cancelReq); await loadAll(); }
      catch (err) { alert(err.message || 'تعذر إلغاء الطلب.'); }
    })));
  els.myRequestsList.querySelectorAll('[data-complete-req]').forEach((b) =>
    b.addEventListener('click', async () => {
      try { await db.completeJarakRequest(b.dataset.completeReq); await loadAll(); alert('تم — قيّم المزود من نفس الطلب.'); }
      catch (err) { alert(err.message || 'تعذر تأكيد التنفيذ.'); }
    }));
  els.myRequestsList.querySelectorAll('[data-review-form]').forEach((form) =>
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const requestId = form.dataset.reviewForm;
      const req = state.myRequests.find((x) => x.id === requestId);
      const fd = new FormData(form);
      try {
        await db.addJarakReview({ providerId: req.providerId, requestId, rating: fd.get('rating'), text: fd.get('text') });
        alert('تم إرسال تقييمك — يظهر بعد موافقة الأدمن.');
        await loadAll();
      } catch (err) { alert(err.message || 'تعذر إرسال التقييم.'); }
    }));
}

function renderEarn() {
  const p = state.myProvider;
  els.providerRegisterBox.classList.toggle('hidden', Boolean(p));
  els.providerDashboardBox.classList.toggle('hidden', !p);
  if (!p) return;
  els.providerDashName.textContent = p.name;
  els.providerDashMeta.textContent = `${(p.categories || []).map(jarakCategoryName).join('، ')} • ${p.area || ''} • ${p.phone}`;
  els.providerDashApproval.textContent = p.isApproved ? '✓ حسابك معتمد — تظهر في "المتاحون الآن" عندما تكون متاحاً.' : 'حسابك بانتظار موافقة الأدمن — لن تظهر في "المتاحون الآن" حتى الاعتماد.';
  els.providerDashApproval.className = 'text-xs font-bold mt-1 ' + (p.isApproved ? 'text-emerald-400' : 'text-amber-400');
  const toggle = els.availabilityToggle;
  toggle.textContent = p.isAvailable ? 'متاح الآن — اضغط للإيقاف' : 'مش متاح — اضغط للتفعيل';
  toggle.className = 'px-4 py-2.5 rounded-xl text-xs font-extrabold transition ' + (p.isAvailable ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300');
  const earnings = state.myOffers.filter((o) => o.status === 'accepted').reduce((s, o) => s + Number(o.price || 0), 0);
  els.statEarnings.textContent = earnings.toLocaleString('en-US');
  els.statOffers.textContent = String(state.myOffers.length);
  els.statAccepted.textContent = String(state.myOffers.filter((o) => o.status === 'accepted').length);

  const mine = state.openRequests.filter((r) => (p.categories || []).includes(r.category));
  if (!mine.length) {
    els.openRequestsForMe.innerHTML = `<p class="text-xs text-slate-400 font-semibold bg-slate-900/40 rounded-2xl border border-slate-800/80 p-4 text-center">لا توجد طلبات مفتوحة في أقسامك الآن.</p>`;
  } else {
    els.openRequestsForMe.innerHTML = mine.map((r) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <p class="text-sm font-extrabold text-white">${esc(r.title)}</p>
      <p class="text-[11px] font-bold text-slate-400 mt-0.5">${esc(jarakCategoryName(r.category))} • ${esc(r.area || '')} • ${formatDate(r.createdAt)}</p>
      ${r.description ? `<p class="text-xs text-slate-300 font-semibold mt-1">${esc(r.description)}</p>` : ''}
      <p class="text-xs font-bold text-emerald-400 mt-1">العميل يعرض: ${Number(r.price).toLocaleString('en-US')} جنيه</p>
      <form data-offer-form="${r.id}" class="flex gap-2 mt-3">
        <input type="number" name="price" required min="1" max="100000" placeholder="سعرك (جنيه)" class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs" dir="ltr">
        <button type="submit" class="text-[11px] font-extrabold text-white bg-emerald-500 px-4 py-2 rounded-full">أرسل عرضي</button>
      </form>
    </div>`).join('');
    els.openRequestsForMe.querySelectorAll('[data-offer-form]').forEach((form) =>
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          await db.submitJarakOffer({ requestId: form.dataset.offerForm, price: fd.get('price') });
          alert('تم إرسال عرضك للعميل.');
          await loadAll();
        } catch (err) { alert(err.message || 'تعذر إرسال العرض.'); }
      }));
  }

  if (!state.myOffers.length) {
    els.myOffersList.innerHTML = `<p class="text-xs text-slate-400 font-semibold bg-slate-900/40 rounded-2xl border border-slate-800/80 p-4 text-center">لم ترسل عروضاً بعد.</p>`;
  } else {
    const reqTitle = (id) => {
      const all = [...state.openRequests, ...state.myRequests];
      const r = all.find((x) => x.id === id);
      return r ? r.title : 'طلب';
    };
    els.myOffersList.innerHTML = state.myOffers.map((o) => `
    <div class="flex flex-wrap items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-2xl px-3 py-2.5">
      <span class="min-w-0 flex-1">
        <span class="block text-xs font-extrabold text-white truncate">${esc(reqTitle(o.requestId))}</span>
        <span class="block text-[11px] font-bold text-slate-400">عرضك: ${Number(o.price).toLocaleString('en-US')} جنيه — ${esc(OFFER_STATUS_LABEL[o.status] || o.status)}</span>
      </span>
    </div>`).join('');
  }
}

function fillStaticSelects() {
  els.requestCategory.innerHTML = JARAK_CATEGORIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  els.requestArea.innerHTML = AREAS.map((a) => `<option value="${a}">${a}</option>`).join('');
  els.providerArea.innerHTML = AREAS.map((a) => `<option value="${a}">${a}</option>`).join('');
  els.providerAreaFilter.innerHTML = `<option value="all">كل المناطق</option>` + AREAS.map((a) => `<option value="${a}">${a}</option>`).join('');
  els.providerCategories.innerHTML = JARAK_CATEGORIES.map((c) => `
    <label class="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 font-bold cursor-pointer">
      <input type="checkbox" name="categories" value="${c.id}" class="accent-emerald-500"> ${c.name}
    </label>`).join('');
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

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  els.providerAreaFilter.addEventListener('change', () => {
    state.providerArea = els.providerAreaFilter.value;
    renderProviders();
  });

  els.requestPrice.addEventListener('input', () => {
    els.requestPriceLabel.textContent = Number(els.requestPrice.value).toLocaleString('en-US') + ' جنيه';
  });

  els.requestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await db.createJarakRequest({
        title: fd.get('title'),
        category: fd.get('category'),
        area: fd.get('area'),
        description: fd.get('description'),
        price: fd.get('price'),
        customerPhone: state.profile?.phoneNational || ''
      });
      alert('تم إرسال طلبك — يظهر للمزودين بعد موافقة الأدمن.');
      els.requestFormError.classList.add('hidden');
      e.target.reset();
      els.requestPrice.value = 50;
      els.requestPriceLabel.textContent = '50 جنيه';
      await loadAll();
      switchTab('myRequests');
    } catch (err) {
      els.requestFormError.textContent = err.message || 'تعذر إرسال الطلب.';
      els.requestFormError.classList.remove('hidden');
    }
  });

  els.providerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const categories = fd.getAll('categories');
    try {
      await db.registerJarakProvider({
        name: fd.get('name'),
        phone: fd.get('phone'),
        area: fd.get('area'),
        categories
      });
      els.providerFormError.classList.add('hidden');
      alert('تم تسجيلك كمزوّد — حسابك بانتظار موافقة الأدمن.');
      await loadAll();
    } catch (err) {
      els.providerFormError.textContent = err.message || 'تعذر التسجيل.';
      els.providerFormError.classList.remove('hidden');
    }
  });

  els.availabilityToggle.addEventListener('click', async () => {
    if (!state.myProvider) return;
    try {
      els.availabilityError.classList.add('hidden');
      await db.setJarakAvailability(!state.myProvider.isAvailable);
      await loadAll();
    } catch (err) {
      // خطأ ظاهر داخل الصفحة بدل alert() — النوافذ المنبثقة لا تظهر في متصفح التطبيق.
      els.availabilityError.textContent = err.message || 'تعذر تغيير الحالة.';
      els.availabilityError.classList.remove('hidden');
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  state.user = user || null;
  if (!user) {
    state.profile = null;
    state.myProvider = null;
    els.loginSection.classList.remove('hidden');
    els.jarakSection.classList.add('hidden');
    els.btnLogout.classList.add('hidden');
    return;
  }
  els.loginSection.classList.add('hidden');
  els.jarakSection.classList.remove('hidden');
  els.btnLogout.classList.remove('hidden');
  await loadAll();
  switchTab(state.activeTab);
  refreshIcons();
});

fillStaticSelects();
bindAuth();
bindEvents();
refreshIcons();
