(() => {
  'use strict';
  const STORE_KEY = 'mindtrack:v1';
  const THEME_KEY = 'mindtrack:theme';
  const defaultState = {
    targets: { idealSleep: 8, maxCaffeine: 2, idealWater: 8 },
    habits: [
      { id: 'h1', name: 'Drink water on wake', icon: '💧' },
      { id: 'h2', name: '10-min walk', icon: '🚶' },
      { id: 'h3', name: 'Read 10 min', icon: '📖' },
    ],
    customFields: [],
    logs: {},
    onboarded: false,
  };
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return structuredClone(defaultState);
      const p = JSON.parse(raw);
      return Object.assign(structuredClone(defaultState), p, {
        targets: Object.assign({}, defaultState.targets, p.targets || {}),
      });
    } catch { return structuredClone(defaultState); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch { toast('Could not save — storage full?'); }
  }

  const pad = n => String(n).padStart(2, '0');
  const todayKey = () => dateKey(new Date());
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const fromKey = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
  const prettyDate = (d, o={}) => (typeof d === 'string' ? fromKey(d) : d)
    .toLocaleDateString(undefined, Object.assign({ weekday:'short', month:'short', day:'numeric' }, o));
  function lastNDays(n) {
    const out = []; const today = new Date();
    for (let i = n-1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      out.push(dateKey(d));
    }
    return out;
  }

  function computeScore(log, t) {
    if (!log) return { total: 0, breakdown: [], empty: true };
    const bd = [];
    let sleepPts = 0;
    if (typeof log.sleep === 'number') {
      sleepPts = Math.max(0, 25 - Math.abs(log.sleep - t.idealSleep) * 5);
    }
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
    if (!has) return "Log today to see your score";
    if (n >= 90) return "Amazing day 🌟 Keep this rhythm.";
    if (n >= 75) return "Great job 🔥 You're on track.";
    if (n >= 60) return "Solid day 💪 Small tweaks tomorrow.";
    if (n >= 40) return "Room to improve — you've got this 💪";
    return "Tough day. Be kind to yourself 🌱 Tomorrow's a reset.";
  }
  const stressDescriptor = v => v<=2?'Low':v<=5?'Moderate':v<=7?'High':'Very high';
  const migraineDescriptor = v => v===0?'None':v<=3?'Mild':v<=6?'Moderate':v<=8?'Severe':'Very severe';

  function logsArray() {
    return Object.entries(state.logs).map(([k,v]) => ({ key:k, ...v })).sort((a,b) => a.key < b.key ? -1 : 1);
  }
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;

  function generatePatterns() {
    const all = logsArray();
    const recent = all.slice(-21);
    const out = [];
    if (recent.length < 4) {
      out.push({ kind:'good', emo:'📊', title:'Keep logging', body:`Log a few more days (you have ${recent.length}) to unlock pattern detection.` });
      return out;
    }
    const migDays = recent.filter(l => (l.migraine||0) >= 4);
    const clearDays = recent.filter(l => (l.migraine||0) < 4);
    if (migDays.length >= 2 && clearDays.length >= 2) {
      const sm = avg(migDays.map(l => l.sleep || 0)); const sn = avg(clearDays.map(l => l.sleep || 0));
      if (sm != null && sn != null && (sn - sm) > 0.5) {
        out.push({ kind:'warn', emo:'🌙', title:'Less sleep → more migraines', body:`On migraine days you slept ${sm.toFixed(1)}h on average, vs ${sn.toFixed(1)}h on clear days. Aim closer to your sleep target.` });
      }
      const cm = avg(migDays.map(l => l.caffeine || 0)); const cn = avg(clearDays.map(l => l.caffeine || 0));
      if (cm != null && cn != null && (cm - cn) > 0.5) {
        out.push({ kind:'warn', emo:'☕', title:'Higher caffeine → more migraines', body:`Migraine days averaged ${cm.toFixed(1)} cups vs ${cn.toFixed(1)} on clear days. Try capping at ${state.targets.maxCaffeine}.` });
      }
      const stm = avg(migDays.map(l => l.stress || 0)); const stn = avg(clearDays.map(l => l.stress || 0));
      if (stm - stn > 1) {
        out.push({ kind:'warn', emo:'💗', title:'High stress days bring migraines', body:`Stress on migraine days averaged ${stm.toFixed(1)} vs ${stn.toFixed(1)}. Try a 5-min breathing break.` });
      }
    }
    const interrupted = recent.filter(l => (l.sleepInt||0) >= 2);
    const calm = recent.filter(l => (l.sleepInt||0) < 2);
    if (interrupted.length >= 2 && calm.length >= 2) {
      const sa = avg(interrupted.map(l => computeScore(l, state.targets).total));
      const sb = avg(calm.map(l => computeScore(l, state.targets).total));
      if (sb - sa > 5) {
        out.push({ kind:'warn', emo:'😴', title:'Sleep interruptions hurt your score', body:`Interrupted nights average ${Math.round(sa)} vs ${Math.round(sb)} on calm nights.` });
      }
    }
    const last7 = recent.slice(-7); const prev7 = recent.slice(-14, -7);
    if (last7.length >= 4 && prev7.length >= 4) {
      const a = avg(last7.map(l => computeScore(l, state.targets).total));
      const b = avg(prev7.map(l => computeScore(l, state.targets).total));
      if (a - b >= 5) out.push({ kind:'good', emo:'🎉', title:'You are improving', body:`Your weekly average rose from ${Math.round(b)} to ${Math.round(a)}. Keep going.` });
      else if (b - a >= 5) out.push({ kind:'warn', emo:'📉', title:'Slight dip this week', body:`Down from ${Math.round(b)} to ${Math.round(a)}. Pick one habit to focus on tomorrow.` });
    }
    if (out.length === 0) out.push({ kind:'good', emo:'🧘', title:'Looking steady', body:'No strong patterns detected yet. Keep logging — patterns become clearer over 2–3 weeks.' });
    return out;
  }

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function renderAll() { renderHome(); renderTrack(); renderInsights(); renderHistory(); renderLearn(); renderSettings(); }

  function renderHome() {
    const now = new Date(); const hour = now.getHours();
    const greet = hour<5?'Hey night owl':hour<12?'Good morning':hour<17?'Good afternoon':hour<22?'Good evening':'Good night';
    $('#greetText').textContent = greet;
    $('#greetDate').textContent = now.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });

    const log = state.logs[todayKey()];
    const r = computeScore(log, state.targets);
    const has = !!log; const score = has ? r.total : 0;
    $('#scoreNum').textContent = has ? score : '--';
    $('#scoreMessage').textContent = scoreMessage(score, has);
    const circ = 603.18;
    $('#ringFg').style.strokeDashoffset = has ? (circ - (score/100)*circ) : circ;
    const card = $('#scoreCard');
    card.classList.remove('score-good','score-mid','score-low');
    if (has) card.classList.add('score-' + scoreBucket(score));

    const grid = $('#quickStats');
    const t = state.targets;
    const cells = [
      { icon:'🌙', tone:'sky', label:'Sleep', value: log?.sleep!=null?`${log.sleep}h`:'—', target:`${t.idealSleep}h target`, pct: log?.sleep ? Math.min(100, (log.sleep / t.idealSleep) * 100) : 0, mod: log && Math.abs((log.sleep||0) - t.idealSleep) > 2 ? 'warn' : '' },
      { icon:'☕', tone:'amber', label:'Caffeine', value: log?.caffeine!=null?`${log.caffeine}`:'—', target:`max ${t.maxCaffeine}`, pct: log?.caffeine!=null ? Math.min(100, (log.caffeine / Math.max(1, t.maxCaffeine*1.5))*100) : 0, mod: (log?.caffeine||0) > t.maxCaffeine ? 'alert' : '' },
      { icon:'💧', tone:'mint', label:'Water', value: log?.water!=null?`${log.water}`:'—', target:`${t.idealWater} target`, pct: log?.water ? Math.min(100, (log.water / t.idealWater)*100) : 0, mod:'' },
      { icon:'💗', tone:'pink', label:'Migraine', value: log?.migraine!=null?migraineDescriptor(log.migraine):'—', target:'today', pct: log ? (1 - (log.migraine||0)/10)*100 : 0, mod: (log?.migraine||0) >= 4 ? 'alert' : '' },
    ];
    grid.innerHTML = cells.map(c => `
      <div class="stat-card tone-${c.tone} ${c.mod}" data-nav="${c.label==='Migraine'||c.label==='Sleep'?'insights':'track'}">
        <div class="stat-head">
          <div class="stat-emoji">${c.icon}</div>
          <span class="stat-arrow">→</span>
        </div>
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${c.value}</div>
        <div class="stat-target">${c.target}</div>
        <div class="stat-bar"><span style="width:${Math.max(0,c.pct)}%"></span></div>
      </div>`).join('');
    grid.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => navTo(el.dataset.nav)));

    const hh = $('#homeHabits');
    const tl = state.logs[todayKey()] || { habits: [] };
    if (state.habits.length === 0) hh.innerHTML = `<div class="habit-empty">No habits yet. Add some in Settings.</div>`;
    else {
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

  function renderTrack() {
    const k = todayKey();
    $('#logDate').max = k;
    if (!$('#logDate').value) $('#logDate').value = k;
    loadLogIntoForm($('#logDate').value);
    $('#customFieldsTrack').innerHTML = state.customFields.map(cf => customFieldHtml(cf)).join('');
    const th = $('#trackHabits');
    const log = state.logs[$('#logDate').value] || { habits: [] };
    if (state.habits.length === 0) th.innerHTML = `<div class="habit-empty">Add habits in Settings to track them here.</div>`;
    else {
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

  function loadLogIntoForm(k) {
    const log = state.logs[k] || {};
    setRange('sleepHours', log.sleep ?? 7, 'valSleep', v => v + 'h');
    setRange('sleepInt', log.sleepInt ?? 0, 'valInt', v => v);
    setRange('caffeine', log.caffeine ?? 0, 'valCaf', v => v);
    setRange('water', log.water ?? 0, 'valWater', v => v);
    setRange('migraine', log.migraine ?? 0, 'valMig', v => migraineDescriptor(+v));
    setRange('stress', log.stress ?? 2, 'valStress', v => stressDescriptor(+v));
    setRange('aches', log.aches ?? 0, 'valAches', v => +v === 0 ? 'None' : v + '/10');
    if (log.periodPain != null) {
      $('#periodToggle').checked = true;
      $('#periodWrap').classList.remove('hidden');
      setRange('periodPain', log.periodPain, 'valPeriod', v => +v === 0 ? 'None' : v + '/10');
    } else {
      $('#periodToggle').checked = false;
      $('#periodWrap').classList.add('hidden');
    }
    $('#notes').value = log.notes || '';
  }

  function setRange(id, value, valId, fmt) {
    const inp = $('#' + id); if (!inp) return;
    inp.value = value;
    if (valId) $('#' + valId).textContent = fmt(value);
  }

  function renderInsights() {
    const all = logsArray();
    const last7 = all.slice(-7); const prev7 = all.slice(-14, -7);
    const cur = avg(last7.map(l => computeScore(l, state.targets).total));
    const prev = avg(prev7.map(l => computeScore(l, state.targets).total));
    const sleep = avg(last7.map(l => l.sleep || 0).filter(Boolean));
    const caf = avg(last7.map(l => l.caffeine || 0));
    const migDays = last7.filter(l => (l.migraine||0) >= 4).length;

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
        <div class="p-text"><div class="p-title">${escapeHtml(p.title)}</div><div class="p-body">${escapeHtml(p.body)}</div></div>
      </div>`).join('');

    const total = all.length;
    const best = computeBestStreak();
    const current = computeCurrentStreak();
    const habitStreaks = state.habits.map(h => ({ name:h.name, streak:computeHabitStreak(h.id) }));

    let html = `
      <div class="progress-row"><span class="pr-label">Total logs</span><span class="pr-value">${total}</span></div>
      <div class="progress-row"><span class="pr-label">Current streak</span><span class="pr-value">${current} day${current===1?'':'s'} <span class="streak-pill">🔥 ${current}</span></span></div>
      <div class="progress-row"><span class="pr-label">Best streak</span><span class="pr-value">${best} days</span></div>
      <div class="progress-row"><span class="pr-label">Migraine-free days (last 14)</span><span class="pr-value">${days.filter(k => state.logs[k] && (state.logs[k].migraine||0) < 4).length}</span></div>`;
    habitStreaks.forEach(hs => {
      if (hs.streak > 0) html += `<div class="progress-row"><span class="pr-label">${escapeHtml(hs.name)}</span><span class="pr-value">${hs.streak}🔥</span></div>`;
    });
    $('#progressBlock').innerHTML = html;
  }

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
      if (prev) {
        const diff = Math.round((d - prev) / 86400000);
        cur = diff === 1 ? cur + 1 : 1;
      } else cur = 1;
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

  let historyFilter = 'all';
  let historySort = 'dateDesc';

  function renderHistory() {
    const all = logsArray();
    let filtered = all.filter(l => {
      switch (historyFilter) {
        case 'lowSleep': return (l.sleep||0) < state.targets.idealSleep - 1.5;
        case 'highCaf': return (l.caffeine||0) > state.targets.maxCaffeine;
        case 'highStress': return (l.stress||0) >= 6;
        case 'migraine': return (l.migraine||0) >= 1;
        default: return true;
      }
    });
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
        ${l.notes?`<div class="log-notes">"${escapeHtml(l.notes)}"</div>`:''}
        <div class="log-actions">
          <button class="link-btn" data-edit="${l.key}">Edit</button>
          <button class="link-btn" data-del="${l.key}" style="color:var(--coral)">Delete</button>
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

  const learnContent = {
    Sleep: [
      { t:'The 7–9 hour rule', s:'Most adults need 7–9 hours.', b:'Consistent sleep duration matters more than occasional long sleeps. Aim for the same range every night, even on weekends. Sleeping in past 1 hour of your usual time can shift your rhythm by days.' },
      { t:'Consistent bedtime', s:'Same time daily strengthens your rhythm.', b:'Your circadian rhythm is set by light and timing. Going to bed within a 30-minute window every night dramatically improves sleep quality, mood and migraine resilience.' },
      { t:'Screen curfew', s:'Stop screens 60 minutes before bed.', b:'Blue light suppresses melatonin and stimulating content keeps your nervous system alert. Switch to dim warm light, paper books, light stretching or a warm shower.' },
      { t:'Cool, dark, quiet', s:'16–19°C is ideal for most people.', b:'A slightly cool room, blackout curtains and minimal noise create the conditions for deep sleep. Even tiny LEDs can disrupt melatonin — cover or remove them.' },
      { t:'Caffeine cutoff', s:'No caffeine after 2 PM.', b:'Caffeine has a half-life of 5–6 hours. A 4 PM coffee is still 50% active in your system at 10 PM. Cut earlier — your deep sleep will improve noticeably within a week.' },
    ],
    Stress: [
      { t:'Box breathing', s:'Inhale 4, hold 4, exhale 4, hold 4.', b:'Repeat 4–6 cycles. This activates your parasympathetic nervous system in under 90 seconds. Use it before stressful meetings or when migraine warning signs appear.' },
      { t:'The 5-minute rule', s:'Take a real break every 90 minutes.', b:'Step away from screens. Stand, stretch, drink water, look out a window. Mental fatigue accumulates silently — short resets prevent the afternoon crash.' },
      { t:'Grounding 5-4-3-2-1', s:'Anchor in your senses.', b:'Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste. Brings you out of anxious looping and into the present moment.' },
      { t:'Walk it off', s:'10-minute walks lower cortisol.', b:'Walking — especially outdoors — measurably reduces stress hormones within 10 minutes. Add daylight and you also strengthen your sleep that night.' },
      { t:'Journal three lines', s:'3 lines daily beats 3 pages weekly.', b:'Write what you felt, what triggered it, and one tiny thing you can do tomorrow. Consistency over depth — this small ritual builds emotional clarity over weeks.' },
    ],
    Nutrition: [
      { t:'Hydrate first', s:'Water before coffee.', b:'After 7–9 hours without water, your body is mildly dehydrated. A glass of water before caffeine reduces headache risk and helps caffeine work better at lower doses.' },
      { t:'Protein at breakfast', s:'Stabilizes blood sugar all day.', b:'20–30g of protein in the morning reduces afternoon cravings, energy crashes and irritability. Eggs, Greek yogurt, cottage cheese, or a protein shake all work.' },
      { t:'Magnesium matters', s:'Linked to fewer migraines.', b:'Magnesium glycinate (300–400mg evening) is one of the most consistently studied supplements for migraine prevention and sleep quality. Check with a doctor first.' },
      { t:'80/20 whole foods', s:'Most meals minimally processed.', b:'You don\'t need a perfect diet — just make 80% of your meals foods your grandmother would recognize. The other 20% is for life.' },
      { t:'Mindful eating', s:'No screens at meals.', b:'Eating while distracted leads to overeating, indigestion and missed satiety signals. Even 10 minutes of phone-free eating improves digestion and satisfaction.' },
    ],
    Habits: [
      { t:'Habit stacking', s:'Pair new habits with existing ones.', b:'Format: "After I [existing habit], I will [new habit]." Example: "After I pour my morning coffee, I will write 3 lines in my journal." This leverages neural pathways already wired.' },
      { t:'The 2-minute rule', s:'Make starting embarrassingly easy.', b:'"Read a book" becomes "read 1 page." "Exercise" becomes "put on workout clothes." Show up, and momentum often takes over. Identity forms from showing up, not from output.' },
      { t:'Track to win', s:'What gets measured improves.', b:'Logging itself changes behavior. The act of marking a day creates accountability and pattern recognition that motivation alone cannot sustain.' },
      { t:'Don\'t break the chain', s:'Streaks build identity.', b:'Every consecutive day reinforces "I am the kind of person who does this." Missing once is fine — never miss twice. The second miss is where habits die.' },
      { t:'Environment design', s:'Make good habits obvious.', b:'Put the running shoes by the bed. Hide the chips behind the broccoli. Willpower is a finite resource — design beats discipline every time.' },
    ],
    'Mental Wellness': [
      { t:'Connect daily', s:'Reach out to one person.', b:'A short text, a 5-minute call, asking a colleague how they really are. Loneliness is a stronger health risk than smoking — small connections compound.' },
      { t:'Nature time', s:'20 minutes outside lowers stress.', b:'Even an urban park works. Sunlight regulates mood, mood regulates sleep, sleep regulates everything else. The cheapest mental health intervention available.' },
      { t:'Limit news', s:'Cap at 15 minutes daily.', b:'News is engineered to capture attention through alarm. Stay informed, but on your terms — pick one or two trusted sources, set a timer, then close it.' },
      { t:'Practice gratitude', s:'3 specific things, daily.', b:'Vague gratitude ("I\'m grateful for my family") wears off. Specific gratitude ("the way Sara laughed at lunch") rewires attention toward what\'s working.' },
      { t:'Ask for help', s:'Strength, not weakness.', b:'Talking to a professional is maintenance, not crisis intervention. Therapy, coaching or support groups give you tools and an outside view your own mind cannot provide.' },
    ],
  };
  let activeLearnTab = 'Sleep';

  function renderLearn() {
    const tabs = $('#learnTabs');
    tabs.innerHTML = Object.keys(learnContent).map(t => `<button class="learn-tab ${t===activeLearnTab?'active':''}" data-ltab="${t}">${t}</button>`).join('');
    tabs.querySelectorAll('[data-ltab]').forEach(b => b.addEventListener('click', () => { activeLearnTab = b.dataset.ltab; renderLearn(); }));
    $('#learnContent').innerHTML = learnContent[activeLearnTab].map(it => `
      <div class="learn-card">
        <div class="lc-row">
          <div><div class="lc-title">${escapeHtml(it.t)}</div><div class="lc-snippet">${escapeHtml(it.s)}</div></div>
          <span class="lc-toggle">+</span>
        </div>
        <div class="lc-body">${escapeHtml(it.b)}</div>
      </div>`).join('');
    $('#learnContent').querySelectorAll('.learn-card').forEach(c => c.addEventListener('click', () => c.classList.toggle('open')));
  }

  function renderSettings() {
    setRange('tgtSleep', state.targets.idealSleep, 'tgtSleepVal', v => v);
    setRange('tgtCaf', state.targets.maxCaffeine, 'tgtCafVal', v => v);
    setRange('tgtWater', state.targets.idealWater, 'tgtWaterVal', v => v);

    const hm = $('#habitMgr');
    if (state.habits.length === 0) hm.innerHTML = `<p class="muted small">No habits yet. Add one below.</p>`;
    else {
      hm.innerHTML = state.habits.map(h => `
        <div class="h-row">
          <div class="h-info"><span class="h-name">${h.icon||'✨'} ${escapeHtml(h.name)}</span>
          <span class="h-meta">streak: ${computeHabitStreak(h.id)} 🔥</span></div>
          <button class="h-del" data-delhabit="${h.id}">✕</button>
        </div>`).join('');
      hm.querySelectorAll('[data-delhabit]').forEach(b => b.addEventListener('click', () => {
        if (confirm('Delete this habit?')) {
          state.habits = state.habits.filter(h => h.id !== b.dataset.delhabit);
          Object.values(state.logs).forEach(l => { if (l.habits) l.habits = l.habits.filter(id => id !== b.dataset.delhabit); });
          save(); renderAll();
        }
      }));
    }
    const cm = $('#customMgr');
    if (state.customFields.length === 0) cm.innerHTML = `<p class="muted small">No custom fields. Add one below to track anything else.</p>`;
    else {
      cm.innerHTML = state.customFields.map(c => `
        <div class="h-row"><div class="h-info"><span class="h-name">${escapeHtml(c.name)}</span>
        <span class="h-meta">${c.type}</span></div>
        <button class="h-del" data-delcf="${c.id}">✕</button></div>`).join('');
      cm.querySelectorAll('[data-delcf]').forEach(b => b.addEventListener('click', () => {
        if (confirm('Delete this field?')) {
          state.customFields = state.customFields.filter(c => c.id !== b.dataset.delcf);
          Object.values(state.logs).forEach(l => { if (l.custom) delete l.custom[b.dataset.delcf]; });
          save(); renderAll();
        }
      }));
    }
  }

  function openScoreModal() {
    const k = todayKey(); const log = state.logs[k];
    const r = computeScore(log, state.targets); const body = $('#scoreBreakdown');
    if (!log) {
      body.innerHTML = `<p class="muted center">No log for today yet. Head to <a href="#" id="goTrack" class="link-btn" style="display:inline">Track</a> to add one.</p>`;
      $('#goTrack').addEventListener('click', e => { e.preventDefault(); closeModal('scoreModal'); navTo('track'); });
      openModal('scoreModal'); return;
    }
    body.innerHTML = `
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:56px;font-weight:800;letter-spacing:-1px;background:linear-gradient(135deg,var(--mint),var(--lavender));-webkit-background-clip:text;background-clip:text;color:transparent">${r.total}</div>
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
    if (mt) mt.setAttribute('content', t === 'light' ? '#f6f8fc' : '#0a0e1a');
    localStorage.setItem(THEME_KEY, t);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function wire() {
    $$('.tab').forEach(t => t.addEventListener('click', () => navTo(t.dataset.nav)));
    $$('[data-nav]').forEach(b => b.addEventListener('click', () => navTo(b.dataset.nav)));
    $('#btnTheme').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
    $('#btnSettings').addEventListener('click', () => { renderSettings(); openModal('settingsModal'); });
    $$('.close-modal').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
    $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
    $('#scoreCard').addEventListener('click', openScoreModal);
    $('#scoreCard').addEventListener('keypress', e => { if (e.key === 'Enter' || e.key === ' ') openScoreModal(); });

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
      $('#newHabit').value = ''; save(); renderAll();
    });

    $('#addCustom').addEventListener('click', () => {
      const name = $('#newCustom').value.trim(); if (!name) return;
      state.customFields.push({ id:'cf'+Date.now(), name, type:$('#newCustomType').value });
      $('#newCustom').value = ''; save(); renderAll();
    });

    $$('#filterChips .chip').forEach(c => c.addEventListener('click', () => {
      $$('#filterChips .chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active'); historyFilter = c.dataset.filter; renderHistory();
    }));
    $('#sortBy').addEventListener('change', e => { historySort = e.target.value; renderHistory(); });

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
        save(); renderAll(); closeModal('settingsModal'); toast('All data cleared');
      }
    });

    $('#welcomeStart').addEventListener('click', () => { state.onboarded = true; save(); closeModal('welcomeModal'); });
  }

  function saveLog() {
    const k = $('#logDate').value;
    if (!k) { toast('Pick a date'); return; }
    const existing = state.logs[k] || newEmptyLog(k);
    const log = {
      ...existing, date:k,
      sleep: parseFloat($('#sleepHours').value),
      sleepInt: parseInt($('#sleepInt').value, 10),
      caffeine: parseInt($('#caffeine').value, 10),
      water: parseInt($('#water').value, 10),
      migraine: parseInt($('#migraine').value, 10),
      stress: parseInt($('#stress').value, 10),
      aches: parseInt($('#aches').value, 10),
      notes: $('#notes').value.trim(),
      habits: Array.from(document.querySelectorAll('#trackHabits .habit-item.done')).map(el => el.dataset.thabit),
      custom: {},
      updatedAt: Date.now(),
    };
    if ($('#periodToggle').checked) log.periodPain = parseInt($('#periodPain').value, 10);
    else delete log.periodPain;

    document.querySelectorAll('#customFieldsTrack [data-cf]').forEach(f => {
      const id = f.dataset.cf; const t = f.dataset.cftype; const inp = f.querySelector('[data-cfin]');
      if (t === 'check') log.custom[id] = inp.checked;
      else if (t === 'number') log.custom[id] = inp.value === '' ? null : parseFloat(inp.value);
      else log.custom[id] = parseInt(inp.value, 10);
    });

    state.logs[k] = log; save();
    const r = computeScore(log, state.targets);
    $('#saveStatus').textContent = `Saved! Today's score: ${r.total}`;
    setTimeout(() => $('#saveStatus').textContent = '', 3500);
    toast('Log saved 🌟');
    renderHome(); renderInsights();
  }

  function init() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
    wire(); renderAll();
    if (!state.onboarded && Object.keys(state.logs).length === 0) {
      setTimeout(() => openModal('welcomeModal'), 300);
    }
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
