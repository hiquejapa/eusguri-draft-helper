---
title: É us guri — Draft Helper
---

# É us guri — Draft Helper (Docs)

**Objetivo:** ferramenta *pré‑jogo* para apoiar picks/bans com base nos **últimos 30 dias**.  
**Público:** grupo privado de amigos. **Não comercial**. **Sem automação in‑game.**

## Pipeline
1. **Resolver contas** do grupo (Riot ID → PUUID via Summoner‑V4).  
2. **Coletar partidas** recentes por PUUID (Match‑V5) — excluir *remakes*.  
3. **Enriquecer** com Data Dragon (nomes, ícones, tags, patch).  
4. (Opcional) **Timeline‑V5** para sinais de lane phase.  
5. **Calcular**:
   - **Sinergia** (duos/trios): comparação com baseline do campeão/time; ponderação por amostra e patch.
   - **Matchups** por rota: WR recente vs campeões enfrentados; tendência por patch.
6. **Gerar recomendações**: priorizar picks fortes; evitar fracos vs. comp do oponente.
7. **Exportar** CSV/JSON e gráficos.

## Ponderação (esboço)
- `peso_amostra = min(1, jogos/50)`  
- `peso_patch = 1.0` para patch atual; `0.6` para patch anterior.  
- **Score de sinergia**: `WR_duo - max(WR_campeao_A, WR_campeao_B)` ajustado por pesos.
- **Score de matchup**: `WR_rota_vs_oponente - WR_baseline_rota` com pesos.

> Os pesos podem ser ajustados via config.

## Filtros
- Fila: Flex/Normal/Clash/Ranked.  
- Região: `REGIONS`.  
- Patch: atual / anterior.

## Saídas
- `out/synergy.csv` – *duo*, *trio*, `score`, `amostra`, `patch`.  
- `out/matchups.csv` – *rota*, *vs*, `wr`, `tendencia`, `amostra`.  
- `out/recs.csv` – recomendações por lado/ban/pick.

## Compliance
- Respeito a **rate limits**, **regional routing**, **cache** (seguir política Riot).  
- Sem **Spectator**. Sem sobreposição de UI in‑game.  
- Dados pessoais: apenas identificadores públicos.

---

*Add screenshots in* `docs/assets/` *and link them here.*
