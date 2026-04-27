(() => {
'use strict';

/* ============== STORAGE ============== */
const STORE_KEY = 'mindtrack:v2';
const THEME_KEY = 'mindtrack:theme';
const READ_KEY = 'mindtrack:read';
const RECAP_KEY = 'mindtrack:lastrecap';
const IDENTITY_KEY = 'mindtrack:identity';

const defaultState = {
  targets: { idealSleep: 8, maxCaffeine: 2, idealWater: 8 },
  habits: [
    { id: 'h1', name: 'Drink water on wake', icon: '💧' },
    { id: 'h2', name: '10-min walk', icon: '🚶' },
    { id: 'h3', name: 'Read 10 min', icon: '📖' },
  ],
  customFields: [],
  trackPrefs: { sleep:true, sleepDetails:true, intake:true, feel:true, body:true, custom:true },
  logs: {},
  onboarded: false,
  mode: 'quick',
};
let state = load();
let readArticles = loadRead();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(defaultState);
    const p = JSON.parse(raw);
    return Object.assign(structuredClone(defaultState), p, {
      targets: Object.assign({}, defaultState.targets, p.targets || {}),
      trackPrefs: Object.assign({}, defaultState.trackPrefs, p.trackPrefs || {}),
    });
  } catch { return structuredClone(defaultState); }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast('Could not save'); }
}
function loadRead() {
  try { return JSON.parse(localStorage.getItem(READ_KEY) || '[]'); } catch { return []; }
}
function saveRead() { localStorage.setItem(READ_KEY, JSON.stringify(readArticles)); }

/* ============== DATE HELPERS ============== */
const pad = n => String(n).padStart(2, '0');
const todayKey = () => dateKey(new Date());
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
const prettyDate = (d, o={}) => (typeof d === 'string' ? fromKey(d) : d)
  .toLocaleDateString(undefined, Object.assign({ weekday:'short', month:'short', day:'numeric' }, o));
function lastNDays(n) {
  const out = []; const today = new Date();
  for (let i = n-1; i >= 0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); out.push(dateKey(d)); }
  return out;
}

/* ============== SCORE ============== */
function computeScore(log, t) {
  if (!log) return { total: 0, breakdown: [], empty: true };
  const bd = [];
  let sleepPts = 0;
  if (typeof log.sleep === 'number') sleepPts = Math.max(0, 25 - Math.abs(log.sleep - t.idealSleep) * 5);
  bd.push({ name:'Sleep', points:Math.round(sleepPts), max:25, note: log.sleep!=null?`${log.sleep}h vs ${t.idealSleep}h`:'Not logged' });

  let intPts = 10;
  if (typeof log.sleepInt === 'number') intPts = Math.max(0, 10 - log.sleepInt*2);
  bd.push({ name:'Sleep quality', points:intPts, max:10, note: log.sleepInt!=null?`${log.sleepInt} interruptions`:'Not logged' });

  let cafPts = 15;
  if (typeof log.caffeine === 'number') {
    const over = Math.max(0, log.caffeine - t.maxCaffeine);
    cafPts = Math.max(0, 15 - over*5);
  }
  bd.push({ name:'Caffeine', points:cafPts, max:15, note: log.caffeine!=null?`${log.caffeine} cups (max ${t.maxCaffeine})`:'Not logged' });

  let waterPts = 0;
  if (typeof log.water === 'number') waterPts = Math.min(10, Math.round((log.water / t.idealWater) * 10));
  bd.push({ name:'Hydration', points:waterPts, max:10, note: log.water!=null?`${log.water}/${t.idealWater} glasses`:'Not logged' });

  let migPts = 15;
  if (typeof log.migraine === 'number') migPts = Math.max(0, Math.round(15 - log.migraine*1.5));
  bd.push({ name:'Migraine-free', points:migPts, max:15, note: log.migraine?`Severity ${log.migraine}/10`:'No migraine' });

  let stressPts = 10;
  if (typeof log.stress === 'number') stressPts = Math.max(0, 10 - log.stress);
  bd.push({ name:'Stress', points:stressPts, max:10, note: log.stress!=null?stressDescriptor(log.stress):'Not logged' });

  let achePts = 5;
  if (typeof log.aches === 'number') achePts = Math.max(0, 5 - Math.round(log.aches/2));
  bd.push({ name:'Body comfort', points:achePts, max:5, note: log.aches?`Aches ${log.aches}/10`:'No aches' });

  const habits = state.habits || [];
  const done = (log.habits || []).length;
  const habitsPts = habits.length > 0 ? Math.round((done / habits.length) * 10) : 10;
  bd.push({ name:'Habits', points:habitsPts, max:10, note: habits.length?`${done}/${habits.length} done`:'No habits set' });

  const total = bd.reduce((s,x) => s + x.points, 0);
  return { total: Math.min(100, Math.round(total)), breakdown: bd };
}
const scoreBucket = n => n >= 75 ? 'good' : n >= 50 ? 'mid' : 'low';
function scoreMessage(n, has) {
  if (!has) return "Log your first day to see your score";
  if (n >= 90) return "Amazing day 🌟 Keep this rhythm.";
  if (n >= 75) return "Great job 🔥 You're on track.";
  if (n >= 60) return "Solid day 💪 Small tweaks tomorrow.";
  if (n >= 40) return "Room to improve — you've got this 💪";
  return "Tough day. Be kind to yourself 🌱 Tomorrow's a reset.";
}
const stressDescriptor = v => v<=2?'Low':v<=5?'Moderate':v<=7?'High':'Very high';
const migraineDescriptor = v => v===0?'None':v<=3?'Mild':v<=6?'Moderate':v<=8?'Severe':'Very severe';

/* ============== INSIGHTS ============== */
function logsArray() {
  return Object.entries(state.logs).map(([k,v]) => ({ key:k, ...v })).sort((a,b) => a.key < b.key ? -1 : 1);
}
const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;

function generatePatterns() {
  const all = logsArray();
  const recent = all.slice(-21);
  const out = [];
  const t = state.targets;

  const migDays = recent.filter(l => (l.migraine||0) >= 4);
  const clearDays = recent.filter(l => (l.migraine||0) < 4 && l.migraine != null);

  // Early signals (3-6 logs)
  if (recent.length >= 3 && recent.length < 7) {
    if (migDays.length >= 1) {
      const md = migDays[0];
      const triggers = [];
      if ((md.sleep||0) < t.idealSleep - 1) triggers.push(`low sleep (${md.sleep}h)`);
      if ((md.caffeine||0) > t.maxCaffeine) triggers.push(`high caffeine (${md.caffeine} cups)`);
      if ((md.stress||0) >= 6) triggers.push(`high stress`);
      if (triggers.length) {
        out.push({ kind:'early', emo:'⚠️', title:'Early signal — possible migraine triggers', body:`Your migraine on ${prettyDate(md.key)} happened with ${triggers.join(' + ')}. Two more similar days will confirm a pattern.` });
      }
    }
    if (out.length === 0) {
      out.push({ kind:'good', emo:'📊', title:'Building your baseline', body:`You have ${recent.length} logs. Patterns will start appearing after 4 logs — keep going.` });
    }
    return out;
  }

  if (recent.length < 3) {
    out.push({ kind:'good', emo:'📊', title:'Keep logging', body:`Log a few more days (you have ${recent.length} of 4) to unlock pattern detection.` });
    return out;
  }

  // Strong patterns (7+ logs)
  if (migDays.length >= 2 && clearDays.length >= 2) {
    const sm = avg(migDays.map(l => l.sleep || 0)); const sn = avg(clearDays.map(l => l.sleep || 0));
    if (sm != null && sn != null && (sn - sm) > 0.5) {
      out.push({ kind:'warn', emo:'🌙', title:'Less sleep → more migraines', body:`On migraine days you slept ${sm.toFixed(1)}h on average, vs ${sn.toFixed(1)}h on clear days. Aim closer to ${t.idealSleep}h.` });
    }
    const cm = avg(migDays.map(l => l.caffeine || 0)); const cn = avg(clearDays.map(l => l.caffeine || 0));
    if (cm != null && cn != null && (cm - cn) > 0.5) {
      out.push({ kind:'warn', emo:'☕', title:'Higher caffeine → more migraines', body:`Migraine days averaged ${cm.toFixed(1)} cups vs ${cn.toFixed(1)} on clear days. Try capping at ${t.maxCaffeine}.` });
    }
    const stm = avg(migDays.map(l => l.stress || 0)); const stn = avg(clearDays.map(l => l.stress || 0));
    if (stm - stn > 1) {
      out.push({ kind:'warn', emo:'💗', title:'High stress days bring migraines', body:`Stress on migraine days averaged ${stm.toFixed(1)} vs ${stn.toFixed(1)}. Try a 5-min breathing break.` });
    }
  }

  const interrupted = recent.filter(l => (l.sleepInt||0) >= 2);
  const calm = recent.filter(l => (l.sleepInt||0) < 2 && l.sleepInt != null);
  if (interrupted.length >= 2 && calm.length >= 2) {
    const sa = avg(interrupted.map(l => computeScore(l, t).total));
    const sb = avg(calm.map(l => computeScore(l, t).total));
    if (sb - sa > 5) out.push({ kind:'warn', emo:'😴', title:'Sleep interruptions hurt your score', body:`Interrupted nights average ${Math.round(sa)} vs ${Math.round(sb)} on calm nights.` });
  }

  // Notes patterns
  const noteWords = recent.filter(l => l.notes && l.notes.length > 3 && (l.migraine||0) >= 4)
    .map(l => l.notes.toLowerCase());
  const commonWords = ['painkiller','medicine','headache','tired','stressed','screen'];
  const found = commonWords.find(w => noteWords.filter(n => n.includes(w)).length >= 2);
  if (found) {
    const count = noteWords.filter(n => n.includes(found)).length;
    out.push({ kind:'early', emo:'📝', title:`"${found}" mentioned often`, body:`${count} of your migraine notes mention "${found}". Worth tracking.` });
  }

  const last7 = recent.slice(-7); const prev7 = recent.slice(-14, -7);
  if (last7.length >= 4 && prev7.length >= 4) {
    const a = avg(last7.map(l => computeScore(l, t).total));
    const b = avg(prev7.map(l => computeScore(l, t).total));
    if (a - b >= 5) out.push({ kind:'good', emo:'🎉', title:'You are improving', body:`Your weekly average rose from ${Math.round(b)} to ${Math.round(a)}. Keep going.` });
    else if (b - a >= 5) out.push({ kind:'warn', emo:'📉', title:'Slight dip this week', body:`Down from ${Math.round(b)} to ${Math.round(a)}. Pick one habit to focus on tomorrow.` });
  }

  if (out.length === 0) out.push({ kind:'good', emo:'🧘', title:'Looking steady', body:'No strong patterns yet. Patterns become clearer over 2–3 weeks.' });
  return out;
}

/* ============== TODAY'S FOCUS ============== */
function generateTodayFocus() {
  const all = logsArray();
  if (all.length === 0) return "Make your first entry to unlock daily focus";
  const t = state.targets;
  const todayK = todayKey();
  const yesterdayK = (() => { const d = new Date(); d.setDate(d.getDate()-1); return dateKey(d); })();
  const last = state.logs[yesterdayK] || all[all.length - 1];
  if (!last) return "Log today to keep your streak going";

  const focuses = [];
  if (last.sleep != null && last.sleep < t.idealSleep - 1) {
    const targetTime = last.sleep < 5 ? '10:00 PM' : '10:30 PM';
    focuses.push({ priority: 3, text: `You slept ${last.sleep}h yesterday. Aim for in bed by ${targetTime} tonight.` });
  }
  if (last.caffeine != null && last.caffeine > t.maxCaffeine) {
    focuses.push({ priority: 3, text: `Yesterday: ${last.caffeine} cups. Today: limit to ${t.maxCaffeine}, last cup before 2 PM.` });
  }
  if (last.migraine != null && last.migraine >= 4) {
    focuses.push({ priority: 4, text: `Migraine yesterday — hydrate early, eat a real breakfast, skip screens at lunch.` });
  }
  if (last.stress != null && last.stress >= 6) {
    focuses.push({ priority: 2, text: `Stress was high yesterday. Try a 5-min breathing break before noon.` });
  }
  if (last.water != null && last.water < t.idealWater - 2) {
    focuses.push({ priority: 1, text: `Water low yesterday — start with a glass on wake.` });
  }
  if (last.sleepInt != null && last.sleepInt >= 3) {
    focuses.push({ priority: 2, text: `Sleep was interrupted last night. No screens 60 min before bed tonight.` });
  }

  // If today already logged great, celebrate
  if (state.logs[todayK]) {
    const s = computeScore(state.logs[todayK], t).total;
    if (s >= 85) return "You're already crushing today — keep this rhythm 🌟";
    if (s >= 70) return "Good day so far — finish strong with your evening habits.";
  }

  if (focuses.length === 0) {
    return last.migraine === 0 && (last.sleep||0) >= t.idealSleep - 1
      ? "Yesterday looked good — repeat what worked: sleep on time, water early."
      : "Steady day ahead — log when you're ready.";
  }
  focuses.sort((a,b) => b.priority - a.priority);
  return focuses[0].text;
}

