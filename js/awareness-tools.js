// أدوات مركز الوعي الرقمي التفاعلية (المرحلة 3).
// كل أداة بتشتغل على جهاز المستخدم بس: التقدم والشارات بتتحفظ في
// localStorage، وكلمة السر في الفاحص مش بتتبعت ولا بتتحفظ أبداً.
import { AWARENESS_EMERGENCY_NUMBERS } from './config.js';

export const TOOL_IDS = ['quiz', 'security-checklist', 'password-checker', 'scam-detector', 'incident-guide'];

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

let cache = {};
async function toolData() {
  if (cache.all) return cache.all;
  const [quiz, checklist, incident, scam] = await Promise.all([
    loadJson('data/awareness/quiz.json'),
    loadJson('data/awareness/checklist.json'),
    loadJson('data/awareness/incident.json'),
    loadJson('data/awareness/scam.json')
  ]);
  cache.all = { quiz, checklist, incident, scam };
  return cache.all;
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

function backLink() {
  return `<a href="#/" class="inline-flex items-center gap-1 text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-full transition hover:bg-amber-500 hover:text-slate-950 active:scale-95">→ كل الأدوات</a>`;
}

function toolHero(icon, title, intro) {
  return `<section class="awareness-hero">
    <span class="awareness-hero__badge"><i data-lucide="${esc(icon)}" class="w-4 h-4"></i> أداة تفاعلية</span>
    <h2 class="awareness-hero__title">${esc(title)}</h2>
    <p class="awareness-hero__text">${esc(intro)}</p>
  </section>`;
}

// ================= الاختبار =================
const QUIZ_KEY = 'ism_awareness_quiz';
function quizState() {
  return lsGet(QUIZ_KEY, { best: {}, badges: [] });
}
function quizSave(s) { lsSet(QUIZ_KEY, s); }

function badgeCard(b, earned) {
  return `<div class="awareness-badge ${earned ? '' : 'awareness-badge--locked'}">
    <span class="awareness-badge__emoji">${esc(b.emoji)}</span>
    <span class="awareness-badge__label">${esc(b.label)}</span>
    <span class="awareness-badge__desc">${esc(b.desc)}</span>
    ${earned ? '<span class="awareness-badge__got">✓ حصلت عليها</span>' : ''}
  </div>`;
}

function renderQuizHome(el, data) {
  const st = quizState();
  const levels = data.quiz.levels.map((l) => {
    const qs = data.quiz.questions[l.id] || [];
    const best = st.best[l.id];
    return `<button data-quiz-level="${esc(l.id)}" class="awareness-card text-start w-full">
      <span class="awareness-card__icon"><i data-lucide="clipboard-list" class="w-5 h-5"></i></span>
      <span class="awareness-card__title">${esc(l.label)}</span>
      <span class="awareness-card__desc">${esc(l.hint)} · ${qs.length} أسئلة</span>
      <span class="awareness-card__meta">${best != null ? `أفضل نتيجة: ${best}%` : 'ابدأ ←'}</span>
    </button>`;
  }).join('');
  el.innerHTML = `${backLink()}
    ${toolHero('clipboard-list', 'اختبار الوعي الرقمي', data.quiz.intro)}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${levels}</div>
    <section>
      <h3 class="text-base font-black text-white mb-3">شاراتك</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        ${data.quiz.badges.map((b) => badgeCard(b, st.badges.includes(b.id))).join('')}
      </div>
      <p class="text-[11px] text-slate-500 font-semibold leading-relaxed mt-3">${esc(data.quiz.badgesNote)}</p>
    </section>`;
  el.querySelectorAll('[data-quiz-level]').forEach((b) =>
    b.addEventListener('click', () => renderQuizRun(el, data, b.dataset.quizLevel)));
  refreshIcons();
}

function renderQuizRun(el, data, levelId) {
  const level = data.quiz.levels.find((l) => l.id === levelId);
  const qs = data.quiz.questions[levelId] || [];
  let idx = 0;
  let answers = []; // {choice, correct}
  let answered = false;

  function showQuestion() {
    const q = qs[idx];
    answered = false;
    el.innerHTML = `${backLink()}
      ${toolHero('clipboard-list', `اختبار الوعي الرقمي — ${level.label}`, `سؤال ${idx + 1} من ${qs.length}`)}
      <div class="awareness-quiz">
        <div class="awareness-progress"><span style="width:${Math.round((idx / qs.length) * 100)}%"></span></div>
        <h3 class="awareness-quiz__q">${esc(q.q)}</h3>
        <div class="space-y-2" id="quizOptions">
          ${q.options.map((o, i) => `<button data-opt="${i}" class="awareness-opt">${esc(o)}</button>`).join('')}
        </div>
        <div id="quizWhy" class="hidden"></div>
        <div class="flex gap-2 mt-4">
          <button id="quizNext" class="hidden flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-3 rounded-xl text-sm font-extrabold transition active:scale-95">${idx + 1 === qs.length ? 'شوف النتيجة' : 'السؤال اللي بعده ←'}</button>
        </div>
      </div>`;
    el.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const choice = Number(b.dataset.opt);
      const correct = choice === q.correct;
      answers[idx] = { choice, correct };
      el.querySelectorAll('[data-opt]').forEach((ob) => {
        const oi = Number(ob.dataset.opt);
        if (oi === q.correct) ob.classList.add('awareness-opt--correct');
        else if (oi === choice) ob.classList.add('awareness-opt--wrong');
        ob.disabled = true;
      });
      const why = document.getElementById('quizWhy');
      const readLink = q.read
        ? `<a href="#/topic/${esc(q.read)}" class="awareness-quiz__read">اقرأ أكتر عن الموضوع ←</a>` : '';
      why.innerHTML = `<div class="awareness-why ${correct ? 'awareness-why--good' : 'awareness-why--bad'}">
        <b>${correct ? '✅ إجابة صح!' : '❌ مش دي الإجابة الصح.'}</b>
        <p>${esc(q.why)}</p>${readLink}</div>`;
      why.classList.remove('hidden');
      const next = document.getElementById('quizNext');
      next.classList.remove('hidden');
      next.addEventListener('click', () => {
        if (idx + 1 < qs.length) { idx++; showQuestion(); }
        else showQuizResult(el, data, levelId, answers);
      });
    }));
    refreshIcons();
    window.scrollTo({ top: 0 });
  }
  showQuestion();
}

