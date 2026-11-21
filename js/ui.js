import { CATEGORIES, GROUPS, subcategoryInfo } from './config.js';

// تأكيد حذف بخطوتين داخل الزر نفسه: الضغطة الأولى تحوّل الزر
// إلى "تأكيد الحذف؟" لمدة 4 ثوانٍ، والثانية تنفّذ الحذف.
// (نوافذ confirm() الأصلية لا تظهر موثوقاً في بعض المتصفحات
// المدمجة داخل التطبيقات، فتتوقف أزرار الحذف عن العمل بصمت.)
export function armDeleteConfirm(btn, action) {
  if (!btn) return;
  if (btn.dataset.armed === '1') {
    delete btn.dataset.armed;
    btn.disabled = true;
    btn.style.opacity = '0.6';
    action();
    return;
  }
  btn.dataset.armed = '1';
  btn.dataset.origText = btn.textContent;
  btn.textContent = 'تأكيد الحذف؟';
  setTimeout(() => {
    if (btn.dataset.armed === '1') {
      delete btn.dataset.armed;
      btn.textContent = btn.dataset.origText || 'حذف';
    }
  }, 4000);
}

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

/* بلاطات الأقسام في الصفحة الرئيسية: الأقسام الـ 11 + بلاطة "كل الخدمات".
   كل بلاطة تعرض أيقونة القسم واسمه وعدد خدماته، والضغط عليها يفتح خدماته. */
export function renderGroupTiles(container, groups, counts, total, onSelect) {
  const tiles = [
    ...groups.map(g => ({ id: g.id, name: g.name, icon: g.icon, count: counts[g.id] || 0 })),
    { id: 'all', name: 'كل الخدمات', icon: 'layout-grid', count: total }
  ];
  container.innerHTML = tiles.map(t => `
    <button data-group="${t.id}" class="group-tile ${t.id === 'all' ? 'group-tile--all' : ''}">
      <span class="group-tile__icon"><i data-lucide="${t.icon}"></i></span>
      <span class="group-tile__name">${t.name}</span>
      <span class="group-tile__count">${t.count} خدمة</span>
    </button>
  `).join('');
  container.querySelectorAll('[data-group]').forEach(el => {
    el.addEventListener('click', () => onSelect(el.dataset.group));
  });
  lucide.createIcons();
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

// رقم واتساب بالصيغة الدولية: wa.me يرفض الصفر البادئ،
// فأي رقم مصري يبدأ بـ 0 يتحول لـ 20 (مثال: 0102… ← 20102…).
export function toWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) return '20' + digits.slice(1);
  return digits;
}

// تصغير صورة من الجهاز إلى Data URL (JPEG) داخل المتصفح نفسه.
// بديل مجاني لرفع الصور: Firebase Storage يحتاج خطة Blaze المدفوعة،
// فبدلاً من الرفع لخادم خارجي تُصغَّر الصورة وتُحفظ كسلسلة نصية
// داخل مستند الخدمة/الطلب في Firestore (عادة 60–150KB).
// - maxDim: أطول ضلع بالبكسل (900 للخدمات، 1200 لصور الإعلانات العريضة).
// - quality: جودة JPEG (0.72).
// - الخلفية البيضاء تملأ فراغات PNG الشفافة حتى لا تظهر سوداء.
export function downscaleImageToDataUrl(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('اختر ملف صورة (JPG أو PNG أو WebP).'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('حجم الصورة كبير — الحد الأقصى 10 ميجا.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (_) {
        URL.revokeObjectURL(url);
        reject(new Error('تعذرت معالجة الصورة. جرّب صورة أخرى.'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذرت قراءة الصورة. جرّب صورة أخرى.'));
    };
    img.src = url;
  });
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
  // شارة "الأعلى تقييماً": أفضل 3 خدمات في القايمة المعروضة حالياً
  // (تقييم 4+ وبتقييمات حقيقية) — نسبية، لأن مفيش خدمة في الدليل
  // واصلة 4.5+ فحدّ ثابت كان هيخلي الشارة ماتظهرش أبداً.
  const topRatedIds = new Set(
    services
      .filter((s) => (s.reviewsCount > 1 || s.rating !== 5) && Number(s.rating || 0) >= 4)
      .slice()
      .sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (Number(b.reviewsCount || 0) - Number(a.reviewsCount || 0)))
      .slice(0, 3)
      .map((s) => s.id)
  );
  container.innerHTML = services.map(srv => {
    const status = getOpenStatus(srv.openHour, srv.closeHour);
    const isFav = favorites.includes(srv.id);
    const cat = categoryInfo(srv.category);
    const subName = subcategoryName(srv.category, srv.subcategory);
    const waMsg = encodeURIComponent(`مرحباً ${srv.name}، وصلت لحضرتك عبر دليل خدمات الإسماعيلية.`);
    const waNumber = toWhatsAppNumber(srv.whatsapp || srv.phone);
    const isTopRated = services.length >= 4 && topRatedIds.has(srv.id);

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
              ${isTopRated ? '<span class="service-top-badge">⭐ الأعلى تقييماً</span>' : ''}
              <span class="service-meta__dot" aria-hidden="true">•</span>
              <span class="inline-flex items-center gap-1.5 ${status.isOpen ? 'text-emerald-400' : 'text-rose-400'}"><span class="open-dot ${status.isOpen ? 'open-dot--open' : 'open-dot--closed'}"></span>${status.text}</span>
              <span class="service-meta__dot" aria-hidden="true">•</span>
              <span class="service-meta__area"><i data-lucide="map-pin" class="w-3 h-3"></i>${srv.area}</span>
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
    el.addEventListener('click', () => handlers.onDelete(el.dataset.del, el));
  });

  lucide.createIcons();
}

