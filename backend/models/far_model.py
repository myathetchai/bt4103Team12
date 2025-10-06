from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any


class ColumnMeta(BaseModel):
    name: str
    dtype: str
    isNumeric: bool
    isCategorical: bool
    numNulls: int
    numUniques: Optional[int] = None


class MetaResponse(BaseModel):
    datasetKey: str
    primaryKeys: List[str]
    rowCount: int
    columns: List[ColumnMeta]
    success: bool = True


class NumericRange(BaseModel):
    min: Optional[float]
    max: Optional[float]


class FiltersResponse(BaseModel):
    datasetKey: str
    categorical: Dict[str, List[str]]
    numeric: Dict[str, NumericRange]
    success: bool = True


class CategoricalFilter(BaseModel):
    values: List[str] = Field(default_factory=list)


class NumericFilter(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None


class FilterSpec(BaseModel):
    categorical: Optional[Dict[str, CategoricalFilter]] = None
    numeric: Optional[Dict[str, NumericFilter]] = None


class RowsRequest(BaseModel):
    dataset: str
    page: int = 1
    pageSize: int = Field(default=25, ge=1, le=200)
    sortBy: Optional[str] = None
    sortDir: Optional[str] = Field(default="asc")
    filters: Optional[FilterSpec] = None
    searchQuery: Optional[str] = None
    searchColumns: Optional[List[str]] = None


class RowsResponse(BaseModel):
    datasetKey: str
    page: int
    pageSize: int
    total: int
    columns: List[str]
    rows: List[Dict[str, Any]]
    success: bool = True


class CategoryCount(BaseModel):
    category: Optional[str]
    count: int


class SummaryRequest(BaseModel):
    dataset: str
    groupBy: str
    topN: int = Field(default=15, ge=1, le=100)
    filters: Optional[FilterSpec] = None


class SummaryResponse(BaseModel):
    datasetKey: str
    groupBy: str
    totalGroups: int
    series: List[CategoryCount]
    success: bool = True


# -------- Analytics models --------

class PivotRequest(BaseModel):
    dataset: str
    rows: str
    cols: str
    agg: str = Field(default="count", description="count|sum|mean")
    valueColumn: Optional[str] = None
    filters: Optional[FilterSpec] = None


class PivotResponse(BaseModel):
    datasetKey: str
    rows: List[str]
    cols: List[str]
    values: List[List[float]]


class HistogramRequest(BaseModel):
    dataset: str
    column: str
    bins: int = Field(default=20, ge=2, le=200)
    rangeMin: Optional[float] = None
    rangeMax: Optional[float] = None
    filters: Optional[FilterSpec] = None


class HistogramResponse(BaseModel):
    datasetKey: str
    column: str
    binEdges: List[float]
    counts: List[int]


class TimeseriesRequest(BaseModel):
    dataset: str
    dateColumn: str
    interval: str = Field(default="month", description="month|quarter")
    agg: str = Field(default="count", description="count|sum|mean")
    valueColumn: Optional[str] = None
    groupBy: Optional[str] = None
    filters: Optional[FilterSpec] = None


class TimeseriesSeries(BaseModel):
    label: Optional[str]
    points: List[Dict[str, Any]]  # { t: 'YYYY-MM', value: number }


class TimeseriesResponse(BaseModel):
    datasetKey: str
    interval: str
    series: List[TimeseriesSeries]


class ScatterRequest(BaseModel):
    dataset: str
    x: str
    y: str
    labelColumn: Optional[str] = None
    sample: int = Field(default=1000, ge=10, le=10000)
    filters: Optional[FilterSpec] = None


class ScatterPoint(BaseModel):
    x: Optional[float]
    y: Optional[float]
    label: Optional[str] = None


class ScatterResponse(BaseModel):
    datasetKey: str
    x: str
    y: str
    points: List[ScatterPoint]


class TopRequest(BaseModel):
    dataset: str
    column: str
    topN: int = Field(default=10, ge=1, le=100)
    filters: Optional[FilterSpec] = None


class TopResponse(BaseModel):
    datasetKey: str
    column: str
    series: List[CategoryCount]


class GroupMetricsRequest(BaseModel):
    dataset: str
    groupBy: str
    metrics: List[str]
    agg: str = Field(default="mean", description="mean|sum")
    filters: Optional[FilterSpec] = None


class GroupMetricsGroup(BaseModel):
    label: Optional[str]
    values: Dict[str, float]


class GroupMetricsResponse(BaseModel):
    datasetKey: str
    groupBy: str
    groups: List[GroupMetricsGroup]