/* ============== STREAKS ============== */
function computeCurrentStreak() {
  let s = 0; const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    if (state.logs[dateKey(d)]) s++; else break;
  }
  return s;
}
function computeBestStreak() {
  const keys = Object.keys(state.logs).sort();
  let best = 0, cur = 0, prev = null;
  keys.forEach(k => {
    const d = fromKey(k);
    if (prev) { const diff = Math.round((d - prev) / 86400000); cur = diff === 1 ? cur + 1 : 1; } else cur = 1;
    best = Math.max(best, cur); prev = d;
  });
  return best;
}
function computeHabitStreak(id) {
  let s = 0; const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const log = state.logs[dateKey(d)];
    if (log && (log.habits||[]).includes(id)) s++; else break;
  }
  return s;
}

/* ============== RENDERING ============== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function renderAll() {
  renderHome(); renderTrack(); renderInsights(); renderHistory(); renderLearn(); renderSettings();
}

/* ===== HOME ===== */
function renderHome() {
  const now = new Date(); const hour = now.getHours();
  const greet = hour<5?'Hey night owl':hour<12?'Good morning':hour<17?'Good afternoon':hour<22?'Good evening':'Good night';
  $('#greetText').textContent = greet;
  $('#greetDate').textContent = now.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });

  // Streak
  const streak = computeCurrentStreak();
  $('#streakNum').textContent = streak;

  // Score
  const log = state.logs[todayKey()];
  const r = computeScore(log, state.targets);
  const has = !!log; const score = has ? r.total : 0;
  const card = $('#scoreCard');
  card.classList.remove('score-good','score-mid','score-low','empty');
  if (has) {
    $('#scoreNum').textContent = score;
    card.classList.add('score-' + scoreBucket(score));
    $('#scoreCtaText').textContent = 'View breakdown';
  } else {
    $('#scoreNum').textContent = '0';
    card.classList.add('empty');
    $('#scoreCtaText').textContent = 'Start logging';
  }
  $('#scoreMessage').textContent = scoreMessage(score, has);
  const circ = 603.18;
  $('#ringFg').style.strokeDashoffset = has ? (circ - (score/100)*circ) : circ;

  // Today's focus
  $('#focusText').textContent = generateTodayFocus();

  // Quick stats
  const grid = $('#quickStats');
  const t = state.targets;
  const cells = [
    { icon:'🌙', label:'Sleep', value: log?.sleep!=null?`${log.sleep}h`:'—', target:`${t.idealSleep}h target`,
      pct: log?.sleep ? Math.min(100, (log.sleep / t.idealSleep) * 100) : 0,
      mod: log && log.sleep != null && Math.abs(log.sleep - t.idealSleep) > 2 ? 'warn' : '' },
    { icon:'☕', label:'Caffeine', value: log?.caffeine!=null?`${log.caffeine}`:'—', target:`max ${t.maxCaffeine}`,
      pct: log?.caffeine!=null ? Math.min(100, (log.caffeine / Math.max(1, t.maxCaffeine*1.5))*100) : 0,
      mod: (log?.caffeine||0) > t.maxCaffeine ? 'alert' : '' },
    { icon:'💧', label:'Water', value: log?.water!=null?`${log.water}`:'—', target:`${t.idealWater} target`,
      pct: log?.water ? Math.min(100, (log.water / t.idealWater)*100) : 0, mod:'' },
    { icon:'💗', label:'Migraine', value: log?.migraine!=null?migraineDescriptor(log.migraine):'—', target:'today',
      pct: log ? (1 - (log.migraine||0)/10)*100 : 0, mod: (log?.migraine||0) >= 4 ? 'alert' : '' },
  ];
  grid.innerHTML = cells.map(c => `
    <div class="stat-card ${c.mod}" data-nav="${c.label==='Migraine'||c.label==='Sleep'?'insights':'track'}">
      <div class="stat-head"><div class="stat-emoji">${c.icon}</div><span class="stat-arrow">→</span></div>
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-target">${c.target}</div>
      <div class="stat-bar"><span style="width:${Math.max(0,c.pct)}%"></span></div>
    </div>`).join('');
  grid.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => navTo(el.dataset.nav)));

  // Habits
  const hh = $('#homeHabits');
  const tl = state.logs[todayKey()] || { habits: [] };
  if (state.habits.length === 0) {
    hh.innerHTML = `<div class="habit-empty">No habits yet. <button class="link-btn" id="emptyAddH">+ Add one</button></div>`;
    document.getElementById('emptyAddH')?.addEventListener('click', () => openModal('habitsModal'));
  } else {
    hh.innerHTML = state.habits.map(h => {
      const done = (tl.habits||[]).includes(h.id);
      return `<div class="habit-item ${done?'done':''}" data-habit="${h.id}">
        <span class="habit-check">${done?'✓':''}</span>
        <span class="habit-icon">${h.icon||'✨'}</span>
        <span class="habit-label">${escapeHtml(h.name)}</span>
      </div>`;
    }).join('');
    hh.querySelectorAll('.habit-item').forEach(el => el.addEventListener('click', () => toggleHabit(el.dataset.habit)));
  }

  // Suggested
  const suggested = [
    { icon:'🌅', title:'Morning walk', body:'10 minutes outside resets your rhythm.' },
    { icon:'🛌', title:'Sleep by 11 PM', body:'A consistent bedtime is the #1 upgrade.' },
    { icon:'☕', title:'Cut afternoon caffeine', body:'No coffee after 2 PM helps deeper sleep.' },
    { icon:'💧', title:'Glass of water on wake', body:'Rehydrates after 7-9 hours fasting.' },
    { icon:'🧘', title:'5-min breathing', body:'Box breathing lowers stress fast.' },
  ];
  $('#suggestedHabits').innerHTML = suggested.map(s => `
    <div class="sug-card">
      <span class="sug-emoji">${s.icon}</span>
      <strong>${s.title}</strong>
      <span>${s.body}</span>
      <button class="sug-add" data-add-habit="${escapeHtml(s.title)}">+ Add habit</button>
    </div>`).join('');
  $('#suggestedHabits').querySelectorAll('[data-add-habit]').forEach(b => {
    b.addEventListener('click', () => {
      const name = b.getAttribute('data-add-habit');
      if (state.habits.find(h => h.name === name)) { toast('Already in your habits'); return; }
      state.habits.push({ id:'h'+Date.now(), name, icon:'✨' });
      save(); renderAll(); toast('Habit added ✨');
    });
  });
}

function toggleHabit(id) {
  const k = todayKey();
  const log = state.logs[k] || newEmptyLog(k);
  log.habits = log.habits || [];
  const i = log.habits.indexOf(id);
  if (i === -1) log.habits.push(id); else log.habits.splice(i, 1);
  state.logs[k] = log; save(); renderHome();
}
const newEmptyLog = k => ({ date:k, habits:[], custom:{} });

/* ===== TRACK ===== */
let currentMode = 'quick';

function renderTrack() {
  const k = todayKey();
  $('#logDate').max = k;
  if (!$('#logDate').value) $('#logDate').value = k;

  // Apply mode
  $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === currentMode));
  $$('.form-group').forEach(g => {
    const show = g.dataset.group === 'quick' || (g.dataset.group === 'full' && currentMode === 'full');
    g.classList.toggle('hidden', !show);
  });

  loadLogIntoForm($('#logDate').value);

  // Custom fields
  $('#customFieldsTrack').innerHTML = state.customFields.map(cf => customFieldHtml(cf)).join('');

  // Track habits
  const th = $('#trackHabits');
  const log = state.logs[$('#logDate').value] || { habits: [] };
  if (state.habits.length === 0) {
    th.innerHTML = `<div class="habit-empty">No habits yet. <button class="link-btn" id="trkAddH" type="button">+ Add habit</button></div>`;
    document.getElementById('trkAddH')?.addEventListener('click', () => openModal('habitsModal'));
  } else {
    th.innerHTML = state.habits.map(h => {
      const done = (log.habits||[]).includes(h.id);
      return `<div class="habit-item ${done?'done':''}" data-thabit="${h.id}">
        <span class="habit-check">${done?'✓':''}</span>
        <span class="habit-icon">${h.icon||'✨'}</span>
        <span class="habit-label">${escapeHtml(h.name)}</span>
      </div>`;
    }).join('');
    th.querySelectorAll('[data-thabit]').forEach(el => el.addEventListener('click', () => {
      el.classList.toggle('done');
      el.querySelector('.habit-check').textContent = el.classList.contains('done') ? '✓' : '';
    }));
  }
}

function customFieldHtml(cf) {
  const k = $('#logDate').value || todayKey();
  const log = state.logs[k]; const val = log?.custom?.[cf.id];
  if (cf.type === 'check') return `<div class="field" data-cf="${cf.id}" data-cftype="${cf.type}">
    <label class="toggle-label"><input type="checkbox" data-cfin ${val?'checked':''}/><span>${escapeHtml(cf.name)}</span></label></div>`;
  if (cf.type === 'number') return `<div class="field" data-cf="${cf.id}" data-cftype="${cf.type}">
    <label>${escapeHtml(cf.name)}</label>
    <input type="number" data-cfin value="${val ?? ''}" inputmode="decimal" placeholder="0"/></div>`;
  return `<div class="field" data-cf="${cf.id}" data-cftype="${cf.type}">
    <label>${escapeHtml(cf.name)} <span class="val" data-cfval>${val ?? 0}</span></label>
    <input type="range" min="0" max="10" step="1" data-cfin value="${val ?? 0}"/></div>`;
}

function getLastLoggedValues() {
  const all = logsArray();
  // Walk backwards to find last value for each field
  const v = {};
  for (let i = all.length - 1; i >= 0; i--) {
    const l = all[i];
    if (v.sleep == null && l.sleep != null) v.sleep = l.sleep;
    if (v.sleepInt == null && l.sleepInt != null) v.sleepInt = l.sleepInt;
    if (v.caffeine == null && l.caffeine != null) v.caffeine = l.caffeine;
    if (v.water == null && l.water != null) v.water = l.water;
    if (v.stress == null && l.stress != null) v.stress = l.stress;
    if (v.aches == null && l.aches != null) v.aches = l.aches;
    if (v.migraine == null && l.migraine != null) v.migraine = l.migraine;
  }
  return v;
}

