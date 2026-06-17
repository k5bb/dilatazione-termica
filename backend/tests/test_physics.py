"""
Unit tests for the physics engine, validated against Excel values.
Reference file: abbassamento livello bottiglie.xlsx

Excel scenario: T1=12.5°C, T2=27°C, V=750mL, ABV=12%
Expected values (Foglio2, data_only read):
  D21 (ΔV_water_raw)  = 2.252103750
  F21 (ΔV_water×0.88) = 1.981851300
  F22 (ΔV_ethanol×0.12) = 1.42245
  F23 (ΔV_liquid)     = 3.404301300
  F25 (ΔV_apparent)   = 3.143301300   [uses α_eth=0.00109]
  L12 (ΔV_ethanol 750mL pure) = 11.853750
  L17 (ΔV_glass 1000mL water control) = 2.9
"""

import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from physics import (
    water_specific_volume,
    compute_dilation,
    volume_fractions,
    check_eu_compliance,
    _tne_for_volume,
    ALPHA_ETHANOL_VOL,
    ALPHA_GLASS_VOL,
    BUILTIN_NECKS,
    T_REF_EU,
)

TOL = 1e-6  # absolute tolerance for float comparisons


def assert_close(value, expected, tol=TOL, label=""):
    err = abs(value - expected)
    status = "OK" if err < tol else "FAIL"
    print(f"  [{status}] {label}: got {value:.9f}, expected {expected:.9f}, err={err:.2e}")
    assert err < tol, f"{label}: {value} ≠ {expected} (err={err})"


def test_water_specific_volume():
    print("\n--- test_water_specific_volume ---")
    # At 4°C water has maximum density (~1.0 g/mL), specific volume ~1.0001 mL/g
    v4 = water_specific_volume(4.0)
    assert v4 < water_specific_volume(0.0), "v(4) should be less than v(0)"
    assert v4 < water_specific_volume(20.0), "v(4) should be less than v(20) — density max near 4°C"

    # Excel polynomial values at our test temperatures
    v_125 = water_specific_volume(12.5)
    v_27  = water_specific_volume(27.0)
    assert_close(v_125, 1.000521875, label="v_water(12.5)")
    assert_close(v_27,  1.003524680, label="v_water(27.0)")  # corrected: 1.003524680 not 1.003424680

    dv = v_27 - v_125
    assert_close(dv, 0.003002805, label="Δv_water(12.5→27)")
    print("  water specific volume: PASSED")


def test_volume_fractions():
    print("\n--- test_volume_fractions ---")
    f_wat, f_eth = volume_fractions(12.0)
    assert_close(f_wat, 0.88, label="f_water at 12% ABV")
    assert_close(f_eth, 0.12, label="f_ethanol at 12% ABV")
    f_wat0, f_eth0 = volume_fractions(0.0)
    assert f_eth0 == 0.0
    assert f_wat0 == 1.0
    print("  volume fractions: PASSED")


def test_dilation_components_vs_excel():
    """
    Validate each component against Foglio2 cells.
    Excel scenario: T1=12.5, T2=27, V=750, ABV=12%.
    """
    print("\n--- test_dilation_components_vs_excel ---")
    T1, T2, V, abv = 12.5, 27.0, 750.0, 12.0

    res = compute_dilation(T1, T2, V, abv)

    # ΔV_water raw = Δv × 750 (before multiplying by f_water)
    # D21 in Excel = Δv × 750 = 2.2521037
    dv_raw = (water_specific_volume(T2) - water_specific_volume(T1)) * V
    assert_close(dv_raw, 2.252103750, label="D21 ΔV_water_raw")

    # F21 = D21 × 0.88
    assert_close(res.dV_water, 1.981851300, tol=1e-5, label="F21 ΔV_water")

    # F22 = ΔV_ethanol × 0.12
    # Excel L13 = 750 * 0.00109 * ΔT = 750 * 0.00109 * 14.5 = 11.85375
    # F22 = L13 * 0.12 = 1.42245
    assert_close(res.dV_ethanol, 1.42245, tol=1e-5, label="F22 ΔV_ethanol")

    # F23 = F21 + F22 = 3.40430
    dV_liquid = res.dV_water + res.dV_ethanol
    assert_close(dV_liquid, 3.404301300, tol=1e-5, label="F23 ΔV_liquid")

    # F8 = glass expansion = 750 * α_glass_vol * ΔT = 750 * 24e-6 * 14.5 = 0.261
    assert_close(res.dV_glass, 0.261, tol=1e-5, label="F8 ΔV_glass")

    # F25 = F23 - ΔV_glass = 3.143301  (using α_eth=0.00109)
    assert_close(res.dV_apparent, 3.143301300, tol=1e-5, label="F25 ΔV_apparent")

    # V at T2
    assert_close(res.V_at_T2, 753.143301, tol=1e-3, label="V at T2=27°C")
    print("  all Excel components: PASSED")


