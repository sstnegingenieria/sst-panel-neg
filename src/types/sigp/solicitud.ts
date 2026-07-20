// src/types/sigp/solicitud.ts
//
// Tipos del dominio Solicitud (Fase 1 — Comercial, etapas 1–2 del proceso).
// La colección `solicitudes` es la bandeja de entrada comercial que reemplaza
// correo/WhatsApp. Convención: campos Firestore en snake_case español.

import type { Timestamp } from 'firebase/firestore'
import type { Contacto } from './cliente'

// ── Enums de dominio ──────────────────────────────────────────────────────────

export type EstadoSolicitud =
  | 'recibida'
  | 'en_estudio'
  | 'lista_para_cotizar'
  | 'requiere_visita'
  | 'cotizada'
  | 'aceptada'      // F2.2 — terminal, SOLO preventivos (aceptar crea el proyecto)
  | 'descartada'

/** F2.2 — tipo de solicitud. Ausente en docs existentes → 'comercial'
 *  (el flujo comercial de F1 NO cambia). */
export type TipoSolicitud = 'comercial' | 'preventivo'

/** Datos del preventivo IHS capturados en la asignación (sin maestro de
 *  sitios: el sitio nace aquí). La zona y es_sai se derivan del departamento
 *  al registrar (se guardan denormalizados como evidencia). */
export interface DatosPreventivo {
  sitio_id?: string            // id IHS del sitio (opcional)
  sitio_nombre: string
  tipo_sitio: 'greenfield' | 'rooftop'
  intensidad: 'liviano' | 'pesado'
  es_jungle: boolean
  departamento: string
  zona: 'Z1' | 'Z2' | 'Z3'
  es_sai: boolean
  fecha_asignacion?: Timestamp
}

export type Canal = 'correo' | 'whatsapp' | 'telefono' | 'presencial' | 'otro'

// ── Sub-tipos embebidos ───────────────────────────────────────────────────────

/** Entrada del historial de cambios de estado (evidencia ISO 8.2). */
export interface CambioEstado {
  de: EstadoSolicitud | null   // null en el registro inicial (creación)
  a: EstadoSolicitud
  por: string                  // uid de quien hizo la transición
  fecha: Timestamp
  motivo?: string              // obligatorio al descartar; opcional en el resto
}

/** Adjunto en Storage (solicitudes/{solicitudId}/...). */
export interface Adjunto {
  nombre: string               // nombre de archivo mostrado
  url: string                  // download URL de Storage
  content_type?: string
  tamano?: number              // bytes
  subido_en?: Timestamp
}

// ── Documento principal (colección `solicitudes`) ─────────────────────────────

export interface Solicitud {
  id: string
  consecutivo: string          // SOL-YYYY-NNN (Cloud Function generarConsecutivo)

  // Origen: cliente existente y/o prospecto sin registro. Regla de integridad
  // (validada en el form): al menos uno de cliente_id / prospecto_nombre. La
  // formalización a cliente se exige al cotizar (F1.4).
  cliente_id?: string
  prospecto_nombre?: string    // nombre de la empresa/persona si aún no es cliente

  contacto: Contacto           // persona que hizo la solicitud
  canal: Canal
  descripcion: string
  sitio?: string               // ubicación de la obra/servicio solicitado
  fecha_recepcion: Timestamp   // cuándo llegó (puede diferir del registro)
  responsable: string          // uid del comercial que la registra/gestiona
  estado: EstadoSolicitud
  historial: CambioEstado[]    // arranca con { de: null, a: 'recibida', ... }
  motivo_descarte?: string     // denormalizado para lista/detalle (= historial)

  // F2.2 — preventivos IHS (tras sigp_f2_enabled)
  tipo?: TipoSolicitud         // ausente → 'comercial'
  preventivo?: DatosPreventivo // solo si tipo === 'preventivo'
  proyecto_id?: string         // proyecto nacido al ACEPTAR el preventivo (1:1)
  proyecto_consecutivo?: string
  adjuntos: Adjunto[]
  fecha_creacion: Timestamp    // sello de registro en el sistema
  fecha_actualizacion?: Timestamp
}

// ── Constantes ────────────────────────────────────────────────────────────────

export const ESTADOS_SOLICITUD = [
  'recibida', 'en_estudio', 'lista_para_cotizar',
  'requiere_visita', 'cotizada', 'aceptada', 'descartada',
] as const

export const CANALES = ['correo', 'whatsapp', 'telefono', 'presencial', 'otro'] as const

export const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  recibida: 'Recibida',
  en_estudio: 'En estudio',
  lista_para_cotizar: 'Lista para cotizar',
  requiere_visita: 'Requiere visita',
  cotizada: 'Cotizada',
  aceptada: 'Aceptada · proyecto creado',
  descartada: 'Descartada',
}

export const ESTADO_COLOR: Record<EstadoSolicitud, string> = {
  recibida:            'bg-gray-100 text-gray-600',
  en_estudio:          'bg-amber-100 text-amber-800',
  lista_para_cotizar:  'bg-emerald-100 text-emerald-800',
  requiere_visita:     'bg-lime-100 text-lime-800',
  cotizada:            'bg-brand-100 text-brand-800',
  aceptada:            'bg-emerald-100 text-emerald-800',
  descartada:          'bg-rose-100 text-rose-800',
}

export const CANAL_LABEL: Record<Canal, string> = {
  correo: 'Correo',
  whatsapp: 'WhatsApp',
  telefono: 'Teléfono',
  presencial: 'Presencial',
  otro: 'Otro',
}

/**
 * Transiciones manuales permitidas desde la UI (máquina de estados, 1.2.d).
 * Toda transición se registra en el historial (quién/cuándo, motivo si aplica),
 * incluidas las de CORRECCIÓN hacia atrás (marcar un estado por error): la
 * corrección queda auditada, no se borra nada.
 *
 * `cotizada` NO es alcanzable manualmente: la escribe F1.4 al crear la
 * cotización (evidencia = hacer el trabajo, no un clic).
 * `descartada` es TERMINAL (una solicitud descartada no se reactiva; si fue
 * error, se registra una nueva). Terminales: [].
 */
export const TRANSICIONES: Record<EstadoSolicitud, EstadoSolicitud[]> = {
  recibida:            ['en_estudio', 'descartada'],
  en_estudio:          ['lista_para_cotizar', 'requiere_visita', 'recibida', 'descartada'],
  lista_para_cotizar:  ['en_estudio', 'descartada'],                    // ← corrección; cotizada ← F1.4
  requiere_visita:     ['lista_para_cotizar', 'en_estudio', 'descartada'], // lista ← F1.3; en_estudio = corrección
  cotizada:            [],                                   // terminal (F1.4)
  aceptada:            [],                                   // terminal (F2.2, solo preventivos — la escribe el ACEPTAR, no un clic genérico)
  descartada:          [],                                   // terminal (no reactivable)
}
