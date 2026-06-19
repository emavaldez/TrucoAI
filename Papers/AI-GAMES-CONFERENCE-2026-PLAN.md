# AI and Games Conference 2026 — Plan de Postulación y Paper

**Fecha del evento:** 10-11 de Noviembre 2026, Here East, Queen Elizabeth Olympic Park, Londres
**Fecha límite de submissions:** 3 de Agosto 2026
**Tasa de aceptación 2025:** 35% (competencia creciente)
**Sitio:** https://www.aiandgamesconference.com
**Organizador:** Dr. Tommy Thompson (Game AI Events CIC)

---

## 1. RESUMEN EJECUTIVO

El paper propone presentar TrucoAI como estudio de caso de cómo aplicar técnicas
de vanguardia (CFR, Deep RL, Theory of Mind) a juegos de cartas culturalmente
específicos de Latinoamérica, un área completamente ignorada por la investigación
de Game AI. La charla combinaría la implementación práctica de un juego funcional
con un análisis académico riguroso, posicionándose como puente entre la industria
y la academia.

---

## 2. PROPUESTA DE TÍTULOS (orden de preferencia)

### Opción A — Enfoque técnico-industrial
**"Building AI for Latin American Card Games: From Heuristics to CFR in Truco"**

### Opción B — Enfoque cultural + técnico
**"Culturally-Aware Game AI: Teaching Machines to Bluff at Truco"**

### Opción C — Enfoque aplicado
**"AI for Imperfect Information Games Beyond Poker: Lessons from Truco"**

### Opción D — Enfoque industry-case-study
**"Real-World Game AI Development: Building, Testing, and Deploying AI Opponents for a Multiplayer Card Game"**

**Recomendación:** Opción A o C. Son los que mejor encajan con el tono de la
conferencia (práctico, industry-focused, sin hype).

---

## 3. ESTRUCTURA DEL PAPER / CHARLA (30 min talk)

### 3.1 Abstract (para submission)

> We present TrucoAI, an open-source implementation of Argentine Truco — a 40-card
> trick-taking game played by millions across Latin America — with AI opponents
> powered by a progression of techniques from rule-based heuristics to
> Counterfactual Regret Minimization (CFR). Unlike Poker, Truco features
> culturally-specific betting mechanics (Envido), multi-player team dynamics
> (2v2, 3v3), and a unique positive-sum structure that challenges standard
> game-theoretic approaches. We document our journey from a heuristic AI baseline
> achieving ~40% win rate against experienced players to exploring CFR variants
> informed by recent research, including a 2023 Uruguayan thesis demonstrating
> 59% human-level performance with ES-MCCFR. We share practical lessons on
> game simulation, action abstraction, testing methodologies for rule-heavy
> games, and the unique challenges of building AI for culturally-specific
> game domains that lack established benchmarks.

### 3.2 Estructura de la charla

**Segmento 1 — The Problem Space (5 min)**
- What is Truco? Why is it interesting for AI research?
- Compare to Poker: trick-taking vs. betting rounds, team dynamics, positive-sum
- Cultural significance: 400M+ Spanish speakers, social fabric of Latin America
- Gap in literature: 2 papers specifically on Truco AI (both simplistic)

**Segmento 2 — The Implementation Journey (8 min)**
- Architecture decisions: TypeScript/Vite, 2D DOM, modular game engine
- Supporting 2/4/6 players with Pica-Pica variant
- Rule engine complexity: Truco/Retruco/Vale4, Envido scoring, dealer rotation
- The QA challenge: building a 700-line automated test suite for rule validation
- Show gameplay demo / video