function showQuizResult(el, data, levelId, answers) {
  const qs = data.quiz.questions[levelId] || [];
  const level = data.quiz.levels.find((l) => l.id === levelId);
  const score = answers.filter((a) => a && a.correct).length;
  const pct = Math.round((score / qs.length) * 100);
  const st = quizState();
  if (st.best[levelId] == null || pct > st.best[levelId]) st.best[levelId] = pct;
  const earnedNow = [];
  const byTopic = {};
  qs.forEach((q, i) => {
    const t = q.topic || 'other';
    byTopic[t] = byTopic[t] || { total: 0, ok: 0 };
    byTopic[t].total++;
    if (answers[i] && answers[i].correct) byTopic[t].ok++;
  });
  const allOk = (t) => byTopic[t] && byTopic[t].total > 0 && byTopic[t].ok === byTopic[t].total;
  const grant = (id) => { if (!st.badges.includes(id)) { st.badges.push(id); earnedNow.push(id); } };
  if (pct >= 70) grant('aware');
  if (allOk('account')) grant('guard');
  if (allOk('scam')) grant('detective');
  if (allOk('privacy')) grant('privacy');
  if (levelId === 'advanced' && pct >= 80) grant('advanced');
  quizSave(st);
  const verdict = pct === 100 ? 'ممتاز! وعيك الرقمي قوي 🎉'
    : pct >= 70 ? 'كويس جداً — كمّل على كده'
    : pct >= 40 ? 'فيه حاجات محتاجة تتراجع — اقرأ المواضيع اللي غلطت فيها'
    : 'ابدأ من المواضيع الأساسية في الأقسام الستة';
  const newBadges = data.quiz.badges.filter((b) => earnedNow.includes(b.id));
  el.innerHTML = `${backLink()}
    ${toolHero('trophy', `نتيجتك في مستوى ${level.label}`, verdict)}
    <div class="awareness-result">
      <p class="awareness-result__score">${score} / ${qs.length}</p>
      <p class="awareness-result__pct">${pct}%</p>
      <div class="awareness-progress"><span style="width:${pct}%"></span></div>
      ${newBadges.length ? `<h3 class="text-sm font-black text-white mt-4 mb-2">🎉 شارات جديدة حصلت عليها:</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${newBadges.map((b) => badgeCard(b, true)).join('')}</div>` : ''}
      <div class="flex flex-wrap gap-2 mt-5">
        <button id="quizRetry" class="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-3 rounded-xl text-sm font-extrabold transition active:scale-95">العب تاني</button>
        <a href="#/quiz" class="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl text-sm font-extrabold transition">مستوى تاني</a>
      </div>
    </div>`;
  document.getElementById('quizRetry').addEventListener('click', () => renderQuizRun(el, data, levelId));
  refreshIcons();
  window.scrollTo({ top: 0 });
}

