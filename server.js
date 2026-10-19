const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3001);

// =====================================================
// MIDDLEWARE
// =====================================================
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// DATABASE
// =====================================================
const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "roadwatch",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// =====================================================
// HELPER
// =====================================================
function parseGeometry(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function apiError(res, label, err) {
  console.error(`[API ERROR] ${label}:`, err);
  return res.status(500).json({
    error: label,
    detail: err.message
  });
}

function featureCollection(rows, propertyMapper) {
  return {
    type: "FeatureCollection",
    features: rows
      .map((row) => {
        const geometry = parseGeometry(row.geometry);
        if (!geometry) return null;

        return {
          type: "Feature",
          id: row.id,
          geometry,
          properties: propertyMapper(row)
        };
      })
      .filter(Boolean)
  };
}

// =====================================================
// HEALTH CHECK
// =====================================================
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      message: "RoadWatch API dan database terhubung"
    });
  } catch (err) {
    apiError(res, "Database belum terhubung", err);
  }
});

// =====================================================
// PETA JALAN: BATAS BLOK
// =====================================================
app.get("/api/blocks", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id, source_id, ba_initial, block_code, block_status,
        area_ha, unit_code, ba_text, ama, ba_code,
        description, pyear, division_no, commodity,
        ST_AsGeoJSON(geom) AS geometry
      FROM blocks
      WHERE geom IS NOT NULL
      ORDER BY block_code
    `);

    res.json(featureCollection(rows, (row) => ({
      ID: row.source_id ?? row.id,
      BAInitial: row.ba_initial,
      BLOK: row.block_code,
      block_code: row.block_code,
      STATUS: row.block_status,
      block_status: row.block_status,
      HA: row.area_ha,
      area_ha: row.area_ha,
      Unit: row.unit_code,
      BAText: row.ba_text,
      estate: row.ba_text,
      AMA: row.ama,
      ama: row.ama,
      ama_name: row.ama,
      BACode: row.ba_code,
      KET: row.description,
      PYEAR: row.pyear,
      DIVISI: row.division_no,
      division: row.division_no,
      Division: row.division_no,
      Comodity: row.commodity
    })));
  } catch (err) {
    apiError(res, "Gagal mengambil batas blok", err);
  }
});

// =====================================================
// PETA JALAN: TITIK AMA
// =====================================================
app.get("/api/ama-points", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        ama_name,
        ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry
      FROM ama_points
      WHERE geom IS NOT NULL
        AND ama_name IS NOT NULL
        AND TRIM(ama_name) <> ''
      ORDER BY ama_name, id
    `);

    res.json(featureCollection(rows, (row) => ({
      AMA: row.ama_name,
      ama: row.ama_name,
      ama_name: row.ama_name,
      id: row.id
    })));
  } catch (err) {
    apiError(res, "Gagal mengambil titik AMA", err);
  }
});

// =====================================================
// PETA JALAN: TITIK KERUSAKAN
// =====================================================
app.get("/api/road-damage-points", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, road_status, ST_AsGeoJSON(geom) AS geometry
      FROM road_bbe
      WHERE geom IS NOT NULL
      ORDER BY id
    `);

    const features = rows.map((row) => {
      const geometry = parseGeometry(row.geometry);
      if (!geometry) return null;

      return {
        type: "Feature",
        id: row.id,
        geometry,
        properties: {
          id: row.id,
          road_status: row.road_status,
          Ket: row.road_status,
          status: row.road_status
        }
      };
    }).filter(Boolean);

    res.json({
      type: "FeatureCollection",
      features,
      summary: {
        total: features.length,
        tidak_bisa_dilewati: features.filter((f) =>
          String(f.properties.road_status || "")
            .toLowerCase()
            .includes("tidak bisa dilewati")
        ).length,
        bisa_dilewati: features.filter((f) => {
          const status = String(
            f.properties.road_status || ""
          ).toLowerCase();

          return status.includes("bisa dilewati") &&
            !status.includes("tidak bisa dilewati");
        }).length
      }
    });
  } catch (err) {
    apiError(res, "Gagal mengambil titik kerusakan jalan dari road_bbe", err);
  }
});

// =====================================================
// PETA JALAN: GARIS JALAN
// =====================================================
app.get("/api/road-lines", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id, road_code, road_name, estate, division, block_name,
        maintenance_type, status, length_m,
        ST_AsGeoJSON(geom) AS geometry
      FROM roads
      WHERE geom IS NOT NULL
      ORDER BY id DESC
      LIMIT 50000
    `);

    res.json(featureCollection(rows, (row) => ({
      id: row.id,
      ROAD: row.road_code,
      road_code: row.road_code,
      road_name: row.road_name,
      ROAD_NAME: row.road_name,
      ESTATE: row.estate,
      estate: row.estate,
      DIVISION: row.division,
      division: row.division,
      BLOCK: row.block_name,
      block_code: row.block_name,
      INFRA_TYPE: row.maintenance_type,
      infra_type: row.maintenance_type,
      STATUS: row.status,
      LENGTH: row.length_m,
      road_length: row.length_m
    })));
  } catch (err) {
    apiError(res, "Gagal mengambil garis jalan", err);
  }
});

