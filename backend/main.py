"""FastAPI application — Apparent Thermal Dilation API."""

from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

import os as _os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import Base, SessionLocal, engine
from db_models import User
from auth import hash_password
from routes_auth import router as auth_router

from models import (
    CalcoloRequest,
    CalcoloResponse,
    ComplianceRequest,
    DilationComponents,
    EUComplianceDetail,
    FillRecommendation,
    NeckPoint,
    TempVolumePoint,
    BottleModel,
    PdfParseResult,
    BUILTIN_NECK_NAMES,
    SCENARIO_LABELS,
)
from parse_pdf import parse_pdf as _parse_pdf
from physics import (
    compute_dilation,
    check_eu_compliance,
    NeckProfile,
    BUILTIN_NECKS,
    T_REF_EU,
    _tne_for_volume,
)

app = FastAPI(
    title="Dilatazione Termica Apparente API",
    description=(
        "Calcola la dilatazione termica apparente di bevande alcoliche in bottiglia "
        "e verifica la conformità alla Direttiva UE 76/211/CEE (stima pre-imballaggi)."
    ),
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "PUT"],
    allow_headers=["*"],
)

app.include_router(auth_router)

# ── DB init + admin bootstrap ─────────────────────────────────────────────────

@app.on_event("startup")
def _startup():
    Base.metadata.create_all(bind=engine)

    admin_user = _os.environ.get("ADMIN_USERNAME", "admin")
    admin_pass = _os.environ.get("ADMIN_PASSWORD", "")
    admin_mail = _os.environ.get("ADMIN_EMAIL", f"{admin_user}@localhost")

    if not admin_pass:
        return  # no password set — skip bootstrap (dev mode)

    db = SessionLocal()
    try:
        exists = db.query(User).filter_by(username=admin_user).first()
        if not exists:
            db.add(User(
                username=admin_user,
                email=admin_mail,
                hashed_password=hash_password(admin_pass),
                is_admin=True,
            ))
            db.commit()
    finally:
        db.close()

