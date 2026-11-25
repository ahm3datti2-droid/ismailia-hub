import { AREAS, GROUPS, TRANSPORT_ROUTES, EMERGENCY_NUMBERS } from './config.js';
import { SERVICE_LOCATIONS } from './service-locations.js';
import { db } from './database.js';
import { renderCategories, renderSubcategories, renderGroupTiles, renderServiceCards, renderSkeleton, renderErrorState, getOpenStatus, categoryInfo, subcategoryName, armDeleteConfirm, renderBannerSlider, stopBannerSlider, toWhatsAppNumber, renderTopRated, renderTicker, createdAtMs, downscaleImageToDataUrl } from './ui.js';
import { auth, onAuthStateChanged, isAdmin, signOut } from './firebase.js';
import { signUp, signIn, getProfile, translateAuthError } from './auth.js';

const state = {
  services: [],
  offers: [],
  banners: [],
  gold: null,
  activeCategory: 'all',
  activeSubcategory: 'all',
  selectedArea: 'all',
  searchQuery: '',
  showAll: false, // "كل الخدمات": عرض كل الأنشطة في قائمة واحدة (يختلف عن الرئيسية/بلاطات الأقسام)
  onlyEmergency: false,
  onlyFavorites: false,
  onlyOpenNow: false,
  only24h: false,
  onlyTopRated: false, // "الأعلى تقييماً": عرض أفضل الخدمات تقييماً مرتبة تنازلياً
  loaded: false, // true بعد أول تحميل ناجح للخدمات (من الكاش أو Firestore) — قبلها تظهر "…" بدل 0
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
  groupsSection: document.getElementById('groupsSection'),
  groupsGrid: document.getElementById('groupsGrid'),
  servicesSection: document.getElementById('servicesSection'),
  resultsCount: document.getElementById('resultsCount'),
  sectionTitle: document.getElementById('sectionTitle'),
  heroCount: document.getElementById('heroCount'),
  footerCount: document.getElementById('footerCount'),
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
    // مزامنة المحفوظات مع الحساب: دمج المحلي مع البعيد عند تسجيل الدخول،
    // ورفع أي محفوظات محلية لم تُزامَن بعد.
    if (user) {
      try {
        const remote = await db.getRemoteFavorites();
        const merged = Array.from(new Set([...state.favorites, ...remote]));
        const toUpload = merged.filter((id) => !remote.includes(id));
        if (merged.length !== state.favorites.length) {
          state.favorites = merged;
          localStorage.setItem('ism_favs', JSON.stringify(state.favorites));
        }
        toUpload.forEach((id) => db.setFavoriteRemote(id, true));
      } catch (_) { /* المزامنة تحسين إضافي — فشلها لا يكسر الصفحة */ }
    }
    if (wasAdmin !== state.isAdmin) refreshUI();
  });

  bindEvents();
  // تسجيل زيارة اليوم (مرة واحدة لكل جهاز في اليوم) — لا يوقف التحميل.
  db.logVisit();
  // بلاطات الأقسام تظهر فوراً (بعدّادات "…" حتى تحميل Firestore).
  renderGroupTiles(els.groupsGrid, GROUPS, null, null, selectGroupTile);
  // بطاقات هيكلية فوراً حتى لا تظهر الصفحة فارغة أثناء انتظار Firestore.
  renderSkeleton(els.servicesGrid);
  // سعر الذهب يُجلب مبكراً ومستقلاً: مستند واحد صغير بيوصل في أقل من ثانية،
  // فالشريط يعرض أسعار الأدمن من أول تحميل بدل ما يستنى تحديث الخدمات
  // الكامل (340 مستند) اللي بياخد وقت أحياناً.
  db.getGoldPrices().then((g) => {
    if (!g) return;
    state.gold = g;
    renderGoldSection(isHomeView());
  }).catch(() => {});
  await loadServices();
}

// مسح البحث عند اختيار قسم/قسم فرعي — وإلا يطلع "0 نتيجة" من غير تفسير
// لما تكون فيه كلمة بحث قديمة في الصندوق. تُستدعى من بلاطات الرئيسية
// ومن شرائح التصنيفات ومن الأقسام الفرعية (كلها طرق لاختيار قسم).
function clearSearchInput() {
  state.searchQuery = '';
  if (els.searchInput) els.searchInput.value = '';
}

// اختيار قسم من بلاطات الصفحة الرئيسية: يعرض خدماته فقط.
// بلاطة "كل الخدمات" تعرض كل الأنشطة في قائمة واحدة.
function selectGroupTile(groupId) {
  state.activeCategory = groupId;
  state.showAll = groupId === 'all';
  state.activeSubcategory = 'all';
  clearSearchInput();
  state.onlyEmergency = false;
  state.onlyFavorites = false;
  state.onlyOpenNow = false;
  state.only24h = false;
  state.onlyTopRated = false;
  syncGroupHash();
  db.logGroupView(groupId);
  refreshUI();
  els.servicesSection.scrollIntoView({ behavior: 'smooth' });
}

// "شوف الكل" في قسم الأعلى تقييماً: قائمة أفضل الخدمات تقييماً مرتبة تنازلياً.
function showTopRated() {
  state.activeCategory = 'all';
  state.activeSubcategory = 'all';
  state.onlyEmergency = false;
  state.onlyFavorites = false;
  state.onlyOpenNow = false;
  state.only24h = false;
  state.onlyTopRated = true;
  state.showAll = false;
  refreshUI();
  els.servicesSection.scrollIntoView({ behavior: 'smooth' });
}

// إعادة كل الفلاتر للوضع الافتراضي: الصفحة الرئيسية (بلاطات الأقسام).
function resetToHome() {
  state.activeCategory = 'all';
  state.activeSubcategory = 'all';
  state.selectedArea = 'all';
  state.searchQuery = '';
  state.showAll = false;
  state.onlyEmergency = false;
  state.onlyFavorites = false;
  state.onlyOpenNow = false;
  state.only24h = false;
  state.onlyTopRated = false;
  els.searchInput.value = '';
  const heroSearch = document.getElementById('heroSearchInput');
  if (heroSearch) heroSearch.value = '';
  els.areaSelect.value = 'all';
  if (!location.hash.startsWith('#service-')) history.replaceState(null, '', location.pathname + location.search);
  refreshUI();
}

async function loadServices() {
  // 1) عرض نسخة مخزنة فوراً (إن وجدت) حتى لا تبقى الصفحة فارغة أثناء انتظار الشبكة،
  // ثم تحديثها في الخلفية من Firestore.
  const cached = readServicesCache();
  if (cached) {
    state.services = cached;
    state.loaded = true;
    refreshUI();
    if (!openDeepLinkedService()) openDeepLinkedGroup();
  }
  try {
    const [services, offers, banners, gold] = await Promise.all([
      db.getAllServices(),
      db.getActiveOffers().catch(() => []),
      db.getActiveBanners().catch(() => []),
      db.getGoldPrices().catch(() => null)
    ]);
    state.services = services;
    state.offers = offers;
    state.banners = banners;
    state.gold = gold;
    state.loaded = true;
    writeServicesCache(services);
    refreshUI();
    if (!openDeepLinkedService()) openDeepLinkedGroup();
  } catch (err) {
    if (cached) return; // النسخة المخزنة معروضة أصلاً — لا نكسر الصفحة.
    console.error('تعذر تحميل الخدمات:', err);
    renderErrorState(els.servicesGrid, () => {
      renderSkeleton(els.servicesGrid);
      loadServices();
    });
  }
}

// تخزين مؤقت للخدمات في localStorage: الزيارات التالية تفتح فوراً،
// والتحديث من Firestore يتم في الخلفية عند كل تحميل.
// (الصور المحفوظة كبيانات داخل المستندات تُستثنى من التخزين لأنها ضخمة
// وتُحمَّل من مسارات /images/... بعد ترحيلها.)
const SERVICES_CACHE_KEY = 'ism_services_cache_v2';
function readServicesCache() {
  try {
    const raw = localStorage.getItem(SERVICES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.services) || !parsed.services.length) return null;
    return parsed.services;
  } catch (_) {
    return null;
  }
}
function writeServicesCache(services) {
  try {
    const slim = services.map((s) => {
      const c = { ...s };
      if (typeof c.imageUrl === 'string' && c.imageUrl.startsWith('data:')) c.imageUrl = '';
      return c;
    });
    localStorage.setItem(SERVICES_CACHE_KEY, JSON.stringify({ v: 2, at: Date.now(), services: slim }));
  } catch (_) { /* التخزين تحسين إضافي — امتلاؤه لا يكسر الصفحة */ }
}
function clearServicesCache() {
  try { localStorage.removeItem(SERVICES_CACHE_KEY); } catch (_) {}
}