// ===== شاشة العرض: سلايدر إعلانات متحرك =====
// - الشرائح تتبدل تلقائياً كل 5 ثوانٍ (تلاشي)، مع نقاط وأسهم وسحب باللمس.
// - يتوقف مؤقتاً عند لمس الشاشة أو تمرير الفأرة فوقه.
// - الضغط على شريحة يفتح خدمتها في الدليل أو الرابط الخارجي حسب الإعلان.
function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let bannerTimer = null;

export function stopBannerSlider() {
  if (bannerTimer) { clearInterval(bannerTimer); bannerTimer = null; }
}

export function renderBannerSlider(container, banners, onOpenService) {
  if (!container) return;
  stopBannerSlider();
  if (!banners || !banners.length) { container.innerHTML = ''; return; }
  let index = 0;
  const goTo = (i) => {
    index = (i + banners.length) % banners.length;
    container.querySelectorAll('.banner-slide').forEach((el, n) => {
      el.classList.toggle('banner-slide--active', n === index);
    });
    container.querySelectorAll('.banner-slider__dot').forEach((el, n) => {
      el.classList.toggle('banner-slider__dot--active', n === index);
    });
  };
  const startAuto = () => {
    stopBannerSlider();
    if (banners.length > 1) bannerTimer = setInterval(() => goTo(index + 1), 5000);
  };
  container.innerHTML = `
    <div class="banner-slider">
      ${banners.map((b, n) => {
        const hasLink = b.linkType === 'service' || b.linkType === 'url';
        const cta = b.linkType === 'service' ? 'عرض الخدمة' : (b.linkType === 'url' ? 'تواصل الآن' : '');
        return `
        <div class="banner-slide${n === 0 ? ' banner-slide--active' : ''}${hasLink ? ' banner-slide--linked' : ''}" data-banner-i="${n}">
          <img src="${escAttr(b.imageUrl)}" alt="${escAttr(b.title)}" referrerpolicy="no-referrer" onerror="this.remove()">
          <div class="banner-slide__overlay">
            <h3 class="banner-slide__title">${escAttr(b.title)}</h3>
            ${b.subtitle ? `<p class="banner-slide__subtitle">${escAttr(b.subtitle)}</p>` : ''}
            ${cta ? `<span class="banner-slide__cta">${cta}</span>` : ''}
          </div>
        </div>`;
      }).join('')}
      ${banners.length > 1 ? `
        <button type="button" class="banner-slider__arrow banner-slider__arrow--prev" aria-label="السابق">‹</button>
        <button type="button" class="banner-slider__arrow banner-slider__arrow--next" aria-label="التالي">›</button>
        <div class="banner-slider__dots">
          ${banners.map((_, n) => `<button type="button" class="banner-slider__dot${n === 0 ? ' banner-slider__dot--active' : ''}" data-dot="${n}" aria-label="إعلان ${n + 1}"></button>`).join('')}
        </div>` : ''}
    </div>`;
  const slider = container.querySelector('.banner-slider');
  slider.querySelectorAll('.banner-slide').forEach((el) => {
    el.addEventListener('click', () => {
      const b = banners[Number(el.dataset.bannerI)];
      if (!b) return;
      if (b.linkType === 'service' && b.serviceId) onOpenService?.(b.serviceId);
      else if (b.linkType === 'url' && b.url) window.open(b.url, '_blank', 'noopener');
    });
  });
  slider.querySelector('.banner-slider__arrow--prev')?.addEventListener('click', (e) => { e.stopPropagation(); goTo(index - 1); startAuto(); });
  slider.querySelector('.banner-slider__arrow--next')?.addEventListener('click', (e) => { e.stopPropagation(); goTo(index + 1); startAuto(); });
  slider.querySelectorAll('.banner-slider__dot').forEach((el) => {
    el.addEventListener('click', (e) => { e.stopPropagation(); goTo(Number(el.dataset.dot)); startAuto(); });
  });
  slider.addEventListener('mouseenter', stopBannerSlider);
  slider.addEventListener('mouseleave', startAuto);
  let touchX = null;
  slider.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; stopBannerSlider(); }, { passive: true });
  slider.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) goTo(index + (dx < 0 ? 1 : -1));
    touchX = null;
    startAuto();
  }, { passive: true });
  startAuto();
}

