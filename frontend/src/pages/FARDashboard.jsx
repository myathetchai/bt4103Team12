import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  ScatterChart,
  Scatter,
  CartesianGrid,
  Brush,
} from "recharts";

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

const usePost = (url, body, deps) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    let active = true;
    if (!url || !body) {
      setData(null);
      setError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError(null);
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((j) => active && setData(j))
      .catch((e) => active && setError(e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, deps);
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
  const [compareMode, setCompareMode] = useState(false);
  const [metric, setMetric] = useState("current_num_assets_held");

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

  // ---- Analytics bodies ----
  const filtersPayload = useMemo(() => ({
    categorical: Object.fromEntries(Object.entries(catFilters).filter(([, v]) => v && v.length)),
    numeric: Object.fromEntries(Object.entries(numFilters).filter(([, v]) => v && (v.min !== undefined || v.max !== undefined))),
  }), [catFilters, numFilters]);

  const pivotBody = dataset ? { dataset, rows: "investmentCapacity", cols: "riskLevel", agg: "count", filters: filtersPayload } : null;
  const { data: pivot } = usePost(`${API_BASE}/api/far/pivot`, pivotBody, [JSON.stringify(pivotBody)]);

  const donutBody = dataset ? { dataset, column: "investor_type", topN: 10, filters: filtersPayload } : null;
  const { data: donut } = usePost(`${API_BASE}/api/far/top`, donutBody, [JSON.stringify(donutBody)]);

  const histBody = dataset ? { dataset, column: "trading_activity_ratio", bins: 20, filters: filtersPayload } : null;
  const { data: hist } = usePost(`${API_BASE}/api/far/histogram`, histBody, [JSON.stringify(histBody)]);

  const tsBody = dataset ? { dataset, dateColumn: "timestamp", interval: "month", agg: "count", groupBy: "investor_type", filters: filtersPayload } : null;
  const { data: ts } = usePost(`${API_BASE}/api/far/timeseries`, tsBody, [JSON.stringify(tsBody)]);

  const gmBody = dataset ? { dataset, groupBy: "investor_type", metrics: ["current_num_assets_held", "current_diversification_score", "current_portfolio_concentration"], agg: "mean", filters: filtersPayload } : null;
  const { data: gm } = usePost(`${API_BASE}/api/far/group-metrics`, gmBody, [JSON.stringify(gmBody)]);

  const scatterBody = dataset ? { dataset, x: "days_since_last_buy", y: "avg_transactions_per_month", labelColumn: "investor_type", sample: 1000, filters: filtersPayload } : null;
  const { data: scatter } = usePost(`${API_BASE}/api/far/scatter`, scatterBody, [JSON.stringify(scatterBody)]);

  const topCatBody = dataset ? { dataset, column: "preferred_asset_category", topN: 10, filters: filtersPayload } : null;
  const { data: topCat } = usePost(`${API_BASE}/api/far/top`, topCatBody, [JSON.stringify(topCatBody)]);
  const topSecBody = dataset ? { dataset, column: "preferred_sector", topN: 10, filters: filtersPayload } : null;
  const { data: topSec } = usePost(`${API_BASE}/api/far/top`, topSecBody, [JSON.stringify(topSecBody)]);

  const cohortBody = dataset ? { dataset, topN: 10, filters: filtersPayload } : null;
  const { data: cohort } = usePost(`${API_BASE}/api/far/cohort-insights`, cohortBody, [JSON.stringify(cohortBody)]);

  const [assetKey, setAssetKey] = useState("");
  const [assetKeyType, setAssetKeyType] = useState("ISIN");
  const [explainTick, setExplainTick] = useState(0);
  const assetExplainBody = assetKey ? { keyType: assetKeyType, key: assetKey, filters: filtersPayload } : null;
  const { data: explain } = usePost(`${API_BASE}/api/far/asset-explain`, assetExplainBody, [assetKey, assetKeyType, JSON.stringify(filtersPayload), explainTick]);

  const selectedCount = rowsResp?.total ?? 0;

  // helper for heat intensity
  const heatColor = (value, max) => {
    if (!max || max <= 0) return "#f1f5f9";
    const t = Math.min(1, value / max);
    const base = 240; // blue-ish
    const intensity = Math.round(255 - t * 140);
    return `rgb(${intensity}, ${intensity + 10}, 255)`;
  };

  return (
    <Box sx={{ display: "flex", gap: 2 }}>
      {/* Sidebar Filters */}
      <Box sx={{ width: 300, position: "sticky", top: 16, alignSelf: "flex-start" }}>
        <Card sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Analyze by customer profile
            </Typography>

            <DatasetSelector datasets={dsMap || {}} value={dataset} onChange={setDataset} />
            <Divider sx={{ my: 2 }} />

            <Typography variant="caption" sx={{ color: "text.secondary" }}>Customer Type</Typography>
            <CategoricalFilter label="customerType" values={filters?.categorical?.customerType} value={catFilters.customerType} onChange={(v) => setCatFilters((p) => ({ ...p, customerType: v }))} />
            <Divider sx={{ my: 1.5 }} />

            <Typography variant="caption" sx={{ color: "text.secondary" }}>Investor Type</Typography>
            <CategoricalFilter label="investor_type" values={filters?.categorical?.investor_type} value={catFilters.investor_type} onChange={(v) => setCatFilters((p) => ({ ...p, investor_type: v }))} />
            <Divider sx={{ my: 1.5 }} />

            <Typography variant="caption" sx={{ color: "text.secondary" }}>Risk Level</Typography>
            <CategoricalFilter label="riskLevel" values={filters?.categorical?.riskLevel} value={catFilters.riskLevel} onChange={(v) => setCatFilters((p) => ({ ...p, riskLevel: v }))} />
            <Divider sx={{ my: 1.5 }} />

            <Typography variant="caption" sx={{ color: "text.secondary" }}>Investment Capacity</Typography>
            <CategoricalFilter label="investmentCapacity" values={filters?.categorical?.investmentCapacity} value={catFilters.investmentCapacity} onChange={(v) => setCatFilters((p) => ({ ...p, investmentCapacity: v }))} />
            <Divider sx={{ my: 1.5 }} />

            <Typography variant="caption" sx={{ color: "text.secondary" }}>Recency</Typography>
            <CategoricalFilter label="buy_recency_category" values={filters?.categorical?.buy_recency_category} value={catFilters.buy_recency_category} onChange={(v) => setCatFilters((p) => ({ ...p, buy_recency_category: v }))} />
            <Divider sx={{ my: 1.5 }} />

            <Typography variant="caption" sx={{ color: "text.secondary" }}>Days Since Last Buy</Typography>
            <NumericFilter label="days_since_last_buy" range={filters?.numeric?.days_since_last_buy} value={numFilters.days_since_last_buy} onChange={(v) => setNumFilters((p) => ({ ...p, days_since_last_buy: v }))} />

            <Divider sx={{ my: 2 }} />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Chip size="small" label={`Showing: ${selectedCount}`} />
              <Button size="small" onClick={() => { setCatFilters({}); setNumFilters({}); setSearchQuery(""); }}>
                Reset
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {/* Main Content */}
      <Stack spacing={2} sx={{ flex: 1 }}>
        <Typography variant="h5" fontWeight={700}>Investment Analytics</Typography>

        {/* Filters applied and search */}
        <Card sx={{ borderRadius: 2 }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
              <TextField size="small" label="Search customers" value={searchQuery} onChange={(e) => { setPage(0); setSearchQuery(e.target.value); }} sx={{ minWidth: 280 }} />
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel id="groupby-label">Group by (Top chart)</InputLabel>
                <Select labelId="groupby-label" value={groupBy} label="Group by" onChange={(e) => setGroupBy(e.target.value)}>
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {availableGroupBy.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControlLabel control={<Switch checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />} label="Compare segments" />
            </Stack>
          </CardContent>
        </Card>

        {/* Row 1: Matrix + Donut + Histogram */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.2fr 0.8fr 1fr" }, gap: 2 }}>
          <Card sx={{ borderRadius: 2, minHeight: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600}>Capacity × Risk (count)</Typography>
              <Box sx={{ overflow: "auto", maxHeight: 360, mt: 1 }}>
                {pivot && pivot.rows?.length ? (
                  <Box component="table" sx={{ borderCollapse: "collapse", width: "100%" }}>
                    <Box component="thead">
                      <Box component="tr">
                        <Box component="th" sx={{ p: 1 }}></Box>
                        {pivot.cols.map((c) => (
                          <Box component="th" key={c} sx={{ p: 1, fontSize: 12, color: "text.secondary" }}>{c}</Box>
                        ))}
                      </Box>
                    </Box>
                    <Box component="tbody">
                      {pivot.rows.map((r, i) => {
                        const maxVal = Math.max(...pivot.values.flat());
                        return (
                          <Box component="tr" key={r}>
                            <Box component="td" sx={{ p: 1, fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>{r}</Box>
                            {pivot.cols.map((c, j) => {
                              const v = pivot.values[i][j] || 0;
                              return (
                                <Box
                                  component="td"
                                  key={`${r}-${c}`}
                                  onClick={() => {
                                    setCatFilters((prev) => ({ ...prev, investmentCapacity: [r], riskLevel: [c] }));
                                  }}
                                  sx={{ p: 1, textAlign: "center", cursor: "pointer", bgcolor: heatColor(v, maxVal), border: "1px solid #e5e7eb" }}
                                >
                                  <Typography variant="caption">{v}</Typography>
                                </Box>
                              );
                            })}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">No data</Typography>
                )}
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 2, minHeight: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600}>Investor Type Breakdown</Typography>
              <Box sx={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={(donut?.series || []).map((d) => ({ name: d.category || "NA", value: d.count }))} dataKey="value" nameKey="name" outerRadius={90}>
                      {(donut?.series || []).map((_, idx) => (
                        <Cell key={`c-${idx}`} fill={["#305D9E", "#60A5FA", "#93C5FD", "#2563EB", "#1D4ED8"][idx % 5]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 2, minHeight: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600}>Trading Activity Ratio</Typography>
              <Box sx={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={(hist?.counts || []).map((c, i) => ({ idx: i, count: c }))}>
                    <XAxis dataKey="idx" hide />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#305D9E" />
                    <Brush dataKey="idx" height={20} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Row 2: Timeseries + Group Metrics */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
          <Card sx={{ borderRadius: 2, minHeight: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600}>Transactions over time (by investor_type)</Typography>
              <Box sx={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <LineChart>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="t" type="category" allowDuplicatedCategory={false} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {(ts?.series || []).map((s, idx) => (
                      <Line key={idx} dataKey="value" name={s.label || "all"} data={s.points} dot={false} stroke={["#2563EB", "#10B981", "#F59E0B", "#EF4444"][idx % 4]} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 2, minHeight: 320 }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={600}>Portfolio metrics by investor_type</Typography>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel id="metric-label">Metric</InputLabel>
                  <Select labelId="metric-label" value={metric} label="Metric" onChange={(e) => setMetric(e.target.value)}>
                    <MenuItem value="current_num_assets_held">Assets held</MenuItem>
                    <MenuItem value="current_diversification_score">Diversification</MenuItem>
                    <MenuItem value="current_portfolio_concentration">Concentration</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
              <Box sx={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={(gm?.groups || []).map((g) => ({ name: g.label, value: g.values?.[metric] }))}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Row 3: Scatter + Top categories */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
          <Card sx={{ borderRadius: 2, minHeight: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600}>Recency vs Activity</Typography>
              <Box sx={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <ScatterChart>
                    <CartesianGrid />
                    <XAxis dataKey="x" type="number" name="days since last buy" />
                    <YAxis dataKey="y" type="number" name="avg tx per month" />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter data={(scatter?.points || [])} fill="#6366F1" />
                  </ScatterChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 2, minHeight: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600}>Top categories and sectors</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">Preferred Asset Category</Typography>
                  <Box sx={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={(topCat?.series || []).map((d) => ({ name: d.category || "NA", count: d.count }))}>
                        <XAxis dataKey="name" hide />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#2563EB" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">Preferred Sector</Typography>
                  <Box sx={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={(topSec?.series || []).map((d) => ({ name: d.category || "NA", count: d.count }))}>
                        <XAxis dataKey="name" hide />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#F59E0B" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Box>

        {/* Row 4: Cohort insights + Asset explanation */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
          <Card sx={{ borderRadius: 2, minHeight: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600}>Cohort insights</Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Chip size="small" label={`Cohort: ${cohort?.total ?? 0}`} />
              </Stack>
              <Typography variant="caption" color="text.secondary">Numeric medians</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                {cohort?.numericMedians && Object.entries(cohort.numericMedians).map(([k, v]) => (
                  <Chip key={k} size="small" label={`${k}: ${Number(v).toFixed(2)}`} />
                ))}
              </Stack>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">Top categories (pct, lift)</Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {(cohort?.topCategories || []).map((t, i) => (
                      <Stack key={i} direction="row" justifyContent="space-between">
                        <Typography variant="body2">{t.label || 'NA'}</Typography>
                        <Typography variant="body2" color="text.secondary">{t.pct.toFixed(1)}% · ×{Number(t.lift).toFixed(2)}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">Top sectors (pct, lift)</Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {(cohort?.topSectors || []).map((t, i) => (
                      <Stack key={i} direction="row" justifyContent="space-between">
                        <Typography variant="body2">{t.label || 'NA'}</Typography>
                        <Typography variant="body2" color="text.secondary">{t.pct.toFixed(1)}% · ×{Number(t.lift).toFixed(2)}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 2, minHeight: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600}>Why this asset?</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel id="asset-key-type-label">Key</InputLabel>
                  <Select labelId="asset-key-type-label" value={assetKeyType} label="Key" onChange={(e) => setAssetKeyType(e.target.value)}>
                    <MenuItem value="ISIN">ISIN</MenuItem>
                    <MenuItem value="name">Name</MenuItem>
                  </Select>
                </FormControl>
                <TextField size="small" label={assetKeyType === 'ISIN' ? 'ISIN' : 'Asset name'} value={assetKey} onChange={(e) => setAssetKey(e.target.value)} sx={{ minWidth: 220 }} />
                <Button size="small" variant="outlined" onClick={() => setExplainTick((t) => t + 1)}>Explain</Button>
              </Stack>
              {explain?.asset ? (
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">Cohort size: {explain.cohortSize}</Typography>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    {[
                      { label: 'Capacity', stat: explain.capacityMatch },
                      { label: 'Risk', stat: explain.riskMatch },
                      { label: 'Category', stat: explain.categoryMatch },
                      { label: 'Sector', stat: explain.sectorMatch },
                      { label: 'Market', stat: explain.marketMatch },
                    ].map((item, idx) => (
                      <Box key={idx} sx={{ flex: 1, p: 1, border: '1px solid #e5e7eb', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                        <Typography variant="body2">{item.stat.pct.toFixed(1)}% cohort · baseline {item.stat.baselinePct.toFixed(1)}% · ×{Number(item.stat.lift).toFixed(2)}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">Enter an ISIN or asset name and click Explain.</Typography>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Table of customers */}
        <Card sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Customers</Typography>
            <Box sx={{ height: 560, width: "100%" }}>
              <DataGrid
                rows={tableRows}
                columns={columns}
                pagination
                paginationModel={{ page, pageSize }}
                onPaginationModelChange={(m) => { setPage(m.page); setPageSize(m.pageSize); }}
                pageSizeOptions={[10, 25, 50, 100]}
                disableRowSelectionOnClick
              />
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default FARDashboard;