// =====================================================
// DASHBOARD SUMMARY
// =====================================================
app.get("/api/dashboard/summary", async (_req, res) => {
  try {
    const [[summary]] = await pool.query(`
      SELECT
        COUNT(*) AS total_roads,
        COALESCE(SUM(length_m), 0) AS total_length_m,
        SUM(CASE WHEN status = 'Rencana' THEN 1 ELSE 0 END) AS planned_count,
        SUM(CASE WHEN status = 'Realisasi' THEN 1 ELSE 0 END) AS actual_count,
        COALESCE(SUM(CASE WHEN status = 'Rencana' THEN length_m ELSE 0 END), 0) AS planned_length_m,
        COALESCE(SUM(CASE WHEN status = 'Realisasi' THEN length_m ELSE 0 END), 0) AS actual_length_m
      FROM roads
    `);

    const [[photos]] = await pool.query(`
      SELECT COUNT(*) AS photo_count FROM road_photos
    `);

    const total =
      Number(summary.planned_count || 0) +
      Number(summary.actual_count || 0);

    res.json({
      ...summary,
      total_roads: Number(summary.total_roads || 0),
      total_length_m: Number(summary.total_length_m || 0),
      planned_count: Number(summary.planned_count || 0),
      actual_count: Number(summary.actual_count || 0),
      total_length_km: Number(summary.total_length_m || 0) / 1000,
      planned_length_km: Number(summary.planned_length_m || 0) / 1000,
      actual_length_km: Number(summary.actual_length_m || 0) / 1000,
      realization_pct: total
        ? Number(summary.actual_count || 0) / total * 100
        : 0,
      photo_count: Number(photos.photo_count || 0)
    });
  } catch (err) {
    apiError(res, "Gagal mengambil dashboard summary", err);
  }
});

// =====================================================
// DATA JALAN
// =====================================================
app.get("/api/roads", async (req, res) => {
  try {
    const status = req.query.status;
    const params = [];

    let sql = `
      SELECT
        id, road_code, road_name, estate, division, block_name,
        maintenance_type, status, length_m, planned_date,
        actual_date, notes, ST_AsGeoJSON(geom) AS geometry
      FROM roads
    `;

    if (status && ["Rencana", "Realisasi"].includes(status)) {
      sql += " WHERE status = ?";
      params.push(status);
    }

    sql += " ORDER BY id DESC LIMIT 10000";

    const [rows] = await pool.query(sql, params);

    res.json(rows.map((row) => ({
      ...row,
      geometry: parseGeometry(row.geometry)
    })));
  } catch (err) {
    apiError(res, "Gagal mengambil data jalan", err);
  }
});

