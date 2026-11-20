// أكاديمية الوعي الرقمي (المرحلة 5): 7 دورات، كل دورة 3 دروس،
/// كل درس بعده سؤالين. التقدم والشارات بيتحفظوا في localStorage بس
// (متغلف بـ try/catch عشان الصفحة ماتقعش لو المتصفح مانعه).

const ACADEMY_KEY = 'ism_awareness_academy';

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

const ICON_MAP = {
  shieldCheck: 'shield-check', lock: 'lock', eye: 'eye', family: 'users',
  key: 'key', bot: 'bot', wallet: 'wallet', 'graduation-cap': 'graduation-cap'
};
const CATEGORY_NAMES = {
  'social-security': 'أمان مواقع التواصل',
  'online-scams': 'النصب والاحتيال الإلكتروني',
  'privacy': 'الخصوصية وحماية البيانات',
  'family-safety': 'أمان الأطفال والأسرة',
  'ai-awareness': 'الذكاء الاصطناعي والوعي',
  'financial-security': 'الأمان المالي'
};

function iconName(n) { return ICON_MAP[n] || 'book-open'; }

let cache = null;
async function loadAcademy() {
  if (cache) return cache;
  const r = await fetch('data/awareness/academy.json');
  if (!r.ok) throw new Error('تعذر تحميل الأكاديمية');
  cache = await r.json();
  return cache;
}

function academyState() {
  return lsGet(ACADEMY_KEY, { courses: {} });
}
function saveState(s) { lsSet(ACADEMY_KEY, s); }

// تقدم الدورة: دروس مكتملة، أسئلة صح من الكل، وهل الشارة مستحقة.
function courseProgress(course, st) {
  const saved = (st.courses && st.courses[course.slug]) || { lessons: {} };
  let doneLessons = 0, correctQ = 0, totalQ = 0;
  for (const l of course.lessons) {
    const ls = saved.lessons[l.id];
    totalQ += l.quiz.length;
    if (ls) {
      if (ls.done) doneLessons++;
      correctQ += (ls.answers || []).filter((a, i) => a === l.quiz[i].correct).length;
    }
  }
  const earned = doneLessons === course.lessons.length && correctQ === totalQ && totalQ > 0;
  return { doneLessons, totalLessons: course.lessons.length, correctQ, totalQ, earned, saved };
}

function backLink() {
  return `<a href="#/" class="inline-flex items-center gap-1 text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-full transition hover:bg-amber-500 hover:text-slate-950 active:scale-95">→ كل الأقسام</a>`;
}

function toolHero(icon, title, intro) {
  return `<section class="awareness-hero">
    <span class="awareness-hero__badge"><i data-lucide="${esc(icon)}" class="w-4 h-4"></i> أكاديمية الوعي الرقمي</span>
    <h2 class="awareness-hero__title">${esc(title)}</h2>
    <p class="awareness-hero__text">${esc(intro)}</p>
  </section>`;
}