def test_ethanol_expansion_pure():
    """L12 in Excel: pure ethanol 750 mL, T1=12.5→T2=27."""
    print("\n--- test_ethanol_expansion_pure ---")
    # L12 = 750 * (1 + ΔT * 0.00109) - 750 = 750 * 14.5 * 0.00109 = 11.85375
    T1, T2 = 12.5, 27.0
    dT = T2 - T1
    L12_expected = 750.0 * ALPHA_ETHANOL_VOL * dT
    assert_close(L12_expected, 11.85375, label="L12 ΔV_ethanol 750mL pure")
    print("  ethanol expansion: PASSED")


def test_glass_expansion():
    """Validate glass volumetric expansion coefficient."""
    print("\n--- test_glass_expansion ---")
    # α_glass_vol = 3 * 8e-6 = 24e-6
    assert_close(ALPHA_GLASS_VOL, 24e-6, label="α_glass_vol")

    # For V=750, ΔT=14.5: ΔV_glass = 750 * 24e-6 * 14.5 = 0.261
    dV_g = 750.0 * ALPHA_GLASS_VOL * 14.5
    assert_close(dV_g, 0.261, label="ΔV_glass 750mL ΔT=14.5")
    print("  glass expansion: PASSED")


def test_different_volumes():
    """Scaling: dilation should scale linearly with V_nominal at same ABV and ΔT."""
    print("\n--- test_different_volumes ---")
    T1, T2, abv = 12.5, 27.0, 12.0

    r750  = compute_dilation(T1, T2,  750.0, abv)
    r375  = compute_dilation(T1, T2,  375.0, abv)
    r1500 = compute_dilation(T1, T2, 1500.0, abv)

    ratio_375  = r375.dV_apparent  / r750.dV_apparent
    ratio_1500 = r1500.dV_apparent / r750.dV_apparent

    assert_close(ratio_375,  0.5, tol=1e-9, label="ΔV(375)/ΔV(750)")
    assert_close(ratio_1500, 2.0, tol=1e-9, label="ΔV(1500)/ΔV(750)")
    print("  volume scaling: PASSED")


def test_symmetry():
    """dilation(T1→T2) should be opposite to dilation(T2→T1)."""
    print("\n--- test_symmetry ---")
    r_fwd = compute_dilation(12.5, 27.0, 750.0, 12.0)
    r_rev = compute_dilation(27.0, 12.5, 750.0, 12.0)
    assert_close(r_fwd.dV_apparent, -r_rev.dV_apparent, tol=1e-9, label="symmetry")
    print("  symmetry: PASSED")


def test_zero_delta_T():
    """No temperature change → zero dilation."""
    print("\n--- test_zero_delta_T ---")
    r = compute_dilation(20.0, 20.0, 750.0, 12.0)
    assert_close(r.dV_apparent, 0.0, tol=1e-12, label="ΔV at ΔT=0")
    print("  zero ΔT: PASSED")


def test_tne_table():
    """EU TNE values for standard wine bottle sizes."""
    print("\n--- test_tne_table ---")
    tne_cases = [
        (375.0,  11.25),   # 3% of 375
        (500.0,  15.0),    # absolute 15 mL
        (750.0,  15.0),    # absolute 15 mL
        (1000.0, 15.0),    # absolute 15 mL
        (1500.0, 22.5),    # 1.5% of 1500
    ]
    for V, expected_tne in tne_cases:
        tne = _tne_for_volume(V)
        assert_close(tne, expected_tne, label=f"TNE({V:.0f}mL)")
    print("  EU TNE table: PASSED")


def test_eu_compliance_basic():
    """
    Fill 750 mL bottle at 20°C — volume at reference temp (20°C) should be exactly
    750 mL → deviation = 0, is_compliant = True.
    """
    print("\n--- test_eu_compliance_basic ---")
    result = check_eu_compliance(T_fill=20.0, V_nominal=750.0, abv=12.0)
    assert_close(result.V_at_ref, 750.0, tol=1e-9, label="V_at_ref when T_fill=T_ref")
    assert result.is_compliant, "Should be compliant when filled at reference temp"
    assert_close(result.deviation_from_nominal, 0.0, tol=1e-9, label="deviation when T_fill=T_ref")
    print("  EU compliance basic: PASSED")