// =====================================================
// IMPORT GEOJSON JALAN
// =====================================================
app.post("/api/import/geojson", async (req, res) => {
  const geojson = req.body;

  if (
    !geojson ||
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features)
  ) {
    return res.status(400).json({
      error: "Kirim GeoJSON FeatureCollection hasil ekspor QGIS."
    });
  }

  let conn;
  let inserted = 0;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    for (const feature of geojson.features) {
      if (!feature || !feature.geometry) continue;

      const props = feature.properties || {};
      const geometryText = JSON.stringify(feature.geometry);

      const pick = (...keys) => {
        for (const key of keys) {
          if (
            props[key] !== undefined &&
            props[key] !== null &&
            props[key] !== ""
          ) return props[key];
        }
        return null;
      };

      const statusRaw = String(
        pick("status", "Status", "STATUS") || "Rencana"
      ).toLowerCase();

      const status = [
        "realisasi", "actual", "selesai", "terealisasi"
      ].includes(statusRaw) ? "Realisasi" : "Rencana";

      const lengthValue = Number(
        pick("length_m", "panjang_m", "Panjang_m", "length", "Shape_Length") || 0
      );

      const lengthM = Number.isFinite(lengthValue) ? lengthValue : 0;

      await conn.query(`
        INSERT INTO roads (
          road_code, road_name, estate, division, block_name,
          maintenance_type, status, length_m, planned_date,
          actual_date, notes, geom
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromGeoJSON(?, 1, 4326))
      `, [
        String(
          pick("road_code", "kode_jalan", "ID_JALAN", "id") ||
          `IMP-${Date.now()}-${inserted + 1}`
        ).slice(0, 100),
        pick("road_name", "nama_jalan", "Nama_Jalan", "name"),
        pick("estate", "estate_name", "Estate", "kebun"),
        pick("division", "divisi", "Division"),
        pick("block_name", "blok", "Block", "block"),
        pick("maintenance_type", "jenis_pemeliharaan", "Jenis", "jenis") ||
          "Belum ditentukan",
        status,
        lengthM,
        pick("planned_date", "tanggal_rencana") || null,
        pick("actual_date", "tanggal_realisasi") || null,
        pick("notes", "keterangan") || null,
        geometryText
      ]);

      inserted++;
    }

    await conn.commit();

    res.json({
      ok: true,
      inserted,
      message: `Berhasil mengimpor ${inserted} fitur jalan.`
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    apiError(res, "Import GeoJSON jalan gagal", err);
  } finally {
    if (conn) conn.release();
  }
});

// =====================================================
// IMPORT GEOJSON BLOK
// =====================================================
app.post("/api/import/blocks", async (req, res) => {
  const geojson = req.body;

  if (
    !geojson ||
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features)
  ) {
    return res.status(400).json({
      error: "File harus berupa GeoJSON FeatureCollection."
    });
  }

  let conn;
  let imported = 0;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    for (const feature of geojson.features) {
      if (!feature || !feature.geometry) continue;

      const props = feature.properties || {};
      const geometry = feature.geometry;

      if (!["Polygon", "MultiPolygon"].includes(geometry.type)) {
        throw new Error(
          `Geometri tidak didukung pada fitur ke-${imported + 1}: ${geometry.type}`
        );
      }

      const multiPolygon = {
        type: "MultiPolygon",
        coordinates: geometry.type === "Polygon"
          ? [geometry.coordinates]
          : geometry.coordinates
      };

      await conn.execute(`
        INSERT INTO blocks (
          source_id, ba_initial, block_code, block_status, area_ha,
          unit_code, ba_text, ama, ba_code, description, pyear,
          division_no, commodity, geom
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromGeoJSON(?, 1, 4326))
      `, [
        props.ID ?? null,
        props.BAInitial ?? null,
        props.BLOK ?? null,
        props.STATUS ?? null,
        props.HA ?? null,
        props.Unit ?? null,
        props.BAText ?? null,
        props.AMA ?? null,
        props.BACode ?? null,
        props.KET ?? null,
        props.PYEAR ?? null,
        props.DIVISI ?? null,
        props.Comodity ?? null,
        JSON.stringify(multiPolygon)
      ]);

      imported++;
    }

    await conn.commit();

    res.json({
      ok: true,
      imported,
      message: `Berhasil mengimpor ${imported} polygon blok.`
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    apiError(res, "Import blok gagal", err);
  } finally {
    if (conn) conn.release();
  }
});

// =====================================================
// FOTO JALAN
// =====================================================
app.post("/api/roads/:id/photos", async (req, res) => {
  const { photo_url, caption, taken_at } = req.body || {};

  if (!photo_url) {
    return res.status(400).json({
      error: "photo_url wajib diisi."
    });
  }

  try {
    const [result] = await pool.query(`
      INSERT INTO road_photos (road_id, photo_url, caption, taken_at)
      VALUES (?, ?, ?, ?)
    `, [
      req.params.id,
      photo_url,
      caption || null,
      taken_at || null
    ]);

    res.status(201).json({
      ok: true,
      id: result.insertId
    });
  } catch (err) {
    apiError(res, "Gagal menyimpan foto jalan", err);
  }
});

