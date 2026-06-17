"""Integration tests for the FastAPI endpoints (server must be running on port 8001)."""

import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8001"


def get(path):
    with urllib.request.urlopen(f"{BASE}{path}") as r:
        return json.loads(r.read())


def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data,
                                  headers={"Content-Type": "application/json"},
                                  method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code


def assert_close(val, exp, tol=0.01, label=""):
    err = abs(val - exp)
    ok = err <= tol
    print(f"  [{'OK' if ok else 'FAIL'}] {label}: {val} ≈ {exp} (err={err:.4f})")
    assert ok, f"{label}: {val} ≠ {exp}"


def test_health():
    print("\n--- test_health ---")
    d = get("/")
    assert d["status"] == "ok"
    print("  health: PASSED")


def test_bottiglie_list():
    print("\n--- test_bottiglie_list ---")
    d = get("/bottiglie")
    assert len(d) == 3
    names = {b["name"] for b in d}
    assert names == {"TRADITION", "CEPAGE", "EUROPEA"}
    for b in d:
        assert b["total_neck_volume_mL"] > 0
        assert len(b["neck_points"]) >= 2
    print(f"  {len(d)} bottiglie, tutte con profilo collo: PASSED")


def test_bottiglia_detail():
    print("\n--- test_bottiglia_detail ---")
    d = get("/bottiglie/TRADITION")
    assert d["name"] == "TRADITION"
    assert d["total_neck_volume_mL"] > 0
    # case-insensitive
    d2 = get("/bottiglie/tradition")
    assert d2["name"] == "TRADITION"
    print("  GET /bottiglie/TRADITION: PASSED")


def test_calcola_excel_scenario():
    """Validate /calcola against known Excel values."""
    print("\n--- test_calcola_excel_scenario ---")
    d, status = post("/calcola", {
        "T_fill": 12.5, "T_store": 27.0,
        "V_nominal": 750, "abv": 12.0,
        "neck_model": "TRADITION", "fill_height_mm": 10.0
    })
    assert status == 200, f"Expected 200, got {status}: {d}"
    c = d["components"]
    assert_close(c["dV_apparent_mL"], 3.1433, tol=0.001, label="ΔV_apparent")
    assert_close(c["dV_water_mL"], 1.9819, tol=0.001, label="ΔV_water")
    assert_close(c["dV_ethanol_mL"], 1.4225, tol=0.001, label="ΔV_ethanol")
    assert_close(c["dV_glass_mL"], 0.2610, tol=0.001, label="ΔV_glass")
    lc = d["level_change"]
    assert lc["dh_mm"] > 0, "Level should rise"
    assert_close(lc["dh_mm"], 4.957, tol=0.1, label="Δh mm")
    eu = d["eu_compliance"]
    assert eu["is_compliant"]
    assert_close(eu["V_at_20C_mL"], 751.431, tol=0.01, label="V@20°C")
    print("  /calcola Excel scenario: PASSED")


def test_calcola_custom_neck():
    """Custom neck profile (simple cylinder)."""
    print("\n--- test_calcola_custom_neck ---")
    # Cylinder: d=20mm constant, 30mm height
    d, status = post("/calcola", {
        "T_fill": 15.0, "T_store": 25.0,
        "V_nominal": 750, "abv": 12.0,
        "neck_points": [
            {"h_mm": 0, "d_int_mm": 20},
            {"h_mm": 30, "d_int_mm": 20}
        ],
        "fill_height_mm": 5.0
    })
    assert status == 200
    lc = d["level_change"]
    # For a cylinder area = π(1)² = π cm², V ≈ dV_apparent
    # Δh ≈ dV / area = dV / π
    dV = d["components"]["dV_apparent_mL"]
    dh_expected = dV / (3.14159 * 1.0 ** 2)  # d=20mm → r=10mm=1cm
    assert_close(lc["dh_mm"], dh_expected * 10, tol=0.5, label="Δh cylinder (mm)")
    print("  custom neck cylinder: PASSED")


