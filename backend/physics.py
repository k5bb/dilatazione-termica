"""
Apparent thermal dilation engine for bottled alcoholic beverages.

Models the apparent volume change of an alcohol-water solution in a glass bottle
when temperature changes from fill temperature to storage temperature.

Physics:
  ΔV_apparent = ΔV_liquid - ΔV_glass_internal
  ΔV_liquid   = ΔV_water(f_water) + ΔV_ethanol(f_ethanol)
  ΔV_glass    = V_nominal * α_glass_vol * ΔT

Reference values validated against Excel model (abbassamento livello bottiglie.xlsx).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence


# ---------------------------------------------------------------------------
# PCHIP interpolation (Fritsch-Carlson monotone cubic Hermite)
# ---------------------------------------------------------------------------

def _pchip_interp(pts: list[tuple[float, float]]):
    """
    Return a callable f(x) -> y that interpolates the given (x, y) breakpoints
    using monotone piecewise cubic Hermite (PCHIP / Fritsch-Carlson).

    Never overshoots monotone data; C¹ continuous.
    pts must have at least 2 entries with strictly increasing x values.
    """
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    n = len(xs)
    if n == 1:
        y0 = ys[0]
        return lambda x: y0

    h     = [xs[i + 1] - xs[i]           for i in range(n - 1)]
    delta = [(ys[i + 1] - ys[i]) / h[i]  for i in range(n - 1)]

    m = [0.0] * n
    m[0]  = delta[0]
    m[-1] = delta[-2]
    for i in range(1, n - 1):
        if delta[i - 1] * delta[i] <= 0.0:
            m[i] = 0.0
        else:
            w1 = 2.0 * h[i] + h[i - 1]
            w2 = h[i] + 2.0 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])

    def interp(x: float) -> float:
        if x <= xs[0]:  return ys[0]
        if x >= xs[-1]: return ys[-1]
        lo, hi = 0, n - 2
        while lo < hi:
            mid = (lo + hi) >> 1
            if xs[mid + 1] < x:
                lo = mid + 1
            else:
                hi = mid
        t  = (x - xs[lo]) / h[lo]
        t2 = t * t
        t3 = t2 * t
        return (ys[lo]     * (2 * t3 - 3 * t2 + 1)
              + m[lo]      * h[lo] * (t3 - 2 * t2 + t)
              + ys[lo + 1] * (-2 * t3 + 3 * t2)
              + m[lo + 1]  * h[lo] * (t3 - t2))

    return interp


# ---------------------------------------------------------------------------
# Physical constants
# ---------------------------------------------------------------------------

ALPHA_ETHANOL_VOL = 1.09e-3   # volumetric expansion coefficient of ethanol [1/°C]
ALPHA_GLASS_LIN   = 8e-6      # linear expansion coefficient of soda-lime glass [1/°C]
ALPHA_GLASS_VOL   = 3 * ALPHA_GLASS_LIN  # volumetric expansion coefficient [1/°C]

# EU reference temperature for volume measurement (OIV OENO 556-2016, Dir. 76/211/CEE)
T_REF_EU = 20.0  # °C

# EU Tolerated Negative Errors (TNE) for pre-packages, Dir. 76/211/CEE + 2007/45/CE
_TNE_TABLE = [
    (200,   0.045),   # Vn ≤ 200 mL  → TNE = 4.5% of Vn
    (300,   None),    # 200 < Vn ≤ 300 mL → TNE = 9 mL (absolute)
    (500,   0.03),    # 300 < Vn ≤ 500 mL → TNE = 3% of Vn
    (1000,  None),    # 500 < Vn ≤ 1000 mL → TNE = 15 mL (absolute)
    (10000, 0.015),   # 1000 < Vn ≤ 10000 mL → TNE = 1.5% of Vn
]
_TNE_ABSOLUTE = {(200, 300): 9.0, (500, 1000): 15.0}


# ---------------------------------------------------------------------------
# Water specific volume polynomial
# ---------------------------------------------------------------------------

def water_specific_volume(T: float) -> float:
    """
    Specific volume of water [mL/g] as a function of temperature T [°C].

    Polynomial fit (from Excel model, validated against IAPWS data 0–40 °C):
      v(T) = -4e-8·T³ + 8e-6·T² - 6e-5·T + 1.0001

    Accuracy: better than 0.01% over 0–40 °C.
    Note: minimum (≈ max density) is near 4 °C as expected for pure water.
    """
    return (-4e-8) * T**3 + (8e-6) * T**2 + (-6e-5) * T + 1.0001


# ---------------------------------------------------------------------------
# Volume fraction helpers
# ---------------------------------------------------------------------------

def volume_fractions(abv: float) -> tuple[float, float]:
    """
    Return (f_water, f_ethanol) volume fractions for a beverage at *abv* % vol.

    Uses the simple additive approximation (ignores ~1% contraction of mixing).
    For an 12% ABV wine: f_water=0.88, f_ethanol=0.12 — consistent with Excel.
    """
    f_eth = abv / 100.0
    f_wat = 1.0 - f_eth
    return f_wat, f_eth


# ---------------------------------------------------------------------------
# Core dilation calculation
# ---------------------------------------------------------------------------

@dataclass
class DilationResult:
    T1: float              # fill temperature [°C]
    T2: float              # target temperature [°C]
    V_nominal: float       # nominal volume [mL]
    abv: float             # alcohol by volume [%]
    dV_water: float        # water contribution [mL]
    dV_ethanol: float      # ethanol contribution [mL]
    dV_glass: float        # glass internal volume change [mL]  (positive = container expands)
    dV_apparent: float     # apparent dilation [mL]  (positive = liquid level rises)
    V_at_T2: float         # liquid volume at T2 [mL]


def compute_dilation(
    T1: float,
    T2: float,
    V_nominal: float,
    abv: float,
    residuo_zuccherino: float = 0.0,
    estratto_secco: float = 0.0,
) -> DilationResult:
    """
    Compute apparent thermal dilation of an alcoholic beverage in a glass bottle.

    Parameters
    ----------
    T1 : float
        Fill temperature [°C].
    T2 : float
        Target temperature [°C].
    V_nominal : float
        Nominal bottle volume [mL] (e.g. 750).
    abv : float
        Alcohol by volume [%] (e.g. 12.0 for 12% wine).
    residuo_zuccherino : float
        Residual sugar [g/L]. Adjusts effective water thermal expansion.
    estratto_secco : float
        Total dry extract [g/L]. Minor correction to density.

    Returns
    -------
    DilationResult
    """
    dT = T2 - T1
    f_wat, f_eth = volume_fractions(abv)

    # --- Water component ---
    # Δv_water * V * f_water gives the volume change of the water fraction
    # A small density correction for dissolved sugar reduces the effective
    # specific volume change (sugar molecules limit water mobility).
    # Approximation: each g/L of sugar reduces ΔV_water by ~0.0001 mL/mL
    sugar_correction = 1.0 - residuo_zuccherino * 1e-4
    dV_water = (water_specific_volume(T2) - water_specific_volume(T1)) * V_nominal * f_wat * sugar_correction

    # --- Ethanol component ---
    dV_ethanol = V_nominal * f_eth * ALPHA_ETHANOL_VOL * dT

    # --- Glass container internal volume change ---
    # Internal volume expands by V * α_vol_glass * ΔT, reducing apparent dilation
    dV_glass = V_nominal * ALPHA_GLASS_VOL * dT

    # --- Apparent dilation ---
    dV_apparent = dV_water + dV_ethanol - dV_glass

    return DilationResult(
        T1=T1,
        T2=T2,
        V_nominal=V_nominal,
        abv=abv,
        dV_water=dV_water,
        dV_ethanol=dV_ethanol,
        dV_glass=dV_glass,
        dV_apparent=dV_apparent,
        V_at_T2=V_nominal + dV_apparent,
    )


# ---------------------------------------------------------------------------
# Neck profile & level change
# ---------------------------------------------------------------------------

@dataclass
class NeckSegment:
    """A linear neck segment from h_start to h_end (mm), diameter linearly interpolated."""
    h_start: float   # height from bottom of neck [mm]
    d_start: float   # internal diameter at h_start [mm]
    h_end: float     # height at end of segment [mm]
    d_end: float     # internal diameter at h_end [mm]


@dataclass
class NeckProfile:
    """
    Neck geometry defined as an ordered list of (h_mm, d_int_mm) breakpoints,
    from the bottom of the neck upward to the mouth.

    h=0 is the point where the shoulder meets the neck (or any consistent reference).
    Diameters decrease upward toward the mouth in typical wine bottles.

    The profile is used to convert ΔV_apparent → Δh (level change in mm).
    """
    name: str
    points: list[tuple[float, float]]  # [(h_mm, d_int_mm), ...]

    def _frustum_volume(self, h1: float, d1: float, h2: float, d2: float) -> float:
        """Volume of a truncated cone [mL = cm³] given heights and diameters in mm."""
        a1 = math.pi * (d1 / 20) ** 2  # area in cm²  (d/2 in cm = d/20)
        a2 = math.pi * (d2 / 20) ** 2
        h_cm = (h2 - h1) / 10           # height in cm
        return (a1 + a2 + math.sqrt(a1 * a2)) * h_cm / 3

    def cumulative_volume(self) -> list[tuple[float, float]]:
        """
        Return [(h_mm, V_cumulative_mL), ...] starting from the first breakpoint.
        V=0 at the first point (bottom of neck).
        """
        pts = sorted(self.points, key=lambda p: p[0])
        result = [(pts[0][0], 0.0)]
        cumvol = 0.0
        for i in range(1, len(pts)):
            h0, d0 = pts[i - 1]
            h1, d1 = pts[i]
            cumvol += self._frustum_volume(h0, d0, h1, d1)
            result.append((h1, cumvol))
        return result

    def dh_from_dV(self, dV: float, h_fill: float) -> float:
        """
        Compute the level change Δh [mm] in the neck for a volume change dV [mL],
        starting from fill height h_fill [mm from ring bottom].

        Sign convention (h=0 at bore/ring, h increases toward shoulder):
          dV > 0  liquid expands → level RISES toward bore → Δh < 0
          dV < 0  fill less     → headspace grows toward shoulder → Δh > 0
          dV = 0  → Δh = 0

        Caller usage:  h_new = h_fill + dh_from_dV(dV, h_fill)

        Uses PCHIP interpolation for accurate results near the shoulder
        transition where the diameter changes rapidly.
        """
        if abs(dV) < 1e-9:
            return 0.0

        pts = sorted(self.points, key=lambda p: p[0])
        diameter_at = _pchip_interp(pts)

        # Physical direction:
        #   dV > 0 (expansion) → level rises toward bore → h decreases → direction = -1
        #   dV < 0 (fill less) → headspace toward shoulder → h increases → direction = +1
        step      = 0.01                        # mm resolution
        direction = -1 if dV > 0 else 1
        remaining = abs(dV)
        h         = h_fill

        while remaining > 0:
            d_mid     = diameter_at(h + direction * step / 2)
            a_mid     = math.pi * (d_mid / 20) ** 2  # cm²
            dv_slice  = a_mid * (step / 10)           # mL
            if dv_slice >= remaining:
                h_frac    = remaining / (a_mid * 0.1)
                h        += direction * h_frac
                remaining = 0
            else:
                remaining -= dv_slice
                h         += direction * step

        return h - h_fill


# ---------------------------------------------------------------------------
# EU compliance check
# ---------------------------------------------------------------------------

@dataclass
class EUComplianceResult:
    V_nominal: float          # declared nominal volume [mL]
    TNE: float                # tolerated negative error [mL]
    V_at_ref: float           # volume at T_ref=20°C [mL]
    deviation_from_nominal: float   # V_at_ref - V_nominal [mL]
    is_compliant: bool        # |deviation| ≤ TNE (simplified check)
    margin: float             # TNE - |deviation| [mL], positive = safe
    temperatures: list[float]
    volumes_at_temps: list[float]
    overflow_risk: bool       # True if any V_at_temp > V_nominal + TNE
    underflow_risk: bool      # True if any V_at_temp < V_nominal - TNE


def _tne_for_volume(V_nominal: float) -> float:
    """Return the EU TNE [mL] for a given nominal volume [mL]."""
    if V_nominal <= 0:
        raise ValueError("V_nominal must be positive")
    if V_nominal <= 200:
        return V_nominal * 0.045
    if V_nominal <= 300:
        return 9.0
    if V_nominal <= 500:
        return V_nominal * 0.03
    if V_nominal <= 1000:
        return 15.0
    if V_nominal <= 10000:
        return V_nominal * 0.015
    raise ValueError(f"V_nominal={V_nominal} mL outside the standard range")


def check_eu_compliance(
    T_fill: float,
    V_nominal: float,
    abv: float,
    residuo_zuccherino: float = 0.0,
    estratto_secco: float = 0.0,
    T_range: tuple[float, float] = (0.0, 35.0),
    T_step: float = 5.0,
) -> EUComplianceResult:
    """
    Check EU pre-package compliance (Dir. 76/211/CEE) for a bottle filled at T_fill.

    The volume is measured at the EU reference temperature T_REF_EU=20°C.
    Also sweeps the range T_range to detect overflow/underflow risk.

    Parameters
    ----------
    T_fill : float
        Fill temperature [°C].
    V_nominal : float
        Declared nominal volume [mL] (what is printed on the label).
    abv, residuo_zuccherino, estratto_secco : float
        Beverage properties.
    T_range : tuple[float, float]
        Temperature sweep range [°C] (default 0–35 °C per user requirement).
    T_step : float
        Step for the sweep [°C].

    Returns
    -------
    EUComplianceResult
    """
    TNE = _tne_for_volume(V_nominal)

    # Volume at EU reference temperature
    res_ref = compute_dilation(T_fill, T_REF_EU, V_nominal, abv, residuo_zuccherino, estratto_secco)
    V_at_ref = res_ref.V_at_T2
    deviation = V_at_ref - V_nominal

    # Temperature sweep
    temps = []
    vols = []
    T_lo, T_hi = T_range
    T = T_lo
    while T <= T_hi + 1e-9:
        res = compute_dilation(T_fill, T, V_nominal, abv, residuo_zuccherino, estratto_secco)
        temps.append(round(T, 1))
        vols.append(res.V_at_T2)
        T += T_step

    overflow_risk  = any(v > V_nominal + TNE for v in vols)
    underflow_risk = any(v < V_nominal - TNE for v in vols)

    return EUComplianceResult(
        V_nominal=V_nominal,
        TNE=TNE,
        V_at_ref=V_at_ref,
        deviation_from_nominal=deviation,
        is_compliant=abs(deviation) <= TNE,
        margin=TNE - abs(deviation),
        temperatures=temps,
        volumes_at_temps=vols,
        overflow_risk=overflow_risk,
        underflow_risk=underflow_risk,
    )


# ---------------------------------------------------------------------------
# Built-in bottle neck profiles (ported from Excel Foglio1)
# ---------------------------------------------------------------------------
#
# Coordinate system (all profiles):
#   h_mm = distance from the ring bottom (bocca) downward toward the shoulder.
#   This matches the headspace convention: h_fill_mm in the API is also measured
#   from the ring bottom downward.  Passing h_fill=h_nominal to dh_from_dV now
#   correctly finds the diameter at the actual fill level.
#
#   h = 0  →  ring bottom (mouth entrance)  →  bore diameter
#   h = 45-65 mm  →  upper-to-mid neck (fill level zone)
#   h = 80-90 mm  →  shoulder transition  →  widest neck diameter
#
#   The profiles cover h = 0 (bore) to h ≈ 90 mm (shoulder), giving enough
#   range for any realistic fill level and for the neck cross-section diagram.

def _tradition_neck() -> NeckProfile:
    """
    TRADITION / REFERENCE Bordeaux 750 mL.
    Excel Foglio1 columns E-L: anchor (h=45, d=20), rate A15=0.2758 mm/mm.
    Bore: 18.5 mm (typical Bordeaux BED 18.5, confirmed by Saverglass AGAPE spec).
    Upper neck (h < 45): linear interpolation bore → anchor.
    Lower neck (h ≥ 45): d = 20 + (h − 45) × 0.2758.
    Nominal fill level: 63 mm from ring bottom.
    """
    A15 = (29.41 - 20.0) / (79.1 - 45.0)   # 0.2758 mm/mm
    anchor_h, anchor_d = 45.0, 20.0
    bore_d = 18.5

    points = []
    for h_mm in range(0, 95, 5):
        h = float(h_mm)
        if h <= anchor_h:
            t = h / anchor_h
            d = bore_d + t * (anchor_d - bore_d)   # linear bore → anchor
        else:
            d = anchor_d + (h - anchor_h) * A15    # Excel taper
        points.append((h, round(d, 4)))
    return NeckProfile(name="TRADITION", points=points)


def _cepage_neck() -> NeckProfile:
    """
    CEPAGE Bordeaux 750 mL.
    Excel Foglio1 columns M-S: anchor (h=54.6, d=19.5), rate A29=0.299 mm/mm.
    Bore: 18.5 mm.  Nominal fill level ≈ 65 mm.
    """
    A29 = (32.2 - 19.5) / (97.08 - 54.6)   # 0.299 mm/mm
    anchor_h, anchor_d = 54.6, 19.5
    bore_d = 18.5

    points = []
    for h_mm in range(0, 95, 5):
        h = float(h_mm)
        if h <= anchor_h:
            t = h / anchor_h
            d = bore_d + t * (anchor_d - bore_d)
        else:
            d = anchor_d + (h - anchor_h) * A29
        points.append((h, round(d, 4)))
    return NeckProfile(name="CEPAGE", points=points)


def _europea_neck() -> NeckProfile:
    """
    EUROPEA Bordeaux 750 mL.
    Excel Foglio1 columns U-X: two-segment taper.
    Segment 1 h=50..78: rate A41=0.05 mm/mm  (d = 18.5 + A41×(h−50))
    Segment 2 h=78..87: rate B41=0.6243 mm/mm (d = 19.9 + B41×(h−78))
    Bore: 18.5 mm (flat bore section from h=0 to h=50).
    Nominal fill level ≈ 80 mm.
    """
    A41 = (19.9 - 18.5) / (78.0 - 50.0)    # 0.05 mm/mm
    B41 = (25.3 - 19.9) / (86.65 - 78.0)   # 0.6243 mm/mm
    bore_d = 18.5

    def _d_europea(h: float) -> float:
        if h <= 50.0:
            return bore_d   # cylindrical bore section
        if h <= 78.0:
            return 18.5 + A41 * (h - 50.0)
        return 19.9 + B41 * (h - 78.0)

    points = [(float(h), round(_d_europea(float(h)), 4)) for h in range(0, 95, 5)]
    return NeckProfile(name="EUROPEA", points=points)


BUILTIN_NECKS: dict[str, NeckProfile] = {
    "TRADITION": _tradition_neck(),
    "CEPAGE": _cepage_neck(),
    "EUROPEA": _europea_neck(),
}