app.get("/api/roads/:id/photos", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, road_id, photo_url, caption, taken_at
      FROM road_photos
      WHERE road_id = ?
      ORDER BY id DESC
    `, [req.params.id]);

    res.json(rows);
  } catch (err) {
    apiError(res, "Gagal mengambil foto jalan", err);
  }
});

// =====================================================
// RENCANA PEMELIHARAAN
// =====================================================

// POST: simpan rencana pemeliharaan
app.post("/api/maintenance-plans", async (req, res) => {
  const {
    block_code,
    road_category,
    input_date,
    ecera_number,
    cost,
    road_length_m,
    description,
    photo_name,
    photo_mime,
    photo_data,
    gps_lat,
    gps_lng,
    gps_accuracy_m
  } = req.body || {};

  if (
    !String(block_code || "").trim() ||
    !input_date ||
    !String(ecera_number || "").trim() ||
    cost === undefined || cost === null || cost === "" ||
    road_length_m === undefined || road_length_m === null || road_length_m === ""
  ) {
    return res.status(400).json({
      error: "Data wajib belum lengkap: blok, tanggal, nomor e-CERA, cost, dan panjang jalan harus diisi."
    });
  }

  const allowedCategories = ["main_road", "collection_road"];

if (!allowedCategories.includes(road_category)) {
  return res.status(400).json({
    error: "Kategori jalan wajib dipilih: Main Road atau Collection Road."
  });
}

  const costNumber = Number(cost);
  const lengthNumber = Number(road_length_m);

  if (!Number.isFinite(costNumber) || costNumber < 0) {
    return res.status(400).json({
      error: "Cost harus berupa angka nol atau lebih."
    });
  }

  if (!Number.isFinite(lengthNumber) || lengthNumber <= 0) {
    return res.status(400).json({
      error: "Panjang jalan harus berupa angka lebih dari nol."
    });
  }

  if (photo_data && !String(photo_data).startsWith("data:image/")) {
    return res.status(400).json({
      error: "Format foto tidak valid."
    });
  }

  try {
    const [result] = await pool.query(`
  INSERT INTO maintenance_plans (
    block_code,
    road_category,
    input_date,
    ecera_number,
    cost,
    road_length_m,
    description,
    photo_name,
    photo_mime,
    photo_data,
    gps_lat,
    gps_lng,
    gps_accuracy_m
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [
  String(block_code).trim(),
  road_category,
  input_date,
  String(ecera_number).trim(),
  costNumber,
  lengthNumber,
  description ? String(description).trim() : null,
  photo_name || null,
  photo_mime || null,
  photo_data || null,
  gps_lat === undefined || gps_lat === null || gps_lat === ""
    ? null : Number(gps_lat),
  gps_lng === undefined || gps_lng === null || gps_lng === ""
    ? null : Number(gps_lng),
  gps_accuracy_m === undefined || gps_accuracy_m === null || gps_accuracy_m === ""
    ? null : Number(gps_accuracy_m)
]);

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "Rencana pemeliharaan berhasil disimpan."
    });
  } catch (err) {
    console.error("POST /api/maintenance-plans error:", err);
    return res.status(500).json({
      error: "Gagal menyimpan rencana pemeliharaan.",
      detail: err.message
    });
  }
});

