# Prompt para Claude Code — Fase 0.0 · Reconocimiento del codebase

**Cómo usar este archivo**: copia todo el bloque de "PROMPT" abajo (desde la línea `Hola Claude Code` hasta el final del bloque) y pégalo como primer mensaje a Claude Code Desktop en una sesión nueva. No agregues nada, no quites nada.

---

## PROMPT

```
Hola Claude Code. Antes de que hagas cualquier cosa, lee primero estos dos archivos:

1. C:\apps\APLICACION SST\CLAUDE.md  (el CLAUDE.md padre)
2. C:\apps\APLICACION SST\sst-panel-web\CLAUDE.md  (el CLAUDE.md del SIGP)

Confírmame por escrito que los leíste ambos y que entendiste que el segundo aplica encima del primero.

Después, ejecuta la tarea Fase 0.0 - Reconocimiento del codebase que te describo abajo.

============================================================
FASE 0.0 - RECONOCIMIENTO DEL CODEBASE
============================================================

USA MODELO HAIKU para todo el reconocimiento. Sonnet solo si necesitas 
razonar sobre un patrón que no queda claro.

REGLA DURA: esta tarea es SOLO LECTURA. Cero escritura de archivos, 
cero commits, cero cambios en el repositorio. Tu único output es un 
reporte en Markdown que me devuelves al final en el chat. No crees 
archivos nuevos, no edites nada.

CONTEXTO
Trabajo con la persona (usuario) en construir el SIGP (Sistema Integral 
de Gestión de Proyectos) para NEG Ingeniería. El SIGP se va a montar 
como un módulo nuevo dentro del panel web SST existente (sst-panel-web/), 
reutilizando ~60% del código base. Antes de escribir una sola línea nueva, 
necesito una foto real del codebase actual porque los CLAUDE.md pueden 
estar desactualizados frente al código.

TU TRABAJO
Explorar el codebase de sst-panel-web/ y darme un reporte estructurado 
que responda las preguntas de abajo. Nada más. Al terminar, esperas 
instrucciones de la persona.

Trabajas sobre: C:\apps\APLICACION SST\sst-panel-web\

============================================================
LO QUE NECESITO EN EL REPORTE
============================================================

## 1. Estructura de carpetas

- Árbol de src/ hasta 3 niveles de profundidad.
- Marcar cuáles carpetas mencionadas en el CLAUDE.md padre existen 
  realmente y cuáles no.
- Detectar cualquier carpeta que exista y no esté documentada.

## 2. Stack real vs. documentado

Verificar y reportar la versión real de:
- React
- Vite
- TypeScript (¿está en uso? ¿solo en algunos archivos?)
- Tailwind CSS
- Firebase SDK
- Recharts
- xlsx (SheetJS)
- pdf-lib
- Cualquier librería importante que no esté en la lista de arriba

Lee package.json y reporta versiones exactas. Si detectas librerías 
en package.json que no aparecen en el CLAUDE.md padre, lístalas.

## 3. Archivos y componentes clave — ¿existen realmente?

Verificar la existencia y el estado (últimas fechas de modificación) de:
- pages/Registros.tsx + RegistrosTable.tsx + RegistroDetalleModal.tsx
- pages/Dashboard.tsx
- pages/Reportes.tsx
- pages/Obras.tsx
- pages/Contratistas.tsx
- pages/Usuarios.tsx
- Todos los componentes mencionados en el CLAUDE.md padre 
  (InvitarUsuarioModal, EditarDocumentosModal, AsignarObrasModal, AdminRoute)
- utils/vencimiento.ts
- El helper normalizarDoc() — ¿dónde vive? ¿qué firma tiene?
- TIPO_LABELS y TIPO_COLOR en components/RegistrosTable.tsx — ¿qué 
  tipos de formulario contempla realmente?

Reporta lo que encuentres y lo que NO encuentres.

## 4. Autenticación y roles

- ¿Cómo está implementada la autenticación con Firebase Auth? ¿Hay 
  un AuthContext, un hook useAuth, un provider?
- ¿Dónde se almacena el rol del usuario y cómo se lee?
- ¿Cómo se protegen las rutas? (AdminRoute, ProtectedRoute, etc.)
- ¿Qué valores de rol se están usando realmente en el código? 
  Lista los strings exactos que veas en if/switch/comparaciones.

## 5. Patrón de lectura de Firestore

- ¿Cómo se leen colecciones? (getDocs, onSnapshot, hooks personalizados)
- ¿Existe algún hook tipo useCollection, useDocument?
- ¿Dónde vive la configuración de Firebase? (firebase/config.ts, etc.)
- ¿Cómo se maneja el estado de carga y errores?

## 6. Estilo visual real

- Verifica el archivo tailwind.config.js: ¿está definida la escala 
  brand con los verdes? ¿Existe el color accent lima?
- ¿Se usa Montserrat en index.html? ¿Se cargan las fuentes desde Google Fonts?
- Busca en el código cualquier referencia a colores azules 
  (blue-, #0..., blue) — reporta cuántas coincidencias hay y en qué archivos. 
  Esto detecta si quedaron restos del rebrand.
- ¿El logo está en public/logo-neg.png y public/logo-neg-full.png?

## 7. Features extra no documentadas

Explora sin agenda y reporta cualquier feature, componente o utilidad 
que exista en el código y NO esté mencionada en ninguno de los dos CLAUDE.md.

## 8. Deltas — resumen ejecutivo

Cierra el reporte con una sección "Deltas contra los CLAUDE.md":
- Lo que dice el CLAUDE.md padre pero NO se cumple en el código
- Lo que hay en el código y NO está en los CLAUDE.md
- Lo que dice el CLAUDE.md del SIGP y asume del panel actual — 
  ¿esas suposiciones son correctas?

Sé honesto y directo. Si algo no queda claro después de explorar, dilo. 
No inventes.

============================================================
FORMATO DEL REPORTE
============================================================

Estructura tu reporte como un solo bloque de Markdown con las 8 
secciones de arriba, en ese orden. Cada sección con su título como 
encabezado H2 (##). Sub-listas con bullets. Bloques de código para 
snippets cortos que quieras citar.

Al final, escribe "FIN DEL REPORTE" para que quede claro que 
terminaste.

============================================================
DESPUÉS DE ENTREGAR EL REPORTE
============================================================

NO hagas ningún cambio en el código. NO propongas siguiente paso. 
NO ofrezcas implementar nada. La persona va a llevar el reporte a 
otra sesión de Claude para procesarlo. Solo espera instrucciones.

Si en cualquier momento te falta un permiso para leer un archivo o 
tienes dudas de si algo cuenta como "modificar", pregúntame antes 
de proceder.

Arranca ahora.
```

---

## Notas para ti (no las pases a Claude Code)

- **Duración esperada**: 10-20 minutos. Es exploración, no razonamiento pesado.
- **Costo esperado**: bajo. Haiku es el modelo más económico.
- **Si Claude Code intenta modificar algo**: detenlo inmediatamente y pídele que reafirme que la tarea es solo lectura.
- **Si Claude Code se enreda o pide clarificar**: bien, es lo que queríamos. Contéstale las dudas y sigue.
- **Cuando termine y te entregue el reporte**: cópialo completo (desde el primer `##` hasta `FIN DEL REPORTE`) y pégalo en el chat con Claude en el Project. Yo lo proceso y te digo qué sigue.
