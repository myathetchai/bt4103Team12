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
    PivotRequest,
    PivotResponse,
    HistogramRequest,
    HistogramResponse,
    TimeseriesRequest,
    TimeseriesResponse,
    TimeseriesSeries,
    ScatterRequest,
    ScatterResponse,
    ScatterPoint,
    TopRequest,
    TopResponse,
    GroupMetricsRequest,
    GroupMetricsResponse,
    GroupMetricsGroup,
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


# ---- Analytics ----
@router.post("/pivot", response_model=PivotResponse)
def pivot(req: PivotRequest) -> PivotResponse:
    try:
        rows, cols, values = service.get_pivot(
            dataset=req.dataset,
            row_col=req.rows,
            col_col=req.cols,
            agg=req.agg,
            value_col=req.valueColumn,
            categorical_filters=(req.filters.categorical if req.filters else None),
            numeric_filters=(
                {k: {"min": v.min, "max": v.max} for k, v in req.filters.numeric.items()} if (req.filters and req.filters.numeric) else None
            ),
        )
        return PivotResponse(datasetKey=req.dataset, rows=rows, cols=cols, values=values)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/histogram", response_model=HistogramResponse)
def histogram(req: HistogramRequest) -> HistogramResponse:
    try:
        edges, counts = service.get_histogram(
            dataset=req.dataset,
            column=req.column,
            bins=req.bins,
            range_min=req.rangeMin,
            range_max=req.rangeMax,
            categorical_filters=(req.filters.categorical if req.filters else None),
            numeric_filters=(
                {k: {"min": v.min, "max": v.max} for k, v in req.filters.numeric.items()} if (req.filters and req.filters.numeric) else None
            ),
        )
        return HistogramResponse(datasetKey=req.dataset, column=req.column, binEdges=edges, counts=counts)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/timeseries", response_model=TimeseriesResponse)
def timeseries(req: TimeseriesRequest) -> TimeseriesResponse:
    try:
        series_map = service.get_timeseries(
            dataset=req.dataset,
            date_col=req.dateColumn,
            interval=req.interval,
            agg=req.agg,
            value_col=req.valueColumn,
            group_by=req.groupBy,
            categorical_filters=(req.filters.categorical if req.filters else None),
            numeric_filters=(
                {k: {"min": v.min, "max": v.max} for k, v in req.filters.numeric.items()} if (req.filters and req.filters.numeric) else None
            ),
        )
        series = [TimeseriesSeries(label=k if k != "all" else None, points=v) for k, v in series_map.items()]
        return TimeseriesResponse(datasetKey=req.dataset, interval=req.interval, series=series)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/scatter", response_model=ScatterResponse)
def scatter(req: ScatterRequest) -> ScatterResponse:
    try:
        points_raw = service.get_scatter(
            dataset=req.dataset,
            x=req.x,
            y=req.y,
            label_col=req.labelColumn,
            sample=req.sample,
            categorical_filters=(req.filters.categorical if req.filters else None),
            numeric_filters=(
                {k: {"min": v.min, "max": v.max} for k, v in req.filters.numeric.items()} if (req.filters and req.filters.numeric) else None
            ),
        )
        points = [ScatterPoint(x=p[0], y=p[1], label=p[2]) for p in points_raw]
        return ScatterResponse(datasetKey=req.dataset, x=req.x, y=req.y, points=points)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/top", response_model=TopResponse)
def top(req: TopRequest) -> TopResponse:
    try:
        items = service.get_top(
            dataset=req.dataset,
            column=req.column,
            top_n=req.topN,
            categorical_filters=(req.filters.categorical if req.filters else None),
            numeric_filters=(
                {k: {"min": v.min, "max": v.max} for k, v in req.filters.numeric.items()} if (req.filters and req.filters.numeric) else None
            ),
        )
        series = [CategoryCount(category=k if k != "<NA>" else None, count=int(v)) for (k, v) in items]
        return TopResponse(datasetKey=req.dataset, column=req.column, series=series)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/group-metrics", response_model=GroupMetricsResponse)
def group_metrics(req: GroupMetricsRequest) -> GroupMetricsResponse:
    try:
        stats_map = service.get_group_metrics(
            dataset=req.dataset,
            group_by=req.groupBy,
            metrics=req.metrics,
            agg=req.agg,
            categorical_filters=(req.filters.categorical if req.filters else None),
            numeric_filters=(
                {k: {"min": v.min, "max": v.max} for k, v in req.filters.numeric.items()} if (req.filters and req.filters.numeric) else None
            ),
        )
        groups = [GroupMetricsGroup(label=k, values=v) for k, v in stats_map.items()]
        return GroupMetricsResponse(datasetKey=req.dataset, groupBy=req.groupBy, groups=groups)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