// رابط خاص لكل خدمة: #service-<id> أو ?service=<id> يفتح تفاصيل الخدمة مباشرة عند فتح الرابط.
function deepLinkedServiceId() {
  const hash = (location.hash || '').match(/^#service-(.+)$/);
  if (hash) return hash[1];
  return new URLSearchParams(location.search).get('service');
}

function openDeepLinkedService() {
  const id = deepLinkedServiceId();
  const srv = id && state.services.find(s => s.id === id);
  if (!srv) return false;
  // خلفية التفاصيل تعرض قسم الخدمة نفسها بدل كل الأنشطة.
  state.activeCategory = srv.category;
  state.activeSubcategory = 'all';
  refreshUI();
  openServiceDetails(id);
  return true;
}

// رابط خاص لكل قسم: #group-<id> أو ?group=<id> يعرض خدمات القسم مباشرة عند فتح الرابط.
function deepLinkedGroupId() {
  const hash = (location.hash || '').match(/^#group-(.+)$/);
  const raw = hash ? hash[1] : new URLSearchParams(location.search).get('group');
  if (!raw) return null;
  if (raw === 'jarak') return 'jarak';
  if (raw === 'awareness') return 'awareness';
  return GROUPS.some((g) => g.id === raw) || raw === 'all' ? raw : null;
}

function openDeepLinkedGroup() {
  const groupId = deepLinkedGroupId();
  if (!groupId) return;
  if (groupId === 'jarak') { location.href = 'jarak.html'; return; }
  if (groupId === 'awareness') { location.href = '/digital-awareness'; return; }
  selectGroupTile(groupId);
}

// يعكس القسم النشط في شريط العنوان حتى يصبح الرابط قابلاً للمشاركة.
function syncGroupHash() {
  if (location.hash.startsWith('#service-')) return;
  const g = state.activeCategory;
  history.replaceState(null, '', g && g !== 'all' ? `#group-${g}` : location.pathname + location.search);
}

// تغيير الرابط يدوياً في نفس التبويب المفتوحة (مثال: لصق رابط قسم آخر)
// يبدّل القسم فوراً دون إعادة تحميل — replaceState لا يطلق هذا الحدث
// فلا توجد حلقة.
window.addEventListener('hashchange', () => {
  if (!els.modal.classList.contains('hidden')) closeModal();
  if (deepLinkedServiceId()) { openDeepLinkedService(); return; }
  const groupId = deepLinkedGroupId();
  if (groupId === 'jarak') { location.href = 'jarak.html'; return; }
  if (groupId === 'awareness') { location.href = '/digital-awareness'; return; }
  if (groupId) selectGroupTile(groupId);
});

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

  // بحث الهيرو يعكس كتابته في بحث شريط الفلاتر (والعكس عبر resetToHome)
  // فيكفي مستمع واحد — مستمع شريط الفلاتر — لتنفيذ البحث.
  document.getElementById('heroSearchInput')?.addEventListener('input', (e) => {
    els.searchInput.value = e.target.value;
    els.searchInput.dispatchEvent(new Event('input'));
  });

  document.getElementById('btnHome').addEventListener('click', resetToHome);

  document.getElementById('btnBackToGroups').addEventListener('click', () => {
    resetToHome();
    els.groupsSection.scrollIntoView({ behavior: 'smooth' });
  });
  // "عرض كل الخدمات" في عنوان الأقسام + "شوف الكل" في الأعلى تقييماً.
  document.getElementById('btnShowAllServices')?.addEventListener('click', () => selectGroupTile('all'));
  document.getElementById('btnShowTopRated')?.addEventListener('click', showTopRated);
  // الهيدر يصغر عند التمرير (ويختفي سطره الفرعي) — والبحث يفضل ظاهراً في شريط الفلاتر.
  const headerEl = document.querySelector('.site-header');
  if (headerEl) {
    const onScroll = () => document.body.classList.toggle('header-compact', window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  document.getElementById('btnEmergency').addEventListener('click', openEmergencyModal);

  document.getElementById('btnMap').addEventListener('click', openMapView);

  document.getElementById('btnCloseMap')?.addEventListener('click', closeMapView);

  document.getElementById('btnTransport').addEventListener('click', openTransportModal);

  document.getElementById('btnContact').addEventListener('click', openContactModal);

  document.getElementById('btnSaved').addEventListener('click', () => {
    state.onlyFavorites = !state.onlyFavorites;
    state.onlyEmergency = false;
    refreshUI();
  });

  // فلاتر سريعة: فاتحة دلوقتي / 24 ساعة.
  document.getElementById('chipOpenNow')?.addEventListener('click', () => {
    state.onlyOpenNow = !state.onlyOpenNow;
    refreshUI();
  });
  document.getElementById('chip24h')?.addEventListener('click', () => {
    state.only24h = !state.only24h;
    refreshUI();
  });

  document.getElementById('btnAddService').addEventListener('click', openAddServiceModal);
  document.getElementById('footerAddService')?.addEventListener('click', openAddServiceModal);
  // روابط الأقسام السريعة في التذييل.
  document.querySelectorAll('[data-footer-group]').forEach((btn) => {
    btn.addEventListener('click', () => selectGroupTile(btn.dataset.footerGroup));
  });
  document.getElementById('btnAccount').addEventListener('click', () => {
    if (state.currentUser) openProfileModal();
    else openAuthModal('login');
  });
  document.getElementById('closeModalBackdrop').addEventListener('click', closeModal);
}

// عنوان قسم الخدمات حسب الحالة الحالية (قسم مختار / طوارئ / محفوظات / بحث).
function updateSectionTitle() {
  if (state.onlyEmergency) els.sectionTitle.textContent = 'خدمات الطوارئ و 24 ساعة';
  else if (state.onlyFavorites) els.sectionTitle.textContent = 'الخدمات المحفوظة';
  else if (state.onlyOpenNow) els.sectionTitle.textContent = 'الفاتحة دلوقتي';
  else if (state.only24h) els.sectionTitle.textContent = 'خدمات 24 ساعة';
  else if (state.onlyTopRated) els.sectionTitle.textContent = 'الأعلى تقييماً';
  else if (state.searchQuery) els.sectionTitle.textContent = 'نتائج البحث';
  else if (state.activeCategory !== 'all') els.sectionTitle.textContent = categoryInfo(state.activeCategory).name;
  else els.sectionTitle.textContent = 'أبرز الخدمات في الإسماعيلية';
  // خطوط الصيدليات الساخنة: بس عند تصفح قسم الصيدليات.
  const hotlines = document.getElementById('pharmacyHotlines');
  if (hotlines) hotlines.classList.toggle('hidden', !(state.activeCategory === 'health' && state.activeSubcategory === 'pharmacies'));
}

// مزامنة شكل زراري "فاتحة دلوقتي" و"24 ساعة" مع الحالة.
function syncQuickChips() {
  document.getElementById('chipOpenNow')?.classList.toggle('quick-chip--on', state.onlyOpenNow);
  document.getElementById('chip24h')?.classList.toggle('quick-chip--on', state.only24h);
}

function isHomeView() {
  return state.activeCategory === 'all' && state.activeSubcategory === 'all' &&
    state.selectedArea === 'all' && !state.searchQuery && !state.showAll && !state.onlyEmergency && !state.onlyFavorites && !state.onlyOpenNow && !state.only24h && !state.onlyTopRated;
}

function refreshUI() {
  renderCategories(els.categories, state.activeCategory, (catId) => {
    state.activeCategory = catId;
    state.showAll = catId === 'all';
    state.activeSubcategory = 'all';
    clearSearchInput();
    state.onlyEmergency = false;
    state.onlyFavorites = false;
    state.onlyOpenNow = false;
    state.only24h = false;
    state.onlyTopRated = false;
    syncGroupHash();
    db.logGroupView(catId);
    refreshUI();
  });

  renderSubcategories(els.subcategories, state.activeCategory, state.activeSubcategory, (subId) => {
    state.activeSubcategory = subId;
    clearSearchInput();
    refreshUI();
  });

  syncQuickChips();

  // الصفحة الرئيسية: بلا أي فلتر أو بحث تعرض بلاطات الأقسام فقط،
  // وأي اختيار أو بحث أو فلتر يعرض قائمة الخدمات بدلها.
  const isHome = isHomeView();
  els.groupsSection.classList.toggle('hidden', !isHome);
  els.servicesSection.classList.toggle('hidden', isHome);
  renderOffersSection(isHome);
  renderGoldSection(isHome);
  renderDailyTipSection(isHome);
  renderDailyServicesSection(isHome);
  document.getElementById('jarakSection')?.classList.toggle('hidden', !isHome);
  document.getElementById('awarenessSection')?.classList.toggle('hidden', !isHome);
  document.getElementById('marketSection')?.classList.toggle('hidden', !isHome);
  renderBannersSection(isHome);
  renderTopRatedSection(isHome);
  renderTickerSection(isHome);
  updateSectionTitle();
  if (isHome) {
    const counts = {};
    state.services.forEach(s => { counts[s.category] = (counts[s.category] || 0) + 1; });
    renderGroupTiles(els.groupsGrid, GROUPS, counts, state.services.length, selectGroupTile);
  }

  const filtered = state.services.filter(srv => {
    const matchCat = state.activeCategory === 'all' || srv.category === state.activeCategory;
    const matchSub = state.activeSubcategory === 'all' || srv.subcategory === state.activeSubcategory;
    const matchArea = state.selectedArea === 'all' || srv.area === state.selectedArea;
    const matchEmerg = !state.onlyEmergency || srv.isEmergency;
    const matchFav = !state.onlyFavorites || state.favorites.includes(srv.id);
    const matchOpen = !state.onlyOpenNow || getOpenStatus(srv.openHour, srv.closeHour).isOpen;
    const match24 = !state.only24h || (srv.openHour === 0 && srv.closeHour === 24);
    const matchTop = !state.onlyTopRated || ((Number(srv.rating || 0) >= 4) && (srv.reviewsCount > 1 || srv.rating !== 5));
    const matchQuery = !state.searchQuery ||
      srv.name.toLowerCase().includes(state.searchQuery) ||
      srv.area.toLowerCase().includes(state.searchQuery) ||
      srv.tags.toLowerCase().includes(state.searchQuery) ||
      srv.address.toLowerCase().includes(state.searchQuery);

    return matchCat && matchSub && matchArea && matchEmerg && matchFav && matchQuery && matchOpen && match24 && matchTop;
  });
  // قائمة "الأعلى تقييماً": مرتبة تنازلياً بالتقييم ثم عدد المراجعات.
  if (state.onlyTopRated) {
    filtered.sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (Number(b.reviewsCount || 0) - Number(a.reviewsCount || 0)));
  }
  // ترتيب نتائج البحث حسب قوة المطابقة: الاسم أولاً، ثم الوسوم،
  // ثم المنطقة/العنوان — عشان "صيدلية" ما تجيبش مطاعم أولاً
  // لمجرد إن العنوان فيه "بجوار صيدلية…".
  if (state.searchQuery && !state.onlyTopRated) {
    const q = state.searchQuery;
    const score = (srv) => srv.name.toLowerCase().includes(q) ? 0
      : srv.tags.toLowerCase().includes(q) ? 1 : 2;
    filtered.sort((a, b) => score(a) - score(b));
  }

  // العدّادات تظهر "…" حتى أول تحميل ناجح — لا 0 وهمي أثناء التحميل.
  els.resultsCount.textContent = state.loaded ? `${filtered.length} خدمة` : '…';
  // إحصاءات الهيرو الحية: عدد الخدمات الكلي + عدد الأقسام والمناطق.
  if (els.heroCount) els.heroCount.textContent = state.loaded ? state.services.length : '—';
  if (els.footerCount) els.footerCount.textContent = state.loaded ? state.services.length : '—';
  if (els.heroGroups) els.heroGroups.textContent = GROUPS.length;
  if (els.heroAreas) els.heroAreas.textContent = AREAS.length;

  renderServiceCards(els.servicesGrid, filtered, state.favorites, state.isAdmin, {
    onClearFilters: resetToHome,
    onDetails: openServiceDetails,
    onToggleFav: toggleFavorite,
    onDelete: handleDeleteService
  });
}

// شاشة العرض في أول الموقع — تظهر فقط على الرئيسية وعند وجود إعلانات مفعّلة.
// إعادة الرسم تتم فقط عند تغيّر قائمة الإعلانات أو الانتقال من/إلى الرئيسية،
// حتى لا يعيد التايمر نفسه مع كل ضغطة بحث أو فلتر.
let renderedBannerSig = '';
function renderBannersSection(isHome) {
  const section = document.getElementById('bannersSection');
  const slider = document.getElementById('bannerSlider');
  if (!section || !slider) return;
  const sig = (isHome ? 'home:' : 'away:') + state.banners.map((b) => `${b.id}:${b.order}:${b.active}`).join('|');
  if (sig === renderedBannerSig && !section.classList.contains('hidden') === isHome) return;
  renderedBannerSig = sig;
  section.classList.toggle('hidden', !isHome || !state.banners.length);
  if (!isHome || !state.banners.length) { stopBannerSlider(); return; }
  renderBannerSlider(slider, state.banners, (serviceId) => openServiceDetails(serviceId));
}

// الأعلى تقييماً — يظهر على الرئيسية فقط، ويُعاد رسمه فقط عند تغيّر قائمة الأوائل.
let renderedTopRatedSig = '';
function renderTopRatedSection(isHome) {
  const section = document.getElementById('topRatedSection');
  const row = document.getElementById('topRatedRow');
  if (!section || !row) return;
  const top = state.services
    .filter((s) => s.reviewsCount > 1 || s.rating !== 5)
    .slice()
    .sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (Number(b.reviewsCount || 0) - Number(a.reviewsCount || 0)))
    .slice(0, 8);
  const sig = (isHome ? 'home:' : 'away:') + top.map((s) => s.id).join('|');
  if (sig === renderedTopRatedSig) {
    section.classList.toggle('hidden', !isHome || !top.length);
    return;
  }
  renderedTopRatedSig = sig;
  section.classList.toggle('hidden', !isHome || !top.length);
  if (!isHome || !top.length) return;
  renderTopRated(row, state.services, (id) => openServiceDetails(id));
}

// شريط "جديد في الدليل" — يظهر على الرئيسية فقط، ويُعاد رسمه فقط عند تغيّر الأحدث.
let renderedTickerSig = '';
function renderTickerSection(isHome) {
  const bar = document.getElementById('tickerBar');
  const track = document.getElementById('tickerTrack');
  if (!bar || !track) return;
  const latest = state.services.slice().sort((a, b) => createdAtMs(b) - createdAtMs(a)).slice(0, 6);
  const sig = (isHome ? 'home:' : 'away:') + latest.map((s) => s.id).join('|');
  if (sig === renderedTickerSig) {
    bar.classList.toggle('hidden', !isHome || !latest.length);
    return;
  }
  renderedTickerSig = sig;
  bar.classList.toggle('hidden', !isHome || !latest.length);
  if (!isHome || !latest.length) return;
  renderTicker(track, state.services, (id) => openServiceDetails(id));
}

// سعر الذهب اليوم: الأسعار اليدوية من الأدمن (أسعار الصاغة) تظهر لو حديثة
// (أقل من 24 ساعة)، وإلا تلقائي من AlyawmGold (سعر عالمي محوّل للجنيه —
// استرشادي، قد يختلف عن سعر الصاغة). النتيجة التلقائية بتتخزن ساعة على الجهاز.
const GOLD_API_URL = 'https://alyawmgold.com/api/v1/spot/latest?country=EG';
const GOLD_CACHE_KEY = 'ism_gold_spot';
const GOLD_CACHE_MS = 60 * 60 * 1000;
async function fetchSpotGold() {
  try {
    const cached = JSON.parse(localStorage.getItem(GOLD_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < GOLD_CACHE_MS && cached.prices && cached.prices.price21) return cached.prices;
  } catch (_) {}
  try {
    const r = await fetch(GOLD_API_URL);
    if (!r.ok) return null;
    const j = await r.json();
    const est = j.localGoldEstimate || (j.metals && j.metals.gold && j.metals.gold.karats);
    if (!est) return null;
    const prices = {
      price24: Math.round(Number(est.karat24) || 0),
      price21: Math.round(Number(est.karat21) || 0),
      price18: Math.round(Number(est.karat18) || 0),
      pound: Math.round((Number(est.karat21) || 0) * 8)
    };
    if (!prices.price21) return null;
    try { localStorage.setItem(GOLD_CACHE_KEY, JSON.stringify({ ts: Date.now(), prices })); } catch (_) {}
    return prices;
  } catch (_) { return null; }
}

// الأسعار اليدوية من الأدمن (أسعار الصاغة) — حديثة لو اتحفظت من أقل من 24 ساعة.
// تُقرأ من state.gold الحالي في كل مرة، لأن المستند ممكن يوصل متأخراً
// عن أول رسم للشريط (الجلب المبكر أو تحديث الخدمات الخلفي).
function freshManualGold() {
  const g = state.gold;
  if (!g || !(Number(g.price21) > 0 || Number(g.price24) > 0)) return null;
  let ms = 0;
  try { ms = g.updatedAt?.toMillis ? g.updatedAt.toMillis() : 0; } catch (_) {}
  if (!ms || Date.now() - ms >= 24 * 60 * 60 * 1000) return null;
  return { prices: g, note: 'محدّث: ' + new Date(ms).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) };
}

async function renderGoldSection(isHome) {
  const section = document.getElementById('goldSection');
  if (!section) return;
  section.classList.toggle('hidden', !isHome);
  if (!isHome) return;
  const g = state.gold;
  const hasManual = g && (Number(g.price21) > 0 || Number(g.price24) > 0);
  const fmt = (v) => Number(v) > 0 ? Number(v).toLocaleString('en-US') + ' ج.م' : '—';
  const label = document.getElementById('goldUpdatedLabel');
  const paint = (p, note) => {
    document.getElementById('goldPrice24').textContent = fmt(p.price24);
    document.getElementById('goldPrice21').textContent = fmt(p.price21);
    document.getElementById('goldPrice18').textContent = fmt(p.price18);
    document.getElementById('goldPricePound').textContent = fmt(p.pound);
    if (label) label.textContent = note;
  };
  let manualNote = '';
  try {
    const ms = g && g.updatedAt?.toMillis ? g.updatedAt.toMillis() : 0;
    manualNote = ms ? 'محدّث: ' + new Date(ms).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  } catch (_) { manualNote = ''; }
  // الأسعار اليدوية الحديثة (أقل من 24 ساعة) تفوز على التلقائي — قبل كده
  // كان الـ API بيغطي عليها دايماً، فاللي يتكتب في الأدمن ما كانش يظهر
  // في الرئيسية رغم رسالة "تظهر في الرئيسية فوراً".
  const manual = freshManualGold();
  if (manual) { paint(manual.prices, manual.note); return; }
  if (hasManual) paint(g, manualNote);
  else paint({ price24: 0, price21: 0, price18: 0, pound: 0 }, '');
  const spot = await fetchSpotGold();
  if (spot) {
    // أعيد فحص اليدوي: ممكن يكون وصل أثناء انتظار الـ API.
    const manualNow = freshManualGold();
    if (manualNow) paint(manualNow.prices, manualNow.note);
    else paint(spot, 'سعر استرشادي — محدّث ' + new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }) + ' · قد يختلف عن سعر الصاغة');
  }
}