function loadLogIntoForm(k) {
  const log = state.logs[k];
  const last = getLastLoggedValues();
  // Defaults: existing log > last logged > sensible default
  setRange('sleepHours', log?.sleep ?? last.sleep ?? 7, 'valSleep', v => v + 'h');
  setRange('sleepInt', log?.sleepInt ?? last.sleepInt ?? 0, 'valInt', v => v);
  setRange('caffeine', log?.caffeine ?? last.caffeine ?? 0, 'valCaf', v => v);
  setRange('water', log?.water ?? last.water ?? 0, 'valWater', v => v);
  setRange('migraine', log?.migraine ?? 0, 'valMig', v => migraineDescriptor(+v));
  setRange('stress', log?.stress ?? last.stress ?? 2, 'valStress', v => stressDescriptor(+v));
  setRange('aches', log?.aches ?? 0, 'valAches', v => +v === 0 ? 'None' : v + '/10');

  // Reset skip states
  $$('.field').forEach(f => f.classList.remove('skipped'));
  $$('.skip-btn').forEach(b => b.textContent = 'Skip');

  if (log?.periodPain != null) {
    $('#periodToggle').checked = true;
    $('#periodWrap').classList.remove('hidden');
    setRange('periodPain', log.periodPain, 'valPeriod', v => +v === 0 ? 'None' : v + '/10');
  } else {
    $('#periodToggle').checked = false;
    $('#periodWrap').classList.add('hidden');
  }
  $('#notes').value = log?.notes || '';
}

function setRange(id, value, valId, fmt) {
  const inp = $('#' + id); if (!inp) return;
  inp.value = value;
  if (valId) $('#' + valId).textContent = fmt(value);
}

/* ===== INSIGHTS ===== */
function renderInsights() {
  const all = logsArray();
  const last7 = all.slice(-7); const prev7 = all.slice(-14, -7);
  const cur = avg(last7.map(l => computeScore(l, state.targets).total));
  const prev = avg(prev7.map(l => computeScore(l, state.targets).total));
  const sleep = avg(last7.map(l => l.sleep || 0).filter(Boolean));
  const caf = avg(last7.map(l => l.caffeine || 0));
  const migDays = last7.filter(l => (l.migraine||0) >= 4).length;

  // Unlock progress
  const unlock = $('#patternUnlock');
  if (all.length < 4) {
    unlock.classList.remove('hidden');
    $('#unlockText').textContent = `${all.length} of 4 logs to unlock patterns`;
    $('#unlockFill').style.cssText = `display:block;height:100%;width:${(all.length/4)*100}%;background:var(--primary);border-radius:4px`;
  } else {
    unlock.classList.add('hidden');
  }

  const trendStr = (a,b) => {
    if (a==null || b==null) return '';
    const d = a - b; if (Math.abs(d) < 0.5) return 'steady';
    return d > 0 ? `▲ ${d.toFixed(1)} vs prev` : `▼ ${Math.abs(d).toFixed(1)} vs prev`;
  };
  const trendCls = (a,b,gh=true) => {
    if (a==null || b==null) return '';
    const d = a - b; if (Math.abs(d) < 0.5) return '';
    return (gh ? d > 0 : d < 0) ? 'up' : 'down';
  };

  $('#weeklySummary').innerHTML = `
    <div class="summary-cell"><div class="sc-label">Avg Score</div><div class="sc-value">${cur!=null?Math.round(cur):'—'}</div><div class="sc-trend ${trendCls(cur,prev,true)}">${trendStr(cur,prev)||(last7.length?'first week':'no data')}</div></div>
    <div class="summary-cell"><div class="sc-label">Avg Sleep</div><div class="sc-value">${sleep?sleep.toFixed(1)+'h':'—'}</div><div class="sc-trend">target ${state.targets.idealSleep}h</div></div>
    <div class="summary-cell"><div class="sc-label">Avg Caffeine</div><div class="sc-value">${caf!=null?caf.toFixed(1):'—'}</div><div class="sc-trend">max ${state.targets.maxCaffeine}</div></div>
    <div class="summary-cell"><div class="sc-label">Migraine Days</div><div class="sc-value">${migDays}/7</div><div class="sc-trend">${migDays===0?'clear week 🌟':''}</div></div>`;

  const days = lastNDays(14);
  $('#trendChart').innerHTML = days.map(k => {
    const log = state.logs[k];
    if (!log) return `<div class="bar empty" title="${prettyDate(k)} — no log" style="height:6%"></div>`;
    const s = computeScore(log, state.targets).total;
    return `<div class="bar ${scoreBucket(s)}" title="${prettyDate(k)} — ${s}" style="height:${Math.max(6,s)}%"></div>`;
  }).join('');
  $('#trendLegend').innerHTML = `<span>${prettyDate(days[0])}</span><span>${prettyDate(days[days.length-1])}</span>`;

  const patterns = generatePatterns();
  $('#patternList').innerHTML = patterns.map(p => `
    <div class="pattern ${p.kind}">
      <div class="p-emo">${p.emo}</div>
      <div class="p-text">
        ${p.kind === 'early' ? '<span class="p-tag">EARLY SIGNAL</span>' : ''}
        <div class="p-title">${escapeHtml(p.title)}</div><div class="p-body">${escapeHtml(p.body)}</div>
      </div>
    </div>`).join('');

  const total = all.length;
  const best = computeBestStreak();
  const current = computeCurrentStreak();
  const habitStreaks = state.habits.map(h => ({ name:h.name, streak:computeHabitStreak(h.id) }));

  let html = `
    <div class="progress-row"><span class="pr-label">Total logs</span><span class="pr-value">${total}</span></div>
    <div class="progress-row"><span class="pr-label">Current streak</span><span class="pr-value">${current} day${current===1?'':'s'} <span class="streak-pill">🔥 ${current}</span></span></div>
    <div class="progress-row"><span class="pr-label">Best streak</span><span class="pr-value">${best} days</span></div>
    <div class="progress-row"><span class="pr-label">Articles read</span><span class="pr-value">${readArticles.length}</span></div>
    <div class="progress-row"><span class="pr-label">Migraine-free days (last 14)</span><span class="pr-value">${days.filter(k => state.logs[k] && (state.logs[k].migraine||0) < 4).length}</span></div>`;
  habitStreaks.forEach(hs => {
    if (hs.streak > 0) html += `<div class="progress-row"><span class="pr-label">${escapeHtml(hs.name)}</span><span class="pr-value">${hs.streak}🔥</span></div>`;
  });
  $('#progressBlock').innerHTML = html;
}

/* ===== HISTORY ===== */
let historyFilter = 'all';
let historySort = 'dateDesc';
let historySearch = '';

