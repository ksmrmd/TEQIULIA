/* ════════════════════════════════════════════════
   AquaMonitor — script.js
   Sistem Monitoring Level Air IoT
   ════════════════════════════════════════════════ */

// ════════════════════════════════════════════════
//  KONFIGURASI
// ════════════════════════════════════════════════
const USERS = {
  admin: "admin1234",
  operator: "monitor123",
};

const NODEMCU_IP = "10.113.214.150"; // Ganti dengan IP NodeMCU Anda
const UPDATE_INTERVAL_MS = 3000; // Interval update: 3 detik
const MAX_READINGS = 5000; // Maksimum data di memori
const HISTORY_TABLE_ROWS = 50; // Baris tabel riwayat yang ditampilkan

// ════════════════════════════════════════════════
//  STATE GLOBAL
// ════════════════════════════════════════════════
let allReadings = [];
let updateInterval = null;
let chartInst = null;
let currentRange = "1h";
let bootTime = Date.now() - Math.random() * 3600000;

// ════════════════════════════════════════════════
//  AUTH — LOGIN & LOGOUT
// ════════════════════════════════════════════════
function doLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const errEl = document.getElementById("login-error");

  if (USERS[username] && USERS[username] === password) {
    errEl.style.display = "none";
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app").style.display = "block";
    startDashboard();
  } else {
    errEl.style.display = "block";
  }
}

function doLogout() {
  clearInterval(updateInterval);
  updateInterval = null;
  document.getElementById("app").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("password").value = "";
}

// Enter key pada halaman login
document.addEventListener("keydown", function (e) {
  const loginVisible =
    document.getElementById("login-screen").style.display !== "none";
  if (e.key === "Enter" && loginVisible) doLogin();
});

// ════════════════════════════════════════════════
//  DATA ENGINE — GENERATOR SIMULASI
//  Ganti fungsi ini dengan fetch ke NodeMCU nyata
// ════════════════════════════════════════════════

/**
 * Generate data historis awal (simulasi 300 titik data ~50 menit)
 */
function genInitialData() {
  const now = Date.now();
  let level = 45 + Math.random() * 20;

  for (let i = 300; i >= 0; i--) {
    const ts = now - i * 10000;
    level += (Math.random() - 0.48) * 3;
    level = Math.max(5, Math.min(95, level));

    const adc = Math.round((level / 100) * 1023);
    const volt = parseFloat(((adc / 1023) * 3.3).toFixed(3));
    allReadings.push({ ts, level: parseFloat(level.toFixed(1)), adc, volt });
  }
}

/**
 * Buat satu pembacaan sensor baru (simulasi)
 * Untuk NodeMCU nyata: ganti dengan fetchFromNodeMCU()
 */
function getNewReading() {
  const last = allReadings[allReadings.length - 1];
  let level = last.level + (Math.random() - 0.48) * 2.5;
  level = Math.max(3, Math.min(97, level));

  const ts = Date.now();
  const adc = Math.round((level / 100) * 1023);
  const volt = parseFloat(((adc / 1023) * 3.3).toFixed(3));
  return { ts, level: parseFloat(level.toFixed(1)), adc, volt };
}

/**
 * Ambil data dari NodeMCU nyata via HTTP
 * Uncomment dan gunakan ini untuk koneksi nyata:
 *
 * async function fetchFromNodeMCU() {
 *   try {
 *     const res  = await fetch(`http://${NODEMCU_IP}/data`);
 *     const json = await res.json();
 *     return {
 *       ts:    Date.now(),
 *       level: json.level_pct,
 *       adc:   json.adc_raw,
 *       volt:  json.voltage_v
 *     };
 *   } catch (e) {
 *     console.warn('NodeMCU tidak dapat dijangkau:', e);
 *     return null;
 *   }
 * }
 */

// ════════════════════════════════════════════════
//  CHART — GRAFIK TREN LEVEL AIR
// ════════════════════════════════════════════════
function initChart() {
  const ctx = document.getElementById("levelChart").getContext("2d");
  chartInst = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Level Air (%)",
          data: [],
          borderColor: "#388bfd",
          backgroundColor: "rgba(56,139,253,0.08)",
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: "Batas Kritis (80%)",
          data: [],
          borderColor: "#e3b341",
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#6e7681", maxTicksLimit: 8, font: { size: 11 } },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: {
            color: "#6e7681",
            callback: function (v) {
              return v + "%";
            },
            font: { size: 11 },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (c) {
              return c.dataset.label + ": " + c.parsed.y.toFixed(1) + "%";
            },
          },
        },
      },
    },
  });
}

/**
 * Filter data sesuai rentang waktu yang dipilih
 */
