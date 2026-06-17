"""Pydantic request/response models for the dilation API."""

from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Shared / nested
# ---------------------------------------------------------------------------

class NeckPoint(BaseModel):
    h_mm: float = Field(..., description="Height from neck bottom [mm]")
    d_int_mm: float = Field(..., gt=0, description="Internal diameter [mm]")


class DilationComponents(BaseModel):
    dV_water_mL: float
    dV_ethanol_mL: float
    dV_glass_mL: float
    dV_apparent_mL: float


class TempVolumePoint(BaseModel):
    T_celsius: float
    V_mL: float
    within_tne: bool


class EUComplianceDetail(BaseModel):
    V_nominal_mL: float
    TNE_mL: float
    V_at_20C_mL: float
    deviation_mL: float
    is_compliant: bool
    margin_mL: float = Field(..., description="TNE - |deviation|, positive means safe")
    sweep: list[TempVolumePoint]
    overflow_risk: bool
    underflow_risk: bool


class FillRecommendation(BaseModel):
    """
    Recommended fill height at T_fill to achieve V_nominal at the chosen reference.

    h_nominal_mm          : nominal headspace from producer spec (where V=V_nominal at T_ref)
    h_fill_recommended_mm : headspace to target at T_fill
    h_adjustment_mm       : positive = more headspace (fill less liquid)
    h_at_store_mm         : actual headspace at T_store after filling to h_fill_recommended
    h_at_20c_mm           : actual headspace at 20 °C after filling to h_fill_recommended
    V_at_fill_mL          : volume in bottle at T_fill
    V_at_store_mL         : volume at T_store
    V_at_20c_mL           : volume at 20 °C (EU reference)
    """
    reference_scenario: str
    reference_scenario_label: str
    h_nominal_mm: float
    h_fill_recommended_mm: float
    h_adjustment_mm: float
    h_at_store_mm: float
    h_at_20c_mm: float
    V_at_fill_mL: float
    V_at_store_mL: float
    V_at_20c_mL: float


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

BUILTIN_NECK_NAMES = ["TRADITION", "CEPAGE", "EUROPEA"]

ReferenceScenario = Literal["fill_temp", "storage_temp", "ref_20c"]

SCENARIO_LABELS = {
    "fill_temp":    "Temperatura di imbottigliamento",
    "storage_temp": "Temperatura di stoccaggio",
    "ref_20c":      "20 °C (riferimento UE)",
}


class CalcoloRequest(BaseModel):
    T_fill: float = Field(..., ge=-5, le=50, description="Fill temperature [°C]")
    T_store: float = Field(..., ge=-5, le=60, description="Storage/target temperature [°C]")
    V_nominal: float = Field(..., gt=0, le=20000, description="Nominal bottle volume [mL]")
    abv: float = Field(..., ge=0, le=96, description="Alcohol by volume [%]")
    reference_scenario: ReferenceScenario = Field(
        "fill_temp",
        description=(
            "Temperature at which V_nominal must be achieved:\n"
            "  fill_temp    → V_nominal at T_fill (default, classic behaviour)\n"
            "  storage_temp → V_nominal at T_store\n"
            "  ref_20c      → V_nominal at 20 °C (EU reference)"
        ),
    )
    neck_model: str | None = Field(
        None,
        description="Built-in neck model name (TRADITION, CEPAGE, EUROPEA).",
    )
    neck_points: list[NeckPoint] | None = Field(
        None,
        description="Custom neck profile (h_mm, d_int_mm) breakpoints. Min 2 points.",
    )
    h_nominal_mm: float = Field(
        10.0,
        ge=0,
        description=(
            "Fill height [mm from neck bottom] at which V=V_nominal is achieved at T_ref. "
            "Taken from bottle producer spec or measured."
        ),
    )
    residuo_zuccherino: float = Field(0.0, ge=0, le=500, description="Residual sugar [g/L]")
    estratto_secco: float = Field(0.0, ge=0, le=500, description="Total dry extract [g/L]")

    @model_validator(mode="after")
    def check_neck_provided(self) -> "CalcoloRequest":
        if self.neck_model is None and self.neck_points is None:
            raise ValueError("Provide either neck_model or neck_points")
        if self.neck_points is not None and len(self.neck_points) < 2:
            raise ValueError("neck_points must have at least 2 points")
        if self.neck_model is not None and self.neck_model not in BUILTIN_NECK_NAMES:
            raise ValueError(f"neck_model must be one of {BUILTIN_NECK_NAMES}")
        return self


class ComplianceRequest(BaseModel):
    T_fill: float = Field(..., ge=-5, le=50)
    V_nominal: float = Field(..., gt=0, le=20000)
    abv: float = Field(..., ge=0, le=96)
    residuo_zuccherino: float = Field(0.0, ge=0, le=500)
    estratto_secco: float = Field(0.0, ge=0, le=500)
    T_min: float = Field(0.0, ge=-10, le=50)
    T_max: float = Field(35.0, ge=0, le=80)
    T_step: float = Field(5.0, gt=0, le=20)

    @model_validator(mode="after")
    def check_range(self) -> "ComplianceRequest":
        if self.T_min >= self.T_max:
            raise ValueError("T_min must be less than T_max")
        return self


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class CalcoloResponse(BaseModel):
    T_fill: float
    T_store: float
    V_nominal_mL: float
    abv: float
    components: DilationComponents
    fill_recommendation: FillRecommendation
    eu_compliance: EUComplianceDetail
    neck_points: list[NeckPoint]   # absolute h from ring bottom; used for diagram


class BottleModel(BaseModel):
    name: str
    description: str
    neck_points: list[NeckPoint]
    total_neck_volume_mL: float


class PdfParseResult(BaseModel):
    name: str | None = None
    volume_mL: float | None = None
    h_fill_mm: float | None = None
    bore_diameter_mm: float | None = None
    neck_points: list[NeckPoint] | None = None
    confidence: Literal["high", "medium", "low"] = "low"
    source: Literal["text", "vision", "partial"] = "text"
    warnings: list[str] = Field(default_factory=list)
