import { AREAS, GROUPS, TRANSPORT_ROUTES } from './config.js';
import { db } from './database.js';
import { renderCategories, renderSubcategories, renderServiceCards, renderSkeleton, renderErrorState, getOpenStatus, categoryInfo, subcategoryName } from './ui.js';
import { auth, onAuthStateChanged, isAdmin, signOut } from './firebase.js';
import { signUp, signIn, getProfile, translateAuthError } from './auth.js';

const state = {
  services: [],
  activeCategory: 'all',
  activeSubcategory: 'all',
  selectedArea: 'all',
  searchQuery: '',
  onlyEmergency: false,
  onlyFavorites: false,
  isAdmin: false,
  currentUser: null,
  profile: null,
  favorites: JSON.parse(localStorage.getItem('ism_favs')) || []
};

const els = {
  categories: document.getElementById('categoriesContainer'),
  subcategories: document.getElementById('subcategoriesContainer'),
  areaSelect: document.getElementById('areaFilter'),
  searchInput: document.getElementById('searchInput'),
  servicesGrid: document.getElementById('servicesGrid'),
  resultsCount: document.getElementById('resultsCount'),
  sectionTitle: document.getElementById('sectionTitle'),
  heroCount: document.getElementById('heroCount'),
  heroGroups: document.getElementById('heroGroups'),
  heroAreas: document.getElementById('heroAreas'),
  modal: document.getElementById('appModal'),
  modalContent: document.getElementById('modalContent')
};

async function initApp() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  AREAS.forEach(area => {
    const opt = document.createElement('option');
    opt.value = area;
    opt.textContent = area;
    els.areaSelect.appendChild(opt);
  });

  // وضع الإدارة في الموقع العام يظهر فقط إذا كان المستخدم الحالي
  // مسجلاً في Firebase Auth وبريده هو بريد الأدمن. لا يوجد أي
  // رقم سري أو وضع إدارة محلي في هذا الملف.
  onAuthStateChanged(auth, async (user) => {
    const wasAdmin = state.isAdmin;
    state.isAdmin = isAdmin(user);
    state.currentUser = user;
    state.profile = user ? await getProfile(user.uid) : null;
    updateAccountButton();
    if (wasAdmin !== state.isAdmin) refreshUI();
  });

  bindEvents();
  // بطاقات هيكلية فوراً حتى لا تظهر الصفحة فارغة أثناء انتظار Firestore.
  renderSkeleton(els.servicesGrid);
  await loadServices();
}

async function loadServices() {
  try {
    state.services = await db.getAllServices();
    refreshUI();
    openDeepLinkedService();
  } catch (err) {
    console.error('تعذر تحميل الخدمات:', err);
    renderErrorState(els.servicesGrid, () => {
      renderSkeleton(els.servicesGrid);
      loadServices();
    });
  }
}

// رابط خاص لكل خدمة: #service-<id> أو ?service=<id> يفتح تفاصيل الخدمة مباشرة عند فتح الرابط.
function deepLinkedServiceId() {
  const hash = (location.hash || '').match(/^#service-(.+)$/);
  if (hash) return hash[1];
  return new URLSearchParams(location.search).get('service');
}

function openDeepLinkedService() {
  const id = deepLinkedServiceId();
  if (id && state.services.some(s => s.id === id)) openServiceDetails(id);
}

function bindEvents() {
  // بحث مُؤجَّل 120ms: لا نعيد رسم كل البطاقات مع كل حرف يُكتب.
  let searchTimer = null;
  els.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      refreshUI();
    }, 120);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      els.searchInput.focus();
    }
  });

  els.areaSelect.addEventListener('change', (e) => {
    state.selectedArea = e.target.value;
    refreshUI();
  });

  document.getElementById('heroSearchBtn')?.addEventListener('click', () => {
    els.searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    els.searchInput.focus();
  });

  document.getElementById('btnHome').addEventListener('click', () => {
    state.activeCategory = 'all';
    state.activeSubcategory = 'all';
    state.onlyEmergency = false;
    state.onlyFavorites = false;
    els.sectionTitle.textContent = 'أبرز الخدمات في الإسماعيلية';
    refreshUI();
  });

  document.getElementById('btnEmergency').addEventListener('click', () => {
    state.onlyEmergency = true;
    state.onlyFavorites = false;
    els.sectionTitle.textContent = 'خدمات الطوارئ و 24 ساعة';
    refreshUI();
  });

  document.getElementById('btnTransport').addEventListener('click', openTransportModal);

  document.getElementById('btnContact').addEventListener('click', openContactModal);

  document.getElementById('btnSaved').addEventListener('click', () => {
    state.onlyFavorites = !state.onlyFavorites;
    state.onlyEmergency = false;
    els.sectionTitle.textContent = state.onlyFavorites ? 'الخدمات المحفوظة' : 'أبرز الخدمات في الإسماعيلية';
    refreshUI();
  });

  document.getElementById('btnAddService').addEventListener('click', openAddServiceModal);
  document.getElementById('btnAccount').addEventListener('click', () => {
    if (state.currentUser) openProfileModal();
    else openAuthModal('login');
  });
  // زر الإدارة يفتح لوحة التحكم — الدخول فيها عبر Firebase Auth فقط.
  document.getElementById('btnAdminToggle').addEventListener('click', () => {
    window.location.href = 'admin.html';
  });
  document.getElementById('closeModalBackdrop').addEventListener('click', closeModal);
}

