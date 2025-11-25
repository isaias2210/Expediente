// ===========================================
//  IFARHU - Plataforma Expedientes (server)
//  Opción 1: servidor nuevo, limpio, modular
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
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secreto-ifarhu",
    resave: false,
    saveUninitialized: false,
  })
);

// Archivos estáticos (frontend)
app.use(express.static(path.join(__dirname, "public")));

// -------------------------
//  Google Sheets
// -------------------------
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

if (!SPREADSHEET_ID) {
  console.error("❌ Falta GOOGLE_SPREADSHEET_ID en .env");
}

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

// =========================
// Helpers: Sheets
// =========================

// Obtiene metadata del documento (pestañas)
async function getSpreadsheetMeta() {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  return res.data;
}

// ====================================================
//   VERSION FIJA — NO CREA HOJA SI YA EXISTE NUNCA
// ====================================================
async function ensureSheetWithHeaders(title, headers) {
  const meta = await getSpreadsheetMeta();

  // Normalizar nombres para evitar errores
  const existing = meta.sheets.map(s =>
    (s.properties.title || "").trim().toLowerCase()
  );

  const titleNormalized = title.trim().toLowerCase();

  // Si ya existe, NO la crees nunca
  if (existing.includes(titleNormalized)) {
    // ESCRIBIR ENCABEZADOS SOLO SI LA HOJA EXISTE PERO ESTÁ VACÍA
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1:${String.fromCharCode(64 + headers.length)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] }
    });
    return;
  }

  // Crear hoja porque NO existe
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        addSheet: {
          properties: { title }
        }
      }]
    }
  });

  // Escribir encabezados
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A1:${String.fromCharCode(64 + headers.length)}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] }
  });
}

async function ensureUsuariosSheet() {
  await ensureSheetWithHeaders("usuarios", [
    "usuario", "password", "escuelas", "rol"
  ]);
}

// Hoja de logs
async function ensureLogsSheet() {
  await ensureSheetWithHeaders("logs", [
    "Fecha",
    "Hora",
    "Usuario",
    "Acción",
    "Observación",
  ]);
}

// Hoja de escuela (una por escuela)
async function ensureEscuelaSheet(nombreEscuela) {
  await ensureSheetWithHeaders(nombreEscuela, [
    "fecha",
    "estudiante",
    "cedula",
    "documento_entregado",
    "nota",
    "telefono",
    "observacion",
    "subido_por",
  ]);
}
// =========================
//  Logs de sistema
// =========================
async function registrarLog(usuario, accion, observacion = "") {
  await ensureLogsSheet();

  const ahora = new Date();
  const fecha = ahora.toISOString().slice(0, 10); // YYYY-MM-DD
  const hora = ahora.toTimeString().slice(0, 8); // HH:MM:SS

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "logs!A2:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[fecha, hora, usuario || "", accion, observacion]],
    },
  });
}

// =========================
//  Usuarios (Google Sheets)
// =========================
async function getUsers() {
  await ensureUsuariosSheet();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "usuarios!A2:D",
  });

  const rows = res.data.values || [];
  return rows.map((r) => ({
    usuario: r[0],
    password: r[1],
    escuelas: r[2] || "",
    rol: r[3] || "user",
  }));
}

async function findUser(username) {
  const users = await getUsers();
  return users.find((u) => u.usuario === username) || null;
}

// =========================
//  Escuelas (nombres de hojas)
// =========================
async function getAllEscuelas() {
  const meta = await getSpreadsheetMeta();
  const nombres = meta.sheets.map((s) => s.properties.title);

  // Excluir hojas especiales
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
    return res.status(403).json({ error: "Solo administradores" });
  }
  next();
}

// =========================
//  Login / Logout / Me
// =========================
app.post("/api/login", async (req, res) => {
  const { usuario, password } = req.body;

  try {
    const user = await findUser(usuario);

    if (!user || user.password !== password) {
      return res
        .status(401)
        .json({ error: "Usuario o contraseña incorrectos" });
    }

    let escuelasArray = [];

    if (user.rol === "admin") {
      escuelasArray = await getAllEscuelas();
    } else if (user.escuelas) {
      escuelasArray = user.escuelas
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
    }

    req.session.user = {
      usuario: user.usuario,
      rol: user.rol,
      escuelas: escuelasArray,
    };

    await registrarLog(user.usuario, "Inicio de sesión");

    res.json(req.session.user);
  } catch (err) {
    console.error("❌ Error en login:", err);
    res.status(500).json({ error: "Error interno de login" });
  }
});


