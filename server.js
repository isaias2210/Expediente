// ===========================================
//  IFARHU - Plataforma Expedientes (server)
// ===========================================

require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const bodyParser = require("body-parser");
const { google } = require("googleapis");

const app = express();

// -------------------------
//  Middleware básico
// -------------------------
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secreto-ifarhu",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(express.static(path.join(__dirname, "public")));

// -------------------------
//  Google Sheets
// -------------------------
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);
const sheets = google.sheets({ version: "v4", auth });

// =========================
//  Utilidades Sheets
// =========================
async function getSpreadsheetMeta() {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  return res.data;
}

// ====================================================
//  Crear hoja con encabezados si no existe
//  Si ya existe, SOLO escribe encabezados en fila 1.
// ====================================================
async function ensureSheetWithHeaders(title, headers) {
  const meta = await getSpreadsheetMeta();
  const existing = meta.sheets.map((s) =>
    (s.properties.title || "").trim().toLowerCase()
  );
  const titleNormalized = title.trim().toLowerCase();

  if (existing.includes(titleNormalized)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1:${String.fromCharCode(64 + headers.length)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title,
            },
          },
        },
      ],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A1:${String.fromCharCode(64 + headers.length)}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });
}

// -------------------------
//  Hojas específicas
// -------------------------
async function ensureUsuariosSheet() {
  await ensureSheetWithHeaders("usuarios", [
    "usuario",
    "password",
    "rol",
    "escuelas",
  ]);
}

async function ensureLogsSheet() {
  await ensureSheetWithHeaders("logs", [
    "fecha",
    "hora",
    "usuario",
    "accion",
    "observacion",
  ]);
}

// Hoja por cada escuela (con TRIMESTRE)
async function ensureEscuelaSheet(nombreEscuela) {
  await ensureSheetWithHeaders(nombreEscuela, [
    "fecha",
    "estudiante",
    "cedula",
    "documento_entregado",
    "trimestre",
    "nota",
    "telefono",
    "observacion",
    "subido_por",
  ]);
}

// -------------------------
//  LOGS
// -------------------------
async function registrarLog(usuario, accion, observacion) {
  await ensureLogsSheet();
  const ahora = new Date();
  const fecha = ahora.toISOString().slice(0, 10);
  const hora = ahora.toTimeString().slice(0, 8);

  const row = [fecha, hora, usuario || "desconocido", accion, observacion];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "logs!A2:E",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

// -------------------------
//  Usuarios
// -------------------------
async function getUsers() {
  await ensureUsuariosSheet();

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "usuarios!A2:D",
  });

  const rows = resp.data.values || [];
  return rows.map((r) => ({
    usuario: r[0] || "",
    password: r[1] || "",
    rol: r[2] || "user",
    escuelas: (r[3] || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  }));
}

async function findUser(usuario, password) {
  const users = await getUsers();
  return users.find(
    (u) => u.usuario === usuario && u.password === password
  );
}

// -------------------------
//  Escuelas existentes (todas las hojas menos especiales)
// -------------------------
async function getAllEscuelas() {
  const meta = await getSpreadsheetMeta();
  const nombres = meta.sheets.map((s) => s.properties.title);

  return nombres.filter((t) => {
    const low = t.toLowerCase();
    return low !== "usuarios" && low !== "logs";
  });
}

// =========================
//  Middlewares auth
// =========================
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

// =========================
//  RUTAS
// =========================

// -------------------------
//  GET /api/me
// -------------------------
app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.json(null);
  }
  res.json(req.session.user);
});

