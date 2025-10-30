const teamTagsEl = document.getElementById("team-tags");
const enemyTagsEl = document.getElementById("enemy-tags");
const teamScoreEl = document.getElementById("team-score");
const enemyScoreEl = document.getElementById("enemy-score");
const resetBtn = document.querySelector('[data-action="reset"]');
const synergyListEl = document.getElementById("synergy-list");
const comboListEl = document.getElementById("combo-list");
const selectedSynergyListEl = document.getElementById("selected-synergy-list");
const matchupListEl = document.getElementById("matchup-list");
const enemyComboListEl = document.getElementById("enemy-combo-list");
const laneFilterButtons = document.querySelectorAll("[data-lane-filter]");
const matchupFilterButtons = document.querySelectorAll("[data-matchup-filter]");

let activeSynergyLane = "ALL";
const matchupVisibility = {
  favorable: true,
  even: true,
  unfavorable: true,
};

// Runtime cache para os dados de campeoes/tags vindos do CSV
const ChampionTags = {
  rows: [], // cada item = { Champion, Gameplay1, Gameplay2, "Power Spike", "Synergy Focus" }
  byChampion: new Map(),
};

const ExternalStats = {
  synergies: new Map(),
  matchups: new Map(),
  combos: [],
  bans: new Map(),
  loaded: false,
  errors: {
    synergies: false,
    matchups: false,
    combos: false,
  },
  synergiesBySlug: new Map(),
  matchupsBySlug: new Map(),
};

const percentFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Formatter específico para ban rates com duas casas decimais
const banPercentFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROLE_LABELS = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Suporte",
};

const MATCHUP_LABELS = {
  favorable: "Favorável",
  even: "Equilibrado",
  unfavorable: "Desfavorável",
};

// Considerar como risco de ban quando a taxa for maior ou igual a este valor (em %)
const BAN_RISK_THRESHOLD = 60;

// Configuráveis: mínimo de jogos para considerar uma sinergia e máximo de itens mostrados
// - MIN_SYNERGY_GAMES: sinergias com número de jogos menor que este valor serão ignoradas
// - MAX_SYNERGIES: controla quantas recomendações aparecem no painel de sinergias
// Para aumentar ou diminuir o número de sinergias exibidas, altere `MAX_SYNERGIES` abaixo.
// MIN_SYNERGY_GAMES is mutable and can be updated at runtime by the UI control (#min-synergy-games).
let MIN_SYNERGY_GAMES = 20; // filtrar sinergias com amostra menor que este valor
const MAX_SYNERGIES = 12; // número padrão de sinergias exibidas (substitui o literal 6)
const MAX_MATCHUPS = MAX_SYNERGIES; // manter matchups alinhados à quantidade de sinergias

// Mapa de pesos entre pares de roles usado quando o usuário 'trava' por lane
const ROLE_WEIGHTS = {
  TOP:   { TOP: 1.0, JUNGLE: 1.30, MIDDLE: 1.20, BOTTOM: 1.00, UTILITY: 1.00 },
  JUNGLE:{ TOP: 1.30, JUNGLE: 1.0,  MIDDLE: 1.30, BOTTOM: 1.00, UTILITY: 1.30 },
  MIDDLE:{ TOP: 1.20, JUNGLE: 1.30, MIDDLE: 1.0,  BOTTOM: 1.10, UTILITY: 1.10 },
  BOTTOM:{ TOP: 1.00, JUNGLE: 1.00, MIDDLE: 1.10, BOTTOM: 1.0,  UTILITY: 1.30 },
  UTILITY:{ TOP: 1.00, JUNGLE: 1.30, MIDDLE: 1.10, BOTTOM: 1.30, UTILITY: 1.0  },
};

function normalizeRoleKey(role) {
  if (!role) return null;
  const r = String(role).trim().toUpperCase();
  // Accept common aliases
  if (r === 'MID') return 'MIDDLE';
  if (r === 'ADC') return 'BOTTOM';
  if (r === 'SUPPORT') return 'UTILITY';
  return r;
}

function getRoleWeight(aRole, bRole) {
  const a = normalizeRoleKey(aRole);
  const b = normalizeRoleKey(bRole);
  if (!a || !b) return 1.0;
  if (ROLE_WEIGHTS[a] && typeof ROLE_WEIGHTS[a][b] === 'number') return ROLE_WEIGHTS[a][b];
  return 1.0;
}

// --- UI binding: allow runtime control of MIN_SYNERGY_GAMES via header input
try {
  const stored = window.localStorage ? window.localStorage.getItem('minSynergyGames') : null;
  if (stored !== null && !Number.isNaN(Number(stored))) {
    MIN_SYNERGY_GAMES = Math.max(1, Math.floor(Number(stored)));
  }
  const el = document.getElementById('min-synergy-games');
  if (el) {
    // initialize input value
    el.value = String(MIN_SYNERGY_GAMES);
    el.addEventListener('change', (e) => {
      const v = Number(el.value);
      if (Number.isNaN(v) || v < 1) { el.value = String(MIN_SYNERGY_GAMES); return; }
      MIN_SYNERGY_GAMES = Math.max(1, Math.floor(v));
      try { if (window.localStorage) window.localStorage.setItem('minSynergyGames', String(MIN_SYNERGY_GAMES)); } catch (e) {}
      // refresh panels to apply new filter immediately
      try { updateInsightPanels(); } catch (e) {}
    });
  }
} catch (e) {
  // ignore in environments without DOM/localStorage
}

// Cria apenas o ícone (sem texto) para uso em recomendações agregadas
function createChampIconOnly(name) {
  // Render same structure as createInlineChamp but without the text label.
  const wrapper = document.createElement('span');
  wrapper.className = 'champ-inline';
  const ic = document.createElement('span');
  ic.className = 'champ-icon';
  const img = document.createElement('img');
  // sizing is managed in CSS (.champ-inline .champ-icon img -> 28×28)
  setChampionIcon(img, name);
  ic.appendChild(img);
  wrapper.appendChild(ic);
  return wrapper;
}

// Retorna estatísticas gerais do campeão (games e winRate) independentemente de roles/sinergias
function getChampionOverallStats(name) {
  if (!name) return { games: null, winRate: null };
  // Preferir payloads que armazenamos (synergy or matchup datasets)
  const payload = getSynergyPayload(name) || getMatchupPayload(name) || null;
  if (!payload) return { games: null, winRate: null };
  const games = safeNumber(payload.games_weighted ?? payload.games ?? payload.occurrences_weighted ?? payload.occurrences) ?? null;
  let win = safeNumber(payload.win_rate_weighted ?? payload.win_rate ?? payload.winrate ?? payload.win) ?? null;
  if (win !== null && win <= 1) win = win * 100;
  return { games, winRate: win };
}

// Retorna estatísticas do campeão para uma role específica (games e winRate em %)
function getChampionRoleStats(name, role) {
  if (!name || !role) return { games: null, winRate: null };
  const payload = getMatchupPayload(name) || getSynergyPayload(name) || null;
  if (!payload || !payload.roles) return { games: null, winRate: null };
  const r = payload.roles[role] || payload.roles[normalizeRoleKey(role)];
  if (!r) return { games: null, winRate: null };
  // alguns arquivos usam solo_stats ou fields diretos
  const solo = r.solo_stats || r.solo || r.stats || null;
  const games = safeNumber(solo?.games_weighted ?? solo?.games ?? r.games_weighted ?? r.games) ?? null;
  let win = safeNumber(solo?.win_rate_weighted ?? solo?.win_rate ?? r.win_rate_weighted ?? r.win_rate ?? payload.win_rate_weighted ?? payload.win_rate) ?? null;
  if (win !== null && win <= 1) win = win * 100;
  return { games, winRate: win };
}

const ChampionNameIndex = new Map();
const CHAMPION_NAME_OVERRIDES = new Map([
  ["monkeyking", "Wukong"],
  ["renata", "Renata Glasc"],
  ["nunu", "Nunu & Willump"],
  ["nunuwillump", "Nunu & Willump"],
  ["leesin", "Lee Sin"],
  ["masteryi", "Master Yi"],
  ["missfortune", "Miss Fortune"],
  ["twistedfate", "Twisted Fate"],
  ["tahmkench", "Tahm Kench"],
  ["xinzhao", "Xin Zhao"],
  ["aurelionsol", "Aurelion Sol"],
  ["kogmaw", "Kog'Maw"],
  ["reksai", "Rek'Sai"],
  ["jarvaniv", "Jarvan IV"],
  ["drmundo", "Dr. Mundo"],
  ["chogath", "Cho'Gath"],
  ["velkoz", "Vel'Koz"],
  ["khazix", "Kha'Zix"],
  ["kaisa", "Kai'Sa"],
  ["belveth", "Bel'Veth"],
  ["ksante", "K'Sante"],
  ["leblanc", "LeBlanc"],
]);

const FALLBACK_CHAMPION_LIST = [
  "Aatrox", "Ahri", "Akali", "Akshan", "Alistar", "Ambessa", "Amumu", "Anivia", "Annie", "Aphelios",
  "Ashe", "Aurelion Sol", "Aurora", "Azir", "Bard", "Bel'Veth", "Blitzcrank", "Brand", "Braum", "Briar",
  "Caitlyn", "Camille", "Cassiopeia", "Cho'Gath", "Corki", "Darius", "Diana", "Dr. Mundo", "Draven",
  "Ekko", "Elise", "Evelynn", "Ezreal", "Fiddlesticks", "Fiora", "Fizz", "Galio", "Gangplank", "Garen",
  "Gnar", "Gragas", "Graves", "Gwen", "Hecarim", "Heimerdinger", "Hwei", "Illaoi", "Irelia", "Ivern",
  "Janna", "Jarvan IV", "Jax", "Jayce", "Jhin", "Jinx", "K'Sante", "Kai'Sa", "Kalista", "Karma",
  "Karthus", "Kassadin", "Katarina", "Kayle", "Kayn", "Kennen", "Kha'Zix", "Kindred", "Kled", "Kog'Maw",
  "LeBlanc", "Lee Sin", "Leona", "Lillia", "Lissandra", "Lucian", "Lulu", "Lux", "Malphite", "Malzahar",
  "Maokai", "Master Yi", "Mel", "Milio", "Miss Fortune", "Mordekaiser", "Morgana", "Naafiri", "Nami",
  "Nasus", "Nautilus", "Neeko", "Nidalee", "Nilah", "Nocturne", "Nunu & Willump", "Olaf", "Orianna",
  "Ornn", "Pantheon", "Poppy", "Pyke", "Qiyana", "Quinn", "Rakan", "Rammus", "Rek'Sai", "Rell",
  "Renata Glasc", "Renekton", "Rengar", "Riven", "Rumble", "Ryze", "Samira", "Sejuani", "Senna",
  "Seraphine", "Sett", "Shaco", "Shen", "Shyvana", "Singed", "Sion", "Sivir", "Skarner", "Smolder",
  "Sona", "Soraka", "Swain", "Sylas", "Syndra", "Tahm Kench", "Taliyah", "Talon", "Taric", "Teemo",
  "Thresh", "Tristana", "Trundle", "Tryndamere", "Twisted Fate", "Twitch", "Udyr", "Urgot", "Varus",
  "Vayne", "Veigar", "Vel'Koz", "Vex", "Vi", "Viego", "Viktor", "Vladimir", "Volibear", "Warwick",
  "Wukong", "Xayah", "Xerath", "Xin Zhao", "Yasuo", "Yone", "Yorick", "Yunara", "Yuumi", "Zac", "Zed",
  "Zeri", "Ziggs", "Zilean", "Zoe", "Zyra"
];

function registerChampionAliases(name) {
  if (!name) return;
  const canonical = String(name).trim();
  if (!canonical) return;
  const lower = canonical.toLowerCase();
  const normalized = lower.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
  const collapsed = normalized.replace(/[^a-z0-9]/g, '');
  const slug = championIdForIcon(canonical);

  const register = (key) => {
    if (!key) return;
    const k = key.toLowerCase();
    if (!ChampionNameIndex.has(k)) {
      ChampionNameIndex.set(k, canonical);
    }
  };

  register(lower);
  register(normalized);
  register(collapsed);
  register(slug);
}