function renderHistory() {
  const all = logsArray();
  let filtered = all.filter(l => {
    switch (historyFilter) {
      case 'lowSleep': return (l.sleep||0) < state.targets.idealSleep - 1.5;
      case 'highCaf': return (l.caffeine||0) > state.targets.maxCaffeine;
      case 'highStress': return (l.stress||0) >= 6;
      case 'migraine': return (l.migraine||0) >= 1;
      case 'hasNotes': return !!(l.notes && l.notes.trim());
      default: return true;
    }
  });
  if (historySearch) {
    const q = historySearch.toLowerCase();
    filtered = filtered.filter(l => (l.notes||'').toLowerCase().includes(q));
  }
  filtered.sort((a,b) => {
    const sA = computeScore(a, state.targets).total;
    const sB = computeScore(b, state.targets).total;
    switch (historySort) {
      case 'dateAsc': return a.key < b.key ? -1 : 1;
      case 'scoreDesc': return sB - sA;
      case 'scoreAsc': return sA - sB;
      default: return a.key < b.key ? 1 : -1;
    }
  });
  const list = $('#historyList');
  if (filtered.length === 0) {
    list.innerHTML = `<div class="card center muted">No logs match. ${all.length===0?'Start tracking on the Track tab.':'Try a different filter.'}</div>`;
    return;
  }
  list.innerHTML = filtered.map(l => {
    const s = computeScore(l, state.targets).total;
    const cls = scoreBucket(s);
    const hc = (l.habits||[]).length;
    const notesHtml = l.notes ? highlightSearch(escapeHtml(l.notes), historySearch) : '';
    return `<div class="log-item">
      <div class="log-head">
        <div class="log-date">${prettyDate(l.key, { year:'numeric' })}</div>
        <div class="log-score-pill ${cls}">${s}</div>
      </div>
      <div class="log-stats">
        <span><strong>Sleep:</strong> ${l.sleep!=null?l.sleep+'h':'—'}</span>
        <span><strong>Caffeine:</strong> ${l.caffeine ?? '—'}</span>
        <span><strong>Water:</strong> ${l.water ?? '—'}</span>
        <span><strong>Migraine:</strong> ${l.migraine!=null?migraineDescriptor(l.migraine):'—'}</span>
        <span><strong>Stress:</strong> ${l.stress!=null?stressDescriptor(l.stress):'—'}</span>
        <span><strong>Habits:</strong> ${hc}/${state.habits.length}</span>
      </div>
      ${notesHtml?`<div class="log-notes">${notesHtml}</div>`:''}
      <div class="log-actions">
        <button class="link-btn" data-edit="${l.key}">Edit</button>
        <button class="link-btn" data-del="${l.key}" style="color:#f87171">Delete</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    $('#logDate').value = b.dataset.edit; loadLogIntoForm(b.dataset.edit); navTo('track');
  }));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Delete this log?')) { delete state.logs[b.dataset.del]; save(); renderAll(); toast('Log deleted'); }
  }));
}

function highlightSearch(text, q) {
  if (!q) return text;
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

/* ===== LEARN ===== */
const learnContent = {
  Sleep: [
    { id:'sl1', t:'The 7–9 hour rule', s:'Most adults need 7–9 hours.', read:5,
      habit:'Sleep 7-9 hours nightly',
      body:`<h4>Why duration matters</h4><p>Adult bodies and brains run a cleanup cycle during sleep that takes roughly 7–9 hours to complete. Skip an hour and you skip a meaningful portion of that maintenance — emotional regulation, immune function, memory consolidation, and tissue repair all degrade measurably.</p><h4>Consistency beats catch-up</h4><p>One 5-hour night followed by a 10-hour weekend lie-in is worse than two consistent 7.5-hour nights. Your circadian rhythm — the internal clock that times everything from hormone release to body temperature — depends on stable inputs. Wild swings in sleep timing produce a state physiologists call "social jet lag," and the science is clear: people with high social jet lag have higher rates of obesity, depression, and cardiovascular disease.</p><h4>What good sleep actually looks like</h4><ul><li>You fall asleep within 15–20 minutes of getting in bed</li><li>You wake at the same time every day, including weekends</li><li>You feel alert within 30 minutes of waking — no scrolling required</li><li>You don't crash mid-afternoon (a small dip is normal; needing caffeine to function is not)</li></ul><h4>How to use this app for sleep</h4><p>Log your hours every morning for two weeks. Look at your trend chart. If your average is below your target by even 30 minutes, that's the single highest-leverage change you can make. Most people overestimate their sleep by 30–60 minutes; tracking corrects this delusion fast.</p><h4>If you struggle to fall asleep</h4><p>The problem is almost always one of three things: caffeine too late, screens too bright, or rumination too loud. Address them in that order — caffeine is the easiest fix and yields results within 3–5 days.</p>` },
    { id:'sl2', t:'Consistent bedtime', s:'Same time daily strengthens your rhythm.', read:4,
      habit:'In bed by 10:30 PM',
      body:`<h4>Your circadian rhythm runs on inputs</h4><p>Three things set your internal clock: light exposure, eating times, and sleep timing. Of these, sleep timing is the easiest to control. Going to bed within a 30-minute window every night — including weekends — is more powerful than any sleep supplement on the market.</p><h4>The weekend trap</h4><p>Friday: bed at 1 AM. Saturday: sleep until 11. Sunday: try to sleep at 10:30 for Monday — and lie awake for two hours wondering why. You've just given yourself a self-inflicted case of jet lag. Monday morning is the price.</p><h4>How to actually shift your bedtime earlier</h4><ul><li>Move it 15 minutes earlier per week, not all at once</li><li>Get bright light within 30 minutes of waking — this anchors the morning side of your rhythm and makes the evening side easier</li><li>Set a phone alarm for 60 minutes before your target bedtime as a "wind-down" cue, not for sleeping</li><li>Dim your house lights 90 minutes before bed</li></ul><h4>What to track in MindTrack</h4><p>Watch the correlation between your bedtime consistency and your migraine days. For most migraine sufferers, irregular sleep is a stronger trigger than the total amount of sleep. The pattern often shows up within 2-3 weeks of consistent logging.</p>` },
    { id:'sl3', t:'Screen curfew', s:'Stop screens 60 minutes before bed.', read:4,
      habit:'No screens after 9:30 PM',
      body:`<h4>Two problems, not one</h4><p>People talk about blue light as if it's the only issue with screens before bed. It's not. Blue light suppresses melatonin — that's real. But the bigger problem is what's on the screen: stimulating content, social comparison, news that activates your stress response, work emails that won't be answered until morning anyway. Your nervous system stays alert because you've given it reasons to.</p><h4>What to swap to</h4><ul><li>Paper books — fiction, ideally. The brain loves story</li><li>A warm shower or bath — drops core body temperature on exit, which signals sleep</li><li>Light stretching or yin yoga — 10 minutes is enough</li><li>Conversation with someone in your house, even if brief</li><li>Journal three lines: what went well, what was hard, what tomorrow needs</li></ul><h4>The 60-minute rule</h4><p>One full hour. Not 20 minutes. Not "I'll just check one thing." The first 30 minutes are the hardest because your brain is still scanning for inputs. The second 30 minutes are when your nervous system actually downshifts.</p><h4>Use this app to check yourself</h4><p>Log your sleep interruption count. If you regularly wake up between 2-4 AM with a racing mind, your evening screen time is a likely culprit. Try one week of strict 9:30 PM screen cutoff and watch what happens to your interruption count.</p>` },
    { id:'sl4', t:'Cool, dark, quiet', s:'16–19°C is ideal for most people.', read:4,
      habit:'Bedroom under 19°C',
      body:`<h4>Temperature is the lever most people miss</h4><p>Your core body temperature must drop by about 1°C for deep sleep to occur. A warm bedroom physically prevents this. The ideal range is 16–19°C (60–67°F) — cooler than most people keep their homes. If you wake up sweaty or kick the covers off, your room is too warm.</p><h4>Light: even tiny amounts matter</h4><p>The melanopsin receptors in your eyes detect light through closed eyelids. A streetlight through curtains, an LED on a charger, the standby light on a TV — each of these is enough to suppress melatonin and shorten your deep sleep. Walk through your bedroom in pitch dark. Anything you can see is too bright.</p><h4>Quick fixes</h4><ul><li>Blackout curtains or a quality eye mask (silk is most comfortable)</li><li>Cover or unplug LED chargers, smoke alarms, monitor lights</li><li>Move your phone face-down across the room</li><li>White noise (fan, app) at 50–60 decibels masks unpredictable sounds</li></ul><h4>Quiet</h4><p>Sudden sounds, even ones you don't fully wake up from, push you out of deep sleep into lighter stages. A consistent low-level background noise (fan, white noise machine) actually improves sleep by masking these spikes. If you have a partner who snores, this matters even more.</p><h4>What to expect</h4><p>Most people who optimise their sleep environment notice a difference within 3–5 nights. Watch your interruption count and how rested you feel on a 1-10 scale.</p>` },
    { id:'sl5', t:'Caffeine cutoff', s:'No caffeine after 2 PM.', read:5,
      habit:'No caffeine after 2 PM',
      body:`<h4>The half-life math</h4><p>Caffeine has an average half-life of 5–6 hours, but in some people it stretches to 8–10 hours. A 4 PM coffee at 200mg is still leaving roughly 100mg in your system at 10 PM, which is enough to reduce deep sleep by 20–40% even if you fall asleep just fine.</p><h4>"But I sleep fine after coffee"</h4><p>Falling asleep is not the same as sleeping well. Studies that monitor sleep architecture show clearly that evening caffeine reduces slow-wave sleep — the most restorative kind — even in people who report no subjective sleep problems. You wake up tired and reach for more caffeine. The cycle compounds.</p><h4>The 2 PM rule</h4><ul><li>Last caffeine of the day before 2 PM, ideally before noon</li><li>This includes tea, dark chocolate, energy drinks, and many sodas</li><li>Decaf is not zero caffeine — it averages 5–15mg per cup. Usually fine, but worth knowing</li></ul><h4>How to make the switch</h4><p>If you currently drink coffee at 4 PM, don't go cold turkey on the switch. Move your last cup back by 30 minutes per week. Your sleep quality will improve gradually, and you'll be more likely to stick with it.</p><h4>Bonus: caffeine works better at lower doses</h4><p>Most people get diminishing returns above 300mg/day. Two strong morning coffees do more for cognition than four spread through the day. You also stay sensitive enough that occasional extra caffeine actually helps when you need it.</p>` },
  ],
  Stress: [
    { id:'st1', t:'Box breathing', s:'Inhale 4, hold 4, exhale 4, hold 4.', read:3,
      habit:'5 min box breathing daily',
      body:`<h4>The fastest stress tool you have</h4><p>Box breathing activates your parasympathetic nervous system — the "rest and digest" branch — within 60 to 90 seconds. It works because slow, controlled breathing slows your heart rate, which signals to your brain that the threat is over (even if it isn't quite).</p><h4>The pattern</h4><ul><li>Inhale through your nose for 4 counts</li><li>Hold for 4 counts</li><li>Exhale through your mouth for 4 counts</li><li>Hold empty for 4 counts</li><li>Repeat 4–6 times</li></ul><h4>When to use it</h4><p>Before a stressful conversation. During a migraine warning sign. When stuck in traffic. After receiving difficult news. The five minutes you spend will pay back hours of wasted reactive energy.</p><h4>Why it works</h4><p>Heart rate variability — the variation in time between heartbeats — is one of the best predictors of stress resilience. Slow breathing increases HRV almost immediately, and consistent practice raises your baseline HRV over weeks. Used Navy SEALs and emergency-room doctors use this exact pattern in high-pressure moments.</p><h4>Make it a habit</h4><p>Stack it onto something you already do daily: first sip of morning coffee, before opening your laptop, while waiting for the microwave. Track it in MindTrack as a habit and watch your stress scores trend down over weeks.</p>` },
    { id:'st2', t:'The 5-minute rule', s:'Take a real break every 90 minutes.', read:4,
      habit:'Break every 90 min',
      body:`<h4>Your brain works in cycles</h4><p>Cognitive performance follows ultradian rhythms — roughly 90-minute cycles of focused work followed by a need for recovery. Push through the recovery phase and you don't get more done; you get worse work, more errors, and faster burnout.</p><h4>What counts as a real break</h4><ul><li>Stand up — actually stand, not just stretch in your chair</li><li>Walk somewhere — different room, hallway, outside if possible</li><li>Look at something more than 20 feet away (eye recovery)</li><li>Drink water</li><li>Look out a window</li></ul><h4>What does NOT count</h4><ul><li>Switching from a work tab to social media</li><li>Checking email "as a break"</li><li>Eating at your desk while reading something else</li></ul><h4>The afternoon crash</h4><p>If you reliably crash at 2-3 PM, the cause is almost always: insufficient morning daylight, lunch too heavy in fast carbs, or zero breaks during the morning. Fix one at a time. The afternoon energy you recover is significant.</p><h4>Set a timer</h4><p>Use a 90-minute timer. When it goes, you stand up — non-negotiable. Five minutes later, you sit back down. This single habit prevents more burnout than any productivity system.</p>` },
    { id:'st3', t:'Grounding 5-4-3-2-1', s:'Anchor in your senses.', read:3,
      habit:'Grounding when anxious',
      body:`<h4>What it does</h4><p>Anxiety lives in the future — what might happen, what you forgot, what could go wrong. Grounding pulls your attention back to the present moment by routing it through your physical senses, which can only perceive now.</p><h4>The exercise</h4><ul><li><strong>5 things you can see.</strong> Look around. Name them silently or aloud. The wall, the lamp, your hand, the texture of the desk, a mark on the floor.</li><li><strong>4 things you can touch.</strong> Your shirt against your skin. The chair. The temperature of the air on your arms. The phone in your pocket.</li><li><strong>3 things you can hear.</strong> The hum of a fan, distant traffic, your own breathing.</li><li><strong>2 things you can smell.</strong> If nothing obvious, recall a smell from earlier today.</li><li><strong>1 thing you can taste.</strong> Even if it's just the residue of your last drink.</li></ul><h4>When to use it</h4><p>The moment you notice your thoughts are spiraling. Before getting out of bed when anxiety hits. Mid-meeting when overwhelm starts. While waiting for a difficult call to start.</p><h4>Why it beats willpower</h4><p>You cannot think your way out of an anxiety spiral; thinking is what created it. You can only redirect your attention. Sensory grounding is a redirection technique that works in 60–90 seconds, takes no equipment, and can be done discreetly.</p>` },
    { id:'st4', t:'Walk it off', s:'10-minute walks lower cortisol.', read:4,
      habit:'10-min walk after work',
      body:`<h4>The simplest stress reset</h4><p>A 10-minute walk — outdoors if possible, indoors if not — measurably reduces cortisol within the walk itself. The combination of movement, novel visual input, and rhythmic breathing is more potent than most people expect.</p><h4>Why outdoors is better</h4><p>Natural light hits the back of your eye and triggers a cascade of mood-regulating neurochemistry. Even 10 minutes of midday outdoor light can shift your mood for hours. Tree canopy and visible greenery (so-called "soft fascination") quiet the mental chatter without requiring effort.</p><h4>The bridge between work and home</h4><p>If you work from home, the walk from your desk to the kitchen is not a commute — your nervous system stays in work mode. A 10-minute walk before "ending" the work day creates the psychological boundary your brain needs. Many remote workers find this single change drops their evening stress dramatically.</p><h4>Stack the benefits</h4><ul><li>Walk early in the day to anchor your circadian rhythm</li><li>Walk after meals to stabilise blood sugar</li><li>Walk before difficult conversations to lower reactivity</li><li>Walk when stuck on a problem — the brain solves things on the move</li></ul><h4>Start small</h4><p>If you're not currently walking at all, commit to 10 minutes. Not 30. The barrier is starting, and 10 minutes feels easy. Most days, you'll keep going. The days you stop at 10 still count.</p>` },
    { id:'st5', t:'Journal three lines', s:'3 lines daily beats 3 pages weekly.', read:4,
      habit:'3-line journal nightly',
      body:`<h4>Why three lines beats three pages</h4><p>Most journaling habits die because the bar is too high. Three pages a day requires 20 minutes you don't have on busy nights. Three lines requires 90 seconds — you can do it while brushing your teeth.</p><h4>The format</h4><ul><li>Line 1: One feeling or moment from today (specific, not vague)</li><li>Line 2: What triggered it or contributed to it</li><li>Line 3: One small thing for tomorrow</li></ul><h4>Example</h4><blockquote><p>"Felt overwhelmed at 3 PM during the team meeting."</p><p>"Skipped lunch and let four small things stack up unaddressed."</p><p>"Eat lunch tomorrow before 1, even if just 10 minutes."</p></blockquote><h4>Why it works over time</h4><p>You build emotional pattern recognition. After 30 entries, you'll see clearly: stress spikes when you skip meals, joy comes from specific tiny moments, certain people drain you and others restore you. None of this requires deep psychological work — just the data of paying attention.</p><h4>Where to put it</h4><p>The Notes field in MindTrack works perfectly for this. Three lines, every save. After two weeks, the History tab becomes a useful record you can search.</p>` },
  ],
  Nutrition: [
    { id:'nt1', t:'Hydrate first', s:'Water before coffee.', read:3,
      habit:'Glass of water on wake',
      body:`<h4>You wake up dehydrated</h4><p>After 7–9 hours without water, every cell in your body is mildly dehydrated. Your blood is slightly thicker, your brain is roughly 1–2% dehydrated, and your kidneys have been concentrating waste through the night. Adding caffeine on top of this state amplifies the problem — caffeine is a mild diuretic.</p><h4>The simple fix</h4><p>Drink a full glass of water (300–500ml) before your first coffee or tea. Just this one habit:</p><ul><li>Reduces morning headaches</li><li>Improves coffee's effect (you'll need less for the same cognitive boost)</li><li>Wakes you up faster — partly because you have to walk to the kitchen</li><li>Starts your day with a tiny win, which builds momentum</li></ul><h4>Make it automatic</h4><p>Put a glass on your bedside table at night. Or keep a 1-litre bottle on the kitchen counter. The friction must be near zero, or the habit dies.</p><h4>The rest of the day</h4><p>Aim for clear or pale-yellow urine throughout the day as a hydration check. The "8 glasses" rule is too rigid; needs vary by body size, climate, and activity. But morning water is universal.</p><h4>What to track</h4><p>Log your water intake in MindTrack alongside your migraine days. Many people find a clear correlation: low water days predict next-day migraines, especially when combined with caffeine or low sleep.</p>` },
    { id:'nt2', t:'Protein at breakfast', s:'Stabilizes blood sugar all day.', read:4,
      habit:'30g protein at breakfast',
      body:`<h4>The 11 AM crash starts with breakfast</h4><p>A breakfast of toast, cereal, or pastries spikes your blood sugar and then drops it 90 minutes later. The drop is what you experience as the late-morning crash, the urge for another coffee, the inability to focus on hard work. It's not your willpower — it's your blood chemistry.</p><h4>The protein anchor</h4><p>20–30g of protein in the morning slows the digestion of any carbs you eat with it, blunts the spike, and prevents the crash. The downstream effects are real:</p><ul><li>Steady energy until lunch</li><li>Reduced afternoon cravings</li><li>Better mood regulation</li><li>Less reliance on caffeine</li></ul><h4>What 30g looks like</h4><ul><li>3 eggs (18g) + 1 cup Greek yoghurt (15g)</li><li>1 cup cottage cheese (28g) + handful of berries</li><li>Protein shake (25g) + 1 boiled egg (6g)</li><li>2 eggs scrambled with 100g smoked salmon (28g)</li><li>Overnight oats made with milk + protein powder + nuts (30g)</li></ul><h4>If you skip breakfast</h4><p>That's fine — but break your fast with protein. The first thing you eat sets the tone for the day. A protein-led first meal at 11 AM still works.</p><h4>Track it</h4><p>Add "protein breakfast" as a habit in MindTrack and watch your stress and migraine scores over a month. Many migraine sufferers find blood sugar volatility to be one of their biggest, most fixable triggers.</p>` },
    { id:'nt3', t:'Magnesium matters', s:'Linked to fewer migraines.', read:5,
      habit:'Magnesium glycinate at night',
      body:`<h4>One of the most studied migraine supplements</h4><p>Magnesium is involved in over 300 enzymatic reactions in the body, including those that regulate nerve signalling, muscle relaxation, and the constriction/dilation of blood vessels — all relevant to migraine.</p><h4>The research</h4><p>Multiple studies have shown that 400–600mg of magnesium daily reduces migraine frequency in chronic sufferers by roughly 40%. The American Headache Society lists magnesium as a Level B recommendation for migraine prevention — meaning probably effective.</p><h4>Which form to take</h4><ul><li><strong>Magnesium glycinate</strong> — best absorbed, gentle on the stomach, mild relaxing effect (good for evening)</li><li><strong>Magnesium citrate</strong> — well absorbed, mild laxative effect (use this if you also struggle with constipation)</li><li><strong>Magnesium oxide</strong> — cheapest, poorly absorbed, often causes diarrhoea — generally avoid</li></ul><h4>How to start</h4><p>Begin with 200mg in the evening and increase to 400mg over a week. Taking it at night also tends to improve sleep quality. Effects on migraine frequency typically take 4–8 weeks to become obvious.</p><h4>Important</h4><p>Talk to your doctor if you have kidney disease, take blood pressure medication, or are pregnant. Magnesium interacts with several common medications.</p><h4>Track in MindTrack</h4><p>Add it as a habit. Log your migraine severity daily. Compare your monthly migraine days before and after. The correlation, if it exists for you, will be clear in 8 weeks.</p>` },
    { id:'nt4', t:'80/20 whole foods', s:'Most meals minimally processed.', read:4,
      habit:'Cook one meal daily',
      body:`<h4>Forget perfect</h4><p>The all-or-nothing trap kills more healthy eating habits than any food itself. Three "perfect" days followed by a "bad" weekend that becomes a "bad" week is the single most common pattern in people who fail to change their diet.</p><h4>The 80/20 framework</h4><p>Aim for 80% of your meals to be whole foods — things your grandmother would recognise. The remaining 20% is for life: birthdays, restaurants, the chocolate at 9 PM. Built-in flexibility is what makes this sustainable.</p><h4>What "whole foods" means in practice</h4><ul><li>Vegetables and fruit (any form except deep-fried)</li><li>Meat, fish, eggs (any cooking method)</li><li>Plain dairy (Greek yoghurt, cottage cheese, milk, real cheese)</li><li>Legumes and beans</li><li>Whole grains (oats, brown rice, quinoa)</li><li>Nuts, seeds, olive oil</li></ul><h4>What "ultra-processed" means</h4><p>Anything with an ingredient list that includes things you wouldn't have in your kitchen. Most packaged snacks, sugary drinks, ready meals, breakfast cereals, fast food. The shortcut: if it has more than 5 ingredients and at least one is unrecognisable, it's ultra-processed.</p><h4>One change at a time</h4><p>Start by adding, not subtracting. Add one vegetable to lunch. Add one piece of fruit at breakfast. Add one home-cooked meal per week. The "what to remove" question takes care of itself once the additions become routine.</p>` },
    { id:'nt5', t:'Mindful eating', s:'No screens at meals.', read:4,
      habit:'Phone-free meals',
      body:`<h4>What distracted eating costs you</h4><p>When you eat while watching TV, scrolling, or working, three things happen: you eat 20–30% more without noticing, your digestion is impaired (the brain is in alert mode, not rest-and-digest), and you miss the pleasure of the food, which means you'll seek that pleasure again sooner.</p><h4>The simplest practice</h4><p>Phone face-down. No screens. Sit at a table — not the couch, not the desk. Eat for 15–20 minutes. Notice what you're eating: temperature, texture, flavour. That's it. No app, no special technique, no mindfulness training required.</p><h4>What changes within a week</h4><ul><li>You'll naturally eat less without trying</li><li>You'll know when you're full — usually about 80% through the plate</li><li>Digestion improves: less bloating, less mid-afternoon heaviness</li><li>You'll start noticing which foods you actually enjoy versus which ones you just consume</li></ul><h4>For migraine sufferers especially</h4><p>Eating in a stressed or distracted state means your nervous system is in fight-or-flight while digesting. This contributes to gut issues, which research increasingly links to migraine frequency. A calm meal is a small but meaningful intervention.</p><h4>Start with one meal</h4><p>Don't try to make every meal screen-free at once. Pick the meal where you have the most control — usually breakfast or dinner. Make that one phone-free for two weeks. Then add another.</p>` },
  ],
  Habits: [
    { id:'hb1', t:'Habit stacking', s:'Pair new habits with existing ones.', read:4,
      habit:'Stack one new habit',
      body:`<h4>The technique</h4><p>The format is simple: "After I [existing habit], I will [new habit]." This leverages neural pathways that already exist. Your brain doesn't have to remember to do the new thing — it's triggered by the cue of the old thing.</p><h4>Why it works</h4><p>Building a habit from scratch requires conscious decision-making, and conscious decisions are limited and tiring. Stacking onto an existing routine borrows the automaticity that's already there. The new habit becomes part of an existing chain.</p><h4>Examples that work</h4><ul><li>"After I pour my morning coffee, I will write 3 lines in my journal."</li><li>"After I park the car at home, I will drink a glass of water."</li><li>"After I brush my teeth at night, I will lay out tomorrow's clothes."</li><li>"After I close my laptop for the day, I will go for a 10-minute walk."</li></ul><h4>The anchor must be specific</h4><p>"After breakfast" is vague. "After I rinse my breakfast plate" is specific. The more concrete the anchor, the more reliable the trigger.</p><h4>Start with one</h4><p>Don't stack five new habits onto five existing ones at once. Pick one. Run it for two weeks until it feels automatic. Then add another. The compound effect over a year is enormous.</p>` },
    { id:'hb2', t:'The 2-minute rule', s:'Make starting embarrassingly easy.', read:4,
      habit:'2-minute starts',
      body:`<h4>Lower the bar absurdly low</h4><p>"Read a book" becomes "read 1 page." "Exercise" becomes "put on workout clothes." "Meditate" becomes "sit on the cushion for 60 seconds." The point is not the new low standard — the point is that showing up daily is what builds identity, and momentum almost always carries you further than the minimum.</p><h4>The science of starting</h4><p>The hardest part of any habit is the activation energy. Once you've started, continuing is easy. Once you've put on your workout clothes, going for a walk is almost automatic. Once you've opened the book, reading more than one page is the default.</p><h4>What this protects against</h4><ul><li>Bad days — when motivation is zero, the bar is still clearable</li><li>Skipping streaks — never miss twice; the second miss is where habits die</li><li>All-or-nothing thinking — "I can't do my full workout, so I'll do nothing" loses to "I'll just do 2 push-ups"</li></ul><h4>Identity over outcome</h4><p>Reading 1 page a day for a year doesn't make you well-read. But it does make you "the kind of person who reads daily." That identity is what eventually produces the outcome — books finished, knowledge built. The identity comes first, the results follow.</p><h4>How to apply this in MindTrack</h4><p>If your habit list feels intimidating, rewrite the habits with a 2-minute version. "10-min walk" becomes "Put on shoes." "Read 30 min" becomes "Open the book." Track the small version. Watch how often you exceed it.</p>` },
    { id:'hb3', t:'Track to win', s:'What gets measured improves.', read:3,
      habit:'Daily logging',
      body:`<h4>The act of logging changes the behaviour</h4><p>Studies on food logging, exercise tracking, and spending tracking all show the same pattern: simply recording behaviour changes it. People who log what they eat lose more weight than those who don't, even with no other intervention. The mechanism is awareness — you can't ignore what you've written down.</p><h4>The same applies to wellness</h4><p>Logging your sleep, caffeine, stress and habits creates accountability that motivation alone cannot. You see your week. You see the patterns. You can't fool yourself that you're doing fine when the data shows otherwise.</p><h4>Why most tracking fails</h4><ul><li>Too detailed — gets dropped within a week</li><li>No review — data is collected but never looked at</li><li>Used as judgement, not feedback — every "low" day is a personal failure rather than information</li></ul><h4>How to track sustainably</h4><p>Quick log mode in MindTrack — sleep, stress, migraine, habits — takes 30 seconds. Use the full log only on days when you have something to add. Review your weekly insights every Sunday. Look at your trend chart, not individual days.</p><h4>Be ruthless about what you track</h4><p>If a metric isn't actionable for you, stop tracking it. The point is behaviour change, not data collection.</p>` },
    { id:'hb4', t:"Don't break the chain", s:'Streaks build identity.', read:3,
      habit:'Never miss twice',
      body:`<h4>The Seinfeld method</h4><p>Jerry Seinfeld's writing advice, famously simple: every day you write, mark a big X on a calendar. The chain of Xs becomes its own motivator — your only job is "don't break the chain." It's the same psychology behind streaks in MindTrack, Duolingo, and a hundred other apps.</p><h4>Why streaks work</h4><p>Each day you log reinforces the identity statement: "I am the kind of person who tracks my wellness." After 7 days, this feels true. After 21 days, it's part of how you see yourself. Identity is the strongest motivator in habit formation — stronger than goals, stronger than discipline.</p><h4>The "never miss twice" rule</h4><p>Missing once is human. Sick day, travel, life. The first miss is fine. The second consecutive miss is where habits die — once you've missed twice, you're no longer "the kind of person who does this." You're someone who used to.</p><h4>Build in resilience</h4><ul><li>Decide in advance: if you miss a day, the next day is a strict show-up day</li><li>Have a "minimum viable" version of every habit (see 2-minute rule)</li><li>Don't moralise the miss — just resume</li></ul><h4>The MindTrack streak chip</h4><p>Watch the 🔥 number in your top bar. Keep it growing. When you see it reach 7, then 14, then 30, you'll feel the identity shift. That feeling — not the data — is what changes your life.</p>` },
    { id:'hb5', t:'Environment design', s:'Make good habits obvious.', read:4,
      habit:'One environment tweak',
      body:`<h4>Willpower is finite, environment is constant</h4><p>You make hundreds of small decisions daily, and each one drains a finite reserve of willpower. By 9 PM, you're operating on near-empty. This is why "I'll just have one biscuit" turns into half the packet — the biscuits were on the counter, your willpower was depleted, and the path of least resistance won.</p><h4>The fix: design beats discipline</h4><p>Instead of relying on willpower to resist temptations, redesign your environment so the temptations aren't there and the good options are obvious. Examples:</p><ul><li>Running shoes by the bed → morning runs become more likely</li><li>Phone in another room at night → no doom-scrolling, better sleep</li><li>Water bottle on the desk → automatic hydration</li><li>Books on the coffee table, remote in a drawer → reading wins over TV</li><li>Healthy snacks at eye level, ultra-processed snacks behind the cans → defaults shift</li></ul><h4>Make bad habits hard, good habits easy</h4><p>Add friction to what you want less of. Remove friction from what you want more of. Even small barriers — a closed laptop instead of an open one, a passcode instead of face unlock — measurably reduce unwanted behaviours.</p><h4>One change at a time</h4><p>Pick one environment tweak this week. Just one. Notice the effect. The cumulative power of these tiny redesigns over a year is greater than any motivational system.</p>` },
  ],
  'Mental Wellness': [
    { id:'mw1', t:'Connect daily', s:'Reach out to one person.', read:4,
      habit:'Reach out to one person',
      body:`<h4>Loneliness is a measurable health risk</h4><p>The research is unambiguous: chronic loneliness is associated with increased risk of cardiovascular disease, dementia, depression, and early death — at rates comparable to smoking 15 cigarettes a day. The opposite is also true: regular social connection is one of the strongest predictors of long-term wellbeing.</p><h4>The minimum viable connection</h4><p>You don't need long visits or deep conversations daily. A 5-minute genuine exchange counts. The point is to maintain the muscle of connection so that when you need it more, you have it.</p><h4>What works</h4><ul><li>Text a friend something specific that reminded you of them</li><li>Voice memo instead of typing — your friend hears your voice</li><li>5-minute call instead of "we should catch up" forever</li><li>Ask a colleague how they really are — and mean it</li><li>One in-person interaction per day, even with a barista</li></ul><h4>Quality over quantity</h4><p>Asking "How was your weekend?" generically gets a generic reply. Asking "How did Sarah's birthday party go on Saturday?" gets a real answer. Specificity signals you actually paid attention, which is the rarest gift you can give.</p><h4>If you're not in the mood</h4><p>That's exactly when this matters most. Connection is what lifts low moods, not what comes after them. Five minutes of contact, even reluctant, is more effective than scrolling for an hour waiting to feel better.</p>` },
    { id:'mw2', t:'Nature time', s:'20 minutes outside lowers stress.', read:4,
      habit:'20 min outdoors daily',
      body:`<h4>The cheapest mental health intervention</h4><p>20 minutes outdoors — even in an urban park, even on a cloudy day — measurably lowers cortisol, the primary stress hormone. The effect is not subtle; it shows up in blood tests within the 20 minutes itself.</p><h4>Why it works</h4><p>Three mechanisms stack:</p><ul><li><strong>Light exposure</strong> regulates your circadian rhythm, which improves sleep, which improves mood</li><li><strong>Visual rest</strong> — natural environments require less cognitive effort than indoor ones, giving your brain genuine recovery</li><li><strong>Movement</strong> — even slow walking shifts your nervous system out of the alert state</li></ul><h4>Make it count</h4><ul><li>No phone, or phone on do-not-disturb</li><li>Notice three things visually — a tree shape, a cloud, the way light falls</li><li>If you can find any visible greenery — trees, grass, plants — even better</li><li>Morning light is the most circadian-regulating; afternoon light is the most stress-reducing</li></ul><h4>The urban version</h4><p>If you live in a city, walking to a coffee shop counts. A bench in a small park counts. Even a balcony with morning coffee counts. The bar is "outside" — not "in nature."</p><h4>Stack it</h4><p>Combine your 20 minutes outdoors with your 10-min walk (Stress section), your morning coffee, or your phone-free meal. Two habits with one window of time.</p>` },
    { id:'mw3', t:'Limit news', s:'Cap at 15 minutes daily.', read:4,
      habit:'15 min news cap',
      body:`<h4>News is engineered to capture attention through alarm</h4><p>Modern news isn't neutral information delivery. It's a business model that depends on keeping you scared, outraged, or anxious enough to keep watching, scrolling, or refreshing. Even high-quality news contributes to a baseline of stress that you didn't sign up for and probably can't act on.</p><h4>The 15-minute cap</h4><ul><li>Pick one or two trusted sources — not three, not ten</li><li>Set a timer — 15 minutes total per day, ideally in one block</li><li>Don't check first thing in the morning or last thing at night</li><li>If a story feels urgent, ask: can I do something about this in the next 24 hours? If no, you don't need it right now</li></ul><h4>What you'll notice within a week</h4><ul><li>Lower baseline anxiety</li><li>Better sleep, especially fewer 3 AM wake-ups</li><li>You're still informed about the things that actually affect your life</li><li>You're doing more, not just consuming more</li></ul><h4>The harder version</h4><p>For one week, no news at all. The world keeps spinning. Important things still reach you through people you trust. You return to news (if you do) with a clearer sense of what's signal versus noise.</p><h4>What to read instead</h4><p>One long-form article per day beats ten headlines. One book chapter beats one news app session. The information is deeper, more durable, and actionable.</p>` },
    { id:'mw4', t:'Practice gratitude', s:'3 specific things, daily.', read:4,
      habit:'3 gratitudes nightly',
      body:`<h4>Specificity is the unlock</h4><p>Vague gratitude — "I'm grateful for my family, my health, my job" — wears off within a week. Your brain stops responding to it because it's not new information. Specific gratitude — "I'm grateful for the way Sara laughed at lunch today" — keeps working because each entry is unique.</p><h4>Why it works</h4><p>Gratitude is an attention practice, not a moral one. By repeatedly directing your attention to what's working, you rewire what your brain notices by default. Within weeks, you'll start naturally spotting good moments throughout the day — not because life changed, but because your filter did.</p><h4>The format</h4><ul><li>Three specific things from today</li><li>Each one tied to a moment, sense, person, or action — not a category</li><li>Done at the same time daily — bedtime is most common</li><li>30 seconds total</li></ul><h4>Examples that work</h4><ul><li>"The first sip of coffee while it was still hot"</li><li>"My colleague holding the door even though her hands were full"</li><li>"The way the evening light hit the kitchen table"</li></ul><h4>Examples that don't work</h4><ul><li>"My health" (too vague)</li><li>"My family" (you'll write this every day until it's meaningless)</li><li>"My job" (same)</li></ul><h4>Track it</h4><p>Add it as a habit in MindTrack. After 30 days, look at your stress and mood trends. Most people report a meaningful baseline shift in 3-4 weeks.</p>` },
    { id:'mw5', t:'Ask for help', s:'Strength, not weakness.', read:5,
      habit:'Ask one person for help',
      body:`<h4>The cultural lie</h4><p>You absorbed somewhere that needing help is weakness, that strength means handling everything alone, that asking for support is a burden on others. None of this is true, and all of it is killing your wellbeing slowly.</p><h4>What asking for help actually does</h4><ul><li>It strengthens the relationship — people feel valued when trusted with your real situation</li><li>It models permission for others to ask you</li><li>It prevents the crisis-level breakdown that comes from accumulated unaddressed weight</li><li>It often reveals solutions you couldn't see alone</li></ul><h4>Therapy is maintenance, not crisis intervention</h4><p>Most people wait until they're in pieces to see a therapist. The much better approach is going while you're functional, the way you go to a dentist before your teeth fall out. A good therapist gives you tools and an outside view that your own mind cannot provide.</p><h4>Other forms of help</h4><ul><li>A coach for specific skills or transitions</li><li>A support group — there's one for almost every common struggle</li><li>A trusted friend who won't try to fix you, just listen</li><li>A medical doctor for things you've been "powering through"</li><li>A financial advisor before money becomes a crisis</li></ul><h4>How to start</h4><p>Pick one person. Tell them one true thing about how you're really doing. That's the entire ask. Most of the help we need begins with one honest sentence.</p><h4>If you're struggling now</h4><p>If you're in distress, please reach out to someone you trust or a crisis line in your country. You don't have to carry it alone, and asking is the strong move.</p>` },
    ],
};
let activeLearnTab = 'Sleep';
let currentArticle = null;

function renderLearn() {
  const tabs = $('#learnTabs');
  tabs.innerHTML = Object.keys(learnContent).map(t => `<button class="learn-tab ${t===activeLearnTab?'active':''}" data-ltab="${t}">${t}</button>`).join('');
  tabs.querySelectorAll('[data-ltab]').forEach(b => b.addEventListener('click', () => { activeLearnTab = b.dataset.ltab; renderLearn(); }));
  $('#learnContent').innerHTML = learnContent[activeLearnTab].map(it => {
    const isRead = readArticles.includes(it.id);
    return `<div class="learn-card ${isRead?'read':''}" data-art="${it.id}">
      <div class="lc-title">${escapeHtml(it.t)}</div>
      <div class="lc-meta"><span>📖 ${it.read} min read</span></div>
      <div class="lc-snippet">${escapeHtml(it.s)}</div>
    </div>`;
  }).join('');
  $('#learnContent').querySelectorAll('.learn-card').forEach(c => c.addEventListener('click', () => openArticle(c.dataset.art)));
}

function openArticle(id) {
  const cat = Object.keys(learnContent).find(k => learnContent[k].some(a => a.id === id));
  const art = learnContent[cat].find(a => a.id === id);
  if (!art) return;
  currentArticle = art;
  $('#articleTitle').textContent = art.t;
  const isRead = readArticles.includes(id);
  const habitExists = state.habits.some(h => h.name === art.habit);
  $('#articleBody').innerHTML = `
    <div class="article-meta">
      <span>📖 ${art.read} min read</span>
      <span>📂 ${cat}</span>
    </div>
    <div class="article-content">${art.body}</div>
    <div class="article-actions">
      <button class="btn-primary" id="addArtHabit" ${habitExists?'disabled':''}>${habitExists?'✓ Habit added':'+ Add habit: ' + art.habit}</button>
      <button class="btn-secondary" id="markReadBtn">${isRead?'✓ Read':'Mark as read'}</button>
    </div>`;
  document.getElementById('addArtHabit').addEventListener('click', () => {
    if (state.habits.some(h => h.name === art.habit)) return;
    state.habits.push({ id:'h'+Date.now(), name:art.habit, icon:'✨' });
    save(); toast('Habit added ✨'); openArticle(id); renderHome();
  });
  document.getElementById('markReadBtn').addEventListener('click', () => {
    if (!readArticles.includes(id)) {
      readArticles.push(id); saveRead(); toast('Marked as read ✓');
    }
    closeModal('articleModal'); renderLearn(); renderInsights();
  });
  openModal('articleModal');
}

/* ===== SETTINGS ===== */
function renderSettings() {
  setRange('tgtSleep', state.targets.idealSleep, 'tgtSleepVal', v => v);
  setRange('tgtCaf', state.targets.maxCaffeine, 'tgtCafVal', v => v);
  setRange('tgtWater', state.targets.idealWater, 'tgtWaterVal', v => v);

  // Track preferences
  const prefDefs = [
    { key:'sleep', name:'Sleep hours', emo:'🌙' },
    { key:'sleepDetails', name:'Sleep interruptions', emo:'😴' },
    { key:'intake', name:'Caffeine & water', emo:'☕' },
    { key:'feel', name:'Migraine & stress', emo:'💗' },
    { key:'body', name:'Body aches', emo:'🤕' },
    { key:'custom', name:'Custom fields', emo:'✨' },
  ];
  $('#trackPrefsMgr').innerHTML = prefDefs.map(p => `
    <div class="h-row">
      <div class="h-info">
        <span class="h-name">${p.emo} ${p.name}</span>
      </div>
      <label class="toggle-label" style="margin:0">
        <input type="checkbox" data-pref="${p.key}" ${state.trackPrefs[p.key]?'checked':''}/>
      </label>
    </div>
  `).join('');
  $$('#trackPrefsMgr [data-pref]').forEach(inp => inp.addEventListener('change', () => {
    state.trackPrefs[inp.dataset.pref] = inp.checked;
    save();
  }));
}

function renderHabitMgr() {
  const hm = $('#habitMgr');
  if (state.habits.length === 0) { hm.innerHTML = `<p class="muted small">No habits yet. Add one below.</p>`; return; }
  hm.innerHTML = state.habits.map((h, idx) => `
    <div class="h-row" data-hid="${h.id}">
      <div class="h-info" data-rename="${h.id}">
        <span class="h-name">${h.icon||'✨'} ${escapeHtml(h.name)}</span>
        <span class="h-meta">streak: ${computeHabitStreak(h.id)} 🔥 — tap name to rename</span>
      </div>
      <div class="h-actions">
        <button class="h-mv" data-mv="up" data-i="${idx}" ${idx===0?'disabled':''}>↑</button>
        <button class="h-mv" data-mv="down" data-i="${idx}" ${idx===state.habits.length-1?'disabled':''}>↓</button>
        <button class="h-del" data-delhabit="${h.id}">✕</button>
      </div>
    </div>`).join('');
  hm.querySelectorAll('[data-rename]').forEach(el => el.addEventListener('click', () => startRename(el.dataset.rename)));
  hm.querySelectorAll('[data-mv]').forEach(b => b.addEventListener('click', () => {
    const i = parseInt(b.dataset.i, 10);
    const dir = b.dataset.mv === 'up' ? -1 : 1;
    const j = i + dir; if (j < 0 || j >= state.habits.length) return;
    [state.habits[i], state.habits[j]] = [state.habits[j], state.habits[i]];
    save(); renderHabitMgr(); renderHome();
  }));
  hm.querySelectorAll('[data-delhabit]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Delete this habit?')) {
      state.habits = state.habits.filter(h => h.id !== b.dataset.delhabit);
      Object.values(state.logs).forEach(l => { if (l.habits) l.habits = l.habits.filter(id => id !== b.dataset.delhabit); });
      save(); renderHabitMgr(); renderHome();
    }
  }));
}

