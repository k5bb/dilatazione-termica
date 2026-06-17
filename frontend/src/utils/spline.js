/**
 * Monotone piecewise cubic Hermite interpolation (PCHIP / Fritsch-Carlson).
 * Produces smooth curves that never overshoot monotone data.
 *
 * xs: sorted array of x values (must be strictly increasing)
 * ys: corresponding y values
 * Returns a function f(x) → y
 */
export function pchip(xs, ys) {
  const n = xs.length
  if (n < 2) return x => ys[0]

  const h = new Array(n - 1)
  const delta = new Array(n - 1)
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i]
    delta[i] = (ys[i + 1] - ys[i]) / h[i]
  }

  // Fritsch-Carlson slopes
  const m = new Array(n)
  m[0] = delta[0]
  m[n - 1] = delta[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      m[i] = 0  // local extremum → zero slope to prevent overshoot
    } else {
      const w1 = 2 * h[i] + h[i - 1]
      const w2 = h[i] + 2 * h[i - 1]
      m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
    }
  }

  return function interp(x) {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    // Binary search for interval
    let lo = 0, hi = n - 2
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (xs[mid + 1] < x) lo = mid + 1
      else hi = mid
    }
    const t = (x - xs[lo]) / h[lo]
    const t2 = t * t, t3 = t2 * t
    // Hermite basis
    return ys[lo]     * (2 * t3 - 3 * t2 + 1)
         + m[lo]      * h[lo] * (t3 - 2 * t2 + t)
         + ys[lo + 1] * (-2 * t3 + 3 * t2)
         + m[lo + 1]  * h[lo] * (t3 - t2)
  }
}

/**
 * Generate a dense array of {h_mm, d_int_mm} points from sparse input using PCHIP.
 * stepMm: output resolution (default 1mm)
 */
export function densifyProfile(points, stepMm = 1) {
  if (!points || points.length < 2) return points
  const sorted = [...points].sort((a, b) => a.h_mm - b.h_mm)
  const xs = sorted.map(p => p.h_mm)
  const ys = sorted.map(p => p.d_int_mm)
  const f = pchip(xs, ys)
  const result = []
  const h0 = xs[0], h1 = xs[xs.length - 1]
  for (let h = h0; h <= h1 + 1e-9; h += stepMm) {
    result.push({ h_mm: Math.round(h * 10) / 10, d_int_mm: Math.round(f(h) * 100) / 100 })
  }
  return result
}