async function renderQuiz(el) {
  const data = await toolData();
  renderQuizHome(el, data);
}

// ================= قايمة تأمين الحسابات =================
const CHECKLIST_KEY = 'ism_awareness_checklist';

function checklistVerdict(pct) {
  if (pct === 100) return 'حماية كاملة 🎉 — حافظ عليها';
  if (pct >= 67) return 'حمايتك قوية 💪 — فاضل خطوات بسيطة';
  if (pct >= 34) return 'حمايتك متوسطة — كمّل الباقي';
  if (pct > 0) return 'بداية كويسة بس لسه بدري';
  return 'حساباتك محتاجة اهتمام — ابدأ من أول خطوة';
}

async function renderChecklist(el) {
  const data = await toolData();
  const items = data.checklist.items;
  let checked = new Set(lsGet(CHECKLIST_KEY, []));

  function paint() {
    const done = items.filter((it) => checked.has(it.id)).length;
    const pct = Math.round((done / items.length) * 100);
    el.innerHTML = `${backLink()}
      ${toolHero('shield-check', 'قايمة تأمين حساباتك', data.checklist.intro)}
      <div class="awareness-result">
        <p class="awareness-result__score">${done} من ${items.length}</p>
        <p class="awareness-result__pct">${pct}%</p>
        <div class="awareness-progress"><span style="width:${pct}%"></span></div>
        <p class="text-sm font-extrabold text-white mt-3">${checklistVerdict(pct)}</p>
      </div>
      <div class="space-y-2">
        ${items.map((it) => {
          const on = checked.has(it.id);
          return `<div class="awareness-check ${on ? 'awareness-check--on' : ''}">
            <button data-check="${esc(it.id)}" class="flex items-start gap-3 text-start flex-1 min-w-0">
              <span class="awareness-check__box">${on ? '✓' : ''}</span>
              <span class="text-start">
                <span class="block text-sm font-extrabold text-white leading-relaxed">${esc(it.q)}</span>
                ${it.how ? `<span class="block text-xs font-semibold text-slate-400 leading-relaxed mt-1">${esc(it.how)}</span>` : ''}
              </span>
            </button>
            ${it.read ? `<a href="#/topic/${esc(it.read)}" class="text-xs font-extrabold text-sky-400 shrink-0 mt-1">اعرف إزاي ←</a>` : ''}
          </div>`;
        }).join('')}
      </div>
      <p class="text-[11px] text-slate-500 font-semibold leading-relaxed">اختياراتك بتتحفظ على موبايلك بس ومش بتتبعت لأي حد.</p>`;
    el.querySelectorAll('[data-check]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.check;
      if (checked.has(id)) checked.delete(id); else checked.add(id);
      lsSet(CHECKLIST_KEY, [...checked]);
      paint();
    }));
    refreshIcons();
  }
  paint();
}

// ================= فاحص قوة كلمة السر =================
// بيشتغل على جهاز المستخدم بس — القيمة مش بتتبعت ولا بتتحفظ أبداً.
const COMMON_PASSWORDS = ['123456', '123456789', '12345678', 'password', 'qwerty', '111111', '123123', 'abc123', '000000', 'ahmed', 'mohamed', '12345', '654321', '112233', '121212', '1234', 'admin', 'letmein', 'welcome'];