function refreshUI() {
  renderCategories(els.categories, state.activeCategory, (catId) => {
    state.activeCategory = catId;
    state.activeSubcategory = 'all';
    state.onlyEmergency = false;
    state.onlyFavorites = false;
    refreshUI();
  });

  renderSubcategories(els.subcategories, state.activeCategory, state.activeSubcategory, (subId) => {
    state.activeSubcategory = subId;
    refreshUI();
  });

  const filtered = state.services.filter(srv => {
    const matchCat = state.activeCategory === 'all' || srv.category === state.activeCategory;
    const matchSub = state.activeSubcategory === 'all' || srv.subcategory === state.activeSubcategory;
    const matchArea = state.selectedArea === 'all' || srv.area === state.selectedArea;
    const matchEmerg = !state.onlyEmergency || srv.isEmergency;
    const matchFav = !state.onlyFavorites || state.favorites.includes(srv.id);
    const matchQuery = !state.searchQuery ||
      srv.name.toLowerCase().includes(state.searchQuery) ||
      srv.area.toLowerCase().includes(state.searchQuery) ||
      srv.tags.toLowerCase().includes(state.searchQuery) ||
      srv.address.toLowerCase().includes(state.searchQuery);

    return matchCat && matchSub && matchArea && matchEmerg && matchFav && matchQuery;
  });

  els.resultsCount.textContent = `${filtered.length} خدمة`;
  // إحصاءات الهيرو الحية: عدد الخدمات الكلي + عدد الأقسام والمناطق.
  if (els.heroCount) els.heroCount.textContent = state.services.length;
  if (els.heroGroups) els.heroGroups.textContent = GROUPS.length;
  if (els.heroAreas) els.heroAreas.textContent = AREAS.length;

  renderServiceCards(els.servicesGrid, filtered, state.favorites, state.isAdmin, {
    onClearFilters: () => {
      state.activeCategory = 'all';
      state.activeSubcategory = 'all';
      state.selectedArea = 'all';
      state.searchQuery = '';
      state.onlyEmergency = false;
      state.onlyFavorites = false;
      els.searchInput.value = '';
      els.areaSelect.value = 'all';
      els.sectionTitle.textContent = 'أبرز الخدمات في الإسماعيلية';
      refreshUI();
    },
    onDetails: openServiceDetails,
    onToggleFav: toggleFavorite,
    onDelete: handleDeleteService
  });
}

function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id)
    ? state.favorites.filter(f => f !== id)
    : [...state.favorites, id];
  localStorage.setItem('ism_favs', JSON.stringify(state.favorites));
  refreshUI();
}

async function handleDeleteService(id) {
  if (!state.isAdmin) {
    alert('حذف الخدمات متاح من لوحة تحكم الإدارة فقط.');
    return;
  }
  if (confirm('هل أنت متأكد من حذف هذه الخدمة نهائياً؟')) {
    try {
      await db.deleteService(id);
      closeModal();
      state.services = await db.getAllServices();
      refreshUI();
    } catch (err) {
      alert(err.message || 'تعذر حذف الخدمة. حاول مرة أخرى.');
    }
  }
}