**Segmento 3 — AI Techniques Applied (10 min)**
- **Baseline 1: Rule-based heuristics** — what works, what doesn't, 40% WR
- **Baseline 2: CardEvaluator** — hand strength, win probability estimation
- **Research: Why CFR?** — comparison table of approaches (CFR, NFSP, PSRO, ReBeL, LLM+ToM)
- **The Truco challenge:** positive-sum structure (CFR+ doesn't work), need for ES-MCCFR
- **Key insight from Uruguayan thesis:** 59% WR with External Sampling MCCFR + Unsafe Search
- **Proposed path:** ES-MCCFR → Deep CFR → optional LLM/ToM for betting decisions
- Show training pipeline diagram

**Segmento 4 — Lessons for Industry (5 min)**
- What games like Truco teach us about culturally-aware AI
- The testing problem: why rule-heavy games need automated QA
- Scaling from 2 to 6 players: exponential state space growth
- Practical deployment: browser-based, no GPU required for heuristic AI
- How this connects to broader game AI trends (cf. Soccer Kids MCTS talk at 2024)

**Segmento 5 — Q&A / Discussion (2 min)**
- Call to action: contribute to open-source TrucoAI
- Broader implications for non-English game markets

---

## 4. RESUMEN DE CONFERENCIAS PASADAS

### 4.1 AI and Games Conference 2024 (Primera edición)

**Charlas (17+):**

| Charla | Empresa/Tema | Lo que se puede tomar |
|--------|-------------|----------------------|
| Human-level MCTS AI bots in Soccer Kids | Acid Wizard / MCTS | **MUY RELEVANTE** — MCTS en juego deportivo indie. Metodología similar |
| Designing Flying and Swimming AI for Horizon Forbidden West | Guerrilla Games | AI para movimiento en 3D, pathfinding complejo |
| HTN Planning in the Decima Engine | Guerrilla Games | Planificación jerárquica para NPCs |
| Space Marine 2: The AI Post-Mortem | Saber Interactive | Post-mortem de AI shipping real |
| RL Agent Training is Property-Based Testing | Academia/Industria | Testing de RL agents — **relevante para nuestro QA approach** |
| Empowering Game Designers with Automatic Playtesting | Academia | Auto-playtesting — **aplicable a TrucoAI** |
| Learning to Play, Imitate and Collaborate with Pesky Humans | Academia | Human-AI interaction, imitation learning |
| The AI Settlement Generation Challenge in Minecraft | Academia | Generative AI procedural |
| AgentMerge: Enhancing Battlefield Issue Management with LLMs | Militar/Industria | LLMs para gestión de agentes |
| Narrative-Driven Generation: Story to Game World using LLMs | Indie | Generación procedural con LLMs |
| LLMs in Games (Escape the Infinite Mid) | Variedad | Uso práctico de LLMs en games |
| Learning Agents in Unreal Engine | Epic Games | Agentes de ML en UE |
| Avalon: Improving Validation of Match-3 Level Generation | Industria | Validación de level generation |
| Tethering Agents for the Greater Good | Academia | Multi-agent cooperation |
| Analytic Geometry Is Your Friend | Indie | Matemáticas aplicadas a games |
| Navigating AI and IP: A Practical Toolkit | Legal | Legalidad de AI en games |
| AI and the Law | Legal | Regulación |

**Patrones 2024:**
- Heavy focus on LLMs in games (3+ talks)
- Several post-mortems from AAA studios
- Academic/industry bridge talks
- Legal/IP considerations emerging topic

### 4.2 AI and Games Conference 2025 (Segunda edición)

| Charla | Empresa/Tema | Lo que se puede tomar |
|--------|-------------|----------------------|
| Design for everything in Kingdom Come: Deliverance II | Warhorse Studios | Diseño holístico de AI para RPG |
| Predicting Combat Outcomes in Total War | Creative Assembly | **RELEVANTE** — predicción ML en estrategia |
| When Research Meets Release Dates | Academia+Industria | Gap entre research y shipping |
| Debugging Across Time and Platforms: The Power of Determinism | Industria | Debugging de AI multi-plataforma |
| One Trillion Parameters and No Plans | Academia | Limites de LLMs en games |
| No API. No Problem: Deploying tiny, fast, fine-tuned models offline | Indie/Industria | **RELEVANTE** — modelos sin GPU/cloud |
| Optimizing Small Language Models for Game Applications on AWS | AWS | Deployment de modelos pequeños |
| RL for Learning at Agents at Scale | Industria | RL a escala productiva |
| Rain World: An AI Post-Mortem | Videocult | Post-mortem de AI emergente |

**Patrones 2025:**
- Shift toward practical deployment (offline models, small models)
- RL at scale becoming production-ready
- Continued interest in post-mortems
- More academic rigor in talks

### 4.3 Lo que la conferencia VALORA

Basado en los 2 años de talks:
1. **POST-MORTEMS reales** — qué funcionó, qué no, con datos
2. **Aplicaciones prácticas** — no solo teoría, mostrar código/results
3. **Industria + Academia** — bridges entre los dos mundos
4. **Técnicas específicas** — deep dives en un algoritmo/sistema
5. **NO hype** — explícitamente anti-hype. "No hype. No nonsense. Real insights."
6. **Indie-friendly** — no solo AAA. Acid Wizard (Soccer Kids) es indie
7. **Testing y deployment** — cómo shipping real funciona

### 4.4 Charla más relevante para nosotros

**"Human-level MCTS AI bots in Soccer Kids" (2024)**
- Juego indie de fútbol con MCTS
- Muy similar a nuestro approach: juego cultural, técnicas de search, indie
- Podemos citarla y contrastar con nuestro enfoque CFR

**"RL Agent Training is Property-Based Testing" (2024)**
- Testing de agentes RL con property-based testing
- Directamente aplicable a nuestro QA suite de 700 líneas

**"No API. No Problem: Deploying tiny, fast, fine-tuned models offline" (2025)**
- Deploy de modelos sin GPU — relevante para TrucoAI que corre en browser

---

## 5. CÓMO PREPARARSE Y CONSEGUIR TRABAJO EN LA INDUSTRIA

### 5.1 Timeline de preparación para la conferencia

| Fecha | Acción |
|-------|--------|
| Jun 2026 | Definir ángulo del paper, empezar a entrenar modelos CFR |
| Jul 2026 | Escribir draft del paper, crear slides/demos |
| **3 Ago 2026** | **Deadline de submissions** |
| Ago-Sep 2026 | Si se acepta: preparar talk, grabar demo video |
| Oct 2026 | Ensayar talk, preparar materiales |
| **10-11 Nov 2026** | **CONFERENCIA** |

### 5.2 Cómo prepararse para la submission

1. **Crear el modelo CFR funcional** — al menos ES-MCCFR 2-jugadores con abstracción A1
   - Sin esto, la submission es solo "tenemos un juego bonito"
   - Necesitás resultados cuantitativos: win rates, convergencia, comparación

2. **Documentar el journey** — la conferencia valora "when research meets release dates"
   - Screenshots del proceso, commits, bugs encontrados
   - Datos: "pasamos de 40% a X% WR con Y técnica"

3. **Crear una demo funcional online** — deployar TrucoAI en Vercel
   - Los reviewers van a probar el juego
   - Debe funcionar y ser jugable

4. **Grabar un video corto** (2-3 min) — gameplay + AI en acción
   - Para incluir en la submission
   - Mostrar el AI ganando/partiendo contra humanos

5. **Escribir el paper en inglés** — la conferencia es en Londres
   - Usar nuestro INVESTIGACION.md como base
   - Adaptar a formato de charla de 30 min (no paper académico)

### 5.3 Cómo conseguir trabajo en la industria de Game AI

#### A. Networking en la conferencia
- **Asistir a los 2 días completos** — el networking es tan valioso como las charlas
- **Hablar con los speakers** — preguntar sobre positions, referrals
- **Companies que van:** Creative Assembly, EA, Epic, Riot, Sony AI, Ubisoft, AWS, Unity, Databricks
- **Traer tarjetas** — con link a TrucoAI GitHub + LinkedIn
- **Presentar el proyecto casualmente** — "I built an AI for an Argentine card game using CFR"
- **Unirse al Discord de AI and Games** — comunidad activa year-round

#### B. Portfolio visible
- **TrucoAI en GitHub** — bien documentado, con README, live demo
- **Paper/charla en la conferencia** — credibilidad inmediata
- **Blog posts** — publicar en AI and Games Newsletter (Tommy acepta contributions)
- **LinkedIn posts** — documentar el journey CFR training
- **Twitter/Bluesky** — tagging @AIandGames, @TommyThompson

#### C. Skills que la industria busca (según las charlas)
1. **Game AI programming** — behavior trees, HTN, GOAP, utility AI
2. **ML/RL for games** — CFR, policy gradients, self-play
3. **LLMs in games** — NPC dialogue, procedural content
4. **Testing/QA for AI** — property-based testing, automated playtesting
5. **Deployment optimization** — offline models, quantization, edge inference
6. **Multi-agent systems** — coordination, communication, emergent behavior

#### D. Empresas target (que estuvieron en la conferencia)
- **Creative Assembly** (Total War) — strategy AI, ML prediction
- **Guerrilla Games** (Horizon) — movement AI, pathfinding
- **Riot Games** — competitive AI, matchmaking
- **Saber Interactive** (Space Marine) — combat AI
- **Warhorse Studios** (Kingdom Come) — open-world AI
- **Ubisoft** — large-scale AI systems
- **Sony AI** — research-focused
- **Epic Games** — Unreal Engine AI tools
- **AWS for Games** — cloud-based AI services

#### E. Plan de acción concreto para conseguir trabajo

1. **Ahora (Jun-Jul):** Completar CFR baseline para TrucoAI, tener 65%+ WR
2. **Agosto:** Submeter a la conference
3. **Si se acepta (Sep-Oct):** Preparar charla, hacer networking pre-evento
4. **Nov (conferencia):** Asistir, hablar con companies, intercambiar contactos
5. **Post-conferencia:** Follow up con contactos, aplicar a positions
6. **Ongoing:** Publicar blog posts, contribuir a la comunidad AI+Games

#### F. Recursos adicionales
- **AI and Games Discord** — comunidad con job postings
- **Game AI Conference Slack** (si existe post-evento)
- **LinkedIn Group:** "Game AI Developers"
- **GDC AI Summit** (Marzo, San Francisco) — la otra gran conferencia
- **IEEE CoG** (Conference on Games) — más académico
- **AAAI AIIDE** (AI and Interactive Digital Entertainment) — académico

---

## 6. ANÁLISIS: QUÉ ESTUDIAR DE LAS CHARLAS PASADAS

### Temas técnicos para profundizar

1. **MCTS en juegos reales** (ver Soccer Kids talk)
   - Cómo MCTS se adapta a juegos con hidden info
   - Comparar con nuestro approach CFR

2. **Testing de AI agents** (ver RL Property-Based Testing talk)
   - Aplicar a TrucoAI QA suite
   - Property-based testing para game rules

3. **Small models offline** (ver "No API. No Problem")
   - Entrenar modelo pequeño que corra en browser
   - Quantization para deployment edge

4. **RL at scale** (ver "RL for Learning at Agents at Scale")
   - Lecciones de producción
   - Cómo escalar训练 sin GPU masivo

5. **Post-mortems** (Space Marine 2, Rain World, KCD2)
   - Patrones de success/failure
   - Cómo documentar nuestro propio post-mortem

6. **LLMs en games** (varias charlas 2024)
   - Uso real vs hype
   - Theory of Mind para bluffing (directamente aplicable a Truco)

### Papers/Investigación complementaria

- **SoccerRef-Agents** (2026) — multi-agent para referee en fútbol
- **MARL-GPT** (2026) — foundation model para MARL
- **Google Research Football** — platform para experimentos RL en fútbol
- **DouZero** — self-play para juego de cartas chino (similar a Truco)

---

## 7. PRÓXIMOS PASOS INMEDIATOS

- [ ] Crear README.md para TrucoAI (no existe actualmente)
- [ ] Deployar TrucoAI en Vercel para demo online
- [ ] Implementar ES-MCCFR baseline en Python (Fase 1-2 del plan)
- [ ] Crear video demo de 2-3 min
- [ ] Empezar a escribir el paper en inglés
- [ ] Subscribirse al AI and Games Newsletter premium (para discount code)
- [ ] Unirse al Discord de AI and Games
- [ ] Seguir a Tommy Thompson en Bluesky/Twitter
- [ ] Registrar en aiandgamesconference.com para updates
