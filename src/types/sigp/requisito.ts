/**
 * Requisitos de un pliego (sub-bloque A.1) — forma, invariantes y patch
 * builders puros. CERO Firestore, CERO React, CERO UI.
 *
 * Un `Requisito` es UNA exigencia del pliego con su evidencia y su veredicto.
 * El checklist de una licitación es una lista de estos; `utils/sigp/
 * cumplimiento.ts` los evalúa y resume.
 *
 * ── LAS CUATRO INVARIANTES ──────────────────────────────────────────────────
 *
 *  1. NUNCA SE HEREDA ESTADO. `clonarRequisitosComoPlantilla` copia la
 *     ESTRUCTURA de lo que pedía un pliego (categoría, descripción, qué tipo
 *     de evidencia, qué indicador y contra qué valor) y pone TODO en
 *     `pendiente`, con `verificado_por` y `verificado_en` en null. No existe
 *     —y no debe existir— ninguna función que copie `estado` entre
 *     licitaciones. Si aparece una, es un defecto.
 *
 *  2. `estado !== 'pendiente'` ⟹ `verificado_por` y `verificado_en`
 *     poblados. Un veredicto sin firma no es un veredicto. Incluye
 *     `no_aplica`: decidir que algo no aplica también es decidir.
 *
 *  3. `categoria === 'personal'` ⟹ marcarlo `cumple` exige `persona` con
 *     `nombre` no vacío y una REFERENCIA resoluble (`ref_tipo` + `ref_id`).
 *     Un requisito de personal NO se puede dar por cumplido en abstracto: el
 *     pliego pide una persona concreta, no la idea de que existe alguien.
 *     ⚠ La cédula NO se copia aquí — ver `PersonaRequisito`.
 *
 *  4. `tipo_evidencia === 'indicador'` ⟹ marcar `cumple` a mano sin
 *     `valor_neg` se rechaza. EL INDICADOR SE EVALÚA, NO SE DECLARA: el
 *     número sale del RUP y la comparación la hace `evaluarIndicador`.
 *
 * Cada invariante tiene UN SOLO DUEÑO que la hace cumplir
 * (`patchMarcarRequisito` para 2/3/4, `clonarRequisitosComoPlantilla` para
 * la 1) — así dos caminos no pueden divergir. Patrón de `licitacion.ts`.
 */
import type { Timestamp } from 'firebase/firestore'

export type { Timestamp }

// ── Vocabularios cerrados ────────────────────────────────────────────────────

export const CATEGORIAS_REQUISITO = [
  'juridico', 'financiero', 'tecnico', 'experiencia', 'personal', 'otro',
] as const
export type CategoriaRequisito = typeof CATEGORIAS_REQUISITO[number]

export const TIPOS_EVIDENCIA = [
  'documento_empresa', 'documento_personal', 'indicador', 'declaracion', 'otro',
] as const
export type TipoEvidencia = typeof TIPOS_EVIDENCIA[number]

export const ESTADOS_REQUISITO = [
  'pendiente', 'cumple', 'no_cumple', 'no_aplica',
] as const
export type EstadoRequisito = typeof ESTADOS_REQUISITO[number]

/**
 * Indicadores del RUP que un pliego puede exigir.
 *
 * ⚠ `experiencia_smmlv` NO se llama igual que su campo en el RUP
 * (`experiencia_total_smmlv`). La traducción vive en UN mapa explícito en
 * `utils/sigp/cumplimiento.ts` — nunca por coincidencia de nombre, que es
 * justo cómo se cuelan los bugs silenciosos.
 */
export const INDICADORES_RUP = [
  'liquidez', 'endeudamiento', 'cobertura_intereses',
  'rentabilidad_patrimonio', 'rentabilidad_activo', 'experiencia_smmlv',
] as const
export type IndicadorRup = typeof INDICADORES_RUP[number]

/** `gte`: el valor de NEG debe ser MAYOR O IGUAL al exigido (liquidez,
 *  experiencia). `lte`: MENOR O IGUAL (endeudamiento es un techo). */
export const OPERADORES_REQUISITO = ['gte', 'lte'] as const
export type OperadorRequisito = typeof OPERADORES_REQUISITO[number]

// ── Labels ───────────────────────────────────────────────────────────────────

export const CATEGORIA_REQUISITO_LABEL: Record<CategoriaRequisito, string> = {
  juridico: 'Jurídico',
  financiero: 'Financiero',
  tecnico: 'Técnico',
  experiencia: 'Experiencia',
  personal: 'Personal',
  otro: 'Otro',
}

