const teamTagsEl = document.getElementById("team-tags");
const enemyTagsEl = document.getElementById("enemy-tags");
const teamScoreEl = document.getElementById("team-score");
const enemyScoreEl = document.getElementById("enemy-score");
const resetBtn = document.querySelector('[data-action="reset"]');

// Runtime cache para os dados de campeÃµes/tags vindos do CSV
const ChampionTags = {
  rows: [], // cada item = { Champion, Gameplay1, Gameplay2, "Power Spike", "Synergy Focus" }
  byChampion: new Map(),
};

function collectActiveTags(scope) {
  // Coleta apenas das tags por campeÃ£o (nÃ£o inclui listas de sinergia/matchup)
  const items = [];
  scope.querySelectorAll(".champ-tags .pill.is-active").forEach((pill) => {
    const slug = pill.dataset.tag || pill.textContent.trim().toLowerCase();
    const text = pill.textContent.trim();
    let category = "other";
    if (pill.classList.contains("pill-gameplay")) category = "gameplay";
    else if (pill.classList.contains("pill-spike")) category = "spike";
    else if (pill.classList.contains("pill-synergy")) category = "synergy";
    items.push({ slug, text, category });
  });
  return items;
}

function renderTagCloud(container, tagItems) {
  container.innerHTML = "";
  if (!tagItems.length) {
    const emptyState = document.createElement("span");
    emptyState.className = "muted";
    emptyState.textContent = "Nenhum destaque marcado ainda.";
    container.appendChild(emptyState);
    return;
  }

  // Dedup por slug dentro de cada categoria e agrupar por cor
  const groups = {
    gameplay: new Map(),
    spike: new Map(),
    synergy: new Map(),
    other: new Map(),
  };
  for (const t of tagItems) {
    const bucket = groups[t.category] || groups.other;
    if (!bucket.has(t.slug)) bucket.set(t.slug, { text: t.text, count: 0 });
    bucket.get(t.slug).count++;
  }

  const order = ["gameplay", "spike", "synergy", "other"];
  const colorClass = {
    gameplay: "pill-gameplay",
    spike: "pill-spike",
    synergy: "pill-synergy",
    other: "",
  };

  order.forEach((cat) => {
    const bucket = groups[cat];
    if (!bucket || bucket.size === 0) return;
    const groupEl = document.createElement("div");
    groupEl.className = "tag-group";

    const entries = Array.from(bucket.entries());

    if (cat === "gameplay") {
      // Distribuir em exatamente 2 linhas visuais
      const mid = Math.ceil(entries.length / 2) || 1;
      const rows = [entries.slice(0, mid), entries.slice(mid)];
      rows.forEach((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = "tag-row";
        row.forEach(([slug, val]) => {
          const pill = document.createElement("span");
          pill.className = `pill is-active ${colorClass[cat]}`.trim();
          pill.dataset.tag = slug;
          const count = val.count > 1 ? ` Ã—${val.count}` : "";
          pill.textContent = `${val.text}${count}`;
          pill.title = `${val.text} (${val.count} ocorrÃªncia${val.count > 1 ? 's' : ''})`;
          rowEl.appendChild(pill);
        });
        groupEl.appendChild(rowEl);
      });
    } else {
      entries.forEach(([slug, val]) => {
        const pill = document.createElement("span");
        pill.className = `pill is-active ${colorClass[cat]}`.trim();
        pill.dataset.tag = slug;
        const count = val.count > 1 ? ` Ã—${val.count}` : "";
        pill.textContent = `${val.text}${count}`;
        pill.title = `${val.text} (${val.count} ocorrÃªncia${val.count > 1 ? 's' : ''})`;
        groupEl.appendChild(pill);
      });
    }
    container.appendChild(groupEl);
  });
}

function updateScores(teamTags, enemyTags) {
  const baseTeam = 55;
  const baseEnemy = 55;
  // Use a contagem de tags Ãºnicas (slug) por lado
  const uniqTeam = new Set(teamTags.map((t) => t.slug)).size;
  const uniqEnemy = new Set(enemyTags.map((t) => t.slug)).size;
  const teamScore = Math.round(baseTeam + uniqTeam * 1.5);
  const enemyScore = Math.round(baseEnemy + uniqEnemy * 1.2);
  teamScoreEl.textContent = teamScore.toString();
  enemyScoreEl.textContent = enemyScore.toString();
  teamScoreEl.classList.toggle("muted", teamScore <= enemyScore);
  enemyScoreEl.classList.toggle("muted", enemyScore <= teamScore);
}

function refresh() {
  const teamScope = document.querySelector(".panel-team");
  const enemyScope = document.querySelector(".panel-enemy");
  const teamTags = collectActiveTags(teamScope);
  const enemyTags = collectActiveTags(enemyScope);
  renderTagCloud(teamTagsEl, teamTags);
  renderTagCloud(enemyTagsEl, enemyTags);
  sanitizeVisibleCounts();
  updateScores(teamTags, enemyTags);
}

