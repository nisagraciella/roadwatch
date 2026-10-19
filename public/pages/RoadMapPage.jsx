
import React, { useEffect, useState } from "react";
import { formatHa, esc } from "../utils.js";

function RoadMapPage({ onOpenPlan }) {
  const [blocks, setBlocks] = useState([]);
  const [amas, setAmas] = useState([]);
  const [damages, setDamages] = useState([]);
  const [roadLines, setRoadLines] = useState([]);
  const [realizationLines, setRealizationLines] = useState([]);

  const [amaFilter, setAmaFilter] = useState("");
  const [estateFilter, setEstateFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [infraTypeFilter, setInfraTypeFilter] = useState("");
  const [blockSearch, setBlockSearch] = useState("");
  const [mapStyle, setMapStyle] = useState("satellite");
  const [error, setError] = useState("");
  const [maintenancePlans, setMaintenancePlans] = useState([]);

  // =====================================================
  // AMBIL DATA DARI BACKEND
  // =====================================================
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const endpoints = [
          "/api/blocks",
          "/api/ama-points",
          "/api/road-damage-points",
          "/api/road-lines",
          "/api/maintenance-realization-lines"
        ];

        const responses = await Promise.all(
          endpoints.map(url =>
            fetch(url).then(async response => {
              if (!response.ok) {
                throw new Error(
                  `Gagal mengambil data ${url}: HTTP ${response.status}`
                );
              }
              return response.json();
            })
          )
        );

        if (cancelled) return;

        setBlocks(responses[0].features || []);
        setAmas(responses[1].features || []);
        setDamages(responses[2].features || []);
        setRoadLines(responses[3].features || []);
        setRealizationLines(responses[4].features || []);
        const plansResponse = await fetch("/api/maintenance-plans");

if (plansResponse.ok) {
  const plansData = await plansResponse.json();
  setMaintenancePlans(
    Array.isArray(plansData) ? plansData : []
  );
}
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(
            `${err.message}. Periksa endpoint API dan server backend.`
          );
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  // =====================================================
  // HELPER DATA
  // =====================================================
  const prop = (feature, keys) => {
    const properties = feature?.properties || {};

    for (const key of keys) {
      const value = properties[key];

      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        return String(value).trim();
      }
    }

    return "";
  };

  const amaOf = feature =>
    prop(feature, ["AMA", "ama", "ama_name"]);

  const estateOf = feature =>
    prop(feature, ["BAText", "ESTATE", "estate", "Estate"]);

  const divisionOf = feature =>
    prop(feature, ["DIVISI", "DIVISION", "division", "Division"]);

  const uniqueSorted = values =>
    [...new Set(values.filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "id", { numeric: true })
    );

  const amaOptions = uniqueSorted(blocks.map(amaOf));

  const blocksByAma = blocks.filter(
    feature => !amaFilter || amaOf(feature) === amaFilter
  );

  const estateOptions = uniqueSorted(blocksByAma.map(estateOf));

  const blocksByEstate = blocksByAma.filter(
    feature => !estateFilter || estateOf(feature) === estateFilter
  );

  const divisionOptions = uniqueSorted(
    blocksByEstate.map(divisionOf)
  );

  const statusOptions = uniqueSorted(
    damages.map(feature =>
      prop(feature, ["road_status", "Ket", "status"])
    )
  );

  const infraTypeOptions = [
    { value: "CR", label: "Collection Road" },
    { value: "MR", label: "Main Road" }
  ];

  // =====================================================
  // POINT IN POLYGON
  // =====================================================
  const inRing = (point, ring) => {
    let inside = false;

    for (
      let i = 0, j = ring.length - 1;
      i < ring.length;
      j = i++
    ) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];

      const crosses =
        (yi > point[1]) !== (yj > point[1]) &&
        point[0] <
          ((xj - xi) * (point[1] - yi)) /
            ((yj - yi) || 1e-12) +
            xi;

      if (crosses) inside = !inside;
    }

    return inside;
  };

  const inPolygon = (point, polygon) =>
    polygon?.length &&
    inRing(point, polygon[0]) &&
    !polygon.slice(1).some(ring => inRing(point, ring));

  const isPointInGeometry = (point, geometry) => {
    if (!geometry) return false;

    if (geometry.type === "Polygon") {
      return inPolygon(point, geometry.coordinates);
    }

    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.some(polygon =>
        inPolygon(point, polygon)
      );
    }

    return false;
  };

  // =====================================================
  // FORMAT TANGGAL DAN ANGKA
  // =====================================================
  const formatDate = value => {
    if (!value) return "-";

    const dateText = String(value).slice(0, 10);

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      return dateText;
    }

    return dateText;
  };

  const formatNumber = value =>
    Number(value || 0).toLocaleString("id-ID", {
      maximumFractionDigits: 2
    });

  const formatRupiah = value =>
    Number(value || 0).toLocaleString("id-ID", {
      maximumFractionDigits: 0
    });

  // =====================================================
  // POPUP REALISASI + FOTO DOKUMENTASI
  // =====================================================
  const bindRealizationPopup = (feature, layer) => {
    const properties = feature.properties || {};

    const realizationId =
      properties.realization_id ||
      feature.id;

    const blockCode =
      properties.block_code ||
      properties.BLOCK ||
      properties.block ||
      "-";

    const date = formatDate(properties.actual_date);
    const length = formatNumber(properties.actual_length_m);
    const cost = formatRupiah(properties.actual_cost);
    const description = properties.description || "-";

    const popupHtml = `
      <div class="roadwatch-popup realization-photo-popup">
        <div class="realization-popup-heading">
          Realisasi Pemeliharaan
        </div>

        <div><b>Blok:</b> ${esc(blockCode)}</div>
        <div><b>Tanggal:</b> ${esc(date)}</div>
        <div><b>Panjang aktual:</b> ${length} m</div>
        <div><b>Biaya aktual:</b> Rp ${cost}</div>
        <div class="realization-popup-description">
          <b>Keterangan:</b> ${esc(description)}
        </div>

        <div class="realization-popup-section-title">
          Foto Dokumentasi
        </div>

        <div class="realization-popup-photos">
          <div class="realization-photo-loading">
            Memuat foto...
          </div>
        </div>
      </div>
    `;

    layer.bindPopup(popupHtml, {
      maxWidth: 320,
      minWidth: 240,
      maxHeight: 430,
      autoPan: true
    });

    layer.on("popupopen", async event => {
      const popupElement = event.popup.getElement();

      const photoContainer =
        popupElement?.querySelector(
          ".realization-popup-photos"
        );

      if (!photoContainer) return;

      if (!realizationId) {
        photoContainer.textContent =
          "ID realisasi tidak tersedia.";
        return;
      }

      photoContainer.innerHTML = `
        <div class="realization-photo-loading">
          Memuat foto dokumentasi...
        </div>
      `;

      try {
        const response = await fetch(
          `/api/maintenance-realizations/${encodeURIComponent(
            realizationId
          )}/photos`
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const photos = await response.json();

        // Popup bisa saja sudah ditutup ketika foto selesai dimuat.
        if (!photoContainer.isConnected) return;

        photoContainer.replaceChildren();

        if (!Array.isArray(photos) || photos.length === 0) {
          photoContainer.textContent =
            "Belum ada foto dokumentasi.";
          return;
        }

        let displayedCount = 0;

        photos.forEach(photo => {
          const photoData = photo.photo_data || "";
          const photoMime = photo.photo_mime || "";

          // Hanya menampilkan gambar yang tersimpan sebagai data URL.
          if (
            !photoMime.startsWith("image/") ||
            !photoData.startsWith("data:image/")
          ) {
            return;
          }

          const item = document.createElement("div");
          item.className = "realization-popup-photo-item";

          const image = document.createElement("img");
          image.src = photoData;
          image.alt =
            photo.photo_name || "Foto dokumentasi realisasi";
          image.loading = "lazy";

          const caption = document.createElement("div");
          caption.className =
            "realization-popup-photo-caption";
          caption.textContent =
            photo.photo_name || "Foto dokumentasi";

          item.appendChild(image);
          item.appendChild(caption);
          photoContainer.appendChild(item);

          displayedCount += 1;
        });

        if (displayedCount === 0) {
          photoContainer.textContent =
            "Foto belum tersedia atau format foto tidak didukung.";
        }
      } catch (err) {
        console.error(
          "Gagal mengambil foto realisasi:",
          err
        );

        if (photoContainer.isConnected) {
          photoContainer.textContent =
            "Foto gagal dimuat. Periksa endpoint foto di backend.";
        }
      }
    });
  };

  // =====================================================
  // RENDER PETA LEAFLET
  // =====================================================
  useEffect(() => {
    if (!window.L) return;

    const mapElement = document.getElementById("road-map-page");

    if (!mapElement) return;

    // Hindari inisialisasi Leaflet dua kali pada elemen yang sama.
    if (mapElement._leaflet_id) return;

    const map = window.L.map("road-map-page", {
      zoomControl: false
    }).setView([-2.5, 118], 5);

    const urls = {
      satellite:
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",

      basic:
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",

      osm:
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    };

    const attribution =
      mapStyle === "satellite"
        ? "Tiles &copy; Esri"
        : mapStyle === "osm"
          ? "&copy; OpenStreetMap"
          : "&copy; CARTO";

    window.L.tileLayer(urls[mapStyle], {
      attribution,
      maxZoom: 19
    }).addTo(map);

    window.L.control.zoom({
      position: "topleft"
    }).addTo(map);

    // -----------------------------------------------------
    // BATAS BLOK
    // -----------------------------------------------------
    const filteredBlocks = blocks.filter(feature => {
      const code = prop(feature, ["BLOK", "block_code"]);

      return (
        (!amaFilter || amaOf(feature) === amaFilter) &&
        (!estateFilter || estateOf(feature) === estateFilter) &&
        (!divisionFilter ||
          divisionOf(feature) === divisionFilter) &&
        (!blockSearch ||
          code.toLowerCase().includes(
            blockSearch.toLowerCase()
          ))
      );
    });

    window.L.geoJSON(
      {
        type: "FeatureCollection",
        features: filteredBlocks
      },
      {
        style: {
          color: "#00bfae",
          weight: 1.2,
          fillColor: "#00bfae",
          fillOpacity: 0.08
        },

        onEachFeature: (feature, layer) => {
          const properties = feature.properties || {};

          const code =
            prop(feature, ["BLOK", "block_code"]) ||
            "Tidak ada kode";

          layer.bindPopup(`
            <div class="roadwatch-popup">
              <b>Blok: ${esc(code)}</b><br>
              AMA: ${esc(amaOf(feature) || "-")}<br>
              Estate: ${esc(estateOf(feature) || "-")}<br>
              Divisi: ${esc(divisionOf(feature) || "-")}<br>
              Status: ${esc(
                prop(feature, ["STATUS", "block_status"]) || "-"
              )}<br>
              Luas: ${formatHa(
                properties.HA ?? properties.area_ha
              )} ha<br>

              <button
                type="button"
                class="roadwatch-photo-link"
              >
                Buat Rencana Pemeliharaan
              </button>
            </div>
          `);

          layer.on("popupopen", event => {
            const button =
              event.popup
                .getElement()
                ?.querySelector(".roadwatch-photo-link");

            if (!button) return;

            button.addEventListener(
              "click",
              () => {
                if (typeof onOpenPlan === "function") {
                  
onOpenPlan({
  code,
  ama: amaOf(feature),
  estate: estateOf(feature),
  division: divisionOf(feature),
  area: properties.HA ?? properties.area_ha,
  geometry: feature.geometry,
  road_category:
    infraTypeFilter === "MR"
      ? "main_road"
      : infraTypeFilter === "CR"
        ? "collection_road"
        : ""
});

                }
              },
              { once: true }
            );
          });
        }
      }
    ).addTo(map);

    // -----------------------------------------------------
    // TITIK AMA
    // -----------------------------------------------------
    const filteredAmas = amas.filter(
      feature =>
        !amaFilter || amaOf(feature) === amaFilter
    );

    window.L.geoJSON(
      {
        type: "FeatureCollection",
        features: filteredAmas
      },
      {
        pointToLayer: (_feature, latlng) =>
          window.L.circleMarker(latlng, {
            radius: 5,
            color: "#ffffff",
            weight: 1.5,
            fillColor: "#ff9800",
            fillOpacity: 1
          }),

        onEachFeature: (feature, layer) => {
          const name = amaOf(feature);

          if (name) {
            layer.bindTooltip(name, {
              permanent: true,
              direction: "right",
              offset: [7, 0],
              className: "ama-label"
            });
          }
        }
      }
    ).addTo(map);

    // -----------------------------------------------------
    // GARIS JALAN EKSISTING
    // -----------------------------------------------------
    const filteredRoadLines = roadLines.filter(feature => {
      const estate = prop(feature, ["ESTATE", "estate"]);
      const division = prop(feature, ["DIVISION", "division"]);
      const block = prop(feature, [
        "BLOCK",
        "block_code",
        "BLOK"
      ]);
      const infra = prop(feature, [
        "INFRA_TYPE",
        "infra_type"
      ]);

      return (
        (!estateFilter ||
          estate === estateFilter ||
          estateOf({
            properties: { BAText: estate }
          }) === estateFilter) &&
        (!divisionFilter ||
          division === divisionFilter) &&
        (!infraTypeFilter || infra === infraTypeFilter) &&
        (!blockSearch ||
          block.toLowerCase().includes(
            blockSearch.toLowerCase()
          ))
      );
    });

    window.L.geoJSON(
      {
        type: "FeatureCollection",
        features: filteredRoadLines
      },
      {
        style: {
          color: "#e53935",
          weight: 2.8,
          opacity: 0.95
        },

        onEachFeature: (feature, layer) => {
          layer.bindPopup(`
            <div class="roadwatch-popup">
              <b>Jalan: ${esc(
                prop(feature, ["ROAD", "road_code"]) || "-"
              )}</b><br>
              Estate: ${esc(
                prop(feature, ["ESTATE", "estate"]) || "-"
              )}<br>
              Divisi: ${esc(
                prop(feature, ["DIVISION", "division"]) || "-"
              )}<br>
              Blok: ${esc(
                prop(feature, [
                  "BLOCK",
                  "block_code",
                  "BLOK"
                ]) || "-"
              )}<br>
              Tipe: ${esc(
                prop(feature, [
                  "INFRA_TYPE",
                  "infra_type"
                ]) || "-"
              )}<br>
              Panjang: ${esc(
                prop(feature, ["LENGTH", "road_length"]) || "-"
              )}<br>
              Lebar: ${esc(
                prop(feature, ["WIDTH", "width_m"]) || "-"
              )}
            </div>
          `);
        }
      }
    ).addTo(map);

    // -----------------------------------------------------
    // GARIS REALISASI PEMELIHARAAN
    // Warna hijau + popup berisi foto dokumentasi
    // -----------------------------------------------------
    const filteredRealizations = realizationLines.filter(
      feature => {
        const properties = feature.properties || {};

        const estate = prop(feature, [
          "estate",
          "ESTATE",
          "estate_name"
        ]);

        const division = prop(feature, [
          "division",
          "DIVISION",
          "division_name"
        ]);

        const block = prop(feature, [
          "block_code",
          "BLOCK",
          "BLOK"
        ]);

        const matchesSearch =
          !blockSearch ||
          block.toLowerCase().includes(
            blockSearch.toLowerCase()
          );

        const matchesBlockFilter =
          !blockSearch ||
          filteredBlocks.some(
            blockFeature =>
              prop(blockFeature, ["BLOK", "block_code"]) === block
          );

        const matchesEstate =
          !estateFilter || !estate || estate === estateFilter;

        const matchesDivision =
          !divisionFilter ||
          !division ||
          division === divisionFilter;

        // Realisasi yang memiliki kode blok akan mengikuti filter blok.
        // Jika data realisasi tidak memiliki kode blok yang cocok,
        // pencarian blok tetap tidak menampilkan garis yang tidak relevan.
        const hasBlockFilter = Boolean(
          amaFilter || estateFilter || divisionFilter || blockSearch
        );

        const matchesSelectedBlocks =
          !hasBlockFilter ||
          filteredBlocks.some(
            blockFeature =>
              prop(blockFeature, ["BLOK", "block_code"]) === block
          );

        // Filter kategori jalan tidak diterapkan pada garis realisasi,
        // karena data realisasi adalah jalur aktual, bukan layer jalan sumber.
        return (
          matchesSearch &&
          matchesEstate &&
          matchesDivision &&
          matchesBlockFilter &&
          matchesSelectedBlocks
        );
      }
    );

    window.L.geoJSON(
      {
        type: "FeatureCollection",
        features: filteredRealizations
      },
      {
        style: {
          color: "#16a34a",
          weight: 5,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round"
        },

        onEachFeature: (feature, layer) => {
          bindRealizationPopup(feature, layer);
        }
      }
    ).addTo(map);

    
    // -----------------------------------------------------
    // TITIK RENCANA PEMELIHARAAN
    // Marker kuning berdasarkan koordinat GPS tersimpan
    // -----------------------------------------------------
    const filteredPlans = maintenancePlans.filter((plan) => {
      const block = String(plan.block_code || "").trim();
      const matchesSearch =
        !blockSearch ||
        block.toLowerCase().includes(blockSearch.toLowerCase());

      const matchesCategory =
        !infraTypeFilter ||
        plan.road_category ===
          (infraTypeFilter === "MR" ? "main_road" : "collection_road");

      const matchesEstate =
        !estateFilter ||
        !plan.estate ||
        plan.estate === estateFilter;

      const matchesDivision =
        !divisionFilter ||
        !plan.division ||
        String(plan.division) === divisionFilter;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesEstate &&
        matchesDivision
      );
    });

    const planMarkers = filteredPlans.filter((plan) => {
      const lat = Number(plan.gps_lat);
      const lng = Number(plan.gps_lng);

      return (
        plan.gps_lat != null &&
        plan.gps_lng != null &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      );
    });

    window.L.layerGroup(
      planMarkers.map((plan) => {
        const lat = Number(plan.gps_lat);
        const lng = Number(plan.gps_lng);

        const marker = window.L.circleMarker([lat, lng], {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: "#16a34a",
          fillOpacity: 1
        });

        const category =
          plan.road_category === "main_road"
            ? "Main Road"
            : plan.road_category === "collection_road"
              ? "Collection Road"
              : "Belum ditentukan";

        const date = plan.input_date
          ? String(plan.input_date).slice(0, 10)
          : "-";

        marker.bindPopup(`
          <div class="roadwatch-popup">
            <b>Titik Rencana Pemeliharaan</b><br>
            Blok: ${esc(plan.block_code || "-")}<br>
            Kategori: ${esc(category)}<br>
            e-CERA: ${esc(plan.ecera_number || "-")}<br>
            Tanggal: ${esc(date)}<br>
            Panjang rencana: ${formatNumber(plan.road_length_m)} m<br>
            Biaya rencana: Rp ${formatRupiah(plan.cost)}<br>
            Keterangan: ${esc(plan.description || "-")}
          </div>
        `);

        return marker;
      })
    ).addTo(map);


    // -----------------------------------------------------
    // TITIK KERUSAKAN JALAN
    // -----------------------------------------------------
    const relevantBlocks = blocks.filter(
      feature =>
        (!amaFilter || amaOf(feature) === amaFilter) &&
        (!estateFilter || estateOf(feature) === estateFilter) &&
        (!divisionFilter ||
          divisionOf(feature) === divisionFilter)
    );

    const filteredDamages = damages.filter(feature => {
      const status = prop(feature, [
        "road_status",
        "Ket",
        "status"
      ]);

      const coordinates = feature.geometry?.coordinates;

      const matchesArea =
        (!amaFilter && !estateFilter && !divisionFilter) ||
        (coordinates &&
          relevantBlocks.some(block =>
            isPointInGeometry(
              coordinates,
              block.geometry
            )
          ));

      return (
        (!statusFilter || status === statusFilter) &&
        matchesArea
      );
    });

    window.L.geoJSON(
      {
        type: "FeatureCollection",
        features: filteredDamages
      },
      {
        pointToLayer: (feature, latlng) => {
          const status = prop(feature, [
            "road_status",
            "Ket",
            "status"
          ]).toLowerCase();

          const passable =
            status.includes("bisa dilewati") &&
            !status.includes("tidak bisa dilewati");

          return window.L.circleMarker(latlng, {
            radius: 7,
            color: "#ffffff",
            weight: 2,
            fillColor: passable ? "#ff8c00" : "#e53935",
            fillOpacity: 1
          });
        },

        onEachFeature: (feature, layer) => {
          const status =
            prop(feature, [
              "road_status",
              "Ket",
              "status"
            ]) || "Status tidak tersedia";

          const passable =
            status.toLowerCase().includes("bisa dilewati") &&
            !status.toLowerCase().includes(
              "tidak bisa dilewati"
            );

          const color = passable ? "#ff8c00" : "#e53935";

          layer.bindPopup(`
            <div class="roadwatch-popup">
              <b>Titik Kerusakan Jalan</b><br>
              <span style="color:${color};font-weight:700">
                ● ${esc(status)}
              </span>
            </div>
          `);
        }
      }
    ).addTo(map);

    // -----------------------------------------------------
    // ZOOM OTOMATIS BERDASARKAN FILTER
    // -----------------------------------------------------
    const hasActiveFilter = Boolean(
      amaFilter ||
      estateFilter ||
      divisionFilter ||
      statusFilter ||
      blockSearch
    );

    if (hasActiveFilter) {
      let zoomLayers = [];
      let targetMaxZoom = 15;

      if (blockSearch.trim() && filteredBlocks.length) {
        const query = blockSearch.trim().toLowerCase();

        const exactBlocks = filteredBlocks.filter(
          feature =>
            prop(feature, ["BLOK", "block_code"])
              .toLowerCase() === query
        );

        const targets = exactBlocks.length
          ? exactBlocks
          : filteredBlocks;

        zoomLayers = [
          window.L.geoJSON({
            type: "FeatureCollection",
            features: targets
          })
        ];

        targetMaxZoom = targets.length === 1 ? 18 : 17;
      } else if (statusFilter && filteredDamages.length) {
        zoomLayers = [
          window.L.geoJSON({
            type: "FeatureCollection",
            features: filteredDamages
          })
        ];

        targetMaxZoom = 17;
      } else if (divisionFilter && filteredBlocks.length) {
        zoomLayers = [
          window.L.geoJSON({
            type: "FeatureCollection",
            features: filteredBlocks
          })
        ];

        targetMaxZoom = 16;
      } else if (estateFilter && filteredBlocks.length) {
        zoomLayers = [
          window.L.geoJSON({
            type: "FeatureCollection",
            features: filteredBlocks
          })
        ];

        targetMaxZoom = 15;
      } else if (amaFilter && filteredBlocks.length) {
        zoomLayers = [
          window.L.geoJSON({
            type: "FeatureCollection",
            features: filteredBlocks
          })
        ];

        targetMaxZoom = 14;
      } else if (filteredDamages.length) {
        zoomLayers = [
          window.L.geoJSON({
            type: "FeatureCollection",
            features: filteredDamages
          })
        ];

        targetMaxZoom = 16;
      }

      if (zoomLayers.length) {
        const bounds = window.L.featureGroup(
          zoomLayers
        ).getBounds();

        if (bounds.isValid()) {
          const southwest = bounds.getSouthWest();
          const northeast = bounds.getNorthEast();

          const tinyBounds =
            Math.abs(northeast.lat - southwest.lat) < 0.002 &&
            Math.abs(northeast.lng - southwest.lng) < 0.002;

          const singleBlockSearch =
            Boolean(blockSearch.trim()) &&
            zoomLayers[0].getLayers().length === 1;

          if (singleBlockSearch || tinyBounds) {
            map.fitBounds(bounds, {
              padding: [12, 12],
              maxZoom: targetMaxZoom,
              animate: true
            });

            map.once("moveend", () => {
              if (map.getZoom() < targetMaxZoom) {
                map.setZoom(targetMaxZoom, {
                  animate: true
                });
              }
            });
          } else {
            map.fitBounds(bounds, {
              padding: [24, 24],
              maxZoom: targetMaxZoom,
              animate: true
            });

            map.once("moveend", () => {
              if (map.getZoom() < targetMaxZoom - 2) {
                map.setZoom(
                  Math.min(targetMaxZoom - 1, map.getZoom() + 2),
                  { animate: true }
                );
              }
            });
          }
        }
      }
    }

    const onResize = () => map.invalidateSize();

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      map.remove();
    };
  }, [
    blocks,
    amas,
    damages,
    roadLines,
    realizationLines,
    maintenancePlans,
    amaFilter,
    estateFilter,
    divisionFilter,
    statusFilter,
    infraTypeFilter,
    blockSearch,
    mapStyle,
    onOpenPlan
  ]);

  // =====================================================
  // TAMPILAN HALAMAN
  // =====================================================
  return (
    <div className="road-map-page-wrap">
      <div className="page-heading">
        <div>
          <h1>Peta Jalan</h1>
          <p>
            Batas blok, lokasi AMA, titik kerusakan jalan,
            dan realisasi pemeliharaan
          </p>
        </div>
      </div>

      {error && (
        <div className="notice">
          <span>ⓘ</span>
          {error}
        </div>
      )}

      <div className="road-map-toolbar">
        <label>
          AMA
          <select
            value={amaFilter}
            onChange={event => {
              setAmaFilter(event.target.value);
              setEstateFilter("");
              setDivisionFilter("");
            }}
          >
            <option value="">Semua AMA</option>
            {amaOptions.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          Estate
          <select
            value={estateFilter}
            onChange={event => {
              setEstateFilter(event.target.value);
              setDivisionFilter("");
            }}
          >
            <option value="">Semua Estate</option>
            {estateOptions.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          Divisi
          <select
            value={divisionFilter}
            onChange={event =>
              setDivisionFilter(event.target.value)
            }
          >
            <option value="">Semua Divisi</option>
            {divisionOptions.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status Kerusakan
          <select
            value={statusFilter}
            onChange={event =>
              setStatusFilter(event.target.value)
            }
          >
            <option value="">Semua Status</option>
            {statusOptions.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

       

        <label className="block-search-label">
          Cari Blok
          <input
            value={blockSearch}
            onChange={event =>
              setBlockSearch(event.target.value)
            }
            placeholder="Masukkan kode blok..."
          />
        </label>

        <button
          type="button"
          className="text-button"
          onClick={() => {
            setAmaFilter("");
            setEstateFilter("");
            setDivisionFilter("");
            setStatusFilter("");
            
            setBlockSearch("");
          }}
        >
          Reset Filter
        </button>
      </div>

      {blockSearch.trim() &&
        (() => {
          const query = blockSearch.trim().toLowerCase();

          const matches = blocks.filter(feature =>
            prop(feature, ["BLOK", "block_code"])
              .toLowerCase()
              .includes(query)
          );

          const exact = matches.find(
            feature =>
              prop(feature, ["BLOK", "block_code"])
                .toLowerCase() === query
          );

          const target =
            exact || (matches.length === 1 ? matches[0] : null);

          if (!target) {
            return (
              <div className="plan-search-hint">
                {matches.length
                  ? `${matches.length} blok cocok. Perjelas kode blok untuk membuat rencana.`
                  : "Blok tidak ditemukan."}
              </div>
            );
          }

          const properties = target.properties || {};
          const code = prop(target, ["BLOK", "block_code"]);

          return (
            <div className="plan-search-result">
              <div>
                <b>Blok {code}</b>
                <span>
                  {estateOf(target)} · {divisionOf(target)} ·{" "}
                  {amaOf(target)}
                </span>
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  if (!infraTypeFilter) {
                    alert("Pilih Kategori Jalan terlebih dahulu.");
                    return;
                  }
                
                  if (typeof onOpenPlan === "function") {
                    onOpenPlan({
                      code,
                      ama: amaOf(target),
                      estate: estateOf(target),
                      division: divisionOf(target),
                      area: properties.HA ?? properties.area_ha,
                      geometry: target.geometry,
                      road_category:
                        infraTypeFilter === "MR"
                          ? "main_road"
                          : "collection_road"
                    });
                  }
                }}
              >
                Buat Rencana Pemeliharaan
              </button>
            </div>
          );
        })()}

      <div className="road-map-shell">
        <div className="map-style-switch">
          <button
            type="button"
            className={mapStyle === "satellite" ? "active" : ""}
            onClick={() => setMapStyle("satellite")}
          >
            Satelit
          </button>

          <button
            type="button"
            className={mapStyle === "basic" ? "active" : ""}
            onClick={() => setMapStyle("basic")}
          >
            Peta Dasar
          </button>

          <button
            type="button"
            className={mapStyle === "osm" ? "active" : ""}
            onClick={() => setMapStyle("osm")}
          >
            OpenStreetMap
          </button>
        </div>

        <div
          id="road-map-page"
          className="road-map-canvas"
        />

        <div className="road-map-legend">
          <span>
            <i style={{ background: "#00bfae" }} />
            Batas Blok
          </span>

          <span>
            <i style={{ background: "#ff9800" }} />
            AMA
          </span>

          <span>
            <i style={{ background: "#e53935" }} />
            Titik Kerusakan
          </span>

          <span>
            <i style={{ background: "#00e676" }} />
            Realisasi Pemeliharaan
          </span>

          
        </div>
      </div>
    </div>
  );
}

export default RoadMapPage;
