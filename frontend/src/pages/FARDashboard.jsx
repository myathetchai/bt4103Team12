import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const useFetch = (url) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    if (!url) {
      setData(null);
      setError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((j) => {
        if (!active) return;
        setData(j);
      })
      .catch((e) => active && setError(e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [url]);

  return { data, loading, error };
};

const DatasetSelector = ({ datasets, value, onChange }) => {
  return (
    <FormControl size="small" sx={{ minWidth: 240 }}>
      <InputLabel id="dataset-label">Dataset</InputLabel>
      <Select
        labelId="dataset-label"
        id="dataset"
        value={value}
        label="Dataset"
        onChange={(e) => onChange(e.target.value)}
      >
        {Object.entries(datasets || {}).map(([k, count]) => (
          <MenuItem key={k} value={k}>
            {k} <Chip size="small" sx={{ ml: 1 }} label={count} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

const NumericFilter = ({ label, range, value, onChange }) => {
  if (!range) return null;
  const min = Number.isFinite(range.min) ? range.min : 0;
  const max = Number.isFinite(range.max) ? range.max : 1;
  const v0 = value?.min ?? min;
  const v1 = value?.max ?? max;
  const step = (max - min) / 100 || 1;
  return (
    <Box>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {label} ({min.toFixed(2)} - {max.toFixed(2)})
      </Typography>
      <Slider
        size="small"
        value={[v0, v1]}
        step={step}
        min={min}
        max={max}
        onChange={(_, v) => onChange({ min: v[0], max: v[1] })}
      />
    </Box>
  );
};

const CategoricalFilter = ({ label, values, value, onChange }) => {
  if (!values?.length) return null;
  return (
    <FormControl size="small" fullWidth>
      <InputLabel id={`${label}-label`}>{label}</InputLabel>
      <Select
        multiple
        labelId={`${label}-label`}
        value={value || []}
        label={label}
        onChange={(e) => onChange(e.target.value)}
        renderValue={(selected) => selected.join(", ")}
      >
        {values.map((v) => (
          <MenuItem key={v} value={v}>
            {v}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

const FARDashboard = () => {
  const { data: dsMap } = useFetch(`${API_BASE}/api/far/datasets`);
  const [dataset, setDataset] = useState("");

  // choose first available dataset once list is loaded
  useEffect(() => {
    if (!dsMap) return;
    const keys = Object.keys(dsMap || {});
    if (!keys.length) {
      setDataset("");
      return;
    }
    if (!dataset || !keys.includes(dataset)) {
      setDataset(keys[0]);
    }
  }, [dsMap]);

  const { data: meta } = useFetch(dataset ? `${API_BASE}/api/far/meta/${dataset}` : null);
  const { data: filters } = useFetch(dataset ? `${API_BASE}/api/far/filters/${dataset}` : null);

  const [catFilters, setCatFilters] = useState({});
  const [numFilters, setNumFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState("");

  useEffect(() => {
    // reset filters when dataset changes
    setCatFilters({});
    setNumFilters({});
    setSearchQuery("");
    setGroupBy("");
  }, [dataset]);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const rowsRequest = useMemo(() => {
    return {
      dataset,
      page: page + 1, // API is 1-based
      pageSize,
      sortBy: undefined,
      sortDir: "asc",
      filters: {
        categorical: Object.fromEntries(
          Object.entries(catFilters).filter(([, v]) => v && v.length)
        ),
        numeric: Object.fromEntries(
          Object.entries(numFilters).filter(([, v]) => v && (v.min !== undefined || v.max !== undefined))
        ),
      },
      searchQuery: searchQuery || undefined,
    };
  }, [dataset, page, pageSize, catFilters, numFilters, searchQuery]);

  const [rowsResp, setRowsResp] = useState(null);
  useEffect(() => {
    if (!dataset) return;
    fetch(`${API_BASE}/api/far/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rowsRequest),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setRowsResp)
      .catch(() => setRowsResp(null));
  }, [rowsRequest]);

  const columns = useMemo(() => {
    const cols = rowsResp?.columns || meta?.columns?.map((c) => c.name) || [];
    const pk = meta?.primaryKeys || [];
    return cols.slice(0, 24)
      .map((c) => ({
        field: c,
        headerName: c,
        flex: 1,
        minWidth: 120,
        sortable: false,
      }))
      .map((col) => (pk.includes(col.field) ? { ...col, minWidth: 160 } : col));
  }, [rowsResp, meta]);

  const tableRows = useMemo(() => {
    const pk = meta?.primaryKeys?.[0] || "id";
    return (rowsResp?.rows || []).map((r) => ({ id: r[pk] ?? JSON.stringify(r), ...r }));
  }, [rowsResp, meta]);

  const availableGroupBy = useMemo(() => {
    return [
      ...(filters ? Object.keys(filters.categorical || {}) : []),
      ...(meta ? meta.columns.filter((c) => c.isCategorical).map((c) => c.name) : []),
    ].filter((v, i, a) => a.indexOf(v) === i);
  }, [filters, meta]);

  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (!dataset || !groupBy) return setSummary(null);
    const body = {
      dataset,
      groupBy,
      topN: 15,
      filters: {
        categorical: Object.fromEntries(
          Object.entries(catFilters).filter(([, v]) => v && v.length)
        ),
        numeric: Object.fromEntries(
          Object.entries(numFilters).filter(([, v]) => v && (v.min !== undefined || v.max !== undefined))
        ),
      },
    };
    fetch(`${API_BASE}/api/far/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [dataset, groupBy, catFilters, numFilters]);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        FAR Dashboard
      </Typography>

      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
            <DatasetSelector datasets={dsMap || {}} value={dataset} onChange={setDataset} />

            <TextField
              size="small"
              label="Search"
              value={searchQuery}
              onChange={(e) => {
                setPage(0);
                setSearchQuery(e.target.value);
              }}
              sx={{ minWidth: 240 }}
            />

            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="groupby-label">Group by</InputLabel>
              <Select
                labelId="groupby-label"
                value={groupBy}
                label="Group by"
                onChange={(e) => setGroupBy(e.target.value)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {availableGroupBy.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Divider sx={{ my: 2 }} />

          {/* Dynamic Filters */}
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} useFlexGap flexWrap="wrap">
            {Object.entries(filters?.categorical || {}).slice(0, 6).map(([col, vals]) => (
              <Box key={col} sx={{ minWidth: 240 }}>
                <CategoricalFilter
                  label={col}
                  values={vals}
                  value={catFilters[col]}
                  onChange={(v) => {
                    setPage(0);
                    setCatFilters((prev) => ({ ...prev, [col]: v }));
                  }}
                />
              </Box>
            ))}

            {Object.entries(filters?.numeric || {}).slice(0, 6).map(([col, rng]) => (
              <Box key={col} sx={{ minWidth: 240, px: 1 }}>
                <NumericFilter
                  label={col}
                  range={rng}
                  value={numFilters[col]}
                  onChange={(v) => {
                    setPage(0);
                    setNumFilters((prev) => ({ ...prev, [col]: v }));
                  }}
                />
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {!dataset
              ? "No datasets detected in server /datasets"
              : groupBy
              ? `Top ${summary?.series?.length || 0} by ${groupBy}`
              : "Pick a 'Group by' to see distribution"}
          </Typography>
          <Box sx={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={(summary?.series || []).map((d) => ({ name: d.category || "NA", count: d.count }))}>
                <XAxis dataKey="name" hide={false} interval={0} angle={-35} textAnchor="end" height={70} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#305D9E" />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      {/* Table */}
      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Box sx={{ height: 560, width: "100%" }}>
            <DataGrid
              rows={tableRows}
              columns={columns}
              pagination
              paginationModel={{ page, pageSize }}
              onPaginationModelChange={(m) => {
                setPage(m.page);
                setPageSize(m.pageSize);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
              disableRowSelectionOnClick
            />
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
};

export default FARDashboard;
