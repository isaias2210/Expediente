// ===========================
//   VARIABLES
// ===========================

let usuarioActual = null;

// ===========================
//   CAMBIO DE VISTAS
// ===========================

function mostrarVista(vista) {
  document.querySelectorAll(".vista").forEach(v => v.style.display = "none");
  document.getElementById(`vista-${vista}`).style.display = "block";
}

// ===========================
//   CARGAR DATOS DEL USUARIO
// ===========================

async function cargarUsuario() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) {
      location.href = "/";
      return;
    }

    const data = await res.json();
    usuarioActual = data;

    // Mostrar info en Inicio
    document.getElementById("user-data").innerHTML = `
      <strong>Usuario:</strong> ${data.usuario}<br>
      <strong>Rol:</strong> ${data.rol}<br>
      <strong>Escuelas:</strong> ${
        data.rol === "admin"
          ? "TODAS (Administrador)"
          : (data.escuelas || []).join(", ")
      }
    `;

    // Mostrar botón admin
    if (data.rol === "admin") {
      document.querySelector(".admin-only").style.display = "block";
    }

    // Rellenar selects
    llenarSelectEscuelas();

  } catch (err) {
    console.error("Error cargando usuario:", err);
  }
}

// ===========================
//   LLENAR SELECTS DE ESCUELAS
// ===========================

function llenarSelectEscuelas() {
  const selects = [
    document.getElementById("selectEscuela"),
    document.getElementById("selectEscuelaAgregar")
  ];

  selects.forEach(sel => {
    sel.innerHTML = "";
    (usuarioActual.escuelas || []).forEach(e => {
      const op = document.createElement("option");
      op.value = e;
      op.textContent = e;
      sel.appendChild(op);
    });
  });
}

// ===========================
//       LOGOUT
// ===========================

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/";
}