export const ESTADO_REQUISITO_LABEL: Record<EstadoRequisito, string> = {
  pendiente: 'Pendiente',
  cumple: 'Cumple',
  no_cumple: 'No cumple',
  no_aplica: 'No aplica',
}

export const INDICADOR_RUP_LABEL: Record<IndicadorRup, string> = {
  liquidez: 'Índice de liquidez',
  endeudamiento: 'Índice de endeudamiento',
  cobertura_intereses: 'Razón de cobertura de intereses',
  rentabilidad_patrimonio: 'Rentabilidad del patrimonio',
  rentabilidad_activo: 'Rentabilidad del activo',
  experiencia_smmlv: 'Experiencia acreditada (SMMLV)',
}

// ── Sub-tipos ────────────────────────────────────────────────────────────────

/**
 * Registros del panel donde YA vive el dato personal de alguien.
 *
 * `ref_tipo` + `ref_id` apuntan al registro; el requisito NO guarda copia.
 * No hay valor "externo" a propósito: si la persona no está en ningún
 * registro, hay que inscribirla — esa fricción es la correcta, porque es la
 * que mantiene un solo custodio por dato.
 */
/**
 * ⛔ FRONTERA DEL MÓDULO: licitaciones SOLO LEE `users` y `contratistas`
 * (y sus sub-documentos). NUNCA escribe en ellas — son de otros frentes:
 * `users` lo administra SST/GI (y su `rol` solo admin, PR #165),
 * `contratistas` lo inscribe GI y su aval lo mueve Gestión Administrativa.
 * Lo mismo con `empleados_directos`, que mantiene el frente SGI/SST.
 * Este módulo apunta a esos registros; no los toca. Mismo patrón que el
 * "consulta, no gestión" de la regla 7.2 de la casa.
 *
 * ⚠ QUIÉN PUEDE RESOLVER CADA REFERENCIA (verificado en firestore.rules,
 * 22-oct). Los roles del módulo son `gestionaLicitaciones()`:
 * operacion_comercial · gerencia_general · gerencia_administrativa ·
 * director_proyectos · admin.
 *
 *   usuario_panel        TODOS      read de `users` = esPersonalPanel()
 *   nomina_contratista   TODOS      read del privado incluye
 *                                   puedeGestionarProyectos() ∪ gestionaCompras()
 *   documento_empresa    TODOS      colección propia del módulo
 *   adjunto_licitacion   TODOS      Storage `licitaciones/**` = esInterno()
 *   empleado_directo     SOLO gerencia_administrativa y admin
 *                                   read = gestionaEmpleados() — Karen
 *                                   (operacion_comercial), gerencia_general y
 *                                   director_proyectos pueden GUARDAR el
 *                                   puntero pero NO seguirlo.
 *
 * Esa asimetría no invalida el puntero —queda auditable y gerencia sí lo
 * resuelve—, pero el A.2 tiene que mostrarla honestamente en vez de pintar
 * un enlace roto. Si molesta, se acota el selector por rol; ampliar el read
 * de `empleados_directos` NO es decisión de este módulo.
 */
export const REF_PERSONA_TIPOS = [
  'empleado_directo',     // maestro `empleados_directos` (lo mantiene el frente SGI/SST)
  'usuario_panel',        // `users` — personal con cuenta
  'nomina_contratista',   // `contratistas/{id}/privado/nomina`
  'documento_empresa',    // una certificación que ya es DocumentoEmpresa
  'adjunto_licitacion',   // un archivo en Storage bajo `licitaciones/{id}/...`
] as const
export type RefPersonaTipo = typeof REF_PERSONA_TIPOS[number]

export const REF_PERSONA_TIPO_LABEL: Record<RefPersonaTipo, string> = {
  empleado_directo: 'Personal directo NEG',
  usuario_panel: 'Usuario del panel',
  nomina_contratista: 'Nómina del contratista',
  documento_empresa: 'Documento de la empresa',
  adjunto_licitacion: 'Adjunto de esta licitación',
}

