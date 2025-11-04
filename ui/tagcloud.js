/**
 * Normaliza placeholders de selects em português
 */
function localizePlaceholders(scope = document) {
  scope.querySelectorAll('select option:disabled[value=""]').forEach((opt) => {
    if (!opt.textContent || /Selecione/i.test(opt.textContent)) {
      opt.textContent = 'Selecione um Champion';
    }
  });
}

/**
 * Sanitiza contagens e garante o símbolo × (multiplicação) correto
 */
function sanitizeVisibleCounts2() {
  document.querySelectorAll('.tag-cloud .pill, .champ-tags .pill').forEach((pill) => {
    const original = pill.textContent;
    const cleaned = original
      .replace(/Ã×|Ã—/g, '×')
      .replace(/\u00D7/g, '×')
      .replace(/[^\x20-\x7E]-(\d+)/g, ' ×$1');
    if (original !== cleaned) {
      pill.textContent = cleaned;
    }
  });
}

/**
 * Renderiza o Tag Cloud com contagem ×N agrupada por categoria
 * @param {HTMLElement} container - Container onde renderizar
 * @param {Array} tagItems - Array de objetos {category, slug, text}
 */
function renderTagCloudFixed(container, tagItems) {
  container.innerHTML = '';
  
  if (!tagItems.length) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.textContent = 'Nenhum destaque marcado ainda.';
    container.appendChild(empty);
    return;
  }
  
  // Agrupa tags por categoria e conta ocorrências
  const groups = {
    gameplay: new Map(),
    spike: new Map(),
    synergy: new Map(),
    other: new Map()
  };
  
  tagItems.forEach((tag) => {
    const category = groups[tag.category] || groups.other;
    if (!category.has(tag.slug)) {
      category.set(tag.slug, { text: tag.text, count: 0 });
    }
    category.get(tag.slug).count++;
  });
  
  // Configuração de renderização
  const CATEGORY_ORDER = ['gameplay', 'spike', 'synergy', 'other'];
  const CATEGORY_CLASSES = {
    gameplay: 'pill-gameplay',
    spike: 'pill-spike',
    synergy: 'pill-synergy',
    other: ''
  };
  
  const formatCount = (count) => (count > 1 ? ` ×${count}` : '');
  
  // Renderiza cada categoria
  CATEGORY_ORDER.forEach((category) => {
    const bucket = groups[category];
    if (!bucket || bucket.size === 0) return;
    
    const groupEl = document.createElement('div');
    groupEl.className = 'tag-group';
    const entries = Array.from(bucket.entries());
    
    if (category === 'gameplay') {
      // Gameplay: divide em duas linhas
      const mid = Math.ceil(entries.length / 2) || 1;
      const rows = [entries.slice(0, mid), entries.slice(mid)];
      
      rows.forEach((row) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'tag-row';
        row.forEach(([slug, val]) => {
          const pill = createPill(slug, val.text, val.count, CATEGORY_CLASSES[category]);
          rowEl.appendChild(pill);
        });
        groupEl.appendChild(rowEl);
      });
    } else {
      // Outras categorias: uma linha
      entries.forEach(([slug, val]) => {
        const pill = createPill(slug, val.text, val.count, CATEGORY_CLASSES[category]);
        groupEl.appendChild(pill);
      });
    }
    
    container.appendChild(groupEl);
  });
}

/**
 * Cria um elemento pill para tag
 */
function createPill(slug, text, count, categoryClass) {
  const pill = document.createElement('span');
  pill.className = `pill is-active ${categoryClass}`.trim();
  pill.dataset.tag = slug;
  pill.textContent = `${text}${formatCount(count)}`;
  return pill;
}

// Inicializa placeholders ao carregar
document.addEventListener('DOMContentLoaded', () => localizePlaceholders());

