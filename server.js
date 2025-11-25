// =============================================================
// IFARHU — Plataforma de Expedientes
// Multiusuario + Logs + Trimestres + Actualización de Registros
// Google Sheets Backend — Node.js
// =============================================================

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-ifarhu",
    resave: false,
    saveUninitialized: true,
  })
);

// ============================
// Google Sheets Auth
// ============================

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// =============================================================
// 📌 FUNCIONES BASE — METADATA + CREAR HOJAS
// =============================================================

async function getSpreadsheetMeta() {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  return res.data;
}

// CREA HOJA SI NO EXISTE (ARREGLADO)
async function ensureSheetWithHeaders(title, headers) {
  const meta = await getSpreadsheetMeta();
  const existing = meta.sheets.map((s) => (s.properties.title || "").trim());

  if (existing.includes(title)) {
    // Solo actualizar headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1:${String.fromCharCode(64 + headers.length)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
    return;
  }

  // Crear hoja si no existe
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        { addSheet: { properties: { title } } }
      ],
    },
  });

  // Insertar headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A1:${String.fromCharCode(64 + headers.length)}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });
}
// =============================================================
// 📌 FUNCIONES PARA LOGS
// =============================================================

async function addLog(usuario, accion, observacion = "") {
  await ensureSheetWithHeaders("logs", [
    "fecha",
    "hora",
    "usuario",
    "accion",
    "observacion"
  ]);

  const now = new Date();
  const fecha = now.toISOString().split("T")[0];
  const hora = now.toTimeString().split(" ")[0];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "logs!A2:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[fecha, hora, usuario, accion, observacion]],
    },
  });
}

// =============================================================
// 📌 USUARIOS — Cargar usuarios desde Google Sheets
// =============================================================

async function getUsers() {
  await ensureSheetWithHeaders("usuarios", [
    "usuario", "password", "rol", "escuelas"
  ]);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "usuarios!A2:D",
  });

  const rows = res.data.values || [];

  return rows.map(r => ({
    usuario: r[0],
    password: r[1],
    rol: r[2],
    escuelas: (r[3] || "").split(",").map(e => e.trim()).filter(Boolean)
  }));
}

// =============================================================
// 📌 LOGIN
// =============================================================

app.post("/login", async (req, res) => {
  try {
    const { usuario, password } = req.body;

    const usuarios = await getUsers();
    const encontrado = usuarios.find(
      u => u.usuario === usuario && u.password === password
    );

    if (!encontrado) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    req.session.user = {
      usuario: encontrado.usuario,
      rol: encontrado.rol,
      escuelas: encontrado.escuelas,
    };

    addLog(encontrado.usuario, "Inicio de sesión");

    return res.json({ ok: true });
  } catch (e) {
    console.error("Error en login:", e);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// =============================================================
// 📌 MIDDLEWARE DE AUTENTICACIÓN
// =============================================================

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "No autenticado" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.rol !== "admin") {
    return res.status(403).json({ error: "Solo admin" });
  }
  next();
}

// =============================================================
// 📌 OBTENER USUARIO ACTUAL
// =============================================================

app.get("/api/me", requireLogin, (req, res) => {
  res.json(req.session.user);
});

// =============================================================
// 📌 LOGOUT
// =============================================================

app.post("/api/logout", (req, res) => {
  addLog(req.session.user.usuario, "Cierre de sesión");
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// =============================================================
// 📌 ESCRIBIR REGISTROS — Crear hoja por escuela si no existe
// =============================================================

async function ensureEscuelaSheet(nombreEscuela) {
  await ensureSheetWithHeaders(nombreEscuela, [
    "fecha",
    "estudiante",
    "cedula",
    "telefono",
    "documento_entregado",
    "nota",
    "trimestre",
    "observacion",
    "subido_por",
    "fila_id"
  ]);
}
// =============================================================
// 📌 GUARDAR NUEVO REGISTRO EN LA ESCUELA
// =============================================================

app.post("/api/agregar", requireLogin, async (req, res) => {
  try {
    const {
      escuela,
      estudiante,
      cedula,
      telefono,
      documento,
      nota,
      trimestre,
      observacion
    } = req.body;

    const usuario = req.session.user.usuario;

    // Crear hoja si no existe
    await ensureEscuelaSheet(escuela);

    const fecha = new Date().toISOString().split("T")[0];
    const filaId = Date.now().toString();

    const valores = [
      fecha,
      estudiante,
      cedula,
      telefono,
      documento,
      nota,
      trimestre,
      observacion,
      usuario,
      filaId
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:K`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [valores] }
    });

    addLog(usuario, "Agregar registro", `Escuela: ${escuela}, Estudiante: ${estudiante}, Cédula: ${cedula}`);

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error agregando registro:", err);
    res.status(500).json({ error: "Error agregando registro" });
  }
});

// =============================================================
// 📌 LISTAR REGISTROS DE UNA ESCUELA
// =============================================================

app.get("/api/registros/:escuela", requireLogin, async (req, res) => {
  try {
    const escuela = req.params.escuela;

    await ensureEscuelaSheet(escuela);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:K`
    });

    const filas = result.data.values || [];

    const procesado = filas.map(f => ({
      fecha: f[0] || "",
      estudiante: f[1] || "",
      cedula: f[2] || "",
      telefono: f[3] || "",
      documento: f[4] || "",
      nota: f[5] || "",
      trimestre: f[6] || "",
      observacion: f[7] || "",
      subido_por: f[8] || "",
      filaId: f[9] || ""
    }));

    res.json(procesado);

  } catch (err) {
    console.error("❌ Error obteniendo registros:", err);
    res.status(500).json({ error: "Error obteniendo registros" });
  }
});

// =============================================================
// 📌 BUSCAR POR CÉDULA EN TODAS LAS ESCUELAS
// =============================================================

app.get("/api/buscar/:cedula", requireLogin, async (req, res) => {
  try {
    const cedula = req.params.cedula;

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const hojas = meta.data.sheets.map(s => s.properties.title);

    const resultados = [];

    for (const h of hojas) {
      if (["usuarios", "logs"].includes(h)) continue;

      const datos = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${h}!A2:K`,
      });

      const filas = datos.data.values || [];

      filas.forEach(f => {
        if (f[2] === cedula) {
          resultados.push({
            escuela: h,
            fecha: f[0],
            estudiante: f[1],
            cedula: f[2],
            telefono: f[3],
            documento: f[4],
            nota: f[5],
            trimestre: f[6],
            observacion: f[7],
            subido_por: f[8],
            filaId: f[9]
          });
        }
      });
    }

    res.json(resultados);

  } catch (err) {
    console.error("❌ Error buscando:", err);
    res.status(500).json({ error: "Error buscando registro" });
  }
});

// =============================================================
// 📌 ACTUALIZAR REGISTRO
// =============================================================

app.post("/api/actualizar", requireLogin, async (req, res) => {
  try {
    const {
      escuela,
      filaId,
      estudiante,
      telefono,
      documento,
      nota,
      trimestre,
      observacion
    } = req.body;

    const usuario = req.session.user.usuario;

    const hoja = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:K`,
    });

    const filas = hoja.data.values || [];

    let filaIndex = -1;

    filas.forEach((f, i) => {
      if (f[9] === filaId) filaIndex = i + 2; // +2 porque A1 es header
    });

    if (filaIndex === -1)
      return res.status(404).json({ error: "Registro no encontrado" });

    const valores = [
      filas[filaIndex - 2][0], // fecha original
      estudiante,
      filas[filaIndex - 2][2], // cedula no cambia
      telefono,
      documento,
      nota,
      trimestre,
      observacion,
      usuario,
      filaId
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A${filaIndex}:K${filaIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [valores] },
    });

    addLog(usuario, "Actualizar registro", `Escuela: ${escuela}, filaId: ${filaId}`);

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ Error actualizando:", err);
    res.status(500).json({ error: "Error actualizando registro" });
  }
});

