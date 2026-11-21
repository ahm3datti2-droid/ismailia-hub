// سوق مستعمل + وظايف — صفحة مستقلة market.html.
// الإعلانات والوظايف بتتبعت من غير حساب (مثل بلاغات الوعي) وبتتحفظ
// pending لحد ما الأدمن يوافق — حماية: honeypot + حد إرسال كل 10 دقايق.
import { AREAS } from './config.js';
import { db } from './database.js';
import { downscaleImageToDataUrl, toWhatsAppNumber } from './ui.js';

const CLASS_CATS = {
  all: 'الكل',
  cars: 'سيارات',
  phones: 'موبايلات وأجهزة',
  furniture: 'أثاث ومنزل',
  clothing: 'ملابس',
  other: 'أخرى'
};
const JOB_TYPES = { full: 'دوام كامل', part: 'دوام جزئي', shift: 'ورديات', remote: 'عن بُعد' };
const RATE_KEY_CLASSIFIED = 'ism_market_classified_last';
const RATE_KEY_JOB = 'ism_market_job_last';
const RATE_MS = 10 * 60 * 1000;

let activeTab = 'classifieds';
let activeCat = 'all';
let classifieds = [];
let jobs = [];
let loadError = false;

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

function fillAreaSelect(el) {
  if (!el) return;
  el.innerHTML = ['الإسماعيلية', ...AREAS].map((a) => `<option value="${escAttr(a)}">${esc(a)}</option>`).join('');
}

function fmtPrice(p) {
  if (p == null || p === '') return '';
  return Number(p).toLocaleString('en-US') + ' ج.م';
}
function timeAgo(ts) {
  try {
    const ms = ts?.toMillis ? ts.toMillis() : 0;
    if (!ms) return '';
    const d = Math.floor((Date.now() - ms) / 86400000);
    if (d <= 0) return 'اليوم';
    if (d === 1) return 'أمس';
    return `منذ ${d} يوم`;
  } catch (_) { return ''; }
}

function renderCats() {
  const box = document.getElementById('classifiedCats');
  if (!box) return;
  box.innerHTML = Object.entries(CLASS_CATS).map(([id, name]) => `
    <button data-cat="${id}" class="quick-chip ${activeCat === id ? 'quick-chip--on' : ''}">${esc(name)}</button>`).join('');
  box.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    activeCat = b.dataset.cat;
    renderCats();
    renderClassifieds();
  }));
}

function renderClassifieds() {
  const list = document.getElementById('classifiedsList');
  const empty = document.getElementById('classifiedsEmpty');
  if (!list) return;
  const items = classifieds.filter((c) => activeCat === 'all' || c.category === activeCat);
  empty.classList.toggle('hidden', items.length > 0);
  if (loadError && items.length === 0) empty.textContent = 'تعذّر تحميل الإعلانات — جرّب تحديث الصفحة.';
  list.innerHTML = items.map((c) => {
    const wa = toWhatsAppNumber(c.phone);
    const waMsg = encodeURIComponent(`مرحباً، شفت إعلانك «${c.title}» في سوق دليل الإسماعيلية.`);
    return `
    <article class="service-card relative">
      ${c.photo ? `<div class="service-thumb"><img src="${escAttr(c.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.service-thumb').remove()"></div>` : ''}
      <div class="service-main p-3">
        <div class="flex items-start justify-between gap-2">
          <h3 class="service-name">${esc(c.title)}</h3>
          ${c.price != null && c.price !== '' ? `<span class="text-amber-400 font-black text-sm whitespace-nowrap">${fmtPrice(c.price)}</span>` : ''}
        </div>
        <p class="service-cat">${esc(CLASS_CATS[c.category] || 'أخرى')}</p>
        <p class="text-xs text-slate-300 font-semibold leading-relaxed mt-1">${esc(c.description)}</p>
        <p class="service-meta">
          <span class="service-meta__area"><i data-lucide="map-pin" class="w-3 h-3"></i>${esc(c.area || 'الإسماعيلية')}</span>
          <span class="service-meta__dot" aria-hidden="true">•</span>
          <span>${timeAgo(c.createdAt)}</span>
        </p>
        <div class="service-actions mt-3">
          <a href="https://wa.me/${wa}?text=${waMsg}" target="_blank" rel="noopener" class="service-btn service-btn--wa">
            <i data-lucide="message-circle" class="w-4 h-4"></i> واتساب
          </a>
          <a href="tel:${escAttr(c.phone)}" class="service-btn service-btn--call">
            <i data-lucide="phone" class="w-4 h-4"></i> اتصال
          </a>
        </div>
      </div>
    </article>`;
  }).join('');
  window.lucide?.createIcons();
}

