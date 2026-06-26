// ============================================================================
// DEMO EN VIVO — White & Case Citation Checker (capa de recuperación)
// Pega estas consultas en el Query de Neo4j Aura, una a la vez, y dale ▶.
// No necesitas Python: usan el índice full-text sobre los pasajes.
// ============================================================================


// ── 1. Tamaño del grafo (abre con esto) ─────────────────────────────────────
MATCH (c:Case) RETURN count(c) AS casos;

MATCH (p:Passage) RETURN count(p) AS pasajes;


// ── 2. EXISTENCIA: "¿esta cita existe?" ─────────────────────────────────────
// (a) Una cita REAL del escrito -> devuelve el caso:
CALL db.index.fulltext.queryNodes('caseName', 'American Cyanamid Ethicon')
YIELD node, score
RETURN node.name AS caso, node.citation AS cita, node.jurisdiction AS jurisdiccion
ORDER BY score DESC LIMIT 3;

// (b) Una cita FABRICADA del escrito (Pemberton Aerospace) -> CERO filas.
//     Ese vacío ES la detección de la cita inventada.
CALL db.index.fulltext.queryNodes('caseName', 'Pemberton Aerospace Delta Global Ventures')
YIELD node, score
RETURN node.name AS caso, score
ORDER BY score DESC LIMIT 3;


// ── 3. "IR A LA FUENTE": el párrafo exacto que respalda una afirmación ───────
// El escrito invoca American Cyanamid para el test de la medida cautelar.
// Recuperamos el párrafo real que lo dice (dentro de ese caso):
CALL db.index.fulltext.queryNodes('passageText', 'serious question to be tried balance of convenience')
YIELD node, score
WHERE node.case_id = '[1975] UKHL 1'
RETURN node.para_no AS parrafo, node.text AS texto, score
ORDER BY score DESC LIMIT 3;


// ── 4. DEMO ESTRELLA — MALA APLICACIÓN (cita 🟠 #7) ─────────────────────────
// El escrito cita Anglia Television v Reed para "lost future profits / expectation".
// Pero el caso REAL trata de gasto desperdiciado (RELIANCE). Lo probamos:
CALL db.index.fulltext.queryNodes('passageText', 'wasted expenditure incurred reliance before contract')
YIELD node, score
WHERE node.case_id = 'anglia-television-ltd-v-reed'
RETURN node.para_no AS parrafo, node.text AS texto, score
ORDER BY score DESC LIMIT 3;
// -> El párrafo recuperado habla de gasto/reliance, NO de lucro cesante:
//    evidencia de que la cita está MAL APLICADA.


// ── 5. Vista de GRAFO: un caso y sus pasajes (escaneado + OCR) ──────────────
// Caparo entró como imagen escaneada; el OCR lo convirtió en pasajes buscables.
MATCH (c:Case)-[:HAS_PASSAGE]->(p:Passage)
WHERE c.id = 'caparo-industries-plc-v-dickman'
RETURN c, p LIMIT 30;


// ── 6. "Go to source" libre: escribe cualquier tema y trae el párrafo ───────
// Cambia el texto entre comillas por lo que quieras buscar en TODO el corpus.
CALL db.index.fulltext.queryNodes('passageText', 'inducing breach of contract knowledge intention')
YIELD node, score
RETURN node.case_id AS caso, node.text AS texto, score
ORDER BY score DESC LIMIT 5;
