// OC1 — Cargo y celular del firmante de documentos externos (PDF de orden
// de compra: bloque de firma del CREADOR). Captura SOLO por el panel de
// Usuarios del admin — el cargo sale a terceros, no puede escribírselo
// cada quien (decisión de Giovanny). La regla lo permite vía
// puedeAdministrarSST() (update administrativo de users), sin cambio de reglas.
import { useEffect, useState } from 'react'
import { doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase/config'
import Modal from './shared/Modal'
import TextField from './shared/TextField'
import { Tecnico } from './UsuariosPendientes'

interface Props {
  isOpen: boolean
  onClose: () => void
  usuario: Tecnico | null
  onGuardado: () => void
}

export default function EditarFirmaModal({ isOpen, onClose, usuario, onGuardado }: Props) {
  const [cargo, setCargo] = useState('')
  const [celular, setCelular] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen && usuario) {
      setCargo(usuario.cargo ?? '')
      setCelular(usuario.celular ?? '')
    }
  }, [isOpen, usuario])

  const guardar = async () => {
    if (!usuario) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'users', usuario.id), {
        cargo: cargo.trim() || deleteField(),
        celular: celular.trim() || deleteField(),
      })
      onGuardado()
      onClose()
    } catch {
      // el caller muestra el toast de éxito; el fallo se informa acá
      window.alert('No se pudo guardar. Verifica tu conexión e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={`Firma en documentos — ${usuario?.nombre ?? ''}`}
      onClose={onClose}
      actions={[
        { label: 'Cancelar', onClick: onClose, variant: 'secondary' },
        { label: 'Guardar', onClick: guardar, variant: 'primary', loading: saving },
      ]}
    >
      <p className="text-xs text-gray-500 mb-4">
        Estos datos aparecen en el bloque de firma de los documentos que salen a
        terceros (órdenes de compra). Solo el administrador los edita.
      </p>
      <div className="space-y-4">
        <TextField
          label="Cargo"
          value={cargo}
          onChange={setCargo}
          placeholder="Ej: Auxiliar de Proyectos"
        />
        <TextField
          label="Celular"
          value={celular}
          onChange={setCelular}
          placeholder="Ej: 350 7306272"
        />
      </div>
    </Modal>
  )
}