function renderJobs() {
  const list = document.getElementById('jobsList');
  const empty = document.getElementById('jobsEmpty');
  if (!list) return;
  empty.classList.toggle('hidden', jobs.length > 0);
  if (loadError && jobs.length === 0) empty.textContent = 'تعذّر تحميل الوظايف — جرّب تحديث الصفحة.';
  list.innerHTML = jobs.map((j) => {
    const wa = toWhatsAppNumber(j.phone);
    const waMsg = encodeURIComponent(`مرحباً، شفت وظيفة «${j.title}» في دليل الإسماعيلية وعايز أقدم.`);
    return `
    <article class="service-card relative">
      <div class="service-main p-3">
        <div class="flex items-start justify-between gap-2">
          <h3 class="service-name">${esc(j.title)}</h3>
          <span class="quick-chip quick-chip--on whitespace-nowrap">${esc(JOB_TYPES[j.jobType] || 'دوام كامل')}</span>
        </div>
        <p class="service-cat">${esc(j.company)}</p>
        <p class="text-xs text-slate-300 font-semibold leading-relaxed mt-1">${esc(j.description)}</p>
        <p class="service-meta">
          ${j.salary ? `<span class="text-amber-400 font-bold">${esc(j.salary)}</span><span class="service-meta__dot" aria-hidden="true">•</span>` : ''}
          <span class="service-meta__area"><i data-lucide="map-pin" class="w-3 h-3"></i>${esc(j.area || 'الإسماعيلية')}</span>
          <span class="service-meta__dot" aria-hidden="true">•</span>
          <span>${timeAgo(j.createdAt)}</span>
        </p>
        <div class="service-actions mt-3">
          <a href="https://wa.me/${wa}?text=${waMsg}" target="_blank" rel="noopener" class="service-btn service-btn--wa">
            <i data-lucide="message-circle" class="w-4 h-4"></i> واتساب
          </a>
          <a href="tel:${escAttr(j.phone)}" class="service-btn service-btn--call">
            <i data-lucide="phone" class="w-4 h-4"></i> اتصال
          </a>
        </div>
      </div>
    </article>`;
  }).join('');
  window.lucide?.createIcons();
}