function togglePill(pill) {
  if (pill.dataset.toggle === "lock") {
    return;
  }
  pill.classList.toggle("is-active");
  refresh();
}

document.querySelectorAll(".pill-row .pill").forEach((pill) => {
  pill.addEventListener("click", () => togglePill(pill));
});

resetBtn?.addEventListener("click", () => {
  document.querySelectorAll(".pill-row .pill.is-active").forEach((pill) => {
    pill.classList.remove("is-active");
  });
  // Limpa bans e revalida bloqueios
  document.querySelectorAll('.ban-group select').forEach((s) => {
    if (s.options.length > 0) s.selectedIndex = 0;
  });
  document.querySelectorAll('.ban-group').forEach((g) => updateBanGroup(g));
  refresh();
});

refresh();

// --- IntegraÃ§Ã£o CSV de tags por campeÃ£o ---

// Parser simples de CSV com suporte a vÃ­rgulas entre aspas e emojis (UTF-8)
function parseCSV(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return { header: [], rows: [] };
  const header = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCSVLine(lines[i]);
    if (!fields.length) continue;
    const row = {};
    header.forEach((h, idx) => (row[h] = fields[idx] ?? ""));
    rows.push(row);
  }
  return { header, rows };
}

function splitCSVLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++; // escape ""
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