function renderAcademyList(el, data) {
  const st = academyState();
  const doneCourses = data.courses.filter((c) => courseProgress(c, st).earned).length;
  const cards = data.courses.map((c) => {
    const p = courseProgress(c, st);
    const mins = c.lessons.reduce((a, l) => a + (l.minutes || 0), 0);
    const pct = Math.round((p.doneLessons / p.totalLessons) * 100);
    const stateLabel = p.earned ? '✓ خلّصتها — خدت الشارة'
      : p.doneLessons > 0 ? `كمّل — ${p.doneLessons} من ${p.totalLessons} دروس` : 'ابدأ الدورة ←';
    return `<a href="#/academy/${esc(c.slug)}" class="awareness-card">
      <span class="awareness-card__icon"><i data-lucide="${iconName(c.icon)}" class="w-5 h-5"></i></span>
      <span class="awareness-card__title">${esc(c.title)}</span>
      <span class="awareness-card__desc">${esc(c.short)}</span>
      <span class="awareness-card__meta">${p.totalLessons} دروس · ${mins} دقيقة</span>
      <span class="awareness-progress mt-1"><span style="width:${pct}%"></span></span>
      <span class="awareness-card__meta">${p.earned ? `${esc(c.badge.emoji)} ${esc(c.badge.label)}` : stateLabel}</span>
    </a>`;
  }).join('');
  const badges = data.courses.map((c) => {
    const earned = courseProgress(c, st).earned;
    return `<div class="awareness-badge ${earned ? '' : 'awareness-badge--locked'}">
      <span class="awareness-badge__emoji">${esc(c.badge.emoji)}</span>
      <span class="awareness-badge__label">${esc(c.badge.label)}</span>
      <span class="awareness-badge__desc">${esc(c.title)}</span>
      ${earned ? '<span class="awareness-badge__got">✓ حصلت عليها</span>' : ''}
    </div>`;
  }).join('');
  el.innerHTML = `${backLink()}
    ${toolHero('graduation-cap', 'أكاديمية الوعي الرقمي', data.intro)}
    <div class="awareness-result">
      <p class="awareness-result__score">${doneCourses} من ${data.courses.length} دورات مكتملة</p>
      <div class="awareness-progress"><span style="width:${Math.round((doneCourses / data.courses.length) * 100)}%"></span></div>
      <p class="text-xs font-bold text-slate-400 mt-2">${esc(data.badgesNote)}</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${cards}</div>
    <section>
      <h3 class="text-base font-black text-white mb-3">شارات الإتمام</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">${badges}</div>
      <p class="text-[11px] text-slate-500 font-semibold leading-relaxed mt-3">${esc(data.badgesFine)}</p>
    </section>`;
  refreshIcons();
}

function renderCourse(el, data, slug) {
  const course = data.courses.find((c) => c.slug === slug);
  if (!course) { renderAcademyList(el, data); return; }
  const st = academyState();
  const p = courseProgress(course, st);
  const mins = course.lessons.reduce((a, l) => a + (l.minutes || 0), 0);
  const lessons = course.lessons.map((l, i) => {
    const ls = p.saved.lessons[l.id];
    const done = ls && ls.done;
    const correct = ls ? (ls.answers || []).filter((a, i) => a === l.quiz[i].correct).length : 0;
    return `<a href="#/academy/${esc(course.slug)}/${esc(l.id)}" class="awareness-card">
      <span class="awareness-card__icon">${done ? '✓' : (i + 1)}</span>
      <span class="awareness-card__title">${esc(l.title)}</span>
      <span class="awareness-card__desc">${l.minutes} دقائق · سؤالين بعد الدرس</span>
      <span class="awareness-card__meta">${done ? `✓ خلّصته (${correct}/${l.quiz.length} صح)` : 'ابدأ الدرس ←'}</span>
    </a>`;
  }).join('');
  el.innerHTML = `<a href="#/academy" class="inline-flex items-center gap-1 text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-full transition hover:bg-amber-500 hover:text-slate-950 active:scale-95">→ كل الدورات</a>
    ${toolHero(iconName(course.icon), course.title, course.short)}
    <div class="awareness-result">
      <p class="awareness-result__score">${p.doneLessons} من ${p.totalLessons} دروس · ${p.correctQ}/${p.totalQ} إجابات صح</p>
      <div class="awareness-progress"><span style="width:${Math.round((p.doneLessons / p.totalLessons) * 100)}%"></span></div>
      ${p.earned ? `<p class="text-base font-black text-emerald-300 mt-3">🎉 ${esc(course.badge.emoji)} خدت شارة «${esc(course.badge.label)}»!</p>` : ''}
      <p class="text-xs font-bold text-slate-400 mt-2">${mins} دقيقة إجمالاً · <a href="#/category/${esc(course.section)}" class="text-sky-400">مواضيع قسم «${esc(CATEGORY_NAMES[course.section] || course.section)}» ←</a></p>
    </div>
    <div class="grid grid-cols-1 gap-3">${lessons}</div>`;
  refreshIcons();
}

