import React, { useMemo, useState } from "react";
import { formatNumber } from "../utils.js";

const money = value => value == null || value === "" ? "—" : `Rp ${Number(value).toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
const number = value => Number(value || 0).toLocaleString("id-ID");

function groupOverbudget(rows, key) {
  const counts = new Map();
  rows.filter(r => r.alert_status === "overbudget").forEach(r => {
    const name = String(r[key] || "Tidak diketahui").trim() || "Tidak diketahui";
    const block = String(r.block_code || "").trim();
    if (!counts.has(name)) counts.set(name, new Set());
    counts.get(name).add(block || `${name}-${counts.get(name).size}`);
  });
  return [...counts.entries()].map(([name, blocks]) => ({ name, count: blocks.size })).sort((a,b) => b.count-a.count).slice(0,5);
}

export default function DashboardPage({
  enrichedDamagePoints = [], nonPassableCount = 0, passableCount = 0, unknownStatusCount = 0,
  submittedPlans = [], damageUpdatedAt, roads = [], actualLength = 0, plannedLength = 0, progress = 0,
  typeCounts = [], maxType = 1, aopPeriod, setAopPeriod, aopRows = [], aopSummary = null,
  onOpenAopDetails
}) {
  const [filterAma, setFilterAma] = useState("");
  const [filterEstate, setFilterEstate] = useState("");
  const [filterDivision, setFilterDivision] = useState("");
  const [filterActivity, setFilterActivity] = useState("");
  const [searchBlock, setSearchBlock] = useState("");

  const valueOf = (row, keys) => {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  };
  const rowAma = row => valueOf(row, ["ama", "AMA"]);
  const rowEstate = row => valueOf(row, ["estate", "Estate", "ba_text", "BAText"]);
  const rowDivision = row => valueOf(row, ["division", "divisi", "Divisi", "division_no"]);
  const rowActivity = row => valueOf(row, ["activity_descs", "activity_desc", "activity_description", "activity_types", "activity_type"]);
  const uniqueOptions = rows => [...new Set(rows.map(v => String(v || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, "id"));

  const amaOptions = useMemo(() => uniqueOptions(aopRows.map(rowAma)), [aopRows]);
  const rowsAfterAma = useMemo(() => aopRows.filter(r => !filterAma || rowAma(r) === filterAma), [aopRows, filterAma]);
  const estateOptions = useMemo(() => uniqueOptions(rowsAfterAma.map(rowEstate)), [rowsAfterAma]);
  const rowsAfterEstate = useMemo(() => rowsAfterAma.filter(r => !filterEstate || rowEstate(r) === filterEstate), [rowsAfterAma, filterEstate]);
  const divisionOptions = useMemo(() => uniqueOptions(rowsAfterEstate.map(rowDivision)), [rowsAfterEstate]);
  const rowsAfterDivision = useMemo(() => rowsAfterEstate.filter(r => !filterDivision || rowDivision(r) === filterDivision), [rowsAfterEstate, filterDivision]);
  const activityOptions = useMemo(() => uniqueOptions(rowsAfterDivision.map(rowActivity)), [rowsAfterDivision]);
  const rankedRows = useMemo(() => [...aopRows]
    .filter(r => ["overbudget", "warning", "incomplete"].includes(r.alert_status))
    .filter(r => !filterAma || rowAma(r) === filterAma)
    .filter(r => !filterEstate || rowEstate(r) === filterEstate)
    .filter(r => !filterDivision || rowDivision(r) === filterDivision)
    .filter(r => !filterActivity || rowActivity(r) === filterActivity)
    .filter(r => !searchBlock || String(valueOf(r, ["block_code", "block", "BLOK"])).toLowerCase().includes(searchBlock.trim().toLowerCase()))
    .sort((a,b) => Number(b.overrun_amount || 0) - Number(a.overrun_amount || 0)),
    [aopRows, filterAma, filterEstate, filterDivision, filterActivity, searchBlock]);

  const resetDownstream = (level) => {
    if (level <= 1) setFilterEstate("");
    if (level <= 2) setFilterDivision("");
    if (level <= 3) setFilterActivity("");
  };
  const topAma = useMemo(() => groupOverbudget(aopRows, "ama")[0], [aopRows]);
  const topEstate = useMemo(() => groupOverbudget(aopRows, "estate")[0], [aopRows]);
  const chartRows = [
    { label: "Overbudget", value: Number(aopSummary?.alert_count || 0), color: "#dc2626" },
    { label: "Mendekati budget", value: Number(aopSummary?.warning_count || 0), color: "#f59e0b" },
    { label: "Dalam budget", value: Number(aopSummary?.within_count || 0), color: "#16a34a" },
    { label: "Data belum lengkap", value: Number(aopSummary?.incomplete_count || 0), color: "#94a3b8" }
  ];
  const maxChart = Math.max(1, ...chartRows.map(x => x.value));
  const costActTotal = Number(aopSummary?.total_actual || 0);
  const aopCostTotal = Number(aopSummary?.total_budget || 0);
  const maxCost = Math.max(1, costActTotal, aopCostTotal);
  const costBars = [
    { label: "Cost Act", value: costActTotal, color: "#0f766e" },
    { label: "AOP Cost", value: aopCostTotal, color: "#94a3b8" }
  ];
  const fmtPct = value => value == null ? "—" : `${Number(value).toLocaleString("id-ID", {maximumFractionDigits:1})}%`;

  return <div className="executive-dashboard">
    <header className="aop-heading executive-heading">
      <div><div className="eyebrow">LSIP - OPERATION AND ADMINISTRATION</div><h1>Road Maintenance Monitoring Dashboard</h1><p>Pemantauan CAPEX Untuk Infrastruktur Jalan</p></div>
    </header>

    <section className="road-summary-section">
      <div className="exec-section-title"><h2>Ringkasan Kondisi Jalan</h2><p>Titik kerusakan dari tabel road_bbe; rencana pemeliharaan dari maintenance_plans.</p></div>
      <div className="road-summary-grid">
        <article className="road-summary-card"><span className="road-summary-icon red">!</span><div><small>Rusak Tidak Bisa Dilewati</small><strong>{number(nonPassableCount)}</strong></div></article>
        <article className="road-summary-card"><span className="road-summary-icon amber">↗</span><div><small>Rusak Bisa Dilewati</small><strong>{number(passableCount)}</strong></div></article>
        <article className="road-summary-card"><span className="road-summary-icon green">✓</span><div><small>Rencana Pemeliharaan Tersimpan</small><strong>{number(submittedPlans.length)}</strong></div></article>
        <article className="road-summary-card"><span className="road-summary-icon slate">i</span><div><small>Total Titik Kerusakan Dimuat</small><strong>{number(enrichedDamagePoints.length)}</strong></div></article>
      </div>
      {!enrichedDamagePoints.length && <p className="road-data-note">Data road_bbe belum berhasil dimuat. Periksa endpoint /api/road-damage-points dan kolom status/geometri pada tabel.</p>}
    </section>

    <div className="period-control-row">
      <label className="period-control"><span>Periode laporan</span><select value={aopPeriod} onChange={e => setAopPeriod(e.target.value)} aria-label="Periode AOP Cost"><option value="2025">Tahun 2025</option><option value="Ytd Sep 2026">YTD September 2026</option></select></label>
    </div>

    <section className="executive-kpis" aria-label="Ringkasan anggaran">
      <article className="exec-kpi"><span>Total Cost Act</span><strong>{money(aopSummary?.total_actual)}</strong><small>Biaya aktual periode terpilih</small></article>
      <article className="exec-kpi"><span>Total AOP Cost</span><strong>{money(aopSummary?.total_budget)}</strong><small>Anggaran tersedia periode terpilih</small></article>
      <article className="exec-kpi exec-kpi-alert"><span>Blok overbudget</span><strong>{number(aopSummary?.alert_count)}</strong><small>Aktual melebihi AOP</small></article>
      <article className="exec-kpi exec-kpi-warning"><span>Mendekati budget</span><strong>{number(aopSummary?.warning_count)}</strong><small>Pemakaian anggaran 80–100%</small></article>
    </section>

    <section className="exec-highlight-grid">
      <article className="exec-card exec-chart-card">
        <div className="exec-card-heading"><div><h2>Status Anggaran</h2><p>Jumlah blok berdasarkan status AOP</p></div><span className="period-chip">{aopPeriod === "2025" ? "2025" : "YTD Sep 2026"}</span></div>
        <div className="status-column-chart" role="img" aria-label="Grafik batang jumlah blok berdasarkan status anggaran">{chartRows.map(item => <div className="status-column" key={item.label}><b className="status-column-value">{number(item.value)}</b><div className="status-column-track"><div className="status-column-fill" style={{height:`${item.value / maxChart * 100}%`, background:item.color}} /></div><span className="status-column-label">{item.label}</span></div>)}</div>
        <p className="exec-footnote">Blok dengan data biaya atau anggaran yang belum lengkap dipisahkan dari penilaian overbudget.</p>
      </article>
      <article className="exec-card">
        <div className="exec-card-heading"><div><h2>Area dengan Overbudget Terbanyak</h2><p>Jumlah blok overbudget per area</p></div></div>
        <div className="area-alert-list">
          <div className="area-alert-item"><span className="area-rank">1</span><div className="area-info"><small>AMA</small><b>{topAma?.name || "Belum ada data"}</b><span>{topAma ? `${number(topAma.count)} blok overbudget` : "Tidak ada blok overbudget yang tercatat"}</span></div></div>
          <div className="area-alert-item"><span className="area-rank">2</span><div className="area-info"><small>Estate</small><b>{topEstate?.name || "Belum ada data"}</b><span>{topEstate ? `${number(topEstate.count)} blok overbudget` : "Tidak ada blok overbudget yang tercatat"}</span></div></div>
        </div>
      </article>
    </section>

    <section className="exec-card exec-priority-card">
      <div className="exec-card-heading exec-priority-heading"><div><h2>Prioritas Pemeriksaan Lapangan</h2><p>10 blok dengan nilai overbudget terbesar pada periode terpilih</p></div><button className="exec-link-button" onClick={onOpenAopDetails}>Lihat detail lengkap <span aria-hidden="true">→</span></button></div>
      <div className="exec-filter-bar" aria-label="Filter prioritas pemeriksaan">
        <label><span>AMA</span><select value={filterAma} onChange={e => { setFilterAma(e.target.value); resetDownstream(1); }}><option value="">Semua AMA</option>{amaOptions.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label><span>Estate</span><select value={filterEstate} onChange={e => { setFilterEstate(e.target.value); resetDownstream(2); }}><option value="">Semua Estate</option>{estateOptions.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label><span>Divisi</span><select value={filterDivision} onChange={e => { setFilterDivision(e.target.value); resetDownstream(3); }}><option value="">Semua Divisi</option>{divisionOptions.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label><span>Activity</span><select value={filterActivity} onChange={e => setFilterActivity(e.target.value)}><option value="">Semua Activity</option>{activityOptions.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label className="exec-block-search"><span>Cari Blok</span><input type="search" value={searchBlock} onChange={e => setSearchBlock(e.target.value)} placeholder="Masukkan kode blok…" /></label>
        <button className="exec-filter-reset" onClick={() => { setFilterAma(""); setFilterEstate(""); setFilterDivision(""); setFilterActivity(""); setSearchBlock(""); }}>Reset</button>
      </div>
      <div className="exec-table-wrap"><table className="exec-table"><thead><tr><th>Blok</th><th>Estate</th><th>AMA</th><th>Divisi</th><th>Aktivitas</th><th>Cost Act</th><th>AOP Cost</th><th>Pemakaian</th><th>Overbudget</th><th>Status</th></tr></thead><tbody>
        {rankedRows.slice(0,10).map((r,i) => <tr key={`${r.block_code}-${i}`}><td><b>{r.block_code || "—"}</b></td><td>{rowEstate(r) || "—"}</td><td>{rowAma(r) || "—"}</td><td>{rowDivision(r) || "—"}</td><td>{rowActivity(r) || "—"}</td><td>{money(r.cost_act)}</td><td>{money(r.aop_cost)}</td><td>{fmtPct(r.utilization_pct)}</td><td className={Number(r.overrun_amount || 0)>0 ? "overrun-value" : ""}>{money(r.overrun_amount)}</td><td><span className={`aop-status ${r.alert_status}`}>{r.alert_status === "overbudget" ? "Overbudget" : r.alert_status === "warning" ? "Mendekati budget" : r.alert_status === "within" ? "Dalam budget" : "Data belum lengkap"}</span></td></tr>)}
        {!rankedRows.length && <tr><td colSpan="10" className="exec-empty-cell">Tidak ada blok yang cocok dengan filter ini.</td></tr>}
      </tbody></table></div>
      <div className="exec-table-footer"><span>Menampilkan {Math.min(10, rankedRows.length)} dari {number(rankedRows.length)} blok sesuai filter.</span><button className="exec-link-button" onClick={onOpenAopDetails}>Buka tabel lengkap (50 baris per halaman) →</button></div>
    </section>


    <footer className="exec-footer">RoadWatch · Road Maintenance Monitoring · Lonsum Plantation</footer>
  </div>;
}