// Função para resolver nomes de campeões dos dados (slug -> nome de exibição)
function resolveChampionName(name) {
  if (!name) return "";
  const trimmed = String(name).trim();
  if (!trimmed) return "";

  const slug = championIdForIcon(trimmed);
  if (slug) {
    const fromSlug = ChampionNameIndex.get(slug.toLowerCase());
    if (fromSlug) return fromSlug;
  }

  const lower = trimmed.toLowerCase();
  const override = CHAMPION_NAME_OVERRIDES.get(lower);
  if (override) return override;

  const direct = ChampionNameIndex.get(lower);
  if (direct) return direct;

  const normalized = lower.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
  const fromNormalized = ChampionNameIndex.get(normalized);
  if (fromNormalized) return fromNormalized;

  const collapsed = normalized.replace(/[^a-z0-9]/g, '');
  const fromCollapsed = ChampionNameIndex.get(collapsed);
  if (fromCollapsed) return fromCollapsed;

  const spaced = trimmed
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (spaced && spaced.toLowerCase() !== lower) {
    const fromSpaced = ChampionNameIndex.get(spaced.toLowerCase());
    if (fromSpaced) return fromSpaced;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function championDataKey(name) {
  if (!name) return "";
  const slug = championIdForIcon(name);
  if (slug) return slug;
  const trimmed = String(name).trim();
  if (!trimmed) return "";
  return trimmed
    .normalize('NFD').replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-zA-Z0-9]/g, "");
}

laneFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const lane = button.dataset.laneFilter || "ALL";
    if (lane === activeSynergyLane) return;
    activeSynergyLane = lane;
    laneFilterButtons.forEach((btn) => btn.classList.toggle("is-active", btn === button));
    updateInsightPanels();
  });
});

matchupFilterButtons.forEach((button) => {
  const key = button.dataset.matchupFilter;
  if (!key) return;
  matchupVisibility[key] = button.classList.contains("is-active");
  button.addEventListener("click", () => {
    const currentState = matchupVisibility[key];
    if (currentState && Object.values(matchupVisibility).filter(Boolean).length === 1) {
      return;
    }
    const nextState = !currentState;
    matchupVisibility[key] = nextState;
    button.classList.toggle("is-active", nextState);
    updateInsightPanels();
  });
});

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

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Current visible delta range (used to map colors). Default is -10..+10.
let CURRENT_DELTA_MIN = -10;
let CURRENT_DELTA_MAX = 10;

// Fixed visual mapping for delta color track (absolute mapping for the bar)
// User-requested constants: min = -10, mid = 15, max = 40
const DELTA_COLOR_MIN = -10;
const DELTA_COLOR_MID = 15;
const DELTA_COLOR_MAX = 40;

function setCurrentDeltaRange(min, max) {
  if (typeof min !== 'number' || !Number.isFinite(min) || typeof max !== 'number' || !Number.isFinite(max)) return;
  if (min === max) { min = min - 1; max = max + 1; }
  CURRENT_DELTA_MIN = min; CURRENT_DELTA_MAX = max;
}

function valueToT(v, min, max) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0.5;
  if (min === max) return 0.5;
  return clamp((v - min) / (max - min), 0, 1);
}

function valueToHue(v, min, max) {
  // maps t (0..1) -> hue 0..120 (red..green)
  const t = valueToT(v, min, max);
  return Math.round(t * 120);
}

