// مركز الوعي الرقمي — صفحة مستقلة digital-awareness.html.
// المحتوى في ملفات JSON منفصلة (data/awareness/) عشان التعديل سهل،
// والأرقام المهمة في js/config.js (AWARENESS_EMERGENCY_NUMBERS).
// التوجيه بالـ hash: #/ للأ الرئيسية، و#/category/<id> و#/quiz إلخ
// للمراحل الجاية — أي مسار لسه متبناش بيعرض صفحة «قريباً».
import { AWARENESS_EMERGENCY_NUMBERS } from './config.js';
import { renderTool, TOOL_IDS } from './awareness-tools.js';

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

const state = { categories: [], tools: [], featured: [], sources: [], meta: null, topics: [] };

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
  const inner = `<span class="awareness-featured__cat">${esc(f.categoryName)}</span>
    <h3 class="awareness-featured__title">${esc(f.title)}</h3>
    <p class="awareness-featured__summary">${esc(f.summary)}</p>
    <span class="awareness-card__meta">اقرأ الموضوع ←</span>`;
  return f.topic
    ? `<a href="#/topic/${esc(f.topic)}" class="awareness-featured block">${inner}</a>`
    : `<article class="awareness-featured">${inner}</article>`;
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
    if (lr && state.meta.lastReviewLabel) lr.textContent = state.meta.lastReviewLabel;
    const rb = document.getElementById('reviewedBy');
    if (rb && state.meta.reviewedBy) rb.textContent = state.meta.reviewedBy;
    // الأكاديمية (المرحلة 5) مخفية افتراضياً؛ تظهر بس لما features.academy تبقى true.
    const teaser = document.getElementById('academyTeaser');
    if (teaser && state.meta.features && state.meta.features.academy === true) {
      teaser.classList.remove('hidden');
    }
    const sn = document.getElementById('sourcesNote');
    if (sn) sn.textContent = state.meta.sourcesNote || '';
    const wa = document.getElementById('shareWhatsApp');
    if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent((state.meta.shareText || '') + ' ' + location.origin + '/digital-awareness');
  }
  refreshIcons();
}