// ===========================
//  CARGAR REGISTROS ESCUELA
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
    const res = await fetch(`/api/registros?escuela=${encodeURIComponent(escuela)}`);
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
            <th>Nota</th>
            <th>Teléfono</th>
            <th>Observación</th>
            <th>Subido por</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach(r => {
      html += `
        <tr>
          <td>${r.fecha}</td>
          <td>${r.estudiante}</td>
          <td>${r.cedula}</td>
          <td>${r.documento_entregado}</td>
          <td>${r.nota}</td>
          <td>${r.telefono}</td>
          <td>${r.observacion}</td>
          <td>${r.subido_por}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    div.innerHTML = html;
  } catch (err) {
    console.error("Error:", err);
    div.textContent = "Error de conexión.";
  }
}

// ===========================
//     AGREGAR REGISTRO
// ===========================

async function agregarRegistro() {
  const escuela = document.getElementById("selectEscuelaAgregar").value;
  const estudiante = document.getElementById("estudiante").value;
  const cedula = document.getElementById("cedula").value;
  const telefono = document.getElementById("telefono").value;
  const documento_entregado = document.getElementById("documento_entregado").value === "1";
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
        nota,
        observacion
      })
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "Error al guardar.";
      return;
    }

    msg.textContent = "Registro guardado correctamente.";

    document.getElementById("estudiante").value = "";
    document.getElementById("cedula").value = "";
    document.getElementById("telefono").value = "";
    document.getElementById("nota").value = "";
    document.getElementById("observacion").value = "";

    // Recargar tabla de la vista escuelas si aplica
    if (document.getElementById("vista-escuelas").style.display !== "none") {
      cargarRegistros();
    }
  } catch (err) {
    console.error("Error guardando registro:", err);
    msg.textContent = "Error de conexión.";
  }
}

// ===========================
//      BÚSQUEDA GLOBAL
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
          <th>Nota</th>
          <th>Teléfono</th>
          <th>Observación</th>
          <th>Subido por</th>
        </tr>
      </thead>
      <tbody>
    `;

    data.forEach(r => {
      html += `
        <tr>
          <td>${r.escuela}</td>
          <td>${r.fecha}</td>
          <td>${r.estudiante}</td>
          <td>${r.cedula}</td>
          <td>${r.documento_entregado}</td>
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
// ADMIN: MOSTRAR SECCIÓN
// ===========================

function adminMostrar(seccion) {
  document.querySelectorAll(".admin-panel").forEach(x => x.style.display = "none");
  const panel = document.getElementById(`admin-${seccion}`);
  if (panel) panel.style.display = "block";

  if (seccion === "usuarios") cargarUsuariosAdmin();
  if (seccion === "editar") cargarListaSelectUsuarios();
  if (seccion === "logs") cargarLogs();
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
      div.textContent = data.error || "Error al obtener usuarios.";
      return;
    }

    let html = `
    <table>
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Escuelas</th>
          <th>Rol</th>
        </tr>
      </thead>
      <tbody>
    `;

    data.forEach(u => {
      html += `
        <tr>
          <td>${u.usuario}</td>
          <td>${u.escuelas}</td>
          <td>${u.rol}</td>
        </tr>`;
    });

    html += "</tbody></table>";

    div.innerHTML = html;
  } catch (err) {
    console.error("Error cargando usuarios:", err);
    div.textContent = "Error de conexión.";
  }
}

// ===========================
// ADMIN: SELECT EDITAR
// ===========================

async function cargarListaSelectUsuarios() {
  const sel = document.getElementById("selectUsuarioEditar");
  sel.innerHTML = `<option value="">Seleccione...</option>`;

  try {
    const res = await fetch("/api/admin/usuarios");
    const data = await res.json();

    data.forEach(u => {
      const op = document.createElement("option");
      op.value = u.usuario;
      op.textContent = u.usuario;
      sel.appendChild(op);
    });
  } catch (err) {
    console.error("Error cargando usuarios para editar:", err);
  }
}

async function cargarDatosUsuarioEditar() {
  const user = document.getElementById("selectUsuarioEditar").value;
  if (!user) return;

  try {
    const res = await fetch("/api/admin/usuarios");
    const data = await res.json();

    const u = data.find(x => x.usuario === user);
    if (!u) return;

    document.getElementById("editEscuelas").value = u.escuelas;
    document.getElementById("editRol").value = u.rol;
  } catch (err) {
    console.error("Error cargando datos de usuario:", err);
  }
}

// ===========================
// ADMIN: CREAR USUARIO
// ===========================

async function adminCrearUsuario() {
  const usuario = document.getElementById("crearUsuario").value;
  const password = document.getElementById("crearPassword").value;
  const escuelas = document.getElementById("crearEscuelas").value;
  const rol = document.getElementById("crearRol").value;

  const msg = document.getElementById("crearMensaje");
  msg.textContent = "";

  if (!usuario || !password) {
    msg.textContent = "Rellene usuario y contraseña.";
    return;
  }

  try {
    const res = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password, escuelas, rol })
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
// ADMIN: GUARDAR CAMBIOS USUARIO
// ===========================

async function guardarCambiosUsuario() {
  const usuario = document.getElementById("selectUsuarioEditar").value;
  const escuelasStr = document.getElementById("editEscuelas").value;
  const rol = document.getElementById("editRol").value;

  if (!usuario) {
    alert("Seleccione un usuario.");
    return;
  }

  const escuelas = escuelasStr
    ? escuelasStr.split(",").map(e => e.trim())
    : [];

  try {
    const res = await fetch("/api/admin/usuarios/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, escuelas, rol })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Error actualizando usuario.");
      return;
    }

    alert("Cambios guardados.");
    cargarUsuariosAdmin();
  } catch (err) {
    console.error("Error guardando cambios de usuario:", err);
    alert("Error de conexión.");
  }
}

// ===========================
// ADMIN: CARGAR LOGS
// ===========================

async function cargarLogs() {
  const div = document.getElementById("tablaLogs");
  if (!div) return;

  div.textContent = "Cargando...";

  try {
    const res = await fetch("/api/admin/logs");
    const data = await res.json();

    if (!res.ok) {
      div.textContent = data.error || "Error cargando logs.";
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      div.textContent = "No hay logs registrados.";
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

    data.forEach(l => {
      html += `
        <tr>
          <td>${l.fecha || ""}</td>
          <td>${l.hora || ""}</td>
          <td>${l.usuario || ""}</td>
          <td>${l.accion || ""}</td>
          <td>${l.observacion || ""}</td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    div.innerHTML = html;
  } catch (err) {
    console.error("Error cargando logs:", err);
    div.textContent = "Error de conexión al cargar logs.";
  }
}

// ===========================
//   INICIO
// ===========================

window.addEventListener("DOMContentLoaded", cargarUsuario);