// تاريخ الإضافة بالمللي ثانية — يقبل Firestore Timestamp أو رقماً أو نصاً.
export function createdAtMs(s) {
  const c = s?.createdAt;
  if (!c) return 0;
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (typeof c.seconds === 'number') return c.seconds * 1000;
  const t = Date.parse(c);
  return Number.isNaN(t) ? 0 : t;
}

// الأعلى تقييماً: أفضل 8 خدمات بتقييمات حقيقية (التقييم ثم عدد المراجعات).
export function renderTopRated(container, services, onOpenService) {
  if (!container) return;
  const top = services
    .filter((s) => s.reviewsCount > 1 || s.rating !== 5)
    .slice()
    .sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (Number(b.reviewsCount || 0) - Number(a.reviewsCount || 0)))
    .slice(0, 8);
  container.innerHTML = top.map((srv) => {
    const cat = categoryInfo(srv.category);
    return `
    <article class="top-rated-card" data-open-details="${srv.id}">
      ${srv.imageUrl ? `
        <div class="service-thumb">
          <img src="${escAttr(srv.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.service-thumb').remove()">
        </div>
      ` : `
        <div class="service-thumb service-thumb--fallback">
          <i data-lucide="${cat.icon}"></i>
        </div>
      `}
      <div class="min-w-0">
        <h3 class="top-rated-card__name">${srv.name}</h3>
        <p class="top-rated-card__meta">
          <span class="top-rated-card__rating">
            <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i>
            ${srv.rating} (${srv.reviewsCount})
          </span>
          <span aria-hidden="true">•</span>
          <span>${srv.area}</span>
        </p>
        <p class="top-rated-card__meta">${subcategoryName(srv.category, srv.subcategory) || cat.name}</p>
      </div>
    </article>`;
  }).join('');
  container.querySelectorAll('[data-open-details]').forEach((el) => {
    el.addEventListener('click', () => onOpenService(el.dataset.openDetails));
  });
  if (window.lucide) window.lucide.createIcons();
}

// شريط "جديد في الدليل": آخر 8 خدمات مضافة، مكررة 4 مرات ليملأ الشريط
// على أي عرض شاشة. التمرير بجافاسكربت (scrollLeft) لا بأنيميشن CSS —
// فلو تعطّل التمرير لأي سبب يبقى الشريط ممتلئاً بالخدمات وقابلاً للسحب يدوياً.
// الضغطة على اسم تفتح تفاصيل الخدمة.
export function renderTicker(track, services, onOpenService) {
  if (!track) return;
  const latest = services.slice().sort((a, b) => createdAtMs(b) - createdAtMs(a)).slice(0, 8);
  if (!latest.length) { track.innerHTML = ''; return; }
  const copy = latest.map((srv) => `
    <button class="ticker-item" data-ticker-id="${srv.id}">
      <span>${srv.name}</span><span class="ticker-item__dot" aria-hidden="true">•</span>
    </button>`).join('');
  track.innerHTML = copy + copy + copy + copy;
  track.querySelectorAll('[data-ticker-id]').forEach((el) => {
    el.addEventListener('click', () => onOpenService(el.dataset.tickerId));
  });
  // تشغيل التمرير مرة واحدة فقط.
  if (track.dataset.tickerStarted) return;
  track.dataset.tickerStarted = '1';
  const viewport = track.parentElement;
  if (!viewport) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  let paused = false;
  let timer = null;
  const step = () => {
    if (paused || document.hidden) return;
    viewport.scrollLeft += 1;
    if (viewport.scrollLeft >= viewport.scrollWidth / 2) {
      viewport.scrollLeft -= viewport.scrollWidth / 2;
    }
  };
  const start = () => { if (!timer) timer = setInterval(step, 30); };
  const stop = () => { clearInterval(timer); timer = null; };
  viewport.addEventListener('mouseenter', () => { paused = true; });
  viewport.addEventListener('mouseleave', () => { paused = false; });
  viewport.addEventListener('touchstart', () => { paused = true; stop(); }, { passive: true });
  viewport.addEventListener('touchend', () => { paused = false; start(); }, { passive: true });
  start();
}