function openServiceDetails(id) {
  const srv = state.services.find(s => s.id === id);
  if (!srv) return;
  // الرابط في شريط العنوان يصبح رابط الخدمة الخاص القابل للمشاركة.
  document.title = `${srv.name} | دليل خدمات الإسماعيلية`;
  history.replaceState(null, '', `#service-${srv.id}`);
  const status = getOpenStatus(srv.openHour, srv.closeHour);
  const cat = categoryInfo(srv.category);
  const subName = subcategoryName(srv.category, srv.subcategory);
  const waNumber = String(srv.whatsapp || srv.phone || '').replace(/\D/g, '');
  const waMsg = encodeURIComponent(`مرحباً ${srv.name}، وصلت لحضرتك عبر دليل خدمات الإسماعيلية.`);
  // رابط الخريطة: رابط الخدمة المسجل، أو بحث جوجل ماب بالاسم والعنوان.
  const mapHref = srv.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${srv.name} ${srv.address} الإسماعيلية`)}`;
  const hoursText = (srv.openHour === 0 && srv.closeHour === 24)
    ? 'مفتوح 24 ساعة'
    : `يومياً من ${srv.openHour}:00 إلى ${srv.closeHour}:00`;
  const tags = String(srv.tags || '').split('،').map((t) => t.trim()).filter(Boolean);
  const isFav = state.favorites.includes(srv.id);

  els.modalContent.classList.add('detail-sheet');
  els.modalContent.innerHTML = `
    <div class="detail-photo">
      ${srv.imageUrl
        ? `<img src="${srv.imageUrl}" alt="${srv.name}" referrerpolicy="no-referrer" onerror="this.remove()">`
        : `<div class="detail-photo__fallback"><i data-lucide="${cat.icon}"></i></div>`}
      <button id="closeModalBtn" class="detail-close" aria-label="إغلاق">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
      ${srv.isEmergency ? '<span class="detail-emergency"><i data-lucide="siren" class="w-3.5 h-3.5"></i> طوارئ 24/7</span>' : ''}
    </div>

    <div class="p-5 pt-4">
      <div class="flex flex-wrap items-center gap-1.5 mb-2.5">
        <span class="badge border ${status.color}">${status.text}</span>
        ${srv.verified ? '<span class="badge badge--verified"><i data-lucide="badge-check" class="w-3.5 h-3.5"></i> موثق</span>' : ''}
        <span class="rating-pill">
          <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i>
          ${srv.rating} (${srv.reviewsCount} تقييم)
        </span>
      </div>

      <h3 class="text-xl font-black text-white leading-snug">${srv.name}</h3>
      <p class="text-xs text-amber-400 font-bold mt-1.5 flex items-center gap-1.5">
        <i data-lucide="${cat.icon}" class="w-3.5 h-3.5"></i>
        ${subName ? `${cat.name} • ${subName}` : cat.name}
      </p>

      <a href="${mapHref}" target="_blank" rel="noopener" class="detail-row">
        <span class="detail-row__icon"><i data-lucide="map-pin"></i></span>
        <span class="flex-1 min-w-0">
          <span class="detail-row__title">العنوان — ${srv.area}</span>
          <span class="detail-row__sub">${srv.address}</span>
        </span>
        <i data-lucide="chevron-left" class="w-4 h-4 text-slate-500 shrink-0 mt-1"></i>
      </a>

      <div class="detail-row">
        <span class="detail-row__icon"><i data-lucide="clock"></i></span>
        <span class="flex-1 min-w-0">
          <span class="detail-row__title">مواعيد العمل</span>
          <span class="detail-row__sub">${hoursText}</span>
        </span>
      </div>

      ${srv.phone ? `
        <a href="tel:${srv.phone}" class="detail-row">
          <span class="detail-row__icon"><i data-lucide="phone"></i></span>
          <span class="flex-1 min-w-0">
            <span class="detail-row__title">الهاتف</span>
            <span class="detail-row__sub" dir="ltr" style="text-align:right">${srv.phone}</span>
          </span>
          <i data-lucide="chevron-left" class="w-4 h-4 text-slate-500 shrink-0 mt-1"></i>
        </a>
      ` : ''}

      ${tags.length ? `
        <div class="flex flex-wrap gap-1.5 mt-3">
          ${tags.map((t) => `<span class="tag-chip">${t}</span>`).join('')}
        </div>
      ` : ''}

      ${srv.menu && srv.menu.length ? `
        <div class="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 mt-4">
          <h4 class="text-xs font-bold text-amber-400 mb-2.5 flex items-center gap-1.5">
            <i data-lucide="list" class="w-4 h-4"></i>
            قائمة الأسعار / الخدمات الشائعة
          </h4>
          <div class="space-y-2">
            ${srv.menu.map(m => `
              <div class="flex justify-between text-xs border-b border-slate-800/80 pb-1.5 last:border-0 last:pb-0">
                <span class="text-slate-300">${m.item}</span>
                <span class="font-bold text-amber-400">${m.price}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="grid grid-cols-2 gap-2.5 mt-5">
        ${waNumber ? `
          <a href="https://wa.me/${waNumber}?text=${waMsg}" target="_blank" rel="noopener" class="detail-action detail-action--wa">
            <i data-lucide="message-circle"></i>
            واتساب
          </a>
        ` : ''}
        ${srv.phone ? `
          <a href="tel:${srv.phone}" class="detail-action detail-action--call">
            <i data-lucide="phone-call"></i>
            اتصال مباشر
          </a>
        ` : ''}
        <a href="${mapHref}" target="_blank" rel="noopener" class="detail-action detail-action--map">
          <i data-lucide="navigation"></i>
          الموقع على الخريطة
        </a>
        <button id="detailShareBtn" class="detail-action detail-action--share">
          <i data-lucide="share-2"></i>
          <span id="detailShareLabel">مشاركة الرابط</span>
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2.5 mt-2.5">
        <button id="detailFavBtn" class="detail-action detail-action--share ${state.isAdmin ? '' : 'col-span-2'}">
          <i data-lucide="bookmark" class="${isFav ? 'fill-amber-400 text-amber-400' : ''}"></i>
          ${isFav ? 'محفوظة ✓' : 'حفظ في المحفوظات'}
        </button>
        ${state.isAdmin ? `
          <button id="detailDelBtn" class="detail-action detail-action--danger">
            <i data-lucide="trash-2"></i>
            حذف من الدليل
          </button>
        ` : ''}
      </div>

      <div id="reviewsSection" class="mt-5 pt-4 border-t border-slate-800">
        <p class="text-xs text-slate-400 font-bold">جاري تحميل التقييمات…</p>
      </div>
    </div>
  `;
  showModal();

  document.getElementById('detailFavBtn')?.addEventListener('click', () => {
    toggleFavorite(srv.id);
    closeModal();
  });
  document.getElementById('detailDelBtn')?.addEventListener('click', () => handleDeleteService(srv.id));
  loadDetailReviews(srv.id);
  document.getElementById('detailShareBtn')?.addEventListener('click', async () => {
    // الرابط الخاص بالخدمة: صفحة ثابتة فيها صورة واسم الخدمة (معاينة شيك في واتساب وفيسبوك)
    // وتحول تلقائياً لفتح الخدمة داخل التطبيق.
    const url = `${location.origin}/services/${srv.id}.html`;
    const label = document.getElementById('detailShareLabel');
    try {
      if (navigator.share) {
        await navigator.share({ title: srv.name, text: `${srv.name} — دليل خدمات الإسماعيلية`, url });
        return;
      }
      throw new Error('no-share');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        if (label) label.textContent = 'تم نسخ الرابط ✓';
        setTimeout(() => { if (label) label.textContent = 'مشاركة الرابط'; }, 2000);
      } catch (_) {
        window.prompt('انسخ رابط الخدمة:', url);
      }
    }
  });
}

// ===== التقييمات الحقيقية في صفحة التفاصيل =====
// نصوص المستخدمين غير موثوقة — تُهرَّب قبل الحقن في HTML.
function escHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function starsHtml(rating) {
  const full = Math.round(Number(rating) || 0);
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="${i < full ? 'text-amber-400' : 'text-slate-600'}">★</span>`).join('');
}

function reviewDateText(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : null;
    return d ? d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  } catch (_) { return ''; }
}

async function loadDetailReviews(serviceId) {
  const box = document.getElementById('reviewsSection');
  if (!box) return;
  let reviews = [];
  try { reviews = await db.getApprovedReviews(serviceId); } catch (_) { reviews = []; }
  if (!box.isConnected) return; // المستخدم فتح خدمة أخرى أثناء التحميل.
  const user = state.currentUser;
  let mine = null;
  if (user) {
    try { mine = await db.getUserReview(serviceId, user.uid); } catch (_) { mine = null; }
  }
  if (!box.isConnected) return;
  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length).toFixed(1)
    : null;
  box.innerHTML = `
    <h4 class="text-sm font-extrabold text-white mb-1 flex items-center gap-1.5">
      <i data-lucide="star" class="w-4 h-4 text-amber-400"></i>
      التقييمات ${reviews.length ? `(${reviews.length})` : ''}
      ${avg ? `<span class="text-amber-400 text-xs font-black">${avg} من 5</span>` : ''}
    </h4>
    ${reviews.length ? `
      <div class="space-y-2.5 mt-3">
        ${reviews.map(r => `
          <div class="bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-xs font-extrabold text-white">${escHtml(r.userName || 'مستخدم')}</span>
              <span class="text-sm leading-none" dir="ltr">${starsHtml(r.rating)}</span>
            </div>
            <p class="text-xs text-slate-300 leading-relaxed">${escHtml(r.text)}</p>
            ${reviewDateText(r.createdAt) ? `<p class="text-[10px] text-slate-500 mt-1.5">${reviewDateText(r.createdAt)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    ` : `<p class="text-xs text-slate-400 font-semibold mt-2">لا توجد تقييمات بعد — كن أول من يقيّم هذه الخدمة.</p>`}
    <div id="reviewFormBox" class="mt-4"></div>
  `;
  lucide.createIcons();
  renderReviewForm(serviceId, mine);
}

function renderReviewForm(serviceId, mine) {
  const box = document.getElementById('reviewFormBox');
  if (!box) return;
  if (mine) {
    box.innerHTML = mine.approved
      ? `<p class="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">تم نشر تقييمك لهذه الخدمة ✓ (${mine.rating} من 5)</p>`
      : `<p class="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">تم إرسال تقييمك وهو بانتظار مراجعة الإدارة قبل النشر.</p>`;
    return;
  }
  if (!state.currentUser) {
    box.innerHTML = `
      <button id="reviewLoginBtn" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-extrabold py-3 rounded-xl text-xs transition">
        سجّل دخولك لتقييم هذه الخدمة
      </button>`;
    document.getElementById('reviewLoginBtn')?.addEventListener('click', () => {
      closeModal();
      openAuthModal('login');
    });
    return;
  }
  let selected = 5;
  box.innerHTML = `
    <p class="text-xs font-extrabold text-white mb-2">قيّم هذه الخدمة</p>
    <div id="reviewStars" class="flex gap-1 mb-2.5" dir="ltr">
      ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="text-2xl leading-none ${n <= selected ? 'text-amber-400' : 'text-slate-600'} transition active:scale-110" aria-label="${n} نجوم">★</button>`).join('')}
    </div>
    <textarea id="reviewText" rows="2" maxlength="500" placeholder="اكتب رأيك في الخدمة (اختياري لكنه يساعد غيرك)..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-xs mb-2.5"></textarea>
    <p id="reviewError" class="hidden text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-2.5"></p>
    <button id="reviewSubmitBtn" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl text-xs transition">إرسال التقييم</button>
    <p class="text-[10px] text-slate-500 mt-2">تقييمك يظهر بعد مراجعة الإدارة.</p>
  `;
  const paintStars = () => {
    box.querySelectorAll('[data-star]').forEach(b => {
      b.classList.toggle('text-amber-400', Number(b.dataset.star) <= selected);
      b.classList.toggle('text-slate-600', Number(b.dataset.star) > selected);
    });
  };
  box.querySelectorAll('[data-star]').forEach(b => {
    b.addEventListener('click', () => { selected = Number(b.dataset.star); paintStars(); });
  });
  document.getElementById('reviewSubmitBtn')?.addEventListener('click', async () => {
    const errEl = document.getElementById('reviewError');
    const btn = document.getElementById('reviewSubmitBtn');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.style.opacity = '0.6';
    try {
      await db.addReview({
        serviceId,
        rating: selected,
        text: document.getElementById('reviewText').value,
        userName: (state.profile && state.profile.name) || 'مستخدم'
      });
      await loadDetailReviews(serviceId);
    } catch (err) {
      errEl.textContent = err.message || 'تعذر إرسال التقييم. حاول مرة أخرى.';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });
}

function openTransportModal() {
  els.modalContent.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-extrabold text-amber-400 flex items-center gap-2">
        <i data-lucide="bus" class="w-5 h-5"></i> دليل مواصلات الإسماعيلية
      </h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-800 rounded-full text-slate-400"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="space-y-2.5 max-h-80 overflow-y-auto no-scrollbar">
      ${TRANSPORT_ROUTES.map(r => `
        <div class="bg-slate-950/70 border border-slate-800 p-3 rounded-2xl flex justify-between items-center">
          <div>
            <p class="text-xs font-bold text-white">${r.from} ⇄ ${r.to}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">${r.line} • ${r.time}</p>
          </div>
          <span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg text-xs font-extrabold">${r.fare}</span>
        </div>
      `).join('')}
    </div>
  `;
  showModal();
}

// نافذة "تواصل معنا": بيانات مسؤول الموقع والشركة المؤسسة للدليل.
function openContactModal() {
  els.modalContent.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-extrabold text-amber-400 flex items-center gap-2">
        <i data-lucide="messages-square" class="w-5 h-5"></i> تواصل معنا
      </h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-800 rounded-full text-slate-400"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <p class="text-xs text-slate-400 font-semibold mb-4 leading-relaxed">لإضافة خدمتك للدليل، أو تصحيح بيانات خدمة موجودة، أو الاستفسار عن الإعلانات — تواصل مع إدارة الدليل:</p>
    <div class="space-y-2.5">
      <div class="bg-slate-950/70 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0"><i data-lucide="user-round" class="w-5 h-5"></i></div>
        <div>
          <p class="text-[11px] text-slate-400 font-bold">مسؤول الموقع</p>
          <p class="text-sm text-white font-extrabold">Ahmed Attia</p>
        </div>
      </div>
      <div class="bg-slate-950/70 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0"><i data-lucide="building-2" class="w-5 h-5"></i></div>
        <div>
          <p class="text-[11px] text-slate-400 font-bold">الشركة المؤسسة</p>
          <p class="text-sm text-white font-extrabold">Nexora</p>
        </div>
      </div>
      <div class="bg-slate-950/70 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0"><i data-lucide="phone" class="w-5 h-5"></i></div>
          <div>
            <p class="text-[11px] text-slate-400 font-bold">رقم مسؤول الموقع</p>
            <p class="text-sm text-white font-extrabold" dir="ltr">01121341717</p>
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          <a href="https://wa.me/201121341717" target="_blank" rel="noopener" class="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95"><i data-lucide="message-circle" class="w-4 h-4"></i> واتساب</a>
          <a href="tel:01121341717" class="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95"><i data-lucide="phone-call" class="w-4 h-4"></i> اتصال</a>
        </div>
      </div>
      <div class="bg-slate-950/70 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0"><i data-lucide="phone" class="w-5 h-5"></i></div>
          <div>
            <p class="text-[11px] text-slate-400 font-bold">رقم إضافي للتواصل</p>
            <p class="text-sm text-white font-extrabold" dir="ltr">01117543009</p>
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          <a href="https://wa.me/201117543009" target="_blank" rel="noopener" class="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95"><i data-lucide="message-circle" class="w-4 h-4"></i> واتساب</a>
          <a href="tel:01117543009" class="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95"><i data-lucide="phone-call" class="w-4 h-4"></i> اتصال</a>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <a href="https://www.facebook.com/share/1HtWFUyNba/" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 bg-sky-600/20 border border-sky-500/30 text-sky-400 py-3 rounded-xl text-xs font-bold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          فيسبوك
        </a>
        <a href="https://www.instagram.com/nexoraa_egypt" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 bg-pink-600/20 border border-pink-500/30 text-pink-400 py-3 rounded-xl text-xs font-bold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
          إنستجرام
        </a>
      </div>
    </div>
  `;
  showModal();
}

function openAddServiceModal() {
  els.modalContent.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-extrabold text-amber-400">إضافة خدمة جديدة للدليل</h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-800 rounded-full text-slate-400"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <form id="addServiceForm" class="space-y-3 text-xs">
      <input type="text" name="name" required placeholder="اسم النشاط التجاري / العيادة" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      <div class="grid grid-cols-2 gap-2">
        <select name="category" id="addGroupSelect" class="bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          ${GROUPS.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
        </select>
        <select name="subcategory" id="addSubSelect" class="bg-slate-950 border border-slate-800 rounded-xl p-3 text-white"></select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <select name="area" class="bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          ${AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <input type="text" name="address" required placeholder="العنوان التفصيلي" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      <div class="grid grid-cols-2 gap-2">
        <input type="tel" name="phone" required placeholder="رقم الهاتف" class="bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
        <input type="tel" name="whatsapp" required placeholder="واتساب (2010...)" class="bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      </div>
      <input type="text" name="tags" placeholder="كلمات مفتاحية (مثال: دليفري، كشف، صيانة)" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      <label class="flex items-center gap-2 text-slate-300 py-1">
        <input type="checkbox" name="isEmergency" class="accent-amber-500"> متاح طوارئ / 24 ساعة
      </label>
      <button type="submit" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl transition">حفظ ونشر الخدمة فوراً</button>
    </form>
  `;
  showModal();

  // التصنيفات الفرعية في نموذج الإضافة تتبع القسم الرئيسي المختار.
  const fillAddSubs = () => {
    const group = GROUPS.find((g) => g.id === document.getElementById('addGroupSelect').value);
    const subSelect = document.getElementById('addSubSelect');
    subSelect.innerHTML = (group ? group.subs : []).map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  };
  document.getElementById('addGroupSelect').addEventListener('change', fillAddSubs);
  fillAddSubs();

  document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      category: fd.get('category'),
      subcategory: fd.get('subcategory') || '',
      area: fd.get('area'),
      address: fd.get('address'),
      phone: fd.get('phone'),
      whatsapp: fd.get('whatsapp'),
      tags: fd.get('tags') || 'خدمات عامة',
      isEmergency: fd.get('isEmergency') === 'on',
      openHour: fd.get('isEmergency') === 'on' ? 0 : 9,
      closeHour: fd.get('isEmergency') === 'on' ? 24 : 23
    };

    // الأدمن المسجل ينشر مباشرة في Firestore.
    // الزائر غير المسجل: يُحفظ طلبه محلياً فقط ويُعرض له
    // رسالة واضحة بأنه بانتظار مراجعة الإدارة، ولا ينكسر الموقع
    // إذا كان Firebase غير متصل.
    if (auth.currentUser && isAdmin(auth.currentUser)) {
      try {
        await db.addService(payload);
      } catch (err) {
        alert(err.message || 'تعذر نشر الخدمة. حاول مرة أخرى.');
        return;
      }
    } else {
      db.saveServiceLocally(payload);
      closeModal();
      state.services = await db.getAllServices();
      refreshUI();
      alert('تم حفظ طلبك محلياً وسيتم مراجعته من الإدارة قبل النشر العام. للتواصل المباشر مع الإدارة استخدم صفحة لوحة التحكم.');
      return;
    }

    state.services = await db.getAllServices();
    closeModal();
    refreshUI();
  });
}

function updateAccountButton() {
  const label = document.getElementById('accountLabel');
  if (!label) return;
  if (state.currentUser) {
    const name = (state.profile && state.profile.name) || (state.isAdmin ? 'الأدمن' : 'حسابي');
    label.textContent = String(name).split(' ')[0];
  } else {
    label.textContent = 'حسابي';
  }
}

// نافذة حساب المستخدم: تبويبا تسجيل الدخول وإنشاء حساب جديد.
// الحقول المطلوبة: الاسم، رقم الموبايل، كلمة السر وتأكيدها، والبريد اختياري.
function openAuthModal(mode = 'login') {
  els.modalContent.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-extrabold text-amber-400">حسابك في دليل الإسماعيلية</h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-800 rounded-full text-slate-400"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-4">
      <button id="tabLogin" class="py-2.5 rounded-xl text-xs font-extrabold transition ${mode === 'login' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">تسجيل الدخول</button>
      <button id="tabSignup" class="py-2.5 rounded-xl text-xs font-extrabold transition ${mode === 'signup' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">إنشاء حساب</button>
    </div>
    <p id="authError" class="hidden text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-3"></p>

    <form id="loginForm" class="space-y-3 text-xs ${mode === 'signup' ? 'hidden' : ''}">
      <input type="tel" name="phone" required dir="ltr" placeholder="رقم الموبايل (01xxxxxxxxx)" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-right">
      <input type="password" name="password" required placeholder="كلمة السر" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      <button type="submit" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl transition">دخول</button>
    </form>

    <form id="signupForm" class="space-y-3 text-xs ${mode === 'login' ? 'hidden' : ''}">
      <input type="text" name="name" required placeholder="الاسم بالكامل" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      <input type="tel" name="phone" required dir="ltr" placeholder="رقم الموبايل (01xxxxxxxxx)" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-right">
      <input type="email" name="email" placeholder="البريد الإلكتروني (اختياري)" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      <input type="password" name="password" required minlength="6" placeholder="كلمة السر (6 أحرف على الأقل)" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      <input type="password" name="confirmPassword" required minlength="6" placeholder="تأكيد كلمة السر" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      <button type="submit" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl transition">إنشاء الحساب</button>
    </form>
  `;
  showModal();

  const showError = (msg) => {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.classList.remove('hidden');
  };
  const setLoading = (form, loading) => {
    form.querySelector('button[type="submit"]').disabled = loading;
    form.querySelector('button[type="submit"]').style.opacity = loading ? '0.6' : '1';
  };

  document.getElementById('tabLogin').addEventListener('click', () => openAuthModal('login'));
  document.getElementById('tabSignup').addEventListener('click', () => openAuthModal('signup'));

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    setLoading(e.target, true);
    try {
      const { profile } = await signIn({ phone: fd.get('phone'), password: fd.get('password') });
      closeModal();
      alert(`أهلاً بيك${profile && profile.name ? '، ' + profile.name : ''}! تم تسجيل دخولك.`);
    } catch (err) {
      showError(translateAuthError(err));
    } finally {
      setLoading(e.target, false);
    }
  });

  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('password') !== fd.get('confirmPassword')) {
      showError('كلمتا السر غير متطابقتين. تأكد من تأكيد كلمة السر.');
      return;
    }
    setLoading(e.target, true);
    try {
      const { profile } = await signUp({
        name: fd.get('name'),
        phone: fd.get('phone'),
        email: fd.get('email'),
        password: fd.get('password')
      });
      closeModal();
      alert(`تم إنشاء حسابك بنجاح. أهلاً بيك، ${profile.name}!`);
    } catch (err) {
      showError(translateAuthError(err));
    } finally {
      setLoading(e.target, false);
    }
  });
}

