
import React, { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 15;

function getValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function normalizeRow(row, index) {
  return {
    ...row,
    _id: row.id ?? row.ID ?? index,

    _ama: String(
      getValue(row, ["ama", "AMA", "ama_name", "AMA_NAME"])
    ).trim(),

    _estate: String(
      getValue(row, ["estate", "ESTATE", "estate_name", "ESTATE_NAME"])
    ).trim(),

    _divisi: String(
      getValue(row, ["divisi", "DIVISI", "division", "DIVISION"])
    ).trim(),

    _block: String(
      getValue(row, [
        "block_code",
        "BLOCK_CODE",
        "block",
        "BLOCK",
        "blok",
        "BLOK",
      ])
    ).trim(),

    // Activity Type tetap disimpan sebagai data terpisah.
    _activityType: String(
      getValue(row, [
        "activity_type",
        "activity_types",
        "activityType",
        "Activity Type",
        "activity",
        "Activity",
      ])
    ).trim(),

    // Filter Activity menggunakan Activity Description.
    _activityDesc: String(
      getValue(row, [
        "activity_desc",
        "activity_descs",
        "activity_description",
        "activityDescription",
        "Activity Description",
        "Activity Desc",
        "description",
        "DESCRIPTION",
      ])
    ).trim(),

    _costAct: getValue(row, ["cost_act", "COST_ACT", "costAct"]),
    _aopCost: getValue(row, ["aop_cost", "AOP_COST", "aopCost"]),
    _overrun: getValue(row, [
      "overrun_amount",
      "OVERRUN_AMOUNT",
      "overrun",
      "OVERRUN",
    ]),

    _utilization: getValue(row, [
      "utilization_pct",
      "UTILIZATION_PCT",
      "utilization",
      "UTILIZATION",
    ]),

    _status: String(
      getValue(row, [
        "alert_status",
        "ALERT_STATUS",
        "status",
        "STATUS",
      ])
    ).trim(),
  };
}

function uniqueValues(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true })
  );
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";

  const number = Number(value);

  if (!Number.isFinite(number)) return value;

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(number);
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "-";

  const number = Number(value);

  if (!Number.isFinite(number)) return value;

  return `${formatNumber(number)}%`;
}

function formatStatus(status) {
  if (!status) return "-";

  return status
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["overbudget", "overbudgeted", "overrun"].includes(value)) return "overbudget";
  if (["warning", "nearbudget", "nearingbudget"].includes(value)) return "warning";
  if (["within", "withinbudget", "onbudget"].includes(value)) return "within";
  if (["incomplete", "missing", "nodata"].includes(value)) return "incomplete";
  return value;
}

