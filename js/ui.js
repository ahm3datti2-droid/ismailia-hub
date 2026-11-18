import { CATEGORIES } from './config.js';

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

export function renderCategories(container, activeCat, onSelect) {
  container.innerHTML = CATEGORIES.map(cat => {
    const active = cat.id === activeCat;
    return `
      <button data-cat="${cat.id}" class="cat-btn flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
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
}

export function renderServiceCards(container, services, favorites, isAdmin, handlers) {
  if (!services.length) {
    container.innerHTML = `
      <div class="text-center py-14 bg-slate-900/40 rounded-3xl border border-slate-800/80">
        <i data-lucide="search-x" class="w-10 h-10 text-slate-600 mx-auto mb-2"></i>
        <p class="text-slate-400 text-sm font-semibold">لا توجد خدمات مطابقة لبحثك حالياً</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = services.map(srv => {
    const status = getOpenStatus(srv.openHour, srv.closeHour);
    const isFav = favorites.includes(srv.id);
    const waMsg = encodeURIComponent(`مرحباً ${srv.name}، وصلت لحضرتك عبر دليل خدمات الإسماعيلية.`);

    return `
      <article class="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 transition hover:border-amber-500/40 relative group">
        <div class="flex justify-between items-start gap-2 mb-2">
          <div class="cursor-pointer flex-1" data-open-details="${srv.id}">
            <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-amber-400">${srv.area}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-md border ${status.color}">${status.text}</span>
              ${srv.verified ? '<span class="text-[10px] text-sky-400 flex items-center gap-0.5 font-bold"><i data-lucide="badge-check" class="w-3.5 h-3.5"></i> موثق</span>' : ''}
            </div>
            <h3 class="font-extrabold text-base text-white group-hover:text-amber-300 transition">${srv.name}</h3>
          </div>

          <div class="flex items-center gap-1">
            <button data-fav="${srv.id}" class="p-2 rounded-full bg-slate-800/70 text-slate-400 hover:text-amber-400 transition">
              <i data-lucide="bookmark" class="w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}"></i>
            </button>
            ${isAdmin ? `
              <button data-del="${srv.id}" class="p-2 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition" title="حذف">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>
        </div>

        <p class="text-xs text-slate-400 flex items-center gap-1.5 mb-2">
          <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-500/80 shrink-0"></i>
          <span>${srv.address}</span>
        </p>

        <div class="flex items-center justify-between text-[11px] text-slate-500 mb-3.5">
          <span class="truncate max-w-[70%]">${srv.tags}</span>
          <span class="flex items-center gap-1 text-amber-400 font-bold">
            <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i>
            ${srv.rating} (${srv.reviewsCount})
          </span>
        </div>

        <div class="grid grid-cols-12 gap-2">
          <a href="https://wa.me/${srv.whatsapp}?text=${waMsg}" target="_blank"
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
            class="col-span-3 flex items-center justify-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 py-2.5 rounded-xl text-xs font-bold hover:bg-amber-500 hover:text-slate-950 transition">
            التفاصيل
          </button>
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