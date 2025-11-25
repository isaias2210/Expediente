// ===========================
//   VARIABLES
// ===========================

let usuarioActual = null;
let resultadosActualizar = [];

// ===========================
//   CAMBIO DE VISTAS
// ===========================
function mostrarVista(vista) {
  document.querySelectorAll(".vista").forEach((v) => (v.style.display = "none"));
  const seccion = document.getElementById(`vista-${vista}`);
  if (seccion) seccion.style.display = "block";

  // Si entra a administrador y no es admin, lo devuelvo
  if (vista === "admin" && usuarioActual?.rol !== "admin") {
    alert("Sólo el administrador puede entrar a este panel.");
    mostrarVista("inicio");
  }
}

// ===========================
//   CARGA INICIAL
// ===========================
async function cargarUsuario() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (!data) {
      window.location.href = "/";
      return;
    }

    usuarioActual = data;

    if (usuarioActual.rol !== "admin") {
      document
        .querySelectorAll(".admin-only")
        .forEach((el) => (el.style.display = "none"));
    }

    await cargarEscuelas();
    mostrarVista("inicio");
  } catch (err) {
    console.error("Error cargando usuario:", err);
    alert("Error de conexión.");
    window.location.href = "/";
  }
}

// ===========================
//   LOGOUT
// ===========================
async function logout() {
  try {
    await fetch("/logout", { method: "POST" });
  } catch (e) {}
  window.location.href = "/";
}

// ===========================
//   ESCUELAS
// ===========================
async function cargarEscuelas() {
  const sel1 = document.getElementById("selectEscuela");
  const sel2 = document.getElementById("selectEscuelaAgregar");

  if (!sel1 || !sel2) return;

  sel1.innerHTML = '<option value="">Seleccione...</option>';
  sel2.innerHTML = '<option value="">Seleccione...</option>';

  try {
    const res = await fetch("/api/escuelas");
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Error cargando escuelas.");
      return;
    }

    data.forEach((e) => {
      const opt1 = document.createElement("option");
      opt1.value = e;
      opt1.textContent = e;
      sel1.appendChild(opt1);

      const opt2 = document.createElement("option");
      opt2.value = e;
      opt2.textContent = e;
      sel2.appendChild(opt2);
    });
  } catch (err) {
    console.error("Error cargando escuelas:", err);
    alert("Error de conexión al cargar escuelas.");
  }
}