// Color interpolation helpers (three-stop: left=#ff0000, mid=#b0b000, right=#00ff00)
function hexToRgb(hex) {
  if (!hex) return null;
  const h = String(hex).replace('#', '').trim();
  if (h.length === 3) {
    return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
  }
  if (h.length === 6 || h.length === 8) {
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  return null;
}

function rgbToHex(r,g,b) {
  const toHex = (n) => (`0${Math.max(0,Math.min(255,Math.round(n))).toString(16)}`).slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function mixHexColors(hexA, hexB, t) {
  const a = hexToRgb(hexA) || [0,0,0];
  const b = hexToRgb(hexB) || [0,0,0];
  return rgbToHex(
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t)
  );
}

function hexToRgba(hex, a) {
  const rgb = hexToRgb(hex) || [0, 0, 0];
  const alpha = typeof a === 'number' ? a : (typeof a === 'string' ? parseFloat(a) : NaN);
  const finalA = Number.isFinite(alpha) ? alpha : 1;
  return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${finalA})`;
}

function valueToColor(v, min, max) {
  // map v between min..max into t 0..1
  const t = valueToT(v, min, max);
  // three stops: left(0)=#ff0000, mid(0.5)=#b0b000, right(1)=#00ff00
  const left = '#ff0000';
  const mid = '#b0b000';
  const right = '#00ff00';
  if (t <= 0.5) {
    const localT = t / 0.5; // 0..1 between left and mid
    return mixHexColors(left, mid, localT);
  }
  const localT = (t - 0.5) / 0.5; // 0..1 between mid and right
  return mixHexColors(mid, right, localT);
}

// Range where the score should feel neutral/ok.
const SCORE_COLOR_MIN = 30;
const SCORE_COLOR_MAX = 60;

function scoreValueToColor(score) {
  const safeScore = typeof score === 'number' && Number.isFinite(score) ? score : 50;
  return valueToColor(safeScore, SCORE_COLOR_MIN, SCORE_COLOR_MAX);
}

function applyScoreColor(el, score) {
  if (!el) return;
  // score expected 0..100 -> map to green/red
  const color = scoreValueToColor(score);
  el.style.color = color;
}

// --- Score tooltip helpers ---
let __scoreTooltipEl = null;
function ensureScoreTooltip() {
  if (__scoreTooltipEl) return __scoreTooltipEl;
  const div = document.createElement('div');
  div.id = 'score-tooltip';
  div.style.display = 'none';
  div.setAttribute('role', 'tooltip');
  document.body.appendChild(div);
  __scoreTooltipEl = div;
  // hide on scroll/resize to avoid stale position
  window.addEventListener('scroll', () => { if (__scoreTooltipEl) __scoreTooltipEl.style.display = 'none'; }, { passive: true });
  window.addEventListener('resize', () => { if (__scoreTooltipEl) __scoreTooltipEl.style.display = 'none'; });
  return __scoreTooltipEl;
}

function formatComponentsTooltip(components) {
  if (!components) return '';
  // Show value × weight -> contribution (points), plus a small visual bar per contribution
  const WEIGHTS = { solo: 0.3, synergy: 0.3, matchup: 0.3, early: 0.1 };
  const rows = [];
  const mapLabel = { solo: 'Solo winrate', synergy: 'Sinergia', matchup: 'Matchup', early: 'Early' };
  let totalContrib = 0;
  ['solo', 'synergy', 'matchup', 'early'].forEach((k) => {
    const rawValue = (typeof components[k] === 'number' && Number.isFinite(components[k])) ? components[k] : 50;
    const weight = WEIGHTS[k] || 0;
    const contribRaw = rawValue * weight;
    totalContrib += contribRaw;
    rows.push({
      key: k,
      label: mapLabel[k],
      value: Math.round(rawValue),
      rawValue,
      weight,
      weightPct: Math.round(weight * 100),
      contrib: Math.round(contribRaw * 10) / 10,
      contribRaw
    });
  });
  const totalScore = (typeof components.total === 'number' && Number.isFinite(components.total)) ? components.total : null;
  const totalForBars = (totalScore && Math.abs(totalScore) > 0)
    ? Math.abs(totalScore)
    : (Math.abs(totalContrib) > 0 ? Math.abs(totalContrib) : 100);

  const html = [];
  html.push('<div class="score-breakdown">');
  rows.forEach((r) => {
    // map contribution magnitude for width; color follows the raw component score
    const magnitude = typeof r.contribRaw === 'number' ? Math.max(Math.abs(r.contribRaw), 0) : 0;
    const baseScore = typeof r.rawValue === 'number' ? clamp(r.rawValue, 0, 100) : 50;
    const col = scoreValueToColor(baseScore);
    // Use a solid color fill (no gradient) for the bar-inner
    const pct = totalForBars > 0 ? clamp(Math.round((magnitude / totalForBars) * 100), 0, 100) : 0;
    const scoreDetail = `${percentFormatter.format(r.rawValue)}%`;
    const weightDetail = `${percentFormatter.format(r.weight * 100)}%`;
    const weightDecimal = decimalFormatter.format(r.weight);
    const contribDetail = decimalFormatter.format(r.contribRaw);
    html.push(
      `<div class="score-line"><div class="score-meta"><span class="label">${r.label}</span><span class="value">${r.value}%</span></div><div class="score-meta small">Valor ${scoreDetail} × Peso ${weightDetail} (${weightDecimal}) = ${contribDetail} pts</div><div class="bar"><div class="bar-inner" style="width:${pct}%;background:${col};"></div></div></div>`
    );
  });
  const totalDisplay = decimalFormatter.format(totalScore ?? 0);
  const roundedTotal = Math.round((totalScore ?? 0));
  const contribSum = decimalFormatter.format(totalContrib);
  html.push(`<div class="line" style="margin-top:0.5rem;font-weight:700;">Total calculado: ${totalDisplay} pts (arredondado ${roundedTotal})</div>`);
  html.push(`<div class="line small muted">Soma contribuições: ${contribSum} pts</div>`);
  html.push('</div>');
  return html.join('');
}

function formatAggregateTooltip(details) {
  if (!details) return '';
  const rows = Array.isArray(details.contributions) ? details.contributions : [];
  const html = [];
  html.push('<div class="score-breakdown">');
  // color the aggregate delta value relative to the current visible delta range
  const aggVal = typeof details.aggDelta === 'number' ? details.aggDelta : (details.debug && typeof details.debug.simpleAvg === 'number' ? details.debug.simpleAvg : 0);
  const aggColor = valueToColor(aggVal, CURRENT_DELTA_MIN, CURRENT_DELTA_MAX);
  html.push(`<div class="line" style="margin-bottom:0.5rem;font-weight:700;">Cálculo agregado — Δ <span style="color:${aggColor}">${formatSigned(details.aggDelta)}</span></div>`);
  rows.forEach((c) => {
    const label = `${c.source || ''} ${ROLE_LABELS[normalizeRoleKey(c.allyRole)] || c.allyRole || ''}→${ROLE_LABELS[normalizeRoleKey(c.partnerRole)] || c.partnerRole || ''}`;
    const contrib = typeof c.contribution === 'number' ? Math.round(c.contribution * 10) / 10 : 0;
    const games = c.games || 0;
    const win = typeof c.winRate === 'number' ? (c.winRate <= 1 ? c.winRate * 100 : c.winRate) : null;
    html.push('<div class="score-line">');
    html.push(`<div class="score-meta"><span class="label">${label}</span><span class="value">Δ ${formatSigned(c.delta)}</span></div>`);
    html.push(`<div class="score-meta small">${formatGames(games) || (games+' jogos')} · peso×games ${(c.weight || 1).toFixed(2)} · contrib ${formatSigned(contrib)}</div>`);
  // Render a simple solid-color bar proportional to the delta magnitude.
  // No gradients: color is mapped from delta -> solid hex via valueToColor.
  const delta = typeof c.delta === 'number' ? c.delta : 0;
  const maxAbs = Math.max(Math.abs(CURRENT_DELTA_MIN), Math.abs(CURRENT_DELTA_MAX)) || 1;
  const pct = clamp(Math.round((Math.abs(delta) / maxAbs) * 100), 0, 100);
  const color = valueToColor(delta, CURRENT_DELTA_MIN, CURRENT_DELTA_MAX);
  const barClasses = ['bar-inner', delta < 0 ? 'is-negative' : 'is-positive'].join(' ');
  html.push(`<div class="bar"><div class="${barClasses}" style="width:${pct}%;background:${color};"></div></div>`);
    html.push('</div>');
  });
  html.push(`<div class="line" style="margin-top:0.5rem;font-weight:700;">Total jogos: ${details.totalGames || 0}</div>`);
  // Always show the weighted numerator/denominator calculation when available
  const wNum = details.weightedDeltaTimesGames ?? details.debug?._weightedNumerator ?? 0;
  const wDen = details.weightTimesGames ?? details.debug?._weightedDenominator ?? 0;
  const agg = details.aggDelta ?? (wDen ? (wNum / wDen) : null);
  html.push(`<div class="line small muted" style="margin-top:0.25rem;">Cálculo: (Σ Δ×games×peso) / (Σ games×peso) = ${Number(wNum).toFixed(2)} / ${Number(wDen).toFixed(2)} = ${agg !== null ? (Number(agg).toFixed(2)) : '--'}</div>`);
  if (details.debug && typeof details.debug.simpleAvg === 'number') {
    html.push(`<div class="line small muted">Média simples (Σ Δ / n): ${Number(details.debug.simpleAvg).toFixed(2)} (${details.debug.simpleCount} entradas)</div>`);
  }
  html.push('</div>');
  return html.join('');
}

function showScoreTooltip(el, components) {
  const tip = ensureScoreTooltip();
  tip.innerHTML = formatComponentsTooltip(components);
  tip.style.display = 'block';
  tip.style.opacity = '1';
  // position centered below element
  const rect = el.getBoundingClientRect();
  // allow paint then measure
  requestAnimationFrame(() => {
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = window.scrollX + rect.left + rect.width / 2 - tw / 2;
    const minPad = 8;
    if (left < minPad) left = minPad;
    if (left + tw > window.scrollX + document.documentElement.clientWidth - minPad) left = window.scrollX + document.documentElement.clientWidth - tw - minPad;
    // Prefer mostrar o tooltip acima do elemento; se não couber, mostrar abaixo
    let topAbove = window.scrollY + rect.top - th - 8;
    let topBelow = window.scrollY + rect.bottom + 8;
    let top = topAbove;
    const viewportTop = window.scrollY + minPad;
    const viewportBottom = window.scrollY + document.documentElement.clientHeight - minPad;
    if (topAbove < viewportTop) {
      // não cabe acima, usar abaixo
      top = topBelow;
      // se abaixo também ultrapassar, ajustar para caber dentro da viewport
      if (top + th > viewportBottom) top = Math.max(viewportTop, viewportBottom - th);
    }
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  });
}

function hideScoreTooltip() {
  const tip = ensureScoreTooltip();
  tip.style.display = 'none';
}

function getScoreComponents(side) {
  const teamEntries = getSidePickEntries('team');
  const enemyEntries = getSidePickEntries('enemy');
  const soloTeam = computeSoloWinrateComponent(teamEntries);
  const soloEnemy = computeSoloWinrateComponent(enemyEntries);
  const synergyTeam = computeSynergyComponent(teamEntries);
  const synergyEnemy = computeSynergyComponent(enemyEntries);
  const matchup = computeMatchupComponent(teamEntries, enemyEntries);
  const early = computeEarlyComponentFromRows(matchup.rows);
  const WEIGHTS = { solo: 0.3, synergy: 0.3, matchup: 0.3, early: 0.1 };
  const teamTotal = clamp(Math.round(soloTeam * WEIGHTS.solo + synergyTeam * WEIGHTS.synergy + matchup.team * WEIGHTS.matchup + early.team * WEIGHTS.early), 0, 100);
  const enemyTotal = clamp(Math.round(soloEnemy * WEIGHTS.solo + synergyEnemy * WEIGHTS.synergy + matchup.enemy * WEIGHTS.matchup + early.enemy * WEIGHTS.early), 0, 100);
  if (side === 'team') return { solo: soloTeam, synergy: synergyTeam, matchup: matchup.team, early: early.team, total: teamTotal };
  return { solo: soloEnemy, synergy: synergyEnemy, matchup: matchup.enemy, early: early.enemy, total: enemyTotal };
}

function bindScoreTooltipListeners() {
  if (teamScoreEl && !teamScoreEl.dataset.tooltipBound) {
    teamScoreEl.addEventListener('mouseenter', () => {
      const comps = getScoreComponents('team');
      showScoreTooltip(teamScoreEl, comps);
    });
    teamScoreEl.addEventListener('mouseleave', hideScoreTooltip);
    teamScoreEl.dataset.tooltipBound = '1';
  }
  if (enemyScoreEl && !enemyScoreEl.dataset.tooltipBound) {
    enemyScoreEl.addEventListener('mouseenter', () => {
      const comps = getScoreComponents('enemy');
      showScoreTooltip(enemyScoreEl, comps);
    });
    enemyScoreEl.addEventListener('mouseleave', hideScoreTooltip);
    enemyScoreEl.dataset.tooltipBound = '1';
  }
}

// bind tooltip listeners once
try { bindScoreTooltipListeners(); } catch (e) { console.warn('[tooltip] bind failed', e); }

// --- Floating tooltip for label[data-tooltip] (appended to document.body)
let __floatingTooltipEl = null;
function ensureFloatingTooltip() {
  if (__floatingTooltipEl) return __floatingTooltipEl;
  const d = document.createElement('div');
  d.className = 'floating-tooltip';
  d.style.display = 'none';
  d.setAttribute('role', 'tooltip');
  const arrow = document.createElement('div'); arrow.className = 'arrow';
  const content = document.createElement('div'); content.className = 'content';
  d.appendChild(arrow);
  d.appendChild(content);
  document.body.appendChild(d);
  __floatingTooltipEl = d;
  // hide on scroll/resize to avoid stale position
  window.addEventListener('scroll', () => { if (__floatingTooltipEl) __floatingTooltipEl.style.display = 'none'; }, { passive: true });
  window.addEventListener('resize', () => { if (__floatingTooltipEl) __floatingTooltipEl.style.display = 'none'; });
  return __floatingTooltipEl;
}

function showFloatingTooltipForLabel(labelEl) {
  if (!labelEl || !labelEl.dataset) return;
  const text = labelEl.dataset.tooltip;
  if (!text) return;
  const tip = ensureFloatingTooltip();
  tip.querySelector('.content').textContent = text;
  tip.style.display = 'block';
  tip.classList.remove('above');
  // Position after paint to ensure measurements are correct
  requestAnimationFrame(() => {
    const rect = labelEl.getBoundingClientRect();
    const tw = tip.offsetWidth; const th = tip.offsetHeight;
    const minPad = 8;
    // calculate left centered on label, then clamp to viewport
    let left = window.scrollX + rect.left + rect.width / 2 - tw / 2;
    const vwLeft = window.scrollX + minPad;
    const vwRight = window.scrollX + document.documentElement.clientWidth - minPad;
    left = clamp(left, vwLeft, Math.max(vwLeft, vwRight - tw));
    // prefer below; if doesn't fit, place above
    let top = window.scrollY + rect.bottom + 8;
    const viewportBottom = window.scrollY + document.documentElement.clientHeight - minPad;
    if (top + th > viewportBottom) {
      top = window.scrollY + rect.top - th - 8;
      tip.classList.add('above');
    }
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    // position arrow centered relative to label but inside tooltip
    const arrow = tip.querySelector('.arrow');
    if (arrow) {
      const desired = Math.round(rect.left + rect.width / 2 - left);
      const arrowClamp = clamp(desired, 8, Math.max(8, tw - 8));
      arrow.style.left = `${arrowClamp}px`;
    }
  });
  document.body.classList.add('floating-tooltip-enabled');
}

function hideFloatingTooltip() { if (__floatingTooltipEl) __floatingTooltipEl.style.display = 'none'; }

function bindFloatingTooltips() {
  const labels = document.querySelectorAll('label[data-tooltip]');
  if (!labels || !labels.length) return;
  labels.forEach((label) => {
    label.addEventListener('mouseenter', () => showFloatingTooltipForLabel(label));
    label.addEventListener('mouseleave', hideFloatingTooltip);
    label.addEventListener('focusin', () => showFloatingTooltipForLabel(label));
    label.addEventListener('focusout', hideFloatingTooltip);
  });
}

try { bindFloatingTooltips(); } catch (e) { console.warn('[floating-tooltip] init failed', e); }

function computeSynergyComponent(entries) {
  const picks = entries.filter((e) => e && e.champion && e.role);
  if (picks.length < 2) return 50; // neutro
  let weightedDelta = 0;
  let weightSum = 0;
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const a = picks[i]; const b = picks[j];
      const pair = getPairSynergy(a.champion, a.role, b.champion, b.role);
      if (!pair) continue;
      const delta = clamp(safeNumber(pair.delta) ?? 0, -10, 10);
      const games = safeNumber(pair.games) ?? 1;
      const allyRole = pair.allyRole || a.role;
      const partnerRole = pair.partnerRole || b.role;
      const roleWeight = getRoleWeight(allyRole, partnerRole) || 1.0;
      const pairWeight = Math.max(games * roleWeight, 0);
      if (pairWeight <= 0) continue;
      weightedDelta += delta * pairWeight;
      weightSum += pairWeight;
    }
  }
  if (weightSum === 0) return 50;
  const avgDelta = weightedDelta / weightSum; // -10..+10 esperado
  const score = 50 + avgDelta * 5; // -10->0, 0->50, +10->100
  return clamp(Math.round(score), 0, 100);
}

function computeSoloWinrateComponent(entries) {
  const picks = entries.filter((e) => e && e.champion && e.role);
  if (!picks.length) return 50;
  let num = 0, den = 0;
  for (const p of picks) {
    const payload = getMatchupPayload(p.champion) || getSynergyPayload(p.champion);
    let roleData = null;
    if (payload && payload.roles && p.role && payload.roles[p.role]) roleData = payload.roles[p.role];
    const soloStats = roleData?.solo_stats;
    let win = null;
    let games = null;
    if (soloStats) {
      win = safeNumber(soloStats.win_rate);
      games = safeNumber(soloStats.games);
    }
    if (win === null) {
      // fallback to previous fields (non-weighted preferred)
      win = safeNumber(roleData?.win_rate ?? payload?.win_rate);
      games = games ?? safeNumber(roleData?.games ?? payload?.games);
    }
    if (win === null) {
      // last resort: allow weighted stats
      win = safeNumber(roleData?.win_rate_weighted ?? payload?.win_rate_weighted);
      games = games ?? safeNumber(roleData?.games_weighted ?? payload?.games_weighted);
    }
    const effectiveGames = Math.max(games ?? 1, 1);
    if (win === null) {
      num += 50 * effectiveGames;
      den += effectiveGames;
      continue;
    }
    const winPct = win <= 1 ? win * 100 : win;
    num += clamp(winPct, 0, 100) * effectiveGames;
    den += effectiveGames;
  }
  if (den === 0) return 50;
  return clamp(Math.round(num / den), 0, 100);
}

function buildMatchupRowsForScore(teamEntries, enemyEntries) {
  // Essencialmente uma versão de updateMatchupInsights sem filtros/limit, retornando linhas únicas ally vs enemy
  const teamPicks = teamEntries.map((e) => e.champion);
  const enemyPicks = enemyEntries.map((e) => e.champion);
  if (!teamPicks.length || !enemyPicks.length) return [];

  const buildRoleMap = (entries) => {
    const map = new Map();
    entries.forEach(({ champion, role }) => {
      if (!role) return;
      const raw = String(champion || "").trim();
      if (!raw) return;
      const resolved = resolveChampionName(raw);
      const keys = [raw, resolved].filter(Boolean);
      keys.forEach((key) => map.set(key.toLowerCase(), role));
    });
    return map;
  };
  const teamRoleMap = buildRoleMap(teamEntries);
  const enemyRoleMap = buildRoleMap(enemyEntries);

  const rows = [];
  teamPicks.forEach((ally) => {
    const allyDisplay = resolveChampionName(ally);
    const allyKey = (allyDisplay || ally || "").toLowerCase();
    const info = getMatchupPayload(ally);
    if (!info || !info.roles) return;
    Object.entries(info.roles).forEach(([allyRoleKey, roleData]) => {
      const matchups = roleData.matchups || {};
      Object.entries(matchups).forEach(([opponentRole, opponents]) => {
        enemyPicks.forEach((enemy) => {
          const enemyDisplay = resolveChampionName(enemy);
          const enemyKey = (enemyDisplay || enemy || "").toLowerCase();
          const stats = resolveOpponentStats(opponents, enemy);
          if (!stats) return;
          const delta = safeNumber(stats.matchup_delta);
          const winRate = safeNumber(stats.counter_win_rate_weighted ?? stats.counter_win_rate);
          const earlyWin = safeNumber(
            stats.early_win_rate_weighted ?? stats.early_win_rate ?? (stats.early && (stats.early.win_rate_weighted ?? stats.early.win_rate))
          );
          const games = safeNumber(stats.games_weighted ?? stats.games);
          if (delta === null && winRate === null) return;
          const allyRoleResolved = stats.self_role || allyRoleKey || null;
          const enemyRoleResolved = stats.opponent_role || opponentRole || null;
          const allySelectionRole = teamRoleMap.get(allyKey);
          const enemySelectionRole = enemyRoleMap.get(enemyKey);
          const matchesSelection =
            (!allySelectionRole || !allyRoleResolved || allySelectionRole === allyRoleResolved) &&
            (!enemySelectionRole || !enemyRoleResolved || enemySelectionRole === enemyRoleResolved);
          const absDelta = Math.abs(delta ?? 0);
          rows.push({ ally: allyDisplay || ally, allyRole: allyRoleResolved || null, enemy: enemyDisplay || enemy, enemyRole: enemyRoleResolved || null, delta: delta ?? 0, winRate, earlyWin, games, absDelta, matchesSelection });
        });
      });
    });
  });

  // Dedup similar ao usado na UI: escolher a melhor linha por par ally::enemy
  const deduped = new Map();
  rows.forEach((row) => {
    const key = `${row.ally}::${row.enemy}`;
    const existing = deduped.get(key);
    if (!existing) { deduped.set(key, row); return; }
    const existingScore = { matchesSelection: existing.matchesSelection ? 1 : 0, absDelta: existing.absDelta ?? Math.abs(existing.delta ?? 0), games: existing.games ?? 0 };
    const candidateScore = { matchesSelection: row.matchesSelection ? 1 : 0, absDelta: row.absDelta ?? Math.abs(row.delta ?? 0), games: row.games ?? 0 };
    const isBetter = candidateScore.matchesSelection > existingScore.matchesSelection || (candidateScore.matchesSelection === existingScore.matchesSelection && (candidateScore.absDelta > existingScore.absDelta || (candidateScore.absDelta === existingScore.absDelta && candidateScore.games > existingScore.games)));
    if (isBetter) deduped.set(key, row);
  });
  // Trava o conjunto para apenas as matchups que respeitam as lanes selecionadas
  return Array.from(deduped.values()).filter((row) => row.matchesSelection);
}

function computeMatchupComponent(teamEntries, enemyEntries) {
  const rows = buildMatchupRowsForScore(teamEntries, enemyEntries);
  if (!rows.length) return { team: 50, enemy: 50, rows: [] };
  let wFav = 0, wUnf = 0;
  let denom = 0;
  rows.forEach((r) => {
    const w = safeNumber(r.games) ?? 1;
    if (r.delta > 2) { wFav += w; denom += w; }
    else if (r.delta < -2) { wUnf += w; denom += w; }
  });
  if (denom === 0) return { team: 50, enemy: 50, rows };
  const balance = (wFav - wUnf) / denom; // -1..+1
  const teamScore = clamp(Math.round(50 + balance * 50), 0, 100);
  const enemyScore = 100 - teamScore;
  return { team: teamScore, enemy: enemyScore, rows };
}

function computeEarlyComponentFromRows(rows) {
  if (!rows || !rows.length) return { team: 50, enemy: 50 };
  let num = 0, den = 0;
  rows.forEach((r) => {
    if (typeof r.earlyWin !== 'number') return;
    const w = safeNumber(r.games) ?? 1;
    const adv = clamp(r.earlyWin - 50, -20, 20); // limitar a +-20 p.p.
    num += adv * w; den += w;
  });
  if (den === 0) return { team: 50, enemy: 50 };
  const avgAdv = num / den; // -20..+20
  const teamScore = clamp(Math.round(50 + (avgAdv / 20) * 50), 0, 100);
  const enemyScore = 100 - teamScore;
  return { team: teamScore, enemy: enemyScore };
}

function updateScores(teamTagsIgnored, enemyTagsIgnored) {
  // Calcula 0..100 com base em: sinergia dos escolhidos, saldo de matchups (ponderado), e early game
  const teamEntries = getSidePickEntries('team');
  const enemyEntries = getSidePickEntries('enemy');
  const synergyTeam = computeSynergyComponent(teamEntries);
  const synergyEnemy = computeSynergyComponent(enemyEntries);
  const soloTeam = computeSoloWinrateComponent(teamEntries);
  const soloEnemy = computeSoloWinrateComponent(enemyEntries);
  const matchup = computeMatchupComponent(teamEntries, enemyEntries);
  const early = computeEarlyComponentFromRows(matchup.rows);
  // New weights requested: 0.3 solo winrate, 0.3 synergy, 0.3 matchup, 0.1 early
  const WEIGHTS = { solo: 0.3, synergy: 0.3, matchup: 0.3, early: 0.1 };
  const teamScore = clamp(Math.round(
    soloTeam * WEIGHTS.solo + synergyTeam * WEIGHTS.synergy + matchup.team * WEIGHTS.matchup + early.team * WEIGHTS.early
  ), 0, 100);
  const enemyScore = clamp(Math.round(
    soloEnemy * WEIGHTS.solo + synergyEnemy * WEIGHTS.synergy + matchup.enemy * WEIGHTS.matchup + early.enemy * WEIGHTS.early
  ), 0, 100);
  teamScoreEl.textContent = String(teamScore);
  enemyScoreEl.textContent = String(enemyScore);
  applyScoreColor(teamScoreEl, teamScore);
  applyScoreColor(enemyScoreEl, enemyScore);

}


function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatPercent(value) {
  const num = safeNumber(value);
  return num === null ? null : `${percentFormatter.format(num)}%`;
}

function formatGames(value) {
  const num = safeNumber(value);
  return num === null ? null : `${integerFormatter.format(Math.round(num))} jogos`;
}

function formatSigned(value) {
  const num = safeNumber(value);
  if (num === null) return null;
  const formatted = percentFormatter.format(Math.abs(num));
  return `${num >= 0 ? "+" : "-"}${formatted}`;
}

function getDeltaPillClass(delta) {
  if (!Number.isFinite(delta)) return "pill pill-gray";
  if (delta < 0) return "pill pill-red";
  if (delta >= 5) return "pill pill-green";
  if (delta >= 2) return "pill pill-orange";
  if (delta > 0) return "pill pill-blue";
  return "pill pill-gray";
}

function renderListEmptyState(listEl, message) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const li = document.createElement("li");
  li.className = "empty muted";
  li.textContent = message;
  listEl.appendChild(li);
}

function updateInsightPanels() {
  const teamEntries = getSidePickEntries("team");
  const enemyEntries = getSidePickEntries("enemy");
  const teamPicks = teamEntries.map((entry) => entry.champion);
  const enemyPicks = enemyEntries.map((entry) => entry.champion);
  updateSynergyRecommendations(teamEntries);
  updateComboHighlights(teamPicks, enemyPicks);
  updateSelectedSynergyForTeam(teamEntries);
  updateMatchupInsights(teamEntries, enemyEntries);
  updateComboHighlights(teamPicks, enemyPicks, enemyComboListEl, { scope: "enemy" });
}

// Retorna o payload de sinergia entre dois campeões considerando as roles selecionadas
function getPairSynergy(allyName, allyRole, partnerName, partnerRole) {
  if (!allyName || !partnerName || !allyRole || !partnerRole) return null;
  // Primeiro, tenta a direção ally -> partner
  const infoA = getSynergyPayload(allyName);
  let best = null;
  if (infoA && infoA.roles && infoA.roles[allyRole]) {
    const srs = infoA.roles[allyRole].sinergias || {};
    const bucket = srs[partnerRole] || {};
    const stats = resolveOpponentStats(bucket, partnerName);
    if (stats && (stats.self_role ? stats.self_role === allyRole : true) && (stats.ally_role ? stats.ally_role === partnerRole : true)) {
      const delta = safeNumber(stats.synergy_delta);
      const wr = safeNumber(stats.duo_win_rate_weighted ?? stats.duo_win_rate);
      const games = safeNumber(stats.games_weighted ?? stats.games);
      if (delta !== null || wr !== null) {
        best = { source: resolveChampionName(allyName) || allyName, partner: resolveChampionName(partnerName) || partnerName, allyRole, partnerRole, delta: delta ?? 0, winRate: wr, games };
      }
    }
  }
  // Se não encontrou, tenta a direção oposta partner -> ally
  const infoB = getSynergyPayload(partnerName);
  if (infoB && infoB.roles && infoB.roles[partnerRole]) {
    const srs = infoB.roles[partnerRole].sinergias || {};
    const bucket = srs[allyRole] || {};
    const stats = resolveOpponentStats(bucket, allyName);
    if (stats && (stats.self_role ? stats.self_role === partnerRole : true) && (stats.ally_role ? stats.ally_role === allyRole : true)) {
      const delta = safeNumber(stats.synergy_delta);
      const wr = safeNumber(stats.duo_win_rate_weighted ?? stats.duo_win_rate);
      const games = safeNumber(stats.games_weighted ?? stats.games);
      const candidate = { source: resolveChampionName(allyName) || allyName, partner: resolveChampionName(partnerName) || partnerName, allyRole, partnerRole, delta: delta ?? 0, winRate: wr, games };
      if (!best) best = candidate; else {
        // preferir maior número de jogos; em empate, maior |delta|
        const bg = safeNumber(best.games) ?? 0; const cg = safeNumber(candidate.games) ?? 0;
        if (cg > bg || (cg === bg && Math.abs(candidate.delta ?? 0) > Math.abs(best.delta ?? 0))) best = candidate;
      }
    }
  }
  return best;
}

function updateSelectedSynergyForTeam(teamEntries) {
  if (!selectedSynergyListEl) return;
  if (!ExternalStats.loaded) { renderListEmptyState(selectedSynergyListEl, "Carregando sinergias dos escolhidos..."); return; }
  const picks = teamEntries.filter((e) => e && e.champion && e.role);
  if (picks.length < 2) { renderListEmptyState(selectedSynergyListEl, "Selecione ao menos dois campeões para ver a sinergia entre eles."); return; }
  const rows = [];
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const a = picks[i]; const b = picks[j];
      const rec = getPairSynergy(a.champion, a.role, b.champion, b.role);
      if (rec) rows.push(rec);
    }
  }
  if (!rows.length) { renderListEmptyState(selectedSynergyListEl, "Sem dados de sinergia relevantes entre os escolhidos."); return; }
  rows.sort((x, y) => {
    if ((y.delta ?? 0) !== (x.delta ?? 0)) return (y.delta ?? 0) - (x.delta ?? 0);
    return (y.games ?? 0) - (x.games ?? 0);
  });
  selectedSynergyListEl.innerHTML = "";
  rows.forEach((entry) => selectedSynergyListEl.appendChild(renderSynergyItem(entry)));
}

function getSynergyPayload(championName) {
  if (!championName) return null;
  const slug = championDataKey(championName);
  if (slug && ExternalStats.synergies.has(slug)) {
    return ExternalStats.synergies.get(slug);
  }
  const lookupKeys = [];
  if (slug) lookupKeys.push(slug.toLowerCase());
  const resolved = resolveChampionName(championName);
  if (resolved) {
    if (ExternalStats.synergies.has(resolved)) return ExternalStats.synergies.get(resolved);
    lookupKeys.push(resolved.toLowerCase());
  }
  if (typeof championName === "string") {
    lookupKeys.push(championName.toLowerCase());
  }
  for (const key of lookupKeys) {
    if (!key) continue;
    const payload = ExternalStats.synergiesBySlug.get(key);
    if (payload) return payload;
  }
  return null;
}

function getMatchupPayload(championName) {
  if (!championName) return null;
  const slug = championDataKey(championName);
  if (slug && ExternalStats.matchups.has(slug)) {
    return ExternalStats.matchups.get(slug);
  }
  const lookupKeys = [];
  if (slug) lookupKeys.push(slug.toLowerCase());
  const resolved = resolveChampionName(championName);
  if (resolved) {
    if (ExternalStats.matchups.has(resolved)) return ExternalStats.matchups.get(resolved);
    lookupKeys.push(resolved.toLowerCase());
  }
  if (typeof championName === "string") {
    lookupKeys.push(championName.toLowerCase());
  }
  for (const key of lookupKeys) {
    if (!key) continue;
    const payload = ExternalStats.matchupsBySlug.get(key);
    if (payload) return payload;
  }
  return null;
}

function getBanRateForChampion(name) {
  if (!name) return null;
  // Try by display name, slug and resolved variants
  const candidates = new Set();
  const resolved = resolveChampionName(name);
  if (resolved) candidates.add(String(resolved));
  candidates.add(String(name));
  const slug = championDataKey(name);
  if (slug) candidates.add(slug);
  // Normalize keys used when loading bans (we store lower-case keys and also display names)
  for (const c of candidates) {
    if (!c) continue;
    const key1 = String(c).toLowerCase();
    if (ExternalStats.bans && ExternalStats.bans.has(key1)) return ExternalStats.bans.get(key1);
    if (ExternalStats.bans && ExternalStats.bans.has(c)) return ExternalStats.bans.get(c);
  }
  return null;
}

function resolveOpponentStats(opponents, opponentName) {
  if (!opponents || !opponentName) return null;
  const candidateKeys = new Set();
  const slug = championDataKey(opponentName);
  if (slug) {
    candidateKeys.add(slug);
    candidateKeys.add(slug.toLowerCase());
  }
  if (typeof opponentName === "string") {
    candidateKeys.add(opponentName);
    candidateKeys.add(opponentName.toLowerCase());
  }
  const resolved = resolveChampionName(opponentName);
  if (resolved) {
    candidateKeys.add(resolved);
    candidateKeys.add(resolved.toLowerCase());
  }

  for (const key of candidateKeys) {
    if (typeof key !== "string") continue;
    if (Object.prototype.hasOwnProperty.call(opponents, key)) {
      return opponents[key];
    }
  }

  const loweredSet = new Set(
    Array.from(candidateKeys)
      .filter((key) => typeof key === "string")
      .map((key) => key.toLowerCase())
  );
  if (!loweredSet.size) return null;
  for (const [key, value] of Object.entries(opponents)) {
    if (loweredSet.has(key.toLowerCase())) {
      return value;
    }
  }
  return null;
}

function updateSynergyRecommendations(teamEntries) {
  if (!synergyListEl) return;
  if (!ExternalStats.loaded) {
    renderListEmptyState(synergyListEl, "Carregando dados de sinergia...");
    return;
  }
  if (!teamEntries.length) {
    renderListEmptyState(synergyListEl, "Selecione campeões do seu time para ver sinergias.");
    return;
  }
  const teamSet = new Set(
    teamEntries
      .map((entry) => resolveChampionName(entry.champion) || entry.champion)
      .filter(Boolean)
  );
  const presentRoles = new Set(teamEntries.map((e) => e.role).filter(Boolean));
  const ALL_ROLES = Object.keys(ROLE_LABELS);
  const missingRoles = ALL_ROLES.filter((r) => !presentRoles.has(r));
  // Se o time estiver completo (todas as roles preenchidas), mostrar as sinergias
  // entre os campeões já selecionados no próprio painel principal.
  if (presentRoles.size === ALL_ROLES.length) {
    const pairs = [];
    const picks = teamEntries.filter((e) => e && e.champion && e.role);
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const a = picks[i]; const b = picks[j];
        const rec = getPairSynergy(a.champion, a.role, b.champion, b.role);
        if (!rec) continue;
        // aplicar filtro mínimo de amostra
        const games = safeNumber(rec.games);
        if (games === null || games < MIN_SYNERGY_GAMES) continue;
        pairs.push(rec);
      }
    }
    if (!pairs.length) {
      renderListEmptyState(synergyListEl, "Sem sinergias relevantes entre os escolhidos.");
      return;
    }
    pairs.sort((x, y) => {
      if ((y.delta ?? 0) !== (x.delta ?? 0)) return (y.delta ?? 0) - (x.delta ?? 0);
      return (y.games ?? 0) - (x.games ?? 0);
    });
    const shown = pairs.slice(0, MAX_SYNERGIES);
    synergyListEl.innerHTML = "";
    shown.forEach((entry) => synergyListEl.appendChild(renderSynergyItem(entry)));
    return;
  }
  const aggregated = new Map();
  const activeLane = activeSynergyLane;
  const laneLockActive = activeLane && activeLane !== 'ALL';
  // If the user has already selected a champion in the active lane, show a
  // single empty-state message instead of recommending other champions.
  if (laneLockActive) {
    const hasSelectedInLane = teamEntries.some((e) => e && e.role === activeLane && e.champion);
    if (hasSelectedInLane) {
      renderListEmptyState(synergyListEl, "Lane já selecionada");
      return;
    }
  }
  // Determine quais roles já estão preenchidas e quais ainda faltam
  // (variables `ALL_ROLES`, `presentRoles`, `missingRoles` já foram calculadas
  // mais acima para o caso de time completo)
  // caso contrário respeitamos o filtro ativo (activeSynergyLane) mas daremos prioridade
  // às sinergias cuja partnerRole está em `missingRoles`.
  const laneMatches = (role) => (missingRoles.length === 0) ? true : (activeLane === "ALL" || role === activeLane);
  
  teamEntries.forEach(({ champion, role: assignedRole }) => {
    if (!assignedRole) return;
    const allyDisplay = resolveChampionName(champion) || champion;
    const info = getSynergyPayload(champion);
    if (!info || !info.roles) return;
    const roleData = info.roles[assignedRole];
    if (!roleData || !roleData.sinergias) return;

    Object.entries(roleData.sinergias).forEach(([partnerRole, partners]) => {
      if (!laneMatches(partnerRole)) return;
      Object.entries(partners || {}).forEach(([partner, stats]) => {
        const partnerResolved = resolveChampionName(partner) || partner;
        if (!stats || !partnerResolved || teamSet.has(partnerResolved)) return;
        if (stats.self_role && stats.self_role !== assignedRole) return;
        const delta = safeNumber(stats.synergy_delta);
        // preferir campos ponderados quando disponíveis
        const games = safeNumber(stats.games_weighted ?? stats.games);
        if (delta === null) return;
        // filtra amostras pequenas para evitar destacar sinergias pouco confiáveis
        if (games === null || games < MIN_SYNERGY_GAMES) return;
        const winRate = safeNumber(stats.duo_win_rate_weighted ?? stats.duo_win_rate);
        const partnerRoleResolved = stats.ally_role || partnerRole;
        const allyRoleResolved = stats.self_role || assignedRole;
        const priority = missingRoles.length > 0 && missingRoles.includes(partnerRoleResolved);

        if (laneLockActive) {
          // Quando travado por lane: agregamos contribuições de todos os aliados
          const weight = getRoleWeight(allyRoleResolved, partnerRoleResolved) || 1.0;
          const wGames = (games || 0) * weight;
          const existing = aggregated.get(partnerResolved);
          if (!existing) {
            aggregated.set(partnerResolved, {
              partner: partnerResolved,
              // mark as aggregate: source label will be rendered as team-level
              source: 'Time',
              aggregate: true,
              partnerRole: partnerRoleResolved,
              totalGames: games || 0,
              weightedDeltaTimesGames: (delta || 0) * (games || 0) * weight,
              weightTimesGames: wGames,
              winRate: winRate,
              priority,
              // store per-ally contributions so we can show the breakdown tooltip
              contributions: [{ source: allyDisplay, allyRole: allyRoleResolved, partnerRole: partnerRoleResolved, delta: delta || 0, games: games || 0, weight, contribution: (delta || 0) * (games || 0) * weight, winRate }],
            });
          } else {
            existing.totalGames = (existing.totalGames || 0) + (games || 0);
            existing.weightedDeltaTimesGames = (existing.weightedDeltaTimesGames || 0) + ((delta || 0) * (games || 0) * weight);
            existing.weightTimesGames = (existing.weightTimesGames || 0) + wGames;
            existing.winRate = existing.winRate || winRate;
            // if any source marked priority, keep it true
            existing.priority = existing.priority || priority;
            // append contribution for tooltip breakdown
            (existing.contributions = existing.contributions || []).push({ source: allyDisplay, allyRole: allyRoleResolved, partnerRole: partnerRoleResolved, delta: delta || 0, games: games || 0, weight, contribution: (delta || 0) * (games || 0) * weight, winRate });
          }
        } else {
          // comportamento anterior: escolher a melhor entrada por partner
          const existing = aggregated.get(partnerResolved);
          const ref = {
            partner: partnerResolved,
            source: allyDisplay,
            delta,
            winRate,
            games,
            allyRole: allyRoleResolved,
            partnerRole: partnerRoleResolved,
            priority,
          };
          if (!existing) {
            aggregated.set(partnerResolved, ref);
          } else {
            // Decidir se a nova entrada é preferível: prioridade > delta > games
            const existingScore = { priority: existing.priority ? 1 : 0, delta: existing.delta ?? 0, games: existing.games ?? 0 };
            const candidateScore = { priority: ref.priority ? 1 : 0, delta: ref.delta ?? 0, games: ref.games ?? 0 };
            const isBetter = candidateScore.priority > existingScore.priority ||
              (candidateScore.priority === existingScore.priority && (candidateScore.delta > existingScore.delta || (candidateScore.delta === existingScore.delta && candidateScore.games > existingScore.games)));
            if (isBetter) aggregated.set(partnerResolved, ref);
          }
        }
      });
    });
  });
  // Converter aggregates computados (especialmente se laneLockActive) em entries consistentes
  const suggestions = Array.from(aggregated.values()).map((it) => {
    if (laneLockActive) {
      const wt = it.weightTimesGames || 0;
      const aggDelta = wt > 0 ? (it.weightedDeltaTimesGames || 0) / wt : (it.totalGames ? 0 : 0);
      // compute a simple (non-weighted) winRate across contributions when available
      let simpleWin = null;
      if (Array.isArray(it.contributions) && it.contributions.length) {
        let swNum = 0; let swDen = 0;
        it.contributions.forEach((c) => { if (typeof c.winRate === 'number' && typeof c.games === 'number') { swNum += c.winRate * c.games; swDen += c.games; } });
        if (swDen > 0) simpleWin = swNum / swDen;
      }
      return {
        partner: it.partner,
        source: it.source,
        delta: aggDelta,
        winRate: typeof simpleWin === 'number' ? simpleWin : it.winRate,
        games: it.totalGames || 0,
        partnerRole: it.partnerRole,
        priority: !!it.priority,
        aggregate: true,
        aggregateDetails: (function () {
          const contributions = it.contributions || [];
          const weightedDeltaTimesGames = it.weightedDeltaTimesGames || 0;
          const weightTimesGames = it.weightTimesGames || 0;
          const totalGames = it.totalGames || 0;
          const agg = aggDelta;
          // also provide a simple (unweighted) average for comparison and debugging
          const simpleSum = contributions.reduce((s, c) => s + (typeof c.delta === 'number' ? c.delta : 0), 0);
          const simpleCount = contributions.length || 0;
          const simpleAvg = simpleCount > 0 ? (simpleSum / simpleCount) : null;
          return {
            contributions,
            weightedDeltaTimesGames,
            weightTimesGames,
            totalGames,
            aggDelta: agg,
            // debug fields
            debug: {
              simpleSum,
              simpleCount,
              simpleAvg,
              // human-friendly numbers for quick inspection
              _weightedNumerator: weightedDeltaTimesGames,
              _weightedDenominator: weightTimesGames,
            }
          };
        })()
      };
    }
    return it;
  }).sort((a, b) => {
    const pa = a.priority ? 1 : 0; const pb = b.priority ? 1 : 0;
    if (pb !== pa) return pb - pa; // prioridade primeiro
    if ((b.delta ?? 0) !== (a.delta ?? 0)) return (b.delta ?? 0) - (a.delta ?? 0);
    return (b.games ?? 0) - (a.games ?? 0);
  });
  const positives = suggestions.filter((item) => item.delta > 0);
  const selected = (positives.length ? positives : suggestions).slice(0, MAX_SYNERGIES);
  // Compute visible delta min/max from the selected suggestions (including aggregate contributions)
  try {
    let min = Infinity; let max = -Infinity;
    selected.forEach((it) => {
      const d = safeNumber(it.delta);
      if (typeof d === 'number') { min = Math.min(min, d); max = Math.max(max, d); }
      if (it && it.aggregate && it.aggregateDetails && Array.isArray(it.aggregateDetails.contributions)) {
        it.aggregateDetails.contributions.forEach((c) => { if (typeof c.delta === 'number') { min = Math.min(min, c.delta); max = Math.max(max, c.delta); } });
      }
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = -10; max = 10; }
    setCurrentDeltaRange(min, max);
  } catch (e) { /* non-fatal */ }
  if (!selected.length) {
    const message = ExternalStats.synergies.size
      ? "Sem sinergias relevantes para esta composição."
      : ExternalStats.errors.synergies
        ? "Não foi possível carregar dados de sinergia."
        : "Dados de sinergia indisponíveis.";
    renderListEmptyState(synergyListEl, message);
    return;
  }
  synergyListEl.innerHTML = "";
  selected.forEach((entry) => synergyListEl.appendChild(renderSynergyItem(entry)));
}

function renderSynergyItem(entry) {
  const li = document.createElement("li");
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.dataset.iconsDecorated = "1";
  // If this entry is an aggregate (team-level), render the icons of the already
  // selected champions followed by the recommended champion icon/name.
  if (entry.aggregate) {
    const picks = getSidePickEntries('team').filter((p) => p && p.champion);
    // render selected champions as icons only
    picks.forEach((p, idx) => {
      const icon = createChampIconOnly(p.champion);
      title.appendChild(icon);
      if (idx < picks.length - 1) {
        // small separator between icons
        const sep = document.createElement('span'); sep.className = 'inline-sep'; sep.textContent = ' ';
        title.appendChild(sep);
      }
    });
    // separator then recommended champion
    title.appendChild(document.createTextNode(' + '));
    title.appendChild(createInlineChamp(entry.partner, ROLE_LABELS[entry.partnerRole]));
  } else {
    title.appendChild(createInlineChamp(entry.source, ROLE_LABELS[entry.allyRole]));
    title.appendChild(document.createTextNode(" + "));
    title.appendChild(createInlineChamp(entry.partner, ROLE_LABELS[entry.partnerRole]));
  }
  content.appendChild(title);
  const meta = document.createElement("p");
  meta.className = "muted";
  const bits = [];
  // prepare formatted delta (used in badge) and meta components
  const formattedDelta = formatSigned(entry.delta);
  // Quando uma lane está selecionada (filtro ativo), mostrar apenas jogos e WR
  const laneFiltered = typeof activeSynergyLane !== 'undefined' && activeSynergyLane !== 'ALL';
  const formattedGames = formatGames(entry.games);
  let formattedWR = formatPercent(entry.winRate);
  if (laneFiltered) {
    // show champion's general games and WR in the selected lane (not partner-specific)
    const roleStats = getChampionRoleStats(entry.partner, activeSynergyLane);
    const roleGames = roleStats.games ?? entry.games;
    const roleWR = typeof roleStats.winRate === 'number' ? roleStats.winRate : entry.winRate;
    const formattedRoleGames = formatGames(roleGames);
    const formattedRoleWR = formatPercent(roleWR);
    if (formattedRoleGames) bits.push(formattedRoleGames);
    if (formattedRoleWR) bits.push(`WR ${formattedRoleWR}`);
    // não incluir delta no meta quando filtrado por lane
  } else {
    // comportamento padrão: jogos · WR · Δ
    if (formattedGames) bits.push(formattedGames);
    if (formattedWR) bits.push(`WR ${formattedWR}`);
    if (formattedDelta) bits.push(`Δ ${formattedDelta}`);
  }
  meta.textContent = bits.join(" · ") || "Amostra pequena";
  content.appendChild(meta);
  li.appendChild(content);
  const badge = document.createElement("span");
  badge.className = getDeltaPillClass(entry.delta);
  badge.textContent = formattedDelta ?? "--";
  // If aggregate, attach tooltip to badge showing contribution breakdown
  if (entry.aggregate && entry.aggregateDetails) {
    const details = entry.aggregateDetails;
    const tooltipHtml = formatAggregateTooltip(details);
    const show = (e) => {
      const tip = ensureScoreTooltip();
      tip.innerHTML = tooltipHtml;
      tip.style.display = 'block';
      tip.style.opacity = '1';
      const rect = badge.getBoundingClientRect();
      requestAnimationFrame(() => {
        const tw = tip.offsetWidth; const th = tip.offsetHeight;
        let left = window.scrollX + rect.left + rect.width / 2 - tw / 2; const minPad = 8;
        if (left < minPad) left = minPad;
        if (left + tw > window.scrollX + document.documentElement.clientWidth - minPad) left = window.scrollX + document.documentElement.clientWidth - tw - minPad;
        let topAbove = window.scrollY + rect.top - th - 8; let topBelow = window.scrollY + rect.bottom + 8; let top = topAbove;
        const viewportTop = window.scrollY + minPad; const viewportBottom = window.scrollY + document.documentElement.clientHeight - minPad;
        if (topAbove < viewportTop) { top = topBelow; if (top + th > viewportBottom) top = Math.max(viewportTop, viewportBottom - th); }
        tip.style.left = `${Math.round(left)}px`;
        tip.style.top = `${Math.round(top)}px`;
      });
    };
    const hide = () => { hideScoreTooltip(); };
    badge.addEventListener('mouseenter', show);
    badge.addEventListener('mouseleave', hide);
  }
  li.appendChild(badge);
  return li;
}

function updateComboHighlights(teamPicks, enemyPicks, targetList = comboListEl, options = { scope: "team" }) {
  if (!targetList) return;
  if (!ExternalStats.loaded) {
    renderListEmptyState(targetList, "Carregando combos...");
    return;
  }
  const combos = ExternalStats.combos || [];
  const teamSet = new Set(teamPicks.map((p) => resolveChampionName(p) || p));
  const enemySet = new Set(enemyPicks.map((p) => resolveChampionName(p) || p));
  const banned = new Set(Array.from(getGlobalBans()).map((b) => resolveChampionName(b) || b));
  
  const ranked = combos
    .map((entry) => {
      const champions = Array.isArray(entry.champions) ? entry.champions : [];
      const championNames = champions.map((c) => {
        const raw = (c && typeof c === "object" && "name" in c) ? c.name : c;
        return resolveChampionName(raw) || raw;
      });
      const roles = champions.map((c) => c.role || null);
      const occurrences = safeNumber(entry.occurrences_weighted ?? entry.occurrences) ?? 0;
      const winRate = safeNumber(entry.win_rate_weighted ?? entry.win_rate);
      
      const relevantSet = options.scope === "enemy" ? enemySet : teamSet;
      const hasAny = championNames.some((name) => relevantSet.has(name));
      const hasAll = championNames.every((name) => relevantSet.has(name));
      const containsRelevant = options.scope === "enemy" ? hasAny : hasAll;
      
      // Verifica conflitos (banido ou no outro time)
      const otherSide = options.scope === "enemy" ? teamSet : enemySet;
      const conflicts = championNames.some((name) => banned.has(name) || otherSide.has(name));
      
      return {
        champions: championNames,
        roles,
        containsRelevant,
        conflicts,
        winRate,
        games: occurrences,
      };
    })
    .filter((item) => {
      // Só mostra combos válidos para o escopo selecionado e sem conflitos (banidos ou no lado oposto)
      return item.containsRelevant && !item.conflicts;
    })
    .sort((a, b) => {
      // Ordena por ocorrências (games) primeiro, depois win rate
      if ((b.games ?? 0) !== (a.games ?? 0)) return (b.games ?? 0) - (a.games ?? 0);
      if ((b.winRate ?? -Infinity) !== (a.winRate ?? -Infinity)) return (b.winRate ?? -Infinity) - (a.winRate ?? -Infinity);
      return a.champions.length - b.champions.length;
    });
  
  const subset = ranked.slice(0, 6);
  if (!subset.length) {
    const emptyMessage = options.scope === "enemy"
      ? "Nenhum combo disponível para o outro lado."
      : "Nenhum combo disponível.";
    renderListEmptyState(targetList, emptyMessage);
    return;
  }
  targetList.innerHTML = "";
  subset.forEach((item) => targetList.appendChild(renderComboItem(item, options.scope)));
}

function renderComboItem(item, scope = "team") {
  const li = document.createElement("li");
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.dataset.iconsDecorated = "1";
  item.champions.forEach((champ, index) => {
    if (index > 0) title.appendChild(document.createTextNode(" + "));
    const roleKey = item.roles?.[index];
    const roleLabel = roleKey && ROLE_LABELS[roleKey] ? ROLE_LABELS[roleKey] : null;
    title.appendChild(createInlineChamp(champ, roleLabel));
  });
  content.appendChild(title);
  const meta = document.createElement("p");
  meta.className = "muted";
  const bits = [];
  const formattedWR = formatPercent(item.winRate);
  if (formattedWR) bits.push(`WR ${formattedWR}`);
  const formattedGames = formatGames(item.games);
  if (formattedGames) bits.push(formattedGames);
  bits.push(scope === "team" ? "Combina com seu time" : "Potencial do inimigo");
  meta.textContent = bits.join(" · ") || "Sem dados suficientes";
  content.appendChild(meta);
  li.appendChild(content);
  const badge = document.createElement("span");
  badge.className = "pill pill-purple";
  badge.textContent = item.champions.length === 2 ? "Duo" : item.champions.length === 3 ? "Trio" : `${item.champions.length}x`;
  li.appendChild(badge);
  return li;
}

function updateMatchupInsights(teamEntries, enemyEntries) {
  if (!matchupListEl) return;
  if (!ExternalStats.loaded) {
    renderListEmptyState(matchupListEl, "Carregando dados de matchup...");
    return;
  }
  const teamPicks = teamEntries.map((entry) => entry.champion);
  const enemyPicks = enemyEntries.map((entry) => entry.champion);
  if (!teamPicks.length || !enemyPicks.length) {
    renderListEmptyState(matchupListEl, "Selecione campeões dos dois lados para ver os matchups.");
    return;
  }

  const buildRoleMap = (entries) => {
    const map = new Map();
    entries.forEach(({ champion, role }) => {
      if (!role) return;
      const raw = String(champion || "").trim();
      if (!raw) return;
      const resolved = resolveChampionName(raw);
      const keys = [raw, resolved].filter(Boolean);
      keys.forEach((key) => map.set(key.toLowerCase(), role));
    });
    return map;
  };

  const teamRoleMap = buildRoleMap(teamEntries);
  const enemyRoleMap = buildRoleMap(enemyEntries);

  const DEFAULT_ROLE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
  const teamSelectedRoles = new Set(
    teamEntries
      .filter((entry) => entry && entry.champion && entry.role)
      .map((entry) => normalizeRoleKey(entry.role))
      .filter(Boolean)
  );
  const enemySelectedRoles = new Set(
    enemyEntries
      .filter((entry) => entry && entry.champion && entry.role)
      .map((entry) => normalizeRoleKey(entry.role))
      .filter(Boolean)
  );
  const getRoleIndex = (role) => {
    const idx = DEFAULT_ROLE_ORDER.indexOf(role);
    return idx >= 0 ? idx : DEFAULT_ROLE_ORDER.length;
  };
  const lanePriorityFor = (row) => {
    const allySel = normalizeRoleKey(row.allySelectionRole);
    const enemySel = normalizeRoleKey(row.enemySelectionRole);
    if (allySel && enemySel && allySel === enemySel) {
      return { tier: 0, order: getRoleIndex(allySel) };
    }
    const candidates = [
      allySel,
      enemySel,
      normalizeRoleKey(row.allyRole),
      normalizeRoleKey(row.enemyRole),
    ].filter(Boolean);
    const hasSelection = Boolean(allySel || enemySel);
    const orderIndex = candidates.length
      ? Math.min(...candidates.map(getRoleIndex))
      : DEFAULT_ROLE_ORDER.length;
    return {
      tier: hasSelection ? 1 : 2,
      order: orderIndex,
    };
  };

  const rows = [];
  teamPicks.forEach((ally) => {
    const allyDisplay = resolveChampionName(ally);
    const allyKey = (allyDisplay || ally || "").toLowerCase();
    const info = getMatchupPayload(ally);
    if (!info || !info.roles) return;
    
    // Percorre cada role do campeão aliado
    Object.entries(info.roles).forEach(([allyRoleKey, roleData]) => {
      const matchups = roleData.matchups || {};
      
      // Percorre cada role de oponente
      Object.entries(matchups).forEach(([opponentRole, opponents]) => {
        enemyPicks.forEach((enemy) => {
          const enemyDisplay = resolveChampionName(enemy);
           const enemyKey = (enemyDisplay || enemy || "").toLowerCase();
          const stats = resolveOpponentStats(opponents, enemy);
          if (!stats) return;
          
          const delta = safeNumber(stats.matchup_delta);
          const winRate = safeNumber(stats.counter_win_rate_weighted ?? stats.counter_win_rate);
          const earlyWin = safeNumber(
            stats.early_win_rate_weighted ?? stats.early_win_rate ?? (stats.early && (stats.early.win_rate_weighted ?? stats.early.win_rate))
          );
          const games = safeNumber(stats.games_weighted ?? stats.games);
          if (delta === null && winRate === null) return;

          const allyRoleResolved = stats.self_role || allyRoleKey || null;
          const enemyRoleResolved = stats.opponent_role || opponentRole || null;
          const allySelectionRole = teamRoleMap.get(allyKey);
          const enemySelectionRole = enemyRoleMap.get(enemyKey);
          const matchesSelection =
            (!allySelectionRole || !allyRoleResolved || allySelectionRole === allyRoleResolved) &&
            (!enemySelectionRole || !enemyRoleResolved || enemySelectionRole === enemyRoleResolved);
          const absDelta = Math.abs(delta ?? 0);
          
          rows.push({
            ally: allyDisplay || ally,
            allyRole: allyRoleResolved || null,
            enemy: enemyDisplay || enemy,
            enemyRole: enemyRoleResolved || null,
            delta: delta ?? 0,
            winRate,
            earlyWin,
            games,
            absDelta,
            matchesSelection,
            allySelectionRole: allySelectionRole || null,
            enemySelectionRole: enemySelectionRole || null,
          });
        });
      });
    });
  });
  
  if (!rows.length) {
    const message = ExternalStats.errors.matchups
      ? "Não foi possível carregar dados de matchup."
      : "Sem dados suficientes para esses confrontos.";
    renderListEmptyState(matchupListEl, message);
    return;
  }

  const deduped = new Map();
  rows.forEach((row) => {
    const key = `${row.ally}::${row.enemy}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      return;
    }
    const existingScore = {
      matchesSelection: existing.matchesSelection ? 1 : 0,
      absDelta: existing.absDelta ?? Math.abs(existing.delta ?? 0),
      games: existing.games ?? 0,
    };
    const candidateScore = {
      matchesSelection: row.matchesSelection ? 1 : 0,
      absDelta: row.absDelta ?? Math.abs(row.delta ?? 0),
      games: row.games ?? 0,
    };
    const isBetter =
      candidateScore.matchesSelection > existingScore.matchesSelection ||
      (candidateScore.matchesSelection === existingScore.matchesSelection &&
        (candidateScore.absDelta > existingScore.absDelta ||
          (candidateScore.absDelta === existingScore.absDelta && candidateScore.games > existingScore.games)));
    if (isBetter) {
      deduped.set(key, row);
    }
  });

  const uniqueRows = Array.from(deduped.values());

  // Trava as matchups às lanes escolhidas
  const laneLocked = uniqueRows.filter((row) => row.matchesSelection);
  if (laneLocked.length === 0) {
    renderListEmptyState(matchupListEl, "Sem matchups para as lanes selecionadas.");
    return;
  }

  // Filtra matchups com base na visibilidade
  const filtered = laneLocked.filter((row) => {
    if (row.delta > 2 && !matchupVisibility.favorable) return false;
    if (row.delta < -2 && !matchupVisibility.unfavorable) return false;
    if (row.delta >= -2 && row.delta <= 2 && !matchupVisibility.even) return false;
    return true;
  });
  
  filtered.sort((a, b) => {
    const laneA = lanePriorityFor(a);
    const laneB = lanePriorityFor(b);
    if (laneA.tier !== laneB.tier) return laneA.tier - laneB.tier;
    if (laneA.order !== laneB.order) return laneA.order - laneB.order;
    const aValue = Math.abs(a.delta);
    const bValue = Math.abs(b.delta);
    if (bValue !== aValue) return bValue - aValue;
    return (b.games ?? 0) - (a.games ?? 0);
  });
  
  const subset = filtered.slice(0, MAX_MATCHUPS);
  matchupListEl.innerHTML = "";
  subset.forEach((row) => matchupListEl.appendChild(renderMatchupItem(row)));
  decorateChampionNames(matchupListEl);
}