export default function AopDetailsPage({ period }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [amaFilter, setAmaFilter] = useState("");
  const [estateFilter, setEstateFilter] = useState("");
  const [divisiFilter, setDivisiFilter] = useState("");

  // State Activity menyimpan nilai activity_desc.
  const [activityFilter, setActivityFilter] = useState("");

  const [blockSearch, setBlockSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "_ama", direction: "asc" });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError("");

      try {
        const query = new URLSearchParams();

        if (period !== undefined && period !== null && period !== "") {
          query.set("period", String(period));
        }

        const url = `/api/aop-cost${query.toString() ? `?${query}` : ""}`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Gagal mengambil data (${response.status})`);
        }

        const result = await response.json();

        // Mendukung respons berupa array atau object berisi data.
        const data = Array.isArray(result)
          ? result
          : result.rows ?? result.data ?? [];

        if (!Array.isArray(data)) {
          throw new Error("Format data dari API tidak sesuai.");
        }

        if (!cancelled) {
          setRows(data.map((row, index) => normalizeRow(row, index)));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Terjadi kesalahan saat mengambil data.");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [period]);

  // Filter AMA → Estate → Divisi → Activity Description.
  const amaOptions = useMemo(() => uniqueValues(rows, "_ama"), [rows]);

  const estateOptions = useMemo(() => {
    const data = amaFilter
      ? rows.filter((row) => row._ama === amaFilter)
      : rows;

    return uniqueValues(data, "_estate");
  }, [rows, amaFilter]);

  const divisiOptions = useMemo(() => {
    const data = rows.filter(
      (row) =>
        (!amaFilter || row._ama === amaFilter) &&
        (!estateFilter || row._estate === estateFilter)
    );

    return uniqueValues(data, "_divisi");
  }, [rows, amaFilter, estateFilter]);

  const activityOptions = useMemo(() => {
    const data = rows.filter(
      (row) =>
        (!amaFilter || row._ama === amaFilter) &&
        (!estateFilter || row._estate === estateFilter) &&
        (!divisiFilter || row._divisi === divisiFilter)
    );

    // PENTING: dropdown mengambil activity_desc, bukan activity_type.
    return uniqueValues(data, "_activityDesc");
  }, [rows, amaFilter, estateFilter, divisiFilter]);

  const filteredRows = useMemo(() => {
    const search = blockSearch.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesAma = !amaFilter || row._ama === amaFilter;
      const matchesEstate = !estateFilter || row._estate === estateFilter;
      const matchesDivisi = !divisiFilter || row._divisi === divisiFilter;

      // Filter Activity membandingkan activity_desc.
      const matchesActivity =
        !activityFilter || row._activityDesc === activityFilter;

      // Search Blok tetap berada di sisi kanan filter.
      const matchesBlock =
        !search || row._block.toLowerCase().includes(search);
      const matchesStatus =
        !statusFilter || normalizeStatus(row._status) === statusFilter;

      return (
        matchesAma &&
        matchesEstate &&
        matchesDivisi &&
        matchesActivity &&
        matchesBlock &&
        matchesStatus
      );
    });
  }, [
    rows,
    amaFilter,
    estateFilter,
    divisiFilter,
    activityFilter,
    blockSearch,
    statusFilter,
  ]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    const key = sortConfig.key;
    copy.sort((a, b) => {
      const numericKeys = ["_costAct", "_aopCost", "_overrun", "_utilization"];
      let result;
      if (numericKeys.includes(key)) {
        const av = Number(a[key]);
        const bv = Number(b[key]);
        const aValid = a[key] !== "" && a[key] != null && Number.isFinite(av);
        const bValid = b[key] !== "" && b[key] != null && Number.isFinite(bv);
        if (!aValid && !bValid) result = 0;
        else if (!aValid) result = 1;
        else if (!bValid) result = -1;
        else result = av - bv;
      } else {
        result = String(a[key] ?? "").localeCompare(String(b[key] ?? ""), undefined, { numeric: true, sensitivity: "base" });
      }
      return sortConfig.direction === "asc" ? result : -result;
    });
    return copy;
  }, [filteredRows, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;

    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [amaFilter, estateFilter, divisiFilter, activityFilter, blockSearch, statusFilter]);

  function handleAmaChange(value) {
    setAmaFilter(value);
    setEstateFilter("");
    setDivisiFilter("");
    setActivityFilter("");
  }

  function handleEstateChange(value) {
    setEstateFilter(value);
    setDivisiFilter("");
    setActivityFilter("");
  }

  function handleDivisiChange(value) {
    setDivisiFilter(value);
    setActivityFilter("");
  }

  function resetFilters() {
    setAmaFilter("");
    setEstateFilter("");
    setDivisiFilter("");
    setActivityFilter("");
    setBlockSearch("");
    setStatusFilter("");
    setSortConfig({ key: "_ama", direction: "asc" });
    setCurrentPage(1);
  }

  return (
    <div className="aop-details-page">
      <div className="aop-detail-title">
        <div>
          <h2>AOP Cost Details</h2>
          <p>Detail biaya aktual dan anggaran berdasarkan blok dan aktivitas.</p>
        </div>

        
      </div>

      <div className="aop-detail-filters">
        <div className="aop-filter-item">
          <label htmlFor="aop-ama-filter">AMA</label>
          <select
            id="aop-ama-filter"
            value={amaFilter}
            onChange={(event) => handleAmaChange(event.target.value)}
          >
            <option value="">All AMA</option>
            {amaOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="aop-filter-item">
          <label htmlFor="aop-estate-filter">Estate</label>
          <select
            id="aop-estate-filter"
            value={estateFilter}
            onChange={(event) => handleEstateChange(event.target.value)}
          >
            <option value="">All Estate</option>
            {estateOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="aop-filter-item">
          <label htmlFor="aop-divisi-filter">Divisi</label>
          <select
            id="aop-divisi-filter"
            value={divisiFilter}
            onChange={(event) => handleDivisiChange(event.target.value)}
          >
            <option value="">All Divisi</option>
            {divisiOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="aop-filter-item">
          <label htmlFor="aop-activity-filter">Activity</label>
          <select
            id="aop-activity-filter"
            value={activityFilter}
            onChange={(event) => setActivityFilter(event.target.value)}
          >
            <option value="">All Activity</option>
            {activityOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="aop-filter-item">
          <label htmlFor="aop-status-filter">Status</label>
          <select
            id="aop-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All Status</option>
            <option value="within">Within</option>
            <option value="warning">Warning</option>
            <option value="overbudget">Overbudget</option>
            <option value="incomplete">Incomplete</option>
          </select>
        </div>

        <div className="aop-filter-item aop-block-search">
          <label htmlFor="aop-block-search">Search Blok</label>
          <input
            id="aop-block-search"
            type="search"
            placeholder="Cari kode blok..."
            value={blockSearch}
            onChange={(event) => setBlockSearch(event.target.value)}
          />
        </div>

        <button
          type="button"
          className="aop-reset-button"
          onClick={resetFilters}
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="aop-error-message" role="alert">
          {error}
        </div>
      )}

      <div className="aop-detail-table-wrap">
        <table className="aop-table">
          <thead>
            <tr>
              <th>No.</th>
              {[
                ["AMA", "_ama"],
                ["Estate", "_estate"],
                ["Divisi", "_divisi"],
                ["Blok", "_block"],
                ["Activity Type", "_activityType"],
                ["Activity Description", "_activityDesc"],
                ["Cost Act", "_costAct"],
                ["AOP Cost", "_aopCost"],
                ["Overbudget", "_overrun"],
                ["Utilization", "_utilization"],
                ["Status", "_status"],
              ].map(([label, key]) => (
                <th key={key} aria-sort={sortConfig.key === key ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <button
                    type="button"
                    className="aop-sort-button"
                    onClick={() => {
                      setSortConfig((current) => ({
                        key,
                        direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
                      }));
                      setCurrentPage(1);
                    }}
                    title={`Urutkan berdasarkan ${label}`}
                  >
                    <span>{label}</span>
                    <span className={`aop-sort-indicator ${sortConfig.key === key ? "is-active" : ""}`}>
                      {sortConfig.key === key ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="aop-table-message">
                  Loading data...
                </td>
              </tr>
            ) : paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="aop-table-message">
                  Tidak ada data yang sesuai dengan filter.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, index) => (
                <tr key={`${row._id}-${index}`}>
                  <td>{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                  <td>{row._ama || "-"}</td>
                  <td>{row._estate || "-"}</td>
                  <td>{row._divisi || "-"}</td>
                  <td>{row._block || "-"}</td>
                  <td>{row._activityType || "-"}</td>
                  <td>{row._activityDesc || "-"}</td>
                  <td>{formatNumber(row._costAct)}</td>
                  <td>{formatNumber(row._aopCost)}</td>
                  <td>{formatNumber(row._overrun)}</td>
                  <td>{formatPercent(row._utilization)}</td>
                  <td>
                    <span
                      className={`aop-status aop-status-${normalizeStatus(row._status)}`}
                    >
                      {formatStatus(row._status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

     
<div className="aop-detail-pagination">
  <span className="aop-pagination-info">
    Menampilkan{" "}
    {filteredRows.length === 0
      ? 0
      : (currentPage - 1) * PAGE_SIZE + 1}
    {"–"}
    {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} dari{" "}
    {filteredRows.length} data
  </span>

  <div className="aop-pagination-buttons">
    <button
      type="button"
      className="aop-page-button"
      disabled={currentPage <= 1 || loading}
      onClick={() =>
        setCurrentPage((page) => Math.max(1, page - 1))
      }
    >
      Previous
    </button>

    <span className="aop-page-indicator">
      {currentPage} / {totalPages}
    </span>

    <button
      type="button"
      className="aop-page-button"
      disabled={currentPage >= totalPages || loading}
      onClick={() =>
        setCurrentPage((page) => Math.min(totalPages, page + 1))
      }
    >
      Next
    </button>
  </div>
</div>

    </div>
  );
}