function passwordScore(pw) {
  let score = 0;
  const checks = [];
  const hasLen12 = pw.length >= 12;
  const hasLen8 = pw.length >= 8;
  const hasLower = /[a-zأ-ي]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9أ-ي\s]/.test(pw);
  const isCommon = COMMON_PASSWORDS.includes(pw.toLowerCase());
  const hasSeq = /(012|123|234|345|456|567|678|789|890|abc|qwe)/i.test(pw);
  if (hasLen12) score += 30; else if (hasLen8) score += 15;
  if (hasLower && hasUpper) score += 15; else if (hasLower || hasUpper) score += 5;
  if (hasDigit) score += 15;
  if (hasSymbol) score += 15;
  if (!isCommon && !hasSeq) score += 15;
  if (pw.length >= 16) score += 10;
  score = Math.min(100, score);
  checks.push({ ok: hasLen12, label: '12 حرف أو أكتر' });
  checks.push({ ok: hasLower && hasUpper, label: 'حروف كبيرة وصغيرة' });
  checks.push({ ok: hasDigit, label: 'فيها أرقام' });
  checks.push({ ok: hasSymbol, label: 'فيها رموز (مثل ! @ #)' });
  checks.push({ ok: !isCommon, label: 'مش كلمة شائعة وسهلة التخمين' });
  checks.push({ ok: !hasSeq, label: 'مش فيها تسلسل زي 123 أو abc' });
  const verdict = score >= 90 ? 'قوية جداً 💪' : score >= 70 ? 'قوية' : score >= 40 ? 'متوسطة' : 'ضعيفة ⚠️';
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#facc15' : '#f87171';
  return { score, checks, verdict, color };
}

async function renderPasswordChecker(el) {
  el.innerHTML = `${backLink()}
    ${toolHero('key-round', 'فاحص قوة كلمة السر', 'اكتب كلمة شبه كلمتك (مش لازم الحقيقية). الفحص بيحصل على موبايلك بس — الكلمة مش بتتبعت لأي حد ومش بتتحفظ.')}
    <div class="awareness-pw">
      <label class="text-sm font-extrabold text-white" for="pwInput">كلمة السر</label>
      <div class="flex gap-2 mt-2">
        <input id="pwInput" type="password" autocomplete="off" placeholder="اكتب كلمة السر هنا" class="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-sm font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400" dir="ltr">
        <button id="pwToggle" class="bg-slate-800 hover:bg-slate-700 text-white px-3 rounded-xl text-xs font-extrabold transition">إظهار</button>
      </div>
      <div id="pwResult" class="hidden mt-4">
        <div class="flex items-baseline justify-between">
          <span id="pwVerdict" class="text-base font-black"></span>
          <span id="pwScore" class="text-sm font-extrabold text-slate-400" dir="ltr"></span>
        </div>
        <div class="awareness-progress mt-2"><span id="pwBar" style="width:0%"></span></div>
        <ul id="pwChecks" class="space-y-1.5 mt-3"></ul>
      </div>
      <div class="awareness-tip mt-4"><b>💡 فكرة لكلمة سر قوية وسهلة تفتكرها</b>
        <ul><li>جملة من 4 كلمات أو أكتر ملهاش علاقة ببعض، زي: «شمسية-برتقان-قطر-الساعة٧».</li>
        <li>أو خلي مدير كلمات السر اللي في موبايلك يعملك كلمة عشوائية ويحفظها.</li></ul>
      </div>
      <p class="text-[11px] text-slate-500 font-semibold leading-relaxed mt-3">الأداة دي مش بتبعت أي حاجة على الإنترنت. لو حابب تتأكد: اقفل النت وجرّبها، هتشتغل عادي.</p>
    </div>`;
  const input = document.getElementById('pwInput');
  const toggle = document.getElementById('pwToggle');
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'إخفاء' : 'إظهار';
  });
  input.addEventListener('input', () => {
    const pw = input.value;
    const res = document.getElementById('pwResult');
    if (!pw) { res.classList.add('hidden'); return; }
    const { score, checks, verdict, color } = passwordScore(pw);
    res.classList.remove('hidden');
    document.getElementById('pwVerdict').textContent = verdict;
    document.getElementById('pwVerdict').style.color = color;
    document.getElementById('pwScore').textContent = score + ' / 100';
    const bar = document.getElementById('pwBar');
    bar.style.width = score + '%';
    bar.style.background = color;
    document.getElementById('pwChecks').innerHTML = checks.map((c) =>
      `<li class="text-xs font-bold ${c.ok ? 'text-emerald-300' : 'text-slate-400'}">${c.ok ? '✓' : '○'} ${esc(c.label)}</li>`).join('');
  });
  refreshIcons();
}

