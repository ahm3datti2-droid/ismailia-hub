// مركز الوعي الرقمي — التحذيرات والبلاغات (المرحلة 4).
// التحذيرات من Firestore (awarenessWarnings)؛ البلاغات بتتبعت من غير حساب
// وبتوصل للأدمن بس. honeypot + حد زمني (بلاغ كل 10 دقايق من نفس الجهاز).

import { db } from './database.js';
import { AWARENESS_EMERGENCY_NUMBERS } from './config.js';

const REPORT_TYPES = [
  'رسالة احتيالية', 'رابط مشبوه', 'صفحة مزيفة',
  'حساب بينتحل شخصية شخص أو جهة', 'إعلان مشبوه',
  'محاولة نصب إلكتروني', 'محاولة ابتزاز إلكتروني', 'مشكلة أمنية أخرى'
];
const REPORT_LAST_KEY = 'ism_awareness_report_last';
const REPORT_LIMIT_MS = 10 * 60 * 1000;

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
function lsGet(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch (_) { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}
function fmtDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return d ? d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  } catch (_) { return ''; }
}
function backLink() {
  return `<a href="#/" class="inline-flex items-center gap-1 text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-full transition hover:bg-amber-500 hover:text-slate-950 active:scale-95">→ كل الأقسام</a>`;
}
function toolHero(icon, title, intro) {
  return `<section class="awareness-hero">
    <span class="awareness-hero__badge"><i data-lucide="${esc(icon)}" class="w-4 h-4"></i> مركز الوعي الرقمي</span>
    <h2 class="awareness-hero__title">${esc(title)}</h2>
    <p class="awareness-hero__text">${esc(intro)}</p>
  </section>`;
}

const LEVEL = {
  high: { label: 'تحذير عاجل', cls: 'background:#7f1d1d;color:#fecaca;border-color:#991b1b' },
  medium: { label: 'تنبيه', cls: 'background:#78350f;color:#fde68a;border-color:#92400e' },
  info: { label: 'معلومة', cls: 'background:#0c4a6e;color:#bae6fd;border-color:#075985' }
};

export async function renderAlerts(el) {
  el.innerHTML = `${backLink()}
    ${toolHero('megaphone', 'التحذيرات الرقمية', 'رسايل وصفحات وروابط نصب منتشرة. كل تحذير هنا بنراجعه قبل ما يتنشر، ومعاه مصدر رسمي تقدر ترجع له.')}
    <p class="text-sm text-slate-300 font-semibold">جارٍ تحميل التحذيرات…</p>`;
  refreshIcons();
  let list = [];
  try {
    list = await db.getActiveAwarenessWarnings();
  } catch (err) {
    console.warn('alerts failed', err);
    el.innerHTML = `${backLink()}
      ${toolHero('megaphone', 'التحذيرات الرقمية', 'رسايل وصفحات وروابط نصب منتشرة. كل تحذير هنا بنراجعه قبل ما يتنشر، ومعاه مصدر رسمي تقدر ترجع له.')}
      <div class="awareness-topic"><p class="awareness-topic__lead">تعذر تحميل التحذيرات دلوقتي — جرّب تاني بعد شوية.</p></div>`;
    refreshIcons();
    return;
  }
  const cards = list.length ? list.map((w) => {
    const lv = LEVEL[w.level] || LEVEL.medium;
    return `<article class="awareness-topic">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span class="text-[11px] font-extrabold px-2.5 py-1 rounded-full border" style="${lv.cls}">${esc(lv.label)}</span>
        ${fmtDate(w.createdAt) ? `<span class="text-[11px] text-slate-500 font-bold">${esc(fmtDate(w.createdAt))}</span>` : ''}
      </div>
      <h3>${esc(w.title)}</h3>
      <p class="awareness-topic__lead">${esc(w.body)}</p>
      ${w.sourceUrl ? `<div class="awareness-src"><b>المصدر الرسمي:</b> <a href="${esc(w.sourceUrl)}" target="_blank" rel="noopener">${esc(w.sourceName || w.sourceUrl)}</a></div>` : ''}
    </article>`;
  }).join('') : `<div class="awareness-topic">
      <h3>لا توجد تحذيرات حالياً</h3>
      <p class="awareness-topic__lead">مفيش تحذيرات منشورة دلوقتي — لو شفت حاجة مشبوهة بلّغنا عنها وهنراجعها قبل ما ننشر أي تحذير.</p>
    </div>`;
  el.innerHTML = `${backLink()}
    ${toolHero('megaphone', 'التحذيرات الرقمية', 'رسايل وصفحات وروابط نصب منتشرة. كل تحذير هنا بنراجعه قبل ما يتنشر، ومعاه مصدر رسمي تقدر ترجع له.')}
    <div class="space-y-3">${cards}</div>
    <a href="#/report" class="awareness-card">
      <span class="awareness-card__icon"><i data-lucide="flag" class="w-5 h-5"></i></span>
      <span class="awareness-card__title">شفت حاجة مشبوهة؟</span>
      <span class="awareness-card__desc">بلّغنا عنها، وإحنا هنراجعها. البلاغات مش بتتنشر، ومش هنحط أي تحذير غير لما نتأكد منه من مصدر رسمي.</span>
      <span class="awareness-card__meta">بلّغ عن محاولة نصب ←</span>
    </a>`;
  refreshIcons();
}