function getFilteredData() {
  const now = Date.now();
  const ranges = {
    "1h": 3600000,
    "6h": 21600000,
    "24h": 86400000,
    all: Infinity,
  };
  const cutoff = now - (ranges[currentRange] || 3600000);
  return allReadings.filter(function (r) {
    return r.ts >= cutoff;
  });
}

/**
 * Perbarui chart dengan data terbaru
 */
function updateChart() {
  const data = getFilteredData();
  if (!data.length) return;

  chartInst.data.labels = data.map(function (r) {
    const d = new Date(r.ts);
    return (
      d.getHours().toString().padStart(2, "0") +
      ":" +
      d.getMinutes().toString().padStart(2, "0") +
      ":" +
      d.getSeconds().toString().padStart(2, "0")
    );
  });

  chartInst.data.datasets[0].data = data.map(function (r) {
    return r.level;
  });
  chartInst.data.datasets[1].data = data.map(function () {
    return 80;
  });
  chartInst.update("none");

  // Mini stats di atas chart
  const vals = data.map(function (r) {
    return r.level;
  });
  const avg =
    vals.reduce(function (a, b) {
      return a + b;
    }, 0) / vals.length;
  const mx = Math.max(...vals);
  const mn = Math.min(...vals);

  document.getElementById("mc-avg").textContent = avg.toFixed(1) + "%";
  document.getElementById("mc-max").textContent = mx.toFixed(1) + "%";
  document.getElementById("mc-min").textContent = mn.toFixed(1) + "%";
}

// ════════════════════════════════════════════════
//  GAUGE — TANGKI ANIMASI SVG
// ════════════════════════════════════════════════
function updateGauge(level) {
  const pct = Math.max(0, Math.min(100, level));
  const waterH = (pct / 100) * 148; // Tinggi tangki = 148px (y: 21–169)
  const waterY = 169 - waterH;

  // Update SVG elements
  document.getElementById("water-fill").setAttribute("y", waterY);
  document.getElementById("water-fill").setAttribute("height", waterH);
  document.getElementById("ripple").setAttribute("cy", waterY);
  document.getElementById("gauge-center-pct").textContent =
    pct.toFixed(0) + "%";
  document.getElementById("gauge-pct-big").textContent = pct.toFixed(1) + "%";
  document.getElementById("gauge-time").textContent =
    new Date().toLocaleTimeString("id-ID");

  // Tentukan warna dan label berdasarkan level
  let color, label;
  if (pct >= 80) {
    color = "#f85149";
    label = "⚠ KRITIS — Level Terlalu Tinggi";
  } else if (pct >= 60) {
    color = "#e3b341";
    label = "⚡ TINGGI — Pantau Terus";
  } else if (pct >= 20) {
    color = "#388bfd";
    label = "✓ NORMAL — Level Aman";
  } else {
    color = "#f85149";
    label = "⚠ RENDAH — Level Terlalu Rendah";
  }

  const isNormal = pct >= 20 && pct < 80;
  document
    .getElementById("water-fill")
    .setAttribute("fill", isNormal ? "url(#gWater)" : color);
  document.getElementById("gauge-center-pct").setAttribute("fill", color);
  document.getElementById("gauge-status-lbl").textContent = label;
  document.getElementById("gauge-status-lbl").style.color = color;
}

// ════════════════════════════════════════════════
//  ALERT BAR — NOTIFIKASI STATUS
// ════════════════════════════════════════════════
function updateAlert(level) {
  const bar = document.getElementById("alert-bar");
  const txt = document.getElementById("alert-text");

  bar.className = "";

  if (level >= 80) {
    bar.className = "danger";
    txt.textContent = `🚨 BAHAYA: Level air mencapai ${level.toFixed(1)}% — Segera lakukan tindakan! Periksa sistem pengairan.`;
  } else if (level >= 60) {
    bar.className = "warning";
    txt.textContent = `⚠ PERINGATAN: Level air ${level.toFixed(1)}% — Level mulai tinggi. Pantau secara berkala.`;
  } else if (level < 20) {
    bar.className = "danger";
    txt.textContent = `🚨 BAHAYA: Level air terlalu rendah (${level.toFixed(1)}%) — Periksa sumber air!`;
  } else {
    bar.className = "ok";
    txt.textContent = `✓ Status Normal: Level air ${level.toFixed(1)}% — Sistem berjalan baik.`;
  }
}