function renderMatchupItem(row) {
  const li = document.createElement("li");
  const content = document.createElement("div");
  const title = document.createElement("strong");
  // Renderizar como tokens com ícone + (Lane) juntos para manter alinhamento
  title.dataset.iconsDecorated = "1";
  const allyLabel = row.allyRole && ROLE_LABELS[row.allyRole] ? ROLE_LABELS[row.allyRole] : null;
  const enemyLabel = row.enemyRole && ROLE_LABELS[row.enemyRole] ? ROLE_LABELS[row.enemyRole] : null;
  title.appendChild(createInlineChamp(row.ally, allyLabel));
  title.appendChild(document.createTextNode(" vs "));
  title.appendChild(createInlineChamp(row.enemy, enemyLabel));
  content.appendChild(title);
  const meta = document.createElement("p");
  meta.className = "muted";
  const bits = [];
  const formattedWR = formatPercent(row.winRate);
  if (formattedWR) bits.push(`WR ${formattedWR}`);
  const formattedEarly = formatPercent(row.earlyWin);
  if (formattedEarly) bits.push(`Early ${formattedEarly}`);
  const formattedGames = formatGames(row.games);
  if (formattedGames) bits.push(formattedGames);
  const formattedDelta = formatSigned(row.delta);
  if (formattedDelta) bits.push(`Δ ${formattedDelta}`);
  meta.textContent = bits.join(" · ") || "Amostra pequena";
  content.appendChild(meta);
  li.appendChild(content);
  const badge = document.createElement("span");
  badge.className = getDeltaPillClass(row.delta);
  badge.textContent = row.delta > 2 ? "Favorável" : row.delta < -2 ? "Desfavorável" : "Equilibrado";
  li.appendChild(badge);
  return li;
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
  updateInsightPanels();
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
  // Limpa bans e atualiza ícones/labels
  document.querySelectorAll('.ban-group select').forEach((s) => {
    if (s.options.length > 0) s.selectedIndex = 0;
    try { ensureSelectIcon(s); } catch (e) { }
    try { setBanRateForBanSelect(s); } catch (e) { }
  });
  document.querySelectorAll('.ban-group').forEach((g) => updateBanGroup(g));
  // Limpa seleções de campeões do time e inimigo
  document.querySelectorAll('.role-select select').forEach((sel) => {
    sel.value = '';
    const placeholder = sel.querySelector('option[value=""]');
    if (placeholder) placeholder.selected = true;
    const holder = sel.closest('li')?.querySelector('.champ-tags');
    if (holder) holder.innerHTML = '';
    ensureSelectIcon(sel);
  });
  refreshCompositionOptions();
  refresh();
});

