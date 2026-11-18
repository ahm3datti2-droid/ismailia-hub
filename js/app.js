import { AREAS, TRANSPORT_ROUTES } from './config.js';
import { db } from './database.js';
import { renderCategories, renderServiceCards, getOpenStatus } from './ui.js';
import { auth, onAuthStateChanged, isAdmin } from './firebase.js';

const state = {
  services: [],
  activeCategory: 'all',
  selectedArea: 'all',
  searchQuery: '',
  onlyEmergency: false,
  onlyFavorites: false,
  isAdmin: false,
  favorites: JSON.parse(localStorage.getItem('ism_favs')) || []
};

const els = {
  categories: document.getElementById('categoriesContainer'),
  areaSelect: document.getElementById('areaFilter'),
  searchInput: document.getElementById('searchInput'),
  servicesGrid: document.getElementById('servicesGrid'),
  resultsCount: document.getElementById('resultsCount'),
  sectionTitle: document.getElementById('sectionTitle'),
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
  onAuthStateChanged(auth, (user) => {
    const wasAdmin = state.isAdmin;
    state.isAdmin = isAdmin(user);
    if (wasAdmin !== state.isAdmin) refreshUI();
  });

  state.services = await db.getAllServices();
  bindEvents();
  refreshUI();
}

function bindEvents() {
  els.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    refreshUI();
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

  document.getElementById('btnHome').addEventListener('click', () => {
    state.activeCategory = 'all';
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

  document.getElementById('btnSaved').addEventListener('click', () => {
    state.onlyFavorites = !state.onlyFavorites;
    state.onlyEmergency = false;
    els.sectionTitle.textContent = state.onlyFavorites ? 'الخدمات المحفوظة' : 'أبرز الخدمات في الإسماعيلية';
    refreshUI();
  });

  document.getElementById('btnAddService').addEventListener('click', openAddServiceModal);
  // زر الإدارة يفتح لوحة التحكم — الدخول فيها عبر Firebase Auth فقط.
  document.getElementById('btnAdminToggle').addEventListener('click', () => {
    window.location.href = 'admin.html';
  });
  document.getElementById('closeModalBackdrop').addEventListener('click', closeModal);
}

function refreshUI() {
  renderCategories(els.categories, state.activeCategory, (catId) => {
    state.activeCategory = catId;
    state.onlyEmergency = false;
    state.onlyFavorites = false;
    refreshUI();
  });

  const filtered = state.services.filter(srv => {
    const matchCat = state.activeCategory === 'all' || srv.category === state.activeCategory;
    const matchArea = state.selectedArea === 'all' || srv.area === state.selectedArea;
    const matchEmerg = !state.onlyEmergency || srv.isEmergency;
    const matchFav = !state.onlyFavorites || state.favorites.includes(srv.id);
    const matchQuery = !state.searchQuery ||
      srv.name.toLowerCase().includes(state.searchQuery) ||
      srv.area.toLowerCase().includes(state.searchQuery) ||
      srv.tags.toLowerCase().includes(state.searchQuery) ||
      srv.address.toLowerCase().includes(state.searchQuery);

    return matchCat && matchArea && matchEmerg && matchFav && matchQuery;
  });

  els.resultsCount.textContent = `${filtered.length} خدمة`;

  renderServiceCards(els.servicesGrid, filtered, state.favorites, state.isAdmin, {
    onDetails: openServiceDetails,
    onToggleFav: (id) => {
      state.favorites = state.favorites.includes(id)
        ? state.favorites.filter(f => f !== id)
        : [...state.favorites, id];
      localStorage.setItem('ism_favs', JSON.stringify(state.favorites));
      refreshUI();
    },
    onDelete: async (id) => {
      if (!state.isAdmin) {
        alert('حذف الخدمات متاح من لوحة تحكم الإدارة فقط.');
        return;
      }
      if (confirm('هل أنت متأكد من حذف هذه الخدمة نهائياً؟')) {
        try {
          await db.deleteService(id);
          state.services = await db.getAllServices();
          refreshUI();
        } catch (err) {
          alert(err.message || 'تعذر حذف الخدمة. حاول مرة أخرى.');
        }
      }
    }
  });
}

function openServiceDetails(id) {
  const srv = state.services.find(s => s.id === id);
  if (!srv) return;
  const status = getOpenStatus(srv.openHour, srv.closeHour);

  els.modalContent.innerHTML = `
    <div class="flex justify-between items-start mb-4">
      <div>
        <span class="text-xs font-bold px-2.5 py-1 rounded-lg border ${status.color}">${status.text}</span>
        <h3 class="text-xl font-extrabold text-white mt-2">${srv.name}</h3>
        <p class="text-xs text-slate-400 mt-1">${srv.area} - ${srv.address}</p>
      </div>
      <button id="closeModalBtn" class="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    ${srv.menu && srv.menu.length ? `
      <div class="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 mb-4">
        <h4 class="text-xs font-bold text-amber-400 mb-2.5">قائمة الأسعار / الخدمات الشائعة:</h4>
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

    <div class="grid grid-cols-2 gap-3">
      <a href="${srv.mapUrl || '#'}" target="_blank" class="flex items-center justify-center gap-2 bg-sky-600/20 border border-sky-500/30 text-sky-400 py-3 rounded-xl text-xs font-bold">
        <i data-lucide="navigation" class="w-4 h-4"></i>
        الموقع على الخريطة
      </a>
      <a href="tel:${srv.phone}" class="flex items-center justify-center gap-2 bg-amber-500 text-slate-950 py-3 rounded-xl text-xs font-bold">
        <i data-lucide="phone-call" class="w-4 h-4"></i>
        اتصال مباشر
      </a>
    </div>
  `;
  showModal();
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

function openAddServiceModal() {
  els.modalContent.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-extrabold text-amber-400">إضافة خدمة جديدة للدليل</h3>
      <button id="closeModalBtn" class="p-1.5 bg-slate-800 rounded-full text-slate-400"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <form id="addServiceForm" class="space-y-3 text-xs">
      <input type="text" name="name" required placeholder="اسم النشاط التجاري / العيادة" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
      <div class="grid grid-cols-2 gap-2">
        <select name="category" class="bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          <option value="medical">عيادات وصيدليات</option>
          <option value="food">مطاعم وكافيهات</option>
          <option value="maintenance">صيانة وحرفيين</option>
          <option value="cars">خدمات سيارات</option>
          <option value="real_estate">عقارات</option>
        </select>
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

  document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      category: fd.get('category'),
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

function showModal() {
  els.modal.classList.remove('hidden');
  els.modal.classList.add('flex');
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  lucide.createIcons();
}

function closeModal() {
  els.modal.classList.add('hidden');
  els.modal.classList.remove('flex');
}

initApp();