/**
 * `adjunto_licitacion` — el profesional que se PROPONE.
 *
 * Es el caso que las otras cuatro referencias no cubren: el pliego exige un
 * especialista que NEG vincula solo si gana, así que todavía no está en
 * ninguna nómina ni tiene cuenta. Su hoja de vida y su matrícula se adjuntan
 * a la licitación y `ref_id` apunta a ese archivo
 * (`licitaciones/{id}/{tipoDoc}/{fileName}`, con `tipoDoc` de la whitelist
 * que ya existe desde el 1.2: pliego · propuesta · evidencia · subsanacion
 * — no hace falta tocar `storage.rules`).
 *
 * Por qué NO rompe la regla del custodio único: no CREA custodia de datos
 * personales en ningún registro del panel. El archivo es el soporte que la
 * entidad va a mirar, con el mismo alcance y la misma vida que la propuesta;
 * si NEG gana y la persona entra, ahí sí la inscribe el frente que
 * corresponda y la referencia futura será a su registro. Mientras tanto no
 * hay una ficha a medio llenar envejeciendo en una colección ajena.
 */

/**
 * La persona concreta que acredita un requisito de personal — POR REFERENCIA.
 *
 * ⛔ AQUÍ NO VA NINGÚN DOCUMENTO DE IDENTIDAD, y hay un test de guarda que
 * tumba la suite si reaparece `documento`, `cedula`, `nit`, `identificacion`
 * o `numero_documento`.
 *
 * La cédula es dato personal bajo la Ley 1581/2012 y el sistema ya tiene UN
 * custodio para ella: `contratistas/{id}/privado/datos` (C2.1 paso 5, donde
 * se sacó del doc público y las reglas prohíben que vuelva), la nómina
 * precargada en `contratistas/{id}/privado/nomina`, y el maestro
 * `empleados_directos`. Copiarla al checklist de cada licitación crearía un
 * segundo custodio que envejece solo, en una colección cuyos lectores son
 * otros — y volvería a abrir, por una puerta nueva, lo que ese bloque cerró.
 *
 * Lo que el checklist necesita saber no es el número: es QUIÉN y DÓNDE está
 * acreditado. `nombre` y `cargo` son lo que sale en la propuesta; `ref_tipo`
 * y `ref_id` son el puntero al registro que sí custodia el dato.
 *
 * Es la restricción §5.10 de la casa aplicada a datos personales: cuando ya
 * hay un custodio, guardamos la referencia, no una segunda copia.
 */
export interface PersonaRequisito {
  /** Nombre como va en la propuesta. */
  nombre: string
  /** El rol que pide el pliego ("ingeniero residente", "coordinador de alturas"). */
  cargo: string
  /** Qué registro custodia sus datos. */
  ref_tipo: RefPersonaTipo
  /** Id de la ficha en ese registro. */
  ref_id: string
}

// ── El requisito ─────────────────────────────────────────────────────────────

export interface Requisito {
  categoria: CategoriaRequisito
  /** LITERAL del pliego. No se parafrasea: lo que se va a discutir con la
   *  entidad es su texto, no nuestro resumen. */
  descripcion: string
  /** Numeral del pliego ("3.2.1", "Anexo 4"). Trazabilidad: ante una
   *  observación, se vuelve al punto exacto. `null` si no se registró. */
  fuente_pliego: string | null

  tipo_evidencia: TipoEvidencia
  /**
   * Apunta a un `DocumentoEmpresa`. Solo con
   * `tipo_evidencia === 'documento_empresa'`.
   *
   * 🔴 ALCANCE (A.2a): **la colección `documentos_empresa` NO EXISTE
   * todavía** y su dueño está PENDIENTE DE DECISIÓN DE FRONTERAS — los
   * papeles de habilitación de la empresa (RUP, cámara, pólizas,
   * parafiscales) son material que Gestión Integral ya custodia en otros
   * frentes, y crear una colección propia del módulo sin esa conversación
   * repetiría el error del SEGUNDO custodio que el A.1b acaba de cerrar
   * para la cédula.
   *
   * Hasta que se resuelva, los requisitos con
   * `tipo_evidencia === 'documento_empresa'` NO TIENEN A QUÉ APUNTAR y se
   * verifican con `ref_tipo: 'adjunto_licitacion'` — el archivo adjunto al
   * proceso. Este campo queda declarado y sin consumidor, deliberadamente.
   */
  documento_empresa_id: string | null
  /** Solo con `tipo_evidencia === 'documento_personal'` o
   *  `categoria === 'personal'`. Ver invariante 3. */
  persona: PersonaRequisito | null

  /** Solo con `tipo_evidencia === 'indicador'`. */
  indicador: IndicadorRup | null
  operador: OperadorRequisito | null
  /** Lo que el pliego EXIGE. */
  valor_exigido: number | null
  /** Lo que NEG TIENE, copiado del RUP por `evaluarIndicador`. Ver
   *  invariante 4: sin este número no hay `cumple`. */
  valor_neg: number | null

