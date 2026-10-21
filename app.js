// Tipos de cadência aceitos no parâmetro ?cadenceTypes= da URL.
// Ajuste esta lista para os tipos que a sua operação usa.
const CADENCE_TYPES = [
  { id: 'STANDARD', label: 'Padrão' },
  { id: 'INBOUND', label: 'Inbound' },
];

const METRICS = [
  { id: 'activities', label: 'Atividades realizadas' },
  { id: 'calls', label: 'Ligações' },
  { id: 'connections', label: 'Conexões' },
  { id: 'meetings', label: 'Reuniões agendadas' },
  { id: 'qualified', label: 'Leads qualificados' },
];

const GOALS_KEY = 'painel-metas:goals';

// ---------- Dados ----------

// Gera dados de exemplo determinísticos para o mês corrente.
// Substitua por uma chamada à sua API mantendo o mesmo formato.
function loadData() {
  const users = [
    { id: 'u1', name: 'Ana Ribeiro', team: 'SDR Sul' },
    { id: 'u2', name: 'Bruno Lima', team: 'SDR Sul' },
    { id: 'u3', name: 'Carla Souza', team: 'SDR Sudeste' },
    { id: 'u4', name: 'Diego Alves', team: 'SDR Sudeste' },
    { id: 'u5', name: 'Elisa Martins', team: 'SDR Sudeste' },
  ];

  let seed = 42;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

  const now = new Date();
  const records = [];
  for (let d = 1; d <= now.getDate(); d++) {
    const date = new Date(now.getFullYear(), now.getMonth(), d);
    if (isWeekend(date)) continue;
    for (const u of users) {
      for (const ct of CADENCE_TYPES) {
        const weight = ct.id === 'STANDARD' ? 1 : 0.35;
        const activities = Math.round((40 + rand() * 30) * weight);
        const calls = Math.round(activities * (0.45 + rand() * 0.15));
        const connections = Math.round(calls * (0.18 + rand() * 0.1));
        const meetings = Math.round(connections * (0.15 + rand() * 0.2));
        const qualified = Math.round(meetings * (0.5 + rand() * 0.4));
        records.push({ date: toISO(date), userId: u.id, cadenceType: ct.id, activities, calls, connections, meetings, qualified });
      }
    }
  }

  const defaultGoals = {};
  for (const u of users) {
    defaultGoals[u.id] = { activities: 1300, calls: 650, connections: 140, meetings: 30, qualified: 20 };
  }

  return { users, records, defaultGoals };
}

// ---------- Datas ----------

function isWeekend(d) { const w = d.getDay(); return w === 0 || w === 6; }
function toISO(d) { return d.toISOString().slice(0, 10); }

function businessDays(from, to) {
  let n = 0;
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) if (!isWeekend(d)) n++;
  return n;
}

function periodRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (period === 'today') return { start: today, end: today, today };
  if (period === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: start < monthStart ? monthStart : start, end: end > monthEnd ? monthEnd : end, today };
  }
  return { start: monthStart, end: monthEnd, today };
}

// ---------- Estado e URL ----------

const state = {
  period: 'month',
  team: 'all',
  user: 'all',
  cadenceTypes: ['STANDARD'],
  metric: 'activities',
};

function readURL() {
  const p = new URLSearchParams(location.search);
  if (p.has('cadenceTypes')) {
    const valid = p.get('cadenceTypes').split(',').filter((c) => CADENCE_TYPES.some((t) => t.id === c));
    if (valid.length) state.cadenceTypes = valid;
  }
  for (const key of ['period', 'team', 'user', 'metric']) if (p.has(key)) state[key] = p.get(key);
}

function writeURL() {
  const p = new URLSearchParams();
  p.set('cadenceTypes', state.cadenceTypes.join(','));
  if (state.period !== 'month') p.set('period', state.period);
  if (state.team !== 'all') p.set('team', state.team);
  if (state.user !== 'all') p.set('user', state.user);
  if (state.metric !== 'activities') p.set('metric', state.metric);
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function loadGoals(defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(GOALS_KEY));
    if (saved) return { ...defaults, ...saved };
  } catch {}
  return structuredClone(defaults);
}

function saveGoals(goals) {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(goals)); } catch {}
}

// ---------- Cálculo ----------

function visibleUsers(data) {
  return data.users.filter((u) =>
    (state.team === 'all' || u.team === state.team) && (state.user === 'all' || u.id === state.user));
}