// ================= عرض الدرس =================
function visualHtml(v) {
  if (!v) return '';
  if (v.kind === 'dodont') {
    return `<div class="grid grid-cols-2 gap-2 mt-3">
      <div class="awareness-tip"><b>✅ اعمل</b><ul>${(v.dos || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="awareness-bad"><b>🚫 متعملش</b><ul>${(v.donts || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>`;
  }
  if (v.kind === 'flow') {
    return `<ol class="awareness-steps mt-3">${(v.steps || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  }
  if (v.kind === 'msg') {
    return `<div class="awareness-msg mt-3">
      <div class="awareness-msg__head"><span class="awareness-msg__channel">رسالة</span><span>من: ${esc(v.from)}</span></div>
      <p class="awareness-msg__text">${esc(v.text)}</p>
      ${(v.flags || []).length ? `<p class="text-xs font-bold text-red-300 mt-2">العلامات: ${v.flags.map(esc).join(' · ')}</p>` : ''}
    </div>`;
  }
  return '';
}

function renderLesson(el, data, slug, lessonId) {
  const course = data.courses.find((c) => c.slug === slug);
  if (!course) { renderAcademyList(el, data); return; }
  const lesson = course.lessons.find((l) => l.id === lessonId);
  if (!lesson) { renderCourse(el, data, slug); return; }
  const st = academyState();
  const saved = ((st.courses[course.slug] || {}).lessons || {})[lesson.id] || {};
  const prevAnswers = saved.answers || [];
  let answers = [...prevAnswers];

  const idx = course.lessons.findIndex((l) => l.id === lessonId);
  const nextLesson = course.lessons[idx + 1] || null;
  const sources = (lesson.sources || []).length
    ? `<div class="awareness-src"><b>المصادر:</b> ${lesson.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ')}</div>` : '';
  const tryNow = lesson.tryNow
    ? `<div class="awareness-tip"><b>💡 جرّب دلوقتي</b><ul><li>${esc(lesson.tryNow)}</li></ul>${lesson.tryNowTool ? `<a href="#/${esc(lesson.tryNowTool)}" class="awareness-quiz__read">افتح الأداة ←</a>` : ''}</div>` : '';

  function paint() {
    const cur = academyState();
    const curSaved = ((cur.courses[course.slug] || {}).lessons || {})[lesson.id] || {};
    const allAnswered = answers.length === lesson.quiz.length && answers.every((a) => a !== undefined);
    const correctCount = answers.filter((a, i) => a === lesson.quiz[i].correct).length;
    const done = curSaved.done === true;
    el.innerHTML = `<a href="#/academy/${esc(course.slug)}" class="inline-flex items-center gap-1 text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-full transition hover:bg-amber-500 hover:text-slate-950 active:scale-95">→ دروس «${esc(course.title)}»</a>
      ${toolHero(iconName(course.icon), lesson.title, `${course.title} · درس ${idx + 1} من ${course.lessons.length} · ${lesson.minutes} دقائق`)}
      <div class="awareness-topic">
        <p class="awareness-topic__lead">${esc(lesson.intro)}</p>
        <h4>أهم النقط</h4>
        <ul class="awareness-steps" style="list-style:disc">${lesson.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        ${visualHtml(lesson.visual)}
        ${tryNow}
        ${sources}
      </div>
      <section>
        <h3 class="text-base font-black text-white mb-3">أسئلة الدرس — جاوب السؤالين</h3>
        <div class="space-y-4" id="lessonQuiz"></div>
      </section>
      <div id="lessonDone" class="awareness-result">
        ${done
          ? `<p class="text-base font-black text-emerald-300">✓ خلّصت الدرس ده (${correctCount}/${lesson.quiz.length} صح)</p>`
          : allAnswered
            ? (correctCount === lesson.quiz.length
              ? `<p class="text-base font-black text-emerald-300">🎉 إجاباتك كلها صح!</p>`
              : `<p class="text-sm font-extrabold text-amber-300">فيه ${lesson.quiz.length - correctCount} إجابة غلط — أعد الأسئلة عشان تاخد شارة الدورة.</p>`)
            : `<p class="text-sm font-extrabold text-slate-300">جاوب السؤالين الأول عشان تخلّص الدرس.</p>`}
        <div class="flex flex-wrap gap-2 mt-4">
          ${allAnswered && correctCount === lesson.quiz.length && !done
            ? `<button id="markDone" class="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-3 rounded-xl text-sm font-extrabold transition active:scale-95">خلّصت الدرس ✓</button>` : ''}
          ${allAnswered && correctCount < lesson.quiz.length
            ? `<button id="retryQuiz" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl text-sm font-extrabold transition active:scale-95">أعد الأسئلة</button>` : ''}
          ${nextLesson
            ? `<a href="#/academy/${esc(course.slug)}/${esc(nextLesson.id)}" class="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl text-sm font-extrabold transition">الدرس اللي بعده ←</a>`
            : `<a href="#/academy/${esc(course.slug)}" class="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl text-sm font-extrabold transition">ارجع للدورة</a>`}
        </div>
      </div>`;
    // أسئلة الدرس
    const qWrap = document.getElementById('lessonQuiz');
    qWrap.innerHTML = lesson.quiz.map((q, qi) => {
      const ans = answers[qi];
      return `<div class="awareness-quiz">
        <h3 class="awareness-quiz__q">${qi + 1}. ${esc(q.q)}</h3>
        <div class="space-y-2">
          ${q.options.map((o, oi) => {
            let cls = 'awareness-opt';
            if (ans !== undefined) {
              if (oi === q.correct) cls += ' awareness-opt--correct';
              else if (oi === ans) cls += ' awareness-opt--wrong';
            }
            return `<button data-q="${qi}" data-opt="${oi}" class="${cls}" ${ans !== undefined ? 'disabled' : ''}>${esc(o)}</button>`;
          }).join('')}
        </div>
        ${ans !== undefined ? `<div class="awareness-why ${ans === q.correct ? 'awareness-why--good' : 'awareness-why--bad'}"><b>${ans === q.correct ? '✅ إجابة صح!' : '❌ مش دي الإجابة الصح.'}</b><p><b>السبب:</b> ${esc(q.why)}</p></div>` : ''}
      </div>`;
    }).join('');
    qWrap.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const qi = Number(b.dataset.q);
      answers[qi] = Number(b.dataset.opt);
      persistAnswers();
      paint();
    }));
    const markBtn = document.getElementById('markDone');
    if (markBtn) markBtn.addEventListener('click', () => {
      const s2 = academyState();
      s2.courses[course.slug] = s2.courses[course.slug] || { lessons: {} };
      s2.courses[course.slug].lessons[lesson.id] = { done: true, answers: [...answers] };
      saveState(s2);
      const p = courseProgress(course, s2);
      if (p.earned) {
        // شارة الدورة اتاخدت — عرض احتفال بسيط.
        paint();
        const doneBox = document.getElementById('lessonDone');
        if (doneBox) doneBox.insertAdjacentHTML('beforeend',
          `<p class="text-base font-black text-emerald-300 mt-3">🏆 مبروك! خلّصت الدورة وخدت شارة «${esc(course.badge.label)}» ${esc(course.badge.emoji)}</p>`);
      } else {
        paint();
      }
    });
    const retryBtn = document.getElementById('retryQuiz');
    if (retryBtn) retryBtn.addEventListener('click', () => {
      answers = [];
      persistAnswers();
      paint();
    });
    refreshIcons();
  }

  function persistAnswers() {
    const s2 = academyState();
    s2.courses[course.slug] = s2.courses[course.slug] || { lessons: {} };
    const prev = s2.courses[course.slug].lessons[lesson.id] || {};
    s2.courses[course.slug].lessons[lesson.id] = { done: prev.done === true, answers: [...answers] };
    saveState(s2);
  }

  paint();
  window.scrollTo({ top: 0 });
}

// ================= الموزّع =================
export async function renderAcademy(el, hash) {
  try {
    const data = await loadAcademy();
    const m = (hash || '#/academy').match(/^#\/academy(?:\/([\w-]+))?(?:\/([\w-]+))?/);
    if (m && m[1] && m[2]) return renderLesson(el, data, m[1], m[2]);
    if (m && m[1]) return renderCourse(el, data, m[1]);
    return renderAcademyList(el, data);
  } catch (err) {
    console.warn('academy failed', err);
    el.innerHTML = `${backLink()}<div class="awareness-topic"><h3>تعذر تحميل الأكاديمية</h3><p class="awareness-topic__lead">جرّب تاني بعد شوية، أو ارجع للصفحة الرئيسية للقسم.</p></div>`;
    refreshIcons();
  }
  return null;
}