// نصيحة اليوم — نصيحة رقمية مختلفة كل يوم من مواضيع مركز الوعي
// الرقمي (data/awareness/topics.json)، بتتغير حسب يوم السنة، واللينك
// بيودي على صفحة الموضوع. لو التحميل فشل، القسم بيفضل مخفي.
let dailyTipLoaded = false;
async function renderDailyTipSection(isHome) {
  const section = document.getElementById('dailyTipSection');
  if (!section) return;
  section.classList.toggle('hidden', !isHome);
  if (!isHome || dailyTipLoaded) return;
  dailyTipLoaded = true;
  try {
    const r = await fetch('data/awareness/topics.json');
    if (!r.ok) throw new Error('topics fetch failed');
    const data = await r.json();
    const topics = data.topics || [];
    if (!topics.length) return;
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);
    const topic = topics[dayOfYear % topics.length];
    document.getElementById('dailyTipTitle').textContent = topic.title;
    document.getElementById('dailyTipText').textContent = topic.lead;
    document.getElementById('dailyTipCard').href = `/digital-awareness#/topic/${topic.category}/${topic.id}`;
    section.classList.remove('hidden');
  } catch (_) {
    section.classList.add('hidden');
  }
}

// خدمات يومية: مواقيت الصلاة (Aladhan، طريقة الهيئة المصرية العامة
// للمساحة method=5، بإحداثيات الإسماعيلية) + مواعيد القطارات
// (data/trains.json — جدول ثابت بمراجعة 21 نوفمبر 2026 + تنبيه).
// المواقيت بتتخزن لليوم على الجهاز، ولو الـ API وقع بتظهر رسالة.
let dailyServicesLoaded = false;
let trainsData = null;
let trainsDir = 'ismailia-cairo';
async function renderDailyServicesSection(isHome) {
  const section = document.getElementById('dailyServicesSection');
  if (!section) return;
  section.classList.toggle('hidden', !isHome);
  if (!isHome || dailyServicesLoaded) return;
  dailyServicesLoaded = true;
  renderPrayerTimes();
  renderTrainsTable();
  document.getElementById('trainDirIsmCai')?.addEventListener('click', () => {
    trainsDir = 'ismailia-cairo';
    document.getElementById('trainDirIsmCai')?.classList.add('train-dir-btn--on');
    document.getElementById('trainDirCaiIsm')?.classList.remove('train-dir-btn--on');
    renderTrainsTable();
  });
  document.getElementById('trainDirCaiIsm')?.addEventListener('click', () => {
    trainsDir = 'cairo-ismailia';
    document.getElementById('trainDirCaiIsm')?.classList.add('train-dir-btn--on');
    document.getElementById('trainDirIsmCai')?.classList.remove('train-dir-btn--on');
    renderTrainsTable();
  });
}

function prayerDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
async function renderPrayerTimes() {
  const box = document.getElementById('prayerTimes');
  if (!box) return;
  const today = new Date();
  const key = `ism_prayer_${prayerDayKey(today)}`;
  let data = null;
  try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {}
  if (!data) {
    try {
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const r = await fetch(`https://api.aladhan.com/v1/timings/${dd}-${mm}-${today.getFullYear()}?latitude=30.5965&longitude=32.2715&method=5`);
      if (!r.ok) throw new Error('prayer fetch failed');
      const j = await r.json();
      data = j.data;
      try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
    } catch (_) {
      box.innerHTML = `<p class="text-xs text-slate-400 font-semibold">تعذر تحميل مواقيت اليوم — جرّب تاني بعد شوية.</p>`;
      return;
    }
  }
  if (!data || !data.timings) {
    box.innerHTML = `<p class="text-xs text-slate-400 font-semibold">تعذر تحميل مواقيت اليوم — جرّب تاني بعد شوية.</p>`;
    return;
  }
  const t = data.timings;
  const hijri = data.date && data.date.hijri ? `${data.date.hijri.day} ${data.date.hijri.month.ar} ${data.date.hijri.year}` : '';
  const hijriEl = document.getElementById('hijriDateLabel');
  if (hijriEl && hijri) hijriEl.textContent = hijri + ' هـ';
  const prayers = [
    { name: 'الفجر', time: t.Fajr },
    { name: 'الشروق', time: t.Sunrise },
    { name: 'الظهر', time: t.Dhuhr },
    { name: 'العصر', time: t.Asr },
    { name: 'المغرب', time: t.Maghrib },
    { name: 'العشاء', time: t.Isha }
  ];
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + m; };
  let nextIdx = prayers.findIndex((p) => toMin(p.time) > nowMin);
  if (nextIdx < 0) nextIdx = 0;
  box.innerHTML = prayers.map((p, i) => `
    <div class="prayer-time ${i === nextIdx ? 'prayer-time--next' : ''}">
      <span class="prayer-time__name">${p.name}${i === nextIdx ? ' · القادمة' : ''}</span>
      <span class="prayer-time__value" dir="ltr">${String(p.time).slice(0, 5)}</span>
    </div>`).join('');
}

