// Helper para normalizar placeholders PT-BR
function localizePlaceholders(scope = document) {
  scope.querySelectorAll('select option:disabled[value=""]').forEach((opt) => {
    if (!opt.textContent || /Selecione/i.test(opt.textContent)) {
      opt.textContent = 'Selecione um Champion';
    }
  });
}

// Sanitiza contagens e garante o símbolo ×
function sanitizeVisibleCounts2() {
  document.querySelectorAll('.tag-cloud .pill, .champ-tags .pill').forEach((pill) => {
    const s = pill.textContent;
    const cleaned = s
      .replace(/Ã×|Ã—/g, '×')
      .replace(/\u00D7/g, '×')
      .replace(/[^\x20-\x7E]-(\d+)/g, ' ×$1');
    if (s !== cleaned) pill.textContent = cleaned;
  });
}

// Renderizador do Tag Cloud com contagem ×N
function renderTagCloudFixed(container, tagItems) {
  container.innerHTML = '';
  if (!tagItems.length) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.textContent = 'Nenhum destaque marcado ainda.';
    container.appendChild(empty);
    return;
  }
  const groups = { gameplay: new Map(), spike: new Map(), synergy: new Map(), other: new Map() };
  for (const t of tagItems) {
    const b = groups[t.category] || groups.other;
    if (!b.has(t.slug)) b.set(t.slug, { text: t.text, count: 0 });
    b.get(t.slug).count++;
  }
  const order = ['gameplay', 'spike', 'synergy', 'other'];
  const cls = { gameplay: 'pill-gameplay', spike: 'pill-spike', synergy: 'pill-synergy', other: '' };
  const cx = (n) => (n > 1 ? ` ×${n}` : '');
  order.forEach((cat) => {
    const bucket = groups[cat];
    if (!bucket || bucket.size === 0) return;
    const groupEl = document.createElement('div');
    groupEl.className = 'tag-group';
    const entries = Array.from(bucket.entries());
    if (cat === 'gameplay') {
      const mid = Math.ceil(entries.length / 2) || 1;
      const rows = [entries.slice(0, mid), entries.slice(mid)];
      rows.forEach((row) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'tag-row';
        row.forEach(([slug, val]) => {
          const pill = document.createElement('span');
          pill.className = `pill is-active ${cls[cat]}`.trim();
          pill.dataset.tag = slug;
          pill.textContent = `${val.text}${cx(val.count)}`;
          rowEl.appendChild(pill);
        });
        groupEl.appendChild(rowEl);
      });
    } else {
      entries.forEach(([slug, val]) => {
        const pill = document.createElement('span');
        pill.className = `pill is-active ${cls[cat]}`.trim();
        pill.dataset.tag = slug;
        pill.textContent = `${val.text}${cx(val.count)}`;
        groupEl.appendChild(pill);
      });
    }
    container.appendChild(groupEl);
  });
}

// Tenta localizar placeholders ao carregar
document.addEventListener('DOMContentLoaded', () => localizePlaceholders());

