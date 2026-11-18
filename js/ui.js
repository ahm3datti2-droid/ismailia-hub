import { CATEGORIES, GROUPS, subcategoryInfo } from './config.js';

export function getOpenStatus(openHour, closeHour) {
  if (openHour === 0 && closeHour === 24) {
    return { isOpen: true, text: 'مفتوح 24 ساعة', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  }
  const now = new Date().getHours();
  const isOpen = closeHour < openHour
    ? (now >= openHour || now < closeHour)
    : (now >= openHour && now < closeHour);

  return isOpen
    ? { isOpen: true, text: 'مفتوح الآن', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }
    : { isOpen: false, text: `مغلق (يفتح ${openHour}:00)`, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
}

export function categoryInfo(id) {
  return CATEGORIES.find((c) => c.id === id) || { id, name: id, icon: 'layout-grid' };
}

export function subcategoryName(groupId, subId) {
  if (!subId) return '';
  return (subcategoryInfo(groupId, subId) || {}).name || '';
}

export function renderCategories(container, activeCat, onSelect) {
  container.innerHTML = CATEGORIES.map(cat => {
    const active = cat.id === activeCat;
    return `
      <button data-cat="${cat.id}" aria-pressed="${active}" class="cat-btn flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
        active
          ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 scale-[1.02]'
          : 'bg-slate-900/90 text-slate-300 border border-slate-800 hover:border-slate-700'
      }">
        <i data-lucide="${cat.icon}" class="w-4 h-4"></i>
        <span>${cat.name}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => onSelect(btn.dataset.cat));
  });
  lucide.createIcons();
}

// صف التصنيفات الفرعية — يظهر فقط عند اختيار قسم رئيسي له فروع.
export function renderSubcategories(container, groupId, activeSub, onSelect) {
  const group = GROUPS.find((g) => g.id === groupId);
  if (!group || !group.subs || !group.subs.length) {
    container.innerHTML = '';
    return;
  }
  const chips = [{ id: 'all', name: 'الكل' }, ...group.subs];
  container.innerHTML = chips.map((sub) => {
    const active = sub.id === activeSub;
    return `
      <button data-sub="${sub.id}" aria-pressed="${active}" class="sub-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
        active
          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
          : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:border-slate-600'
      }">
        <span>${sub.name}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.sub-btn').forEach(btn => {
    btn.addEventListener('click', () => onSelect(btn.dataset.sub));
  });
}

/* بطاقات هيكلية أثناء تحميل Firestore — نفس بنية البطاقة الأفقية */
export function renderSkeleton(container, count = 6) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="flex items-start gap-3">
        <div class="skeleton-thumb"></div>
        <div class="flex-1 space-y-2 pt-1">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line skeleton-line--short"></div>
          <div class="skeleton-line skeleton-line--long"></div>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2 mt-3">
        <div class="skeleton-line" style="height:2.5rem"></div>
        <div class="skeleton-line" style="height:2.5rem"></div>
        <div class="skeleton-line" style="height:2.5rem"></div>
      </div>
    </div>
  `).join('');
}

export function renderErrorState(container, onRetry) {
  container.innerHTML = `
    <div class="error-state">
      <div class="state-icon"><i data-lucide="wifi-off" class="text-rose-400"></i></div>
      <p class="text-white text-sm font-extrabold mb-1">تعذر تحميل الخدمات</p>
      <p class="text-slate-400 text-xs font-semibold mb-4">تحقق من اتصالك بالإنترنت وحاول مرة أخرى.</p>
      <button data-retry class="bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2.5 rounded-xl text-xs font-extrabold transition active:scale-95">
        إعادة المحاولة
      </button>
    </div>
  `;
  container.querySelector('[data-retry]')?.addEventListener('click', onRetry);
  lucide.createIcons();
}

export function renderServiceCards(container, services, favorites, isAdmin, handlers) {
  if (!services.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="state-icon"><i data-lucide="search-x" class="text-slate-500"></i></div>
        <p class="text-white text-sm font-extrabold mb-1">لا توجد خدمات مطابقة لبحثك</p>
        <p class="text-slate-400 text-xs font-semibold mb-4">جرّب كلمة بحث مختلفة أو غيّر التصنيف والمنطقة.</p>
        <button data-clear-filters class="bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2.5 rounded-xl text-xs font-extrabold transition active:scale-95">
          مسح كل الفلاتر
        </button>
      </div>
    `;
    container.querySelector('[data-clear-filters]')?.addEventListener('click', () => handlers.onClearFilters?.());
    lucide.createIcons();
    return;
  }
  container.innerHTML = services.map(srv => {
    const status = getOpenStatus(srv.openHour, srv.closeHour);
    const isFav = favorites.includes(srv.id);
    const cat = categoryInfo(srv.category);
    const subName = subcategoryName(srv.category, srv.subcategory);
    const waMsg = encodeURIComponent(`مرحباً ${srv.name}، وصلت لحضرتك عبر دليل خدمات الإسماعيلية.`);
    const waNumber = String(srv.whatsapp || srv.phone || '').replace(/\D/g, '');

    return `
      <article class="service-card ${srv.isEmergency ? 'service-card--emergency' : ''} relative">
        <div class="service-top">
          ${srv.imageUrl ? `
            <div class="service-thumb" data-open-details="${srv.id}">
              <img src="${srv.imageUrl}" alt="${srv.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.service-thumb').remove()">
              ${srv.isEmergency ? '<span class="service-thumb__emg">طوارئ</span>' : ''}
            </div>
          ` : `
            <div class="service-thumb service-thumb--fallback" data-open-details="${srv.id}">
              <i data-lucide="${cat.icon}"></i>
            </div>
          `}
          <div class="service-main">
            <div class="service-head">
              <h3 class="service-name" data-open-details="${srv.id}">${srv.name}${srv.verified ? ' <i data-lucide="badge-check" class="service-verified"></i>' : ''}</h3>
              <button data-fav="${srv.id}" aria-label="حفظ الخدمة" class="service-fav ${isFav ? 'service-fav--on' : ''}">
                <i data-lucide="bookmark" class="w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}"></i>
              </button>
            </div>
            <p class="service-cat">${subName || cat.name}</p>
            ${srv.address ? `
              <p class="service-addr">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 shrink-0"></i>
                <span>${srv.address}</span>
              </p>
            ` : ''}
            <p class="service-meta">
              ${(srv.reviewsCount > 1 || srv.rating !== 5) ? `
                <span class="service-meta__rating">
                  <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i>
                  ${srv.rating} (${srv.reviewsCount})
                </span>
              ` : '<span>جديد</span>'}
              <span class="service-meta__dot" aria-hidden="true">•</span>
              <span class="${status.isOpen ? 'text-emerald-400' : 'text-rose-400'}">${status.text}</span>
              <span class="service-meta__dot" aria-hidden="true">•</span>
              <span>${srv.area}</span>
            </p>
          </div>
        </div>

        <div class="service-actions">
          <a href="https://wa.me/${waNumber}?text=${waMsg}" target="_blank" rel="noopener"
            class="service-btn service-btn--wa">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
            واتساب
          </a>
          <a href="tel:${srv.phone}"
            class="service-btn service-btn--call">
            <i data-lucide="phone" class="w-4 h-4"></i>
            اتصال
          </a>
          <button data-open-details="${srv.id}"
            class="service-btn service-btn--details">
            التفاصيل
          </button>
        </div>
        ${isAdmin ? `
          <button data-del="${srv.id}" class="service-del">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            حذف من الدليل
          </button>
        ` : ''}
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-open-details]').forEach(el => {
    el.addEventListener('click', () => handlers.onDetails(el.dataset.openDetails));
  });
  container.querySelectorAll('[data-fav]').forEach(el => {
    el.addEventListener('click', () => handlers.onToggleFav(el.dataset.fav));
  });
  container.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', () => handlers.onDelete(el.dataset.del));
  });

  lucide.createIcons();
}