app.post("/api/logout", (req, res) => {
  const usuario = req.session.user?.usuario || "";
  req.session.destroy(async () => {
    if (usuario) {
      await registrarLog(usuario, "Cierre de sesión");
    }
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "No autenticado" });
  }
  res.json(req.session.user);
});

// Opcional: lista de escuelas (especialmente útil para admin)
app.get("/api/escuelas", requireLogin, async (req, res) => {
  try {
    if (req.session.user.rol === "admin") {
      const escuelas = await getAllEscuelas();
      return res.json(escuelas);
    } else {
      // Usuario normal → solo las suyas
      return res.json(req.session.user.escuelas || []);
    }
  } catch (err) {
    console.error("❌ Error obteniendo escuelas:", err);
    res.status(500).json({ error: "Error interno" });
  }
});
// =========================
//  Registros por escuela
// =========================
async function getRegistrosByEscuela(escuela) {
  await ensureEscuelaSheet(escuela);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${escuela}!A2:H`,
  });

  const rows = res.data.values || [];

  return rows.map((r, idx) => ({
    fila: idx + 2,
    fecha: r[0] || "",
    estudiante: r[1] || "",
    cedula: r[2] || "",
    documento_entregado: r[3] || "",
    nota: r[4] || "",
    telefono: r[5] || "",
    observacion: r[6] || "",
    subido_por: r[7] || "",
  }));
}

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
    return res.status(403).json({ error: "No tiene permiso para esta escuela" });
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
//  POST /api/registros
// -------------------------
app.post("/api/registros", requireLogin, async (req, res) => {
  const {
    escuela,
    estudiante,
    cedula,
    telefono,
    documento_entregado,
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
      nota || "",
      telefono || "",
      observacion || "",
      user.usuario,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:H`,
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

// Lista de usuarios
app.get("/api/admin/usuarios", requireAdmin, async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (err) {
    console.error("❌ Error listando usuarios:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// Crear usuario nuevo
app.post("/api/admin/usuarios", requireAdmin, async (req, res) => {
  const { usuario, password, escuelas, rol } = req.body;

  if (!usuario || !password) {
    return res
      .status(400)
      .json({ error: "Usuario y contraseña son obligatorios" });
  }

  try {
    await ensureUsuariosSheet();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "usuarios!A2:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[usuario, password, escuelas || "", rol || "user"]],
      },
    });

    await registrarLog(
      req.session.user.usuario,
      "Crear usuario",
      `Usuario: ${usuario}, Rol: ${rol}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error creando usuario:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// Actualizar usuario (escuelas / rol)
app.post("/api/admin/usuarios/update", requireAdmin, async (req, res) => {
  const { usuario, escuelas, rol } = req.body;

  if (!usuario) {
    return res.status(400).json({ error: "Debe indicar un usuario" });
  }

  try {
    await ensureUsuariosSheet();

    const resUsers = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "usuarios!A2:D",
    });

    const rows = resUsers.data.values || [];
    let rowIndex = -1;

    rows.forEach((r, idx) => {
      if (r[0] === usuario) rowIndex = idx + 2; // +2 por encabezado
    });

    if (rowIndex === -1) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const pass = rows[rowIndex - 2][1] || "";
    const escuelasStr = (escuelas || []).join(",");
    const rolFinal = rol || rows[rowIndex - 2][3] || "user";

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `usuarios!A${rowIndex}:D${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[usuario, pass, escuelasStr, rolFinal]],
      },
    });

    await registrarLog(
      req.session.user.usuario,
      "Editar usuario",
      `Usuario: ${usuario}, Escuelas: ${escuelasStr}, Rol: ${rolFinal}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error actualizando usuario:", err);
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
//  Frontend
// =========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/app", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.html"));
});

// Manejo de errores genérico
app.use((err, req, res, next) => {
  console.error("🔥 Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// =========================
//  Arrancar servidor
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("========================================");
  console.log(" IFARHU Plataforma corriendo en puerto", PORT);
  console.log("========================================");
});