_BOTTLE_DESCRIPTIONS = {
    "TRADITION": "Bordolese Tradition 750 mL — profilo collo da scheda tecnica VP Tradition",
    "CEPAGE":    "Bordolese Cépàge 750 mL — profilo collo da scheda tecnica",
    "EUROPEA":   "Bordolese Europea 750 mL — collo a due segmenti con taper differenziato",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_neck_profile(req: CalcoloRequest) -> NeckProfile:
    if req.neck_model:
        return BUILTIN_NECKS[req.neck_model]
    points = [(p.h_mm, p.d_int_mm) for p in req.neck_points]
    return NeckProfile(name="custom", points=points)


def _build_eu_detail(
    T_fill: float,
    V_fill_actual: float,
    V_nominal: float,
    abv: float,
    residuo: float,
    estratto: float,
    T_min: float = 0.0,
    T_max: float = 35.0,
    T_step: float = 5.0,
) -> EUComplianceDetail:
    """
    Build EU compliance detail.

    V_fill_actual: the volume actually filled at T_fill (may differ from V_nominal
                   depending on reference_scenario).
    V_nominal:     the declared nominal volume (used for TNE and labelling).
    """
    # Compute sweep: volume at each temperature = V_fill_actual + ΔV(T_fill → T)
    TNE = _tne_for_volume(V_nominal)
    temps, vols = [], []
    T = T_min
    while T <= T_max + 1e-9:
        res = compute_dilation(T_fill, T, V_fill_actual, abv, residuo, estratto)
        temps.append(round(T, 1))
        vols.append(res.V_at_T2)
        T += T_step

    res_ref = compute_dilation(T_fill, T_REF_EU, V_fill_actual, abv, residuo, estratto)
    V_at_ref = res_ref.V_at_T2
    deviation = V_at_ref - V_nominal

    sweep = [
        TempVolumePoint(T_celsius=t, V_mL=v, within_tne=abs(v - V_nominal) <= TNE)
        for t, v in zip(temps, vols)
    ]

    return EUComplianceDetail(
        V_nominal_mL=V_nominal,
        TNE_mL=TNE,
        V_at_20C_mL=round(V_at_ref, 4),
        deviation_mL=round(deviation, 4),
        is_compliant=abs(deviation) <= TNE,
        margin_mL=round(TNE - abs(deviation), 4),
        sweep=sweep,
        overflow_risk=any(v > V_nominal + TNE for v in vols),
        underflow_risk=any(v < V_nominal - TNE for v in vols),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["status"])
def health():
    return {"status": "ok", "version": app.version}


@app.get("/bottiglie", response_model=list[BottleModel], tags=["bottiglie"], include_in_schema=False)
def list_bottiglie():
    out = []
    for name in BUILTIN_NECK_NAMES:
        neck = BUILTIN_NECKS[name]
        cumvol = neck.cumulative_volume()
        total_vol = cumvol[-1][1] if cumvol else 0.0
        out.append(BottleModel(
            name=name,
            description=_BOTTLE_DESCRIPTIONS.get(name, name),
            neck_points=[NeckPoint(h_mm=h, d_int_mm=d) for h, d in neck.points],
            total_neck_volume_mL=round(total_vol, 4),
        ))
    return out


@app.get("/bottiglie/{name}", response_model=BottleModel, tags=["bottiglie"])
def get_bottiglia(name: str):
    name = name.upper()
    if name not in BUILTIN_NECKS:
        raise HTTPException(status_code=404, detail=f"Modello '{name}' non trovato.")
    neck = BUILTIN_NECKS[name]
    cumvol = neck.cumulative_volume()
    return BottleModel(
        name=name,
        description=_BOTTLE_DESCRIPTIONS.get(name, name),
        neck_points=[NeckPoint(h_mm=h, d_int_mm=d) for h, d in neck.points],
        total_neck_volume_mL=round(cumvol[-1][1] if cumvol else 0.0, 4),
    )


@app.post("/calcola", response_model=CalcoloResponse, tags=["calcolo"])
def calcola(req: CalcoloRequest):
    """
    Calcola dilatazione termica apparente, livello di riempimento consigliato
    e conformità UE in funzione dello scenario di riferimento scelto.

    reference_scenario:
      fill_temp    → V_nominal deve essere rispettato alla T di imbottigliamento
      storage_temp → V_nominal deve essere rispettato alla T di stoccaggio
      ref_20c      → V_nominal deve essere rispettato a 20 °C (riferimento UE)
    """
    abv = req.abv
    V_nom = req.V_nominal
    T_fill = req.T_fill
    T_store = req.T_store
    residuo = req.residuo_zuccherino
    estratto = req.estratto_secco

    # --- Compute ΔV for the two key transitions ---
    dil_to_store = compute_dilation(T_fill, T_store, V_nom, abv, residuo, estratto)
    dil_to_ref   = compute_dilation(T_fill, T_REF_EU, V_nom, abv, residuo, estratto)

    # --- Volume at T_fill depends on reference scenario ---
    scenario = req.reference_scenario
    if scenario == "fill_temp":
        # Classic: fill V_nominal at T_fill, no adjustment
        V_at_fill  = V_nom
        dV_adj     = 0.0
    elif scenario == "storage_temp":
        # Want V_nominal at T_store → fill less/more at T_fill
        dV_adj    = -dil_to_store.dV_apparent          # negative if T_store > T_fill
        V_at_fill = V_nom + dV_adj
    else:  # ref_20c
        # Want V_nominal at 20°C → adjust fill at T_fill accordingly
        dV_adj    = -dil_to_ref.dV_apparent
        V_at_fill = V_nom + dV_adj

    # Volume at all reference points
    V_at_store = V_at_fill + dil_to_store.dV_apparent
    V_at_20c   = V_at_fill + dil_to_ref.dV_apparent

    # --- Neck profile & fill height ---
    # All NeckProfile h coordinates are in mm from the ring bottom (headspace reference).
    # dh_from_dV(dV, h_fill) sign convention:
    #   dV > 0 (liquid expands) → level rises toward bore → Δh < 0
    #   dV < 0 (fill less)     → headspace toward shoulder → Δh > 0
    # Caller always uses:  h_new = h_old + dh
    try:
        neck = _build_neck_profile(req)
        h_nominal = req.h_nominal_mm

        # --- Recommended fill at T_fill ---
        # dV_adj < 0 (fill less) → Δh > 0 (headspace increases toward shoulder) ✓
        dh_neck    = neck.dh_from_dV(dV_adj, h_fill=h_nominal)
        h_fill_rec = round(h_nominal + dh_neck, 3)

        # --- Actual headspace at T_store (thermal expansion from T_fill) ---
        # dV_apparent > 0 (expands) → Δh < 0 (level rises toward bore) ✓
        dh_neck_store  = neck.dh_from_dV(dil_to_store.dV_apparent, h_fill=h_fill_rec)
        h_at_store     = round(h_fill_rec + dh_neck_store, 3)

        # --- Actual headspace at 20 °C (EU reference temperature) ---
        dh_neck_ref    = neck.dh_from_dV(dil_to_ref.dV_apparent, h_fill=h_fill_rec)
        h_at_20c_level = round(h_fill_rec + dh_neck_ref, 3)

    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Errore profilo collo: {exc}")

    fill_rec = FillRecommendation(
        reference_scenario=scenario,
        reference_scenario_label=SCENARIO_LABELS[scenario],
        h_nominal_mm=h_nominal,
        h_fill_recommended_mm=h_fill_rec,
        h_adjustment_mm=round(dh_neck, 3),
        h_at_store_mm=h_at_store,
        h_at_20c_mm=h_at_20c_level,
        V_at_fill_mL=round(V_at_fill, 4),
        V_at_store_mL=round(V_at_store, 4),
        V_at_20c_mL=round(V_at_20c, 4),
    )

    # --- Components: show ΔV from T_fill to T_store (main physical transition) ---
    components = DilationComponents(
        dV_water_mL=round(dil_to_store.dV_water, 4),
        dV_ethanol_mL=round(dil_to_store.dV_ethanol, 4),
        dV_glass_mL=round(dil_to_store.dV_glass, 4),
        dV_apparent_mL=round(dil_to_store.dV_apparent, 4),
    )

    # --- EU compliance: sweep from T_fill with actual fill volume ---
    eu = _build_eu_detail(
        T_fill=T_fill,
        V_fill_actual=V_at_fill,
        V_nominal=V_nom,
        abv=abv,
        residuo=residuo,
        estratto=estratto,
    )

    return CalcoloResponse(
        T_fill=T_fill,
        T_store=T_store,
        V_nominal_mL=V_nom,
        abv=abv,
        components=components,
        fill_recommendation=fill_rec,
        eu_compliance=eu,
        neck_points=[NeckPoint(h_mm=h, d_int_mm=d) for h, d in neck.points],
    )


@app.post("/parse-pdf", response_model=PdfParseResult, tags=["bottiglie"])
async def parse_pdf_endpoint(file: UploadFile = File(...)):
    """
    Estrae dati tecnici da una scheda tecnica PDF di una bottiglia.

    Tenta prima l'estrazione testuale (pdfplumber + regex); se i campi critici
    (volume, livello di riempimento) mancano, invia il PDF all'API Claude per
    l'analisi visiva. Restituisce i valori estratti per la conferma dell'utente
    prima di applicarli al calcolo.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Il file deve essere un PDF.")
    if file.size is not None and file.size > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF troppo grande (max 20 MB).")

    pdf_bytes = await file.read()
    extract = _parse_pdf(pdf_bytes, filename=file.filename)

    return PdfParseResult(
        name=extract.name,
        volume_mL=extract.volume_mL,
        h_fill_mm=extract.h_fill_mm,
        bore_diameter_mm=extract.bore_diameter_mm,
        neck_points=[NeckPoint(h_mm=h, d_int_mm=d) for h, d in extract.neck_profile]
            if extract.neck_profile else None,
        confidence=extract.confidence,
        source=extract.source,
        warnings=extract.warnings,
    )


@app.post("/eu-compliance", response_model=EUComplianceDetail, tags=["calcolo"])
def eu_compliance(req: ComplianceRequest):
    """Conformità Dir. UE 76/211/CEE — scenario fill_temp (default)."""
    return _build_eu_detail(
        T_fill=req.T_fill,
        V_fill_actual=req.V_nominal,
        V_nominal=req.V_nominal,
        abv=req.abv,
        residuo=req.residuo_zuccherino,
        estratto=req.estratto_secco,
        T_min=req.T_min,
        T_max=req.T_max,
        T_step=req.T_step,
    )


# ── Serve React SPA (production) ─────────────────────────────────────────────
_DIST = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "dist")

if _os.path.isdir(_DIST):
    _assets = _os.path.join(_DIST, "assets")
    if _os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _serve_spa(full_path: str):  # noqa: F811
        return FileResponse(_os.path.join(_DIST, "index.html"))
