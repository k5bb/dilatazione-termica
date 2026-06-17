"""
PDF parser for wine bottle technical sheets.

Strategy:
1. Try pdfplumber text extraction + regex (fast, free, offline).
2. If critical fields are missing (or for neck profile) → call Vision API.

Supported vision providers (set VISION_PROVIDER in .env):
  anthropic  (default) — sends PDF as native document; requires ANTHROPIC_API_KEY
  groq                 — converts PDF to PNG images; requires GROQ_API_KEY
  openrouter           — converts PDF to PNG images; requires OPENROUTER_API_KEY

For groq/openrouter the openai package is used (OpenAI-compatible API format).
For image conversion pymupdf (fitz) is required.
"""

from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass, field
from typing import Literal, Optional

import pdfplumber

# ── helpers ──────────────────────────────────────────────────────────────────

def _to_float(s: str) -> float:
    """Convert '18,5' or '18.5' or '1.000' to float."""
    s = s.strip().replace(" ", "")
    if re.match(r"^\d{1,3}\.\d{3}$", s):
        s = s.replace(".", "")
    s = s.replace(",", ".")
    return float(s)


def _cl_to_ml(v: float) -> float:
    return v * 10.0


# ── regex pattern banks ───────────────────────────────────────────────────────

_VOLUME_RE = [
    (r"(?:Contenance|Capacity)\s+(?:Capacity\s+)?([\d.,]+)\s*cl\b", "cl"),
    (r"Capacit[àa]\s*:\s*([\d.,]+)\s*ml\b", "ml"),
    (r"\b0[,.](\d{2,3})\s*l\b", "l_decimal"),
    (r"\b([\d.,]+)\s*ML\b", "ml"),
    (r"\b([\d.,]+)\s*CL\b", "cl"),
]

_FILL_RE = [
    r"Fill\s+height\s+([\d.,]+)\s*mm",
    r"Niveau\s+de\s+remplissage[^\n]{0,40}?([\d.,]+)\s*mm",
    r"ml\s*\+\s*\d+[,.]?\d*\s+a\s+([\d.,]+)\s*mm\s+dal\s+R\.B\.",
    r"Livello\s+di\s+[Rr]iempimento[^\n]{0,60}?([\d.,]+)",
    r"Füllhöhe[^\n]{0,40}?([\d.,]+)\s*mm",
]

_BORE_RE = [
    r"[Ee]ntrance\s+bore\s+diameter\s+([\d.,]+)\s*mm",
    r"[Dd]iam[eè]tre\s+de\s+d[eé]bouchage[^\n]{0,40}?([\d.,]+)\s*mm",
    r"[Dd]iametro\s+interno\s+imboccatura\s*mm:\s*([\d.,]+)",
    r"[Dd]iam\.\s*foro\s+min\.\s*pass[^\n]{0,20}([\d.,]+)",
]

# ── dataclass returned internally ─────────────────────────────────────────────

@dataclass
class PdfExtract:
    name: Optional[str] = None
    volume_mL: Optional[float] = None
    h_fill_mm: Optional[float] = None
    bore_diameter_mm: Optional[float] = None
    neck_profile: Optional[list[tuple[float, float]]] = None  # [(h_mm, d_int_mm), ...]
    confidence: Literal["high", "medium", "low"] = "low"
    source: Literal["text", "vision", "partial"] = "text"
    warnings: list[str] = field(default_factory=list)
    raw_text: Optional[str] = None


# ── text extraction ───────────────────────────────────────────────────────────

def _extract_text(pdf_bytes: bytes) -> str:
    import io
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages = [p.extract_text() or "" for p in pdf.pages]
    return "\n".join(pages)