// ===========================
//   CARGAR REGISTROS
// ===========================
async function cargarRegistros() {
  const escuela = document.getElementById("selectEscuela").value;
  const div = document.getElementById("tablaRegistros");

  if (!escuela) {
    div.textContent = "Seleccione una escuela.";
    return;
  }

  div.textContent = "Cargando...";

  try {
    const res = await fetch(
      `/api/registros?escuela=${encodeURIComponent(escuela)}`
    );
    const data = await res.json();

    if (!res.ok) {
      div.textContent = data.error || "Error cargando registros.";
      return;
    }

    if (data.length === 0) {
      div.textContent = "No hay registros.";
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Estudiante</th>
            <th>Cédula</th>
            <th>Doc</th>
            <th>Trimestre</th>
            <th>Nota</th>
            <th>Teléfono</th>
            <th>Observación</th>
            <th>Subido por</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach((r) => {
      html += `
        <tr>
          <td>${r.fecha}</td>
          <td>${r.estudiante}</td>
          <td>${r.cedula}</td>
          <td>${r.documento_entregado}</td>
          <td>${r.trimestre || ""}</td>
          <td>${r.nota}</td>
          <td>${r.telefono}</td>
          <td>${r.observacion}</td>
          <td>${r.subido_por}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    div.innerHTML = html;
  } catch (err) {
    console.error("Error cargando registros:", err);
    div.textContent = "Error de conexión.";
  }
}

// ===========================
//   AGREGAR REGISTRO
// ===========================
async function agregarRegistro() {
  const escuela = document.getElementById("selectEscuelaAgregar").value;
  const estudiante = document.getElementById("estudiante").value;
  const cedula = document.getElementById("cedula").value;
  const telefono = document.getElementById("telefono").value;
  const documento_entregado =
    document.getElementById("documento_entregado").value === "1";
  const trimestre = document.getElementById("trimestre").value;
  const nota = document.getElementById("nota").value;
  const observacion = document.getElementById("observacion").value;

  const msg = document.getElementById("mensajeRegistro");
  msg.textContent = "";

  if (!escuela) {
    msg.textContent = "Seleccione una escuela.";
    return;
  }

  if (!estudiante || !cedula) {
    msg.textContent = "Nombre y cédula son obligatorios.";
    return;
  }

  try {
    const res = await fetch("/api/registros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        escuela,
        estudiante,
        cedula,
        telefono,
        documento_entregado,
        trimestre,
        nota,
        observacion,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "No se pudo guardar.";
      return;
    }

    msg.textContent = "Registro guardado correctamente.";

    document.getElementById("estudiante").value = "";
    document.getElementById("cedula").value = "";
    document.getElementById("telefono").value = "";
    document.getElementById("trimestre").value = "Primer trimestre";
    document.getElementById("nota").value = "";
    document.getElementById("observacion").value = "";

    // Si la vista de escuelas está en esa escuela, recargamos la tabla
    const sel = document.getElementById("selectEscuela");
    if (sel && sel.value === escuela) {
      cargarRegistros();
    }
  } catch (err) {
    console.error("Error agregando registro:", err);
    msg.textContent = "Error de conexión.";
  }
}

// ===========================
//   BÚSQUEDA POR CÉDULA (vista consultar)
// ===========================
async function buscarPorCedula() {
  const ced = document.getElementById("buscarCedula").value;
  const div = document.getElementById("resultadosBusqueda");

  if (!ced) {
    div.textContent = "Ingrese una cédula.";
    return;
  }

  div.textContent = "Buscando...";

  try {
    const res = await fetch(`/api/buscar?cedula=${encodeURIComponent(ced)}`);
    const data = await res.json();

    if (!res.ok) {
      div.textContent = data.error || "Error.";
      return;
    }

    if (data.length === 0) {
      div.textContent = "No se encontraron registros.";
      return;
    }

    let html = `
    <table>
      <thead>
        <tr>
          <th>Escuela</th>
          <th>Fecha</th>
          <th>Estudiante</th>
          <th>Cédula</th>
          <th>Doc</th>
          <th>Trimestre</th>
          <th>Nota</th>
          <th>Teléfono</th>
          <th>Observación</th>
          <th>Subido por</th>
        </tr>
      </thead>
      <tbody>
    `;

    data.forEach((r) => {
      html += `
        <tr>
          <td>${r.escuela}</td>
          <td>${r.fecha}</td>
          <td>${r.estudiante}</td>
          <td>${r.cedula}</td>
          <td>${r.documento_entregado}</td>
          <td>${r.trimestre || ""}</td>
          <td>${r.nota}</td>
          <td>${r.telefono}</td>
          <td>${r.observacion}</td>
          <td>${r.subido_por}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    div.innerHTML = html;
  } catch (err) {
    console.error("Error búsqueda:", err);
    div.textContent = "Error de conexión.";
  }
}

// ===========================
//   ACTUALIZACIÓN DE REGISTROS
// ===========================
async function buscarParaActualizar() {
  const ced = document.getElementById("buscarCedulaActualizar").value;
  const div = document.getElementById("tablaActualizar");
  const msgForm = document.getElementById("mensajeActualizar");
  const formCard = document.getElementById("formActualizarCard");

  msgForm.textContent = "";
  formCard.style.display = "none";

  if (!ced) {
    div.textContent = "Ingrese una cédula.";
    return;
  }

  div.textContent = "Buscando...";

  try {
    const res = await fetch(`/api/buscar?cedula=${encodeURIComponent(ced)}`);
    const data = await res.json();

    if (!res.ok) {
      div.textContent = data.error || "Error.";
      return;
    }

    if (data.length === 0) {
      div.textContent = "No se encontraron registros.";
      return;
    }

    resultadosActualizar = data;

    let html = `
      <table>
        <thead>
          <tr>
            <th>Escuela</th>
            <th>Fecha</th>
            <th>Estudiante</th>
            <th>Cédula</th>
            <th>Doc</th>
            <th>Trimestre</th>
            <th>Nota</th>
            <th>Teléfono</th>
            <th>Observación</th>
            <th>Subido por</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach((r, idx) => {
      html += `
        <tr>
          <td>${r.escuela}</td>
          <td>${r.fecha}</td>
          <td>${r.estudiante}</td>
          <td>${r.cedula}</td>
          <td>${r.documento_entregado}</td>
          <td>${r.trimestre || ""}</td>
          <td>${r.nota}</td>
          <td>${r.telefono}</td>
          <td>${r.observacion}</td>
          <td>${r.subido_por}</td>
          <td><button onclick="cargarFormularioActualizar(${idx})">✏️ Editar</button></td>
        </tr>`;
    });

    html += "</tbody></table>";
    div.innerHTML = html;
  } catch (err) {
    console.error("Error búsqueda actualización:", err);
    div.textContent = "Error de conexión.";
  }
}

function cargarFormularioActualizar(idx) {
  const r = resultadosActualizar[idx];
  if (!r) return;

  document.getElementById("updFila").value = r.fila;
  document.getElementById("updEscuela").value = r.escuela;
  document.getElementById("updEstudiante").value = r.estudiante;
  document.getElementById("updCedula").value = r.cedula;
  document.getElementById("updTelefono").value = r.telefono || "";
  document.getElementById("updDocumento").value =
    (r.documento_entregado || "").toLowerCase() === "sí" ? "1" : "0";
  document.getElementById("updTrimestre").value =
    r.trimestre || "Primer trimestre";
  document.getElementById("updNota").value = r.nota || "";
  document.getElementById("updObservacion").value = r.observacion || "";

  document.getElementById("mensajeActualizar").textContent = "";
  document.getElementById("formActualizarCard").style.display = "block";
}

async function guardarActualizacion() {
  const fila = document.getElementById("updFila").value;
  const escuela = document.getElementById("updEscuela").value;
  const estudiante = document.getElementById("updEstudiante").value;
  const cedula = document.getElementById("updCedula").value;
  const telefono = document.getElementById("updTelefono").value;
  const documento_entregado =
    document.getElementById("updDocumento").value === "1";
  const trimestre = document.getElementById("updTrimestre").value;
  const nota = document.getElementById("updNota").value;
  const observacion = document.getElementById("updObservacion").value;
  const msg = document.getElementById("mensajeActualizar");

  msg.textContent = "";

  if (!fila || !escuela) {
    msg.textContent = "Falta información del registro.";
    return;
  }

  try {
    const res = await fetch("/api/registros/actualizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fila,
        escuela,
        estudiante,
        cedula,
        telefono,
        documento_entregado,
        trimestre,
        nota,
        observacion,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "No se pudo actualizar.";
      return;
    }

    msg.textContent = "Registro actualizado correctamente.";
    buscarParaActualizar();
  } catch (err) {
    console.error("Error guardando actualización:", err);
    msg.textContent = "Error de conexión.";
  }
}

// ===========================
// ADMIN: MOSTRAR SECCIÓN
// ===========================
function adminMostrar(seccion) {
  document
    .querySelectorAll(".admin-panel")
    .forEach((x) => (x.style.display = "none"));
  const panel = document.getElementById(`admin-${seccion}`);
  if (panel) panel.style.display = "block";

  if (seccion === "usuarios") cargarUsuariosAdmin();
  if (seccion === "editar") cargarListaSelectUsuarios();
  if (seccion === "logs") cargarLogs();
  if (seccion === "stats") cargarStats();
  // "ayuda" no necesita cargar nada dinámico
}

// ===========================
// ADMIN: LISTA DE USUARIOS
// ===========================
async function cargarUsuariosAdmin() {
  const div = document.getElementById("listaUsuarios");
  div.textContent = "Cargando...";

  try {
    const res = await fetch("/api/admin/usuarios");
    const data = await res.json();

    if (!res.ok) {
      div.textContent = data.error || "Error.";
      return;
    }

    if (!data.length) {
      div.textContent = "No hay usuarios.";
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Escuelas</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach((u) => {
      html += `
        <tr>
          <td>${u.usuario}</td>
          <td>${u.rol}</td>
          <td>${(u.escuelas || []).join(", ")}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    div.innerHTML = html;
  } catch (err) {
    console.error("Error cargando usuarios:", err);
    div.textContent = "Error de conexión al cargar usuarios.";
  }
}

// ===========================
// ADMIN: CREAR USUARIO
// ===========================
async function crearUsuario() {
  const usuario = document.getElementById("nuevoUsuario").value.trim();
  const password = document.getElementById("nuevoPassword").value.trim();
  const rol = document.getElementById("nuevoRol").value;
  const escuelasTxt = document.getElementById("nuevoEscuelas").value.trim();
  const msg = document.getElementById("mensajeNuevoUsuario");

  msg.textContent = "";

  if (!usuario || !password) {
    msg.textContent = "Usuario y contraseña son obligatorios.";
    return;
  }

  const escuelas = escuelasTxt
    ? escuelasTxt.split(",").map((e) => e.trim())
    : [];

  try {
    const res = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password, escuelas, rol }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "Error creando usuario.";
      return;
    }

    msg.textContent = "Usuario creado correctamente.";
    cargarUsuariosAdmin();
  } catch (err) {
    console.error("Error creando usuario:", err);
    msg.textContent = "Error de conexión.";
  }
}

// ===========================
// ADMIN: CARGAR SELECT USUARIOS
// ===========================
async function cargarListaSelectUsuarios() {
  const sel = document.getElementById("selectUsuarioEditar");
  const msg = document.getElementById("mensajeEditarUsuario");
  sel.innerHTML = '<option value="">Seleccione...</option>';
  msg.textContent = "";

  try {
    const res = await fetch("/api/admin/usuarios");
    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "Error.";
      return;
    }

    data.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.usuario;
      opt.textContent = u.usuario;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargando usuarios para editar:", err);
    msg.textContent = "Error de conexión.";
  }
}