async function renderTrainsTable() {
  const box = document.getElementById('trainsTable');
  const note = document.getElementById('trainsNote');
  if (!box) return;
  if (!trainsData) {
    try {
      const r = await fetch('data/trains.json');
      if (!r.ok) throw new Error('trains fetch failed');
      trainsData = await r.json();
    } catch (_) {
      box.innerHTML = `<p class="text-xs text-slate-400 font-semibold">تعذر تحميل المواعيد — جرّب تاني بعد شوية.</p>`;
      return;
    }
  }
  const dir = (trainsData.directions || []).find((d) => d.id === trainsDir) || trainsData.directions[0];
  if (!dir) return;
  box.innerHTML = `<table class="w-full text-xs">
    <thead><tr class="text-slate-400">
      <th class="text-right py-1.5 font-bold">القطار</th>
      <th class="text-right py-1.5 font-bold">النوع</th>
      <th class="text-right py-1.5 font-bold">مغادرة</th>
      <th class="text-right py-1.5 font-bold">وصول</th>
      <th class="text-right py-1.5 font-bold">المدة</th>
      <th class="text-right py-1.5 font-bold">الأجرة</th>
    </tr></thead>
    <tbody>${dir.trains.map((tr) => `
      <tr class="border-t border-slate-800/80">
        <td class="py-1.5 font-extrabold text-white" dir="ltr">${tr.no}</td>
        <td class="py-1.5 text-slate-300">${tr.type}</td>
        <td class="py-1.5 font-extrabold text-amber-400" dir="ltr">${tr.dep}</td>
        <td class="py-1.5 text-slate-300" dir="ltr">${tr.arr}${tr.nextDay ? ' (+1)' : ''}</td>
        <td class="py-1.5 text-slate-300" dir="ltr">${tr.dur}</td>
        <td class="py-1.5 text-slate-300">${tr.fare} ج.م</td>
      </tr>`).join('')}</tbody>
  </table>`;
  // تاريخ المراجعة في سطر لوحده عشان السنة ما تتقصّش أبداً في العرض.
  if (note) note.innerHTML = `${escHtml(trainsData.note || '')}<br><span class="text-slate-400">آخر مراجعة: ${escHtml(trainsData.lastReviewLabel || '')}.</span>`;
}

function renderOffersSection(isHome) {
  const section = document.getElementById('offersSection');
  const row = document.getElementById('offersRow');
  if (!section || !row) return;
  section.classList.toggle('hidden', !isHome || !state.offers.length);
  if (!isHome || !state.offers.length) return;
  row.innerHTML = state.offers.map((o) => {
    const srv = state.services.find((s) => s.id === o.serviceId);
    return `
      <button data-offer-service="${o.serviceId}" class="offer-card">
        ${o.discount ? `<span class="offer-card__discount">${escHtml(o.discount)}</span>` : ''}
        <span class="offer-card__title">${escHtml(o.title)}</span>
        <span class="offer-card__service">${escHtml(srv ? srv.name : '')}</span>
        ${o.validUntil ? `<span class="offer-card__until">ساري حتى ${escHtml(o.validUntil)}</span>` : ''}
      </button>`;
  }).join('');
  row.querySelectorAll('[data-offer-service]').forEach((b) => {
    b.addEventListener('click', () => openServiceDetails(b.dataset.offerService));
  });
}

function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id)
    ? state.favorites.filter(f => f !== id)
    : [...state.favorites, id];
  localStorage.setItem('ism_favs', JSON.stringify(state.favorites));
  // مزامنة مع الحساب إن كان مسجلاً (دون انتظار — الحفظ المحلي فوري).
  if (state.currentUser) db.setFavoriteRemote(id, state.favorites.includes(id));
  refreshUI();
}