def _parse_text(text: str, filename: str = "") -> PdfExtract:
    result = PdfExtract(raw_text=text[:4000])

    for pattern, unit in _VOLUME_RE:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                v = _to_float(m.group(1))
                if unit == "cl":
                    v = _cl_to_ml(v)
                elif unit == "l_decimal":
                    v = int(m.group(1)) / 100 * 1000
                if 50 <= v <= 20000:
                    result.volume_mL = v
                    break
            except ValueError:
                pass

    for pattern in _FILL_RE:
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            try:
                h = _to_float(m.group(1))
                if 5 <= h <= 300:
                    result.h_fill_mm = h
                    context = text[max(0, m.start() - 20):m.end()].lower()
                    if " min" in context or "/min" in context:
                        result.warnings.append(
                            "Livello di riempimento estratto come valore minimo — "
                            "verifica e correggi se necessario"
                        )
                    break
            except ValueError:
                pass

    for pattern in _BORE_RE:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                d = _to_float(m.group(1))
                if 10 <= d <= 40:
                    result.bore_diameter_mm = d
                    break
            except ValueError:
                pass

    _SKIP_NAME = re.compile(
        r"^(?:\d{1,2}/\d{4}|\w+ \d{4}|O-I |Wiegand|Saverglass|SCHEDA|DISEGNO|"
        r"SETTORE|CARATTERISTICHE|CONFORMIT|NOTE|TRATTAM|EMBALLAG|PACKING|DISEG)",
        re.IGNORECASE,
    )
    for line in text.splitlines():
        line = line.strip()
        if 3 <= len(line) <= 80 and not _SKIP_NAME.match(line):
            result.name = line
            break
    if not result.name and filename:
        result.name = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE)

    found = sum(x is not None for x in [result.volume_mL, result.h_fill_mm, result.bore_diameter_mm])
    result.confidence = "high" if found == 3 else "medium" if found >= 2 else "low"
    return result


# ── vision shared helpers ─────────────────────────────────────────────────────

_VISION_PROMPT = """Analizza questa scheda tecnica di bottiglia di vetro per vino/spirits. Rispondi SOLO con JSON valido, nessun testo aggiuntivo.

CONVENZIONI DEI DISEGNI TECNICI DI BOTTIGLIE:

(A) LIVELLO DI RIEMPIMENTO (h_fill_mm):
  È la DISTANZA IN MM dalla bocca alla superficie del liquido. Range tipico: 30–120 mm.
  PRIORITÀ DI RICERCA (in ordine):
  1. TITOLO del documento: se termina con "XMM" o "X MM" (es. "BG REFERENCE 55MM" → h_fill=55)
  2. Tabella dati: "Capacité Utile X ml ±Y à Z mm" → Z è il fill (es. "à 65 mm" → h_fill=65)
  3. Quota dimensionale con freccia sul fianco del collo (un numero solo, in mm)
  4. "NIVEAU DE REMPLISSAGE X MM" (anche verticale) / "Fill height X mm"

  ERRORI DA EVITARE (questi NON sono il fill height):
  - "NIV. 75cl" / "Niv. 75cl ±1cl" = etichetta volume in CENTILITRI sul disegno → ignorare
  - "75 CL" nel titolo → è il volume totale della bottiglia, NON il fill height
  - "à 20°C" senza mm → è una temperatura, non una distanza

(B) DIAMETRO BOCCA (bore_diameter_mm):
  - "BOUCHAGE Ø X" o "BROCHAGE Ø X" → diametro esterno sughero, non interno
  - "Entrance bore Ø X" o "Ø int X" → questo è il diametro INTERNO cercato (range 15–22 mm)
  - Se trovi solo BOUCHAGE, il diametro interno ≈ BOUCHAGE - 0.5 mm

(C) PROFILO DEL COLLO — DIAMETRO INTERNO:
  IMPORTANTE: la scheda tecnica può avere più pagine — esamina TUTTE le immagini fornite.
  Il disegno in sezione può essere su una pagina diversa dalla prima.

  DIAMETRO INTERNO vs ESTERNO:
  Le quote Ø nei disegni tecnici sono quasi sempre DIAMETRI ESTERNI.
  Il diametro INTERNO = Ø_esterno − 2 × spessore_vetro.
  Calcola lo spessore vetro al bordo: spessore = (Ø_est_anello − bore_interno) / 2.
  Esempio: bore_interno=18mm, Ø_est_anello=28mm → spessore=5mm per lato.
  Mantieni lo stesso spessore per tutta la lunghezza del collo:
    Ø_est=30mm → d_int = 30 − 10 = 20mm.

  TIPO DI PROFILO — RICONOSCI IL COMPORTAMENTO:
  • Collo cilindrico (tipo Bordeaux/Selecta): Ø esterno varia poco (es. 27→30mm) per 70–95mm,
    poi si allarga bruscamente alla spalla con un grande raggio R (R36, R50…).
    In questo caso d_int varia poco lungo il collo (es. 18→21mm), poi sale ripidamente.
    NON trasformare questo in una rampa lineare da bore a diametro spalla!
  • Collo conico (tipo Borgogna): Ø aumenta gradualmente lungo tutto il collo.

  DETERMINAZIONE QUOTA TRANSIZIONE COLLO→SPALLA (critico):
  La transizione visibile NEL DISEGNO è quella dell'Ø ESTERNO.
  La transizione dell'INTERNO inizia PRIMA perché la parete interna del collo
  è già curva mentre l'esterno sembra ancora cilindrico.
  Regola pratica: se la curva esterna (raggio R) inizia a h_est dal disegno,
  la transizione interna inizia a h_int ≈ h_est - (R_ext - spessore_vetro).
  Esempio: Ø_ext costante fino a h=95mm, R=36mm, spessore=5mm
    → transizione interna a h ≈ 95 - (36 - 5) = 64mm… ma tipicamente 75-85mm.
  Identifica il punto in cui il diametro INTERNO smette di essere quasi costante
  e leggilo con cura, campionando ogni 2-3mm in quella zona.

  CAMPIONAMENTO:
  - Usa intervalli di 5 mm nella zona cilindrica.
  - Nella zona di transizione collo→spalla: punti ogni 2–3 mm.
  - Se il disegno indica un raggio R: usa la formula arco circolare per i punti.
  - Obiettivo: 15–25 punti totali.
  - CRITICO: se non c'è disegno in sezione → restituisci neck_profile: null.
  - NON inventare profili lineari arbitrari.

OUTPUT — JSON puro, nessun testo prima o dopo:
{
  "fill_raw": "stringa esatta letta dal disegno (o null)",
  "name": "codice/nome modello",
  "volume_mL": 750,
  "h_fill_mm": 55,
  "bore_diameter_mm": 18.0,
  "neck_profile": [
    {"h_mm":  0, "d_int_mm": 18.0},
    {"h_mm":  5, "d_int_mm": 18.1},
    {"h_mm": 10, "d_int_mm": 18.2},
    {"h_mm": 20, "d_int_mm": 18.4},
    {"h_mm": 40, "d_int_mm": 18.6},
    {"h_mm": 60, "d_int_mm": 18.8},
    {"h_mm": 70, "d_int_mm": 19.0},
    {"h_mm": 74, "d_int_mm": 19.5},
    {"h_mm": 77, "d_int_mm": 21.0},
    {"h_mm": 80, "d_int_mm": 24.5},
    {"h_mm": 83, "d_int_mm": 31.0},
    {"h_mm": 86, "d_int_mm": 40.0},
    {"h_mm": 90, "d_int_mm": 52.0},
    {"h_mm": 94, "d_int_mm": 60.0}
  ],
  "warnings": ["Transizione collo-spalla a h≈74mm, campionamento addensato"]
}
NOTA: Valori FITTIZI per un Bordeaux a collo corto — usa i valori reali del disegno.
h_fill_mm DEVE essere il numero estratto da fill_raw (non dall'esempio).
Usa null per campi non trovati con certezza."""


