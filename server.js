// ===============================
// IFARHU PLATFORM - SERVER.JS
// Auto-Create Sheets + Multi-School Users + Admin Panel
// ===============================

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const { google } = require("googleapis");

const app = express();

// -------------------------------
// CONFIG BÁSICO
// -------------------------------

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

if (!SPREADSHEET_ID) {
  console.error("❌ Falta GOOGLE_SPREADSHEET_ID en las variables de entorno");
  process.exit(1);
}

// Parseo de JSON
app.use(express.json());

// Sesiones (solo memoria, suficiente para este proyecto)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secreto-ifarhu",
    resave: false,
    saveUninitialized: false,
  })
);

// -------------------------------
// GOOGLE SHEETS AUTH
// -------------------------------

const jwtClient = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth: jwtClient });

// -------------------------------
// HELPERS GOOGLE SHEETS
// -------------------------------
async function getSpreadsheet() {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties.title",
  });
  return res.data;
}

async function sheetExists(title) {
  const spreadsheet = await getSpreadsheet();
  return (
    spreadsheet.sheets &&
    spreadsheet.sheets.some((s) => s.properties.title === title)
  );
}

async function ensureSheetWithHeaders(title, headers) {
  const exists = await sheetExists(title);

  if (!exists) {
    console.log(`🟦 Creando hoja: ${title}`);
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
      range: `${title}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers],
      },
    });
  } else {
    // Ajustar / corregir headers de la fila 1 si hace falta
    console.log(`🟧 Corrigiendo headers de ${title}...`);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers],
      },
    });
  }
}

// Hoja de usuarios
async function ensureUsuariosSheet() {
  const headers = ["Usuario", "Password", "Escuelas", "Rol"];
  await ensureSheetWithHeaders("usuarios", headers);
}

// Hoja de logs
async function ensureLogsSheet() {
  const headers = ["FechaHora", "Usuario", "Accion", "Escuela", "Detalle"];
  await ensureSheetWithHeaders("logs", headers);
}

// Hoja por escuela (registros)
async function ensureEscuelaSheet(escuela) {
  const headers = [
    "Fecha",
    "Estudiante",
    "Cedula",
    "Telefono",
    "Documento",
    "Nota",
    "Trimestre",
    "Observacion",
    "Usuario",
  ];
  await ensureSheetWithHeaders(escuela, headers);
}

// Añadir log
async function addLog(usuario, accion, escuela, detalle) {
  const fechaHora = new Date().toISOString().replace("T", " ").substring(0, 19);
  await ensureLogsSheet();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "logs!A2:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[fechaHora, usuario, accion, escuela || "", detalle || ""]],
    },
  });
}

// -------------------------------
// USUARIOS
// -------------------------------

async function getUsersRaw() {
  await ensureUsuariosSheet();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "usuarios!A2:D",
  });

  const rows = res.data.values || [];
  return rows;
}

async function getUsers() {
  const rows = await getUsersRaw();
  return rows.map((r) => ({
    usuario: r[0],
    password: r[1],
    escuelas: r[2] || "",
    rol: r[3] || "user",
  }));
}

async function findUser(username) {
  const rows = await getUsersRaw();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === username) {
      return {
        rowIndex: i + 2, // porque empezamos en A2
        usuario: r[0],
        password: r[1],
        escuelas: r[2] || "",
        rol: r[3] || "user",
      };
    }
  }
  return null;
}

async function getAllEscuelas() {
  const users = await getUsers();
  const set = new Set();
  users.forEach((u) => {
    (u.escuelas || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)
      .forEach((e) => set.add(e));
  });
  return Array.from(set).sort();
}

// -------------------------------
// MIDDLEWARES
// -------------------------------

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

function userPuedeAccederEscuela(req, escuela) {
  const user = req.session.user;
  if (!user) return false;
  if (user.rol === "admin") return true;
  const lista = user.escuelas || [];
  return lista.some(
    (e) => e.trim().toLowerCase() === String(escuela).trim().toLowerCase()
  );
}

// -------------------------------
// RUTAS ESTÁTICAS (HTML / CSS / JS)
// -------------------------------

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/app", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.html"));
});

// CSS y JS
app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "style.css"));
});

app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.js"));
});

// -------------------------------
// API - AUTENTICACIÓN
// -------------------------------

app.post("/api/login", async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
      return res
        .status(400)
        .json({ error: "Debe enviar usuario y contraseña" });
    }

    const user = await findUser(usuario);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    const escuelas = user.escuelas
      ? user.escuelas.split(",").map((e) => e.trim()).filter(Boolean)
      : [];

    req.session.user = {
      usuario: user.usuario,
      rol: user.rol,
      escuelas,
    };

    res.json({
      ok: true,
      usuario: user.usuario,
      rol: user.rol,
      escuelas,
    });
  } catch (err) {
    console.error("❌ Error en login:", err);
    res.status(500).json({ error: "Error interno en login" });
  }
});

app.get("/api/me", requireLogin, (req, res) => {
  res.json(req.session.user);
});

app.post("/api/logout", requireLogin, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// -------------------------------
// API - ESCUELAS
// -------------------------------

app.get("/api/escuelas", requireLogin, async (req, res) => {
  try {
    const user = req.session.user;
    if (user.rol === "admin") {
      const todas = await getAllEscuelas();
      return res.json({ escuelas: todas });
    }
    return res.json({ escuelas: user.escuelas || [] });
  } catch (err) {
    console.error("❌ Error obteniendo escuelas:", err);
    res.status(500).json({ error: "Error obteniendo escuelas" });
  }
});

// -------------------------------
// API - REGISTROS (AGREGAR / LISTAR / BUSCAR / ACTUALIZAR)
// -------------------------------

// Agregar nuevo registro
app.post("/api/registros", requireLogin, async (req, res) => {
  try {
    const {
      escuela,
      estudiante,
      cedula,
      telefono,
      documento,
      nota,
      trimestre,
      observacion,
    } = req.body;

    if (!escuela || !estudiante || !cedula) {
      return res
        .status(400)
        .json({ error: "Escuela, estudiante y cédula son obligatorios" });
    }

    if (!userPuedeAccederEscuela(req, escuela)) {
      return res.status(403).json({ error: "No autorizado para esa escuela" });
    }

    await ensureEscuelaSheet(escuela);

    const fecha = new Date().toISOString().slice(0, 10);
    const usuario = req.session.user.usuario;

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:I`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            fecha,
            estudiante,
            cedula,
            telefono || "",
            documento || "",
            nota || "",
            trimestre || "",
            observacion || "",
            usuario,
          ],
        ],
      },
    });

    await addLog(
      usuario,
      "Agregar registro",
      escuela,
      `Estudiante: ${estudiante}, Cédula: ${cedula}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error agregando registro:", err);
    res.status(500).json({ error: "Error agregando registro" });
  }
});

// Listar registros por escuela
app.get("/api/registros", requireLogin, async (req, res) => {
  try {
    const escuela = req.query.escuela;
    if (!escuela) {
      return res.status(400).json({ error: "Falta escuela" });
    }

    if (!userPuedeAccederEscuela(req, escuela)) {
      return res.status(403).json({ error: "No autorizado para esa escuela" });
    }

    await ensureEscuelaSheet(escuela);

    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${escuela}!A2:I`,
    });

    const rows = r.data.values || [];

    const registros = rows.map((row, idx) => ({
      fila: idx + 2,
      fecha: row[0] || "",
      estudiante: row[1] || "",
      cedula: row[2] || "",
      telefono: row[3] || "",
      documento: row[4] || "",
      nota: row[5] || "",
      trimestre: row[6] || "",
      observacion: row[7] || "",
      usuario: row[8] || "",
    }));

    res.json({ escuela, registros });
  } catch (err) {
    console.error("❌ Error cargando registros:", err);
    res.status(500).json({ error: "Error cargando registros" });
  }
});

