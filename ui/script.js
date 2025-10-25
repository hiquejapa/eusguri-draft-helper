const teamTagsEl = document.getElementById("team-tags");
const enemyTagsEl = document.getElementById("enemy-tags");
const teamScoreEl = document.getElementById("team-score");
const enemyScoreEl = document.getElementById("enemy-score");
const resetBtn = document.querySelector('[data-action="reset"]');
const synergyListEl = document.getElementById("synergy-list");
const comboListEl = document.getElementById("combo-list");
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

const ROLE_LABELS = {
  TOP: "Topo",
  JUNGLE: "Selva",
  MIDDLE: "Meio",
  BOTTOM: "Atirador",
  UTILITY: "Suporte",
};

const MATCHUP_LABELS = {
  favorable: "Favorável",
  even: "Equilibrado",
  unfavorable: "Desfavorável",
};

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
  if (delta >= 5) return "pill pill-green";
  if (delta <= -5) return "pill pill-red";
  if (delta >= 2) return "pill pill-orange";
  if (delta <= -2) return "pill pill-orange";
  return "pill pill-blue";
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
  updateMatchupInsights(teamEntries, enemyEntries);
  updateComboHighlights(teamPicks, enemyPicks, enemyComboListEl, { scope: "enemy" });
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
  const aggregated = new Map();
  const activeLane = activeSynergyLane;
  const laneMatches = (role) => activeLane === "ALL" || role === activeLane;
  
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
        if (delta === null) return;
        const winRate = safeNumber(stats.duo_win_rate_weighted ?? stats.duo_win_rate);
        const games = safeNumber(stats.games_weighted ?? stats.games);
        const existing = aggregated.get(partnerResolved);
        const ref = {
          partner: partnerResolved,
          source: allyDisplay,
          delta,
          winRate,
          games,
          allyRole: stats.self_role || assignedRole,
          partnerRole: stats.ally_role || partnerRole,
        };
        if (!existing || delta > existing.delta) {
          aggregated.set(partnerResolved, ref);
        }
      });
    });
  });
  
  const suggestions = Array.from(aggregated.values()).sort((a, b) => b.delta - a.delta);
  const positives = suggestions.filter((item) => item.delta > 0);
  const selected = (positives.length ? positives : suggestions).slice(0, 6);
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
  title.appendChild(createInlineChamp(entry.source, ROLE_LABELS[entry.allyRole]));
  title.appendChild(document.createTextNode(" + "));
  title.appendChild(createInlineChamp(entry.partner, ROLE_LABELS[entry.partnerRole]));
  content.appendChild(title);
  const meta = document.createElement("p");
  meta.className = "muted";
  const bits = [];
  const formattedWR = formatPercent(entry.winRate);
  if (formattedWR) bits.push(`WR ${formattedWR}`);
  const formattedGames = formatGames(entry.games);
  if (formattedGames) bits.push(formattedGames);
  const formattedDelta = formatSigned(entry.delta);
  if (formattedDelta) bits.push(`Δ ${formattedDelta}`);
  meta.textContent = bits.join(" · ") || "Amostra pequena";
  content.appendChild(meta);
  li.appendChild(content);
  const badge = document.createElement("span");
  badge.className = getDeltaPillClass(entry.delta);
  badge.textContent = formattedDelta ?? "--";
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
            games,
            absDelta,
            matchesSelection,
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
  
  // Filtra matchups com base na visibilidade
  const filtered = uniqueRows.filter((row) => {
    if (row.delta > 2 && !matchupVisibility.favorable) return false;
    if (row.delta < -2 && !matchupVisibility.unfavorable) return false;
    if (row.delta >= -2 && row.delta <= 2 && !matchupVisibility.even) return false;
    return true;
  });
  
  filtered.sort((a, b) => {
    const aValue = Math.abs(a.delta);
    const bValue = Math.abs(b.delta);
    if (bValue !== aValue) return bValue - aValue;
    return (b.games ?? 0) - (a.games ?? 0);
  });
  
  const subset = filtered.slice(0, 8);
  matchupListEl.innerHTML = "";
  subset.forEach((row) => matchupListEl.appendChild(renderMatchupItem(row)));
  decorateChampionNames(matchupListEl);
}

function renderMatchupItem(row) {
  const li = document.createElement("li");
  const content = document.createElement("div");
  const title = document.createElement("strong");
  const allyRoleLabel = row.allyRole && ROLE_LABELS[row.allyRole] ? ` (${ROLE_LABELS[row.allyRole]})` : "";
  const enemyRoleLabel = row.enemyRole && ROLE_LABELS[row.enemyRole] ? ` (${ROLE_LABELS[row.enemyRole]})` : "";
  title.textContent = `${row.ally}${allyRoleLabel} vs ${row.enemy}${enemyRoleLabel}`;
  content.appendChild(title);
  const meta = document.createElement("p");
  meta.className = "muted";
  const bits = [];
  const formattedWR = formatPercent(row.winRate);
  if (formattedWR) bits.push(`WR ${formattedWR}`);
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
  // Limpa bans
  document.querySelectorAll('.ban-group select').forEach((s) => {
    if (s.options.length > 0) s.selectedIndex = 0;
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
      }
    } catch (err) {
      ExternalStats.errors[key] = true;
      console.warn(`Nao foi possivel carregar ${url}:`, err);
    }
  }));
  ExternalStats.loaded = true;
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