  estado: EstadoRequisito
  verificado_por: string | null
  verificado_en: Timestamp | null
  observacion: string

  /**
   * Soft-delete (restricción 5.1 de la casa): nada se borra físicamente, y
   * las reglas de `licitaciones/{id}/requisitos` DENIEGAN el delete incluso
   * para admin.
   *
   * Los dos caminos, que NO son el mismo:
   *  · `activo: false`  — el requisito estaba MAL CREADO (duplicado, typo,
   *    se capturó del pliego equivocado). Deja de contar para el checklist.
   *  · `estado: 'no_aplica'` — el requisito es REAL y del pliego, pero no
   *    nos aplica. Cuenta como resuelto y exige firma (invariante 2).
   *
   * Confundirlos borra información: un `no_aplica` dice que alguien lo
   * miró y decidió; un `activo: false` dice que nunca debió estar ahí.
   */
  activo: boolean

  creado_por: string
  creado_en: Timestamp
  actualizado_por: string
  actualizado_en: Timestamp
}

// ── Validadores de las invariantes ───────────────────────────────────────────

/** Invariante 2: un veredicto exige firma. */
export function veredictoFirmado(
  r: Pick<Requisito, 'estado' | 'verificado_por' | 'verificado_en'>,
): boolean {
  if (r.estado === 'pendiente') return true
  return (r.verificado_por ?? '').trim() !== '' && r.verificado_en !== null
}

/**
 * Invariante 3: un requisito de personal no se cumple en abstracto.
 * Solo rige para `cumple` — un `no_cumple` precisamente suele significar
 * "no tenemos a nadie que lo acredite", y exigir la persona ahí sería
 * imposible de registrar.
 */
export function personalAcreditado(
  r: Pick<Requisito, 'categoria' | 'estado' | 'persona'>,
): boolean {
  if (r.categoria !== 'personal') return true
  if (r.estado !== 'cumple') return true
  const p = r.persona
  if (p === null) return false
  // Nombre + referencia RESOLUBLE. Sin el puntero, "Luis Peña" sigue siendo
  // una afirmación sin respaldo: nadie puede ir a verificar nada.
  return p.nombre.trim() !== ''
    && p.ref_id.trim() !== ''
    && REF_PERSONA_TIPOS.includes(p.ref_tipo)
}

/**
 * Invariante 4: el indicador se evalúa, no se declara.
 * También solo para `cumple`: marcar `no_cumple` sin el número es legítimo
 * ("el RUP no lo reporta y la entidad no lo acepta").
 */
export function indicadorMedido(
  r: Pick<Requisito, 'tipo_evidencia' | 'estado' | 'valor_neg'>,
): boolean {
  if (r.tipo_evidencia !== 'indicador') return true
  if (r.estado !== 'cumple') return true
  return typeof r.valor_neg === 'number' && Number.isFinite(r.valor_neg)
}

/** Las tres de forma juntas — equivalente de `licitacionConsistente`. */
export function requisitoConsistente(r: Requisito): boolean {
  return veredictoFirmado(r)
    && personalAcreditado(r)
    && indicadorMedido(r)
    && r.descripcion.trim() !== ''
}

// ── Invariante 1: la plantilla NO hereda estado ──────────────────────────────

/**
 * Los campos que SÍ viajan de un pliego al siguiente: la ESTRUCTURA de lo
 * que se exige. Nombrados aquí para que el conjunto sea auditable de un
 * vistazo — y para que agregar un campo al tipo obligue a decidir
 * explícitamente si viaja o no.
 */
export type PlantillaRequisito = Pick<
  Requisito,
  'categoria' | 'descripcion' | 'tipo_evidencia' | 'indicador' | 'operador' | 'valor_exigido'
>

/**
 * INVARIANTE 1. Clona requisitos de una licitación anterior como PLANTILLA.
 *
 * Copia la estructura y REINICIA todo lo demás: estado a `pendiente`,
 * `verificado_por`/`verificado_en` a null, `valor_neg` a null (el RUP de hoy
 * no es el de la licitación pasada), `persona` a null (la gente rota y las
 * certificaciones vencen), `documento_empresa_id` a null (hay que apuntar al
 * documento VIGENTE) y `fuente_pliego` a null (el numeral es de OTRO pliego;
 * conservarlo haría que una trazabilidad apunte al documento equivocado,
 * que es peor que no tener trazabilidad).
 *
 * ⚠ ESTA ES LA LECCIÓN DE 2026 ESCRITA EN CÓDIGO. Un requisito de personal
 * que estaba en `cumple` el año pasado NO está en `cumple` hoy: la persona
 * pudo haberse ido, su matrícula pudo haber caducado, el pliego pudo pedir
 * otro perfil. Heredar el estado es heredar una afirmación que ya nadie
 * verificó — y presentarse creyendo que algo está cubierto cuando no lo está
 * es exactamente cómo se pierde un proceso por un papel.
 */
