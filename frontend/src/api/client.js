const BASE = import.meta.env.VITE_API_URL ?? ''

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.detail?.[0]?.msg ?? data?.detail ?? 'Errore API'
    throw new Error(msg)
  }
  return data
}

export const getBottiglie  = () => request('GET', '/bottiglie')
export const calcola       = (payload) => request('POST', '/calcola', payload)
export const euCompliance  = (payload) => request('POST', '/eu-compliance', payload)

export async function parsePdf(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/parse-pdf`, { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.detail?.[0]?.msg ?? data?.detail ?? 'Errore parsing PDF'
    throw new Error(msg)
  }
  return data
}