function startRename(id) {
  const h = state.habits.find(x => x.id === id); if (!h) return;
  const row = document.querySelector(`[data-hid="${id}"] .h-info`);
  row.innerHTML = `<span class="h-name"><input type="text" value="${escapeHtml(h.name)}" maxlength="40"/></span>`;
  const inp = row.querySelector('input');
  inp.focus(); inp.select();
  const finish = () => {
    const v = inp.value.trim(); if (v) h.name = v;
    save(); renderHabitMgr(); renderHome();
  };
  inp.addEventListener('blur', finish);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(); if (e.key === 'Escape') renderHabitMgr(); });
}

function renderCustomMgr() {
  const cm = $('#customMgr');
  if (state.customFields.length === 0) { cm.innerHTML = `<p class="muted small">No custom fields yet.</p>`; return; }
  cm.innerHTML = state.customFields.map(c => `
    <div class="h-row">
      <div class="h-info"><span class="h-name">${escapeHtml(c.name)}</span><span class="h-meta">${c.type}</span></div>
      <div class="h-actions"><button class="h-del" data-delcf="${c.id}">✕</button></div>
    </div>`).join('');
  cm.querySelectorAll('[data-delcf]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Delete this field?')) {
      state.customFields = state.customFields.filter(c => c.id !== b.dataset.delcf);
      Object.values(state.logs).forEach(l => { if (l.custom) delete l.custom[b.dataset.delcf]; });
      save(); renderCustomMgr(); renderTrack();
    }
  }));
}