// initial refresh will run after data and helpers are loaded via loadChampionTags() and loadExternalStats()

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

function ensureFallbackChampionData() {
  if (!Array.isArray(FALLBACK_CHAMPION_LIST) || !FALLBACK_CHAMPION_LIST.length) {
    return false;
  }
  if (ChampionTags.byChampion.size) {
    return false;
  }
  ChampionTags.byChampion.clear();
  ChampionNameIndex.clear();
  let added = 0;
  FALLBACK_CHAMPION_LIST.forEach((name) => {
    const displayName = String(name || "").trim();
    if (!displayName) return;
    if (!ChampionTags.byChampion.has(displayName)) {
      ChampionTags.byChampion.set(displayName, { Champion: displayName });
      added += 1;
    }
    registerChampionAliases(displayName);
  });
  CHAMPION_NAME_OVERRIDES.forEach((displayName) => registerChampionAliases(displayName));
  if (!ChampionTags.rows.length && added) {
    ChampionTags.rows = FALLBACK_CHAMPION_LIST.map((name) => ({ Champion: name }));
  }
  console.info("[fallback] carregando lista padrão de campeões:", added);
  populateChampionSelects();
  populateBanSelects();
  updateInsightPanels();
  return added > 0;
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
    ChampionNameIndex.clear();
    for (const r of rows) {
      if (!r.Champion) continue;
      const championName = String(r.Champion).trim();
      if (!championName) continue;
      ChampionTags.byChampion.set(championName, r);
      registerChampionAliases(championName);
    }
    CHAMPION_NAME_OVERRIDES.forEach((displayName) => registerChampionAliases(displayName));
    if (!ChampionTags.byChampion.size) {
      ensureFallbackChampionData();
    } else {
      populateChampionSelects();
      populateBanSelects();
      updateInsightPanels();
    }
  } catch (err) {
    console.warn("Nao foi possivel carregar TAGS.csv:", err);
    if (!ChampionTags.byChampion.size) {
      ensureFallbackChampionData();
    }
  }
}

