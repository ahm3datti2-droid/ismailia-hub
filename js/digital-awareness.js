// مركز الوعي الرقمي — صفحة مستقلة digital-awareness.html.
// المحتوى في ملفات JSON منفصلة (data/awareness/) عشان التعديل سهل،
// والأرقام المهمة في js/config.js (AWARENESS_EMERGENCY_NUMBERS).
// التوجيه بالـ hash: #/ للأ الرئيسية، و#/category/<id> و#/quiz إلخ
// للمراحل الجاية — أي مسار لسه متبناش بيعرض صفحة «قريباً».
import { AWARENESS_EMERGENCY_NUMBERS } from './config.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function refreshIcons() {
  try { window.lucide && window.lucide.createIcons(); } catch (_) {}
}

async function loadJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error('تعذر تحميل ' + path);
  return r.json();
}

const state = { categories: [], tools: [], featured: [], sources: [], meta: null };

function categoryCard(c) {
  return `<a href="#/category/${esc(c.id)}" class="awareness-card">
    <span class="awareness-card__icon"><i data-lucide="${esc(c.icon)}" class="w-5 h-5"></i></span>
    <span class="awareness-card__title">${esc(c.name)}</span>
    <span class="awareness-card__desc">${esc(c.desc)}</span>
    <span class="awareness-card__meta">${esc(String(c.topicsCount))} موضوع ←</span>
  </a>`;
}

function toolCard(t) {
  return `<a href="#/${esc(t.id)}" class="awareness-card">
    <span class="awareness-card__icon awareness-card__icon--gold"><i data-lucide="${esc(t.icon)}" class="w-5 h-5"></i></span>
    <span class="awareness-card__title">${esc(t.name)}</span>
    <span class="awareness-card__desc">${esc(t.desc)}</span>
    <span class="awareness-card__meta">جرّبها ←</span>
  </a>`;
}

function featuredCard(f) {
  return `<article class="awareness-featured">
    <span class="awareness-featured__cat">${esc(f.categoryName)}</span>
    <h3 class="awareness-featured__title">${esc(f.title)}</h3>
    <p class="awareness-featured__summary">${esc(f.summary)}</p>
  </article>`;
}

function numberCard(n) {
  const inner = `<span class="awareness-number__icon"><i data-lucide="${esc(n.icon || 'phone')}" class="w-5 h-5"></i></span>
    <span class="awareness-number__name">${esc(n.name)}</span>
    <span class="awareness-number__desc">${esc(n.desc)}</span>
    <span class="awareness-number__num" dir="ltr">${esc(n.number)}</span>`;
  return n.tel === null
    ? `<div class="awareness-number">${inner}</div>`
    : `<a href="tel:${esc(n.number)}" class="awareness-number">${inner}<span class="awareness-number__call">اتصل الآن ←</span></a>`;
}

function renderAll() {
  const cats = document.getElementById('categoriesGrid');
  if (cats) cats.innerHTML = state.categories.map(categoryCard).join('');
  const tools = document.getElementById('toolsGrid');
  if (tools) tools.innerHTML = state.tools.map(toolCard).join('');
  const feat = document.getElementById('featuredList');
  if (feat) feat.innerHTML = state.featured.map(featuredCard).join('');
  const nums = document.getElementById('numbersGrid');
  if (nums) nums.innerHTML = AWARENESS_EMERGENCY_NUMBERS.map(numberCard).join('');
  const srcs = document.getElementById('sourcesList');
  if (srcs) srcs.innerHTML = state.sources.map((s) =>
    `<a href="${esc(s.url)}" target="_blank" rel="noopener" class="awareness-source">${esc(s.name)}</a>`).join('');
  if (state.meta) {
    const lr = document.getElementById('lastReview');
    if (lr) lr.textContent = state.meta.lastReviewLabel || state.meta.lastReview;
    const rb = document.getElementById('reviewedBy');
    if (rb) rb.textContent = state.meta.reviewedBy || '';
    const sn = document.getElementById('sourcesNote');
    if (sn) sn.textContent = state.meta.sourcesNote || '';
    const wa = document.getElementById('shareWhatsApp');
    if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent((state.meta.shareText || '') + ' ' + location.origin + '/digital-awareness');
  }
  refreshIcons();
}

// التوجيه: الرئيسية بس في المرحلة 1؛ أي مسار تاني بيعرض «قريباً»
// مع اسم القسم والمرحلة اللي هيتفتح فيها.
function routeNameAndPhase(hash) {
  const m = hash.match(/^#\/category\/([\w-]+)/);
  if (m) {
    const c = state.categories.find((x) => x.id === m[1]);
    return c ? { name: c.name, phase: c.phase || 2 } : { name: 'قسم الوعي', phase: 2 };
  }
  const t = hash.match(/^#\/([\w-]+)/);
  if (t) {
    if (t[1] === 'academy') return { name: 'أكاديمية الوعي الرقمي', phase: 5 };
    const tool = state.tools.find((x) => x.id === t[1]);
    if (tool) return { name: tool.name, phase: tool.phase || 3 };
  }
  return { name: 'القسم ده', phase: 2 };
}

function applyRoute() {
  const hash = location.hash || '#/';
  const main = document.getElementById('mainView');
  const soon = document.getElementById('comingSoonView');
  if (!main || !soon) return;
  if (hash === '#/' || hash === '' || hash === '#') {
    main.classList.remove('hidden');
    soon.classList.add('hidden');
    return;
  }
  const { name, phase } = routeNameAndPhase(hash);
  document.getElementById('comingSoonTitle').textContent = name;
  document.getElementById('comingSoonText').textContent =
    `القسم ده هيتفتح في المرحلة ${phase} من مركز الوعي الرقمي — تابع الصفحة الرئيسية للقسم.`;
  main.classList.add('hidden');
  soon.classList.remove('hidden');
  window.scrollTo({ top: 0 });
  refreshIcons();
}

function bindShare() {
  const copyBtn = document.getElementById('copyLink');
  if (!copyBtn) return;
  copyBtn.addEventListener('click', async () => {
    const url = location.origin + '/digital-awareness';
    try {
      await navigator.clipboard.writeText(url);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
    const fb = document.getElementById('copyFeedback');
    if (fb) {
      fb.classList.remove('hidden');
      setTimeout(() => fb.classList.add('hidden'), 2500);
    }
  });
}

async function init() {
  try {
    const [categories, featured, sources, tools, meta] = await Promise.all([
      loadJson('data/awareness/categories.json'),
      loadJson('data/awareness/featured.json'),
      loadJson('data/awareness/sources.json'),
      loadJson('data/awareness/tools.json'),
      loadJson('data/awareness/meta.json')
    ]);
    state.categories = categories.categories || [];
    state.featured = featured.featured || [];
    state.sources = sources.sources || [];
    state.tools = tools.tools || [];
    state.meta = meta || null;
  } catch (err) {
    // لو ملف بيانات فشل يتحمل، الصفحة تفضل شغالة بالهيرو والأرقام.
    console.warn('awareness data failed to load', err);
  }
  renderAll();
  applyRoute();
  bindShare();
  window.addEventListener('hashchange', applyRoute);
  refreshIcons();
}

init();
