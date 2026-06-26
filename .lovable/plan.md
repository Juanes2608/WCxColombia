# CitationGuard — Fase 2: Dashboard completo

Respuesta corta a tu pregunta: **no, todavía no es toda la app.** La Fase 1 dejó lista la landing de upload (`/`) y los componentes de soporte (Logo, VerdictBadge, ConfidenceMeter, ScopeBanner, DegradedNotice). El brief exige además **todo el dashboard de resultados** y su familia de componentes. Esta Fase 2 cierra el resto.

## Mapa del brief vs. lo construido

```text
PÁGINA / COMPONENTE              ESTADO        ACCIÓN FASE 2
────────────────────────────────────────────────────────────
/ (upload landing)              hecho         pulir feedback drag + barra progreso
/results/[matterId]             placeholder   reconstruir dashboard completo
SummaryCards (4 tarjetas)       falta         crear
CitationTable                   falta         crear (sort + filtros + tooltip)
CitationDetail (modal)          falta         crear (5 secciones + card LLM)
TreatmentTimeline               falta         crear
FinancialPanel                  falta         crear (5 métricas + fuentes)
GraphViewer (react-flow)        falta         crear (opcional, solo si neo4j)
VerdictBadge                    hecho         reusar
ConfidenceMeter/Scope/Degraded  hecho         integrar en dashboard
types.ts / api-client / mock    hecho         reusar
```

## Lo que se construye

### 1. Dashboard de resultados `src/routes/results.$matterId.tsx`
- Lee el resultado desde `sessionStorage` con la clave `result-${matterId}` (patrón ya acordado). Si falta, estado vacío con CTA "New document".
- Header: botón "← New document", `matter_id` truncado en mono, `processing_ms`, y hash de auditoría (64 chars) con botón copiar.
- Fila de 4 **SummaryCards**: Total / Fabricated (rojo si >0) / Misapplied (ámbar si >0) / Verified (verde).
- `ScopeBanner` (R10) y `DegradedNotice` (R1) cuando `layer2.source` indique degradación.
- Layout 3 columnas en desktop (tabla 2/3, panel financiero 1/3), 1 columna en móvil.

### 2. SummaryCards `src/components/citationguard/SummaryCards.tsx`
Tarjetas con tokens de marca; colores derivados del verdict-map, nunca hardcode.

### 3. CitationTable `src/components/citationguard/CitationTable.tsx`
- Columnas: `#`, Citation (truncada), Layer 1, Layer 2 (Clio o "—"), Type (case law / statute).
- Orden: FABRICATED → MISAPPLIED → VERIFIED.
- Filtros: All / Flagged / Verified.
- Hover de fila → tooltip con la explicación corta.
- Click de fila → abre `CitationDetail`.

### 4. CitationDetail `src/components/citationguard/CitationDetail.tsx`
Modal (shadcn Dialog) con 5 secciones:
1. Header: texto de la cita + cerrar.
2. Layer 1: VerdictBadge + explanation + comparación `proposition_cited` vs `proposition_actual` cuando MISAPPLIED + `ConfidenceMeter`.
3. Layer 2 (Clio): `TreatmentTimeline` si no es NOT_CHECKED.
4. Statutory: resultado legislation.gov.uk con `excerpt` y link `source_url` (si aplica).
5. Card de explicación LLM (solo si `llm_explanation !== null`), claramente etiquetada como advisory/no determinista (R7/R9).

### 5. TreatmentTimeline `src/components/citationguard/TreatmentTimeline.tsx`
Timeline vertical: OVERRULED (punto rojo) y DISTINGUISHED (punto ámbar), con citing_case, year, court y context en itálica.

### 6. FinancialPanel `src/components/citationguard/FinancialPanel.tsx`
5 métricas: flag rate %, time saved £, risk exposure avoided £, fabricated, misapplied, verified. Footnote de fuentes determinísticas (Stanford / Law Society / CPR r.44.11) y nota "computed deterministically — not LLM-generated".

### 7. GraphViewer `src/components/citationguard/GraphViewer.tsx` (opcional)
Solo si `layer2.source === "neo4j"`. Con datos mock equivalentes a `GET /api/graph/{nodeId}`. Colores por status y aristas OVERRULES/DISTINGUISHES/CITES. Si no hay datos, se oculta la sección entera.

### 8. Pulido de la landing `src/routes/index.tsx`
Mejor feedback visual de drag-over, validación de tipo antes de subir, y barra de progreso durante el escaneo.

## Detalles técnicos
- Adaptación a la stack real: **TanStack Start (React 19)**, no Next.js. Rutas en `src/routes/`, params con `$matterId`, navegación con `<Link>`.
- `react-flow` no está instalado; se añade con `bun add reactflow` solo si decidimos incluir el GraphViewer.
- Reusar `verdict-map.ts` como única fuente de íconos/colores/labels (R2/R9). Cero colores hardcodeados; todo vía tokens de `styles.css`.
- Datos del GraphViewer y degradación se simulan en `mock-data.ts` para mantener el flujo end-to-end sin backend.
- shadcn `Dialog`, `Tooltip`, `Table` para la base accesible.

## Decisión que necesito de ti
¿Incluyo el **GraphViewer con react-flow** ahora (añade una dependencia y es marcado como opcional en el brief), o lo dejo fuera de esta fase y entrego el dashboard núcleo primero? Puedo proceder sin él y añadirlo después.