// -------------------------
//  POST /login
// -------------------------
app.post("/login", async (req, res) => {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res
      .status(400)
      .json({ error: "Debe indicar usuario y contraseña" });
  }

  try {
    const user = await findUser(usuario, password);
    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    req.session.user = user;
    await registrarLog(user.usuario, "Login", "Inicio de sesión");

    res.json({ ok: true, user });
  } catch (err) {
    console.error("❌ Error en login:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// -------------------------
//  POST /logout
// -------------------------
app.post("/logout", (req, res) => {
  const user = req.session.user;
  if (user) {
    registrarLog(user.usuario, "Logout", "Cierre de sesión").catch(() => {});
  }
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// =========================
//  Registros por escuela
// =========================
async function getRegistrosByEscuela(escuela) {
  await ensureEscuelaSheet(escuela);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${escuela}!A2:I`,
  });

  const rows = res.data.values || [];

  return rows.map((r, idx) => ({
    fila: idx + 2,
    fecha: r[0] || "",
    estudiante: r[1] || "",
    cedula: r[2] || "",
    documento_entregado: r[3] || "",
    trimestre: r[4] || "",
    nota: r[5] || "",
    telefono: r[6] || "",
    observacion: r[7] || "",
    subido_por: r[8] || "",
  }));
}

// -------------------------
//  GET /api/escuelas
// -------------------------
app.get("/api/escuelas", requireLogin, async (req, res) => {
  const user = req.session.user;

  try {
    let escuelas = [];
    if (user.rol === "admin") {
      escuelas = await getAllEscuelas();
    } else {
      escuelas = user.escuelas || [];
    }

    res.json(escuelas);
  } catch (err) {
    console.error("❌ Error obteniendo escuelas:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// -------------------------
//  GET /api/registros?escuela=
// -------------------------
app.get("/api/registros", requireLogin, async (req, res) => {
  const escuela = req.query.escuela;

  if (!escuela) {
    return res.status(400).json({ error: "Debe indicar una escuela" });
  }

  const user = req.session.user;
  const autorizado =
    user.rol === "admin" ||
    (Array.isArray(user.escuelas) && user.escuelas.includes(escuela));

  if (!autorizado) {
    return res
      .status(403)
      .json({ error: "No tiene permiso para ver esta escuela" });
  }

  try {
    const registros = await getRegistrosByEscuela(escuela);
    res.json(registros);
  } catch (err) {
    console.error("❌ Error obteniendo registros:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// -------------------------
//  POST /api/registros  (AGREGAR)
// -------------------------
app.post("/api/registros", requireLogin, async (req, res) => {
  const {
    escuela,
    estudiante,
    cedula,
    telefono,
    documento_entregado,
    trimestre,
    nota,
    observacion,
  } = req.body;

  if (!escuela || !estudiante || !cedula) {
    return res
      .status(400)
      .json({ error: "Escuela, estudiante y cédula son obligatorios" });
  }

  const user = req.session.user;
  const autorizado =
    user.rol === "admin" ||
    (Array.isArray(user.escuelas) && user.escuelas.includes(escuela));

  if (!autorizado) {
    return res
      .status(403)
      .json({ error: "No tiene permiso para registrar en esta escuela" });
  }

  try {
    await ensureEscuelaSheet(escuela);
    const fecha = new Date().toISOString().slice(0, 10);

    const row = [
      fecha,
      estudiante,
      cedula,
      documento_entregado ? "Sí" : "No",
      trimestre || "",
      nota || "",
      telefono || "",
      observacion || "",
      user.usuario,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:I`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    await registrarLog(
      user.usuario,
      "Agregar registro",
      `Escuela: ${escuela}, Estudiante: ${estudiante}, Cédula: ${cedula}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error creando registro:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// -------------------------
//  POST /api/registros/actualizar
// -------------------------
app.post("/api/registros/actualizar", requireLogin, async (req, res) => {
  const {
    escuela,
    fila,
    estudiante,
    cedula,
    telefono,
    documento_entregado,
    trimestre,
    nota,
    observacion,
  } = req.body;

  if (!escuela || !fila) {
    return res
      .status(400)
      .json({ error: "Escuela y fila son obligatorios" });
  }

  const user = req.session.user;
  const autorizado =
    user.rol === "admin" ||
    (Array.isArray(user.escuelas) && user.escuelas.includes(escuela));

  if (!autorizado) {
    return res
      .status(403)
      .json({ error: "No tiene permiso para actualizar en esta escuela" });
  }

  try {
    await ensureEscuelaSheet(escuela);
    const fecha = new Date().toISOString().slice(0, 10);

    const row = [
      fecha,
      estudiante || "",
      cedula || "",
      documento_entregado ? "Sí" : "No",
      trimestre || "",
      nota || "",
      telefono || "",
      observacion || "",
      user.usuario,
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A${fila}:I${fila}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    await registrarLog(
      user.usuario,
      "Actualizar registro",
      `Escuela: ${escuela}, Cédula: ${cedula}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error actualizando registro:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// -------------------------
//  GET /api/buscar?cedula=
// -------------------------
app.get("/api/buscar", requireLogin, async (req, res) => {
  const cedula = (req.query.cedula || "").trim();
  const user = req.session.user;

  if (!cedula) {
    return res.status(400).json({ error: "Debe ingresar una cédula" });
  }

  try {
    let escuelasBuscar = [];

    if (user.rol === "admin") {
      escuelasBuscar = await getAllEscuelas();
    } else {
      escuelasBuscar = user.escuelas || [];
    }

    const resultados = [];

    for (const esc of escuelasBuscar) {
      const registros = await getRegistrosByEscuela(esc);
      registros
        .filter((r) => r.cedula === cedula)
        .forEach((r) => resultados.push({ escuela: esc, ...r }));
    }

    res.json(resultados);
  } catch (err) {
    console.error("❌ Error en búsqueda:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// =========================
//  ADMIN: usuarios
// =========================
app.get("/api/admin/usuarios", requireAdmin, async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (err) {
    console.error("❌ Error obteniendo usuarios:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

app.post("/api/admin/usuarios", requireAdmin, async (req, res) => {
  const { usuario, password, rol, escuelas } = req.body;

  if (!usuario || !password) {
    return res
      .status(400)
      .json({ error: "Usuario y contraseña son obligatorios" });
  }

  try {
    await ensureUsuariosSheet();
    const lista = await getUsers();
    if (lista.find((u) => u.usuario === usuario)) {
      return res.status(400).json({ error: "Ese usuario ya existe" });
    }

    const row = [
      usuario,
      password,
      rol || "user",
      (escuelas || []).join(","),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "usuarios!A2:D",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    await registrarLog(
      req.session.user.usuario,
      "Crear usuario",
      `Usuario creado: ${usuario}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error creando usuario:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// editar usuario (sobrescribe fila encontrada por usuario)
app.put("/api/admin/usuarios", requireAdmin, async (req, res) => {
  const { usuario, password, rol, escuelas } = req.body;

  if (!usuario) {
    return res.status(400).json({ error: "Debe indicar el usuario" });
  }

  try {
    await ensureUsuariosSheet();

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "usuarios!A2:D",
    });
    const rows = resp.data.values || [];

    let foundIndex = -1;
    rows.forEach((r, idx) => {
      if ((r[0] || "") === usuario) foundIndex = idx;
    });

    if (foundIndex === -1) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const fila = foundIndex + 2;
    const row = [
      usuario,
      password || rows[foundIndex][1],
      rol || rows[foundIndex][2],
      (escuelas && escuelas.length
        ? escuelas.join(",")
        : rows[foundIndex][3]),
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `usuarios!A${fila}:D${fila}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    await registrarLog(
      req.session.user.usuario,
      "Editar usuario",
      `Usuario editado: ${usuario}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error editando usuario:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// =========================
//  ADMIN: logs
// =========================
app.get("/api/admin/logs", requireAdmin, async (req, res) => {
  try {
    await ensureLogsSheet();

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "logs!A2:E",
    });

    const rows = resp.data.values || [];
    const logs = rows.map((r) => ({
      fecha: r[0] || "",
      hora: r[1] || "",
      usuario: r[2] || "",
      accion: r[3] || "",
      observacion: r[4] || "",
    }));

    res.json(logs);
  } catch (err) {
    console.error("❌ Error obteniendo logs:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// =========================
//  ADMIN: resumen general
// =========================
app.get("/api/admin/resumen", requireAdmin, async (req, res) => {
  try {
    const escuelas = await getAllEscuelas();
    const resumen = [];

    for (const esc of escuelas) {
      const registros = await getRegistrosByEscuela(esc);
      const total = registros.length;

      const primer = registros.filter((r) =>
        (r.trimestre || "").toLowerCase().includes("primer")
      ).length;
      const segundo = registros.filter((r) =>
        (r.trimestre || "").toLowerCase().includes("segundo")
      ).length;
      const tercero = registros.filter((r) =>
        (r.trimestre || "").toLowerCase().includes("tercer")
      ).length;

      const conDocumento = registros.filter(
        (r) => (r.documento_entregado || "").toLowerCase() === "sí"
      ).length;
      const sinDocumento = registros.filter(
        (r) => (r.documento_entregado || "").toLowerCase() === "no"
      ).length;

      resumen.push({
        escuela: esc,
        total,
        primer,
        segundo,
        tercero,
        conDocumento,
        sinDocumento,
      });
    }

    res.json(resumen);
  } catch (err) {
    console.error("❌ Error obteniendo resumen:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// =========================
//  Frontend
// =========================
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html"))
);
app.get("/app", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "app.html"))
);

// =========================
//  Arranque
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor IFARHU escuchando en puerto", PORT);
});
