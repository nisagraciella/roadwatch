# RoadWatch Baru — React + Node.js + Laragon MariaDB/MySQL (tanpa Vite)

## Isi project
- React dibundle dengan esbuild (bukan Vite)
- UI corporate bergaya dashboard monitoring perkebunan, dengan KPI, peta, filter, grafik, foto, dan tabel
- Express melayani frontend dan API melalui satu port
- MariaDB/MySQL menyimpan data jalan dan foto
- Leaflet menampilkan garis jalan: kuning = Rencana, hijau = Realisasi
- Endpoint impor GeoJSON untuk memasukkan fitur garis jalan

## A. Persiapan
1. Ekstrak ZIP ke `C:\laragon\www\roadwatch-baru`.
2. Buka Laragon dan klik **Start All** (pastikan MySQL/MariaDB aktif).
3. Buka Terminal Laragon, jalankan:

```bat
cd C:\laragon\www\roadwatch-baru
npm install
```

## B. Buat database
Dari Terminal Laragon, jalankan:

```bat
mysql -u root < database\schema.sql
```

Jika root memakai password:

```bat
mysql -u root -p < database\schema.sql
```

Jika perintah `mysql` tidak dikenal, buka terminal Laragon (bukan Command Prompt biasa). Periksa nama database dibuat sebagai `roadwatch`.

## C. Build dan jalankan
Di terminal yang sama:

```bat
npm run build
npm start
```

Buka **http://localhost:3001**. Biarkan terminal tetap berjalan.
Tes koneksi DB: http://localhost:3001/api/health

## D. Import SHP
Database MariaDB tidak otomatis membaca satu file `.shp`. Cara paling mudah tanpa memasang tool tambahan:
1. Buka SHP di QGIS. Pastikan layer jalan punya geometri garis.
2. Klik kanan layer jalan → **Export → Save Features As…**
3. Format pilih **GeoJSON**; nama file misalnya `roads.geojson`.
4. Pastikan CRS output adalah **EPSG:4326 - WGS 84** (longitude/latitude).
5. Untuk impor, gunakan endpoint `POST /api/import/geojson` dengan isi file GeoJSON sebagai body JSON. Untuk file besar, jangan kirim puluhan/ratusan MB sekaligus; lebih aman impor bertahap atau gunakan metode impor GIS khusus.

Contoh PowerShell setelah menyimpan `roads.geojson` di folder project:

```powershell
$geo = Get-Content .\roads.geojson -Raw
Invoke-RestMethod -Uri http://localhost:3001/api/import/geojson -Method Post -ContentType "application/json" -Body $geo
```

Catatan:
- Import endpoint membaca beberapa nama atribut umum seperti `road_name`, `nama_jalan`, `estate`, `division`/`divisi`, `block_name`, `blok`, `maintenance_type`, `jenis_pemeliharaan`, `status`, dan `length_m`.
- Jika atribut status tidak dikenali, fitur masuk sebagai **Rencana**.
- Jika atribut panjang tidak ada, panjang tersimpan 0. Sebaiknya hitung panjang dalam meter terlebih dahulu di QGIS atau ArcGIS, lalu beri nama field `length_m`.
- Jika data SHP dalam UTM, jangan sekadar mengubah label CRS; ekspor/reproyeksikan ke EPSG:4326.
- Untuk impor data besar, endpoint JSON bukan metode paling efisien; gunakan loader GIS yang mendukung MariaDB/MySQL atau pecah file menjadi batch.

## E. Menambahkan foto
API contoh: `POST /api/roads/:id/photos` dengan JSON:
```json
{
  "photo_url": "https://alamat-foto/road-001.jpg",
  "caption": "Kondisi jalan setelah pemeliharaan",
  "taken_at": "2026-10-09 10:00:00"
}
```
Saat ini kolom foto menyimpan URL, bukan upload file lokal.

## Troubleshooting
- `Cannot GET /`: jalankan `npm run build` terlebih dahulu dan pastikan folder `public` berisi `app.bundle.js`.
- `EADDRINUSE 3001`: ada proses lain yang memakai port 3001; hentikan proses server lama atau ubah `PORT` di `server.js`.
- Error database: pastikan Laragon MySQL/MariaDB aktif dan `database/schema.sql` sudah dijalankan.
- `npm run dev` tidak perlu dijalankan dari root project lain; jalankan dari folder `roadwatch-baru`.
- Peta membutuhkan internet untuk memuat tile OpenStreetMap dan CDN Leaflet.
