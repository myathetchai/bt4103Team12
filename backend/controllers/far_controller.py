from fastapi import APIRouter, HTTPException, status
from typing import Dict

from services.far_service import FARDatasetService
from models.far_model import (
    MetaResponse,
    FiltersResponse,
    RowsRequest,
    RowsResponse,
    SummaryRequest,
    SummaryResponse,
    CategoryCount,
    ColumnMeta,
)

router = APIRouter(prefix="/api/far", tags=["FAR dashboard"])

service = FARDatasetService()


@router.get("/datasets")
def list_datasets() -> Dict[str, int]:
    """List available datasets and their row counts."""
    return service.get_available_datasets()


@router.get("/meta/{dataset}", response_model=MetaResponse)
def get_meta(dataset: str) -> MetaResponse:
    try:
        keys, row_count, cols = service.get_meta(dataset)
        columns = [ColumnMeta(**c) for c in cols]
        return MetaResponse(datasetKey=dataset, primaryKeys=keys, rowCount=row_count, columns=columns)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/filters/{dataset}", response_model=FiltersResponse)
def get_filters(dataset: str) -> FiltersResponse:
    try:
        categorical, numeric = service.get_filters(dataset)
        return FiltersResponse(datasetKey=dataset, categorical=categorical, numeric=numeric)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/rows", response_model=RowsResponse)
def get_rows(req: RowsRequest) -> RowsResponse:
    try:
        total, columns, rows = service.get_rows(
            dataset=req.dataset,
            page=req.page,
            page_size=req.pageSize,
            sort_by=req.sortBy,
            sort_dir=req.sortDir or "asc",
            categorical_filters=(req.filters.categorical if req.filters else None),
            numeric_filters=(
                {k: {"min": v.min, "max": v.max} for k, v in req.filters.numeric.items()} if (req.filters and req.filters.numeric) else None
            ),
            search_query=req.searchQuery,
            search_columns=req.searchColumns,
        )
        return RowsResponse(datasetKey=req.dataset, page=req.page, pageSize=req.pageSize, total=total, columns=columns, rows=rows)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/summary", response_model=SummaryResponse)
def get_summary(req: SummaryRequest) -> SummaryResponse:
    try:
        items = service.get_summary(
            dataset=req.dataset,
            group_by=req.groupBy,
            top_n=req.topN,
            categorical_filters=(req.filters.categorical if req.filters else None),
            numeric_filters=(
                {k: {"min": v.min, "max": v.max} for k, v in req.filters.numeric.items()} if (req.filters and req.filters.numeric) else None
            ),
            search_query=None,
            search_columns=None,
        )
        series = [CategoryCount(category=k if k != "<NA>" else None, count=int(v)) for (k, v) in items]
        return SummaryResponse(datasetKey=req.dataset, groupBy=req.groupBy, totalGroups=len(series), series=series)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
