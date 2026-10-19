
import React, { useEffect, useRef, useState } from "react";
import { formatHa, pointInGeometry } from "../utils.js";

const API = "/api/maintenance-plans";


const BLOCKS_API = "/api/blocks";

function MaintenancePlanPage({ block, onBack, onSaved }) {
  const [form, setForm] = useState({
    inputDate: new Date().toLocaleDateString("en-CA"),
    ecera: "",
    cost: "",
    roadLength: "",
    description: "",
  });

  const [gps, setGps] = useState(null);
  const [gpsState, setGpsState] = useState("idle");
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [insideBlock, setInsideBlock] = useState(null);
  const [locationMode, setLocationMode] = useState("gps");
  const [selectedRoadCategory, setSelectedRoadCategory] = useState(
    block?.road_category || ""
  );

  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const modeRef = useRef("gps");
  const geometryRef = useRef(null);
  const blockLayerRef = useRef(null);
  const roadCategory = selectedRoadCategory;
  

  // Selalu simpan mode dan geometri terbaru untuk handler klik peta.
  useEffect(() => {
    modeRef.current = locationMode;
  }, [locationMode]);

  useEffect(() => {
    geometryRef.current = insideBlock;
  }, [insideBlock]);

  // Muat geometri blok yang dipilih.
  useEffect(() => {
    let cancelled = false;

    async function loadBlockGeometry() {
      setInsideBlock(null);

      if (!block?.code) {
        setGps(null);
        setGpsState("idle");
        return;
      }

      try {
        const response = await fetch(BLOCKS_API);
        if (!response.ok) throw new Error("Gagal memuat data blok.");

        const data = await response.json();
        const features = Array.isArray(data)
          ? data
          : data.features || [];

        const feature = features.find((item) => {
          const props = item.properties || {};
          const code =
            props.BLOK ??
            props.blok ??
            props.block_code ??
            props.code ??
            props.BLOCK_CODE;

          return String(code ?? "").trim() === String(block.code).trim();
        });

        const geometry = feature?.geometry || block.geometry || null;

        if (!cancelled) {
          setInsideBlock(geometry);
          geometryRef.current = geometry;

          if (!geometry) {
            setMessage(
              `Geometri blok ${block.code} tidak ditemukan. Periksa data /api/blocks.`
            );
            setGpsState("unknown");
          } else {
            setMessage("");
            setGpsState("idle");
          }
        }
      } catch (error) {
        if (!cancelled) {
          const geometry = block.geometry || null;
          setInsideBlock(geometry);
          geometryRef.current = geometry;

          if (!geometry) {
            setMessage(error.message || "Gagal memuat batas blok.");
            setGpsState("unknown");
          }
        }
      }
    }

    loadBlockGeometry();

    return () => {
      cancelled = true;
    };
  }, [block]);

  // Periksa apakah koordinat berada di dalam blok.
  const validatePoint = (lat, lng, geometry) => {
    if (!geometry) return false;

    try {
      return pointInGeometry([lng, lat], geometry);
    } catch (error) {
      console.error("Validasi geometri gagal:", error);
      return false;
    }
  };

  // Pilih lokasi melalui GPS perangkat.
  const getGps = () => {
    setLocationMode("gps");
    modeRef.current = "gps";
    setMessage("");

    if (!navigator.geolocation) {
      setGpsState("error");
      setMessage("Browser ini tidak mendukung GPS.");
      return;
    }

    if (!geometryRef.current) {
      setGpsState("unknown");
      setMessage("Batas blok belum tersedia. GPS belum dapat divalidasi.");
      return;
    }

    setGpsState("loading");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        const isInside = validatePoint(
          lat,
          lng,
          geometryRef.current
        );

        setGps({ lat, lng, accuracy, source: "gps" });
        setGpsState(isInside ? "inside" : "outside");

        setMessage(
          isInside
            ? `GPS berada di dalam blok. Akurasi ±${Math.round(accuracy)} meter.`
            : "Lokasi GPS berada di luar blok terpilih. Pilih lokasi yang sesuai."
        );

        if (mapRef.current) {
          mapRef.current.setView([lat, lng], 18);
        }
      },
      (error) => {
        setGpsState("error");

        setMessage(
          error.code === 1
            ? "Izin lokasi ditolak. Aktifkan izin lokasi di browser."
            : error.code === 3
              ? "Pengambilan GPS melewati batas waktu. Coba lagi."
              : "GPS gagal didapatkan. Pastikan lokasi perangkat aktif."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  };

  // Aktifkan mode klik peta.
  const selectByMap = () => {
    setLocationMode("map");
    modeRef.current = "map";
    setGps(null);
    setGpsState("idle");
    setMessage("Klik satu titik di dalam batas blok pada peta.");
  };

  // Buat peta satu kali. Handler klik membaca mode terbaru dari ref.
  useEffect(() => {
    if (!window.L || !mapElementRef.current) return;

    const L = window.L;

    const map = L.map(mapElementRef.current, {
      zoomControl: true,
      doubleClickZoom: false,
    }).setView([0, 0], 2);

    mapRef.current = map;

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 20,
        attribution: "Tiles &copy; Esri",
      }
    ).addTo(map);

    // Klik peta untuk menentukan titik.
    map.on("click", (event) => {
      if (modeRef.current !== "map") return;

      const lat = event.latlng.lat;
      const lng = event.latlng.lng;
      const geometry = geometryRef.current;

      if (!geometry) {
        setGpsState("unknown");
        setMessage("Geometri blok belum tersedia.");
        return;
      }

      const isInside = validatePoint(lat, lng, geometry);

      if (!isInside) {
        setGps({ lat, lng, accuracy: null, source: "map" });
        setGpsState("outside");
        setMessage(
          "Titik berada di luar blok terpilih. Klik titik lain di dalam batas blok."
        );
        return;
      }

      setGps({ lat, lng, accuracy: null, source: "map" });
      setGpsState("inside");
      setMessage(
        "Titik berhasil dipilih. Lokasi berada di dalam blok."
      );
    });

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      blockLayerRef.current = null;
    };
  }, []);

  // Gambar batas blok dan zoom otomatis saat blok berubah.
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;

    if (!L || !map || !insideBlock) return;

    if (blockLayerRef.current) {
      map.removeLayer(blockLayerRef.current);
    }

    const blockLayer = L.geoJSON(
      {
        type: "Feature",
        properties: { code: block?.code },
        geometry: insideBlock,
      },
      {
        interactive: false,
        style: {
          color: "#ffd329",
          weight: 3,
          fillColor: "#ffd329",
          fillOpacity: 0.16,
        },
      }
    ).addTo(map);

    blockLayerRef.current = blockLayer;

    const bounds = blockLayer.getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [25, 25],
        maxZoom: 18,
      });
    }

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => window.clearTimeout(timer);
  }, [insideBlock, block?.code]);

  // Perbarui marker tanpa membuat ulang peta.
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;

    if (!L || !map) return;

    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }

    if (!gps || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) {
      return;
    }

    const isInside = validatePoint(
      gps.lat,
      gps.lng,
      geometryRef.current
    );

    const marker = L.circleMarker([gps.lat, gps.lng], {
      radius: 9,
      color: "#ffffff",
      weight: 2,
      fillColor: isInside ? "#16a34a" : "#ef4444",
      fillOpacity: 1,
    }).addTo(map);

    marker.bindPopup(
      `<b>${gps.source === "map" ? "Titik pilihan peta" : "Posisi GPS"}</b><br/>` +
        `Lat: ${gps.lat.toFixed(6)}<br/>` +
        `Lng: ${gps.lng.toFixed(6)}`
    );

    markerRef.current = marker;
    marker.openPopup();
  }, [gps, insideBlock]);

  // Baca foto dan batasi ukuran maksimal 8 MB.
  const onPhoto = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      setPhoto(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("File harus berupa foto atau gambar.");
      event.target.value = "";
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setMessage("Ukuran foto maksimal 8 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setPhoto({
        name: file.name,
        mime: file.type,
        data: reader.result,
      });
    };

    reader.onerror = () => {
      setMessage("Foto gagal dibaca. Silakan pilih foto kembali.");
    };

    reader.readAsDataURL(file);
  };

  // Simpan rencana pemeliharaan.
  const submit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!block?.code) {
      setMessage("Pilih blok terlebih dahulu.");
      return;
    }

    if (!insideBlock) {
      setMessage("Batas geometri blok belum tersedia.");
      return;
    }

    if (!gps || gpsState !== "inside") {
      setMessage(
        locationMode === "map"
          ? "Klik titik di dalam blok terlebih dahulu."
          : "Tekan Select by GPS dan pastikan GPS berada di dalam blok."
      );
      return;
    }

    if (
      !form.inputDate ||
      !form.ecera.trim() ||
      form.cost === "" ||
      Number(form.cost) < 0 ||
      !form.roadLength ||
      Number(form.roadLength) <= 0 ||
      !photo
    ) {
      setMessage(
        "Lengkapi tanggal, nomor e-CERA, cost, panjang jalan, dan foto."
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          block_code: block.code,
          road_category: selectedRoadCategory,
          input_date: form.inputDate,
          ecera_number: form.ecera.trim(),
          cost: Number(form.cost),
          road_length_m: Number(form.roadLength),
          description: form.description.trim(),
          photo_name: photo.name,
          photo_mime: photo.mime,
          photo_data: photo.data,
          gps_lat: gps.lat,
          gps_lng: gps.lng,
          gps_accuracy_m:
            gps.source === "map" ? null : gps.accuracy,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "Rencana gagal disimpan ke database."
        );
      }

      const savedPlan = {
        ...result,
        id: result.id || `plan-${Date.now()}`,
        road_code: form.ecera.trim(),
        ecera_number: form.ecera.trim(),
        block_name: block.code,
        block_code: block.code,
        estate: block.estate || "Estate —",
        division: block.division || "Divisi —",
        ama: block.ama || "",
        road_length_m: Number(form.roadLength),
        length_m: Number(form.roadLength),
        cost: Number(form.cost),
        description: form.description.trim(),
        status: "Dalam pengerjaan",
        road_status: "Dalam pengerjaan",
        maintenance_type:
          form.description.trim() || "Rencana pemeliharaan",
        input_date: form.inputDate,
        photo_name: photo.name,
        gps_lat: gps.lat,
        gps_lng: gps.lng,
      };

      if (typeof onSaved === "function") {
        onSaved(savedPlan);
      }

      setMessage("Rencana berhasil disimpan ke database.");

      setForm({
        inputDate: new Date().toLocaleDateString("en-CA"),
        ecera: "",
        cost: "",
        roadLength: "",
        description: "",
      });

      setPhoto(null);
      setGps(null);
      setGpsState("idle");
    } catch (error) {
      console.error("Simpan rencana gagal:", error);
      setMessage(
        error.message ||
          "Gagal menyimpan rencana. Periksa koneksi server."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="maintenance-page">
      <div className="page-heading">
        <div>
          <h1>Rencana Pemeliharaan</h1>
          <p>
            Pilih lokasi di dalam blok menggunakan GPS perangkat atau
            klik langsung pada peta.
          </p>
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={onBack}
        >
          ← Kembali ke Peta Jalan
        </button>
      </div>

      {!block ? (
        <div className="panel maintenance-empty">
          <h3>Blok belum dipilih</h3>
          <p>
            Buka Peta Jalan, pilih poligon blok, lalu pilih Buat
            Rencana Pemeliharaan.
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={onBack}
          >
            Buka Peta Jalan
          </button>
        </div>
      ) : (
        <>
          <div className="panel selected-block-card">
            <div>
              <span className="eyebrow">BLOK TERPILIH</span>
              <h2>{block.code}</h2>
              <p>
                {block.ama || "AMA —"} · {block.estate || "Estate —"} ·{" "}
                {block.division || "Divisi —"}
              </p>
            </div>

            <div className="block-area">
              <strong>
                {block.area == null ? "—" : `${formatHa(block.area)} ha`}
              </strong>
              <span>Luas blok</span>
            </div>
          </div>

          <form className="panel maintenance-form" onSubmit={submit}>
            <h3>Pilih Lokasi dan Blok</h3>

            <p>
              Blok {block.code} · {block.estate || "Estate —"} ·{" "}
              {block.division || "Divisi —"}
            </p>

            <div className="location-mode-switch" role="group">
              <button
                type="button"
                className={locationMode === "gps" ? "active" : ""}
                onClick={getGps}
                disabled={gpsState === "loading"}
              >
                {gpsState === "loading"
                  ? "Mengambil GPS…"
                  : "Select by GPS"}
              </button>

              <button
                type="button"
                className={locationMode === "map" ? "active" : ""}
                onClick={selectByMap}
              >
                Select by Map
              </button>
            </div>

            <div
              ref={mapElementRef}
              id="maintenance-location-preview"
              className="maintenance-location-preview"
              style={{
                width: "100%",
                minHeight: "380px",
                borderRadius: "10px",
                overflow: "hidden",
                cursor: locationMode === "map" ? "crosshair" : "grab",
              }}
            />

            <div className="map-demo-hint">
              {locationMode === "map"
                ? "Mode peta aktif: klik satu titik di dalam poligon kuning untuk memilih lokasi."
                : "Mode GPS aktif: tekan Select by GPS untuk mengambil posisi perangkat."}
            </div>

            <div className={`gps-check-card gps-${gpsState}`}>
              <div>
                <b>
                  {locationMode === "map"
                    ? "Validasi Titik Peta"
                    : "Validasi Lokasi GPS"}
                </b>

                <p>
                  {gpsState === "inside"
                    ? "Lokasi berada di dalam blok dan dapat digunakan."
                    : gpsState === "outside"
                      ? "Lokasi berada di luar blok. Pilih titik lain."
                      : gpsState === "loading"
                        ? "Sedang mengambil lokasi GPS…"
                        : gpsState === "unknown"
                          ? "Batas blok belum tersedia."
                          : gpsState === "error"
                            ? "Lokasi gagal didapatkan."
                            : locationMode === "map"
                              ? "Klik titik di dalam batas blok pada peta."
                              : "Tekan Select by GPS untuk mengambil lokasi aktual."}
                </p>

                {gps && (
                  <small>
                    Koordinat: {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                    {gps.source === "map"
                      ? " · Dipilih melalui peta"
                      : ` · Akurasi ±${Math.round(gps.accuracy)} m`}
                  </small>
                )}
              </div>
            </div>

            <div className="maintenance-form-grid">
  <label>
    Kategori Jalan *
    <select
      required
      value={roadCategory}
      onChange={(event) => {
        // Jika roadCategory masih berasal dari block,
        // gunakan state khusus seperti contoh di bawah.
        setSelectedRoadCategory(event.target.value);
      }}
    >
      <option value="">Pilih Kategori Jalan</option>
      <option value="main_road">Main Road</option>
      <option value="collection_road">Collection Road</option>
    </select>
  </label>
              
              <label>
                Tanggal Input Data *
                <input
                  type="date"
                  required
                  value={form.inputDate}
                  onChange={(event) =>
                    setForm({ ...form, inputDate: event.target.value })
                  }
                />
              </label>

              <label>
                Nomor e-CERA *
                <input
                  required
                  value={form.ecera}
                  onChange={(event) =>
                    setForm({ ...form, ecera: event.target.value })
                  }
                  placeholder="Masukkan nomor e-CERA"
                />
              </label>

              <label>
                Cost (Rp) *
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={form.cost}
                  onChange={(event) =>
                    setForm({ ...form, cost: event.target.value })
                  }
                  placeholder="Contoh: 15000000"
                />
              </label>

              <label>
                Panjang Jalan (meter) *
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  required
                  value={form.roadLength}
                  onChange={(event) =>
                    setForm({ ...form, roadLength: event.target.value })
                  }
                  placeholder="Panjang yang direncanakan"
                />
              </label>

              <label className="full-field">
                Keterangan
                <textarea
                  rows="3"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Jenis pekerjaan, kondisi jalan, catatan tambahan..."
                />
              </label>

              <label className="full-field">
                Foto Jalan *
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  required
                  onChange={onPhoto}
                />
                <small>Foto maksimal 8 MB.</small>
                {photo && (
                  <span className="photo-file-name">{photo.name}</span>
                )}
              </label>
            </div>

            {message && (
              <div
                className={`form-message ${
                  message.toLowerCase().includes("berhasil")
                    ? "success"
                    : "warning"
                }`}
              >
                {message}
              </div>
            )}

            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={saving || gpsState !== "inside"}
              >
                {saving ? "Menyimpan…" : "Simpan Rencana"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export default MaintenancePlanPage;