function compute(data, goals) {
  const { start, end, today } = periodRange(state.period);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // Metas são mensais; para semana e dia, proporcionais aos dias úteis do período.
  const monthDays = businessDays(monthStart, monthEnd);
  const goalFactor = businessDays(start, end) / monthDays;
  const elapsed = businessDays(start, today < end ? today : end);
  const paceFactor = elapsed / Math.max(1, businessDays(start, end));

  const users = visibleUsers(data);
  const ids = new Set(users.map((u) => u.id));
  const startISO = toISO(start), endISO = toISO(end);
  const rows = data.records.filter((r) =>
    ids.has(r.userId) && state.cadenceTypes.includes(r.cadenceType) && r.date >= startISO && r.date <= endISO);

  const perUser = {};
  for (const u of users) perUser[u.id] = Object.fromEntries(METRICS.map((m) => [m.id, 0]));
  const perDay = {};
  for (const r of rows) {
    perDay[r.date] ??= Object.fromEntries(METRICS.map((m) => [m.id, 0]));
    for (const m of METRICS) {
      perUser[r.userId][m.id] += r[m.id];
      perDay[r.date][m.id] += r[m.id];
    }
  }

  const goalFor = (uid, mid) => Math.round((goals[uid]?.[mid] ?? 0) * goalFactor);
  const totals = METRICS.map((m) => {
    const done = users.reduce((s, u) => s + perUser[u.id][m.id], 0);
    const goal = users.reduce((s, u) => s + goalFor(u.id, m.id), 0);
    return { ...m, done, goal, expected: Math.round(goal * paceFactor) };
  });

  return { users, perUser, perDay, totals, goalFor, paceFactor, start, end };
}

// ---------- Render ----------

const fmt = new Intl.NumberFormat('pt-BR');
const pct = (done, goal) => (goal ? Math.round((done / goal) * 100) : 0);

function statusClass(done, expected) {
  if (!expected) return 'ok';
  const r = done / expected;
  return r >= 1 ? 'ok' : r >= 0.8 ? 'warn' : 'bad';
}

function renderKPIs(result) {
  document.getElementById('kpis').innerHTML = result.totals.map((t) => {
    const cls = statusClass(t.done, t.expected);
    const gap = t.done - t.expected;
    return `
      <article class="kpi">
        <h3>${t.label}</h3>
        <div><span class="value">${fmt.format(t.done)}</span> <span class="goal">/ ${fmt.format(t.goal)}</span></div>
        <div class="bar"><span class="bg-${cls}" style="width:${Math.min(100, pct(t.done, t.goal))}%"></span></div>
        <div class="foot">
          <span>${pct(t.done, t.goal)}% da meta</span>
          <span class="${cls}">${gap >= 0 ? '+' : ''}${fmt.format(gap)} vs. ritmo</span>
        </div>
      </article>`;
  }).join('');
}

