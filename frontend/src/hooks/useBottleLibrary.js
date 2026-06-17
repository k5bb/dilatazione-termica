import { useState, useCallback } from 'react'

const KEY = 'dtt_bottle_library_v1'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(bottles) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bottles))
  } catch { /* storage full */ }
}

/**
 * useBottleLibrary — CRUD hook backed by localStorage.
 *
 * Each bottle:
 *   { id, name, volume_mL, h_fill_mm, bore_diameter_mm, neck_points, source, createdAt }
 *
 * neck_points: [{h_mm, d_int_mm}] | null
 */
export function useBottleLibrary() {
  const [bottles, setBottles] = useState(load)

  const addBottle = useCallback((data) => {
    const entry = {
      id: crypto.randomUUID(),
      name: data.name ?? 'Bottiglia',
      volume_mL: data.volume_mL ?? null,
      h_fill_mm: data.h_fill_mm ?? null,
      bore_diameter_mm: data.bore_diameter_mm ?? null,
      neck_points: data.neck_points ?? null,
      source: data.source ?? 'manual',
      createdAt: new Date().toISOString(),
    }
    setBottles(prev => {
      const updated = [...prev, entry]
      persist(updated)
      return updated
    })
    return entry
  }, [])

  const removeBottle = useCallback((id) => {
    setBottles(prev => {
      const updated = prev.filter(b => b.id !== id)
      persist(updated)
      return updated
    })
  }, [])

  const renameBottle = useCallback((id, newName) => {
    setBottles(prev => {
      const updated = prev.map(b => b.id === id ? { ...b, name: newName } : b)
      persist(updated)
      return updated
    })
  }, [])

  return { bottles, addBottle, removeBottle, renameBottle }
}