function openProfileModal() {
  const p = state.profile;
  els.modalContent.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-extrabold text-amber-400">حسابي</h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-800 rounded-full text-slate-400"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 mb-4 space-y-2 text-xs">
      <p class="text-white font-extrabold text-sm">${p ? p.name : (state.isAdmin ? 'الأدمن' : 'مستخدم')}</p>
      ${p && p.phone ? `<p class="text-slate-300">📱 ${p.phone}</p>` : ''}
      ${p && p.email ? `<p class="text-slate-300">✉️ ${p.email}</p>` : ''}
      ${state.isAdmin ? '<p class="text-amber-400 font-bold">حساب إدارة الدليل</p>' : ''}
    </div>
    <button id="btnLogout" class="w-full bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white font-extrabold py-3 rounded-xl text-xs transition">تسجيل الخروج</button>
  `;
  showModal();
  document.getElementById('btnLogout').addEventListener('click', async () => {
    await signOut(auth);
    closeModal();
    refreshUI();
  });
}

function showModal() {
  els.modal.classList.remove('hidden');
  els.modal.classList.add('flex');
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  lucide.createIcons();
}

function closeModal() {
  els.modal.classList.add('hidden');
  els.modal.classList.remove('flex');
  els.modalContent.classList.remove('detail-sheet');
  document.title = 'دليل خدمات الإسماعيلية | Ismailia Super App';
  if (location.hash.startsWith('#service-')) history.replaceState(null, '', location.pathname + location.search);
}

initApp();