function renderChart(result) {
  const el = document.getElementById('chart');
  const { start, end } = result;
  const days = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) if (!isWeekend(d)) days.push(toISO(d));
  if (!days.length) { el.innerHTML = '<p class="sample-note">Sem dias úteis no período.</p>'; return; }

  const total = result.totals.find((t) => t.id === state.metric);
  const dailyGoal = total.goal / days.length;
  let acc = 0;
  const actual = days.map((d) => (result.perDay[d] ? (acc += result.perDay[d][state.metric]) : null));
  const todayISO = toISO(new Date());
  for (let i = 0; i < days.length; i++) if (days[i] <= todayISO && actual[i] === null) actual[i] = i ? actual[i - 1] ?? 0 : 0;

  const W = 800, H = 240, P = { l: 48, r: 12, t: 12, b: 28 };
  const max = Math.max(total.goal, acc, 1);
  const x = (i) => P.l + (days.length === 1 ? (W - P.l - P.r) / 2 : (i / (days.length - 1)) * (W - P.l - P.r));
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);

  const goalPath = days.map((_, i) => `${i ? 'L' : 'M'}${x(i)},${y(dailyGoal * (i + 1))}`).join('');
  const actualPts = actual.map((v, i) => (v === null ? null : [x(i), y(v)])).filter(Boolean);
  const actualPath = actualPts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const step = Math.ceil(days.length / 10);

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Acumulado de ${total.label} versus meta">
      ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--border)"/>
        <text x="${P.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt.format(t)}</text>`).join('')}
      ${days.map((d, i) => (i % step ? '' : `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${d.slice(8)}/${d.slice(5, 7)}</text>`)).join('')}
      <path d="${goalPath}" fill="none" stroke="var(--muted)" stroke-dasharray="5 4" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <path d="${actualPath}" fill="none" stroke="var(--accent)" stroke-width="3" vector-effect="non-scaling-stroke"/>
    </svg>
    <p class="sample-note">Linha contínua: realizado acumulado. Tracejada: ritmo necessário para bater a meta.</p>`;
}

function renderTable(result) {
  const table = document.getElementById('ranking');
  table.querySelector('thead').innerHTML =
    `<tr><th>Vendedor</th>${METRICS.map((m) => `<th>${m.label}</th>`).join('')}</tr>`;

  const sorted = [...result.users].sort((a, b) =>
    pct(result.perUser[b.id][state.metric], result.goalFor(b.id, state.metric)) -
    pct(result.perUser[a.id][state.metric], result.goalFor(a.id, state.metric)));

  table.querySelector('tbody').innerHTML = sorted.map((u) => `
    <tr>
      <td><strong>${u.name}</strong><br><span class="goal">${u.team}</span></td>
      ${METRICS.map((m) => {
        const done = result.perUser[u.id][m.id];
        const goal = result.goalFor(u.id, m.id);
        const cls = statusClass(done, goal * result.paceFactor);
        return `<td><div class="cell-bar">
          <span class="num">${fmt.format(done)} / ${fmt.format(goal)}</span>
          <div class="bar"><span class="bg-${cls}" style="width:${Math.min(100, pct(done, goal))}%"></span></div>
        </div></td>`;
      }).join('')}
    </tr>`).join('');
}

function renderFilters(data) {
  const teams = [...new Set(data.users.map((u) => u.team))];
  const teamSel = document.getElementById('f-team');
  teamSel.innerHTML = `<option value="all">Todas</option>${teams.map((t) => `<option>${t}</option>`).join('')}`;
  teamSel.value = state.team;

  const userSel = document.getElementById('f-user');
  const users = data.users.filter((u) => state.team === 'all' || u.team === state.team);
  if (!users.some((u) => u.id === state.user)) state.user = 'all';
  userSel.innerHTML = `<option value="all">Todos</option>${users.map((u) => `<option value="${u.id}">${u.name}</option>`).join('')}`;
  userSel.value = state.user;

  document.getElementById('f-period').value = state.period;
  document.getElementById('f-cadence').innerHTML = CADENCE_TYPES.map((t) =>
    `<button type="button" class="chip" data-id="${t.id}" aria-pressed="${state.cadenceTypes.includes(t.id)}">${t.label}</button>`).join('');

  const metricSel = document.getElementById('f-metric');
  metricSel.innerHTML = METRICS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
  metricSel.value = state.metric;
}

// ---------- Inicialização ----------

const data = loadData();
let goals = loadGoals(data.defaultGoals);

function render() {
  writeURL();
  renderFilters(data);
  const result = compute(data, goals);
  renderKPIs(result);
  renderChart(result);
  renderTable(result);
}

function bind() {
  document.getElementById('f-period').addEventListener('change', (e) => { state.period = e.target.value; render(); });
  document.getElementById('f-team').addEventListener('change', (e) => { state.team = e.target.value; state.user = 'all'; render(); });
  document.getElementById('f-user').addEventListener('change', (e) => { state.user = e.target.value; render(); });
  document.getElementById('f-metric').addEventListener('change', (e) => { state.metric = e.target.value; render(); });
  document.getElementById('f-cadence').addEventListener('click', (e) => {
    const id = e.target.closest('.chip')?.dataset.id;
    if (!id) return;
    const on = state.cadenceTypes.includes(id);
    if (on && state.cadenceTypes.length === 1) return; // ao menos um tipo selecionado
    state.cadenceTypes = on ? state.cadenceTypes.filter((c) => c !== id) : [...state.cadenceTypes, id];
    render();
  });

  const dialog = document.getElementById('goals-dialog');
  document.getElementById('btn-goals').addEventListener('click', () => {
    document.getElementById('goals-fields').innerHTML = data.users.map((u) => `
      <div class="goal-row">
        <strong>${u.name}</strong>
        ${METRICS.map((m) => `<label>${m.label}<input type="number" min="0" name="${u.id}.${m.id}" value="${goals[u.id][m.id]}"></label>`).join('')}
      </div>`).join('');
    dialog.showModal();
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'save') return;
    for (const input of dialog.querySelectorAll('input')) {
      const [uid, mid] = input.name.split('.');
      goals[uid][mid] = Math.max(0, Number(input.value) || 0);
    }
    saveGoals(goals);
    render();
  });
}

readURL();
bind();
render();
