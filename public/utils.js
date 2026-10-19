function formatNumber(v) {
  return Number(v || 0).toLocaleString("id-ID", {
    maximumFractionDigits: 2
  });
}
function formatHa(v) {
  return Number(v || 0).toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
function dateFmt(v) { if(!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}); }
function unique(rows,key) { return [...new Set(rows.map(r=>r[key]).filter(Boolean))].sort(); }
function esc(v) { return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function topGroup(rows, key) {
  const counts = new Map();
  rows.forEach(row => {
    const name = String(row[key] || "Tidak diketahui");
    if (name === "Tidak diketahui") return;
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  const sorted = [...counts.entries()].sort((a,b) => b[1] - a[1]);
  return sorted.length ? { name: sorted[0][0], count: sorted[0][1] } : null;
}
function pointInGeometry(point, geometry) {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !geometry) return false;
  const inRing = (p, ring) => {
    let inside = false;
    for (let i=0, j=ring.length-1; i<ring.length; j=i++) {
      const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
      const intersects = ((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj-xi)*(p[1]-yi)/((yj-yi)||1e-12)+xi);
      if (intersects) inside = !inside;
    }
    return inside;
  };
  const inPolygon = polygon => Array.isArray(polygon) && polygon.length > 0 && inRing(point, polygon[0]) && !polygon.slice(1).some(ring => inRing(point, ring));
  if (geometry.type === "Polygon") return inPolygon(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(inPolygon);
  return false;
}

export { formatNumber, formatHa, dateFmt, unique, esc, topGroup, pointInGeometry };