def test_eu_compliance_cold_fill():
    """
    Fill at 12.5°C aiming for 750 mL. At 20°C the liquid will have expanded
    → positive deviation (overfill at ref temp).
    """
    print("\n--- test_eu_compliance_cold_fill ---")
    result = check_eu_compliance(T_fill=12.5, V_nominal=750.0, abv=12.0)
    # Expanding from 12.5→20: dV > 0 → V_at_ref > V_nominal
    assert result.V_at_ref > 750.0, "Cold fill should give more volume at 20°C"
    assert result.is_compliant, "Should still be within 15 mL tolerance"
    print(f"  V_at_20°C = {result.V_at_ref:.4f} mL (deviation: {result.deviation_from_nominal:+.4f} mL)")
    print(f"  margin = {result.margin:.4f} mL — EU compliance cold fill: PASSED")


def test_eu_compliance_hot_fill():
    """
    Fill at 35°C aiming for 750 mL. At 20°C the liquid will have contracted
    → negative deviation (underfill at ref temp). Check if within TNE.
    """
    print("\n--- test_eu_compliance_hot_fill ---")
    result = check_eu_compliance(T_fill=35.0, V_nominal=750.0, abv=12.0)
    assert result.V_at_ref < 750.0, "Hot fill should give less volume at 20°C"
    print(f"  V_at_20°C = {result.V_at_ref:.4f} mL (deviation: {result.deviation_from_nominal:+.4f} mL)")
    print(f"  is_compliant: {result.is_compliant}, margin: {result.margin:.4f} mL")
    print("  EU compliance hot fill: PASSED")


def test_eu_compliance_sweep():
    """Sweep 0–35°C should produce monotonically increasing volumes."""
    print("\n--- test_eu_compliance_sweep ---")
    result = check_eu_compliance(T_fill=15.0, V_nominal=750.0, abv=12.0)
    vols = result.volumes_at_temps
    for i in range(1, len(vols)):
        assert vols[i] > vols[i - 1], f"Volume should increase with T: {vols[i]} ≤ {vols[i-1]}"
    print(f"  sweep {result.temperatures[0]}–{result.temperatures[-1]}°C: monotonically increasing ✓")
    print(f"  V range: {min(vols):.2f}–{max(vols):.2f} mL (TNE=±{result.TNE} mL)")
    print("  EU compliance sweep: PASSED")


def test_neck_profile_volume():
    """TRADITION neck profile: cumulative volume should increase monotonically."""
    print("\n--- test_neck_profile_volume ---")
    neck = BUILTIN_NECKS["TRADITION"]
    cumvol = neck.cumulative_volume()
    vols = [v for _, v in cumvol]
    for i in range(1, len(vols)):
        assert vols[i] > vols[i - 1], "Cumulative volume must increase"
    print(f"  TRADITION neck: {len(cumvol)} points, total volume {vols[-1]:.3f} mL")
    print("  neck profile: PASSED")


def test_neck_dh_from_dV():
    """Level change from apparent dilation should be positive when liquid expands."""
    print("\n--- test_neck_dh_from_dV ---")
    neck = BUILTIN_NECKS["TRADITION"]
    # dV = 3.14 mL (Excel scenario), h_fill = 10mm from bottom of neck (arbitrary)
    dh = neck.dh_from_dV(3.143301, h_fill=10.0)
    assert dh > 0, "Level should rise when liquid expands"
    print(f"  Δh = {dh:.3f} mm for ΔV=3.14 mL in TRADITION neck")

    # Negative dV → level drops
    dh_neg = neck.dh_from_dV(-3.143301, h_fill=10.0)
    assert dh_neg < 0, "Level should drop when liquid contracts"
    print("  neck level change: PASSED")


if __name__ == "__main__":
    tests = [
        test_water_specific_volume,
        test_volume_fractions,
        test_dilation_components_vs_excel,
        test_ethanol_expansion_pure,
        test_glass_expansion,
        test_different_volumes,
        test_symmetry,
        test_zero_delta_T,
        test_tne_table,
        test_eu_compliance_basic,
        test_eu_compliance_cold_fill,
        test_eu_compliance_hot_fill,
        test_eu_compliance_sweep,
        test_neck_profile_volume,
        test_neck_dh_from_dV,
    ]

    passed, failed = 0, []
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as e:
            failed.append((t.__name__, str(e)))
            print(f"  *** FAILED: {e}")

    print(f"\n{'='*50}")
    print(f"Results: {passed}/{len(tests)} passed")
    if failed:
        print("Failed tests:")
        for name, msg in failed:
            print(f"  - {name}: {msg}")
    else:
        print("All tests passed!")