// ===========================
// ADMIN: CARGAR DATOS USUARIO SELECCIONADO
// ===========================
async function cargarDatosUsuario() {
  const usuarioSel = document.getElementById("selectUsuarioEditar").value;
  const msg = document.getElementById("mensajeEditarUsuario");

  msg.textContent = "";
  document.getElementById("editarPassword").value = "";
  document.getElementById("editarEscuelas").value = "";

  if (!usuarioSel) return;

  try {
    const res = await fetch("/api/admin/usuarios");
    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "Error.";
      return;
    }

    const u = data.find((x) => x.usuario === usuarioSel);
    if (!u) {
      msg.textContent = "No se encontró el usuario.";
      return;
    }

    document.getElementById("editarRol").value = u.rol || "user";
    document.getElementById("editarEscuelas").value = (u.escuelas || []).join(
      ", "
    );
  } catch (err) {
    console.error("Error cargando datos usuario:", err);
    msg.textContent = "Error de conexión.";
  }
}

// ===========================
// ADMIN: GUARDAR CAMBIOS USUARIO
// ===========================
async function guardarCambiosUsuario() {
  const usuario = document.getElementById("selectUsuarioEditar").value;
  const password = document.getElementById("editarPassword").value.trim();
  const rol = document.getElementById("editarRol").value;
  const escuelasTxt = document.getElementById("editarEscuelas").value.trim();
  const msg = document.getElementById("mensajeEditarUsuario");

  msg.textContent = "";

  if (!usuario) {
    msg.textContent = "Seleccione un usuario.";
    return;
  }

  const escuelas = escuelasTxt
    ? escuelasTxt.split(",").map((e) => e.trim())
    : [];

  try {
    const res = await fetch("/api/admin/usuarios", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password, rol, escuelas }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "Error guardando cambios.";
      return;
    }

    msg.textContent = "Cambios guardados correctamente.";
    cargarUsuariosAdmin();
  } catch (err) {
    console.error("Error guardando cambios usuario:", err);
    msg.textContent = "Error de conexión.";
  }
}