async function loadChampionTags() {
  try {
    // Servir a partir da raiz do repo para que este caminho funcione.
    const url = "../champ_tags/TAGS.csv";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao carregar ${url}: ${res.status}`);
    const text = await res.text(); // preserva emojis (UTF-8)
    const { rows } = parseCSV(text);
    ChampionTags.rows = rows;
    ChampionTags.byChampion.clear();
    for (const r of rows) {
      if (r.Champion) ChampionTags.byChampion.set(r.Champion, r);
    }
    populateChampionSelects();
    populateBanSelects();
  } catch (err) {
    console.warn("Nao foi possivel carregar TAGS.csv:", err);
  }
}

// Bans: preencher e bloquear duplicados
function populateBanSelects() {
  const champions = Array.from(ChampionTags.byChampion.keys()).sort((a, b) => a.localeCompare(b));
  document.querySelectorAll('.ban-group').forEach((groupEl) => {
    const selects = groupEl.querySelectorAll('select');
    selects.forEach((sel) => {
      sel.innerHTML = '';
      const ph = document.createElement('option');
      ph.value = '';
      ph.disabled = true;
      ph.selected = true;
      ph.textContent = 'Selecione um campeao';
      sel.appendChild(ph);
      champions.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
      ensureSelectIcon(sel);
      sel.addEventListener('change', () => { updateBanGroup(groupEl); ensureSelectIcon(sel); });
    });
    updateBanGroup(groupEl);
  });
}

function updateBanGroup(groupEl) {
  const selects = Array.from(groupEl.querySelectorAll('select'));
  const chosen = new Set(selects.map((s) => s.value).filter(Boolean));
  selects.forEach((sel) => {
    sel.querySelectorAll('option').forEach((opt) => {
      if (!opt.value) return; // placeholder
      opt.disabled = chosen.has(opt.value) && opt.value !== sel.value;
    });
  });
  // Também aplique efeito global aos selects de composição e picks cruzados
  refreshCompositionOptions();
}

// Retorna o conjunto de campeões banidos em ambos os lados
function getGlobalBans() {
  const set = new Set();
  document.querySelectorAll('.ban-group select').forEach((s) => {
    if (s.value) set.add(s.value);
  });
  return set;
}

function getSidePicks(side) {
  const scope = document.querySelector(side === 'team' ? '.panel-team' : '.panel-enemy');
  const set = new Set();
  if (!scope) return set;
  scope.querySelectorAll('.role-select select').forEach((s) => { if (s.value) set.add(s.value); });
  return set;
}

function refreshCompositionOptions() {
  const champions = Array.from(ChampionTags.byChampion.keys()).sort((a, b) => a.localeCompare(b));
  const banned = getGlobalBans();
  const teamPicks = getSidePicks('team');
  const enemyPicks = getSidePicks('enemy');
  document.querySelectorAll('.role-select select').forEach((sel) => {
    const isTeam = !!sel.closest('.panel-team');
    const current = sel.value || '';
    const exclude = new Set(banned);
    if (isTeam) { enemyPicks.forEach((n) => exclude.add(n)); } else { teamPicks.forEach((n) => exclude.add(n)); }
    const sameSide = isTeam ? teamPicks : enemyPicks;
    sameSide.forEach((n) => { if (n !== current) exclude.add(n); });
    const allowed = champions.filter((name) => !exclude.has(name) || name === current);
    const ph = document.createElement('option'); ph.value=''; ph.disabled=true; ph.textContent='Selecione um campeao';
    const tmp = document.createElement('select'); tmp.appendChild(ph);
    allowed.forEach((n)=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; tmp.appendChild(o); });
    sel.innerHTML = tmp.innerHTML;
    if (current && allowed.includes(current)) sel.value = current; else sel.value = '';
    if (!sel.value) {
      const item = sel.closest('li'); const holder = item && item.querySelector('.champ-tags'); if (holder) holder.innerHTML='';
    }
    ensureSelectIcon(sel);
  });
}

// Reconstroi os selects de composição filtrando campeões banidos
function refreshCompositionForBans() {
  const champions = Array.from(ChampionTags.byChampion.keys()).sort((a, b) => a.localeCompare(b));
  const banned = getGlobalBans();
  document.querySelectorAll('.role-select select').forEach((sel) => {
    const current = sel.value || '';
    const allowed = champions.filter((name) => !banned.has(name) || name === current);
    const newSel = document.createElement('select');
    const ph = document.createElement('option');
    ph.value = '';
    ph.disabled = true;
    ph.selected = !current || !allowed.includes(current);
    ph.textContent = 'Selecione um campeao';
    newSel.appendChild(ph);
    allowed.forEach((name) => {
      const o = document.createElement('option');
      o.value = name; o.textContent = name; newSel.appendChild(o);
    });
    // Troca o conteúdo mantendo o mesmo elemento
    sel.innerHTML = newSel.innerHTML;
    if (current && allowed.includes(current)) sel.value = current; else sel.value = '';
    // Se o atual foi banido, limpe as tags exibidas daquela linha
    if (!sel.value) {
      const item = sel.closest('li');
      const holder = item && item.querySelector('.champ-tags');
      if (holder) holder.innerHTML = '';
    }
  });
}

function populateChampionSelects() {
  const champions = Array.from(ChampionTags.byChampion.keys()).sort((a, b) => a.localeCompare(b));
  const selects = document.querySelectorAll(".role-select select");
  selects.forEach((sel) => {
    sel.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione um campeao";
    placeholder.disabled = true;
    placeholder.selected = true;
    sel.appendChild(placeholder);
    champions.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    // NÃ£o preservar seleÃ§Ã£o inicial -> comeÃ§ar vazio
    sel.value = "";
  });

  // Listener para atualizar badges e ativar pills relacionadas ao campeao
  document.querySelectorAll(".role-list li").forEach((item) => {
    const sel = item.querySelector(".role-select select");
    if (!sel) return;
    if (!item.querySelector(".champ-tags")) {
      const holder = document.createElement("div");
      holder.className = "champ-tags pill-row";
      item.appendChild(holder);
    }
    sel.addEventListener("change", () => { applyChampionTagsToRow(item, sel.value); refreshCompositionOptions(); });
    if (sel.value) applyChampionTagsToRow(item, sel.value);
  });
  refreshCompositionOptions();
  // Ajusta os selects contra bans existentes
  refreshCompositionForBans();
}

function slugifyTag(tag) {
  return String(tag || "")
    .toLowerCase()
    .replace(/\s*\+\s*/g, " ")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Mapeia alguns nomes do CSV para os data-tags existentes
const TAG_MAP = new Map([
  ["scaling", "scaling"],
  ["dps", "dps-mage"],
  ["anti-tank", "anti-tank"],
  ["two-items", "two-items"],
  ["three-items", "three-items"],
  ["first-item", "first-item"],
  ["teamfight", "teamfight"],
  ["roamer", "roamer"],
  ["engage", "engage"],
  ["diver", "diver"],
  ["tank", "tank"],
  ["control-mage", "control-mage"],
  ["zone-control", "zone-control"],
  ["waveclear", "waveclear"],
  ["bruiser", "bruiser"],
  ["reset-potential", "reset-potential"],
  ["pick-offs", "pick-offs"],
  ["first-target", "first-target"],
]);

function applyChampionTagsToRow(rowEl, championName) {
  const info = ChampionTags.byChampion.get(championName);
  const holder = rowEl.querySelector(".champ-tags");
  holder.innerHTML = "";
  if (!info) return;
  const values = [
    { k: "Gameplay1", v: info["Gameplay1"] },
    { k: "Gameplay2", v: info["Gameplay2"] },
    { k: "Power Spike", v: info["Power Spike"] },
    { k: "Synergy Focus", v: info["Synergy Focus"] },
  ].filter((x) => Boolean(x.v));

  // Mostrar badges com o texto original (com emojis, se houver)
  values.forEach(({ k, v }) => {
    const pill = document.createElement("span");
    const slug = slugifyTag(v);
    let colorClass = "pill-gameplay";
    if (k === "Power Spike") colorClass = "pill-spike";
    else if (k === "Synergy Focus") colorClass = "pill-synergy";
    pill.className = `pill is-active ${colorClass}`;
    pill.dataset.tag = slug;
    pill.textContent = v;
    holder.appendChild(pill);
  });

  // As tags do CSV jÃ¡ foram adicionadas acima e marcadas como is-active
  refresh();
}

// Inicia carregamento do CSV assim que a pÃ¡gina abrir
loadChampionTags();

// Substitui caracteres de multiplicacao mal-decodificados por 'x'
function sanitizeVisibleCounts() {
  document.querySelectorAll('.tag-cloud .pill, .champ-tags .pill').forEach((pill) => {
    const s = pill.textContent;
    const cleaned = s
      .replace(/\u00D7/g, 'x') // × (times)
      .replace(/Ã—/g, 'x')
      .replace(/[^\x20-\x7E]-(\d+)/g, ' x$1');
    if (s !== cleaned) pill.textContent = cleaned;
  });
}

// -------- Ícones de Campeões --------
function championIdForIcon(name) {
  if (!name) return null;
  const special = new Map([
    ["Wukong", "MonkeyKing"], ["LeBlanc", "Leblanc"], ["Cho'Gath", "Chogath"], ["Vel'Koz", "Velkoz"],
    ["Kha'Zix", "Khazix"], ["Kai'sa", "Kaisa"], ["Kai'Sa", "Kaisa"], ["Bel'Veth", "Belveth"],
    ["K'Sante", "KSante"], ["Renata Glasc", "Renata"], ["Dr. Mundo", "DrMundo"], ["Jarvan IV", "JarvanIV"],
    ["Lee Sin", "LeeSin"], ["Master Yi", "MasterYi"], ["Miss Fortune", "MissFortune"], ["Twisted Fate", "TwistedFate"],
    ["Tahm Kench", "TahmKench"], ["Xin Zhao", "XinZhao"], ["Aurelion Sol", "AurelionSol"], ["Kog'Maw", "KogMaw"],
  ]);
  if (special.has(name)) return special.get(name);
  const cleaned = name
    .normalize('NFD').replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^([a-z])/, (m) => m.toUpperCase());
  return cleaned;
}

function championIconUrl(name) {
  const id = championIdForIcon(name);
  if (!id) return '';
  const ver = '14.20.1';
  return `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${id}.png`;
}

function ensureSelectIcon(sel) {
  let icon = sel.parentElement && sel.parentElement.classList.contains('select-with-icon')
    ? sel.parentElement.querySelector('.champ-icon')
    : null;
  if (!icon) {
    const wrap = document.createElement('div');
    wrap.className = 'select-with-icon';
    const imgWrap = document.createElement('span'); imgWrap.className = 'champ-icon'; const img = document.createElement('img'); imgWrap.appendChild(img);
    sel.replaceWith(wrap); wrap.appendChild(imgWrap); wrap.appendChild(sel); icon = imgWrap;
  }
  const img = icon.querySelector('img');
  const url = championIconUrl(sel.value);
  if (sel.value && url) { img.src = url; img.alt = sel.value; icon.style.visibility = 'visible'; }
  else { img.removeAttribute('src'); icon.style.visibility = 'hidden'; }
}

function createInlineChamp(name) {
  const span = document.createElement('span'); span.className = 'champ-inline';
  const ic = document.createElement('span'); ic.className = 'champ-icon'; const img = document.createElement('img'); const url = championIconUrl(name); if (url) { img.src = url; img.alt = name; }
  ic.appendChild(img); const t = document.createElement('span'); t.textContent = name; span.appendChild(ic); span.appendChild(t); return span;
}

function decorateChampionNames(root) {
  const names = Array.from(ChampionTags.byChampion.keys()); if (!names.length) return;
  names.sort((a,b)=> b.length - a.length);
  root.querySelectorAll('.list strong').forEach((el) => {
    if (el.dataset.iconsDecorated) return;
    let text = el.textContent;
    // Build tokens replacing champion names with markers
    names.forEach((n) => {
      const re = new RegExp(`(^|\\b)${n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\b)`, 'g');
      text = text.replace(re, (m) => `@@CHAMP:${n}@@`);
    });
    if (text.indexOf('@@CHAMP:') === -1) { el.dataset.iconsDecorated = '1'; return; }
    el.innerHTML = '';
    text.split(/(@@CHAMP:[^@]+@@)/g).forEach((part) => {
      const m = /^@@CHAMP:(.+)@@$/.exec(part);
      if (m) el.appendChild(createInlineChamp(m[1])); else el.appendChild(document.createTextNode(part));
    });
    el.dataset.iconsDecorated = '1';
  });
}