/* ===== SCORE MODAL ===== */
function openScoreModal() {
  const k = todayKey(); const log = state.logs[k];
  const r = computeScore(log, state.targets); const body = $('#scoreBreakdown');
  if (!log) {
    body.innerHTML = `<p class="muted center">No log for today yet.</p>
      <button class="btn-primary full-w" id="goTrack">Make first entry</button>`;
    document.getElementById('goTrack').addEventListener('click', () => { closeModal('scoreModal'); navTo('track'); });
    openModal('scoreModal'); return;
  }
  body.innerHTML = `
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:56px;font-weight:800;letter-spacing:-1px;color:var(--primary)">${r.total}</div>
      <div class="muted">${scoreMessage(r.total, true)}</div>
    </div>
    ${r.breakdown.map(b => `
      <div class="bd-row">
        <div class="bd-label"><div class="bd-name">${b.name}</div><div class="bd-meta">${escapeHtml(b.note)}</div></div>
        <div class="bd-bar"><span style="width:${(b.points/b.max)*100}%"></span></div>
        <div class="bd-pts">${b.points}/${b.max}</div>
      </div>`).join('')}
    <p class="muted small center mt-16">Score updates instantly as you log.</p>`;
  openModal('scoreModal');
}

/* ===== ONBOARDING ===== */
let onboardStep = 0;
let onboardSelections = { sleep:true, caffeine:false, stress:true, migraine:false, habits:true, water:false };