def _parse_vision_response(data: dict) -> PdfExtract:
    """Parse the JSON dict returned by any vision model into a PdfExtract."""
    result = PdfExtract(source="vision")
    result.name = data.get("name")
    result.warnings = data.get("warnings") or []

    fill_raw = data.get("fill_raw")
    if fill_raw and isinstance(fill_raw, str):
        result.warnings.append(f"Livello riempimento trovato nel disegno: \"{fill_raw}\"")

    for attr, key, lo, hi in [
        ("volume_mL",        "volume_mL",        50,   20000),
        ("h_fill_mm",        "h_fill_mm",        5,    300),
        ("bore_diameter_mm", "bore_diameter_mm", 10,   40),
    ]:
        raw = data.get(key)
        if raw is not None:
            try:
                v = float(raw)
                setattr(result, attr, v if lo <= v <= hi else None)
            except (TypeError, ValueError):
                pass

    raw_profile = data.get("neck_profile")
    if isinstance(raw_profile, list) and len(raw_profile) >= 2:
        pts: list[tuple[float, float]] = []
        for pt in raw_profile:
            try:
                h_pt = float(pt.get("h_mm", pt.get("h", -1)))
                d_pt = float(pt.get("d_int_mm", pt.get("d_int", pt.get("d", -1))))
                if 0 <= h_pt <= 150 and 12 <= d_pt <= 60:
                    pts.append((h_pt, d_pt))
            except (TypeError, ValueError, AttributeError):
                pass
        if len(pts) >= 2:
            pts.sort(key=lambda p: p[0])
            # Reject perfectly linear profiles (hallucination detection)
            if len(pts) >= 4:
                deltas = [pts[i+1][1] - pts[i][1] for i in range(len(pts)-1)]
                if max(deltas) - min(deltas) < 0.05:  # all increments identical
                    result.warnings.append(
                        "Profilo collo scartato: sembra interpolazione lineare artificiale — "
                        "il disegno tecnico in sezione potrebbe non essere stato trovato."
                    )
                    pts = []
            if len(pts) >= 2:
                # Align h=0 point with bore_diameter_mm if both present
                if result.bore_diameter_mm is not None and pts[0][0] == 0:
                    pts[0] = (0.0, result.bore_diameter_mm)
                result.neck_profile = pts

    found = sum(x is not None for x in [result.volume_mL, result.h_fill_mm, result.bore_diameter_mm])
    result.confidence = "high" if found == 3 else "medium" if found >= 2 else "low"
    return result