// GET: ambil rencana dan informasi realisasinya
app.get("/api/maintenance-plans", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        p.id,
        p.block_code,
        p.road_category,
        p.input_date,
        p.ecera_number,
        p.cost,
        p.road_length_m,
        p.description,
        p.gps_lat,
        p.gps_lng,
        p.created_at,
        r.id AS realization_id,
        r.actual_date,
        r.actual_length_m,
        r.actual_cost,
        r.description AS realization_description
      FROM maintenance_plans p
      LEFT JOIN maintenance_realizations r
        ON r.plan_id = p.id
      ORDER BY p.created_at DESC, p.id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET maintenance-plans error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// AOP COST
// =====================================================
app.get("/api/aop-cost", async (req, res) => {
  const period = String(req.query.period || "2025");

  if (!["2025", "Ytd Sep 2026"].includes(period)) {
    return res.status(400).json({
      error: "Periode tidak valid."
    });
  }

  try {
    const [rows] = await pool.query(`
      SELECT
        TRIM(block_code) AS block_code,
        MAX(ama) AS ama,
        MAX(estate) AS estate,
        MAX(division_no) AS division_no,
        activity_type,
        activity_desc,
        SUM(cost_act) AS cost_act,
        SUM(aop_cost) AS aop_cost
      FROM aop_cost_data
      WHERE period_key = ?
        AND (
          UPPER(TRIM(activity_desc)) = 'UPKEEP MAIN ROAD'
          OR UPPER(TRIM(activity_desc)) LIKE 'UPKEEP COLLECTION%'
        )
      GROUP BY TRIM(block_code), activity_type, activity_desc
      ORDER BY block_code, activity_desc
    `, [period]);

    const data = rows.map((row) => {
      const actual = row.cost_act == null ? null : Number(row.cost_act);
      const budget = row.aop_cost == null ? null : Number(row.aop_cost);

      const complete =
        actual !== null && budget !== null && budget > 0;

      const ratio = complete ? actual / budget * 100 : null;
      const overrun = complete ? Math.max(0, actual - budget) : null;

      let status = "incomplete";
      if (complete) {
        if (ratio > 100) status = "overbudget";
        else if (ratio >= 80) status = "warning";
        else status = "within";
      }

      return {
        block_code: String(row.block_code || "").trim(),
        ama: row.ama,
        estate: row.estate,
        division_no: row.division_no,
        activity_type: row.activity_type,
        activity_desc: row.activity_desc,
        activity_types: row.activity_type,
        activity_descs: row.activity_desc,
        cost_act: actual,
        aop_cost: budget,
        utilization_pct: ratio,
        overrun_amount: overrun,
        alert_status: status
      };
    });

    const total = (key) =>
      data.reduce((sum, row) => sum + (row[key] ?? 0), 0);

    res.json({
      period,
      rows: data,
      summary: {
        activity_row_count: data.length,
        block_count: new Set(data.map((row) => row.block_code)).size,
        alert_count: data.filter((row) => row.alert_status === "overbudget").length,
        warning_count: data.filter((row) => row.alert_status === "warning").length,
        within_count: data.filter((row) => row.alert_status === "within").length,
        incomplete_count: data.filter((row) => row.alert_status === "incomplete").length,
        total_actual: total("cost_act"),
        total_budget: total("aop_cost"),
        total_overrun: total("overrun_amount")
      }
    });
  } catch (err) {
    apiError(res, "Gagal mengambil AOP Cost", err);
  }
});

// =====================================================
// ERROR HANDLER UNTUK JSON
// =====================================================
app.use((err, _req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      error: "Payload terlalu besar.",
      detail: "Gunakan file lebih kecil atau impor bertahap."
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      error: "JSON tidak valid."
    });
  }

  return next(err);
});

