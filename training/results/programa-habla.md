# Programa de experimentos sobre el habla (desde 2026-10-20)

Pedido de Emmanuel: seguir experimentando con la charla. Lo que ya se sabe (r4–r7, `r6-escucha.md`, `r7-engano.md`):
en self-play la charla pública balbucea; escuchar paga si el emisor es sincero (+9); mentir paga si hay quien escucha
(+10 sobre la verdad) y se aprende solo; por eso el balbuceo es el equilibrio.

## La idea que ordena todo

**La charla gratis solo informa cuando le sirve a alguien del lado del que habla** (Crawford y Sobel 1982; en RL:
Cao et al. 2018, sin interés compartido la charla no se ancla; Noukhovitch et al. 2021, la información transferida
cae a medida que crece el conflicto y desaparece en suma constante). En nuestro entrenamiento el compañero ya sabe
todo por las **señas** (canal privado), así que lo dicho en voz alta solo le llega al rival: suma cero pura.

El caso interesante es el de **Farrell y Gibbons (1989), "Cheap talk with two audiences"**: hablar en público con un
aliado y un adversario a la vez. La charla pública puede ser más creíble que la privada ("disciplina") o menos
("subversión"), según cuánto gana el aliado contra cuánto aprende el adversario. Y Liang et al. (2020): la
competencia contra otro equipo mejora la comunicación dentro del equipo.

## Tanda 1 — "dos audiencias" (r8, `dos-audiencias.sh`, noche del 2026-10-20)

Mismo punto de partida (r5-charla iteración 25), misma semilla, mismos rivales (ella misma 70%, la difícil 15%, R
15%), 200 iteraciones, 4 y 6 jugadores, sin reputación, sin KL hacia la imitación. Lo único que cambia:

| Condición | Señas | Al abrir la mano | Quién oye la charla | Predicción |
|---|---|---|---|---|
| A | sí | — | todos | balbuceo (como r4/r5) |
| B | no | los compañeros dicen cartas y tanto | todos | información parcial: lo que más le sirve al pie y menos al rival |
| C | no | ídem | solo el equipo | informa (interés alineado): la charla reemplaza a las señas |
| D | no | ídem | el rival, la mitad de las veces | entre B y C |

C → D → B es la **curva de información contra probabilidad de que escuche el rival** (0, ½, 1).

Medidas nuevas (código en `actors/rollout.ts` y `learner/run.py`):
- `info_tanto_bits`, `info_cartas_bits` (y `_frac`): información mutua entre lo que tiene y lo que dice.
- `canta_si_compa_{mucho,algo,nada}`: siendo pie, cuánto canta envido según lo que dijo su compañero (¿lo escucha?).
- Ablaciones contra sí misma: callada (`mute`), sorda a su equipo (`deafteam`), sorda a los rivales (`deafrivals`),
  sin ver las señas (`nosigns`). Cada diferencia es lo que vale ese canal.
- Duelo previo: **cuánto valen las señas** (R contra R sin ver las señas).

## Próximas tandas (propuestas)

2. **Carrera armamentista** (PSRO, Lanctot et al. 2017; está en `Papers/_new`). Desde r7: entrenar una que escuche
   contra r7 congelada, después una que hable contra esa, y así 5–6 generaciones; medir la información de lo dicho y
   el "creerle" en cada una. Después lo mismo pero cada nueva contra la **mezcla** de todas las anteriores. Predicción:
   contra la última, ciclos (mentir ↔ desconfiar); contra la mezcla, se apaga hacia el balbuceo.
3. **Rival crédulo** (como un humano que cree lo que oye): una heurística que le cree 100% y usa lo dicho para todo
   (envido y truco). ¿Cuánto le saca una red que miente? Sirve para el juego: es lo que va a pasar con gente.
4. **Señas que se pescan**: las señas pasan a ser una decisión de la red (puede hacer la verdadera, otra o ninguna) y
   el rival las ve con probabilidad p. Lo cultural del truco: "te pescaron las señas". ¿Aprende a hacer señas falsas
   cuando la pueden ver, y cuánto le cuesta al pie? (Cambio grande: salida nueva de la red; historia para Hermes.)
5. **¿Las convenciones son arbitrarias?** (correlación de políticas conjuntas, PSRO §4.1). Equipos mezclados con
   compañeros de distintas semillas (r4-piloto, -s2, -s3): si pierden, las indicaciones del pie y lo que se dice
   tienen significados propios de cada semilla, no "naturales". (Cambio chico: asignar redes por asiento.)
6. **Hablar caro**: mentir y que te pesquen cuesta un punto. Cao et al.: un canal que compromete sí se usa con
   intereses opuestos. ¿Desde qué costo deja de mentir?
7. **Regularizar la información** (Strouse et al. 2018): premio o castigo proporcional a la información de lo que se
   dice. La curva "cuánto cuesta ser sincero" para cada nivel de información.

## Referencias

- Crawford y Sobel (1982), Strategic Information Transmission. Econometrica.
- Farrell y Gibbons (1989), Cheap Talk with Two Audiences. AER. https://dspace.mit.edu/bitstream/handle/1721.1/63429/cheaptalkwithtwo00farr.pdf
- Cao, Lazaridou, Lanctot, Leibo, Tuyls, Clark (2018), Emergent Communication through Negotiation. arXiv:1804.03980
- Noukhovitch, LaCroix, Lazaridou, Courville (2021), Emergent Communication under Competition. arXiv:2101.10276
- Liang et al. (2020), On Emergent Communication in Competitive Multi-Agent Teams. AAMAS.
- Strouse et al. (2018), Learning to Share and Hide Intentions using Information Regularization. arXiv:1808.02093
- Lanctot et al. (2017), A Unified Game-Theoretic Approach to Multiagent RL (PSRO). arXiv:1711.00832
- Heinrich y Silver (2016), Deep RL from Self-Play in Imperfect-Information Games (NFSP). arXiv:1603.01121