def _extract_json(raw: str) -> str:
    """Extract the first complete JSON object from a string that may contain prose."""
    raw = raw.strip()
    # Try stripping markdown code fences first
    stripped = re.sub(r"^```\w*\n?", "", raw)
    stripped = re.sub(r"\n?```.*$", "", stripped, flags=re.DOTALL)
    # Find the first { ... } that parses as valid JSON
    start = stripped.find("{")
    if start == -1:
        start = raw.find("{")
        stripped = raw
    # Walk from start, tracking brace depth
    depth = 0
    for i, ch in enumerate(stripped[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return stripped[start : i + 1]
    return stripped[start:]  # unterminated — let json.loads raise


# ── vision: Anthropic (native PDF document type) ──────────────────────────────

def _parse_vision_anthropic(pdf_bytes: bytes) -> PdfExtract:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        r = PdfExtract(confidence="low", source="vision")
        r.warnings.append("ANTHROPIC_API_KEY non configurata — inserisci i valori manualmente.")
        return r
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        model = os.environ.get("VISION_MODEL", "claude-haiku-4-5-20251001")
        pdf_b64 = base64.b64encode(pdf_bytes).decode()
        msg = client.messages.create(
            model=model,
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "document", "source": {
                        "type": "base64", "media_type": "application/pdf", "data": pdf_b64,
                    }},
                    {"type": "text", "text": _VISION_PROMPT},
                ],
            }],
        )
        data = json.loads(_extract_json(msg.content[0].text))
    except Exception as exc:
        r = PdfExtract(confidence="low", source="vision")
        r.warnings.append(f"Errore analisi IA (Anthropic): {exc}")
        return r
    return _parse_vision_response(data)


# ── vision: OpenAI-compatible (Groq, OpenRouter) via PNG images ───────────────

def _pdf_to_images(pdf_bytes: bytes, max_pages: int = 3, dpi: int = 200) -> list[str]:
    """Render PDF pages to base64-encoded PNG strings using pymupdf."""
    try:
        import fitz  # pymupdf
    except ImportError:
        return []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    images = []
    for i in range(min(len(doc), max_pages)):
        pix = doc[i].get_pixmap(matrix=mat)
        images.append(base64.b64encode(pix.tobytes("png")).decode())
    return images


def _parse_vision_compat(pdf_bytes: bytes, api_key: str, base_url: str, model: str) -> PdfExtract:
    """Call any OpenAI-compatible vision API (Groq, OpenRouter) after converting PDF to images."""
    try:
        from openai import OpenAI
    except ImportError:
        r = PdfExtract(confidence="low", source="vision")
        r.warnings.append("Pacchetto 'openai' non installato — esegui: pip install openai")
        return r

    images = _pdf_to_images(pdf_bytes)
    if not images:
        r = PdfExtract(confidence="low", source="vision")
        r.warnings.append(
            "Impossibile convertire il PDF in immagini — "
            "installa pymupdf: pip install pymupdf"
        )
        return r

    # Build content: images first, then the text prompt
    content: list[dict] = [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img}"}}
        for img in images
    ]
    content.append({"type": "text", "text": _VISION_PROMPT})

    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
        resp = client.chat.completions.create(
            model=model,
            max_tokens=1000,
            messages=[{"role": "user", "content": content}],
        )
        data = json.loads(_extract_json(resp.choices[0].message.content))
    except Exception as exc:
        r = PdfExtract(confidence="low", source="vision")
        r.warnings.append(f"Errore analisi IA ({base_url}): {exc}")
        return r

    return _parse_vision_response(data)


