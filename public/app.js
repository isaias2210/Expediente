// ===============================================
// 🔵 VARIABLES GLOBALES
// ===============================================
let usuarioActual = null;
let escuelasDisponibles = [];
let registrosCache = [];   // Para actualización rápida

// ===============================================
// 🔵 CAMBIAR ENTRE SECCIONES
// ===============================================
document.querySelectorAll(".menu-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;

    document.querySelectorAll(".section").forEach(sec =>
      sec.classList.remove("active")
    );

    document.getElementById(target).classList.add("active");
  });
});

// ===============================================
// 🔵 CARGAR USUARIO ACTUAL
// ===============================================
async function cargarUsuario() {
  const res = await fetch("/api/me");
  if (!res.ok) {
    window.location = "/login.html";
    return;
  }

  usuarioActual = await res.json();

  if (usuarioActual.rol === "admin") {
    document.querySelectorAll(".admin-only").forEach(x => x.style.display = "block");
  } else {
    document.querySelectorAll(".admin-only").forEach(x => x.style.display = "none");
  }

  cargarEscuelasUsuario();
  cargarEscuelasVer();
  cargarLogsUsuario();

  if (usuarioActual.rol === "admin") {
    cargarUsuariosAdmin();
    cargarEscuelasAdmin();
    cargarLogsAdmin();
  }
}

cargarUsuario();

// ===============================================
// 🔵 CERRAR SESIÓN
// ===============================================
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location = "/login.html";
});
// ========================================================
// 🔷 CARGAR ESCUELAS ASIGNADAS AL USUARIO
// ========================================================
async function cargarEscuelasUsuario() {
  const sel = document.getElementById("escuelaSelect");
  sel.innerHTML = "";

  usuarioActual.escuelas.forEach(e => {
    const op = document.createElement("option");
    op.value = e;
    op.textContent = e;
    sel.appendChild(op);
  });
}

async function cargarEscuelasVer() {
  const sel = document.getElementById("selectVerEscuela");
  sel.innerHTML = "";

  usuarioActual.escuelas.forEach(e => {
    const op = document.createElement("option");
    op.value = e;
    op.textContent = e;
    sel.appendChild(op);
  });

  sel.addEventListener("change", cargarRegistrosEscuela);
}

// ========================================================
// 🔷 AGREGAR REGISTRO
// ========================================================
document.getElementById("btnAgregar").addEventListener("click", async () => {
  const data = {
    escuela: document.getElementById("escuelaSelect").value,
    estudiante: document.getElementById("estudiante").value.trim(),
    cedula: document.getElementById("cedula").value.trim(),
    telefono: document.getElementById("telefono").value.trim(),
    documento: document.getElementById("documento").value,
    trimestre: document.getElementById("trimestre").value,
    nota: document.getElementById("nota").value,
    observacion: document.getElementById("observacion").value,
  };

  if (!data.estudiante || !data.cedula) {
    alert("Debe ingresar estudiante y cédula.");
    return;
  }

  const res = await fetch("/api/agregar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const r = await res.json();
  if (r.ok) {
    alert("Registro agregado correctamente.");
    cargarRegistrosEscuela();
  } else {
    alert("Error al agregar registro.");
  }
});
// ========================================================
// 🔷 CARGAR REGISTROS DE UNA ESCUELA
// ========================================================
async function cargarRegistrosEscuela() {
  const escuela = document.getElementById("selectVerEscuela").value;

  const res = await fetch("/api/registros?escuela=" + escuela);
  const registros = await res.json();

  registrosCache = registros;

  const tbody = document.querySelector("#tablaRegistros tbody");
  tbody.innerHTML = "";

  registros.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.fecha}</td>
      <td>${r.estudiante}</td>
      <td>${r.cedula}</td>
      <td>${r.documento}</td>
      <td>${r.trimestre}</td>
      <td>${r.nota}</td>
      <td>${r.observacion}</td>
      <td>${r.subido_por}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ========================================================
// 🔷 BUSCAR POR CÉDULA PARA ACTUALIZAR
// ========================================================
document.getElementById("btnBuscarCedula").addEventListener("click", () => {
  const ced = document.getElementById("buscarCedula").value.trim();

  const resultados = registrosCache.filter(r => r.cedula === ced);

  const tbody = document.querySelector("#tablaActualizar tbody");
  tbody.innerHTML = "";

  resultados.forEach(r => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${r.estudiante}</td>
      <td>${r.cedula}</td>
      <td>${r.trimestre}</td>
      <td>${r.nota}</td>
      <td>
        <button class="editar-btn" data-id="${r.filaId}" data-escuela="${r.escuela}">
          ✏️
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Activar eventos de edición
  document.querySelectorAll(".editar-btn").forEach(btn => {
    btn.addEventListener("click", editarRegistro);
  });
});

// ========================================================
// 🔷 ABRIR POPUP DE EDICIÓN
// ========================================================
function editarRegistro(e) {
  const filaId = e.target.dataset.id;
  const escuela = e.target.dataset.escuela;

  const reg = registrosCache.find(r => r.filaId === filaId);

  const nuevaNota = prompt("Nueva nota:", reg.nota);
  if (nuevaNota === null) return;

  const nuevoTrimestre = prompt("Nuevo trimestre:", reg.trimestre);
  if (nuevoTrimestre === null) return;

  actualizarRegistro(escuela, filaId, nuevaNota, nuevoTrimestre);
}

// ========================================================
// 🔷 ENVIAR ACTUALIZACIÓN AL SERVIDOR
// ========================================================
async function actualizarRegistro(escuela, filaId, nota, trimestre) {
  const res = await fetch("/api/actualizar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ escuela, filaId, nota, trimestre }),
  });

  const r = await res.json();
  if (r.ok) {
    alert("Registro actualizado.");
    cargarRegistrosEscuela();
  } else {
    alert("Error actualizando registro.");
  }
}
// ========================================================
// 🔷 ADMIN: CARGAR USUARIOS
// ========================================================
async function cargarUsuariosAdmin() {
  const res = await fetch("/api/admin/usuarios");
  const usuarios = await res.json();

  const tabla = document.getElementById("tablaUsuarios");
  tabla.innerHTML = `
    <tr><th>Usuario</th><th>Rol</th><th>Escuelas</th></tr>
  `;

  usuarios.forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.usuario}</td>
      <td>${u.rol}</td>
      <td>${u.escuelas}</td>
    `;
    tabla.appendChild(tr);
  });
}

// ========================================================
// 🔷 ADMIN: CREAR USUARIO
// ========================================================
document.getElementById("btnCrearUsuario").addEventListener("click", async () => {
  const data = {
    usuario: document.getElementById("nuevoUsuario").value.trim(),
    password: document.getElementById("nuevoPassword").value.trim(),
    rol: document.getElementById("nuevoRol").value,
    escuelas: document.getElementById("nuevoEscuelas").value,
  };

  const res = await fetch("/api/admin/crearUsuario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const r = await res.json();
  if (r.ok) {
    alert("Usuario creado.");
    cargarUsuariosAdmin();
  } else {
    alert("Error creando usuario.");
  }
});

// ========================================================
// 🔷 ADMIN: ESCUELAS
// ========================================================
async function cargarEscuelasAdmin() {
  const res = await fetch("/api/admin/escuelas");
  const escuelas = await res.json();

  const tabla = document.getElementById("tablaEscuelas");
  tabla.innerHTML = `
    <tr><th>Escuela</th></tr>
  `;

  escuelas.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${e}</td>`;
    tabla.appendChild(tr);
  });
}