// ===========================
// ADMIN: LOGS
// ===========================
async function cargarLogs() {
  const div = document.getElementById("tablaLogs");
  div.textContent = "Cargando...";

  try {
    const res = await fetch("/api/admin/logs");
    const data = await res.json();

    if (!res.ok) {
      div.textContent = data.error || "Error.";
      return;
    }

    if (!data.length) {
      div.textContent = "No hay logs todavía.";
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Usuario</th>
            <th>Acción</th>
            <th>Observación</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach((l) => {
      html += `
        <tr>
          <td>${l.fecha}</td>
          <td>${l.hora}</td>
          <td>${l.usuario}</td>
          <td>${l.accion}</td>
          <td>${l.observacion}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    div.innerHTML = html;
  } catch (err) {
    console.error("Error cargando logs:", err);
    div.textContent = "Error de conexión al cargar logs.";
  }
}

// ===========================
// ADMIN: ESTADÍSTICAS
// ===========================
async function cargarStats() {
  const div = document.getElementById("tablaStats");
  div.textContent = "Cargando...";

  try {
    const res = await fetch("/api/admin/resumen");
    const data = await res.json();

    if (!res.ok) {
      div.textContent = data.error || "No se pudieron cargar las estadísticas.";
      return;
    }

    if (!data.length) {
      div.textContent = "No hay datos para mostrar.";
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Escuela</th>
            <th>Total registros</th>
            <th>1er trimestre</th>
            <th>2do trimestre</th>
            <th>3er trimestre</th>
            <th>Con documento</th>
            <th>Sin documento</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach((r) => {
      html += `
        <tr>
          <td>${r.escuela}</td>
          <td>${r.total}</td>
          <td>${r.primer}</td>
          <td>${r.segundo}</td>
          <td>${r.tercero}</td>
          <td>${r.conDocumento}</td>
          <td>${r.sinDocumento}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    div.innerHTML = html;
  } catch (err) {
    console.error("Error cargando estadísticas:", err);
    div.textContent = "Error de conexión.";
  }
}

// ===========================
//   INICIO
// ===========================
window.addEventListener("DOMContentLoaded", cargarUsuario);
