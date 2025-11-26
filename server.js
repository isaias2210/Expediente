// =============================================================
// 🟦 IMPORTS Y CONFIGURACIONES INICIALES
// =============================================================
import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.resolve();
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secreto",
    resave: false,
    saveUninitialized: true,
  })
);

app.use(express.static(path.join(__dirname, "public")));

// =============================================================
// 🟦 GOOGLE AUTH
// =============================================================
const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"],
  null
);

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// =============================================================
// 🟦 FUNCIONES BASE PARA GOOGLE SHEETS
// =============================================================

// Obtener lista de hojas existentes
async function getSheetNames() {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  return res.data.sheets.map((s) => s.properties.title);
}

async function ensureSheetWithHeaders(name, headers) {
  const existentes = await getSheetNames();

  // -------------------------------------------------------------------
  // 🟦 1. Si la hoja NO existe → se crea
  // -------------------------------------------------------------------
  if (!existentes.includes(name)) {
    console.log(`🟦 Creando hoja: ${name}`);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: name }
            }
          }
        ]
      }
    });

    // Insertar headers SOLO CUANDO LA HOJA ES NUEVA
    const lastColumn = String.fromCharCode(65 + headers.length - 1);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${name}!A1:${lastColumn}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [headers]
      }
    });

    return; // 🟢 evita seguir y no se vuelve a sobrescribir nada
  }

  // -------------------------------------------------------------------
  // 🟦 2. Si la hoja YA EXISTE → NO se crea, NO da error
  // -------------------------------------------------------------------
  console.log(`✔ Hoja ${name} existe — no se recrea`);

  // Revisar si los headers ya están
  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${name}!A1:Z1`
  });

  const actuales = headerCheck.data.values?.[0] || [];

  // Si ya están iguales, no hacer nada
  if (actuales.join("|") === headers.join("|")) {
    console.log(`✔ Headers de ${name} ya estaban correctos`);
    return;
  }

  // Si existen pero están mal, corregirlos
  const lastColumn = String.fromCharCode(65 + headers.length - 1);

  console.log(`🟧 Corrigiendo headers de ${name}...`);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${name}!A1:${lastColumn}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] }
  });
}

// =============================================================
// 🟦 ASEGURAR HOJA DE USUARIOS
// =============================================================
async function ensureUsuariosSheet() {
  await ensureSheetWithHeaders("usuarios", [
    "usuario",
    "password",
    "rol",
    "escuelas"
  ]);
}

// =============================================================
// 🟦 ASEGURAR HOJA DE LOGS
// =============================================================
async function ensureLogsSheet() {
  await ensureSheetWithHeaders("logs", [
    "fecha",
    "usuario",
    "accion",
    "detalle",
    "ip"
  ]);
}

// =============================================================
// 🟦 ASEGURAR HOJA DE ESCUELA DINÁMICA
// =============================================================
async function ensureEscuelaSheet(nombre) {
  await ensureSheetWithHeaders(nombre, [
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
  ]);
}

// =============================================================
// 🟦 LOG AUTOMÁTICO
// =============================================================
async function registrarLog(usuario, accion, detalle, req) {
  const fecha = new Date().toLocaleString("es-PA", { timeZone: "America/Panama" });
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "logs!A2:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[fecha, usuario, accion, detalle, ip]]
    }
  });
}
// =============================================================
// 🟦 CARGAR USUARIOS
// =============================================================
async function getUsers() {
  await ensureUsuariosSheet();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "usuarios!A2:D"
  });

  if (!res.data.values) return [];

  return res.data.values.map((row) => ({
    usuario: row[0],
    password: row[1],
    rol: row[2],
    escuelas: row[3] ? row[3].split(",") : []
  }));
}

// =============================================================
// 🟦 BUSCAR USUARIO
// =============================================================
async function findUser(usuario, password) {
  const users = await getUsers();
  return users.find((u) => u.usuario === usuario && u.password === password);
}

// =============================================================
// 🟦 LOGIN
// =============================================================
app.post("/login", async (req, res) => {
  try {
    const { usuario, password } = req.body;

    const user = await findUser(usuario, password);

    if (!user) {
      return res.json({ ok: false, msg: "Usuario o contraseña incorrectos" });
    }

    req.session.user = user;

    res.json({ ok: true, rol: user.rol, escuelas: user.escuelas });

  } catch (err) {
    console.error("❌ Error en login:", err);
    res.json({ ok: false, msg: "Error interno" });
  }
});
// =============================================================
// 🟦 AÑADIR REGISTRO
// =============================================================
app.post("/add", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ ok: false });

    const { escuela, estudiante, cedula, telefono, documento, nota, trimestre, observacion } = req.body;
    const user = req.session.user.usuario;

    await ensureEscuelaSheet(escuela);

    const fecha = new Date().toLocaleDateString("es-PA");

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:J`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[fecha, estudiante, cedula, telefono, documento, nota, trimestre, observacion, user, Date.now()]]
      }
    });

    await registrarLog(user, "Agregar registro", `Escuela: ${escuela}, Estudiante: ${estudiante}`, req);

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ Error ADD:", err);
    res.json({ ok: false });
  }
});

// =============================================================
// 🟦 ACTUALIZAR REGISTRO
// =============================================================
app.post("/update", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ ok: false });

    const { escuela, filaId, estudiante, cedula, telefono, documento, nota, trimestre, observacion } = req.body;

    await ensureEscuelaSheet(escuela);

    const resDatos = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:J`
    });

    const rows = resDatos.data.values || [];

    const idx = rows.findIndex((r) => r[9] == filaId);

    if (idx === -1) return res.json({ ok: false, msg: "No encontrado" });

    rows[idx] = [
      rows[idx][0], // fecha original
      estudiante,
      cedula,
      telefono,
      documento,
      nota,
      trimestre,
      observacion,
      req.session.user.usuario,
      filaId
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:J`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows }
    });

    await registrarLog(req.session.user.usuario, "Actualizar registro", `Fila ${filaId}`, req);

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ Error UPDATE:", err);
    res.json({ ok: false });
  }
});

// =============================================================
// 🟦 ADMIN — LISTA DE ESCUELAS
// =============================================================
app.get("/escuelas", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.rol !== "admin")
      return res.json({ ok: false });

    const sheetsList = await getSheetNames();

    const filtradas = sheetsList.filter(
      (s) => s !== "usuarios" && s !== "logs"
    );

    res.json({ ok: true, escuelas: filtradas });

  } catch (err) {
    console.error("❌ Error escuelas:", err);
    res.json({ ok: false });
  }
});
// =============================================================
// 🟦 LOGOUT
// =============================================================
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

// =============================================================
// 🟦 INICIAR Y VERIFICAR HOJAS
// =============================================================
async function iniciar() {
  console.log("🚀 Verificando hojas principales...");
  await ensureUsuariosSheet();
  await ensureLogsSheet();
}

iniciar().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🟢 Servidor en puerto ${PORT}`));
});