document.getElementById("btnCrearEscuela").addEventListener("click", async () => {
  const escuela = document.getElementById("nuevaEscuela").value.trim();

  const res = await fetch("/api/admin/crearEscuela", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ escuela }),
  });

  const r = await res.json();
  if (r.ok) {
    alert("Escuela creada.");
    cargarEscuelasAdmin();
  } else {
    alert("Error creando escuela.");
  }
});

// ========================================================
// 🔷 ADMIN: LOGS COMPLETOS
// ========================================================
async function cargarLogsAdmin() {
  const res = await fetch("/api/admin/logs");
  const logs = await res.json();

  const tbody = document.querySelector("#tablaLogs tbody");
  tbody.innerHTML = "";

  logs.forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.fecha}</td>
      <td>${l.usuario}</td>
      <td>${l.accion}</td>
      <td>${l.detalles}</td>
      <td>${l.ip}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ========================================================
// 🔷 LOGS DEL USUARIO ACTUAL
// ========================================================
async function cargarLogsUsuario() {
  const res = await fetch("/api/misLogs");
  const logs = await res.json();

  const tbody = document.querySelector("#tablaMisLogs tbody");
  tbody.innerHTML = "";

  logs.forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.fecha}</td>
      <td>${l.accion}</td>
      <td>${l.detalles}</td>
    `;
    tbody.appendChild(tr);
  });
}
// =============================================================
// 🔵 OBTENER LISTA DE HOJAS EXISTENTES
// =============================================================
async function getSheetNames() {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });

  return meta.data.sheets.map(s => s.properties.title);
}

// =============================================================
// 🔵 CREAR HOJA SOLO SI NO EXISTE + AGREGAR HEADERS
// =============================================================
async function ensureSheetWithHeaders(name, headers) {
  const existentes = await getSheetNames();

  // --- Si NO existe → crearla ---
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
        ],
      },
    });
  } else {
    console.log(`✔ Hoja ${name} ya existe, no se crea`);
  }

  // --- Colocar encabezados SIEMPRE ---
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${name}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] }
  });
}

// =============================================================
// 🔵 HOJA DE USUARIOS
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
// 🔵 HOJA DE LOGS
// =============================================================
async function ensureLogsSheet() {
  await ensureSheetWithHeaders("logs", [
    "fecha",
    "usuario",
    "accion",
    "detalles",
    "ip"
  ]);
}

// =============================================================
// 🔵 HOJA POR ESCUELA
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
