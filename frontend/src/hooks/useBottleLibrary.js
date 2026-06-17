import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function useBottleLibrary() {
  const { token } = useAuth()
  const [bottles, setBottles] = useState([])

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const reload = useCallback(async () => {
    if (!token) { setBottles([]); return }
    const res  = await fetch('/user/bottles', { headers: authHeaders })
    if (res.ok) setBottles(await res.json())
  }, [token])

  useEffect(() => { reload() }, [reload])

  const addBottle = useCallback(async (data) => {
    const res = await fetch('/user/bottles', {
      method:  'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name:             data.name ?? 'Bottiglia',
        volume_mL:        data.volume_mL        ?? null,
        h_fill_mm:        data.h_fill_mm        ?? null,
        bore_diameter_mm: data.bore_diameter_mm ?? null,
        neck_points:      data.neck_points      ?? null,
        source:           data.source           ?? 'manual',
      }),
    })
    const saved = await res.json()
    if (res.ok) setBottles(prev => [...prev, saved])
    return saved
  }, [token])

  const removeBottle = useCallback(async (id) => {
    await fetch(`/user/bottles/${id}`, { method: 'DELETE', headers: authHeaders })
    setBottles(prev => prev.filter(b => b.id !== id))
  }, [token])

  // renameBottle: non supportato lato server per ora
  const renameBottle = useCallback(() => {}, [])

  return { bottles, addBottle, removeBottle, renameBottle, reload }
}
