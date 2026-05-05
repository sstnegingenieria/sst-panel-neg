import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
  DocumentData,
  QueryConstraint,
} from 'firebase/firestore'
import { db } from '../firebase/config'

export function useFirestore() {
  const add = async (col: string, data: DocumentData) => {
    const ref = await addDoc(collection(db, col), {
      ...data,
      fecha_creacion: Timestamp.now(),
    })
    return ref.id
  }

  const update = async (col: string, docId: string, data: Partial<DocumentData>) => {
    await updateDoc(doc(db, col, docId), {
      ...data,
      fecha_actualizacion: Timestamp.now(),
    })
  }

  const remove = async (col: string, docId: string) => {
    await deleteDoc(doc(db, col, docId))
  }

  const getAll = async (col: string, ...constraints: QueryConstraint[]) => {
    const q = query(collection(db, col), ...constraints)
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }

  const getAllOrdered = async (col: string, field: string, dir: 'asc' | 'desc' = 'asc') => {
    return getAll(col, orderBy(field, dir))
  }

  return { add, update, remove, getAll, getAllOrdered }
}