function topicArticle(t, num) {
  const steps = t.steps.map((s) => `<li>${esc(s)}</li>`).join('');
  const mistakes = (t.mistakes || []).length
    ? `<div class="awareness-bad"><b>🚫 اوعى تعمل كده — أخطاء شائعة</b><ul>${t.mistakes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : '';
  const tip = t.tip
    ? `<div class="awareness-tip"><b>💡 نصيحة</b><ul><li>${esc(t.tip)}</li></ul></div>` : '';
  const sources = (t.sources || []).length
    ? `<div class="awareness-src"><b>المصادر:</b> ${t.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ')}</div>` : '';
  const shareUrl = `${location.origin}/awareness/${esc(t.category)}-${esc(t.id)}.html`;
  return `<article id="topic-${esc(t.id)}" class="awareness-topic">
    <h3><span class="awareness-topic__num">${num}</span>${esc(t.title)}</h3>
    <p class="awareness-topic__lead">${esc(t.lead)}</p>
    <h4>الخطوات — تعمل إيه؟</h4>
    <ol class="awareness-steps">${steps}</ol>
    ${mistakes}
    ${tip}
    ${sources}
    <a href="https://wa.me/?text=${encodeURIComponent(t.title + ' — مركز الوعي الرقمي: ' + shareUrl)}" target="_blank" rel="noopener" class="awareness-topic__share">شارك الموضوع على واتساب ←</a>
  </article>`;
}

function renderCategory(catId, scrollSlug) {
  const cat = state.categories.find((x) => x.id === catId);
  if (!cat) return false;
  const topics = state.topics.filter((t) => t.category === catId);
  document.getElementById('catBadge').textContent = cat.name;
  document.getElementById('catTitle').textContent = cat.name;
  document.getElementById('catDetail').textContent = cat.detail || cat.desc;
  document.getElementById('catToc').innerHTML = topics.map((t, i) =>
    `<li><a href="#topic-${esc(t.id)}" data-scroll-topic="${esc(t.id)}">${i + 1}. ${esc(t.title)}</a></li>`).join('');
  document.getElementById('catTopics').innerHTML = topics.map((t, i) => topicArticle(t, i + 1)).join('');
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('comingSoonView').classList.add('hidden');
  document.getElementById('toolView').classList.add('hidden');
  const view = document.getElementById('categoryView');
  view.classList.remove('hidden');
  refreshIcons();
  // روابط الفهرس بتمرير سلس للموضوع بدل تغيير الـ hash.
  view.querySelectorAll('[data-scroll-topic]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('topic-' + a.dataset.scrollTopic)?.scrollIntoView({ behavior: 'smooth' });
    });
  });
  if (scrollSlug) {
    setTimeout(() => document.getElementById('topic-' + scrollSlug)?.scrollIntoView(), 50);
  } else {
    window.scrollTo({ top: 0 });
  }
  return true;
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
  const catView = document.getElementById('categoryView');
  const toolView = document.getElementById('toolView');
  if (!main || !soon || !catView || !toolView) return;
  const hideAll = () => {
    main.classList.add('hidden');
    soon.classList.add('hidden');
    catView.classList.add('hidden');
    toolView.classList.add('hidden');
  };
  if (hash === '#/' || hash === '' || hash === '#') {
    hideAll();
    main.classList.remove('hidden');
    return;
  }
  const catMatch = hash.match(/^#\/category\/([\w-]+)/);
  if (catMatch) {
    if (renderCategory(catMatch[1], null)) return;
  }
  const topicMatch = hash.match(/^#\/topic\/([\w-]+)\/([\w-]+)/);
  if (topicMatch) {
    if (renderCategory(topicMatch[1], topicMatch[2])) return;
  }
  const toolMatch = hash.match(/^#\/([\w-]+)/);
  if (toolMatch && TOOL_IDS.includes(toolMatch[1])) {
    hideAll();
    toolView.classList.remove('hidden');
    renderTool(toolMatch[1], toolView);
    window.scrollTo({ top: 0 });
    return;
  }
  const { name, phase } = routeNameAndPhase(hash);
  document.getElementById('comingSoonTitle').textContent = name;
  document.getElementById('comingSoonText').textContent =
    `القسم ده هيتفتح في المرحلة ${phase} من مركز الوعي الرقمي — تابع الصفحة الرئيسية للقسم.`;
  hideAll();
  soon.classList.remove('hidden');
  window.scrollTo({ top: 0 });
  refreshIcons();
}

function bindShare() {
  const url = location.origin + '/digital-awareness';
  const urlInput = document.getElementById('shareUrlInput');
  if (urlInput) {
    urlInput.value = url;
    // دوسة على الرابط تحدده كله عشان النسخ اليدوي (ضغطة طويلة على الموبايل).
    urlInput.addEventListener('click', () => urlInput.select());
    urlInput.addEventListener('focus', () => urlInput.select());
  }
  const copyBtn = document.getElementById('copyLink');
  if (!copyBtn) return;
  copyBtn.addEventListener('click', async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch (_) {
      // بديل للمتصفحات اللي الحافظة فيها مقفولة: نحدد نص الرابط وننسخه.
      if (urlInput) {
        urlInput.select();
        try { ok = document.execCommand('copy'); } catch (_) {}
      }
    }
    const fb = document.getElementById('copyFeedback');
    if (fb) {
      fb.textContent = ok ? 'اتنسخ الرابط ✓' : 'النسخ متعذر — حدّد الرابط من الخانة وانسخه يدوياً';
      fb.classList.remove('hidden');
      setTimeout(() => fb.classList.add('hidden'), 3000);
    }
  });
}

async function init() {
  try {
    const [categories, featured, sources, tools, meta, topics] = await Promise.all([
      loadJson('data/awareness/categories.json'),
      loadJson('data/awareness/featured.json'),
      loadJson('data/awareness/sources.json'),
      loadJson('data/awareness/tools.json'),
      loadJson('data/awareness/meta.json'),
      loadJson('data/awareness/topics.json')
    ]);
    state.categories = categories.categories || [];
    state.featured = featured.featured || [];
    state.sources = sources.sources || [];
    state.tools = tools.tools || [];
    state.meta = meta || null;
    state.topics = topics.topics || [];
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