// ================= كاشف رسائل النصب =================
const SCAM_KEY = 'ism_awareness_scam';

async function renderScamDetector(el) {
  const data = await toolData();
  const examples = data.scam.examples;
  let idx = 0;
  let answers = [];
  let answered = false;

  function showExample() {
    const ex = examples[idx];
    answered = false;
    el.innerHTML = `${backLink()}
      ${toolHero('eye', 'اكشف رسالة النصب', data.scam.intro)}
      <div class="awareness-quiz">
        <div class="awareness-progress"><span style="width:${Math.round((idx / examples.length) * 100)}%"></span></div>
        <p class="text-xs font-extrabold text-slate-400">رسالة ${idx + 1} من ${examples.length}</p>
        <div class="awareness-msg">
          <div class="awareness-msg__head"><span class="awareness-msg__channel">${esc(ex.channel)}</span><span>من: ${esc(ex.from)}</span></div>
          <p class="awareness-msg__text">${esc(ex.text)}</p>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-3" id="scamBtns">
          <button data-scam="true" class="bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25 py-3 rounded-xl text-sm font-extrabold transition active:scale-95">🚩 نصب</button>
          <button data-scam="false" class="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 py-3 rounded-xl text-sm font-extrabold transition active:scale-95">✅ سليمة</button>
        </div>
        <div id="scamWhy" class="hidden"></div>
        <div class="flex gap-2 mt-4">
          <button id="scamNext" class="hidden flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-3 rounded-xl text-sm font-extrabold transition active:scale-95">${idx + 1 === examples.length ? 'شوف النتيجة' : 'الرسالة اللي بعدها ←'}</button>
        </div>
      </div>`;
    el.querySelectorAll('[data-scam]').forEach((b) => b.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const guess = b.dataset.scam === 'true';
      const correct = guess === ex.scam;
      answers[idx] = correct;
      el.querySelectorAll('[data-scam]').forEach((ob) => { ob.disabled = true; });
      const why = document.getElementById('scamWhy');
      why.innerHTML = `<div class="awareness-why ${correct ? 'awareness-why--good' : 'awareness-why--bad'}">
        <b>${correct ? '✅ صح!' : '❌ غلط.'} الرسالة دي ${ex.scam ? 'نصب' : 'سليمة'}.</b>
        ${ex.flags && ex.flags.length ? `<p class="mt-2 font-black">العلامات:</p><ul class="list-disc ps-5 space-y-1">${ex.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${ex.verify ? `<p class="mt-2"><b>اتأكد إزاي:</b> ${esc(ex.verify)}</p>` : ''}
        ${ex.action ? `<p class="mt-1"><b>اعمل إيه:</b> ${esc(ex.action)}</p>` : ''}
      </div>`;
      why.classList.remove('hidden');
      const next = document.getElementById('scamNext');
      next.classList.remove('hidden');
      next.addEventListener('click', () => {
        if (idx + 1 < examples.length) { idx++; showExample(); }
        else showScamResult(el, data, answers);
      });
    }));
    refreshIcons();
    window.scrollTo({ top: 0 });
  }

  function showScamResult(el2, data2, answers2) {
    const score = answers2.filter(Boolean).length;
    const pct = Math.round((score / examples.length) * 100);
    const best = lsGet(SCAM_KEY, 0);
    if (pct > best) lsSet(SCAM_KEY, pct);
    el2.innerHTML = `${backLink()}
      ${toolHero('eye', 'نتيجتك في كاشف النصب', score === examples.length ? 'ممتاز! عينك بقت بتميّز النصب 🎉' : 'درّب عينك أكتر — راجع العلامات في الرسايل اللي غلطت فيها')}
      <div class="awareness-result">
        <p class="awareness-result__score">${score} / ${examples.length}</p>
        <p class="awareness-result__pct">${pct}%</p>
        <div class="awareness-progress"><span style="width:${pct}%"></span></div>
        <div class="awareness-bad mt-4" style="border-color:rgba(255,196,0,.35);background:rgba(255,196,0,.08)">
          <b style="color:#facc15">القاعدة الذهبية</b>
          <ul><li style="color:#fef3c7">${esc(data2.scam.goldenRule)}</li></ul>
        </div>
        <button id="scamRetry" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 py-3 rounded-xl text-sm font-extrabold transition active:scale-95 mt-4">العب تاني</button>
      </div>`;
    document.getElementById('scamRetry').addEventListener('click', () => { idx = 0; answers = []; showExample(); });
    refreshIcons();
    window.scrollTo({ top: 0 });
  }

  showExample();
}

// ================= دليل «حسابي اتسرق» =================
async function renderIncidentGuide(el) {
  const data = await toolData();
  const problems = data.incident.problems;

  function showList() {
    el.innerHTML = `${backLink()}
      ${toolHero('life-buoy', 'حسابي اتسرق! أعمل إيه؟', data.incident.intro)}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${problems.map((p) => `<button data-incident="${esc(p.id)}" class="awareness-card text-start">
          <span class="awareness-card__icon awareness-card__icon--gold">${esc(p.emoji)}</span>
          <span class="awareness-card__title">${esc(p.title)}</span>
          <span class="awareness-card__meta">${p.steps.length} خطوات ←</span>
        </button>`).join('')}
      </div>
      <div class="awareness-topic">
        <p class="text-sm font-black text-white mb-2">أرقام مهمة — اتصل فوراً لو فيه فلوس أو ابتزاز:</p>
        <div class="flex flex-wrap gap-2">
          ${AWARENESS_EMERGENCY_NUMBERS.filter((n) => n.tel !== null).map((n) =>
            `<a href="tel:${esc(n.number)}" class="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-full text-xs font-extrabold transition">${esc(n.name)}: <span dir="ltr">${esc(n.number)}</span></a>`).join('')}
        </div>
        <p class="text-[11px] text-slate-500 font-semibold leading-relaxed mt-3">ماتدفعش أي فلوس، وماتمسحش الرسايل، صوّرها واحفظها كدليل.</p>
      </div>
      <p class="text-[11px] text-slate-500 font-semibold leading-relaxed">«دليل خدمات الإسماعيلية» منصة توعية محلية، مش جهة حكومية ولا جهة تحقيق. للبلاغات الرسمية استخدم الأرقام الرسمية المذكورة.</p>`;
    el.querySelectorAll('[data-incident]').forEach((b) =>
      b.addEventListener('click', () => showProblem(b.dataset.incident)));
    refreshIcons();
  }

  function showProblem(id) {
    const p = problems.find((x) => x.id === id);
    if (!p) { showList(); return; }
    el.innerHTML = `${backLink()}
      ${toolHero('life-buoy', p.title, 'امشي على الخطوات بالترتيب — الأهم الأول.')}
      <div class="awareness-topic">
        <ol class="awareness-steps">${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        ${p.links && p.links.length ? `<div class="awareness-src"><b>روابط رسمية:</b> ${p.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' · ')}</div>` : ''}
      </div>
      <button id="incidentBack" class="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl text-sm font-extrabold transition active:scale-95">← اختار مشكلة تانية</button>`;
    document.getElementById('incidentBack').addEventListener('click', showList);
    refreshIcons();
    window.scrollTo({ top: 0 });
  }

  showList();
}

// ================= الموزّع =================
export async function renderTool(id, el) {
  try {
    if (id === 'quiz') return renderQuiz(el);
    if (id === 'security-checklist') return renderChecklist(el);
    if (id === 'password-checker') return renderPasswordChecker(el);
    if (id === 'scam-detector') return renderScamDetector(el);
    if (id === 'incident-guide') return renderIncidentGuide(el);
  } catch (err) {
    console.warn('awareness tool failed', err);
    el.innerHTML = `${backLink()}<div class="awareness-topic"><h3>تعذر تحميل الأداة</h3><p class="awareness-topic__lead">جرّب تاني بعد شوية، أو ارجع للصفحة الرئيسية للقسم.</p></div>`;
    refreshIcons();
  }
  return null;
}