export function clonarRequisitosComoPlantilla(
  origen: readonly Requisito[],
  actor: { uid: string },
  ahora: Timestamp,
): Requisito[] {
  return origen.map(r => ({
    // ── Lo que viaja: la estructura de la exigencia ──
    categoria: r.categoria,
    descripcion: r.descripcion,
    tipo_evidencia: r.tipo_evidencia,
    indicador: r.indicador,
    operador: r.operador,
    valor_exigido: r.valor_exigido,

    // ── Lo que NO viaja: todo rastro de veredicto o evidencia ──
    fuente_pliego: null,
    documento_empresa_id: null,
    persona: null,
    valor_neg: null,
    estado: 'pendiente' as EstadoRequisito,
    verificado_por: null,
    verificado_en: null,
    observacion: '',
    activo: true,

    creado_por: actor.uid,
    creado_en: ahora,
    actualizado_por: actor.uid,
    actualizado_en: ahora,
  }))
}

// ── Patch builder: el único dueño de las invariantes 2, 3 y 4 ───────────────

/** Datos que acompañan a un veredicto, según lo que el requisito exija. */
export interface DatosVeredicto {
  persona?: PersonaRequisito | null
  valor_neg?: number | null
  documento_empresa_id?: string | null
  observacion?: string
}

/**
 * ¿Se puede marcar este requisito con este estado y estos datos?
 *
 * La UI deshabilita el botón con ESTE predicado y el builder lo vuelve a
 * aplicar — igual que `datosPresentacionCompletos` en el 1.4, la regla vive
 * en un solo lugar y hay test de que no divergen.
 */
export function puedeMarcarseRequisito(
  r: Pick<Requisito, 'categoria' | 'tipo_evidencia' | 'persona' | 'valor_neg'>,
  destino: EstadoRequisito,
  datos?: DatosVeredicto,
): boolean {
  if (!ESTADOS_REQUISITO.includes(destino)) return false
  if (destino === 'pendiente') return true          // devolver a pendiente siempre se puede

  const persona = datos?.persona !== undefined ? datos.persona : r.persona
  const valorNeg = datos?.valor_neg !== undefined ? datos.valor_neg : r.valor_neg

  // Invariante 3
  if (!personalAcreditado({ categoria: r.categoria, estado: destino, persona })) return false
  // Invariante 4
  if (!indicadorMedido({ tipo_evidencia: r.tipo_evidencia, estado: destino, valor_neg: valorNeg })) {
    return false
  }
  return true
}

/**
 * Marca un requisito. Devuelve el objeto a persistir o `null` si el
 * movimiento viola una invariante.
 *
 * `verificado_por`/`verificado_en` los pone EL BUILDER (invariante 2): no son
 * un campo que la UI pueda olvidar. Volver a `pendiente` los limpia — un
 * requisito pendiente con firma sería una contradicción.
 */
export function patchMarcarRequisito(
  r: Requisito,
  destino: EstadoRequisito,
  actor: { uid: string },
  ahora: Timestamp,
  datos?: DatosVeredicto,
) {
  if (!puedeMarcarseRequisito(r, destino, datos)) return null
  if (actor.uid.trim() === '') return null          // invariante 2: sin actor no hay firma

  const firma = destino === 'pendiente'
    ? { verificado_por: null, verificado_en: null }
    : { verificado_por: actor.uid, verificado_en: ahora }

  return {
    estado: destino,
    ...firma,
    ...(datos?.persona !== undefined ? { persona: datos.persona } : {}),
    ...(datos?.valor_neg !== undefined ? { valor_neg: datos.valor_neg } : {}),
    ...(datos?.documento_empresa_id !== undefined
      ? { documento_empresa_id: datos.documento_empresa_id }
      : {}),
    ...(datos?.observacion !== undefined ? { observacion: datos.observacion } : {}),
    actualizado_por: actor.uid,
    actualizado_en: ahora,
  }
}