// ════════════════════════════════════════════════
//  STAT CARDS — RINGKASAN STATISTIK
// ════════════════════════════════════════════════
function updateStats() {
  const data = allReadings;
  if (!data.length) return;

  const last = data[data.length - 1];
  const vals = data.map(function (r) {
    return r.level;
  });
  const avg =
    vals.reduce(function (a, b) {
      return a + b;
    }, 0) / vals.length;
  const maxR = data.reduce(function (a, b) {
    return b.level > a.level ? b : a;
  });
  const minR = data.reduce(function (a, b) {
    return b.level < a.level ? b : a;
  });

  document.getElementById("s-level").innerHTML =
    last.level.toFixed(1) + '<span class="stat-unit">%</span>';
  document.getElementById("s-level-sub").textContent =
    "ADC: " + last.adc + " | " + last.volt + " V";

  document.getElementById("s-avg").innerHTML =
    avg.toFixed(1) + '<span class="stat-unit">%</span>';

  document.getElementById("s-max").innerHTML =
    maxR.level.toFixed(1) + '<span class="stat-unit">%</span>';
  document.getElementById("s-max-time").textContent = new Date(
    maxR.ts,
  ).toLocaleTimeString("id-ID");

  document.getElementById("s-min").innerHTML =
    minR.level.toFixed(1) + '<span class="stat-unit">%</span>';
  document.getElementById("s-min-time").textContent = new Date(
    minR.ts,
  ).toLocaleTimeString("id-ID");

  document.getElementById("s-count").textContent = data.length;

  document.getElementById("s-uptime").innerHTML =
    Math.round((Date.now() - bootTime) / 1000) +
    '<span class="stat-unit">s</span>';
}

// ════════════════════════════════════════════════
//  HISTORY TABLE — TABEL RIWAYAT
// ════════════════════════════════════════════════
function updateTable() {
  const tbody = document.getElementById("history-body");
  const data = [...allReadings].reverse().slice(0, HISTORY_TABLE_ROWS);

  document.getElementById("history-count").textContent =
    allReadings.length + " data tersimpan";

  tbody.innerHTML = data
    .map(function (r, i) {
      let badge, status;
      if (r.level >= 80) {
        badge = "badge-danger";
        status = "KRITIS TINGGI";
      } else if (r.level >= 60) {
        badge = "badge-warn";
        status = "PERINGATAN";
      } else if (r.level < 20) {
        badge = "badge-danger";
        status = "KRITIS RENDAH";
      } else {
        badge = "badge-ok";
        status = "NORMAL";
      }

      return `<tr>
      <td style="color:var(--text3)">${allReadings.length - i}</td>
      <td>${new Date(r.ts).toLocaleString("id-ID")}</td>
      <td style="color:var(--blue-light);font-weight:600">${r.level.toFixed(1)}</td>
      <td>${r.adc}</td>
      <td>${r.volt}</td>
      <td><span class="status-badge ${badge}">${status}</span></td>
    </tr>`;
    })
    .join("");
}

// ════════════════════════════════════════════════
//  CSV DOWNLOAD — UNDUH DATASET
// ════════════════════════════════════════════════
function downloadCSV() {
  const header = "No,Timestamp,Level_Persen,ADC_Value,Tegangan_V,Status";

  const rows = allReadings.map(function (r, i) {
    let s;
    if (r.level >= 80) s = "KRITIS_TINGGI";
    else if (r.level >= 60) s = "PERINGATAN_TINGGI";
    else if (r.level < 20) s = "KRITIS_RENDAH";
    else s = "NORMAL";

    return [
      i + 1,
      new Date(r.ts).toISOString(),
      r.level.toFixed(2),
      r.adc,
      r.volt,
      s,
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const filename =
    "aquamonitor_dataset_" +
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") +
    ".csv";

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════
//  RANGE SELECTOR — FILTER RENTANG WAKTU
// ════════════════════════════════════════════════
function setRange(btn, range) {
  currentRange = range;

  document.querySelectorAll(".tb-btn").forEach(function (b) {
    b.classList.remove("active");
  });
  btn.classList.add("active");

  const labels = {
    "1h": "1 jam terakhir",
    "6h": "6 jam terakhir",
    "24h": "24 jam terakhir",
    all: "Semua data",
  };
  document.getElementById("chart-range-label").textContent = labels[range];
  updateChart();
}

// ════════════════════════════════════════════════
//  TICK — SIKLUS UPDATE UTAMA (setiap 3 detik)
// ════════════════════════════════════════════════
async function tick() {
  try {
    const res = await fetch("http://192.168.100.79/data"); // ganti IP NodeMCU Anda
    const json = await res.json();
    const reading = {
      ts: Date.now(),
      level: json.level_pct,
      adc: json.adc_raw,
      volt: json.voltage_v,
    };

    allReadings.push(reading);
    if (allReadings.length > MAX_READINGS) allReadings.shift();

    updateGauge(reading.level);
    updateAlert(reading.level);
    updateChart();
    updateStats();
    updateTable();
  } catch (e) {
    console.warn("NodeMCU tidak terhubung:", e);
  }
}
// ════════════════════════════════════════════════
//  START — INISIALISASI DASHBOARD
// ════════════════════════════════════════════════
function startDashboard() {
  allReadings = [];
  genInitialData();
  initChart();
  tick();
  updateInterval = setInterval(tick, UPDATE_INTERVAL_MS);
}