async function loadExternalStats() {
  ExternalStats.loaded = false;
  ExternalStats.errors.synergies = false;
  ExternalStats.errors.matchups = false;
  ExternalStats.errors.combos = false;
  updateInsightPanels();

  const sources = [
    ["synergies", "../data/synergies_high_elo.json"],
    ["matchups", "../data/matchups_high_elo.json"],
    ["combos", "../data/top_combos_high_elo.json"],
    ["bans", "../data/bans_high_elo.json"],
  ];

  await Promise.all(sources.map(async ([key, url]) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Falha ao carregar ${url}: ${res.status}`);
      const data = await res.json();
      if (key === "synergies") {
        ExternalStats.synergies.clear();
        ExternalStats.synergiesBySlug.clear();
        if (data && typeof data === "object") {
          Object.entries(data).forEach(([champ, payload]) => {
            if (!payload || champ.startsWith("_")) return;
            const slug = championDataKey(champ) || champ;
            const lower = slug.toLowerCase();
            ExternalStats.synergies.set(slug, payload);
            ExternalStats.synergiesBySlug.set(lower, payload);
            if (champ && champ.toLowerCase() !== lower) {
              ExternalStats.synergiesBySlug.set(champ.toLowerCase(), payload);
            }
            const resolved = resolveChampionName(champ);
            if (resolved) {
              ExternalStats.synergiesBySlug.set(resolved.toLowerCase(), payload);
            }
          });
        }
      } else if (key === "matchups") {
        ExternalStats.matchups.clear();
        ExternalStats.matchupsBySlug.clear();
        if (data && typeof data === "object") {
          Object.entries(data).forEach(([champ, payload]) => {
            if (!payload || champ.startsWith("_")) return;
            const slug = championDataKey(champ) || champ;
            const lower = slug.toLowerCase();
            ExternalStats.matchups.set(slug, payload);
            ExternalStats.matchupsBySlug.set(lower, payload);
            if (champ && champ.toLowerCase() !== lower) {
              ExternalStats.matchupsBySlug.set(champ.toLowerCase(), payload);
            }
            const resolved = resolveChampionName(champ);
            if (resolved) {
              ExternalStats.matchupsBySlug.set(resolved.toLowerCase(), payload);
            }
          });
        }
      } else if (key === "combos") {
        const duos = Array.isArray(data && data.duos) ? data.duos : [];
        const trios = Array.isArray(data && data.trios) ? data.trios : [];
        ExternalStats.combos = duos.concat(trios);
      } else if (key === "bans") {
        ExternalStats.bans = new Map();
        if (data && typeof data === "object") {
          // Some ban files wrap champions under a top-level `bans` key
          const source = data.bans && typeof data.bans === 'object' ? data.bans : data;
          Object.entries(source).forEach(([champ, payload]) => {
            if (!payload) return;
            // ban rate: prefer weighted when available
            const rate = safeNumber(payload.ban_rate_weighted ?? payload.ban_rate ?? payload.banRate ?? payload.rate);
            const slug = championDataKey(champ) || champ;
            // store by lower-case slug and display name (resolved)
            if (typeof slug === "string") ExternalStats.bans.set(String(slug).toLowerCase(), rate ?? null);
            const resolved = resolveChampionName(champ);
            if (resolved) ExternalStats.bans.set(String(resolved).toLowerCase(), rate ?? null);
            // also store original key lower-case
            ExternalStats.bans.set(String(champ).toLowerCase(), rate ?? null);
          });
        }
      }
    } catch (err) {
      ExternalStats.errors[key] = true;
      console.warn(`Nao foi possivel carregar ${url}:`, err);
    }
  }));
  ExternalStats.loaded = true;
  try {
    if (ExternalStats.bans && ExternalStats.bans.size) console.info(`[bans] total armazenado: ${ExternalStats.bans.size}`);
  } catch (e) {}
  // atualiza exibições de Ban Rate caso o usuário já tenha selecionado campeões
  try { refreshBanDisplays(); } catch (e) { }
  updateInsightPanels();
}


// Bans: preencher e bloquear duplicados
function populateBanSelects() {
  let champions = Array.from(ChampionTags.byChampion.keys()).sort((a, b) => a.localeCompare(b));
  if (!champions.length && Array.isArray(FALLBACK_CHAMPION_LIST)) {
    champions = [...FALLBACK_CHAMPION_LIST].sort((a, b) => a.localeCompare(b));
  }
  document.querySelectorAll('.ban-group').forEach((groupEl) => {
    const selects = groupEl.querySelectorAll('select');
    selects.forEach((sel) => {
      sel.innerHTML = '';
      const ph = document.createElement('option');
      ph.value = '';
      ph.disabled = true;
      ph.selected = true;
      ph.textContent = 'Selecione os Bans';
      sel.appendChild(ph);
      champions.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
      ensureSelectIcon(sel);
      sel.addEventListener('change', () => { updateBanGroup(groupEl); ensureSelectIcon(sel); setBanRateForBanSelect(sel); });
      // inicializa exibição caso já tenha valor
      try { setBanRateForBanSelect(sel); } catch (e) { }
    });
    updateBanGroup(groupEl);
  });
}

function setBanRateForBanSelect(sel) {
  if (!sel) return;
  // procura o elemento .ban-rate irmão no label
  const label = sel.closest('label.field');
  if (!label) return;
  let el = label.querySelector('.ban-rate');
  if (!el) {
    el = document.createElement('span');
    el.className = 'ban-rate muted';
    label.appendChild(el);
  }
  const val = sel.value || '';
  if (!val) { el.textContent = 'Ban Rate: --%'; el.style.display = 'none'; return; }
  const rate = getBanRateForChampion(val);
  if (rate === null || rate === undefined) {
    el.textContent = 'Ban Rate: --%';
  } else {
    el.textContent = `Ban Rate: ${banPercentFormatter.format(rate)}%`;
  }
  el.style.display = 'block';
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

function getSidePickEntries(side) {
  const scope = document.querySelector(side === 'team' ? '.panel-team' : '.panel-enemy');
  if (!scope) return [];
  const entries = [];
  scope.querySelectorAll('.role-list li').forEach((item) => {
    const select = item.querySelector('.role-select select');
    if (!select || !select.value) return;
    const roleEl = item.querySelector('.role[data-role]');
    const role = roleEl && roleEl.dataset ? roleEl.dataset.role || null : null;
    entries.push({ role, champion: select.value });
  });
  return entries;
}

function refreshCompositionOptions() {
  let champions = Array.from(ChampionTags.byChampion.keys()).sort((a, b) => a.localeCompare(b));
  if (!champions.length && Array.isArray(FALLBACK_CHAMPION_LIST)) {
    champions = [...FALLBACK_CHAMPION_LIST].sort((a, b) => a.localeCompare(b));
  }
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
    const ph = document.createElement('option'); ph.value=''; ph.disabled=true; ph.textContent='Selecione um Campe\u00E3o';
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
  let champions = Array.from(ChampionTags.byChampion.keys()).sort((a, b) => a.localeCompare(b));
  if (!champions.length && Array.isArray(FALLBACK_CHAMPION_LIST)) {
    champions = [...FALLBACK_CHAMPION_LIST].sort((a, b) => a.localeCompare(b));
  }
  const banned = getGlobalBans();
  document.querySelectorAll('.role-select select').forEach((sel) => {
    const current = sel.value || '';
    const allowed = champions.filter((name) => !banned.has(name) || name === current);
    const newSel = document.createElement('select');
    const ph = document.createElement('option');
    ph.value = '';
    ph.disabled = true;
    ph.selected = !current || !allowed.includes(current);
    ph.textContent = 'Selecione um Campe\u00E3o';
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
  let champions = Array.from(ChampionTags.byChampion.keys()).sort((a, b) => a.localeCompare(b));
  if (!champions.length && Array.isArray(FALLBACK_CHAMPION_LIST)) {
    champions = [...FALLBACK_CHAMPION_LIST].sort((a, b) => a.localeCompare(b));
  }
  console.info("[populateChampionSelects] quantidade:", champions.length);
  const selects = document.querySelectorAll(".role-select select");
  selects.forEach((sel) => {
    sel.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione um Campe\u00E3o";
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

  // Listener para atualizar badges e ativar pills relacionadas ao campeão
  document.querySelectorAll(".role-list li").forEach((item) => {
    const sel = item.querySelector(".role-select select");
    if (!sel) return;
    // garante o holder das tags ao lado do select (dentro de .role-select)
    const selectRow = item.querySelector(".role-select");
    if (selectRow && !selectRow.querySelector(".champ-tags")) {
      const holder = document.createElement("div");
      holder.className = "champ-tags pill-row";
      selectRow.appendChild(holder);
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
  const holder = rowEl.querySelector(".role-select .champ-tags") || rowEl.querySelector(".champ-tags");
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

function setBanRateDisplay(rowEl, championName) {
  if (!rowEl) return;
  // encontra ou cria elemento de exibição
  let el = rowEl.querySelector('.ban-rate');
  if (!el) {
    el = document.createElement('div');
    el.className = 'ban-rate muted';
    // colocar após as champ-tags dentro de .role-select
    const selectRow = rowEl.querySelector('.role-select');
    if (selectRow) selectRow.appendChild(el); else rowEl.appendChild(el);
  }
  if (!championName) { el.textContent = ''; el.style.display = 'none'; return; }
  const rate = getBanRateForChampion(championName);
  if (rate === null || rate === undefined) {
    el.textContent = 'Ban Rate: --%';
  } else {
    el.textContent = `Ban Rate: ${banPercentFormatter.format(rate)}%`;
  }
  el.style.display = 'block';
}

function refreshBanDisplays() {
  // Atualiza apenas os selects dentro de .ban-group (aba Bans)
  document.querySelectorAll('.ban-group select').forEach((sel) => {
    try {
      setBanRateForBanSelect(sel);
    } catch (e) {
      // ignore per-select errors
    }
  });
}

// Inicia carregamento do CSV assim que a pÃ¡gina abrir
// Substitui caracteres de multiplicacao mal-decodificados por 'x'
function sanitizeVisibleCounts() {
  document.querySelectorAll('.tag-cloud .pill, .champ-tags .pill').forEach((pill) => {
    const s = pill.textContent;
    const cleaned = s
      .replace(/\\u00D7/g, '×') // × (times)
      .replace(/Ã—/g, 'x')
      .replace(/[^\x20-\x7E]-(\d+)/g, ' x$1');
    if (s !== cleaned) pill.textContent = cleaned;
  });
}

// -------- Ícones de Campeões --------
const CHAMPION_ICON_ID_OVERRIDES = new Map([
  ["Wukong", "MonkeyKing"], ["LeBlanc", "Leblanc"], ["Cho'Gath", "Chogath"], ["Vel'Koz", "Velkoz"],
  ["Kha'Zix", "Khazix"], ["Kai'sa", "Kaisa"], ["Kai'Sa", "Kaisa"], ["Bel'Veth", "Belveth"],
  ["K'Sante", "KSante"], ["Renata Glasc", "Renata"], ["Dr. Mundo", "DrMundo"], ["Jarvan IV", "JarvanIV"],
  ["Lee Sin", "LeeSin"], ["Master Yi", "MasterYi"], ["Miss Fortune", "MissFortune"], ["Twisted Fate", "TwistedFate"],
  ["Tahm Kench", "TahmKench"], ["Xin Zhao", "XinZhao"], ["Aurelion Sol", "AurelionSol"], ["Kog'Maw", "KogMaw"],
  ["Nunu e Willump", "Nunu"], ["Nunu & Willump", "Nunu"], ["Nunu And Willump", "Nunu"]
]);
const CHAMPION_ICON_PLACEHOLDER_NAMES = new Set([
  "Mel",
  "Ambessa",
  "Yunara",
  "Mel Medarda",
  "Ambessa Medarda",
]);

const LOCAL_CHAMPION_ICON_BASE = "../assets/champions";
function placeholderIcon(name) {
  const initial = (name || "").trim().charAt(0).toUpperCase() || "?";
  const palette = [
    { bg: "#25304a", fg: "#7aa0ff" },
    { bg: "#2c3f33", fg: "#7ce2c4" },
    { bg: "#3d2a4a", fg: "#d6a6ff" },
    { bg: "#43311f", fg: "#f6c27a" },
    { bg: "#3a1f2b", fg: "#ff94c2" },
  ];
  const idx = initial.charCodeAt(0) % palette.length;
  const { bg, fg } = palette[idx];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${bg}"/><text x="50%" y="50%" fill="${fg}" font-size="32" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function championIdForIcon(name) {
  if (!name) return null;
  const trimmed = name.trim();
  if (CHAMPION_ICON_ID_OVERRIDES.has(trimmed)) return CHAMPION_ICON_ID_OVERRIDES.get(trimmed);
  const cleaned = trimmed
    .normalize('NFD').replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^([a-z])/, (m) => m.toUpperCase());
  return cleaned;
}

function championIconLocalUrl(name) {
  const id = championIdForIcon(name);
  if (!id) return '';
  return `${LOCAL_CHAMPION_ICON_BASE}/${id}.png`;
}

function championIconCdnUrl(name) {
  const id = championIdForIcon(name);
  if (!id) return '';
  const ver = '14.20.1';
  return `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${id}.png`;
}

function setChampionIcon(img, name) {
  if (!img) return false;
  img.onerror = null;
  delete img.dataset.iconAttempt;
  if (!name) {
    img.removeAttribute('src');
    img.style.visibility = 'hidden';
    return false;
  }
  const trimmed = name.trim();
  const sources = [];
  const local = championIconLocalUrl(trimmed);
  if (local) sources.push(local);
  if (!CHAMPION_ICON_PLACEHOLDER_NAMES.has(trimmed)) {
    const cdn = championIconCdnUrl(trimmed);
    if (cdn) sources.push(cdn);
  }
  sources.push(placeholderIcon(trimmed));
  let attempt = 0;
  const applySource = () => {
    const src = sources[attempt];
    if (!src) {
      img.removeAttribute('src');
      img.style.visibility = 'hidden';
      img.onerror = null;
      return;
    }
    img.dataset.iconAttempt = String(attempt);
    img.src = src;
    img.alt = trimmed;
    img.style.visibility = 'visible';
  };
  img.onerror = () => {
    attempt += 1;
    if (attempt >= sources.length) {
      img.onerror = null;
      img.removeAttribute('src');
      img.style.visibility = 'hidden';
      return;
    }
    applySource();
  };
  applySource();
  return true;
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
  const hasIcon = setChampionIcon(img, sel.value);
  icon.style.visibility = hasIcon ? 'visible' : 'hidden';
}

function createInlineChamp(name, roleLabel) {
  const displayName = roleLabel ? `${name} (${roleLabel})` : name;
  const span = document.createElement('span'); span.className = 'champ-inline';
  const ic = document.createElement('span'); ic.className = 'champ-icon'; const img = document.createElement('img'); setChampionIcon(img, name);
  ic.appendChild(img);
  const t = document.createElement('span'); t.textContent = displayName;
  span.appendChild(ic);
  span.appendChild(t);
  return span;
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
const fallbackPreloaded = ensureFallbackChampionData();
if (fallbackPreloaded) {
  console.info("[fallback] utilizando lista padrão de campeões até que os dados carreguem.");
}
// Inicia carregamento do CSV assim que a pagina abrir
loadChampionTags();
loadExternalStats();
