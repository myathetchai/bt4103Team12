import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd


class FARDatasetService:
    """Loads engineered datasets and supports querying, filtering, and summarization."""

    SUPPORTED_EXTENSIONS = (".parquet", ".csv")

    def __init__(self, base_dir: Optional[str] = None) -> None:
        self.dataset_dir = self._resolve_dataset_dir(base_dir)
        self.datasets: Dict[str, pd.DataFrame] = {}
        self.primary_keys: Dict[str, List[str]] = {
            "customers": ["customerID"],
            "assets": ["ISIN"],
        }
        self._load_datasets()

    def _resolve_dataset_dir(self, base_dir: Optional[str]) -> Path:
        if base_dir:
            candidate = Path(base_dir).expanduser().resolve()
            if candidate.exists():
                return candidate
        # project root is two levels up from this file: backend/services/...
        project_root = Path(__file__).resolve().parents[2]
        candidates = [
            project_root / "datasets",
            project_root / "backend" / "datasets",
        ]
        for c in candidates:
            if c.exists():
                return c
        # fall back to first candidate even if it doesn't exist; we will error later
        return candidates[0]

    def _find_first_existing(self, base_names: List[str]) -> Optional[Path]:
        for name in base_names:
            for ext in self.SUPPORTED_EXTENSIONS:
                p = self.dataset_dir / f"{name}{ext}"
                if p.exists():
                    return p
        return None

    def _read_df(self, path: Path) -> pd.DataFrame:
        if path.suffix == ".parquet":
            # try parquet, fallback to csv if engine missing or error
            try:
                return pd.read_parquet(path)
            except Exception:
                # attempt csv as fallback
                return pd.read_csv(path.with_suffix(".csv")) if path.with_suffix(".csv").exists() else pd.DataFrame()
        if path.suffix == ".csv":
            return pd.read_csv(path)
        # unknown extension
        return pd.DataFrame()

    def _load_datasets(self) -> None:
        customers_candidates = [
            "customer_engineering_with_engineered",
            "customers_engineering_with_engineered",
        ]
        assets_candidates = [
            "asset_infomration_with_engineered",  # user-provided name (typo included)
            "asset_information_with_engineered",
        ]

        customers_path = self._find_first_existing(customers_candidates)
        assets_path = self._find_first_existing(assets_candidates)

        if customers_path is not None:
            self.datasets["customers"] = self._read_df(customers_path)
        if assets_path is not None:
            self.datasets["assets"] = self._read_df(assets_path)

    def get_available_datasets(self) -> Dict[str, int]:
        return {k: int(len(v)) for k, v in self.datasets.items() if not v.empty}

    def _get_df(self, dataset: str) -> pd.DataFrame:
        df = self.datasets.get(dataset)
        if df is None or df.empty:
            raise ValueError(f"Dataset '{dataset}' not found or empty in {self.dataset_dir}")
        return df

    # ---------- META ----------
    def get_meta(self, dataset: str) -> Tuple[List[str], int, List[dict]]:
        df = self._get_df(dataset)
        from pandas.api.types import is_numeric_dtype

        columns_meta: List[dict] = []
        for col in df.columns:
            series = df[col]
            is_numeric = bool(is_numeric_dtype(series))
            is_categorical = bool(series.dtype == "object")
            nulls = int(series.isna().sum())
            uniques = int(series.nunique(dropna=True)) if is_categorical else None
            columns_meta.append(
                {
                    "name": col,
                    "dtype": str(series.dtype),
                    "isNumeric": is_numeric,
                    "isCategorical": is_categorical,
                    "numNulls": nulls,
                    "numUniques": uniques,
                }
            )
        primary_keys = self.primary_keys.get(dataset, [])
        return primary_keys, int(len(df)), columns_meta

    # ---------- FILTERS ----------
    def get_filters(self, dataset: str, max_unique: int = 50) -> Tuple[dict, dict]:
        df = self._get_df(dataset)
        from pandas.api.types import is_numeric_dtype

        categorical: Dict[str, List[str]] = {}
        numeric: Dict[str, dict] = {}
        primary_keys = set(self.primary_keys.get(dataset, []))

        for col in df.columns:
            if col in primary_keys:
                continue
            if "time" in col.lower():
                # generally exclude timestamps from filters
                continue
            series = df[col]
            if is_numeric_dtype(series):
                s_clean = series.dropna()
                if not s_clean.empty:
                    numeric[col] = {
                        "min": float(s_clean.min()),
                        "max": float(s_clean.max()),
                    }
            elif series.dtype == "object":
                uniques = series.dropna().unique()
                if len(uniques) <= max_unique and len(uniques) > 1:
                    # convert to list of strings
                    values = sorted([str(v) for v in uniques])
                    categorical[col] = values

        return categorical, numeric

    # ---------- FILTER APPLICATION ----------
    def _apply_filters(
        self,
        df: pd.DataFrame,
        categorical_filters: Optional[Dict[str, List[str]]],
        numeric_filters: Optional[Dict[str, dict]],
        search_query: Optional[str],
        search_columns: Optional[List[str]],
    ) -> pd.DataFrame:
        filtered = df

        # categorical filters
        if categorical_filters:
            for col, values in categorical_filters.items():
                if col in filtered.columns and values:
                    filtered = filtered[filtered[col].astype(str).isin([str(v) for v in values])]

        # numeric filters
        if numeric_filters:
            for col, rng in numeric_filters.items():
                if col not in filtered.columns or rng is None:
                    continue
                col_series = filtered[col]
                if rng.get("min") is not None:
                    filtered = filtered[col_series >= float(rng["min"]) ]
                if rng.get("max") is not None:
                    filtered = filtered[col_series <= float(rng["max"]) ]

        # search query across text columns (or provided columns)
        if search_query:
            q = str(search_query).lower()
            if not search_columns:
                text_cols = [c for c in filtered.columns if filtered[c].dtype == "object"]
            else:
                text_cols = [c for c in search_columns if c in filtered.columns]
            if text_cols:
                mask = pd.Series([False] * len(filtered), index=filtered.index)
                for c in text_cols:
                    mask = mask | filtered[c].astype(str).str.lower().str.contains(q, na=False)
                filtered = filtered[mask]

        return filtered

    # ---------- ROWS ----------
    def get_rows(
        self,
        dataset: str,
        page: int,
        page_size: int,
        sort_by: Optional[str],
        sort_dir: str,
        categorical_filters: Optional[Dict[str, List[str]]],
        numeric_filters: Optional[Dict[str, dict]],
        search_query: Optional[str],
        search_columns: Optional[List[str]],
    ) -> Tuple[int, List[str], List[dict]]:
        df = self._get_df(dataset)
        filtered = self._apply_filters(df, categorical_filters, numeric_filters, search_query, search_columns)

        if sort_by and sort_by in filtered.columns:
            ascending = sort_dir.lower() != "desc"
            try:
                filtered = filtered.sort_values(by=sort_by, ascending=ascending, na_position="last")
            except Exception:
                # if sorting fails due to mixed types, fallback to string sorting
                filtered = filtered.assign(_sortcol=filtered[sort_by].astype(str)).sort_values("_sortcol", ascending=ascending).drop(columns=["_sortcol"])

        total = int(len(filtered))

        # pagination (1-based page)
        page = max(1, page)
        start = (page - 1) * page_size
        end = start + page_size
        page_df = filtered.iloc[start:end]

        # convert NaN -> null
        rows_json = page_df.to_json(orient="records")
        import json

        rows: List[dict] = json.loads(rows_json)
        columns = list(df.columns)
        return total, columns, rows

    # ---------- SUMMARY ----------
    def get_summary(
        self,
        dataset: str,
        group_by: str,
        top_n: int,
        categorical_filters: Optional[Dict[str, List[str]]],
        numeric_filters: Optional[Dict[str, dict]],
        search_query: Optional[str],
        search_columns: Optional[List[str]],
    ) -> List[Tuple[Optional[str], int]]:
        df = self._get_df(dataset)
        filtered = self._apply_filters(df, categorical_filters, numeric_filters, search_query, search_columns)
        if group_by not in filtered.columns:
            raise ValueError(f"Column '{group_by}' not found in dataset '{dataset}'")
        counts = (
            filtered[group_by]
            .astype(object)
            .fillna("<NA>")
            .value_counts(dropna=False)
        )
        items = list(counts.items())
        items.sort(key=lambda x: x[1], reverse=True)
        return items[:top_n]

    # ---------- ANALYTICS ----------
    def get_pivot(
        self,
        dataset: str,
        row_col: str,
        col_col: str,
        agg: str = "count",
        value_col: Optional[str] = None,
        categorical_filters: Optional[Dict[str, List[str]]] = None,
        numeric_filters: Optional[Dict[str, dict]] = None,
    ) -> Tuple[List[str], List[str], List[List[float]]]:
        df = self._get_df(dataset)
        filtered = self._apply_filters(df, categorical_filters, numeric_filters, None, None)
        if agg not in ("count", "sum", "mean"):
            agg = "count"
        values = None
        if agg in ("sum", "mean"):
            if not value_col or value_col not in filtered.columns:
                raise ValueError("valueColumn required for sum/mean")
            values = value_col
        if agg == "count":
            pivot = filtered.pivot_table(index=row_col, columns=col_col, values=values, aggfunc="size", fill_value=0)
        else:
            pivot = filtered.pivot_table(index=row_col, columns=col_col, values=values, aggfunc=agg, fill_value=0)
        rows = [str(r) for r in pivot.index.tolist()]
        cols = [str(c) for c in pivot.columns.tolist()]
        data = [[float(x) for x in row] for row in pivot.values.tolist()]
        return rows, cols, data

    def get_histogram(
        self,
        dataset: str,
        column: str,
        bins: int = 20,
        range_min: Optional[float] = None,
        range_max: Optional[float] = None,
        categorical_filters: Optional[Dict[str, List[str]]] = None,
        numeric_filters: Optional[Dict[str, dict]] = None,
    ) -> Tuple[List[float], List[int]]:
        import numpy as np

        df = self._get_df(dataset)
        filtered = self._apply_filters(df, categorical_filters, numeric_filters, None, None)
        s = filtered[column].dropna().astype(float)
        if s.empty:
            return [], []
        min_v = float(s.min()) if range_min is None else float(range_min)
        max_v = float(s.max()) if range_max is None else float(range_max)
        counts, edges = np.histogram(s.values, bins=bins, range=(min_v, max_v))
        return edges.astype(float).tolist(), counts.astype(int).tolist()

    def get_timeseries(
        self,
        dataset: str,
        date_col: str,
        interval: str = "month",
        agg: str = "count",
        value_col: Optional[str] = None,
        group_by: Optional[str] = None,
        categorical_filters: Optional[Dict[str, List[str]]] = None,
        numeric_filters: Optional[Dict[str, dict]] = None,
    ) -> Dict[str, List[Dict[str, float]]]:
        df = self._get_df(dataset).copy()
        filtered = self._apply_filters(df, categorical_filters, numeric_filters, None, None)
        # parse datetime
        ts = pd.to_datetime(filtered[date_col], errors="coerce")
        filtered = filtered.assign(_ts=ts).dropna(subset=["_ts"])  # type: ignore
        if interval == "quarter":
            key = filtered["_ts"].dt.to_period("Q").dt.to_timestamp()
        else:
            key = filtered["_ts"].dt.to_period("M").dt.to_timestamp()
        if group_by and group_by in filtered.columns:
            grp = filtered.groupby([key, filtered[group_by]])
        else:
            grp = filtered.groupby([key])
        if agg == "count":
            agg_series = grp.size()
        elif agg == "sum":
            if not value_col:
                raise ValueError("valueColumn required for sum")
            agg_series = grp[value_col].sum()
        else:
            if not value_col:
                raise ValueError("valueColumn required for mean")
            agg_series = grp[value_col].mean()

        result: Dict[str, List[Dict[str, float]]] = {}
        if group_by and group_by in filtered.columns:
            for (t, label), val in agg_series.items():
                key_str = t.strftime("%Y-%m") if interval != "quarter" else f"{t.year}-Q{((t.month-1)//3)+1}"
                result.setdefault(str(label), []).append({"t": key_str, "value": float(val)})
        else:
            for t, val in agg_series.items():
                key_str = t.strftime("%Y-%m") if interval != "quarter" else f"{t.year}-Q{((t.month-1)//3)+1}"
                result.setdefault("all", []).append({"t": key_str, "value": float(val)})
        return result

    def get_scatter(
        self,
        dataset: str,
        x: str,
        y: str,
        label_col: Optional[str] = None,
        sample: int = 1000,
        categorical_filters: Optional[Dict[str, List[str]]] = None,
        numeric_filters: Optional[Dict[str, dict]] = None,
    ) -> List[Tuple[Optional[float], Optional[float], Optional[str]]]:
        df = self._get_df(dataset)
        filtered = self._apply_filters(df, categorical_filters, numeric_filters, None, None)
        needed = [x, y] + ([label_col] if label_col else [])
        sub = filtered[[c for c in needed if c in filtered.columns]].dropna(subset=[x, y])
        if len(sub) > sample:
            sub = sub.sample(sample, random_state=42)
        result: List[Tuple[Optional[float], Optional[float], Optional[str]]] = []
        for _, row in sub.iterrows():
            result.append((float(row[x]), float(row[y]), str(row[label_col]) if label_col else None))
        return result

    def get_top(
        self,
        dataset: str,
        column: str,
        top_n: int = 10,
        categorical_filters: Optional[Dict[str, List[str]]] = None,
        numeric_filters: Optional[Dict[str, dict]] = None,
    ) -> List[Tuple[Optional[str], int]]:
        df = self._get_df(dataset)
        filtered = self._apply_filters(df, categorical_filters, numeric_filters, None, None)
        counts = (
            filtered[column]
            .astype(object)
            .fillna("<NA>")
            .value_counts(dropna=False)
        )
        items = list(counts.items())
        items.sort(key=lambda x: x[1], reverse=True)
        return items[:top_n]

    def get_group_metrics(
        self,
        dataset: str,
        group_by: str,
        metrics: List[str],
        agg: str = "mean",
        categorical_filters: Optional[Dict[str, List[str]]] = None,
        numeric_filters: Optional[Dict[str, dict]] = None,
    ) -> Dict[str, Dict[str, float]]:
        df = self._get_df(dataset)
        filtered = self._apply_filters(df, categorical_filters, numeric_filters, None, None)
        use_metrics = [m for m in metrics if m in filtered.columns]
        if not use_metrics:
            return {}
        if agg not in ("mean", "sum"):
            agg = "mean"
        grp = filtered.groupby(group_by)
        if agg == "mean":
            stats = grp[use_metrics].mean(numeric_only=True)
        else:
            stats = grp[use_metrics].sum(numeric_only=True)
        result: Dict[str, Dict[str, float]] = {}
        for idx, row in stats.iterrows():
            result[str(idx)] = {m: float(row.get(m, float("nan"))) for m in use_metrics}
        return result