// Buscar por cédula (Actualización de registro)
app.get("/api/registros/buscar", requireLogin, async (req, res) => {
  try {
    const cedula = (req.query.cedula || "").trim();
    if (!cedula) {
      return res.status(400).json({ error: "Debe enviar cédula" });
    }

    const user = req.session.user;
    let escuelasBusqueda = [];

    if (user.rol === "admin") {
      escuelasBusqueda = await getAllEscuelas();
    } else {
      escuelasBusqueda = user.escuelas || [];
    }

    const resultados = [];

    for (const esc of escuelasBusqueda) {
      if (!esc) continue;

      await ensureEscuelaSheet(esc);

      const r = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${esc}!A2:I`,
      });

      const rows = r.data.values || [];
      rows.forEach((row, idx) => {
        if ((row[2] || "").trim() === cedula) {
          resultados.push({
            escuela: esc,
            fila: idx + 2,
            fecha: row[0] || "",
            estudiante: row[1] || "",
            cedula: row[2] || "",
            telefono: row[3] || "",
            documento: row[4] || "",
            nota: row[5] || "",
            trimestre: row[6] || "",
            observacion: row[7] || "",
            usuario: row[8] || "",
          });
        }
      });
    }

    res.json({ resultados });
  } catch (err) {
    console.error("❌ Error buscando por cédula:", err);
    res.status(500).json({ error: "Error buscando por cédula" });
  }
});

// Actualizar registro
app.put("/api/registros", requireLogin, async (req, res) => {
  try {
    const {
      escuela,
      fila,
      estudiante,
      cedula,
      telefono,
      documento,
      nota,
      trimestre,
      observacion,
    } = req.body;

    if (!escuela || !fila) {
      return res
        .status(400)
        .json({ error: "Faltan escuela o fila para actualizar" });
    }

    if (!userPuedeAccederEscuela(req, escuela)) {
      return res.status(403).json({ error: "No autorizado para esa escuela" });
    }

    await ensureEscuelaSheet(escuela);

    // Obtener la fila actual para conservar la fecha original
    const rangeFila = `${escuela}!A${fila}:I${fila}`;
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: rangeFila,
    });

    const row = (r.data.values && r.data.values[0]) || [];
    const fecha = row[0] || new Date().toISOString().slice(0, 10);
    const usuario = req.session.user.usuario;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: rangeFila,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            fecha,
            estudiante || "",
            cedula || "",
            telefono || "",
            documento || "",
            nota || "",
            trimestre || "",
            observacion || "",
            usuario,
          ],
        ],
      },
    });

    await addLog(
      usuario,
      "Actualizar registro",
      escuela,
      `Fila ${fila}, Cédula: ${cedula || row[2] || ""}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error actualizando registro:", err);
    res.status(500).json({ error: "Error actualizando registro" });
  }
});

// -------------------------------
// API ADMIN - USUARIOS
// -------------------------------

app.get("/api/admin/usuarios", requireAdmin, async (req, res) => {
  try {
    const users = await getUsers();
    res.json({ usuarios: users });
  } catch (err) {
    console.error("❌ Error obteniendo usuarios:", err);
    res.status(500).json({ error: "Error obteniendo usuarios" });
  }
});

app.post("/api/admin/usuarios", requireAdmin, async (req, res) => {
  try {
    const { usuario, password, escuelas, rol } = req.body;

    if (!usuario || !password) {
      return res
        .status(400)
        .json({ error: "Usuario y contraseña son obligatorios" });
    }

    const existente = await findUser(usuario);
    if (existente) {
      return res.status(400).json({ error: "Ese usuario ya existe" });
    }

    await ensureUsuariosSheet();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "usuarios!A2:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[usuario, password, escuelas || "", rol || "user"]],
      },
    });

    await addLog(
      req.session.user.usuario,
      "Crear usuario",
      "",
      `Usuario: ${usuario}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error creando usuario:", err);
    res.status(500).json({ error: "Error creando usuario" });
  }
});

app.put("/api/admin/usuarios/:usuario", requireAdmin, async (req, res) => {
  try {
    const username = req.params.usuario;
    const { password, escuelas, rol } = req.body;

    const user = await findUser(username);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const fila = user.rowIndex;
    const range = `usuarios!A${fila}:D${fila}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[username, password || user.password, escuelas || "", rol || user.rol]],
      },
    });

    await addLog(
      req.session.user.usuario,
      "Editar usuario",
      "",
      `Usuario: ${username}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error editando usuario:", err);
    res.status(500).json({ error: "Error editando usuario" });
  }
});

// -------------------------------
// API ADMIN - LOGS Y RESUMEN
// -------------------------------

app.get("/api/admin/logs", requireAdmin, async (req, res) => {
  try {
    await ensureLogsSheet();
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "logs!A2:E",
    });

    const rows = r.data.values || [];
    const logs = rows.map((row) => ({
      fechaHora: row[0] || "",
      usuario: row[1] || "",
      accion: row[2] || "",
      escuela: row[3] || "",
      detalle: row[4] || "",
    }));

    // Si se pasa ?limit=100, cortar
    const limit = parseInt(req.query.limit || "200", 10);
    res.json({ logs: logs.slice(-limit).reverse() });
  } catch (err) {
    console.error("❌ Error obteniendo logs:", err);
    res.status(500).json({ error: "Error obteniendo logs" });
  }
});

// Resumen simple: cantidad de registros por escuela
app.get("/api/admin/resumen", requireAdmin, async (req, res) => {
  try {
    const escuelas = await getAllEscuelas();
    const resumen = [];

    for (const esc of escuelas) {
      if (!esc) continue;
      try {
        await ensureEscuelaSheet(esc);
        const r = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${esc}!A2:I`,
        });
        const rows = r.data.values || [];
        resumen.push({ escuela: esc, total: rows.length });
      } catch (e) {
        console.error("Error leyendo escuela", esc, e.message);
      }
    }

    res.json({ resumen });
  } catch (err) {
    console.error("❌ Error en resumen:", err);
    res.status(500).json({ error: "Error obteniendo resumen" });
  }
});

// -------------------------------
// MANEJO ERRORES GENERALES
// -------------------------------

app.use((err, req, res, next) => {
  console.error("🔥 Error general:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// -------------------------------
// INICIAR SERVIDOR
// -------------------------------

const PORT = process.env.PORT || 3000;

jwtClient.authorize(async (err) => {
  if (err) {
    console.error("❌ Error autenticando con Google:", err);
    process.exit(1);
  }
  console.log("🚀 Verificando hojas principales...");
  await ensureUsuariosSheet();
  await ensureLogsSheet();
  console.log("🟢 Conectado a Google Sheets");

  app.listen(PORT, () => {
    console.log("=====================================");
    console.log("  IFARHU Plataforma corriendo");
    console.log("  Puerto:", PORT);
    console.log("=====================================");
  });
});
