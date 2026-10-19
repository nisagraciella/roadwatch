
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const API_BASE =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  window.location.port !== "3001"
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : "";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmt = (n) =>
  Number(n || 0).toLocaleString("id-ID", {
    maximumFractionDigits: 2,
  });

const money = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));

const dateText = (value) => {
  if (!value) return "-";
  const raw = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00`
    : raw;
  const d = new Date(normalized);

  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString("id-ID");
};

const prop = (feature, keys) => {
  const p = feature?.properties || {};

  for (const key of keys) {
    if (
      p[key] !== undefined &&
      p[key] !== null &&
      String(p[key]).trim()
    ) {
      return String(p[key]).trim();
    }
  }

  return "";
};

function haversine(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const R = 6371008.8;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) *
      Math.cos(rad(b[1])) *
      Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

function getPlanStatus(plan) {
  return Boolean(plan?.realization_id);
}

function escapeHtml(value) {
  return String(value ?? "-").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

async function fetchRealizationPhotos(realizationId) {
  if (!realizationId) return [];

  const response = await fetch(
    `${API_BASE}/api/maintenance-realizations/${encodeURIComponent(realizationId)}/photos`,
    { headers: { Accept: "application/json" } }
  );

  const data = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(data.error || "Gagal memuat foto realisasi.");
  }

  return Array.isArray(data) ? data : data.photos || [];
}

function photosPopupHtml(photos) {
  if (!photos?.length) {
    return '<div style="margin-top:8px;color:#64748b">Belum ada foto realisasi.</div>';
  }

  return `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;max-width:300px">${photos.map((photo) => {
    const src = String(photo.photo_data || "");
    if (!src.startsWith("data:image/")) return "";
    return `<a href="${src}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(photo.photo_name || "Foto realisasi")}"><img src="${src}" alt="${escapeHtml(photo.photo_name || "Foto realisasi")}" style="width:100%;height:100px;object-fit:cover;border-radius:6px;border:1px solid #dbe4ea" /></a>`;
  }).join("")}</div>`;
}

function RealizationPage() {
  const [plans, setPlans] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Semua");
  const [selected, setSelected] = useState(null);
  const [panelMode, setPanelMode] = useState(null);
  const [mapStyle, setMapStyle] = useState("satellite");
  const [mapReady, setMapReady] = useState(false);

  const [mode, setMode] = useState("gps");
  const [tracking, setTracking] = useState("idle");
  const [coords, setCoords] = useState([]);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [detailPhotos, setDetailPhotos] = useState([]);
  const [detailPhotosLoading, setDetailPhotosLoading] = useState(false);
  const [detailPhotosError, setDetailPhotosError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    actual_date: today(),
    actual_cost: "",
    description: "",
  });

  const mapRef = useRef(null);
  const blocksLayerRef = useRef(null);
  const planMarkersRef = useRef(null);
  const realizationLinesRef = useRef(null);
  const routeLayerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const watchIdRef = useRef(null);
  const coordsRef = useRef([]);
  const modeRef = useRef("gps");
  const trackingRef = useRef("idle");
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const length = useMemo(() => {
    let total = 0;

    for (let i = 1; i < coords.length; i++) {
      total += haversine(coords[i - 1], coords[i]);
    }

    return total;
  }, [coords]);

  const completedCount = useMemo(
    () => plans.filter(getPlanStatus).length,
    [plans]
  );

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();

    return plans.filter((plan) => {
      const completed = getPlanStatus(plan);

      const matchesStatus =
        statusFilter === "Semua" ||
        (statusFilter === "Selesai" && completed) ||
        (statusFilter === "Belum direalisasikan" && !completed);

      const matchesSearch = [
        plan.block_code,
        plan.ecera_number,
        plan.ama,
        plan.estate,
        plan.division,
        plan.description,
      ].some((value) =>
        String(value || "").toLowerCase().includes(q)
      );

      return matchesStatus && matchesSearch;
    });
  }, [plans, search, statusFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [plansResponse, blocksResponse] = await Promise.all([
        fetch(`${API_BASE}/api/maintenance-plans`),
        fetch(`${API_BASE}/api/blocks`),
      ]);

      const plansData = await plansResponse.json();
      const blocksData = await blocksResponse.json();

      if (!plansResponse.ok) {
        throw new Error(
          plansData.error || "Gagal memuat rencana pemeliharaan."
        );
      }

      if (!blocksResponse.ok) {
        throw new Error(
          blocksData.error || "Gagal memuat batas blok."
        );
      }

      if (!Array.isArray(plansData)) {
        throw new Error("Format data rencana tidak valid.");
      }

      setPlans(plansData);
      setBlocks(
        Array.isArray(blocksData)
          ? blocksData
          : blocksData.features || []
      );
    } catch (err) {
      setError(err.message || "Gagal mengambil data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Muat dokumentasi foto ketika panel detail realisasi dibuka.
  useEffect(() => {
    let cancelled = false;

    const loadDetailPhotos = async () => {
      setDetailPhotos([]);
      setDetailPhotosError("");

      if (panelMode !== "detail" || !selected?.realization_id) {
        setDetailPhotosLoading(false);
        return;
      }

      setDetailPhotosLoading(true);
      try {
        const rows = await fetchRealizationPhotos(selected.realization_id);
        if (!cancelled) setDetailPhotos(rows);
      } catch (err) {
        if (!cancelled) setDetailPhotosError(err.message || "Gagal memuat foto.");
      } finally {
        if (!cancelled) setDetailPhotosLoading(false);
      }
    };

    loadDetailPhotos();
    return () => { cancelled = true; };
  }, [panelMode, selected?.realization_id]);

  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopGPS();
  }, [stopGPS]);

  const resetTrack = useCallback(() => {
    stopGPS();

    coordsRef.current = [];
    setCoords([]);
    setGpsAccuracy(null);
    setTracking("idle");
    trackingRef.current = "idle";
  }, [stopGPS]);

  const closePanel = () => {
    stopGPS();
    resetTrack();
    setSelected(null);
    selectedRef.current = null;
    setPanelMode(null);
    setPhotos([]);
    setMessage("");
  };

  const openPlan = (plan, action) => {
    stopGPS();
    resetTrack();
    setPhotos([]);
    setMessage("");

    setSelected(plan);
    selectedRef.current = plan;

    if (getPlanStatus(plan)) {
      setPanelMode("detail");
      setMessage("");
      return;
    }

    if (action === "detail") {
      setPanelMode("detail");
      return;
    }

    setPanelMode("form");
    setMode("gps");
    modeRef.current = "gps";

    setForm({
      actual_date: today(),
      actual_cost: "",
      description: "",
    });

    setMessage(
      "Rekam jalur aktual menggunakan GPS tracking atau gambar manual pada peta."
    );

    const lat = Number(plan.gps_lat);
    const lng = Number(plan.gps_lng);

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      mapRef.current
    ) {
      mapRef.current.setView([lat, lng], 17);
    }
  };

  const addCoordinate = useCallback((position) => {
    const point = [
      position.coords.longitude,
      position.coords.latitude,
    ];

    setGpsAccuracy(position.coords.accuracy);

    const previous =
      coordsRef.current[coordsRef.current.length - 1];

    if (previous && haversine(previous, point) < 2) {
      return;
    }

    const next = [...coordsRef.current, point];

    coordsRef.current = next;
    setCoords(next);
  }, []);

  const startGPS = () => {
    if (!navigator.geolocation) {
      setMessage("Browser tidak mendukung GPS.");
      return;
    }

    if (
      !window.isSecureContext &&
      window.location.hostname !== "localhost"
    ) {
      setMessage("GPS memerlukan HTTPS atau localhost.");
      return;
    }

    stopGPS();
    setMessage("");

    if (trackingRef.current !== "paused") {
      coordsRef.current = [];
      setCoords([]);
      setGpsAccuracy(null);
    }

    trackingRef.current = "recording";
    setTracking("recording");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (trackingRef.current === "recording") {
          addCoordinate(position);
        }
      },
      (err) => {
        setMessage(
          err.code === 1
            ? "Izin lokasi ditolak. Aktifkan izin lokasi browser."
            : "GPS gagal membaca lokasi. Periksa sinyal GPS perangkat."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20000,
      }
    );
  };

  const pauseGPS = () => {
    stopGPS();
    trackingRef.current = "paused";
    setTracking("paused");
    setMessage("Tracking dijeda. Kamu dapat melanjutkannya kembali.");
  };

  const finishGPS = () => {
    stopGPS();
    trackingRef.current = "finished";
    setTracking("finished");
    setMessage("Tracking selesai. Periksa jalur sebelum menyimpan.");
  };

  const chooseMode = (nextMode) => {
    stopGPS();

    coordsRef.current = [];
    setCoords([]);
    setGpsAccuracy(null);

    trackingRef.current = "idle";
    setTracking("idle");

    modeRef.current = nextMode;
    setMode(nextMode);

    setMessage(
      nextMode === "manual"
        ? "Klik beberapa titik di dalam peta untuk menggambar jalur aktual."
        : "Tekan Mulai Tracking untuk merekam jalur GPS."
    );
  };

  // Peta utama dibuat satu kali; perubahan data memperbarui layer.
  useEffect(() => {
    const L = window.L;
    const el = document.getElementById("realization-overview-map");

    if (!L || !el || mapRef.current) return;

    const map = L.map(el, {
      zoomControl: false,
    }).setView([-2.5, 118], 5);

    mapRef.current = map;

    const tileLayers = {
      satellite: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles © Esri",
        }
      ),
      basic: L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          attribution: "© CARTO",
        }
      ),
      osm: L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }
      ),
    };

    tileLayers[mapStyle].addTo(map);
    L.control.zoom({ position: "topleft" }).addTo(map);

    const blockLayer = L.geoJSON(null, {
      style: (feature) => {
        const code = prop(feature, [
          "BLOK",
          "block_code",
          "block",
        ]);

        const selectedCode = String(
          selectedRef.current?.block_code || ""
        );

        return {
          color:
            code === selectedCode ? "#facc15" : "#00bfa5",
          weight: code === selectedCode ? 3 : 1.2,
          fillColor:
            code === selectedCode ? "#facc15" : "#00bfa5",
          fillOpacity: code === selectedCode ? 0.12 : 0.025,
        };
      },
      onEachFeature: (feature, layer) => {
        const code = prop(feature, [
          "BLOK",
          "block_code",
          "block",
        ]);

        layer.bindPopup(`<b>Blok ${code || "-"}</b>`);

        layer.on("click", (event) => {
          if (
            modeRef.current !== "manual" ||
            trackingRef.current === "recording" ||
            !selectedRef.current ||
            getPlanStatus(selectedRef.current)
          ) {
            return;
          }

          L.DomEvent.stopPropagation(event);

          const next = [
            ...coordsRef.current,
            [event.latlng.lng, event.latlng.lat],
          ];

          coordsRef.current = next;
          setCoords(next);
          trackingRef.current = "drawing";
          setTracking("drawing");
        });
      },
    }).addTo(map);

    blocksLayerRef.current = blockLayer;

    const planMarkers = L.layerGroup().addTo(map);

    // Pane khusus agar jalur realisasi berada di atas batas blok dan mudah diklik.
    if (!map.getPane("realizationLinesPane")) {
      map.createPane("realizationLinesPane");
      map.getPane("realizationLinesPane").style.zIndex = 450;
    }

    // Jalur realisasi tersimpan. Klik garis akan membuka popup informasi + foto.
    const realizationLines = L.geoJSON(null, {
      pane: "realizationLinesPane",
      interactive: true,
      bubblingMouseEvents: false,
      style: () => ({
        pane: "realizationLinesPane",
        color: "#00e676",
        weight: 7,
        opacity: 1,
        lineCap: "round",
        lineJoin: "round",
        interactive: true,
        bubblingMouseEvents: false,
      }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const realizationId =
          p.realization_id ?? p.realizationId ?? p.id ?? null;

        const blockCode = p.block_code || p.BLOK || p.block || "-";
        const ecera = p.ecera_number || p.ecera || "-";
        const actualDate = p.actual_date ? dateText(p.actual_date) : "-";
        const actualLength = p.actual_length_m == null
          ? "-"
          : `${fmt(p.actual_length_m)} m`;
        const actualCost = p.actual_cost == null ? "-" : money(p.actual_cost);
        const description = p.realization_description || p.description || "-";

        const popup = document.createElement("div");
        popup.className = "realization-line-popup";
        popup.style.cssText = "min-width:240px;max-width:320px;line-height:1.6;color:#243b53";
        popup.innerHTML = `
          <strong>Informasi Realisasi Jalan</strong>
          <hr style="margin:6px 0 8px">
          <div>Blok: ${escapeHtml(blockCode)}</div>
          <div>e-CERA: ${escapeHtml(ecera)}</div>
          <div>Tanggal realisasi: ${escapeHtml(actualDate)}</div>
          <div>Panjang aktual: ${escapeHtml(actualLength)}</div>
          <div>Biaya aktual: ${escapeHtml(actualCost)}</div>
          <div>Keterangan: ${escapeHtml(description)}</div>
          <div class="realization-line-photos" style="margin-top:8px">Memuat foto dokumentasi...</div>
        `;

        layer.bindPopup(popup, {
          maxWidth: 340,
          minWidth: 260,
          closeButton: true,
          autoPan: true,
          keepInView: true,
        });

        // Paksa klik pada garis membuka popup, bukan popup batas blok di bawahnya.
        layer.on("click", (event) => {
          if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
          layer.openPopup(event.latlng);
        });

        layer.on("popupopen", async () => {
          const popupElement = layer.getPopup()?.getElement();
          const photoContainer = popupElement?.querySelector(".realization-line-photos");
          if (!photoContainer) return;

          if (!realizationId) {
            photoContainer.textContent = "ID realisasi tidak tersedia pada data jalur.";
            return;
          }

          photoContainer.textContent = "Memuat foto dokumentasi...";
          try {
            const rows = await fetchRealizationPhotos(realizationId);
            if (!photoContainer.isConnected) return;
            photoContainer.innerHTML = photosPopupHtml(rows);
          } catch (err) {
            if (photoContainer.isConnected) {
              photoContainer.textContent = err.message || "Gagal memuat foto realisasi.";
            }
          }
        });
      },
    }).addTo(map);


    const routeLayer = L.layerGroup().addTo(map);
    const markerLayer = L.layerGroup().addTo(map);

    planMarkersRef.current = planMarkers;
    realizationLinesRef.current = realizationLines;
    routeLayerRef.current = routeLayer;
    markerLayerRef.current = markerLayer;
    setMapReady(true);

    map.on("click", (event) => {
      if (
        modeRef.current !== "manual" ||
        trackingRef.current === "recording" ||
        !selectedRef.current ||
        getPlanStatus(selectedRef.current)
      ) {
        return;
      }

      const next = [
        ...coordsRef.current,
        [event.latlng.lng, event.latlng.lat],
      ];

      coordsRef.current = next;
      setCoords(next);
      trackingRef.current = "drawing";
      setTracking("drawing");
    });

    return () => {
      map.remove();
      mapRef.current = null;
      blocksLayerRef.current = null;
      planMarkersRef.current = null;
      realizationLinesRef.current = null;
      routeLayerRef.current = null;
      setMapReady(false);
      markerLayerRef.current = null;
    };
  }, []);

  // Muat jalur realisasi tersimpan dari API dan gambar dengan warna hijau.
  // Berjalan setelah peta siap, lalu diperbarui setelah daftar rencana dimuat ulang.
  useEffect(() => {
    const layer = realizationLinesRef.current;
    const map = mapRef.current;

    if (!mapReady || !map || !layer) return undefined;

    let cancelled = false;

    const loadRealizationLines = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/maintenance-realization-lines`
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error || `Gagal memuat jalur realisasi (HTTP ${response.status}).`
          );
        }

        const features = Array.isArray(data)
          ? data
          : Array.isArray(data?.features)
            ? data.features
            : [];

        if (cancelled) return;

        layer.clearLayers();
        layer.addData({
          type: "FeatureCollection",
          features: features.filter((feature) =>
            feature?.geometry &&
            ["LineString", "MultiLineString"].includes(feature.geometry.type)
          ),
        });

        // Pastikan semua garis berada di atas polygon blok.
        if (typeof layer.bringToFront === "function") layer.bringToFront();
        layer.eachLayer((line) => {
          if (typeof line.bringToFront === "function") line.bringToFront();
        });

        console.info(
          `RoadWatch: ${layer.getLayers().length} jalur realisasi dimuat.`
        );
      } catch (err) {
        if (!cancelled) {
          console.error("Gagal memuat jalur realisasi:", err);
        }
      }
    };

    loadRealizationLines();

    return () => {
      cancelled = true;
    };
  }, [mapReady, plans]);

  // Ganti basemap tanpa membuat ulang peta atau kehilangan layer.
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;

    if (!L || !map) return;

    const tileLayers = {
      satellite: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "Tiles © Esri" }
      ),
      basic: L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, attribution: "© CARTO" }
      ),
      osm: L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19, attribution: "© OpenStreetMap" }
      ),
    };

    if (map._roadwatchBaseLayer) {
      map.removeLayer(map._roadwatchBaseLayer);
    }

    map._roadwatchBaseLayer = tileLayers[mapStyle];
    map._roadwatchBaseLayer.addTo(map);
    map.invalidateSize();
  }, [mapStyle]);

  // Perbarui batas blok saat data tersedia.
  useEffect(() => {
    const layer = blocksLayerRef.current;
    const map = mapRef.current;

    if (!layer || !map) return;

    layer.clearLayers();
    layer.addData({
      type: "FeatureCollection",
      features: blocks,
    });

    const bounds = layer.getBounds();

    if (bounds.isValid() && !selected) {
      map.fitBounds(bounds, {
        padding: [20, 20],
        maxZoom: 14,
      });
    }

    map.invalidateSize();
  }, [blocks, selected]);

  // Titik rencana dan statusnya.
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    const layer = planMarkersRef.current;

    if (!L || !map || !layer) return;

    layer.clearLayers();

    plans.forEach((plan) => {
      const lat = Number(plan.gps_lat);
      const lng = Number(plan.gps_lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      const completed = getPlanStatus(plan);
      const isSelected = String(selected?.id) === String(plan.id);

      const marker = L.circleMarker([lat, lng], {
        radius: isSelected ? 10 : 7,
        color: "#ffffff",
        weight: 2,
        fillColor: completed ? "#059669" : "#f59e0b",
        fillOpacity: 1,
      });

      marker.bindPopup(
        `<div style="min-width:230px;max-width:320px">` +
          `<b>Rencana Pemeliharaan</b><br>` +
          `Blok: ${escapeHtml(plan.block_code || "-")}<br>` +
          `Kategori: ${escapeHtml(plan.road_category === "main_road" ? "Main Road" : plan.road_category === "collection_road" ? "Collection Road" : "-")}<br>` +
          `e-CERA: ${escapeHtml(plan.ecera_number || "-")}<br>` +
          `Tanggal rencana: ${escapeHtml(dateText(plan.input_date))}<br>` +
          `Panjang rencana: ${escapeHtml(fmt(plan.road_length_m))} m<br>` +
          `Biaya rencana: ${escapeHtml(money(plan.cost))}<br>` +
          `Status: ${completed ? "Sudah direalisasikan" : "Belum direalisasikan"}` +
          (completed ? `<div class="realization-popup-photos">Memuat foto...</div>` : "") +
          `</div>`,
        { maxWidth: 340 }
      );

      if (completed && plan.realization_id) {
        marker.on("popupopen", async () => {
          const popupElement = marker.getPopup()?.getElement();
          const photoContainer = popupElement?.querySelector(".realization-popup-photos");
          if (!photoContainer) return;
          try {
            const rows = await fetchRealizationPhotos(plan.realization_id);
            if (photoContainer.isConnected) {
              photoContainer.innerHTML = photosPopupHtml(rows);
            }
          } catch (err) {
            if (photoContainer.isConnected) {
              photoContainer.innerHTML = `<div style="margin-top:8px;color:#b91c1c">${escapeHtml(err.message || "Foto gagal dimuat")}</div>`;
            }
          }
        });
      }

      marker.on("click", () => {
        const current = plans.find(
          (item) => String(item.id) === String(plan.id)
        );

        if (current) {
          setSelected(current);
          selectedRef.current = current;
        }

        map.setView([lat, lng], 17);
      });

      marker.addTo(layer);
    });
  }, [plans, selected?.id]);

  // Gambar jalur yang sedang direkam atau digambar.
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    const route = routeLayerRef.current;
    const markers = markerLayerRef.current;

    if (!L || !map || !route || !markers) return;

    route.clearLayers();
    markers.clearLayers();

    if (coords.length) {
      const latLngs = coords.map(([lng, lat]) => [lat, lng]);

      if (latLngs.length > 1) {
        L.polyline(latLngs, {
          color: "#00b875",
          weight: 5,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(route);
      }

      L.circleMarker(latLngs[0], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#16a34a",
        fillOpacity: 1,
      })
        .bindTooltip("Titik awal")
        .addTo(markers);

      if (latLngs.length > 1) {
        L.circleMarker(latLngs[latLngs.length - 1], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#ef4444",
          fillOpacity: 1,
        })
          .bindTooltip("Titik akhir")
          .addTo(markers);
      }

      if (panelMode === "form") {
        map.fitBounds(L.latLngBounds(latLngs), {
          padding: [30, 30],
          maxZoom: 18,
        });
      }
    }

    map.invalidateSize();
  }, [coords, panelMode]);

  // Foto realisasi.
  const onPhotos = (event) => {
    const accepted = [];
    const errors = [];

    for (const file of Array.from(event.target.files || [])) {
      if (!file.type.startsWith("image/")) {
        errors.push(`${file.name}: file harus berupa gambar.`);
      } else if (file.size > 8 * 1024 * 1024) {
        errors.push(`${file.name}: ukuran maksimal 8 MB.`);
      } else {
        accepted.push(file);
      }
    }

    setPhotos(accepted);
    setMessage(errors.join(" "));
  };

  const readPhoto = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () =>
        resolve({
          photo_name: file.name,
          photo_mime: file.type,
          photo_data: reader.result,
        });

      reader.onerror = () =>
        reject(new Error(`Gagal membaca foto ${file.name}.`));

      reader.readAsDataURL(file);
    });

  const saveRealization = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!selected) {
      setMessage("Pilih rencana dari tabel atau peta.");
      return;
    }

    if (getPlanStatus(selected)) {
      setMessage("Rencana ini sudah direalisasikan.");
      return;
    }

    if (coords.length < 2) {
      setMessage("Jalur aktual harus memiliki minimal dua titik.");
      return;
    }

    if (!photos.length) {
      setMessage("Tambahkan minimal satu foto realisasi.");
      return;
    }

    if (
      !form.actual_date ||
      form.actual_cost === "" ||
      !Number.isFinite(Number(form.actual_cost)) ||
      Number(form.actual_cost) < 0
    ) {
      setMessage("Lengkapi tanggal dan biaya aktual dengan benar.");
      return;
    }

    setSaving(true);

    try {
      const photoPayload = await Promise.all(
        photos.map(readPhoto)
      );

      const payload = {
        plan_id: Number(selected.id),
        actual_date: form.actual_date,
        actual_length_m: Number(length.toFixed(2)),
        actual_cost: Number(form.actual_cost),
        description: form.description.trim(),
        geometry_json: {
          type: "LineString",
          coordinates: coords,
        },
        photos: photoPayload,
      };

      const response = await fetch(
        `${API_BASE}/api/maintenance-realizations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "Gagal menyimpan realisasi."
        );
      }

      await loadData();

      setMessage(
        result.message || "Realisasi berhasil disimpan."
      );

      closePanel();
    } catch (err) {
      setMessage(err.message || "Gagal menyimpan realisasi.");
    } finally {
      setSaving(false);
    }
  };

  const focusPlan = (plan) => {
    setSelected(plan);
    selectedRef.current = plan;

    const lat = Number(plan.gps_lat);
    const lng = Number(plan.gps_lng);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mapRef.current?.setView([lat, lng], 17);
    }
  };

  return (
    <div className="realization-page">
      <style>{`
        .realization-detail-photos { margin-top: 22px; }
        .realization-detail-photos h3 { margin: 0 0 12px; color: #123b32; }
        .realization-photo-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; }
        .realization-photo-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 8px; border: 1px solid #dce7e2; border-radius: 12px; color: #24443a; text-decoration: none; background: #fff; }
        .realization-photo-card img { display: block; width: 100%; height: 145px; object-fit: cover; border-radius: 8px; background: #f1f5f9; }
        .realization-photo-card span { overflow-wrap: anywhere; font-size: 12px; }
        .realization-popup-photos img { cursor: zoom-in; }
        @media (max-width: 640px) { .realization-photo-gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); } .realization-photo-card img { height: 115px; } }
      `}</style>
      <header className="page-heading">
        <div>
          <h1>Realisasi Pemeliharaan</h1>
          <p>
            Pantau rencana, jalur aktual, status pekerjaan, dan
            dokumentasi realisasi pemeliharaan jalan.
          </p>
        </div>

        <button
          className="realization-secondary-button"
          type="button"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? "Memuat..." : "Muat Ulang"}
        </button>
      </header>

      <section className="realization-summary">
        <article className="realization-stat">
          <span>Jumlah Rencana</span>
          <strong>{plans.length}</strong>
          <small>Seluruh rencana pemeliharaan</small>
        </article>

        <article className="realization-stat">
          <span>Belum Direalisasikan</span>
          <strong>{plans.length - completedCount}</strong>
          <small>Menunggu pelaksanaan</small>
        </article>

        <article className="realization-stat">
          <span>Sudah Direalisasikan</span>
          <strong>{completedCount}</strong>
          <small>Pekerjaan sudah tercatat</small>
        </article>
      </section>

      {error && (
        <div className="realization-alert error">
          {error}
        </div>
      )}

      <section className="realization-panel realization-map-panel">
        <div className="realization-panel-heading">
          <div>
            <h2>Peta Realisasi</h2>
            <p>
              Pilih titik rencana untuk melihat lokasinya. Jalur aktual yang sudah tersimpan ditampilkan dengan warna hijau.
            </p>
          </div>

          <div className="realization-map-controls">
            {[
              ["satellite", "Satelit"],
              ["basic", "Peta Dasar"],
              ["osm", "OpenStreetMap"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`realization-secondary-button ${
                  mapStyle === value ? "selected" : ""
                }`}
                onClick={() => setMapStyle(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          id="realization-overview-map"
          className="realization-overview-map"
        />

        <div className="realization-legend">
          <span><i className="legend-block" /> Batas blok</span>
          <span><i className="legend-pending" /> Belum direalisasikan</span>
          <span><i className="legend-complete" /> Sudah direalisasikan</span>
          <span><i className="legend-route" /> Jalur aktual</span>
        </div>
      </section>

      {selected && panelMode && (
        <section
          className="realization-panel realization-action-panel"
          id="realization-action-panel"
        >
          <div className="realization-panel-heading">
            <div>
              <span className="realization-eyebrow">
                {panelMode === "form"
                  ? "INPUT PEKERJAAN AKTUAL"
                  : "RINGKASAN PEKERJAAN"}
              </span>

              <h2>
                {panelMode === "form"
                  ? `Realisasi — Blok ${selected.block_code}`
                  : `Detail — Blok ${selected.block_code}`}
              </h2>

              <p>
                e-CERA: {selected.ecera_number || "-"} · Panjang
                rencana: {fmt(selected.road_length_m)} m
              </p>
            </div>

            <button
              type="button"
              className="realization-secondary-button"
              onClick={closePanel}
            >
              Tutup
            </button>
          </div>

          {panelMode === "detail" ? (
            <div className="realization-detail-content">
              <div className="realization-detail-grid">
                <div>
                  <span>Tanggal Rencana</span>
                  <strong>{dateText(selected.input_date)}</strong>
                </div>

                <div>
                  <span>Biaya Rencana</span>
                  <strong>{money(selected.cost)}</strong>
                </div>

                <div>
                  <span>Tanggal Realisasi</span>
                  <strong>{dateText(selected.actual_date)}</strong>
                </div>

                <div>
                  <span>Panjang Aktual</span>
                  <strong>
                    {selected.actual_length_m == null
                      ? "-"
                      : `${fmt(selected.actual_length_m)} m`}
                  </strong>
                </div>

                <div>
                  <span>Biaya Aktual</span>
                  <strong>
                    {selected.actual_cost == null
                      ? "-"
                      : money(selected.actual_cost)}
                  </strong>
                </div>

                <div>
                  <span>Status</span>
                  <strong className="detail-complete">
                    {getPlanStatus(selected)
                      ? "Sudah direalisasikan"
                      : "Belum direalisasikan"}
                  </strong>
                </div>
              </div>

              <div className="realization-description">
                <span>Keterangan realisasi</span>
                <p>{selected.realization_description || "-"}</p>
              </div>

              {getPlanStatus(selected) && (
                <section className="realization-detail-photos">
                  <h3>Foto Dokumentasi Realisasi</h3>
                  {detailPhotosLoading ? (
                    <p className="realization-empty">Memuat foto dokumentasi...</p>
                  ) : detailPhotosError ? (
                    <p className="realization-alert error">{detailPhotosError}</p>
                  ) : detailPhotos.length ? (
                    <div className="realization-photo-gallery">
                      {detailPhotos.map((photo) => (
                        <a
                          className="realization-photo-card"
                          key={photo.id || photo.photo_id || photo.photo_name}
                          href={photo.photo_data}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={photo.photo_data}
                            alt={photo.photo_name || "Foto realisasi"}
                            loading="lazy"
                          />
                          <span>{photo.photo_name || "Foto realisasi"}</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="realization-empty">Belum ada foto dokumentasi untuk realisasi ini.</p>
                  )}
                </section>
              )}

              {getPlanStatus(selected) ? (
                <div className="realization-info-note">
                  Data realisasi sudah tersimpan. Untuk mencegah
                  duplikasi, form input tidak ditampilkan kembali.
                </div>
              ) : (
                <div className="realization-info-note">
                  Rencana ini belum direalisasikan.
                  <button
                    type="button"
                    className="realization-primary-button"
                    onClick={() => openPlan(selected, "realization")}
                  >
                    Buat Realisasi
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="tracking-toolbar">
                <div className="tracking-modes">
                  <button
                    type="button"
                    className={mode === "gps" ? "active" : ""}
                    onClick={() => chooseMode("gps")}
                  >
                    GPS Tracking
                  </button>

                  <button
                    type="button"
                    className={mode === "manual" ? "active" : ""}
                    onClick={() => chooseMode("manual")}
                  >
                    Gambar Manual
                  </button>
                </div>

                {mode === "gps" ? (
                  <div className="tracking-actions">
                    {tracking === "recording" ? (
                      <button type="button" onClick={pauseGPS}>
                        Pause
                      </button>
                    ) : (
                      <button type="button" onClick={startGPS}>
                        {tracking === "paused"
                          ? "Lanjutkan"
                          : "Mulai Tracking"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={finishGPS}
                      disabled={
                        tracking !== "recording" &&
                        tracking !== "paused"
                      }
                    >
                      Selesai
                    </button>

                    <button type="button" onClick={resetTrack}>
                      Reset Jalur
                    </button>
                  </div>
                ) : (
                  <div className="tracking-actions">
                    <span>
                      Klik titik-titik pada peta untuk menggambar jalur.
                    </span>

                    <button type="button" onClick={resetTrack}>
                      Hapus Jalur
                    </button>
                  </div>
                )}
              </div>

              <div className="realization-map-stats">
                <div>
                  <span>Panjang jalur</span>
                  <strong>{fmt(length)} m</strong>
                </div>

                <div>
                  <span>Panjang (km)</span>
                  <strong>{fmt(length / 1000)} km</strong>
                </div>

                <div>
                  <span>Jumlah titik</span>
                  <strong>{coords.length}</strong>
                </div>

                <div>
                  <span>Akurasi GPS</span>
                  <strong>
                    {gpsAccuracy == null
                      ? "-"
                      : `±${fmt(gpsAccuracy)} m`}
                  </strong>
                </div>
              </div>

              <form
                onSubmit={saveRealization}
                className="realization-entry-form"
              >
                <h3>Data Realisasi Aktual</h3>

                <div className="realization-form-grid">
                  <label>
                    Tanggal Realisasi *
                    <input
                      type="date"
                      required
                      value={form.actual_date}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          actual_date: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Biaya Aktual (Rp) *
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={form.actual_cost}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          actual_cost: event.target.value,
                        })
                      }
                      placeholder="Masukkan biaya aktual"
                    />
                  </label>

                  <label className="full-field">
                    Keterangan
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          description: event.target.value,
                        })
                      }
                      placeholder="Keterangan pekerjaan aktual..."
                    />
                  </label>

                  <label className="full-field">
                    Foto Realisasi *
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      required
                      onChange={onPhotos}
                    />
                    <small>
                      {photos.length} foto dipilih. Maksimal 8 MB
                      per foto.
                    </small>

                    {photos.length > 0 && (
                      <ul className="realization-photo-list">
                        {photos.map((photo) => (
                          <li key={`${photo.name}-${photo.lastModified}`}>
                            {photo.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </label>
                </div>

                {message && (
                  <div className="realization-alert">
                    {message}
                  </div>
                )}

                <div className="realization-submit-row">
                  <button
                    type="button"
                    className="realization-secondary-button"
                    onClick={closePanel}
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    className="realization-primary-button"
                    disabled={saving}
                  >
                    {saving ? "Menyimpan..." : "Simpan Realisasi"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      )}

      <section className="realization-panel">
        <div className="realization-panel-heading">
          <div>
            <h2>Daftar Rencana Pemeliharaan</h2>
            <p>
              Pilih aksi pada baris yang ingin dilihat atau direalisasikan.
            </p>
          </div>

          <span className="realization-count">
            {filteredPlans.length} data
          </span>
        </div>

        <div className="realization-table-filters">
          <input
            type="search"
            placeholder="Cari blok / e-CERA..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>Semua</option>
            <option>Belum direalisasikan</option>
            <option>Selesai</option>
          </select>
        </div>

        {loading ? (
          <p className="realization-empty">Memuat data rencana...</p>
        ) : (
          <div className="realization-table-wrap">
            <table className="realization-table">
              <thead>
                <tr>
                  <th>Blok</th>
                  <th>Tanggal Rencana</th>
                  <th>e-CERA</th>
                  <th>Panjang Rencana</th>
                  <th>Panjang Aktual</th>
                  <th>Biaya Aktual</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>

              <tbody>
                {filteredPlans.map((plan) => {
                  const completed = getPlanStatus(plan);
                  const active =
                    String(selected?.id) === String(plan.id);

                  return (
                    <tr
                      key={plan.id}
                      className={active ? "selected-row" : ""}
                      onClick={() => focusPlan(plan)}
                    >
                      <td>
                        <strong>{plan.block_code || "-"}</strong>
                      </td>

                      <td>{dateText(plan.input_date)}</td>

                      <td>{plan.ecera_number || "-"}</td>

                      <td>{fmt(plan.road_length_m)} m</td>

                      <td>
                        {plan.actual_length_m == null
                          ? "-"
                          : `${fmt(plan.actual_length_m)} m`}
                      </td>

                      <td>
                        {plan.actual_cost == null
                          ? "-"
                          : money(plan.actual_cost)}
                      </td>

                      <td>
                        <span
                          className={`realization-status ${
                            completed ? "complete" : "pending"
                          }`}
                        >
                          {completed
                            ? "Sudah direalisasikan"
                            : "Belum direalisasikan"}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={
                            completed
                              ? "realization-secondary-button"
                              : "realization-primary-button"
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            openPlan(
                              plan,
                              completed ? "detail" : "realization"
                            );
                          }}
                        >
                          {completed ? "Detail" : "Realisasi"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!filteredPlans.length && (
                  <tr>
                    <td colSpan={8} className="realization-empty">
                      Tidak ada data yang sesuai dengan pencarian atau
                      filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}

export default RealizationPage;
