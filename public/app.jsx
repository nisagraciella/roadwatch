import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import RoadMapPage from "./pages/RoadMapPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import MaintenancePlanPage from "./pages/MaintenancePlanPage.jsx";
import AopDetailsPage from "./pages/AopDetailsPage.jsx";
import { formatNumber, formatHa, esc, topGroup, pointInGeometry } from "./utils.js";
import RealizationPage from "./pages/RealizationPage.jsx";
import PhotoDocumentationPage from "./pages/PhotoDocumentationPage.jsx";

const DEMO_ROADS = [
  {id:1, road_code:"B10-021", estate:"Ketapat Bening", division:"Divisi 1", block_name:"B10", length_m:2400, maintenance_type:"Pengerasan", status:"Rencana", planned_date:"2026-01-10", actual_date:null},
  {id:2, road_code:"B07-014", estate:"Ketapat Bening", division:"Divisi 1", block_name:"B07", length_m:1200, maintenance_type:"Grading", status:"Realisasi", planned_date:"2026-01-15", actual_date:"2026-02-20"},
  {id:3, road_code:"B06-003", estate:"Ketapat Bening", division:"Divisi 2", block_name:"B06", length_m:950, maintenance_type:"Drainase", status:"Realisasi", planned_date:"2026-02-12", actual_date:"2026-03-15"},
  {id:4, road_code:"B12-008", estate:"Ketapat Bening", division:"Divisi 2", block_name:"B12", length_m:1800, maintenance_type:"Penimbunan", status:"Rencana", planned_date:"2026-02-01", actual_date:null},
  {id:5, road_code:"B04-011", estate:"Ketapat Bening", division:"Divisi 3", block_name:"B04", length_m:1500, maintenance_type:"Grading", status:"Rencana", planned_date:"2026-03-10", actual_date:null},
  {id:6, road_code:"B19-002", estate:"Ketapat Bening", division:"Divisi 3", block_name:"B19", length_m:900, maintenance_type:"Pengerasan", status:"Realisasi", planned_date:"2026-03-02", actual_date:"2026-03-29"}
];

