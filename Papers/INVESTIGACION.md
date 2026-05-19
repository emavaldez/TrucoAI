# Investigación: IA para Truco — Juegos de Información Imperfecta

**Fecha:** 19/05/2026
**Estado:** En progreso
**Próxima revisión:** Semanal

---

## Índice

1. [Taxonomía de enfoques](#1-taxonomía-de-enfoques)
2. [Papers analizados](#2-papers-analizados)
   - 2.1 [Papers específicos de Truco](#21-papers-específicos-de-truco)
   - 2.2 [CFR y variantes](#22-cfr-y-variantes)
   - 2.3 [Poker AI: los benchmarks de la industria](#23-poker-ai-los-benchmarks-de-la-industria)
   - 2.4 [Deep RL + Game Theory](#24-deep-rl--game-theory)
   - 2.5 [Model-based RL + Search](#25-model-based-rl--search)
   - 2.6 [LLMs + Theory of Mind para juegos](#26-llms--theory-of-mind-para-juegos)
   - 2.7 [Otros juegos de cartas (Bridge, DouDiZhu, etc.)](#27-otros-juegos-de-cartas)
3. [Análisis comparativo](#3-análisis-comparativo)
4. [Decisiones y justificaciones](#4-decisiones-y-justificaciones)
5. [Plan de acción refinado](#5-plan-de-acción-refinado)
6. [Papers faltantes por bajar](#6-papers-faltantes-por-bajar)

---

## 1. Taxonomía de enfoques

Para resolver juegos de información imperfecta como el Truco, existen 5 grandes familias de técnicas, ordenadas de más tradicional a más moderna:

### A. Búsqueda y algoritmos clásicos
- Minimax con poda alfa-beta (solo para info perfecta)
- Monte Carlo Tree Search (MCTS) — funciona pero no converge a Nash en info imperfecta
- **Útil como baseline, no como solución principal**

### B. Counterfactual Regret Minimization (CFR) y variantes
**El caballo de batalla de la industria.** Todos los AIs de poker que derrotaron humanos usan CFR o derivados.

| Variante | Descripción | Cuándo usarla |
|----------|-------------|---------------|
| CFR (Zinkevich 2007) | Algoritmo original. Recorrido completo del árbol | Solo juegos chicos |
| CFR+ (Tammelin 2014) | Versión más rápida con linear weighting | Juegos medianos, suma cero |
| MCCFR (Lanctot 2009) | Muestreo en vez de recorrido completo | Juegos grandes |
| ES-MCCFR | External Sampling MCCFR | **La mejor variante para Truco según tesis uruguaya** |
| OS-MCCFR | Output Sampling MCCFR | Más memory-efficient pero peores resultados |
| DCFR (Brown 2019) | Deep CFR — redes en vez de tablas | **Escala a juegos enormes sin abstracción manual** |
| SD-CFR (2020) | Single Deep CFR — solo 1 red | Más eficiente que DCFR |

### C. Deep Reinforcement Learning + Game Theory
- **NFSP** (Heinrich & Silver 2016): Neural Fictitious Self-Play — primer deep RL que converge a Nash
- **PSRO** (Lanctot 2017): Policy Space Response Oracles — marco general para MARL con teoría de juegos
- **Deep Monte Carlo** (Sutton & Barto + redes): La tesis uruguaya lo probó, solo 55% WR

### D. Model-based RL + Search
- **AlphaZero** (Silver 2017): RL + MCTS — solo info perfecta
- **MuZero** (Schrittwieser 2019): Planifica con modelo aprendido — info perfecta
- **ReBeL** (Brown 2020): **El santo grial para info imperfecta.** RL + search con Public Belief States. Superhumano en poker sin conocimiento de dominio.

### E. LLMs + Theory of Mind
- **Suspicion-Agent** (Guo 2024): GPT-4 + ToM para juegos de cartas con información imperfecta
- **CICERO** (FAIR 2022): LLM + planificación estratégica para Diplomacy — primer agente en nivel humano
- **Guandan-ToM** (Yim 2024): LLMs + ToM para juegos cooperativos con info imperfecta

---

## 2. Papers analizados

### 2.1 Papers específicos de Truco

#### P1: "An Artificial Intelligence approach to solve the Truco Game"
- **Autores:** Baba Renato, Nayan Ramani, David Kingbo (Stanford CS221, 2017)
- **Enfoque:** Q-Learning + MDP
- **Fortalezas:** Primer intento documentado. Modela Truco como MDP. Resultados preliminares.
- **Debilidades:** Simplificación enorme del juego (deck fijo, sin envido real). Solo 1,000 iteraciones. No escala.
- **Conclusión:** Proyecto académico de un cuatrimestre. No sirve como base para un agente competitivo.
- **📁 Ya en carpeta**

#### P2: "A Markovian model for the Game of Truco"
- **Autores:** Rossato, Silva, Assunção (UFSM, Brasil, SBGames 2020)
- **Enfoque:** Cadena de Markov para Truco Gaúcho
- **Fortalezas:** Ligero, corre en cualquier máquina. Aprende en cada acción. Bueno para plataformas básicas.
- **Debilidades:** Solo 28% win rate contra agentes rule-based. Muy simplificado. No captura bluff ni interacciones complejas.
- **Conclusión:** Es útil como baseline o para primeras etapas del juego, pero no como solución final.
- **📁 Ya en carpeta**

#### P3: "Approximating Nash equilibria for Uruguayan Truco" (TESIS)
- **Autor:** Juan-Pablo Filevich (UdelaR, 2023) — 162 páginas
- **Enfoque:** CFR, MCCFR, DMC. Implementado en Go.
- **Resultados CLAVE:**
  - ES-MCCFR fue la mejor variante
  - 2 semanas de entrenamiento, 64-72 GiB RAM
  - 91% WR vs random, 70% vs determinista, 59% vs humano
  - Deep Monte Carlo solo 55% — inferior a CFR
  - Abstracciones: A1 (3 buckets) → A2 (7) → Z0 (ninguna). Trading exponencial entre granularidad y memoria
  - **Unsafe Search:** rollouts Monte Carlo en tiempo de juego. A1 pasó de 37% a 53% WR
  - CFR+ no funcionó bien — Truco es suma positiva, no suma cero
  - **T1K22 Dataset:** 79,000 manos aleatorias para evaluación
  - **D-Index:** Métrica de racionalidad específica para Truco
- **Conclusión:** **El paper más relevante.** Implementa todo lo que necesitamos y documenta qué funciona y qué no.
- **📁 Ya en carpeta (x2: el paper y Fi23.pdf que es duplicado)**

#### P4: "Policy-Based Reinforcement Learning Approach in Imperfect Information Card Game"
- **Autores:** Chrustowski, Duch (2025, Applied Sciences)
- **Enfoque:** REINFORCE customizado con β parameter (prioriza manos valiosas)
- **Juego:** "Thousand" (trick-taking, similar a Truco en estructura)
- **Resultados:** 65% vs random, 55% vs alpha-beta depth 6
- **Aportes:** Off-policy experience replay + importance weighting. Preentrenamiento para evitar acciones inválidas.
- **Conclusión:** Buen paper de referencia para policy gradients en trick-taking. No tan bueno como CFR pero más simple de implementar.
- **📁 Ya en carpeta**

---

### 2.2 CFR y variantes

#### P5: "Regret Minimization in Games with Incomplete Information" (CFR Original)
- **Autores:** Zinkevich, Johanson, Bowling, Crick, Freeman, Pickett, Schaeffer, Burch, Szafron (NIPS 2007)
- **Aporte FUNDACIONAL:** Introduce Counterfactual Regret. Demostración de convergencia a Nash en juegos de suma cero con info imperfecta.
- **Idea clave:** Cada infoset mantiene regret acumulado. La policy se actualiza con Regret Matching. La estrategia promedio converge al equilibrio.
- **Impacto:** ~2,500+ citas. Base de todos los AIs de poker.
- **⚠️ No está en carpeta — hay que bajarlo**

#### P6: "Monte Carlo Sampling for Regret Minimization in Extensive Games" (MCCFR)
- **Autores:** Lanctot, Waugh, Zinkevich, Bowling (NIPS 2009)
- **Aporte:** Muestreo estocástico en vez de recorrer todo el árbol de juego. Hace CFR viable en juegos grandes.
- **Variantes:** External Sampling (ES-MCCFR), Outcome Sampling (OS-MCCFR)
- **Impacto:** ES-MCCFR usado en Libratus, DeepStack, y recomendado por la tesis uruguaya.
- **⚠️ No está en carpeta**

#### P7: "Solving Heads-Up Limit Texas Hold'em Poker" (CFR+)
- **Autores:** Bowling, Burch, Johanson, Tammelin (Science 2015)
- **Aporte:** CFR+ resuelve el poker limit — juego esencialmente "resuelto" con exploitability < 1 mbb/g
- **Técnica:** CFR+ con linear weighting y warm start. Convergencia mucho más rápida.
- **⚠️ No está en carpeta**

#### P8: "Deep Counterfactual Regret Minimization" (Deep CFR)
- **Autores:** Brown, Lerer, Gross, Sandholm (ICML 2019)
- **Aporte:** Redes neuronales reemplazan tablas de regret/strategy. Elimina necesidad de abstracción manual.
- **Arquitectura:** Red de valor (aproxima regret) + red de policy (promedio ponderado de iteraciones).
- **⚠️ Ya en carpeta (también en Papers Truco/)**

#### P9: "Single Deep Counterfactual Regret Minimization" (SD-CFR)
- **Autores:** Anónimos (ICLR 2020 under review)
- **Aporte:** Elimina la red de policy promedio. Solo entrena la red de valor. Menos error de aproximación.
- **Resultados:** Mejor exploitability que Deep CFR en poker. Más eficiente.
- **⚠️ Ya en carpeta**

---

### 2.3 Poker AI: los benchmarks de la industria

#### P10: "Heads-up limit hold'em poker is solved" (Cepheus)
- **Autores:** Bowling, Burch, Johanson, Tammelin (Science 2015)
- **Logro:** Primer juego de poker "resuelto" — CFR+ con 11,000 CPUs-año de cómputo
- **Conclusión para Truco:** Demuestra que CFR+ es viable para juegos grandes pero requieren cómputo masivo.

#### P11: "DeepStack: Expert-level artificial intelligence in heads-up no-limit poker"
- **Autores:** Moravčík, Schmid, Burch, Lisý, Morrill, Bard, Davis, Waugh, Johanson, Bowling (Science 2017)
- **Logro:** Primer AI en derrotar profesionales en No-Limit Texas Hold'em
- **Técnica:** CFR + Deep Learning + continual re-solving de subjuegos
- **Innovación:** Value network entrenada en Public Belief States. Uso de "continual re-solving" para evitar recorrer todo el árbol.
- **⚠️ No está en carpeta**

#### P12: "Superhuman AI for heads-up no-limit poker: Libratus beats top professionals"
- **Autores:** Brown, Sandholm (Science 2018)
- **Logro:** Libratus derrota a 4 profesionales top en HUNL (20 días, 120,000 manos)
- **Técnica:** CFR + abstraction + nested subgame solving. Self-play con blueprint + subtask solving en tiempo de juego.
- **Innovación:** Safe and nested subgame solving (1705.02955). Action abstraction dinámica.
- **⚠️ No está en carpeta**

#### P13: "Superhuman AI for multiplayer poker" (Pluribus)
- **Autores:** Brown, Sandholm (Science 2019)
- **Logro:** Primer AI superhumano en poker MULTIJUGADOR (6 players)
- **Técnica:** CFR + blueprint + depth-limited search con blueprint population en leaf nodes
- **Importancia para Truco:** Truco es multi-jugador (2-6). Pluribus demuestra que CFR escala a multi-jugador.
- **⚠️ No está en carpeta**

#### P14: "Combining Deep Reinforcement Learning and Search for Imperfect-Information Games" (ReBeL)
- **Autores:** Brown, Bakhtin, Lerer, Gong (Facebook AI, NeurIPS 2020)
- **Logro:** Marco general RL+Search para info imperfecta. Superhumano en poker sin conocimiento de dominio.
- **Técnica:** Public Belief States + self-play RL + search. Generalización de AlphaZero a info imperfecta.
- **Arquitectura:** Policy network + Value network entrenadas con self-play. Search en PBS durante training y test.
- **⚠️ Ya en carpeta**

---

### 2.4 Deep RL + Game Theory

#### P15: "Deep Reinforcement Learning from Self-Play in Imperfect-Information Games" (NFSP)
- **Autores:** Heinrich, Silver (2016)
- **Enfoque:** Neural Fictitious Self-Play. Combina deep RL con fictitious play.
- **Arquitectura:** Agente RL (DQN para best response) + Agente SL (supervised learning para average strategy)
- **Resultados:** Nash equilibrium en Leduc poker. Aproxima rendimiento de superhumanos en Limit Hold'em.
- **Limitación:** No tan bueno como CFR puro para equilibrio perfecto.
- **⚠️ No está en carpeta (verificado: arXiv:1603.01121)**

#### P16: "A Unified Game-Theoretic Approach to Multiagent Reinforcement Learning" (PSRO)
- **Autores:** Lanctot, Zambaldi, Gruslys, Lazaridou, Tuyls, Perolat, Silver, Graepel (NIPS 2017)
- **Enfoque:** Policy Space Response Oracles. Generaliza Fictitious Play, Double Oracle, e InRL.
- **Arquitectura:** Population de policies. Meta-solver (Nash/PRD) selecciona combinación óptima.
- **Importancia:** Marco teórico unificado. Escalable. Puede combinarse con deep RL.
- **⚠️ Verificado en arXiv:1711.00832**

---

### 2.5 Model-based RL + Search

#### P17: "Mastering Atari, Go, Chess and Shogi by Planning with a Learned Model" (MuZero)
- **Autores:** Schrittwieser, Antonoglou, Hubert, et al. (DeepMind, Nature 2020)
- **Enfoque:** Model-based RL. Aprende modelo de dinámica del entorno (reward, policy, value) sin conocer las reglas.
- **Planificación:** MCTS con el modelo aprendido. Superhumano en Go, chess, shogi, Atari.
- **Limitación:** Solo funciona para info perfecta/no estratégica. No converge a Nash en info imperfecta.
- **⚠️ No está en carpeta (arXiv:1911.08265)**

---

### 2.6 LLMs + Theory of Mind para juegos

#### P18: "Suspicion-Agent: Playing Imperfect Information Games with Theory of Mind Aware GPT-4"
- **Autores:** Guo, Yang, Yoo, Lin, Iwasawa, Matsuo (COLM 2024)
- **Enfoque:** GPT-4 con Theory of Mind para juegos de info imperfecta
- **Arquitectura:** Observation interpreter → ToM planning (1st/2nd order) → Action selection
- **Resultados:** Comparable a algoritmos tradicionales en Leduc Hold'em. No supera Nash equilibrium.
- **Fortaleza:** Sin entrenamiento — funciona con solo rules + prompts. Bueno para bluff y adaptación.
- **⚠️ Ya en carpeta (arXiv:2309.17277)**

#### P19: "Human-level play in the game of Diplomacy by combining language models with strategic reasoning" (CICERO)
- **Autores:** FAIR (Meta), Science 2022
- **Logro:** Primer agente en nivel humano en Diplomacy (7 jugadores, negociación, alianzas)
- **Técnica:** LM (diálogo) + planning module (RL + search). Procesa NL y genera planes estratégicos.
- **Importancia:** Demuestra que LLM + planificación estratégica funciona en juegos complejos de info imperfecta.

#### P20: "Evaluating and Enhancing LLMs Agent Based on Theory of Mind in Guandan"
- **Autores:** Yim, Chan, Shi, Deng, Fan, Zheng, Song (2024)
- **Enfoque:** ToM planning para LLMs en Guandan (juego de cartas chino, 4 players, cooperativo)
- **Técnica:** RL action recommender + ToM prompts. First-order y second-order ToM.
- **Resultados:** ToM consistentemente mejora performance. No supera RL puro (Danzero+).
- **⚠️ Ya en carpeta**

---

### 2.7 Otros juegos de cartas

#### P21: "DouZero: Mastering DouDizhu with Self-Play Deep Reinforcement Learning"
- **Autores:** Zhao et al. (2021)
- **Juego:** DouDiZhu (斗地主) — juego de cartas con 3 jugadores, info imperfecta, similar a Truco en complejidad
- **Enfoque:** Deep Monte Carlo + self-play. Sin búsqueda en tiempo de juego.
- **Resultados:** Superhumano. Primer AI en vencer a humanos en DouDiZhu.
- **Relevancia:** Demuestra que DMC + self-play puede funcionar sin search tree.

#### P22: "Perfect Information Monte Carlo for Bridge"
- **Autores:** Varios
- **Enfoque:** PIMC — simular manos oponentes, asumir info perfecta, resolver con minimax.
- **Limitación:** No converge a Nash. Explotable por oponentes que explotan el sesgo.
- **Conclusión:** PIMC es simple pero débil para Truco. No recomendado.

---

## 3. Análisis comparativo

### Matriz de enfoques para Truco

| Enfoque | Calidad esperada | Esfuerzo | Recursos | Escala a 4/6 jugadores? | Bluff? |
|---------|-----------------|----------|----------|------------------------|--------|
| **Rule-based (actual)** | Mala (~30-40% WR) | Mínimo | Ninguno | Sí | No |
| **Markov Chain** | Baja (~28% WR) | Bajo | Mínimos | Sí | No |
| **Q-Learning** | Media (~50%) | Medio | Bajos | Parcial | No |
| **REINFORCE custom** | Media (~55-60%) | Medio | GPU opcional | Sí | Parcial |
| **CFR tabular (ES-MCCFR)** | **Alta (~70-91%)** | **Alto** | **CPU + RAM (2-64GB)** | **Sí** | **Sí (implícito)** |
| **Deep CFR / SD-CFR** | **Muy Alta** | **Muy alto** | **GPU** | **Sí** | **Sí** |
| **ReBeL** | **SOTA teórico** | **Extremo** | **GPU cluster** | **Sí** | **Sí** |
| **LLM + ToM** | Media-Alta (bluff) | Medio (prompt) | API calls | Sí | **Excelente** |

### Decisión sobre bloques fundamentales

**CFR es la base correcta.** No hay discusión en la literatura. Todo poker AI serio usa CFR. La tesis uruguaya ya demostró que funciona para Truco.

**Deep CFR añade escalabilidad** cuando la abstracción tabular se vuelve inviable. Es el paso natural después de tener CFR funcionando.

**LLM/ToM es complementario** para las decisiones de apuesta y bluff donde CFR es más débil (porque Truco es suma positiva, no suma cero).

### Qué NO funciona para Truco (según la literatura)

1. **CFR+** — Demostrado para suma cero. Truco uruguayo es suma positiva. La tesis uruguaya reporta peores resultados.
2. **MCTS puro** — No converge a Nash en info imperfecta. Necesita PBS para funcionar (como ReBeL).
3. **Q-Learning puro** — No converge a Nash en juegos de info imperfecta. NFSP fue creado para resolver esto.
4. **Deep Monte Carlo** — Solo 55% WR contra determinista. La tesis lo descarta.

---

## 4. Decisiones y justificaciones

### Decisión 1: Usar ES-MCCFR como algoritmo principal
**Fundamento:** La tesis uruguaya comparó todas las variantes de CFR y ES-MCCFR (External Sampling Monte Carlo CFR) fue la mejor en win rate y velocidad de convergencia. Es la variante usada por Libratus y Pluribus.

### Decisión 2: Implementar en Python, no TypeScript
**Fundamento:** 
- TypeScript no tiene bindings nativos para PyTorch/JAX
- El simulador headless se puede escribir en TS (rápido de prototipar)
- El entrenamiento de redes y CFR conviene en Python + numpy/PyTorch
- Si la velocidad es un problema, migrar a Rust (como menciona la tesis)

### Decisión 3: Abstracción A1 primero, A2 después
**Fundamento:** A1 (3 buckets: piezas, matas, resto) corre en ~2-4GB RAM. A2 requiere ~64GB. Empezar con A1 nos da resultados rápidos para validar el pipeline.

### Decisión 4: Unsafe Search como capa final
**Fundamento:** La tesis muestra que unsafe search mejora dramáticamente el WR de políticas débiles (A1 subió de 37% a 53%). Es un multiplicador de fuerza barato.

### Decisión 5: LLM/ToM para decisiones de envido/truco (fase opcional)
**Fundamento:** El envido y el bluff de truco son decisiones informadas por información parcial y psicología, donde los LLMs destacan (Suspicion-Agent, Guandan-ToM). CFR maneja bien el juego de cartas puro, pero las apuestas se benefician de modelar creencias del oponente.

---

## 5. Plan de acción refinado

Basado en la investigación completa, este es el plan definitivo:

### Fase 0: Setup de investigación
- [x] Leer papers existentes
- [x] Buscar papers faltantes en la literatura
- [x] Crear este documento de investigación
- [ ] Bajar PDFs de papers faltantes
- [ ] Configurar entorno de experimentación (Python + PyTorch)

### Fase 1: Simulador headless + Baseline
- Extraer `TrucoSimulator` del `GameEngine.ts` actual (headless, clonable)
- Implementar interfaz `Agent` abstracta
- Baselines: Random, Deterministic (Greedy), Markovian
- Dataset T1K22-like para evaluación
- **Métrica:** Win rate vs cada baseline

### Fase 2: ES-MCCFR Tabular
- Implementar ES-MCCFR (External Sampling MCCFR) con abstracción A1
- CFR para 2 jugadores primero (simplifica debugging)
- Pruning al 1% (como recomienda la tesis)
- Evaluar con D-Index + win rate
- **Meta:** Superar 60% WR vs determinista

### Fase 3: Abstracciones más finas
- Probar abstracción A2 (7 buckets)
- Si es viable en hardware disponible, entrenar modelo completo
- Sino, usar abstracción intermedia B1 (4 buckets)
- **Meta:** Superar resultados de la tesis para 2p (~70% WR)

### Fase 4: Deep CFR / SD-CFR
- Reemplazar tablas con redes neuronales
- Enfoque SD-CFR: solo red de valor, evitar red de promedio
- Entrenamiento con GPU en cloud (o tu VM si tiene GPU)
- **Meta:** Escalar sin abstracción manual

### Fase 5: Unsafe Search
- Rollouts Monte Carlo en tiempo de juego
- Asumir oponente = nuestra policy aprendida
- **Meta:** A1 + search → ~53% WR contra Z0 (o mejor)

### Fase 6 (opcional): LLM + ToM para apuestas
- Usar qwen3.6 para decisiones de envido/truco
- Arquitectura híbrida: CFR juega cartas, LLM decide apuestas
- **Meta:** Mejorar bluff y adaptación a oponentes humanos

---

## 6. Papers por descargar

La carpeta `Papers/` dentro de TrucoAI tiene los siguientes papers. Falta bajar estos:

| Paper | arXiv ID | Estado |
|-------|----------|--------|
| CFR Original (Zinkevich 2007) | — (NIPS, no arXiv) | ⏳ Pendiente |
| MCCFR (Lanctot 2009) | — (NIPS, no arXiv) | ⏳ Pendiente |
| NFSP (Heinrich & Silver 2016) | 1603.01121 | ✅ Verificado, ⏳ bajar PDF |
| DeepStack (Moravčík 2017) | — (Science) | ⏳ Pendiente |
| Libratus — Safe & Nested Subgame (Brown 2017) | 1705.02955 | ✅ Verificado, ⏳ bajar PDF |
| PSRO (Lanctot 2017) | 1711.00832 | ✅ Verificado, ⏳ bajar PDF |
| Pluribus (Brown & Sandholm 2019) | — (Science) | ⏳ Pendiente |
| MuZero (Schrittwieser 2020) | 1911.08265 | ✅ Verificado |
| CICERO (FAIR 2022) | — (Science) | ⏳ Pendiente |
| DouZero (Zhao 2021) | — | ⏳ Pendiente |

---

## Historial de cambios

| Fecha | Cambio |
|-------|--------|
| 19/05/2026 | Creación del documento. Investigación completa de literatura. |