async function handleDeleteService(id, btn) {
  if (!state.isAdmin) {
    alert('حذف الخدمات متاح من لوحة تحكم الإدارة فقط.');
    return;
  }
  armDeleteConfirm(btn, async () => {
    try {
      await db.deleteService(id);
      closeModal();
      state.services = await db.getAllServices();
      writeServicesCache(state.services);
      refreshUI();
    } catch (err) {
      alert(err.message || 'تعذر حذف الخدمة. حاول مرة أخرى.');
    }
  });
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
  const waNumber = toWhatsAppNumber(srv.whatsapp || srv.phone);
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
    <div class="detail-scroll">
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
        ${(srv.reviewsCount > 1 || srv.rating !== 5)
          ? `<span class="rating-pill" id="detailRatingPill">
          <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i>
          ${srv.rating} (${srv.reviewsCount} تقييم)
        </span>`
          : `<span class="text-[11px] font-bold text-slate-500" id="detailRatingPill">لا توجد تقييمات بعد</span>`}
      </div>

      <h3 class="text-xl font-black text-slate-900 leading-snug">${srv.name}</h3>
      <p class="text-xs text-amber-600 font-bold mt-1.5 flex items-center gap-1.5">
        <i data-lucide="${cat.icon}" class="w-3.5 h-3.5"></i>
        ${subName ? `${cat.name} • ${subName}` : cat.name}
      </p>
      ${srv.createdAt ? `<p class="text-[11px] text-slate-400 font-semibold mt-1">أُضيفت إلى الدليل في ${reviewDateText(srv.createdAt)}</p>` : ''}

      <a href="${mapHref}" target="_blank" rel="noopener" class="detail-row">
        <span class="detail-row__icon"><i data-lucide="map-pin"></i></span>
        <span class="flex-1 min-w-0">
          <span class="detail-row__title">العنوان — ${srv.area}</span>
          <span class="detail-row__sub">${srv.address}</span>
        </span>
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
        </a>
      ` : ''}

      ${srv.facebook ? `
        <a href="${srv.facebook}" target="_blank" rel="noopener" class="detail-row">
          <span class="detail-row__icon"><i data-lucide="facebook"></i></span>
          <span class="flex-1 min-w-0">
            <span class="detail-row__title">فيسبوك</span>
            <span class="detail-row__sub" dir="ltr" style="text-align:right">${srv.facebook.replace(/^https?:\/\//, '')}</span>
          </span>
        </a>
      ` : ''}

      ${tags.length ? `
        <div class="flex flex-wrap gap-1.5 mt-3">
          ${tags.map((t) => `<span class="tag-chip">${t}</span>`).join('')}
        </div>
      ` : ''}

      ${srv.menu && srv.menu.length ? `
        <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mt-4">
          <h4 class="text-xs font-bold text-amber-700 mb-2.5 flex items-center gap-1.5">
            <i data-lucide="list" class="w-4 h-4"></i>
            قائمة الأسعار / الخدمات الشائعة
          </h4>
          <div class="space-y-2">
            ${srv.menu.map(m => `
              <div class="flex justify-between text-xs border-b border-slate-200 pb-1.5 last:border-0 last:pb-0">
                <span class="text-slate-700">${m.item}</span>
                <span class="font-bold text-amber-600">${m.price}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <button id="detailFavBtn" class="detail-action detail-action--share w-full mt-2.5">
        <i data-lucide="bookmark" class="${isFav ? 'fill-amber-400 text-amber-400' : ''}"></i>
        ${isFav ? 'محفوظة ✓' : 'حفظ في المحفوظات'}
      </button>
      ${state.isAdmin ? `
        <button id="detailDelBtn" class="service-del">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          حذف من الدليل
        </button>
      ` : ''}

      <div id="serviceOffersBox"></div>

      <div class="mt-5 pt-4 border-t border-slate-200">
        <h4 class="text-sm font-extrabold text-slate-900 mb-2 flex items-center gap-1.5">
          <i data-lucide="qr-code" class="w-4 h-4 text-amber-600"></i>
          كود QR الخاص بهذه الخدمة
        </h4>
        <div class="flex items-center gap-4">
          <div id="qrBox" class="qr-box"></div>
          <div class="min-w-0">
            <p class="text-xs text-slate-600 leading-relaxed font-semibold">امسح الكود بأي موبايل لفتح صفحة الخدمة مباشرة — اطبعه والزقه على باب المحل.</p>
            <button id="qrDownloadBtn" class="mt-2.5 bg-slate-900 hover:bg-slate-700 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs transition">تحميل الكود (PNG)</button>
          </div>
        </div>
      </div>

      <div id="reviewsSection" class="mt-5 pt-4 border-t border-slate-200">
        <p class="text-xs text-slate-500 font-bold">جاري تحميل التقييمات…</p>
      </div>
    </div>
    </div>
    <div class="detail-actions-bar">
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
      ${srv.facebook ? `
        <a href="${srv.facebook}" target="_blank" rel="noopener" class="detail-action detail-action--fb">
          <i data-lucide="facebook"></i>
          فيسبوك
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
  `;
  showModal();

  document.getElementById('detailFavBtn')?.addEventListener('click', () => {
    toggleFavorite(srv.id);
    closeModal();
  });
  document.getElementById('detailDelBtn')?.addEventListener('click', (e) => handleDeleteService(srv.id, e.currentTarget));
  renderServiceQr(srv);
  renderServiceOffers(srv.id);
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

// ===== كود QR وعروض الخدمة في صفحة التفاصيل =====
function renderServiceQr(srv) {
  const box = document.getElementById('qrBox');
  if (!box || !window.QRCode) return;
  const url = `${location.origin}/services/${srv.id}.html`;
  box.innerHTML = '';
  try {
    new QRCode(box, { text: url, width: 140, height: 140, colorDark: '#0A2463', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  } catch (_) { return; }
  document.getElementById('qrDownloadBtn')?.addEventListener('click', () => {
    const canvas = box.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr-${srv.id}.png`;
    a.click();
  });
}

function renderServiceOffers(serviceId) {
  const box = document.getElementById('serviceOffersBox');
  if (!box) return;
  const offers = state.offers.filter((o) => o.serviceId === serviceId);
  if (!offers.length) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="mt-5 pt-4 border-t border-slate-200">
      <h4 class="text-sm font-extrabold text-slate-900 mb-2 flex items-center gap-1.5">
        <i data-lucide="badge-percent" class="w-4 h-4 text-amber-600"></i>
        عروض هذه الخدمة
      </h4>
      <div class="space-y-2">
        ${offers.map((o) => `
          <div class="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3">
            <p class="text-xs font-extrabold text-slate-900 flex flex-wrap items-center gap-2">
              ${o.discount ? `<span class="offer-card__discount">${escHtml(o.discount)}</span>` : ''} ${escHtml(o.title)}
            </p>
            ${o.details ? `<p class="text-xs text-slate-600 mt-1 leading-relaxed">${escHtml(o.details)}</p>` : ''}
            ${o.validUntil ? `<p class="text-[11px] text-amber-600 font-bold mt-1.5">ساري حتى ${escHtml(o.validUntil)}</p>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
  lucide.createIcons();
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
  // صحّح شارة التقييم أعلى التفاصيل: المتوسط الحقيقي إن وُجد،
  // وإلا نص صريح "لا توجد تقييمات بعد" بدل الرقم الافتراضي 5 (1).
  const pill = document.getElementById('detailRatingPill');
  if (pill) {
    if (reviews.length) {
      pill.innerHTML = `<i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i> ${avg} (${reviews.length} تقييم)`;
    } else {
      pill.textContent = 'لا توجد تقييمات بعد';
      pill.className = 'text-[11px] font-bold text-slate-500';
    }
  }
  box.innerHTML = `
    <h4 class="text-sm font-extrabold text-slate-900 mb-1 flex items-center gap-1.5">
      <i data-lucide="star" class="w-4 h-4 text-amber-600"></i>
      التقييمات ${reviews.length ? `(${reviews.length})` : ''}
      ${avg ? `<span class="text-amber-600 text-xs font-black">${avg} من 5</span>` : ''}
    </h4>
    ${reviews.length ? `
      <div class="space-y-2.5 mt-3">
        ${reviews.map(r => `
          <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-xs font-extrabold text-slate-900">${escHtml(r.userName || 'مستخدم')}</span>
              <span class="text-sm leading-none" dir="ltr">${starsHtml(r.rating)}</span>
            </div>
            <p class="text-xs text-slate-600 leading-relaxed">${escHtml(r.text)}</p>
            ${reviewDateText(r.createdAt) ? `<p class="text-[10px] text-slate-500 mt-1.5">${reviewDateText(r.createdAt)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    ` : `<p class="text-xs text-slate-500 font-semibold mt-2">لا توجد تقييمات بعد — كن أول من يقيّم هذه الخدمة.</p>`}
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
      ? `<p class="text-xs font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">تم نشر تقييمك لهذه الخدمة ✓ (${mine.rating} من 5)</p>`
      : `<p class="text-xs font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">تم إرسال تقييمك وهو بانتظار مراجعة الإدارة قبل النشر.</p>`;
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
    <p class="text-xs font-extrabold text-slate-900 mb-2">قيّم هذه الخدمة</p>
    <div id="reviewStars" class="flex gap-1 mb-2.5" dir="rtl">
      ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="text-2xl leading-none ${n <= selected ? 'text-amber-400' : 'text-slate-400'} transition active:scale-110" aria-label="${n} نجوم">★</button>`).join('')}
    </div>
    <textarea id="reviewText" rows="2" maxlength="500" placeholder="اكتب رأيك في الخدمة (اختياري لكنه يساعد غيرك)..." class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900 text-xs mb-2.5"></textarea>
    <p id="reviewError" class="hidden text-xs font-bold text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-2.5"></p>
    <button id="reviewSubmitBtn" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl text-xs transition">إرسال التقييم</button>
    <p class="text-[10px] text-slate-500 mt-2">تقييمك يظهر بعد مراجعة الإدارة.</p>
  `;
  const paintStars = () => {
    box.querySelectorAll('[data-star]').forEach(b => {
      b.classList.toggle('text-amber-400', Number(b.dataset.star) <= selected);
      b.classList.toggle('text-slate-400', Number(b.dataset.star) > selected);
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

// ===== صفحة الطوارئ: أرقام الطوارئ العامة + خدمات الطوارئ من الدليل =====
function openEmergencyModal() {
  const emergencyServices = state.services.filter((s) => s.isEmergency);
  els.modalContent.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-extrabold text-rose-600 flex items-center gap-2">
        <i data-lucide="siren" class="w-5 h-5"></i> طوارئ الإسماعيلية
      </h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-100 rounded-full text-slate-500"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <p class="text-xs text-slate-500 font-semibold mb-3">أرقام الطوارئ العامة — دوس على الرقم للاتصال مباشرة:</p>
    <div class="grid grid-cols-2 gap-2.5 mb-5">
      ${EMERGENCY_NUMBERS.map((n) => `
        <a href="tel:${n.number}" class="bg-rose-500/10 border border-rose-500/25 rounded-2xl p-3.5 flex items-center gap-3">
          <span class="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-600 flex items-center justify-center shrink-0"><i data-lucide="${n.icon}" class="w-5 h-5"></i></span>
          <span class="min-w-0">
            <span class="block text-xs font-bold text-slate-600">${n.name}</span>
            <span class="block text-lg font-black text-slate-900" dir="ltr">${n.number}</span>
          </span>
        </a>`).join('')}
    </div>
    <div class="flex justify-between items-center mb-2">
      <h4 class="text-sm font-extrabold text-slate-900">خدمات طوارئ و 24 ساعة في الدليل</h4>
      <span class="text-xs font-bold text-slate-500">${emergencyServices.length} خدمة</span>
    </div>
    ${emergencyServices.length ? `
      <div class="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
        ${emergencyServices.slice(0, 30).map((s) => `
          <button data-emg-service="${s.id}" class="w-full text-right bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-2">
            <span class="min-w-0">
              <span class="block text-xs font-extrabold text-slate-900 truncate">${escHtml(s.name)}</span>
              <span class="block text-[11px] text-slate-500 mt-0.5 truncate">${escHtml(s.area)}${s.address ? ' • ' + escHtml(s.address) : ''}</span>
            </span>
            ${s.phone ? `<span class="text-xs font-black text-emerald-600 shrink-0" dir="ltr">${escHtml(s.phone)}</span>` : ''}
          </button>`).join('')}
      </div>
      <button id="btnAllEmergency" class="w-full mt-3 bg-rose-500/10 border border-rose-500/30 text-rose-600 hover:bg-rose-500 hover:text-white font-extrabold py-3 rounded-xl text-xs transition">عرض كل خدمات الطوارئ في القائمة</button>
    ` : `<p class="text-xs text-slate-500 font-semibold">لا توجد خدمات طوارئ مسجلة حالياً.</p>`}
  `;
  showModal();
  els.modalContent.querySelectorAll('[data-emg-service]').forEach((b) => {
    b.addEventListener('click', () => { closeModal(); openServiceDetails(b.dataset.emgService); });
  });
  document.getElementById('btnAllEmergency')?.addEventListener('click', () => {
    closeModal();
    state.onlyEmergency = true;
    state.onlyFavorites = false;
    refreshUI();
    els.servicesSection.scrollIntoView({ behavior: 'smooth' });
  });
}

// ===== الخريطة: عرض الخدمات على خريطة OpenStreetMap (Leaflet) =====
let mapInstance = null;

function openMapView() {
  const section = document.getElementById('mapSection');
  if (!section) return;
  els.groupsSection.classList.add('hidden');
  els.servicesSection.classList.add('hidden');
  document.getElementById('offersSection')?.classList.add('hidden');
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth' });
  updateMapNote();
  setTimeout(initMap, 80);
}

function closeMapView() {
  document.getElementById('mapSection')?.classList.add('hidden');
  resetToHome();
}

function updateMapNote() {
  const note = document.getElementById('mapNote');
  if (!note) return;
  const plotted = state.services.filter((s) => SERVICE_LOCATIONS[s.id]).length;
  note.textContent = `${plotted} خدمة على الخريطة من أصل ${state.services.length} — المواقع تقريبية للتوجيه العام، ودوس على أي علامة لعرض تفاصيل الخدمة.`;
}

function initMap() {
  if (mapInstance || !window.L) return;
  const el = document.getElementById('map');
  if (!el) return;
  mapInstance = L.map('map').setView([30.5965, 32.2715], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapInstance);
  const bounds = [];
  state.services.forEach((srv) => {
    const loc = SERVICE_LOCATIONS[srv.id];
    if (!loc) return;
    const marker = L.marker([loc.lat, loc.lng]).addTo(mapInstance);
    marker.bindPopup(`<div style="text-align:right;direction:rtl;min-width:140px"><b>${escHtml(srv.name)}</b><br><span style="font-size:11px;color:#475569">${escHtml(srv.area || '')}</span><br><button data-map-service="${srv.id}" style="margin-top:6px;background:#2563EB;color:#fff;border:0;border-radius:8px;padding:6px 12px;font-weight:800;cursor:pointer">عرض التفاصيل</button></div>`);
    bounds.push([loc.lat, loc.lng]);
  });
  if (bounds.length) mapInstance.fitBounds(bounds, { padding: [24, 24] });
  mapInstance.on('popupopen', (e) => {
    const btn = e.popup.getElement()?.querySelector('[data-map-service]');
    btn?.addEventListener('click', () => { closeMapView(); openServiceDetails(btn.dataset.mapService); });
  });
  mapInstance.invalidateSize();
}

function openTransportModal() {
  els.modalContent.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-extrabold text-amber-600 flex items-center gap-2">
        <i data-lucide="bus" class="w-5 h-5"></i> دليل مواصلات الإسماعيلية
      </h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-100 rounded-full text-slate-500"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="space-y-2.5 max-h-80 overflow-y-auto no-scrollbar">
      ${TRANSPORT_ROUTES.map(r => `
        <div class="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex justify-between items-center">
          <div>
            <p class="text-xs font-bold text-slate-900">${r.from} ⇄ ${r.to}</p>
            <p class="text-[11px] text-slate-500 mt-0.5">${r.line} • ${r.time}</p>
          </div>
          <span class="bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2.5 py-1 rounded-lg text-xs font-extrabold">${r.fare}</span>
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
      <h3 class="text-lg font-extrabold text-amber-600 flex items-center gap-2">
        <i data-lucide="messages-square" class="w-5 h-5"></i> تواصل معنا
      </h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-100 rounded-full text-slate-500"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <p class="text-xs text-slate-500 font-semibold mb-4 leading-relaxed">لإضافة خدمتك للدليل، أو تصحيح بيانات خدمة موجودة، أو الاستفسار عن الإعلانات — تواصل مع إدارة الدليل:</p>
    <div class="space-y-2.5">
      <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0"><i data-lucide="user-round" class="w-5 h-5"></i></div>
        <div>
          <p class="text-[11px] text-slate-500 font-bold">مسؤول الموقع</p>
          <p class="text-sm text-slate-900 font-extrabold">Ahmed Attia</p>
        </div>
      </div>
      <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0"><i data-lucide="building-2" class="w-5 h-5"></i></div>
        <div>
          <p class="text-[11px] text-slate-500 font-bold">الشركة المؤسسة</p>
          <p class="text-sm text-slate-900 font-extrabold">Nexora</p>
        </div>
      </div>
      <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0"><i data-lucide="phone" class="w-5 h-5"></i></div>
          <div>
            <p class="text-[11px] text-slate-500 font-bold">رقم مسؤول الموقع</p>
            <p class="text-sm text-slate-900 font-extrabold" dir="ltr">01121341717</p>
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          <a href="https://wa.me/201121341717" target="_blank" rel="noopener" class="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95"><i data-lucide="message-circle" class="w-4 h-4"></i> واتساب</a>
          <a href="tel:01121341717" class="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95"><i data-lucide="phone-call" class="w-4 h-4"></i> اتصال</a>
        </div>
      </div>
      <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0"><i data-lucide="phone" class="w-5 h-5"></i></div>
          <div>
            <p class="text-[11px] text-slate-500 font-bold">رقم إضافي للتواصل</p>
            <p class="text-sm text-slate-900 font-extrabold" dir="ltr">01117543009</p>
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          <a href="https://wa.me/201117543009" target="_blank" rel="noopener" class="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95"><i data-lucide="message-circle" class="w-4 h-4"></i> واتساب</a>
          <a href="tel:01117543009" class="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95"><i data-lucide="phone-call" class="w-4 h-4"></i> اتصال</a>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <a href="https://www.facebook.com/share/1HtWFUyNba/" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 bg-sky-600/20 border border-sky-500/30 text-sky-600 py-3 rounded-xl text-xs font-bold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          فيسبوك
        </a>
        <a href="https://www.instagram.com/nexoraa_egypt" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 bg-pink-600/20 border border-pink-500/30 text-pink-600 py-3 rounded-xl text-xs font-bold">
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
      <h3 class="text-lg font-extrabold text-amber-600">إضافة خدمة جديدة للدليل</h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-100 rounded-full text-slate-500"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    ${state.isAdmin ? '' : `<p class="text-xs text-slate-600 font-semibold bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 mb-3 leading-relaxed">طلبك يصل لإدارة الدليل ويراجَع قبل النشر — ارفع صورة محلك من جهازك بالأسفل، أو الصق رابط صورة مباشر.</p>`}
    <form id="addServiceForm" class="space-y-3 text-xs">
      <input type="text" name="name" required placeholder="اسم النشاط التجاري / العيادة" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
      <div class="grid grid-cols-2 gap-2">
        <select name="category" id="addGroupSelect" class="bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
          ${GROUPS.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
        </select>
        <select name="subcategory" id="addSubSelect" class="bg-white border border-slate-300 rounded-xl p-3 text-slate-900"></select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <select name="area" class="bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
          ${AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <input type="text" name="address" placeholder="العنوان التفصيلي (اختياري إن لم يكن مؤكداً)" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
      <div class="grid grid-cols-2 gap-2">
        <input type="tel" name="phone" required placeholder="رقم الهاتف" class="bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
        <input type="tel" name="whatsapp" placeholder="واتساب (2010...)" class="bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
      </div>
      <div class="bg-white border border-slate-300 rounded-xl p-3">
        <p class="font-bold text-slate-700 mb-2">صورة المحل</p>
        <label for="addPhotoInput" class="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl cursor-pointer transition">
          <i data-lucide="image-plus" class="w-4 h-4"></i> اختر صورة من جهازك
        </label>
        <input type="file" id="addPhotoInput" accept="image/*" class="hidden">
        <img id="addPhotoPreview" class="hidden w-full max-h-44 object-contain bg-white rounded-xl mt-2" alt="معاينة صورة المحل">
        <button type="button" id="addPhotoRemove" class="hidden mt-2 text-rose-600 font-bold">إزالة الصورة</button>
        <input type="url" name="imageUrl" placeholder="أو الصق رابط صورة مباشر (اختياري)" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900 mt-2" dir="ltr">
      </div>
      <input type="text" name="tags" placeholder="كلمات مفتاحية (مثال: دليفري، كشف، صيانة)" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
      <label class="flex items-center gap-2 text-slate-600 py-1">
        <input type="checkbox" name="isEmergency" class="accent-amber-500"> متاح طوارئ / 24 ساعة
      </label>
      <button type="submit" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl transition">${state.isAdmin ? 'حفظ ونشر الخدمة فوراً' : 'إرسال الطلب للمراجعة'}</button>
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

  // اختيار صورة من الجهاز: معاينة فورية + تحقق من النوع والحجم (10MB).
  let addPhotoFile = null;
  const photoInput = document.getElementById('addPhotoInput');
  const photoPreview = document.getElementById('addPhotoPreview');
  const photoRemove = document.getElementById('addPhotoRemove');
  photoInput.addEventListener('change', () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('اختر ملف صورة (JPG أو PNG أو WebP).'); photoInput.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { alert('حجم الصورة كبير — الحد الأقصى 10 ميجا.'); photoInput.value = ''; return; }
    addPhotoFile = file;
    photoPreview.src = URL.createObjectURL(file);
    photoPreview.classList.remove('hidden');
    photoRemove.classList.remove('hidden');
  });
  photoRemove.addEventListener('click', () => {
    addPhotoFile = null;
    photoInput.value = '';
    photoPreview.src = '';
    photoPreview.classList.add('hidden');
    photoRemove.classList.add('hidden');
  });

  document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    // تجهيز الصورة المختارة أولاً (إن وجدت): تُصغَّر داخل المتصفح
    // وتُحفظ مع الطلب — بدون رفع خارجي (Firebase Storage غير متاح
    // على الخطة المجانية). رابطها يصبح صورة الطلب.
    let uploadedImageUrl = '';
    if (addPhotoFile) {
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'جارٍ تجهيز الصورة…';
      try {
        uploadedImageUrl = await downscaleImageToDataUrl(addPhotoFile, 900, 0.72);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = state.isAdmin ? 'حفظ ونشر الخدمة فوراً' : 'إرسال الطلب للمراجعة';
        alert(err.message || 'تعذر رفع الصورة. حاول مرة أخرى.');
        return;
      }
      submitBtn.disabled = false;
      submitBtn.textContent = state.isAdmin ? 'حفظ ونشر الخدمة فوراً' : 'إرسال الطلب للمراجعة';
    }
    const payload = {
      name: fd.get('name'),
      category: fd.get('category'),
      subcategory: fd.get('subcategory') || '',
      area: fd.get('area'),
      address: fd.get('address'),
      phone: fd.get('phone'),
      whatsapp: fd.get('whatsapp'),
      imageUrl: uploadedImageUrl || fd.get('imageUrl') || '',
      tags: fd.get('tags') || 'خدمات عامة',
      isEmergency: fd.get('isEmergency') === 'on',
      openHour: fd.get('isEmergency') === 'on' ? 0 : 9,
      closeHour: fd.get('isEmergency') === 'on' ? 24 : 23
    };

    // الأدمن المسجل ينشر مباشرة في Firestore.
    if (auth.currentUser && isAdmin(auth.currentUser)) {
      try {
        await db.addService(payload);
      } catch (err) {
        alert(err.message || 'تعذر نشر الخدمة. حاول مرة أخرى.');
        return;
      }
      state.services = await db.getAllServices();
      writeServicesCache(state.services);
      closeModal();
      refreshUI();
      return;
    }

    // مستخدم مسجل (غير أدمن): طلبه يذهب لقائمة مراجعة الأدمن ولا يُنشر مباشرة.
    if (auth.currentUser) {
      try {
        await db.submitService({
          ...payload,
          submitterName: (state.profile && state.profile.name) || '',
          submitterPhone: (state.profile && state.profile.phone) || ''
        });
      } catch (err) {
        alert(err.message || 'تعذر إرسال الطلب. حاول مرة أخرى.');
        return;
      }
      closeModal();
      alert('تم إرسال طلبك لإدارة الدليل ✓ — سيراجعه الأدمن قبل النشر. شكراً لمشاركتك!');
      return;
    }

    // زائر غير مسجل: يسجل دخول أولاً (الحساب مجاني) ثم يرسل طلبه.
    closeModal();
    alert('سجّل دخولك أولاً لإرسال طلب إضافة خدمة — الحساب مجاني ويأخذ أقل من دقيقة.');
    openAuthModal('signup');
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
      <h3 class="text-lg font-extrabold text-amber-600">حسابك في دليل الإسماعيلية</h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-100 rounded-full text-slate-500"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-4">
      <button id="tabLogin" class="py-2.5 rounded-xl text-xs font-extrabold transition ${mode === 'login' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'}">تسجيل الدخول</button>
      <button id="tabSignup" class="py-2.5 rounded-xl text-xs font-extrabold transition ${mode === 'signup' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'}">إنشاء حساب</button>
    </div>
    <p id="authError" class="hidden text-xs font-bold text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-3"></p>

    <form id="loginForm" class="space-y-3 text-xs ${mode === 'signup' ? 'hidden' : ''}">
      <input type="tel" name="phone" required dir="ltr" placeholder="رقم الموبايل (01xxxxxxxxx)" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900 text-right">
      <input type="password" name="password" required placeholder="كلمة السر" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
      <button type="submit" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl transition">دخول</button>
    </form>

    <form id="signupForm" class="space-y-3 text-xs ${mode === 'login' ? 'hidden' : ''}">
      <input type="text" name="name" required placeholder="الاسم بالكامل" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
      <input type="tel" name="phone" required dir="ltr" placeholder="رقم الموبايل (01xxxxxxxxx)" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900 text-right">
      <input type="email" name="email" placeholder="البريد الإلكتروني (اختياري)" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
      <input type="password" name="password" required minlength="6" placeholder="كلمة السر (6 أحرف على الأقل)" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
      <input type="password" name="confirmPassword" required minlength="6" placeholder="تأكيد كلمة السر" class="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900">
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
      <h3 class="text-lg font-extrabold text-amber-600">حسابي</h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-100 rounded-full text-slate-500"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 space-y-2 text-xs">
      <p class="text-slate-900 font-extrabold text-sm">${p ? p.name : (state.isAdmin ? 'الأدمن' : 'مستخدم')}</p>
      ${p && p.phone ? `<p class="text-slate-600">📱 ${p.phone}</p>` : ''}
      ${p && p.email ? `<p class="text-slate-600">✉️ ${p.email}</p>` : ''}
      ${state.isAdmin ? '<p class="text-amber-600 font-bold">حساب إدارة الدليل</p>' : ''}
    </div>
    <a href="owner.html" class="block text-center w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl text-xs transition mb-2">لوحة صاحب النشاط</a>
    <button id="btnLogout" class="w-full bg-rose-500/10 border border-rose-500/30 text-rose-600 hover:bg-rose-500 hover:text-white font-extrabold py-3 rounded-xl text-xs transition">تسجيل الخروج</button>
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
  if (location.hash.startsWith('#service-')) {
    const g = state.activeCategory;
    history.replaceState(null, '', g && g !== 'all' ? `#group-${g}` : location.pathname + location.search);
  }
}

initApp();