function App() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [submittedPlans, setSubmittedPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [damagePoints, setDamagePoints] = useState([]);
  const [blockFeatures, setBlockFeatures] = useState([]);
  const [roads, setRoads] = useState([]);
  const [apiMode, setApiMode] = useState("loading");
  const [statusFilter, setStatusFilter] = useState("Semua Status");
  const [divisionFilter, setDivisionFilter] = useState("Semua Divisi");
  const [blockFilter, setBlockFilter] = useState("Semua Blok");
  const [typeFilter, setTypeFilter] = useState("Semua Jenis");
  const [search, setSearch] = useState("");
  const [mapStyle, setMapStyle] = useState("satellite");
  const [notice, setNotice] = useState("");
  const [damageUpdatedAt, setDamageUpdatedAt] = useState(null);
  const [aopPeriod, setAopPeriod] = useState("2025");
  const [aopRows, setAopRows] = useState([]);
  const [aopSummary, setAopSummary] = useState(null);

  async function loadData() {
    try {
      const [healthRes, summaryRes, roadsRes] = await Promise.all([
        fetch("/api/health"), fetch("/api/dashboard/summary"), fetch("/api/roads")
      ]);
      const health = await healthRes.json();
      if (!healthRes.ok || !health.ok) throw new Error(health.detail || health.message || "Database belum terhubung");
      const s = await summaryRes.json();
      const r = await roadsRes.json();
      if (!summaryRes.ok || !roadsRes.ok || !Array.isArray(r)) throw new Error("API data belum siap");
      setSummary(s); setRoads(r); setApiMode("connected"); setNotice(""); setDamageUpdatedAt(new Date());
      // Ambil rencana pemeliharaan yang benar-benar tersimpan di database.
      try {
        const plansRes = await fetch("/api/maintenance-plans");
        const plansJson = await plansRes.json();
        if (plansRes.ok && Array.isArray(plansJson)) {
          setSubmittedPlans(plansJson.map(p => ({
            ...p,
            road_code: p.ecera_number || p.road_code || p.block_code,
            block_name: p.block_code || p.block_name,
            road_length_m: Number(p.road_length_m || p.length_m || 0),
            length_m: Number(p.road_length_m || p.length_m || 0),
            status: p.status || "Dalam pengerjaan",
            road_status: p.status || "Dalam pengerjaan",
            maintenance_type: p.description || p.maintenance_type || "Rencana pemeliharaan"
          })));
        } else {
          console.warn("Endpoint GET /api/maintenance-plans belum tersedia", plansJson);
        }
      } catch (plansError) {
        console.error("Gagal memuat rencana pemeliharaan dari database:", plansError);
      }
      // Data kerusakan jalan dan batas blok digunakan untuk ringkasan dashboard.
      try {
        const [damageRes, blocksRes] = await Promise.all([
          fetch("/api/road-damage-points"), fetch("/api/blocks")
        ]);
        const damageJson = await damageRes.json();
        const blocksJson = await blocksRes.json();
        setDamagePoints(damageRes.ok && Array.isArray(damageJson.features) ? damageJson.features : []);
        setDamageUpdatedAt(new Date());
        setBlockFeatures(blocksRes.ok && Array.isArray(blocksJson.features) ? blocksJson.features : []);
      } catch (extraErr) {
        console.error("Gagal memuat ringkasan kerusakan jalan:", extraErr);
        setDamagePoints([]); setBlockFeatures([]);
      }
    } catch (e) {
      setApiMode("demo");
      setNotice("Mode pratinjau: database belum terhubung. Data yang terlihat adalah contoh, bukan data SHP kamu.");
      setRoads(DEMO_ROADS);
    }
  }

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/aop-cost?period=${encodeURIComponent(aopPeriod)}`)
      .then(r => { if (!r.ok) return r.json().then(x => { throw new Error(x.error || "Gagal memuat AOP cost"); }); return r.json(); })
      .then(data => { if (!cancelled) { setAopRows(Array.isArray(data.rows) ? data.rows : []); setAopSummary(data.summary || null); } })
      .catch(err => { if (!cancelled) { console.error(err); setAopRows([]); setAopSummary(null); } });
    return () => { cancelled = true; };
  }, [aopPeriod]);

  const displayRoads = useMemo(() => roads.filter(r => {
    const matchesStatus = statusFilter === "Semua Status" || r.status === statusFilter;
    const matchesDivision = divisionFilter === "Semua Divisi" || (r.division || "") === divisionFilter;
    const matchesBlock = blockFilter === "Semua Blok" || (r.block_name || "") === blockFilter;
    const matchesType = typeFilter === "Semua Jenis" || (r.maintenance_type || "") === typeFilter;
    const needle = search.toLowerCase();
    const matchesSearch = [r.road_code, r.road_name, r.block_name, r.estate, r.division].some(v => String(v || "").toLowerCase().includes(needle));
    return matchesStatus && matchesDivision && matchesBlock && matchesType && matchesSearch;
  }), [roads, statusFilter, divisionFilter, blockFilter, typeFilter, search]);

  const totalRoads = summary ? Number(summary.total_roads || 0) : roads.length;
  const plannedCount = summary ? Number(summary.planned_count || 0) : roads.filter(r=>r.status==="Rencana").length;
  const actualCount = summary ? Number(summary.actual_count || 0) : roads.filter(r=>r.status==="Realisasi").length;
  const totalLength = summary ? Number(summary.total_length_m || 0) : roads.reduce((a,r)=>a+Number(r.length_m||0),0);
  const plannedLength = summary ? Number(summary.planned_length_m || 0) : roads.filter(r=>r.status==="Rencana").reduce((a,r)=>a+Number(r.length_m||0),0);
  const actualLength = summary ? Number(summary.actual_length_m || 0) : roads.filter(r=>r.status==="Realisasi").reduce((a,r)=>a+Number(r.length_m||0),0);
  const progress = summary ? Number(summary.realization_pct || 0) : (plannedCount+actualCount ? actualCount/(plannedCount+actualCount)*100 : 0);
  const maintenance = ["Grading","Penimbunan","Pengerasan","Drainase","Lainnya"];
  const typeCounts = maintenance.map(type => ({type, count: roads.filter(r=>r.maintenance_type===type).length}));
  const maxType = Math.max(1, ...typeCounts.map(x=>x.count));
  const enrichedDamagePoints = useMemo(() => damagePoints.map(point => {
    const coords = point?.geometry?.coordinates;
    const lng = Number(coords?.[0]); const lat = Number(coords?.[1]);
    const block = blockFeatures.find(feature => feature?.geometry && pointInGeometry([lng, lat], feature.geometry));
    const props = block?.properties || {};
    const status = String(point?.properties?.road_status ?? point?.properties?.Ket ?? point?.properties?.status ?? "").trim();
    const ama = props.AMA ?? props.ama ?? props.AMA_NAME ?? props.ama_name ?? "Tidak diketahui";
    const estateName = props.BAText ?? props.ba_text ?? props.estate ?? props.ESTATE ?? "Tidak diketahui";
    return { id: point?.properties?.id ?? point?.id, status, ama: String(ama || "Tidak diketahui"), estate: String(estateName || "Tidak diketahui"), block: props.BLOK ?? props.block_code ?? props.block ?? "—" };
  }), [damagePoints, blockFeatures]);
  const nonPassableCount = enrichedDamagePoints.filter(p => /tidak bisa dilewati/i.test(p.status)).length;
  const passableCount = enrichedDamagePoints.filter(p => /bisa dilewati/i.test(p.status) && !/tidak bisa dilewati/i.test(p.status)).length;
  const unknownStatusCount = Math.max(0, enrichedDamagePoints.length - nonPassableCount - passableCount);
  const topEstateDamage = topGroup(enrichedDamagePoints, "estate");
  const topAmaDamage = topGroup(enrichedDamagePoints, "ama");
  const estate = "Ketapat Bening Estate";



  return <div className="layout">
    <aside className="sidebar">
      <div className="company-brand"><img className="lonsum-sidebar-logo" src="/photos/logo.jpg" alt="Logo Lonsum" /><div className="company-name">LONSUM<span>PLANTATION</span></div></div>
      <nav>
        <div className={`nav-item ${currentPage === "dashboard" ? "selected" : ""}`} onClick={() => setCurrentPage("dashboard")}><span>⌂</span>Dashboard</div>
        <div className={`nav-item ${currentPage === "map" ? "selected" : ""}`} onClick={() => setCurrentPage("map")}><span>◫</span>Peta Jalan</div>
        
        <div className={`nav-item ${currentPage === "realization" ? "selected" : ""}`} onClick={() => setCurrentPage("realization")}><span>☑</span>Realisasi Pemeliharaan</div>
        <div className={`nav-item ${currentPage === "photos" ? "selected" : ""}`} onClick={() => setCurrentPage("photos")}><span>▣</span>Foto Dokumentasi</div>
        <div className={`nav-item ${currentPage === "aop-details" ? "selected" : ""}`} onClick={() => setCurrentPage("aop-details")}><span>▤</span>Detail AOP Cost</div>
        <div className="nav-item"><span>▤</span>Data Jalan</div>
        <div className="nav-item"><span>⇧</span>Import Data</div>
        <div className="nav-item"><span>▥</span>Laporan</div>
      </nav>
      <div className="sidebar-bottom"><div className="rw-leaf">◢</div><div><b>Road Monitoring</b><span>Road Maintenance Monitoring</span></div></div>
      <div className="sidebar-foot">London Sumatra Indonesia<br/><span>a member of IndoAgri</span></div>
    </aside>

    <main className="main">
      {currentPage === "aop-details" ? (
        <AopDetailsPage rows={aopRows} period={aopPeriod} onBack={() => setCurrentPage("dashboard")} />
      ) : currentPage === "map" ? (
        <RoadMapPage onOpenPlan={(block) => { setSelectedBlock(block); setCurrentPage("planning"); }} />
      ) : currentPage === "planning" ? (
        <MaintenancePlanPage block={selectedBlock} onBack={() => setCurrentPage("map")} onSaved={(plan) => setSubmittedPlans(current => [plan, ...current])} />
        ) : currentPage === "realization" ? (
          <RealizationPage />

         ) : currentPage === "photos" ? (
            <PhotoDocumentationPage />
          
      ) : currentPage !== "dashboard" ? (
        
        <div className="page-placeholder"><h1>{({realization:"Realisasi Pemeliharaan", photos:"Foto Dokumentasi"}[currentPage] || "RoadWatch")}</h1><p>Halaman ini kita konfigurasi pada tahap berikutnya.</p><button onClick={() => setCurrentPage("dashboard")}>Kembali ke Dashboard</button></div>
      ) :       <DashboardPage
        enrichedDamagePoints={enrichedDamagePoints}
        nonPassableCount={nonPassableCount}
        passableCount={passableCount}
        unknownStatusCount={unknownStatusCount}
        submittedPlans={submittedPlans}
        damageUpdatedAt={damageUpdatedAt}
        topAmaDamage={topAmaDamage}
        topEstateDamage={topEstateDamage}
        mapStyle={mapStyle}
        setMapStyle={setMapStyle}
        apiMode={apiMode}
        roads={roads}
        actualLength={actualLength}
        plannedLength={plannedLength}
        progress={progress}
        typeCounts={typeCounts}
        maxType={maxType}
        aopPeriod={aopPeriod}
        setAopPeriod={setAopPeriod}
        aopRows={aopRows}
        aopSummary={aopSummary}
        onOpenAopDetails={() => setCurrentPage("aop-details")}
        
      />
      }
    </main>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
