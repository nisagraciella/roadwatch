import React, { useEffect, useState } from "react";

const API_BASE =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  window.location.port !== "3001"
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : "";

function formatDate(value) {
  if (!value) return "-";
  const raw = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function getImageSource(photo) {
  if (!photo?.photo_data) return "";
  const value = String(photo.photo_data);
  if (value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("blob:")) return value;
  if (photo.photo_mime && value) return `data:${photo.photo_mime};base64,${value}`;
  return "";
}

function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.features)) return data.features;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function readField(row, keys) {
  const properties = row?.properties || row || {};
  for (const key of keys) {
    const value = properties[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

export default function PhotoDocumentationPage() {
  const [blockCode, setBlockCode] = useState("");
  const [selectedAma, setSelectedAma] = useState("");
  const [selectedEstate, setSelectedEstate] = useState("");
  const [filterPairs, setFilterPairs] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [amas, setAmas] = useState([]);
  const [estates, setEstates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  async function loadPhotos(filters = {}) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      const code = String(filters.blockCode ?? blockCode).trim();
      const ama = String(filters.ama ?? selectedAma).trim();
      const estate = String(filters.estate ?? selectedEstate).trim();
      if (code) params.set("block_code", code);
      if (ama) params.set("ama", ama);
      if (estate) params.set("estate", estate);

      const query = params.toString();
      const response = await fetch(`${API_BASE}/api/maintenance-photos${query ? `?${query}` : ""}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal mengambil foto dokumentasi.");

      setPhotos(Array.isArray(result.photos) ? result.photos : []);

      // Kompatibel dengan format respons backend lama maupun baru.
      const filterData = result.filters || {};
      const responseAmas = Array.isArray(filterData.amas)
        ? filterData.amas
        : Array.isArray(result.amas) ? result.amas : [];
      const responseEstates = Array.isArray(filterData.estates)
        ? filterData.estates
        : Array.isArray(result.estates) ? result.estates : [];
      const responsePairs = Array.isArray(filterData.pairs) ? filterData.pairs : [];

      if (responseAmas.length) setAmas(responseAmas);
      if (responseEstates.length) setEstates(responseEstates);
      if (responsePairs.length) setFilterPairs(responsePairs);
      setSearched(Boolean(code || ama || estate));
    } catch (err) {
      setError(err.message || "Terjadi kesalahan saat memuat foto.");
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPhotos({ blockCode: "", ama: "", estate: "" });
    // Muat overview saat halaman pertama kali dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Muat daftar AMA dari tabel/layer blok, bukan hanya dari foto dokumentasi.
  // Endpoint foto bisa mengembalikan opsi AMA kosong jika belum ada foto untuk AMA tertentu.
  useEffect(() => {
    let cancelled = false;

    async function loadAmaOptions() {
      try {
        const response = await fetch(`${API_BASE}/api/blocks`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Gagal memuat daftar AMA dari data blok.");

        const data = await response.json();
        const rows = normalizeRows(data);
        const pairs = rows.map((row) => ({
          ama: readField(row, [
            "ama", "AMA", "ama_name", "AMA_NAME", "nama_ama", "NAMA_AMA",
            "ama_text", "AMA_TEXT", "namaAMA", "Nama_AMA",
          ]),
          estate: readField(row, [
            "ba_text", "BAText", "BA_TEXT", "estate", "Estate", "ESTATE",
            "estate_name", "ESTATE_NAME",
          ]),
        })).filter((item) => item.ama || item.estate);

        const uniqueValues = [...new Set(pairs.map((item) => item.ama).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, "id", { numeric: true, sensitivity: "base" })
        );
        const uniqueEstates = [...new Set(pairs.map((item) => item.estate).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, "id", { numeric: true, sensitivity: "base" })
        );

        if (!cancelled) {
          setFilterPairs(pairs);
          if (uniqueValues.length) setAmas(uniqueValues);
          if (uniqueEstates.length) setEstates(uniqueEstates);
        }
      } catch (err) {
        // Fallback: gunakan opsi AMA yang dikembalikan endpoint foto bila tersedia.
        console.warn("Daftar AMA dari /api/blocks tidak berhasil dimuat:", err);
      }
    }

    loadAmaOptions();
    return () => { cancelled = true; };
  }, []);

  async function handleSearch(event) {
    event.preventDefault();
    await loadPhotos({ blockCode, ama: selectedAma, estate: selectedEstate });
  }

  async function handleAmaChange(value) {
    // Estate harus di-reset ketika AMA berubah agar pilihan lama tidak nyangkut.
    setSelectedAma(value);
    setSelectedEstate("");
    await loadPhotos({ blockCode, ama: value, estate: "" });
  }

  async function handleEstateChange(value) {
    setSelectedEstate(value);
    await loadPhotos({ blockCode, ama: selectedAma, estate: value });
  }

  async function handleReset() {
    setBlockCode("");
    setSelectedAma("");
    setSelectedEstate("");
    setSelectedPhoto(null);
    await loadPhotos({ blockCode: "", ama: "", estate: "" });
  }

  // Estate yang tersedia mengikuti AMA yang sedang dipilih.
  // Jika AMA kosong, tampilkan semua Estate.
  const estateOptions = [...new Set(
    filterPairs
      .filter((item) => !selectedAma || item.ama === selectedAma)
      .map((item) => item.estate)
      .filter(Boolean)
  )].sort((a, b) =>
    a.localeCompare(b, "id", { numeric: true, sensitivity: "base" })
  );

  // Fallback jika metadata dari /api/blocks belum menyediakan pasangan AMA-Estate.
  const visibleEstateOptions = estateOptions.length ? estateOptions : (!selectedAma ? estates : []);

  return (
    <div className="photo-documentation-page">
      <header className="photo-page-heading">
        <div>
          <span className="photo-eyebrow">ROAD MAINTENANCE MONITORING</span>
          <h1>Foto Dokumentasi</h1>
          <p>Lihat dokumentasi pekerjaan pemeliharaan jalan berdasarkan blok, AMA, dan Estate.</p>
        </div>
        <button type="button" className="photo-refresh-button" onClick={() => loadPhotos({ blockCode, ama: selectedAma, estate: selectedEstate })} disabled={loading}>
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </header>

      <section className="photo-search-panel">
        <div className="photo-section-heading">
          <div className="photo-search-icon">⌕</div>
          <div>
            <h2>Cari dan Filter Dokumentasi</h2>
            <p>Cari kode blok atau kombinasikan filter AMA dan Estate.</p>
          </div>
        </div>

        <form className="photo-search-form" onSubmit={handleSearch}>
          <label htmlFor="photo-block-search">Cari Berdasarkan Block</label>
          <div className="photo-search-controls">
            <input
              id="photo-block-search"
              type="search"
              value={blockCode}
              onChange={(event) => setBlockCode(event.target.value)}
              placeholder="Masukkan kode blok, misalnya 95214242"
              autoComplete="off"
            />
            <button type="submit" className="photo-search-button" disabled={loading}>Cari Foto</button>
          </div>

          <div className="photo-filter-row photo-ama-estate-filters">
            <div className="photo-filter-field">
              <label htmlFor="photo-ama-filter">Filter AMA</label>
              <select id="photo-ama-filter" value={selectedAma} onChange={(event) => handleAmaChange(event.target.value)} disabled={loading}>
                <option value="">Semua AMA</option>
                {amas.map((ama) => <option key={ama} value={ama}>{ama}</option>)}
              </select>
            </div>
            <div className="photo-filter-field">
              <label htmlFor="photo-estate-filter">Filter Estate</label>
              <select id="photo-estate-filter" value={selectedEstate} onChange={(event) => handleEstateChange(event.target.value)} disabled={loading}>
                <option value="">Semua Estate</option>
                {visibleEstateOptions.map((estate) => <option key={estate} value={estate}>{estate}</option>)}
              </select>
            </div>
            <button type="button" className="photo-clear-button" onClick={handleReset} disabled={loading}>Reset Filter</button>
          </div>
          <p className="photo-filter-help">Filter AMA dan Estate dapat digunakan bersamaan dengan pencarian kode blok.</p>
        </form>
      </section>

      {error && <div className="photo-notice photo-error">{error}</div>}

      <section className="photo-results-panel">
        <div className="photo-results-heading">
          <div>
            <span className="photo-eyebrow">{searched ? "HASIL PENCARIAN" : "OVERVIEW DOKUMENTASI"}</span>
            <h2>{searched ? "Hasil Foto Dokumentasi" : "5 Foto Terbaru"}</h2>
            <p>{searched ? "Hasil sesuai kode blok, AMA, dan Estate yang dipilih." : "Maksimal lima foto terbaru ditampilkan agar overview tetap ringkas."}</p>
          </div>
          <span className="photo-result-count">{photos.length} foto</span>
        </div>

        {loading ? (
          <div className="photo-loading"><span className="photo-spinner" /><span>Memuat dokumentasi...</span></div>
        ) : photos.length === 0 && !error ? (
          <div className="photo-empty">
            <div className="photo-empty-icon">▧</div>
            <h3>{searched ? "Foto tidak ditemukan" : "Belum ada foto dokumentasi"}</h3>
            <p>{searched ? "Coba ubah kode blok atau pilihan AMA dan Estate." : "Foto akan muncul setelah dokumentasi realisasi tersimpan."}</p>
          </div>
        ) : (
          <div className="photo-gallery-grid">
            {photos.map((photo) => {
              const imageSource = getImageSource(photo);
              return (
                <article className="photo-gallery-card" key={photo.photo_id}>
                  <button type="button" className="photo-image-button" onClick={() => setSelectedPhoto(photo)} aria-label={`Lihat foto blok ${photo.block_code}`} disabled={!imageSource}>
                    {imageSource ? <img src={imageSource} alt={photo.photo_name || "Foto dokumentasi"} loading="lazy" /> : <div className="photo-missing-image">Foto tidak tersedia</div>}
                    {imageSource && <span className="photo-zoom-indicator">Perbesar ↗</span>}
                  </button>
                  <div className="photo-card-body">
                    <div className="photo-card-topline">
                      <span className="photo-block-badge">Blok {photo.block_code}</span>
                      <span className="photo-date">{formatDate(photo.actual_date)}</span>
                    </div>
                    <div className="photo-location-tags">
                      {photo.ama && <span>{photo.ama}</span>}
                      {photo.estate && <span>{photo.estate}</span>}
                    </div>
                    <h3 title={photo.photo_name || "Foto dokumentasi"}>{photo.photo_name || "Foto dokumentasi"}</h3>
                    <div className="photo-metadata">
                      <div><span>e-CERA</span><strong>{photo.ecera_number || "-"}</strong></div>
                      <div><span>Panjang aktual</span><strong>{formatNumber(photo.actual_length_m)} m</strong></div>
                      <div><span>Biaya aktual</span><strong>{photo.actual_cost == null ? "-" : `Rp ${formatNumber(photo.actual_cost)}`}</strong></div>
                      <div><span>Tanggal realisasi</span><strong>{formatDate(photo.actual_date)}</strong></div>
                    </div>
                    {photo.realization_description && <p className="photo-caption">{photo.realization_description}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedPhoto && (
        <div className="photo-lightbox" onClick={() => setSelectedPhoto(null)} role="presentation">
          <div className="photo-lightbox-content" role="dialog" aria-modal="true" aria-label="Detail foto dokumentasi" onClick={(event) => event.stopPropagation()}>
            <div className="photo-lightbox-header">
              <div><strong>Blok {selectedPhoto.block_code}</strong><span>{selectedPhoto.photo_name || "Foto dokumentasi"}</span></div>
              <button type="button" onClick={() => setSelectedPhoto(null)} aria-label="Tutup foto">×</button>
            </div>
            {getImageSource(selectedPhoto) && <img src={getImageSource(selectedPhoto)} alt={selectedPhoto.photo_name || "Foto dokumentasi"} />}
            <div className="photo-lightbox-footer">
              <span>Tanggal: {formatDate(selectedPhoto.actual_date)}</span>
              <span>e-CERA: {selectedPhoto.ecera_number || "-"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
