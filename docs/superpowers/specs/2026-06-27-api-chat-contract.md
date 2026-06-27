# Contrato: POST /api/chat (chatbot de pricing anclado)

Implementación: backend FastAPI (rama `main` → Railway). La API key de Anthropic vive
SOLO como variable de entorno del backend (`ANTHROPIC_API_KEY`), nunca en el browser.
El frontend ya implementa el cliente (`src/lib/chat-client.ts`) y el system prompt
(`src/lib/pricing/chat-context.ts` → `buildSystemPrompt`).

## Request
`POST {API_BASE}/api/chat`

```json
{
  "messages": [
    { "role": "user", "content": "¿Cuál es el margen para White & Case?" }
  ],
  "snapshot": { "...": "ModelSnapshot del motor (src/lib/pricing/types.ts)" }
}
```

- `messages`: array de `{ role: "user" | "assistant", content: string }`, no vacío.
- `snapshot`: el `ModelSnapshot` determinista que el frontend calcula con `buildChatContext(...)`
  (constantes con procedencia + economía comprador/vendedor + escenarios + disclaimer).

## Response
```json
{ "reply": "El margen bruto es 97.2% (HIPÓTESIS según el snapshot)..." }
```

- Éxito: `{ "reply": <texto del assistant> }` (string). El cliente valida que `reply` sea string.
- Error: `{ "detail": "..." }` con status apropiado (el cliente ya lo maneja con un mensaje amigable).

## Lógica del backend
1. Validar entrada (pydantic): `messages` no vacío y de longitud acotada; `snapshot` objeto bien formado.
2. Construir el system prompt con las MISMAS reglas que `src/lib/pricing/chat-context.ts`
   (`buildSystemPrompt`): *solo usar números presentes en `MODEL_SNAPSHOT`; nunca inventar cifras;
   si algo no está, decirlo; citar la procedencia VERIFICADO/HIPÓTESIS; los números los calcula el
   código, no el modelo; recordar el disclaimer*. Embeber `MODEL_SNAPSHOT` (JSON) en el system.
3. Llamar a la Anthropic Messages API con `model = "claude-haiku-4-5"`, el `system` anterior,
   y los `messages` del usuario.
4. Devolver `{ "reply": <texto del assistant> }`.

## Seguridad
- `ANTHROPIC_API_KEY` solo en el entorno del backend; jamás en el frontend ni en el snapshot.
- Rate-limit por IP.
- Límite de tamaño de `messages` y `snapshot` (rechazar payloads excesivos).
- CORS permitido solo para el dominio del frontend (Cloudflare Pages).
- El snapshot llega del cliente: tratarlo como dato no confiable (solo se reinyecta como texto en el
  system prompt; no se ejecuta ni se confía en él para autorización).

## Nota de anclaje (por qué esto importa)
El chatbot refleja la tesis anti-alucinación de TraceIt: igual que el producto no deja que un LLM
emita el veredicto de existencia de una cita, el bot de pricing no deja que el LLM invente cifras —
solo explica los números que el motor determinista ya calculó y que viajan en `MODEL_SNAPSHOT`.