// ================= نموذج البلاغ =================
export function renderReport(el) {
  const emergency = AWARENESS_EMERGENCY_NUMBERS.map((n) => `
    <a href="${n.tel ? `tel:${esc(n.tel)}` : '#'}" class="awareness-card" ${n.tel ? '' : 'onclick="return false;"'}>
      <span class="awareness-card__icon">${esc(n.number)}</span>
      <span class="awareness-card__title">${esc(n.name)}</span>
      <span class="awareness-card__desc">${esc(n.desc || '')}</span>
      ${n.tel ? `<span class="awareness-card__meta">اتصل ←</span>` : ''}
    </a>`).join('');
  el.innerHTML = `${backLink()}
    ${toolHero('flag', 'بلّغ عن محاولة نصب', 'شفت رسالة أو صفحة أو رابط نصب؟ بلّغنا علشان ننبّه الناس. البلاغ بيوصل للإدارة بس ومش بيتنشر.')}
    <div class="awareness-bad">
      <b>🚨 لو الموضوع مستعجل</b>
      <p class="text-xs leading-relaxed mt-1">لو فلوس اتسحبت أو حد بيبتزك دلوقتي، البلاغ هنا مش هيوقف ده. اتصرف فوراً:</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">${emergency}</div>
    </div>
    <div class="awareness-bad mt-3">
      <b>⛔ متكتبش في البلاغ:</b>
      <ul class="mt-1"><li>كلمة سر أي حساب</li><li>كود التحقق (OTP) اللي بيوصلك في رسالة</li><li>رقم الكارت أو الـ CVV أو الرقم السري</li></ul>
    </div>
    <form id="reportForm" class="awareness-topic space-y-3" novalidate>
      <div>
        <label class="text-xs font-extrabold text-white block mb-1">نوع البلاغ *</label>
        <select id="reportType" required class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm">
          <option value="">اختار...</option>
          ${REPORT_TYPES.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="text-xs font-extrabold text-white block mb-1">إيه اللي حصل؟ *</label>
        <textarea id="reportDetails" required rows="4" maxlength="1500" placeholder="اكتب اللي حصل بالتفصيل — من غير كلمات سر أو أكواد أو أرقام كروت" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm"></textarea>
        <p class="text-[11px] text-slate-500 font-bold mt-1"><span id="reportCount">0</span>/1500</p>
      </div>
      <div>
        <label class="text-xs font-extrabold text-white block mb-1">اسم الصفحة أو الرابط أو الرقم (اختياري)</label>
        <input id="reportSource" type="text" placeholder="مثال: صفحة «عروض كذا» أو الرقم اللي بعت الرسالة" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm">
        <p class="text-[11px] text-slate-500 font-bold mt-1">متفتحش الرابط المشبوه علشان تنسخه — انسخه من الرسالة نفسها.</p>
      </div>
      <div>
        <label class="text-xs font-extrabold text-white block mb-1">تاريخ الواقعة (اختياري)</label>
        <input id="reportDate" type="date" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm">
      </div>
      <div>
        <label class="text-xs font-extrabold text-white block mb-1">سكرين شوت (اختياري — لحد 3 ميجا)</label>
        <input id="reportShot" type="file" accept="image/*" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm">
        <p class="text-[11px] text-slate-500 font-bold mt-1">غطّي أي بيانات شخصية أو أرقام كروت قبل ما ترفع الصورة.</p>
        <p id="shotPreview" class="hidden mt-2"><img id="shotImg" class="w-full max-h-48 object-contain bg-white rounded-xl" alt="معاينة السكرين شوت"></p>
      </div>
      <div>
        <label class="text-xs font-extrabold text-white block mb-1">وسيلة تواصل معاك (اختياري)</label>
        <input id="reportContact" type="text" placeholder="رقم موبايل أو إيميل — لو تحب نرد عليك" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm">
      </div>
      <div aria-hidden="true" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden">
        <label>موقعك الإلكتروني<input id="reportWebsite" type="text" tabindex="-1" autocomplete="off"></label>
      </div>
      <p id="reportError" class="hidden text-sm font-extrabold text-red-300"></p>
      <button type="submit" id="reportSubmit" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 py-3 rounded-xl text-sm font-extrabold transition active:scale-95">ابعت البلاغ</button>
      <p class="text-[11px] text-slate-500 font-semibold leading-relaxed">البلاغ والصورة بيشوفهم المشرفين بس، ومش بيتنشروا على الموقع. مش محتاج تعمل حساب، ووسيلة التواصل اختيارية. لو اتأكدنا من النصب من مصدر رسمي، بننزل تحذير عام من غير أي بيانات عنك.</p>
    </form>`;
  refreshIcons();

  const form = document.getElementById('reportForm');
  const details = document.getElementById('reportDetails');
  const count = document.getElementById('reportCount');
  const shotInput = document.getElementById('reportShot');
  const shotPreview = document.getElementById('shotPreview');
  const shotImg = document.getElementById('shotImg');
  const errorEl = document.getElementById('reportError');
  const submitBtn = document.getElementById('reportSubmit');
  let screenshotData = '';

  details.addEventListener('input', () => { count.textContent = String(details.value.length); });

  shotInput.addEventListener('change', () => {
    const file = shotInput.files && shotInput.files[0];
    screenshotData = '';
    shotPreview.classList.add('hidden');
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showError('الصورة أكبر من 3 ميجا — اختار صورة أصغر.');
      shotInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 800;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        screenshotData = canvas.toDataURL('image/jpeg', 0.75);
        if (screenshotData.length > 950000) {
          showError('الصورة كبيرة حتى بعد الضغط — جرّب صورة أصغر أو ابعت البلاغ من غيرها.');
          screenshotData = '';
          shotInput.value = '';
          return;
        }
        shotImg.src = screenshotData;
        shotPreview.classList.remove('hidden');
      };
      img.onerror = () => showError('تعذر قراءة الصورة — جرّب صورة تانية.');
      img.src = String(reader.result);
    };
    reader.onerror = () => showError('تعذر قراءة الصورة — جرّب صورة تانية.');
    reader.readAsDataURL(file);
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    window.scrollTo({ top: errorEl.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
  }

  function showSuccess() {
    el.innerHTML = `${backLink()}
      ${toolHero('flag', 'وصل البلاغ ✓', 'شكراً — بلاغك وصل للإدارة بس ومش هيتنشر. هنراجعه، ولو اتأكدنا من النصب من مصدر رسمي هننزل تحذير عام من غير أي بيانات عنك.')}
      <div class="awareness-result">
        <p class="awareness-result__score">لو فلوس اتسحبت أو حد بيبتزك دلوقتي، متستناش — اتصل بـ 108 (مباحث الإنترنت) فوراً.</p>
        <a href="#/alerts" class="inline-block mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-3 rounded-xl text-sm font-extrabold transition">شوف التحذيرات ←</a>
      </div>`;
    refreshIcons();
    window.scrollTo({ top: 0 });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    // honeypot: لو اتملى يبقى بوت — نظهر نجاح وهمي من غير ما نبعت حاجة.
    const honeypot = document.getElementById('reportWebsite');
    if (honeypot && honeypot.value.trim()) { showSuccess(); return; }
    // rate limit: بلاغ واحد كل 10 دقايق من نفس الجهاز.
    const last = Number(lsGet(REPORT_LAST_KEY, 0) || 0);
    if (Date.now() - last < REPORT_LIMIT_MS) {
      const mins = Math.ceil((REPORT_LIMIT_MS - (Date.now() - last)) / 60000);
      showError(`بعت بلاغ من شوية — استنى ${mins} ${mins === 1 ? 'دقيقة' : 'دقايق'} قبل البلاغ اللي بعده.`);
      return;
    }
    const payload = {
      type: document.getElementById('reportType').value,
      details: details.value.trim(),
      source: document.getElementById('reportSource').value.trim(),
      date: document.getElementById('reportDate').value,
      contact: document.getElementById('reportContact').value.trim(),
      screenshot: screenshotData
    };
    if (!payload.type) { showError('اختار نوع البلاغ.'); return; }
    if (payload.details.length < 10) { showError('اكتب إيه اللي حصل في سطرين على الأقل.'); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'بيتبعت…';
    try {
      await db.submitAwarenessReport(payload);
      lsSet(REPORT_LAST_KEY, Date.now());
      showSuccess();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ابعت البلاغ';
      showError(err && err.message ? err.message : 'تعذر إرسال البلاغ — جرّب تاني بعد شوية.');
    }
  });
}