function setTab(tab) {
  activeTab = tab;
  document.getElementById('classifiedsSection')?.classList.toggle('hidden', tab !== 'classifieds');
  document.getElementById('jobsSection')?.classList.toggle('hidden', tab !== 'jobs');
  const tc = document.getElementById('tabClassifieds');
  const tj = document.getElementById('tabJobs');
  tc.className = 'py-3 rounded-xl text-sm font-extrabold transition ' + (tab === 'classifieds' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300');
  tj.className = 'py-3 rounded-xl text-sm font-extrabold transition ' + (tab === 'jobs' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300');
}

function checkRateLimit(key) {
  try {
    const last = Number(localStorage.getItem(key) || 0);
    if (last && Date.now() - last < RATE_MS) return false;
  } catch (_) {}
  return true;
}
function markSent(key) {
  try { localStorage.setItem(key, String(Date.now())); } catch (_) {}
}
function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideErr(el) { el?.classList.add('hidden'); }

async function loadAll() {
  try {
    classifieds = await db.getApprovedClassifieds();
  } catch (err) {
    classifieds = [];
    loadError = true;
    console.error('load classifieds failed', err);
  }
  try {
    jobs = await db.getApprovedJobs();
  } catch (err) {
    jobs = [];
    loadError = true;
    console.error('load jobs failed', err);
  }
  renderCats();
  renderClassifieds();
  renderJobs();
}

function bind() {
  document.getElementById('tabClassifieds')?.addEventListener('click', () => setTab('classifieds'));
  document.getElementById('tabJobs')?.addEventListener('click', () => setTab('jobs'));
  fillAreaSelect(document.getElementById('classifiedArea'));
  fillAreaSelect(document.getElementById('jobArea'));

  let classifiedPhotoData = '';
  const photoInput = document.getElementById('classifiedPhoto');
  photoInput?.addEventListener('change', async () => {
    const f = photoInput.files?.[0];
    const preview = document.getElementById('classifiedPhotoPreview');
    if (!f) { classifiedPhotoData = ''; preview?.classList.add('hidden'); return; }
    try {
      classifiedPhotoData = await downscaleImageToDataUrl(f, 800, 0.72);
      if (preview) { preview.src = classifiedPhotoData; preview.classList.remove('hidden'); }
    } catch (_) {
      classifiedPhotoData = '';
      showErr(document.getElementById('classifiedError'), 'تعذّر قراءة الصورة — جرّب صورة تانية.');
    }
  });

  document.getElementById('classifiedForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('classifiedError');
    const okEl = document.getElementById('classifiedSuccess');
    hideErr(errEl); okEl?.classList.add('hidden');
    const fd = new FormData(e.target);
    if (String(fd.get('marketWebsite') || '').trim()) {
      okEl?.classList.remove('hidden');
      e.target.reset();
      return;
    }
    if (!checkRateLimit(RATE_KEY_CLASSIFIED)) {
      showErr(errEl, 'بعت إعلان من شوية — استنى 10 دقايق قبل ما تبعت تاني.');
      return;
    }
    try {
      await db.submitClassified({
        title: fd.get('title'), category: fd.get('category'), price: fd.get('price'),
        description: fd.get('description'), phone: fd.get('phone'), area: fd.get('area'),
        photo: classifiedPhotoData
      });
      markSent(RATE_KEY_CLASSIFIED);
      okEl?.classList.remove('hidden');
      e.target.reset();
      classifiedPhotoData = '';
      document.getElementById('classifiedPhotoPreview')?.classList.add('hidden');
    } catch (err) {
      showErr(errEl, err?.message || 'حصل خطأ — جرّب تاني.');
    }
  });

  document.getElementById('jobForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('jobError');
    const okEl = document.getElementById('jobSuccess');
    hideErr(errEl); okEl?.classList.add('hidden');
    const fd = new FormData(e.target);
    if (String(fd.get('marketWebsite') || '').trim()) {
      okEl?.classList.remove('hidden');
      e.target.reset();
      return;
    }
    if (!checkRateLimit(RATE_KEY_JOB)) {
      showErr(errEl, 'بعت وظيفة من شوية — استنى 10 دقايق قبل ما تبعت تاني.');
      return;
    }
    try {
      await db.submitJob({
        title: fd.get('title'), company: fd.get('company'), jobType: fd.get('jobType'),
        salary: fd.get('salary'), description: fd.get('description'),
        phone: fd.get('phone'), area: fd.get('area')
      });
      markSent(RATE_KEY_JOB);
      okEl?.classList.remove('hidden');
      e.target.reset();
    } catch (err) {
      showErr(errEl, err?.message || 'حصل خطأ — جرّب تاني.');
    }
  });
}

bind();
loadAll();
window.lucide?.createIcons();