// =====================================================
// REALISASI PEMELIHARAAN
// =====================================================
app.post("/api/maintenance-realizations", async (req, res) => {
  const {
    plan_id,
    actual_date,
    actual_length_m,
    actual_cost,
    description,
    photos,
    geometry_json
  } = req.body || {};

  if (
    !plan_id ||
    !actual_date ||
    !Number.isFinite(Number(actual_length_m)) ||
    Number(actual_length_m) <= 0 ||
    !Number.isFinite(Number(actual_cost)) ||
    Number(actual_cost) < 0 ||
    !Array.isArray(photos) ||
    photos.length === 0
  ) {
    return res.status(400).json({
      error: "Data realisasi belum lengkap atau tidak valid."
    });
  }

  for (const photo of photos) {
    if (
      !photo.photo_name ||
      !photo.photo_mime ||
      !String(photo.photo_mime).startsWith("image/") ||
      !String(photo.photo_data).startsWith("data:image/")
    ) {
      return res.status(400).json({
        error: "Ada foto yang tidak valid."
      });
    }
  }

  const geometryText = geometry_json == null
    ? null
    : typeof geometry_json === "string"
      ? geometry_json
      : JSON.stringify(geometry_json);

  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [plans] = await conn.query(
      "SELECT id FROM maintenance_plans WHERE id = ? FOR UPDATE",
      [plan_id]
    );

    if (!plans.length) {
      await conn.rollback();
      return res.status(404).json({
        error: "Rencana pemeliharaan tidak ditemukan."
      });
    }

    const [existing] = await conn.query(
      "SELECT id FROM maintenance_realizations WHERE plan_id = ?",
      [plan_id]
    );

    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({
        error: "Rencana ini sudah memiliki realisasi."
      });
    }

    const [result] = await conn.query(`
      INSERT INTO maintenance_realizations (
        plan_id, actual_date, actual_length_m, actual_cost,
        description, geometry_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      plan_id,
      actual_date,
      Number(actual_length_m),
      Number(actual_cost),
      description || null,
      geometryText
    ]);

    for (const photo of photos) {
      await conn.query(`
        INSERT INTO maintenance_realization_photos (
          realization_id, photo_name, photo_mime, photo_data
        )
        VALUES (?, ?, ?, ?)
      `, [
        result.insertId,
        photo.photo_name,
        photo.photo_mime,
        photo.photo_data
      ]);
    }

    await conn.commit();

    res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "Realisasi dan foto berhasil disimpan."
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }

    console.error("POST maintenance-realizations error:", err);
    res.status(500).json({
      error: "Gagal menyimpan realisasi.",
      detail: err.message
    });
  } finally {
    if (conn) conn.release();
  }
});

// =====================================================
// GARIS REALISASI PEMELIHARAAN
// =====================================================
app.get("/api/maintenance-realization-lines", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
  SELECT
    r.id AS realization_id,
    r.plan_id,
    r.actual_date,
    r.actual_length_m,
    r.actual_cost,
    r.description AS realization_description,
    r.geometry_json,
    p.block_code,
    p.road_category,
    p.ecera_number,
    p.input_date
  FROM maintenance_realizations r
  INNER JOIN maintenance_plans p
    ON p.id = r.plan_id
  WHERE r.geometry_json IS NOT NULL
    AND r.geometry_json <> ''
  ORDER BY r.id DESC
`);

    const features = [];

    for (const row of rows) {
      let geometry = parseGeometry(row.geometry_json);

      if (geometry?.type === "Feature") {
        geometry = geometry.geometry;
      }

      if (
        !geometry ||
        !["LineString", "MultiLineString"].includes(geometry.type)
      ) {
        continue;
      }

      features.push({
        type: "Feature",
        id: row.realization_id,
        geometry,
        properties: {
          realization_id: row.realization_id,
          plan_id: row.plan_id,
          block_code: row.block_code,

          ecera_number: row.ecera_number,
          road_category: row.road_category,
          actual_date: row.actual_date,
          actual_length_m: Number(row.actual_length_m || 0),
          actual_cost: Number(row.actual_cost || 0),
          description: row.realization_description || ""
        }
      });
    }

    res.json({
      type: "FeatureCollection",
      features
    });
  } catch (err) {
    apiError(res, "Gagal mengambil garis realisasi pemeliharaan", err);
  }
});

