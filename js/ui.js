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

/* بطاقات هيكلية أثناء تحميل Firestore — ارتفاع ثابت يمنع قفز التخطيط */
export function renderSkeleton(container, count = 6) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-photo"></div>
      <div class="flex items-center gap-3 mb-3">
        <div class="skeleton-line" style="width:2.75rem;height:2.75rem;border-radius:0.9rem"></div>
        <div class="flex-1 space-y-2">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line skeleton-line--short"></div>
        </div>
      </div>
      <div class="skeleton-line skeleton-line--long mb-2"></div>
      <div class="skeleton-line skeleton-line--short mb-4"></div>
      <div class="grid grid-cols-12 gap-2">
        <div class="skeleton-line col-span-5" style="height:2.5rem"></div>
        <div class="skeleton-line col-span-4" style="height:2.5rem"></div>
        <div class="skeleton-line col-span-3" style="height:2.5rem"></div>
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
    const tags = String(srv.tags || '').split('،').map((t) => t.trim()).filter(Boolean).slice(0, 3);

    return `
      <article class="service-card ${srv.isEmergency ? 'service-card--emergency' : ''} relative">
        ${srv.imageUrl ? `<div class="service-photo" data-open-details="${srv.id}"><img src="${srv.imageUrl}" alt="${srv.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.service-photo').remove()"></div>` : ''}
        <div class="flex items-start gap-3 mb-3">
          <div class="service-avatar" aria-hidden="true">
            <i data-lucide="${cat.icon}"></i>
          </div>
          <div class="cursor-pointer flex-1 min-w-0" data-open-details="${srv.id}">
            <div class="flex flex-wrap items-center gap-1.5 mb-1">
              <span class="badge badge--area">${srv.area}</span>
              <span class="badge border ${status.color}">${status.text}</span>
              ${srv.isEmergency ? '<span class="badge badge--emergency"><i data-lucide="siren" class="w-3 h-3"></i> طوارئ</span>' : ''}
            </div>
            <h3 class="service-name font-extrabold text-white leading-snug">${srv.name}</h3>
            <p class="text-[11px] text-slate-400 font-semibold mt-0.5">${subName ? `${cat.name} • ${subName}` : cat.name}</p>
          </div>
          <button data-fav="${srv.id}" aria-label="حفظ الخدمة" class="p-2 rounded-full bg-slate-800/70 text-slate-400 hover:text-amber-400 transition shrink-0">
            <i data-lucide="bookmark" class="w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}"></i>
          </button>
        </div>

        <div class="flex items-start justify-between gap-2 mb-2">
          <p class="text-xs text-slate-400 flex items-start gap-1.5 leading-relaxed">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-500/80 shrink-0 mt-0.5"></i>
            <span>${srv.address}</span>
          </p>
          ${srv.verified ? '<span class="badge badge--verified shrink-0"><i data-lucide="badge-check" class="w-3.5 h-3.5"></i> موثق</span>' : ''}
        </div>

        <div class="flex items-center justify-between gap-2 text-[11px] mb-3.5">
          <span class="flex flex-wrap gap-1 min-w-0">${tags.map((t) => `<span class="tag-chip">${t}</span>`).join('')}</span>
          <span class="rating-pill shrink-0">
            <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i>
            ${srv.rating} (${srv.reviewsCount})
          </span>
        </div>

        <div class="grid grid-cols-12 gap-2 mt-auto">
          <a href="https://wa.me/${srv.whatsapp}?text=${waMsg}" target="_blank" rel="noopener"
            class="col-span-5 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-bold transition active:scale-95">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
            واتساب
          </a>
          <a href="tel:${srv.phone}"
            class="col-span-4 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl text-xs font-bold transition active:scale-95">
            <i data-lucide="phone" class="w-4 h-4"></i>
            اتصال
          </a>
          <button data-open-details="${srv.id}"
            class="col-span-3 flex items-center justify-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 py-2.5 rounded-xl text-xs font-bold hover:bg-amber-500 hover:text-slate-950 transition active:scale-95">
            التفاصيل
          </button>
          ${isAdmin ? `
            <button data-del="${srv.id}" aria-label="حذف الخدمة" class="col-span-12 flex items-center justify-center gap-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white py-2 rounded-xl text-xs font-bold transition">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
              حذف من الدليل
            </button>
          ` : ''}
        </div>
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