function renderOnboard() {
  $$('.op-step').forEach((el, i) => el.classList.toggle('active', i <= onboardStep));
  const body = $('#onboardBody');
  if (onboardStep === 0) {
    body.innerHTML = `
      <div class="onboard-illust">🔒</div>
      <div class="onboard-title">Your data stays on your device</div>
      <p class="onboard-text">MindTrack does not collect, send, or store any personal information anywhere except your phone.<br><br>No accounts. No analytics. No tracking.<br><br>If you delete the app, your data is gone. You can also export it as a file anytime.</p>
      <div class="onboard-actions"><button class="btn-primary" id="oNext">Got it — continue</button></div>`;
    document.getElementById('oNext').addEventListener('click', () => { onboardStep = 1; renderOnboard(); });
    return;
  }
  if (onboardStep === 1) {
    const opts = [
      { k:'sleep', n:'Sleep quality', e:'🌙' },
      { k:'caffeine', n:'Caffeine intake', e:'☕' },
      { k:'migraine', n:'Migraines', e:'💗' },
      { k:'stress', n:'Stress', e:'🧘' },
      { k:'habits', n:'Daily habits', e:'✨' },
      { k:'water', n:'Water intake', e:'💧' },
    ];
    body.innerHTML = `
      <div class="onboard-title">What matters most to you?</div>
      <p class="onboard-text">Pick at least one — you can change later.</p>
      <div class="track-prefs">
        ${opts.map(o => `<label class="track-pref ${onboardSelections[o.k]?'checked':''}" data-pk="${o.k}">
          <input type="checkbox" ${onboardSelections[o.k]?'checked':''}/>
          <span class="tp-emo">${o.e}</span>
          <span class="tp-name">${o.n}</span>
        </label>`).join('')}
      </div>
      <div class="onboard-actions"><button class="btn-primary" id="oNext">Continue</button></div>`;
    body.querySelectorAll('.track-pref').forEach(el => el.addEventListener('click', e => {
      e.preventDefault();
      const k = el.dataset.pk;
      onboardSelections[k] = !onboardSelections[k];
      el.classList.toggle('checked', onboardSelections[k]);
      el.querySelector('input').checked = onboardSelections[k];
    }));
    document.getElementById('oNext').addEventListener('click', () => {
      if (!Object.values(onboardSelections).some(v => v)) { toast('Pick at least one'); return; }
      // Apply to track prefs
      state.trackPrefs.sleep = onboardSelections.sleep;
      state.trackPrefs.intake = onboardSelections.caffeine || onboardSelections.water;
      state.trackPrefs.feel = onboardSelections.migraine || onboardSelections.stress;
      onboardStep = 2; renderOnboard();
    });
    return;
  }
  if (onboardStep === 2) {
    body.innerHTML = `
      <div class="onboard-illust">🛌</div>
      <div class="onboard-title">What's your ideal sleep?</div>
      <p class="onboard-text">Most adults feel best at 7–9 hours. We'll ask about caffeine and water later — one thing at a time.</p>
      <div class="field"><label>Hours per night <span class="val" id="oSleepVal">${state.targets.idealSleep}</span></label>
        <input type="range" id="oSleep" min="5" max="12" step="0.5" value="${state.targets.idealSleep}"/></div>
      <div class="onboard-actions"><button class="btn-primary" id="oNext">Continue</button></div>`;
    const inp = document.getElementById('oSleep');
    inp.addEventListener('input', () => $('#oSleepVal').textContent = inp.value);
    document.getElementById('oNext').addEventListener('click', () => {
      state.targets.idealSleep = parseFloat(inp.value); save();
      onboardStep = 3; renderOnboard();
    });
    return;
  }
  if (onboardStep === 3) {
    body.innerHTML = `
      <div class="onboard-illust">🌱</div>
      <div class="onboard-title">You're ready</div>
      <p class="onboard-text">Your journey starts when you make your first entry. Even a 30-second log today gives you something to look back on tomorrow.</p>
      <div class="onboard-actions">
        <button class="btn-primary" id="oStart">Make my first entry</button>
        <button class="btn-ghost" id="oLater">I'll do it later</button>
      </div>`;
    document.getElementById('oStart').addEventListener('click', () => {
      state.onboarded = true; save(); closeModal('onboardModal'); renderAll(); navTo('track');
    });
    document.getElementById('oLater').addEventListener('click', () => {
      state.onboarded = true; save(); closeModal('onboardModal'); renderAll();
    });
  }
}

/* ===== IDENTITY MILESTONES ===== */
function checkIdentityMilestones() {
  const streak = computeCurrentStreak();
  const fired = JSON.parse(localStorage.getItem(IDENTITY_KEY) || '[]');
  const milestones = [
    { day: 1, title:"Day 1 — Your journey has started", body:"You logged your first entry. The hardest part is starting, and you just did it. 🌱", emoji:"🌱" },
    { day: 7, title:"You're becoming consistent", body:"A full week of logging. You're now the kind of person who pays attention to your own wellbeing. 🔥", emoji:"🔥" },
    { day: 21, title:"This is part of who you are", body:"Three weeks. This isn't a habit anymore — it's part of how you live. The data you've gathered will keep paying you back. 💪", emoji:"💪" },
    { day: 30, title:"30 days of you", body:"A full month. Most people quit before now. You didn't. Your patterns are clear, your insights are real, and your foundation is built. 🌟", emoji:"🌟" },
    { day: 60, title:"This is mastery now", body:"Two months of consistent self-awareness. Few people ever build this. You have. 🏆", emoji:"🏆" },
    { day: 100, title:"100 days", body:"Triple-digit streak. You've earned this. 🎯", emoji:"🎯" },
  ];
  const m = milestones.find(x => x.day === streak && !fired.includes(x.day));
  if (m) {
    fired.push(m.day);
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(fired));
    setTimeout(() => showIdentity(m), 600);
  }
}
function showIdentity(m) {
  $('#identityBody').innerHTML = `
    <div class="identity-card">
      <div class="identity-emoji">${m.emoji}</div>
      <div class="identity-title">${m.title}</div>
      <div class="identity-body">${m.body}</div>
      <button class="btn-primary full-w" id="idClose">Continue</button>
    </div>`;
  document.getElementById('idClose').addEventListener('click', () => closeModal('identityModal'));
  openModal('identityModal');
}