// =====================================================
// GET FOTO DOKUMENTASI REALISASI
// =====================================================
app.get("/api/maintenance-realizations/:id/photos", async (req, res) => {
  try {
    const realizationId = Number(req.params.id);

    if (!Number.isInteger(realizationId) || realizationId <= 0) {
      return res.status(400).json({
        error: "ID realisasi tidak valid."
      });
    }

    const [rows] = await pool.query(
      `SELECT
         id,
         realization_id,
         photo_name,
         photo_mime,
         photo_data
       FROM maintenance_realization_photos
       WHERE realization_id = ?
       ORDER BY id ASC`,
      [realizationId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET foto realisasi error:", err);
    res.status(500).json({
      error: "Gagal mengambil foto realisasi.",
      detail: err.message
    });
  }
});


/* =====================================================
   API FOTO DOKUMENTASI
   GET /api/maintenance-photos?block_code=95214242
   ===================================================== */

   

/* =====================================================
   FOTO DOKUMENTASI PEMELIHARAAN
   GET /api/maintenance-photos
   Query:
   - block_code = pencarian kode blok
   - ama        = filter AMA
   - estate     = filter Estate
   Overview tanpa filter: maksimal 5 foto terbaru
   ===================================================== */

   app.get("/api/maintenance-photos", async (req, res) => {
    try {
      const blockCode = String(req.query.block_code || "").trim();
      const ama = String(req.query.ama || "").trim();
      const estate = String(req.query.estate || "").trim();
  
      // Overview tanpa filter menampilkan maksimal 5 foto.
      // Jika ada filter/pencarian, tampilkan maksimal 100 foto.
      const hasFilter = Boolean(blockCode || ama || estate);
      const limit = hasFilter ? 100 : 5;
  
      // Data AMA dan Estate diambil dari tabel blocks.
      // GROUP BY mencegah foto berulang jika kode blok duplikat.
      const blockMetadataSql = `
        SELECT
          TRIM(block_code) AS block_code,
          MAX(NULLIF(TRIM(ama), '')) AS ama,
          MAX(NULLIF(TRIM(ba_text), '')) AS estate
        FROM blocks
        WHERE block_code IS NOT NULL
          AND TRIM(block_code) <> ''
        GROUP BY TRIM(block_code)
      `;
  
      // Ambil foto realisasi beserta informasi AMA dan Estate.
      const sql = `
        SELECT
          ph.id AS photo_id,
          ph.photo_name,
          ph.photo_mime,
          ph.photo_data,
  
          r.id AS realization_id,
          r.plan_id,
          r.actual_date,
          r.actual_length_m,
          r.actual_cost,
          r.description AS realization_description,
  
          p.block_code,
          p.ecera_number,
          p.input_date,
          p.road_length_m,
  
          b.ama,
          b.estate
  
        FROM maintenance_realization_photos ph
  
        INNER JOIN maintenance_realizations r
          ON r.id = ph.realization_id
  
        INNER JOIN maintenance_plans p
          ON p.id = r.plan_id
  
        LEFT JOIN (${blockMetadataSql}) b
          ON b.block_code = TRIM(p.block_code)
  
        WHERE
          (? = '' OR TRIM(p.block_code) LIKE CONCAT('%', ?, '%'))
          AND (? = '' OR COALESCE(b.ama, '') = ?)
          AND (? = '' OR COALESCE(b.estate, '') = ?)
  
        ORDER BY
          r.actual_date DESC,
          ph.id DESC
  
        LIMIT ?
      `;
  
      const [rows] = await pool.query(sql, [
        blockCode,
        blockCode,
        ama,
        ama,
        estate,
        estate,
        limit
      ]);
  
      // Daftar pilihan AMA dan Estate hanya dari blok
      // yang memiliki foto realisasi.
      const [filterRows] = await pool.query(`
        SELECT DISTINCT
          b.ama,
          b.estate
        FROM maintenance_realization_photos ph
  
        INNER JOIN maintenance_realizations r
          ON r.id = ph.realization_id
  
        INNER JOIN maintenance_plans p
          ON p.id = r.plan_id
  
        LEFT JOIN (${blockMetadataSql}) b
          ON b.block_code = TRIM(p.block_code)
  
        WHERE b.ama IS NOT NULL
           OR b.estate IS NOT NULL
  
        ORDER BY b.ama, b.estate
      `);
  
      const amas = [
        ...new Set(
          filterRows
            .map((row) => row.ama)
            .filter(Boolean)
        )
      ].sort((a, b) => a.localeCompare(b));
  
      const estates = [
        ...new Set(
          filterRows
            .map((row) => row.estate)
            .filter(Boolean)
        )
      ].sort((a, b) => a.localeCompare(b));
  
      res.set("Cache-Control", "no-store");
  
      return res.json({
        photos: rows,
        total: rows.length,
        overview: !hasFilter,
        filters: {
          amas,
          estates,
          pairs: filterRows
            .filter((row) => row.ama && row.estate)
            .map((row) => ({
              ama: String(row.ama).trim(),
              estate: String(row.estate).trim()
            }))
        }
      });
  
    } catch (err) {
      console.error("GET /api/maintenance-photos error:", err);
  
      return res.status(500).json({
        error: "Gagal mengambil foto dokumentasi.",
        detail: err.message
      });
    }
  });
  

  
// =====================================================
// API 404
// HARUS SEBELUM FRONTEND FALLBACK
// =====================================================
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "Endpoint API tidak ditemukan",
    path: req.originalUrl
  });
});


/* =====================================================
   FOTO DOKUMENTASI PEMELIHARAAN
   GET /api/maintenance-photos?block_code=97110490
   ===================================================== */

  
  

// =====================================================
// FRONTEND FALLBACK
// =====================================================
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
  console.log(`RoadWatch berjalan: http://localhost:${PORT}`);
});