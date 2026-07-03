# Prompt para Claude Code — Iteración 0.1 · Dependencias y configuración

**Cómo usar este archivo**: copia todo el bloque bajo "PROMPT" abajo y pégalo como primer mensaje a Claude Code Desktop en una sesión nueva (o continuando la anterior). El prompt asume que Claude Code puede leer el `CLAUDE.md` del repo.

**Precondiciones**:
- Has reemplazado el `CLAUDE.md` padre en `C:\apps\APLICACION SST\` con la nueva versión (`CLAUDE_PADRE.md` renombrado a `CLAUDE.md`).
- Has reemplazado el `CLAUDE.md` del SIGP en `C:\apps\APLICACION SST\sst-panel-web\` con la nueva versión.
- Estás trabajando en una rama nueva: crea `sigp/f0-base` desde `main` antes de arrancar.

---

## PROMPT

```
Hola Claude Code. Vamos a arrancar la Fase 0 del SIGP, Iteración 0.1: 
Dependencias y configuración.

Primero, lee estos archivos:
1. C:\apps\APLICACION SST\CLAUDE.md
2. C:\apps\APLICACION SST\sst-panel-web\CLAUDE.md
3. C:\apps\APLICACION SST\sst-panel-web\PLAN_FASE_0_SIGP.md  
   (si no lo tienes, dímelo y te lo pego)

Confírmame por escrito que los leíste y que entiendes:
- Que trabajamos en rama sigp/f0-base (no main).
- Que la app Flutter no se toca.
- Que Cloud Functions y reglas Firestore requieren mi OK antes de deploy.
- Que el modelo default es Sonnet, subes a Opus solo para decisiones críticas.

============================================================
ITERACIÓN 0.1 - DEPENDENCIAS Y CONFIGURACIÓN
============================================================

Esta iteración tiene 4 tareas. Ejecútalas EN ORDEN, una por una. Al 
terminar cada tarea, pausa y espera mi OK antes de pasar a la siguiente. 
No las hagas todas de corrido.

============================================================
TAREA 0.1.1 - Instalar pdf-lib
============================================================

- Corre: npm install pdf-lib
- Verifica que package.json refleja la nueva dependencia
- Corre: npm run build
- Reporta el tamaño del bundle antes y después (si puedes verlo en 
  la salida de Vite)
- Agrega una entrada al DEPLOYMENT_GUIDE.md indicando que el panel 
  ahora tiene pdf-lib disponible para generación de PDFs

Al terminar, dime "Tarea 0.1.1 completa" y espera mi OK.

============================================================
TAREA 0.1.2 - Instalar Vitest y React Testing Library
============================================================

- Instala: vitest, @testing-library/react, @testing-library/jest-dom, 
  jsdom, @vitest/ui (todos como devDependencies)
- Crea vitest.config.ts en la raíz de sst-panel-web/ con:
  * environment: 'jsdom'
  * setup file en src/test/setup.ts
  * aliases de imports igual a los de vite.config.ts (revisa el vite 
    config actual para replicarlos)
- Crea src/test/setup.ts que importa '@testing-library/jest-dom'
- Agrega scripts a package.json:
  * "test": "vitest run"
  * "test:ui": "vitest --ui"
  * "test:watch": "vitest"
- Escribe UN test smoke en src/App.test.tsx que:
  * Importe App
  * Renderice App envuelto en BrowserRouter y AuthProvider (si es necesario)
  * Verifique que no hay errores de compilación
  * Es solo un test de humo, no valida comportamiento
- Corre: npm test
- Verifica que el test pasa

Si el test smoke requiere mocks de Firebase o Auth para no fallar, 
usa mocks simples en el setup file. No inviertas mucho tiempo aquí, 
el objetivo es solo verificar que el pipeline funciona.

Al terminar, dime "Tarea 0.1.2 completa" con el output del npm test, 
y espera mi OK.

============================================================
TAREA 0.1.3 - Configurar Firebase Emulator Suite
============================================================

