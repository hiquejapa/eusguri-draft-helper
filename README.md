# É us guri — Draft Helper

**PT-BR | EN below**

> Ferramenta *pre-game* para ajudar um grupo privado de amigos a decidir **picks/bans** com base nos **últimos 30 dias** de partidas. Calcula **sinergia entre campeões** (positiva/negativa) e **matchups por rota** (favoráveis/desfavoráveis). **Sem automação in‑game.**

<p align="center">
  <img alt="LoL" src="https://img.shields.io/badge/Game-League%20of%20Legends-8b5cf6">
  <img alt="Status" src="https://img.shields.io/badge/status-alpha-orange">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

## ✨ Funcionalidades
- 📊 **Sinergia de campeões** (duos/trios) ponderada por amostra e patch.
- ⚔️ **Matchups por rota** com taxa de vitória e tendência recente (30 dias).
- 🎯 **Recomendações de draft** (priorize X; evite Y contra Z).
- 🔎 **Filtros** por fila (Flex/Normal/Clash/Ranked), região e patch.
- 🧰 **Data Dragon** para dados estáticos (nomes, ícones, tags, patch).

> **Escopo e compliance:** uso **não comercial**, **grupo privado**, **pré‑jogo** (sem automação em tempo real). Respeita *rate limits*, *regional routing* e *caching* conforme a Riot.

---

## 🚀 Como rodar (local)
1) **Clone** o repositório:
```bash
git clone https://github.com/SEU_USUARIO/eusguri-draft-helper.git
cd eusguri-draft-helper
```

2) **Crie o ambiente** e instale dependências (exemplo Python):
```bash
python -m venv .venv
# Windows PowerShell
. .venv/Scripts/Activate.ps1
# Linux/Mac
source .venv/bin/activate

pip install -r requirements.txt
```

3) **Configure variáveis de ambiente**:
- Copie `.env.example` para `.env` e preencha:
  - `RIOT_API_KEY` → sua chave da Riot
  - `REGIONS` → ex.: `br1, eune1, euw1, jp1, kr, la1, la2, na1`
  - `PLATFORMS` → ex.: `americas, europe, asia` (roteamento para Match-V5)
  - `WINDOW_DAYS=30`

4) **Execute** (exemplo CLI fictícia):
```bash
python -m eusguri.cli --riot-api-key $RIOT_API_KEY --regions br1,euw1 --window-days 30 --output out/
```
Os relatórios CSV/JSON são gravados em `out/` (sinergias, matchups, recomendações).

---

## 🧩 APIs usadas
- **Match-V5**: histórico recente por **PUUID** + estatísticas por partida.
- **(Opcional) Match Timeline-V5**: métricas da fase de rotas.
- **Summoner-V4**: resolver **Riot ID → PUUID** e validar contas do grupo.
- **(Opcional) Champion-Mastery-V4**: “comfort picks” do time.
- **Data Dragon**: dados estáticos (campeões, ícones, patches).

> ⚠️ Não usamos **Spectator** nem automação in‑game.

---

## 🧠 Como calculamos (resumo)
- Janela móvel de **30 dias**, ignorando partidas *remake*.
- Ponderação por **amostra** e por **patch** (peso menor para patch anterior).
- **Sinergia**: WR de duos/trios vs. baseline global do campeão e do time.
- **Matchups**: WR por rota considerando campeões enfrentados e lane phase.
- **Recomendações**: regras simples (“se X sinergia ↑ e Y matchup ↓, priorize …”).

> Detalhes no arquivo [`docs/index.md`](docs/index.md).

---

## 📸 Prints (placeholders)
Adicione imagens reais em `docs/assets/` e referencie-as aqui.

- Dashboard Sinergias – `docs/assets/synergy.png`
- Tabela Matchups – `docs/assets/matchups.png`

---

## 🔐 Privacidade & Compliance
- Processa apenas **identificadores públicos** (Riot ID / PUUID).  
- Dados armazenados localmente por no máx. **30 dias** (configurável).  
- Remoção sob solicitação.  
- Consulte [`PRIVACY.md`](PRIVACY.md).

---

## 🛠️ Roadmap
- [ ] Interface web (Streamlit/Next).
- [ ] Exportar gráficos (PNG/CSV).
- [ ] Pesos dinâmicos por fila/elo.
- [ ] Perfis de time com conforto/banlist.

---

## 🤝 Contribuindo
1. Abra uma *issue* descrevendo o que deseja mudar.  
2. Faça *fork* + *branch*.  
3. Abra um *pull request* com prints se for UI.

Leia [`SECURITY.md`](SECURITY.md) para reportar vulnerabilidades.

---

## 📄 Licença
MIT – veja [`LICENSE`](LICENSE).

---

## 🇬🇧 English (summary)
**Pre‑game draft assistant** for a small private group. It analyzes **last 30 days** to compute **champion synergy** and **lane matchups**, offering simple **pick/ban suggestions**. **No in‑game automation.**

**APIs:** Match‑V5 (and optional Timeline), Summoner‑V4, optional Champion‑Mastery‑V4, and Data Dragon.  
**Privacy/Compliance:** non‑commercial, private group; respects rate limits and routing; only public identifiers; local retention window.

For details, see [`docs/index.md`](docs/index.md).