// =============================================================
// 📌 ADMIN — LISTAR USUARIOS
// =============================================================

app.get("/api/admin/usuarios", requireAdmin, async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (err) {
    console.error("❌ Error listando usuarios:", err);
    res.status(500).json({ error: "Error listando usuarios" });
  }
});

// =============================================================
// 📌 ADMIN — CREAR USUARIO
// =============================================================

app.post("/api/admin/crear_usuario", requireAdmin, async (req, res) => {
  try {
    const { usuario, password, rol, escuelas } = req.body;

    await ensureUsuariosSheet();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `usuarios!A2:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[usuario, password, rol, escuelas.join(",")]],
      },
    });

    addLog(req.session.user.usuario, "Crear usuario", usuario);

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ Error creando usuario:", err);
    res.status(500).json({ error: "Error creando usuario" });
  }
});

// =============================================================
// 📌 ADMIN — LISTAR ESCUELAS (todas las hojas)
// =============================================================

app.get("/api/admin/escuelas", requireAdmin, async (req, res) => {
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const nombres = meta.data.sheets
      .map(s => s.properties.title)
      .filter(n => !["usuarios", "logs"].includes(n));

    res.json(nombres);

  } catch (err) {
    console.error("❌ Error listando escuelas:", err);
    res.status(500).json({ error: "Error listando escuelas" });
  }
});
// =============================================================
// 📌 LOGS — GUARDAR EVENTOS
// =============================================================

async function addLog(usuario, accion, detalles) {
  await ensureLogsSheet();

  const fecha = new Date().toISOString().replace("T", " ").split(".")[0];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `logs!A2:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[fecha, usuario, accion, detalles, reqIp()]],
    }
  });
}

function reqIp() {
  return "IFARHU-SISTEMA"; // Si deseas, puedes conectar el real: req.ip
}

// =============================================================
// 📌 CREAR HOJAS AUTOMÁTICAMENTE SI NO EXISTEN
// =============================================================

async function ensureSheetWithHeaders(name, headers) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  });

  const exists = meta.data.sheets.some(s => s.properties.title === name);

  // La hoja existe → solo aseguramos headers
  if (exists) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${name}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] }
    });
    return;
  }

  // NO existe → la creamos
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        { addSheet: { properties: { title: name } } }
      ]
    }
  });

  // Insertar headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${name}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] }
  });
}

async function ensureUsuariosSheet() {
  await ensureSheetWithHeaders("usuarios", ["usuario", "password", "rol", "escuelas"]);
}

async function ensureLogsSheet() {
  await ensureSheetWithHeaders("logs", ["fecha", "usuario", "accion", "detalles", "ip"]);
}

async function ensureEscuelaSheet(nombre) {
  await ensureSheetWithHeaders(
    nombre,
    [
      "fecha",
      "estudiante",
      "cedula",
      "telefono",
      "documento",
      "nota",
      "trimestre",
      "observacion",
      "subido_por",
      "filaId"
    ]
  );
}

// =============================================================
// 📌 MIDDLEWARE DE ERRORES GENERALES
// =============================================================

app.use((err, req, res, next) => {
  console.error("🔥 Error general:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// =============================================================
// 📌 INICIALIZAR SERVIDOR
// =============================================================

async function iniciar() {
  console.log("🚀 Verificando hojas principales...");

  await ensureUsuariosSheet();
  await ensureLogsSheet();

  console.log("✔ Hojas listas.");

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor IFARHU listo en puerto ${PORT}`);
  });
}

iniciar();