- Verifica si firebase-tools está instalado: firebase --version
- Si no está, dime para que yo lo instale globalmente (yo lo hago)
- Ejecuta: firebase init emulators en la raíz de sst-panel-web/
- Cuando pregunte qué emuladores habilitar, marca:
  * Authentication Emulator (puerto 9099)
  * Firestore Emulator (puerto 8080)
  * Storage Emulator (puerto 9199)
  * Functions Emulator (puerto 5001)
- Acepta descargar los emuladores si los pide
- Verifica que firebase.json quedó con la configuración de emuladores
- NO modifiques firebase/config.ts todavía; eso es la Tarea 0.1.4

Al terminar, dime "Tarea 0.1.3 completa" mostrando el contenido de 
firebase.json (o al menos la sección de emuladores), y espera mi OK.

============================================================
TAREA 0.1.4 - Extender firebase/config.ts con Storage y emuladores
============================================================

Modifica src/firebase/config.ts para:
- Importar getStorage y connectStorageEmulator de firebase/storage
- Importar getFunctions y connectFunctionsEmulator de firebase/functions
- Inicializar storage y functions
- En import.meta.env.DEV === true, conectar auth, db, storage y 
  functions a los emuladores locales
- Exportar auth, db, storage, functions

IMPORTANTE:
- No cambies nada de lo que ya funciona con auth y db en producción
- La conexión a emuladores SOLO ocurre en DEV
- Si hay dudas sobre el patrón exacto de connect*Emulator, revisa 
  la documentación de firebase v10 (SDK modular)

Corre: npm run build para verificar que compila sin errores.

Corre: npm run dev y verifica que el panel arranca sin errores 
(sin necesidad de tener emuladores levantados; solo verificar que 
no hay errores de tipo o de import).

Actualiza DEPLOYMENT_GUIDE.md con una sección corta:
"Desarrollo local con emuladores"
Instrucciones para:
1. Levantar emuladores: firebase emulators:start
2. En otra terminal, levantar el panel: npm run dev
3. El panel conectará automáticamente a los emuladores en dev

Al terminar, dime "Tarea 0.1.4 completa" con el snippet de config.ts 
que quedó, y espera mi OK.

============================================================
CIERRE DE LA ITERACIÓN
============================================================

Cuando las 4 tareas estén completas y con mi OK:
- Haz commit con mensaje: "f0: 0.1 dependencias, vitest, emulator, storage"
- Sigue en la rama sigp/f0-base
- NO merges a main
- Reporta el estado final: qué se cambió, qué no, qué falta

NO deploys a producción, no toques Firestore rules, no toques Cloud 
Functions todavía. Todo eso viene en iteraciones siguientes con OK 
explícito mío.

Arranca con la Tarea 0.1.1 cuando confirmes que leíste los CLAUDE.md.
```

---

## Notas para ti (no las pases a Claude Code)

- **Duración esperada**: 30-60 minutos si todo va bien.
- **Modelo**: Sonnet por default. Si Code sube a Opus para una decisión, revisa que tenga sentido.
- **Punto crítico**: la Tarea 0.1.4 modifica `firebase/config.ts`. Asegúrate de que Code no cambie el comportamiento en producción, solo agregue el bloque de emuladores para DEV.
- **Si algo se rompe**: `git checkout .` en la rama `sigp/f0-base` para descartar cambios locales; empieza de nuevo.
- **Cuando Iteración 0.1 esté cerrada**: vuelves acá al Project y me dices "Iteración 0.1 completa" con un resumen breve de lo que salió bien y lo que salió distinto. Yo te preparo el prompt de la Iteración 0.2.

## Antes de arrancar en Claude Code

Verifica que tienes:
1. Rama nueva creada: `git checkout -b sigp/f0-base` desde `main`.
2. Los dos `CLAUDE.md` actualizados están en su lugar (el padre en `APLICACION SST/`, el del SIGP en `sst-panel-web/`).
3. El plan de F0 (`PLAN_FASE_0_SIGP.md`) copiado a `sst-panel-web/docs/sigp/` o donde tengas la doc del SIGP.