def test_calcola_volumes():
    """Different bottle volumes — dV should scale linearly."""
    print("\n--- test_calcola_volumes ---")
    def dV(vol):
        d, _ = post("/calcola", {
            "T_fill": 12.5, "T_store": 27.0,
            "V_nominal": vol, "abv": 12.0,
            "neck_model": "TRADITION"
        })
        return d["components"]["dV_apparent_mL"]
    dv750 = dV(750)
    dv375 = dV(375)
    dv1500 = dV(1500)
    assert_close(dv375 / dv750, 0.5, tol=1e-4, label="ΔV(375)/ΔV(750)")
    assert_close(dv1500 / dv750, 2.0, tol=1e-4, label="ΔV(1500)/ΔV(750)")
    print("  volume scaling: PASSED")


def test_eu_compliance_endpoint():
    print("\n--- test_eu_compliance_endpoint ---")
    # Fill at ref temp → deviation = 0
    d, status = post("/eu-compliance", {
        "T_fill": 20.0, "V_nominal": 750, "abv": 12.0
    })
    assert status == 200
    assert_close(d["deviation_mL"], 0.0, tol=1e-6, label="deviation at T_fill=20°C")
    assert d["is_compliant"]
    assert len(d["sweep"]) == 8  # 0,5,10,15,20,25,30,35
    print("  /eu-compliance fill@20°C: PASSED")

    # Hot fill 35°C, 375 mL
    d, status = post("/eu-compliance", {
        "T_fill": 35.0, "V_nominal": 375, "abv": 13.5
    })
    assert status == 200
    assert d["V_at_20C_mL"] < 375.0, "Hot fill → less volume at 20°C"
    assert d["is_compliant"]
    print(f"  hot fill 375mL: V@20°C={d['V_at_20C_mL']:.3f} mL, conforme={d['is_compliant']}: PASSED")


def test_eu_compliance_sweep_monotonic():
    print("\n--- test_eu_compliance_sweep_monotonic ---")
    d, _ = post("/eu-compliance", {
        "T_fill": 15.0, "V_nominal": 750, "abv": 12.0,
        "T_min": 0, "T_max": 35, "T_step": 1
    })
    vols = [pt["V_mL"] for pt in d["sweep"]]
    for i in range(1, len(vols)):
        assert vols[i] > vols[i - 1], f"Non monotonic at index {i}"
    print(f"  sweep monotonically increasing over {len(vols)} points: PASSED")


def test_validation_errors():
    print("\n--- test_validation_errors ---")
    # No neck provided
    d, status = post("/calcola", {
        "T_fill": 15, "T_store": 25, "V_nominal": 750, "abv": 12
    })
    assert status == 422, f"Expected 422, got {status}"
    print("  missing neck → 422: PASSED")

    # Invalid neck_model name
    d, status = post("/calcola", {
        "T_fill": 15, "T_store": 25, "V_nominal": 750, "abv": 12,
        "neck_model": "FANTASMA"
    })
    assert status == 422
    print("  invalid neck_model → 422: PASSED")

    # T_min >= T_max
    d, status = post("/eu-compliance", {
        "T_fill": 15, "V_nominal": 750, "abv": 12,
        "T_min": 30, "T_max": 10
    })
    assert status == 422
    print("  T_min >= T_max → 422: PASSED")

    # 404 on unknown bottle
    try:
        get("/bottiglie/FANTASMA")
        assert False, "Should have raised"
    except urllib.error.HTTPError as e:
        assert e.code == 404
    print("  unknown bottle → 404: PASSED")


if __name__ == "__main__":
    tests = [
        test_health,
        test_bottiglie_list,
        test_bottiglia_detail,
        test_calcola_excel_scenario,
        test_calcola_custom_neck,
        test_calcola_volumes,
        test_eu_compliance_endpoint,
        test_eu_compliance_sweep_monotonic,
        test_validation_errors,
    ]
    passed, failed = 0, []
    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            failed.append((t.__name__, str(e)))
            print(f"  *** FAILED: {e}")

    print(f"\n{'='*50}")
    print(f"Results: {passed}/{len(tests)} passed")
    if failed:
        for name, msg in failed:
            print(f"  - {name}: {msg}")
    else:
        print("All tests passed!")