/* ===== WEEKLY RECAP ===== */
function maybeShowRecap() {
  const last = localStorage.getItem(RECAP_KEY);
  const all = logsArray();
  if (all.length < 4) return;
  const today = new Date();
  // Show on Sunday or if 7+ days since last recap
  const lastDate = last ? new Date(last) : null;
  const daysSince = lastDate ? Math.floor((today - lastDate) / 86400000) : 999;
  const isSunday = today.getDay() === 0;
  if (!(isSunday && daysSince >= 6) && daysSince < 7) return;
  buildRecap();
}
function buildRecap() {
  const all = logsArray();
  const last7 = all.slice(-7); const prev7 = all.slice(-14, -7);
  if (last7.length < 3) return;
  const t = state.targets;
  const cur = avg(last7.map(l => computeScore(l, t).total));
  const prev = avg(prev7.map(l => computeScore(l, t).total));
  const sleep = avg(last7.map(l => l.sleep || 0).filter(Boolean));
  const caf = avg(last7.map(l => l.caffeine || 0));
  const migDays = last7.filter(l => (l.migraine||0) >= 4).length;
  const bestDay = last7.slice().sort((a,b) => computeScore(b,t).total - computeScore(a,t).total)[0];
  const bestScore = bestDay ? computeScore(bestDay, t).total : 0;

  // One thing to try
  let suggestion = "Keep your current rhythm.";
  if (sleep && sleep < t.idealSleep - 0.5) suggestion = `Sleep target was ${(t.idealSleep - sleep).toFixed(1)}h short — try one earlier bedtime this week.`;
  else if (caf > t.maxCaffeine) suggestion = `Caffeine averaged ${caf.toFixed(1)} — aim for ${t.maxCaffeine} max next week.`;
  else if (migDays >= 2) suggestion = `${migDays} migraine days — focus on hydration and consistent sleep next week.`;

  $('#recapBody').innerHTML = `
    <div class="recap-block">
      <div class="rb-label">Average wellness score</div>
      <div class="rb-value">${cur ? Math.round(cur) : '—'}</div>
      <div class="rb-detail">${prev ? (cur > prev ? `▲ ${Math.round(cur-prev)} vs last week — improving` : cur < prev ? `▼ ${Math.round(prev-cur)} vs last week` : 'steady vs last week') : 'first full week'}</div>
    </div>
    <div class="recap-block">
      <div class="rb-label">Sleep & caffeine</div>
      <div class="rb-value">${sleep?sleep.toFixed(1)+'h':'—'} · ${caf.toFixed(1)} cups</div>
      <div class="rb-detail">target ${t.idealSleep}h sleep · max ${t.maxCaffeine} cups</div>
    </div>
    <div class="recap-block">
      <div class="rb-label">Best day</div>
      <div class="rb-value">${bestDay ? prettyDate(bestDay.key) + ' — ' + bestScore : '—'}</div>
      <div class="rb-detail">try to repeat what worked</div>
    </div>
    <div class="recap-block">
      <div class="rb-label">One thing to try next week</div>
      <div class="rb-value" style="font-size:15px;line-height:1.4">${suggestion}</div>
    </div>
    <button class="btn-primary full-w mt-16" id="recapClose">Got it</button>`;
  document.getElementById('recapClose').addEventListener('click', () => {
    closeModal('recapModal');
    localStorage.setItem(RECAP_KEY, new Date().toISOString());
  });
  openModal('recapModal');
}

/* ===== MODAL HELPERS ===== */
function openModal(id) {
  const m = $('#' + id);
  m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const m = $('#' + id);
  m.classList.remove('open'); m.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

function navTo(name) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name).classList.add('active');
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (name === 'home') renderHome();
  if (name === 'track') renderTrack();
  if (name === 'insights') renderInsights();
  if (name === 'history') renderHistory();
  if (name === 'learn') renderLearn();
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const mt = document.querySelector('meta[name="theme-color"]');
  if (mt) mt.setAttribute('content', t === 'light' ? '#f7f9fc' : '#0f172a');
  localStorage.setItem(THEME_KEY, t);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ===== WIRE UP ===== */
function wire() {
  $$('.tab').forEach(t => t.addEventListener('click', () => navTo(t.dataset.nav)));
  $$('[data-nav]').forEach(b => b.addEventListener('click', () => navTo(b.dataset.nav)));

  $('#btnTheme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
  $('#btnSettings').addEventListener('click', () => { renderSettings(); openModal('settingsModal'); });
  $('#manageHabitsBtn').addEventListener('click', () => { renderHabitMgr(); openModal('habitsModal'); });

  $$('.close-modal').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'onboardModal') closeModal(m.id); }));

  $('#scoreCard').addEventListener('click', () => {
    if (!state.logs[todayKey()]) navTo('track'); else openScoreModal();
  });
  $('#scoreCard').addEventListener('keypress', e => { if (e.key === 'Enter' || e.key === ' ') $('#scoreCard').click(); });

  // Mode switch
  $$('.mode-btn').forEach(b => b.addEventListener('click', () => { currentMode = b.dataset.mode; state.mode = currentMode; save(); renderTrack(); }));

  // Skip buttons
  document.addEventListener('click', e => {
    const sb = e.target.closest('.skip-btn');
    if (!sb) return;
    e.preventDefault();
    const grp = sb.dataset.skip;
    const fields = $$(`.field[data-fld="${grp}"]`);
    const isSkipped = sb.textContent === 'Skip';
    fields.forEach(f => f.classList.toggle('skipped', isSkipped));
    sb.textContent = isSkipped ? 'Include' : 'Skip';
  });

  const bind = (id, valId, fmt) => {
    const inp = $('#' + id);
    inp.addEventListener('input', () => $('#' + valId).textContent = fmt(inp.value));
  };
  bind('sleepHours','valSleep', v => v + 'h');
  bind('sleepInt','valInt', v => v);
  bind('caffeine','valCaf', v => v);
  bind('water','valWater', v => v);
  bind('migraine','valMig', v => migraineDescriptor(+v));
  bind('stress','valStress', v => stressDescriptor(+v));
  bind('aches','valAches', v => +v === 0 ? 'None' : v + '/10');
  bind('periodPain','valPeriod', v => +v === 0 ? 'None' : v + '/10');

  $('#periodToggle').addEventListener('change', e => $('#periodWrap').classList.toggle('hidden', !e.target.checked));

  $('#customFieldsTrack').addEventListener('input', e => {
    const f = e.target.closest('.field'); if (!f) return;
    if (f.dataset.cftype === 'scale') f.querySelector('[data-cfval]').textContent = e.target.value;
  });

  $('#addCustomTrackBtn').addEventListener('click', () => { renderCustomMgr(); openModal('customFieldModal'); });

  $('#logDate').addEventListener('change', e => {
    loadLogIntoForm(e.target.value);
    $('#customFieldsTrack').innerHTML = state.customFields.map(cf => customFieldHtml(cf)).join('');
    renderTrack();
  });

  $('#logForm').addEventListener('submit', e => { e.preventDefault(); saveLog(); });

  const bindTarget = (id, valId, key) => {
    const inp = $('#' + id);
    inp.addEventListener('input', () => {
      $('#' + valId).textContent = inp.value;
      state.targets[key] = parseFloat(inp.value); save();
    });
  };
  bindTarget('tgtSleep','tgtSleepVal','idealSleep');
  bindTarget('tgtCaf','tgtCafVal','maxCaffeine');
  bindTarget('tgtWater','tgtWaterVal','idealWater');

  $('#addHabit').addEventListener('click', () => {
    const name = $('#newHabit').value.trim(); if (!name) return;
    state.habits.push({ id:'h'+Date.now(), name, icon:'✨' });
    $('#newHabit').value = ''; save(); renderHabitMgr(); renderHome();
  });
  $('#newHabit').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#addHabit').click(); } });

  $('#addCustom').addEventListener('click', () => {
    const name = $('#newCustom').value.trim(); if (!name) return;
    state.customFields.push({ id:'cf'+Date.now(), name, type:$('#newCustomType').value });
    $('#newCustom').value = ''; save(); renderCustomMgr(); renderTrack();
    toast('Field added ✓');
  });

  $$('#filterChips .chip').forEach(c => c.addEventListener('click', () => {
    $$('#filterChips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); historyFilter = c.dataset.filter; renderHistory();
  }));
  $('#sortBy').addEventListener('change', e => { historySort = e.target.value; renderHistory(); });
  $('#searchNotes').addEventListener('input', e => { historySearch = e.target.value.trim(); renderHistory(); });

  $('#exportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `mindtrack-${todayKey()}.json`; a.click();
    toast('Exported ✓');
  });

  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.logs) throw new Error('Invalid');
      if (confirm('Replace your current data with this file?')) {
        state = Object.assign(structuredClone(defaultState), data);
        save(); renderAll(); toast('Imported ✓');
      }
    } catch { toast('Invalid JSON file'); }
    e.target.value = '';
  });

  $('#clearAll').addEventListener('click', () => {
    if (confirm('Delete ALL data? This cannot be undone.')) {
      state = structuredClone(defaultState);
      readArticles = []; saveRead();
      localStorage.removeItem(IDENTITY_KEY); localStorage.removeItem(RECAP_KEY);
      save(); renderAll(); closeModal('settingsModal'); toast('All data cleared');
    }
  });
}

function saveLog() {
  const k = $('#logDate').value;
  if (!k) { toast('Pick a date'); return; }

  // Empty-log prevention: at least one slider must be touched, or a habit must be done
  const sleepFld = document.querySelector('[data-fld="sleep"]');
  const feelFld = document.querySelector('[data-fld="feel"]');
  const sleepSkipped = sleepFld?.classList.contains('skipped');
  const feelSkipped = feelFld?.classList.contains('skipped');
  const habitsDone = document.querySelectorAll('#trackHabits .habit-item.done').length;
  const notesAdded = $('#notes').value.trim().length > 0;
  if (sleepSkipped && feelSkipped && habitsDone === 0 && !notesAdded) {
    toast('Log at least one thing — even one slider counts');
    return;
  }

  const existing = state.logs[k] || newEmptyLog(k);
  const log = { ...existing, date:k, custom: existing.custom || {}, updatedAt: Date.now() };

  if (!sleepSkipped) log.sleep = parseFloat($('#sleepHours').value);
  if (!feelSkipped) {
    log.migraine = parseInt($('#migraine').value, 10);
    log.stress = parseInt($('#stress').value, 10);
  }
  // Full-mode fields if visible & not skipped
  if (currentMode === 'full') {
    if (!document.querySelector('[data-fld="sleepDetails"]')?.classList.contains('skipped')) {
      log.sleepInt = parseInt($('#sleepInt').value, 10);
    }
    if (!document.querySelector('[data-fld="intake"]')?.classList.contains('skipped')) {
      log.caffeine = parseInt($('#caffeine').value, 10);
      log.water = parseInt($('#water').value, 10);
    }
    if (!document.querySelector('[data-fld="body"]')?.classList.contains('skipped')) {
      log.aches = parseInt($('#aches').value, 10);
    }
    if ($('#periodToggle').checked) log.periodPain = parseInt($('#periodPain').value, 10);
    else delete log.periodPain;

    document.querySelectorAll('#customFieldsTrack [data-cf]').forEach(f => {
      const id = f.dataset.cf; const t = f.dataset.cftype; const inp = f.querySelector('[data-cfin]');
      if (t === 'check') log.custom[id] = inp.checked;
      else if (t === 'number') log.custom[id] = inp.value === '' ? null : parseFloat(inp.value);
      else log.custom[id] = parseInt(inp.value, 10);
    });
  }

  log.notes = $('#notes').value.trim();
  log.habits = Array.from(document.querySelectorAll('#trackHabits .habit-item.done')).map(el => el.dataset.thabit);

  const wasNew = !state.logs[k];
  state.logs[k] = log; save();
  const r = computeScore(log, state.targets);
  $('#saveStatus').textContent = `Saved! Today's score: ${r.total}`;
  setTimeout(() => $('#saveStatus').textContent = '', 3500);
  toast(wasNew ? 'Log saved 🌟' : 'Log updated ✓');
  renderHome(); renderInsights();

  // Identity milestone check
  setTimeout(() => checkIdentityMilestones(), 400);
}

function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  currentMode = state.mode || 'quick';
  wire(); renderAll();
  if (!state.onboarded) {
    setTimeout(() => { onboardStep = 0; renderOnboard(); openModal('onboardModal'); }, 300);
  } else {
    setTimeout(() => maybeShowRecap(), 800);
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
document.addEventListener('DOMContentLoaded', init);
})();
