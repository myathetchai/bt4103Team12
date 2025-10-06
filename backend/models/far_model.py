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