# ── vision dispatcher ─────────────────────────────────────────────────────────

# Default models for each provider
_PROVIDER_DEFAULTS = {
    "groq":       ("https://api.groq.com/openai/v1",    "meta-llama/llama-4-scout-17b-16e-instruct"),
    "openrouter": ("https://openrouter.ai/api/v1",      "meta-llama/llama-4-maverick:free"),
}


def _vision_configured() -> bool:
    """Return True if any vision provider is configured."""
    provider = os.environ.get("VISION_PROVIDER", "anthropic").lower()
    if provider == "anthropic":
        return bool(os.environ.get("ANTHROPIC_API_KEY"))
    if provider == "groq":
        return bool(os.environ.get("GROQ_API_KEY"))
    if provider == "openrouter":
        return bool(os.environ.get("OPENROUTER_API_KEY"))
    return False


def _parse_vision(pdf_bytes: bytes) -> PdfExtract:
    """Dispatch to the configured vision provider."""
    provider = os.environ.get("VISION_PROVIDER", "anthropic").lower()

    if provider == "groq":
        api_key = os.environ.get("GROQ_API_KEY", "")
        if not api_key:
            r = PdfExtract(confidence="low", source="vision")
            r.warnings.append("GROQ_API_KEY non configurata.")
            return r
        base_url, default_model = _PROVIDER_DEFAULTS["groq"]
        model = os.environ.get("VISION_MODEL", default_model)
        return _parse_vision_compat(pdf_bytes, api_key, base_url, model)

    if provider == "openrouter":
        api_key = os.environ.get("OPENROUTER_API_KEY", "")
        if not api_key:
            r = PdfExtract(confidence="low", source="vision")
            r.warnings.append("OPENROUTER_API_KEY non configurata.")
            return r
        base_url, default_model = _PROVIDER_DEFAULTS["openrouter"]
        model = os.environ.get("VISION_MODEL", default_model)
        return _parse_vision_compat(pdf_bytes, api_key, base_url, model)

    # Default: Anthropic
    return _parse_vision_anthropic(pdf_bytes)


# ── public entry point ────────────────────────────────────────────────────────

def parse_pdf(pdf_bytes: bytes, filename: str = "") -> PdfExtract:
    """
    Parse a wine bottle technical sheet PDF.

    Tries text extraction first; calls Vision API when critical fields
    (volume or fill height) are missing, or to extract the neck profile.
    """
    text = ""
    try:
        text = _extract_text(pdf_bytes)
    except Exception:  # noqa: BLE001
        pass

    meaningful_lines = [l for l in text.splitlines() if l.strip()]

    if len(meaningful_lines) >= 3:
        result = _parse_text(text, filename)
        result.source = "text"
        if result.volume_mL is not None and result.h_fill_mm is not None:
            # Main fields from text — call Vision for neck profile only (if configured)
            if _vision_configured():
                vision = _parse_vision(pdf_bytes)
                if vision.neck_profile:
                    profile = list(vision.neck_profile)
                    # Align h=0 point with text-extracted bore (more reliable)
                    if result.bore_diameter_mm and profile and profile[0][0] == 0:
                        profile[0] = (0.0, result.bore_diameter_mm)
                    result.neck_profile = profile
                    result.source = "partial"
            return result
        # Missing critical fields → full Vision call
        if _vision_configured():
            vision = _parse_vision(pdf_bytes)
            if result.volume_mL is None:        result.volume_mL = vision.volume_mL
            if result.h_fill_mm is None:        result.h_fill_mm = vision.h_fill_mm
            if result.bore_diameter_mm is None: result.bore_diameter_mm = vision.bore_diameter_mm
            if result.neck_profile is None:     result.neck_profile = vision.neck_profile
            if result.name is None:             result.name = vision.name
            result.warnings.extend(vision.warnings)
            result.source = "partial"
            found = sum(x is not None for x in [result.volume_mL, result.h_fill_mm, result.bore_diameter_mm])
            result.confidence = "high" if found == 3 else "medium" if found >= 2 else "low"
        return result

    # No usable text → Vision only
    result = _parse_vision(pdf_bytes)
    if not result.name and filename:
        result.name = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE)
    return result
