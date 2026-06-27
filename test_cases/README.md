# Test cases — TraceIT citation checker

Batería de documentos para **probar y endurecer** la plataforma. Cada archivo
`.txt` se sube tal cual (la plataforma acepta PDF o TXT). Cada uno apunta a un
**modo de fallo** distinto y trae su **veredicto esperado** (ground truth),
validado contra el grafo real (`citations` db / Aura).

> El caso **oficial del reto** es aparte: `data/skeleton_argument.pdf`
> (*Crestholm v Veltros*, 12 citas). Estos 6 son para reforzar.

Veredictos: **VERIFIED** (existe + bien aplicada + good law) · **MISAPPLIED**
(existe pero revocada / fuera de contexto) · **UNVERIFIABLE** (real pero fuera
del corpus — NO es fabricada) · **FABRICATED** (no existe).

---

## Hoja de respuestas (ground truth)

### 01 — `01_all_verified.txt` · control / falsos positivos
Todas reales, bien aplicadas, good law. **Mide que NO marque citas buenas.**

| Cita | Esperado |
|---|---|
| Caparo v Dickman [1990] 2 AC 605 | VERIFIED |
| Donoghue v Stevenson [1932] AC 562 | VERIFIED |
| Hedley Byrne v Heller [1964] AC 465 | VERIFIED |
| Hadley v Baxendale (1854) 9 Ex 341 | VERIFIED |
| Lumley v Gye (1853) 2 E&B 216 | VERIFIED |

**Éxito = 0 banderas.** Cualquier flag aquí es un falso positivo.

### 02 — `02_overruled_good_law.txt` · ¿sigue siendo buen derecho?
Cita autoridad **revocada** como si fuera vigente. **Mide la capa 2 (treatment).**

| Cita | Esperado | Por qué |
|---|---|---|
| Anns v Merton [1978] AC 728 | **MISAPPLIED / OVERRULED** | revocada por Murphy [1991] |
| Dutton v Bognor Regis [1972] 1 QB 373 | **MISAPPLIED / OVERRULED** | revocada por Murphy [1991] |
| Murphy v Brentwood [1991] 1 AC 398 | VERIFIED | good law |
| Caparo v Dickman [1990] 2 AC 605 | VERIFIED | good law |

### 03 — `03_misapplied.txt` · caso correcto, proposición incorrecta
**Mide la capa de pasajes ("ir a la fuente").**

| Cita | Esperado | Por qué |
|---|---|---|
| Anglia Television v Reed [1972] 1 QB 60 | **MISAPPLIED** | es *reliance* (gasto desperdiciado), NO lucro cesante |
| Rookes v Barnard [1964] AC 1129 | **MISAPPLIED** | es la autoridad de daños **ejemplares**, no "compensatorios at large" |
| Hadley v Baxendale (1854) 9 Ex 341 | VERIFIED | bien aplicada |

### 04 — `04_fabricated_and_outside_corpus.txt` · inventadas vs. reales no cubiertas
**Mide detección de fabricación + la distinción NOT_FOUND ≠ FABRICATED.**

| Cita | Esperado |
|---|---|
| OBG Ltd v Allan [2007] UKHL 21 | VERIFIED |
| Lumley v Gye (1853) 2 E&B 216 | VERIFIED |
| Hollingsworth Marine v Castibel Logistics [2020] EWHC 2217 (Comm) | **FABRICATED** |
| Verbruck Pharmaceuticals v NHS Commissioning Board [2019] EWCA Civ 1043 | **FABRICATED** |
| Trenton Aviation Holdings v Meridian Underwriting [2022] EWHC 559 (Comm) | **FABRICATED** |
| Wrotham Park v Parkside Homes [1974] 1 WLR 798 | **UNVERIFIABLE** (real, fuera de corpus — NO fabricada) |

### 05 — `05_citation_form_edge_cases.txt` · robustez de matching
**Mide que matchee por nombre pese a forma/typo.**

| Cita | Esperado | Truco |
|---|---|---|
| American Cyanamid v Ethicon [1975] AC 396 | VERIFIED | el corpus lo tiene como [1975] UKHL 1 → match por nombre |
| Caparo Industries v Dickman | VERIFIED | sin cita neutra, solo nombre |
| Hedley **Burne** v Heller [1964] AC 465 | VERIFIED | typo "Burne"→"Byrne" (fuzzy) |
| Donoghue v Stevenson / M'Alister v Stevenson | VERIFIED | mismo caso, forma paralela |

### 06 — `06_comprehensive_torture_test.txt` · mezcla completa (11 citas)
Un escrito nuevo (*Brightwater v Norvell*) con **todos los tipos a la vez**.

| # | Cita | Esperado |
|---|---|---|
| 1 | Lumley v Gye | VERIFIED |
| 2 | OBG Ltd v Allan | VERIFIED |
| 3 | Caparo v Dickman | VERIFIED |
| 4 | Anns v Merton | **MISAPPLIED / OVERRULED** (Murphy) |
| 5 | Anglia Television v Reed (por lucro cesante) | **MISAPPLIED** |
| 6 | Hadley v Baxendale | VERIFIED |
| 7 | Wrotham Park v Parkside Homes | **UNVERIFIABLE** (fuera de corpus) |
| 8 | Rookes v Barnard (daños ejemplares) | VERIFIED |
| 9 | American Cyanamid v Ethicon [1975] AC 396 | VERIFIED (form mismatch) |
| 10 | Calderwood Shipping v Astra Bulk Carriers [2021] EWHC 1180 (Comm) | **FABRICATED** |
| 11 | Pemberton Aerospace v Delta Global Ventures [2023] EWHC 892 (TCC) | **FABRICATED** |

---

## Protocolo de testing (iterar hasta que rinda)

1. Sube cada `.txt` y compara la salida con la tabla de arriba.
2. Registra por caso: **aciertos / fallos** y el tipo de error.
3. Métricas que importan:
   - **Falsos positivos** (caso 01): deben ser **0**. Una cita buena marcada destruye la confianza.
   - **Recall de fabricadas** (casos 04, 06): % de inventadas detectadas. Meta 100%.
   - **NOT_FOUND ≠ FABRICATED** (Wrotham): debe salir *unverifiable*, nunca *fabricated*.
   - **Good-law** (casos 02, 06): Anns/Dutton deben salir *overruled*.
   - **Misapplied** (caso 03): ¿el pasaje recuperado contradice la proposición?
   - **Robustez de matching** (caso 05): form mismatch + typo + name-only.
4. Cuando falle, ajusta UNA palanca a la vez:
   - umbral de fuzzy match (hoy 80–82) → afecta typo/falsos positivos
   - prompt del extractor LLM (qué cuenta como cita, ground/proposición)
   - cobertura del corpus (agregar casos reduce falsos *unverifiable*)
   - retrieval k / chunking → afecta la prueba de mala aplicación

## Estado de validación (contra el grafo real)
- 12/12 citas reales **encontradas**.
- 6/6 ausentes correctas (5 fabricadas + Wrotham fuera de corpus).
- Anns **y** Dutton marcados *overruled* por Murphy.
