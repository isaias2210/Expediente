// ===========================
//   VARIABLES GLOBALES
// ===========================

let usuarioActual = null;
let edicionActual = null; // { escuela, fila }

// ===========================
//   CAMBIO DE VISTAS
// ===========================

function ocultarTodasLasVistas() {
  document.querySelectorAll(".vista").forEach((v) => (v.style.display = "none"));
}

function mostrarVista(nombre) {
  ocultarTodasLasVistas();
  const id = `vista-${nombre}`;
  const el = document.getElementById(id);
  if (el) el.style.display = "block";

  // Si entra a vistas admin, recargar data
  if (nombre === "admin-usuarios") {
    adminCargarUsuarios();
  } else if (nombre === "admin-logs") {
    adminCargarLogs();
  } else if (nombre === "admin-resumen") {
    adminCargarResumen();
  }
}

// ===========================
//   CARGA INICIAL
// ===========================

async function cargarUsuarioYEscuelas() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    usuarioActual = data;

    document.getElementById("txtUsuario").textContent =
      `Usuario: ${data.usuario} (${data.rol})`;

    if (data.rol === "admin") {
      document.getElementById("menuAdmin").style.display = "block";
    }

    await cargarEscuelasSelects();
  } catch (e) {
    console.error(e);
    alert("Error cargando datos del usuario.");
  }
}

async function cargarEscuelasSelects() {
  const res = await fetch("/api/escuelas");
  const data = await res.json();
  const escuelas = data.escuelas || [];

  const selLista = document.getElementById("selectEscuelaLista");
  const selAgregar = document.getElementById("selectEscuelaAgregar");

  [selLista, selAgregar].forEach((sel) => {
    sel.innerHTML = "";
    if (!escuelas.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No hay escuelas asignadas";
      sel.appendChild(opt);
      sel.disabled = true;
    } else {
      escuelas.forEach((esc) => {
        const opt = document.createElement("option");
        opt.value = esc;
        opt.textContent = esc;
        sel.appendChild(opt);
      });
      sel.disabled = false;
    }
  });
}

// ===========================
//       LOGOUT
// ===========================

async function logout() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch (e) {
    console.error(e);
  }
  location.href = "/login";
}

// ===========================
//   VER REGISTROS POR ESCUELA
// ===========================

async function cargarRegistros() {
  const escuela = document.getElementById("selectEscuelaLista").value;
  const contenedor = document.getElementById("tablaRegistros");
  contenedor.textContent = "Cargando registros...";

  if (!escuela) {
    contenedor.textContent = "Debe seleccionar una escuela.";
    return;
  }

  try {
    const res = await fetch(`/api/registros?escuela=${encodeURIComponent(escuela)}`);
    const data = await res.json();

    if (!res.ok) {
      contenedor.textContent = data.error || "Error al cargar registros.";
      return;
    }

    if (!data.registros || !data.registros.length) {
      contenedor.textContent = "No hay registros para esta escuela.";
      return;
    }

    const tabla = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Fecha</th>
        <th>Estudiante</th>
        <th>Cédula</th>
        <th>Teléfono</th>
        <th>Documento</th>
        <th>Nota</th>
        <th>Trimestre</th>
        <th>Observación</th>
        <th>Usuario</th>
      </tr>
    `;
    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");
    data.registros.forEach((reg) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${reg.fecha}</td>
        <td>${reg.estudiante}</td>
        <td>${reg.cedula}</td>
        <td>${reg.telefono}</td>
        <td>${reg.documento}</td>
        <td>${reg.nota}</td>
        <td>${reg.trimestre}</td>
        <td>${reg.observacion}</td>
        <td>${reg.usuario}</td>
      `;
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    contenedor.innerHTML = "";
    contenedor.appendChild(tabla);
  } catch (e) {
    console.error(e);
    contenedor.textContent = "Error al conectar con el servidor.";
  }
}

// ===========================
//   AGREGAR REGISTRO
// ===========================

async function agregarRegistro() {
  const escuela = document.getElementById("selectEscuelaAgregar").value;
  const estudiante = document.getElementById("estudiante").value.trim();
  const cedula = document.getElementById("cedula").value.trim();
  const telefono = document.getElementById("telefono").value.trim();
  const documento = document.getElementById("documento_entregado").value;
  const nota = document.getElementById("nota").value.trim();
  const trimestre = document.getElementById("trimestre").value;
  const observacion = document.getElementById("observacion").value.trim();
  const mensaje = document.getElementById("mensajeAgregar");

  mensaje.textContent = "";

  if (!escuela || !estudiante || !cedula) {
    mensaje.textContent = "Escuela, estudiante y cédula son obligatorios.";
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
        documento,
        nota,
        trimestre,
        observacion,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = data.error || "Error agregando registro.";
      return;
    }

    mensaje.textContent = "Registro guardado correctamente.";
    // Limpiar formulario
    document.getElementById("estudiante").value = "";
    document.getElementById("cedula").value = "";
    document.getElementById("telefono").value = "";
    document.getElementById("nota").value = "";
    document.getElementById("observacion").value = "";
  } catch (e) {
    console.error(e);
    mensaje.textContent = "Error de conexión.";
  }
}

// ===========================
//   BUSCAR POR CÉDULA
// ===========================

async function buscarPorCedula() {
  const cedula = document.getElementById("buscarCedula").value.trim();
  const contenedor = document.getElementById("tablaBusqueda");
  const mensaje = document.getElementById("mensajeBuscar");

  mensaje.textContent = "";
  contenedor.textContent = "";

  if (!cedula) {
    mensaje.textContent = "Debe escribir una cédula.";
    return;
  }

  contenedor.textContent = "Buscando...";

  try {
    const res = await fetch(`/api/registros/buscar?cedula=${encodeURIComponent(cedula)}`);
    const data = await res.json();

    if (!res.ok) {
      contenedor.textContent = data.error || "Error en la búsqueda.";
      return;
    }

    const resultados = data.resultados || [];
    if (!resultados.length) {
      contenedor.textContent = "No se encontraron registros con esa cédula.";
      return;
    }

    const tabla = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Escuela</th>
        <th>Estudiante</th>
        <th>Cédula</th>
        <th>Trimestre</th>
        <th>Documento</th>
        <th>Nota</th>
        <th>Acción</th>
      </tr>
    `;
    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");
    resultados.forEach((reg, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${reg.escuela}</td>
        <td>${reg.estudiante}</td>
        <td>${reg.cedula}</td>
        <td>${reg.trimestre}</td>
        <td>${reg.documento}</td>
        <td>${reg.nota}</td>
        <td>
          <button class="icon-btn" title="Editar" onclick="abrirEdicion(${idx})">✏️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    contenedor.innerHTML = "";
    contenedor.appendChild(tabla);

    // Guardamos los resultados en memoria para poder editar
    window._resultadosBusqueda = resultados;
    document.getElementById("cardEdicion").style.display = "none";
  } catch (e) {
    console.error(e);
    contenedor.textContent = "Error al conectar con el servidor.";
  }
}

function abrirEdicion(idx) {
  const resultados = window._resultadosBusqueda || [];
  const reg = resultados[idx];
  if (!reg) return;

  edicionActual = { escuela: reg.escuela, fila: reg.fila };

  document.getElementById("infoEdicion").textContent =
    `Editando registro de la escuela ${reg.escuela}, fila ${reg.fila}`;

  document.getElementById("editEstudiante").value = reg.estudiante;
  document.getElementById("editCedula").value = reg.cedula;
  document.getElementById("editTelefono").value = reg.telefono;
  document.getElementById("editDocumento").value = reg.documento === "1" || reg.documento === "Sí" ? "1" : "0";
  document.getElementById("editNota").value = reg.nota;
  document.getElementById("editTrimestre").value = reg.trimestre || "Primer trimestre";
  document.getElementById("editObservacion").value = reg.observacion;

  document.getElementById("cardEdicion").style.display = "block";
  document.getElementById("mensajeEdicion").textContent = "";
}

async function guardarEdicion() {
  const mensaje = document.getElementById("mensajeEdicion");
  mensaje.textContent = "";

  if (!edicionActual) {
    mensaje.textContent = "No hay registro seleccionado.";
    return;
  }

  const estudiante = document.getElementById("editEstudiante").value.trim();
  const cedula = document.getElementById("editCedula").value.trim();
  const telefono = document.getElementById("editTelefono").value.trim();
  const documento = document.getElementById("editDocumento").value;
  const nota = document.getElementById("editNota").value.trim();
  const trimestre = document.getElementById("editTrimestre").value;
  const observacion = document.getElementById("editObservacion").value.trim();

  if (!estudiante || !cedula) {
    mensaje.textContent = "Estudiante y cédula son obligatorios.";
    return;
  }

  try {
    const res = await fetch("/api/registros", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        escuela: edicionActual.escuela,
        fila: edicionActual.fila,
        estudiante,
        cedula,
        telefono,
        documento,
        nota,
        trimestre,
        observacion,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = data.error || "Error actualizando registro.";
      return;
    }

    mensaje.textContent = "Registro actualizado correctamente.";
  } catch (e) {
    console.error(e);
    mensaje.textContent = "Error de conexión.";
  }
}

// ===========================
//   ADMIN - USUARIOS
// ===========================

async function adminCargarUsuarios() {
  const cont = document.getElementById("listaUsuarios");
  cont.textContent = "Cargando usuarios...";

  try {
    const res = await fetch("/api/admin/usuarios");
    const data = await res.json();
    if (!res.ok) {
      cont.textContent = data.error || "Error cargando usuarios.";
      return;
    }

    const usuarios = data.usuarios || [];
    if (!usuarios.length) {
      cont.textContent = "No hay usuarios registrados.";
      return;
    }

    const tabla = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Usuario</th>
        <th>Escuelas</th>
        <th>Rol</th>
      </tr>
    `;
    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");
    usuarios.forEach((u) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.usuario}</td>
        <td>${u.escuelas || ""}</td>
        <td>${u.rol === "admin" ? '<span class="badge-admin">Admin</span>' : "Usuario"}</td>
      `;
      tr.onclick = () => {
        document.getElementById("editarUsuario").value = u.usuario;
        document.getElementById("editarEscuelas").value = u.escuelas || "";
        document.getElementById("editarRol").value = u.rol || "user";
        document.getElementById("editarPassword").value = "";
      };
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);

    cont.innerHTML = "";
    cont.appendChild(tabla);
  } catch (e) {
    console.error(e);
    cont.textContent = "Error de conexión.";
  }
}

async function adminCrearUsuario() {
  const usuario = document.getElementById("crearUsuario").value.trim();
  const password = document.getElementById("crearPassword").value.trim();
  const escuelas = document.getElementById("crearEscuelas").value.trim();
  const rol = document.getElementById("crearRol").value;
  const mensaje = document.getElementById("crearMensaje");

  mensaje.textContent = "";

  if (!usuario || !password) {
    mensaje.textContent = "Usuario y contraseña son obligatorios.";
    return;
  }

  try {
    const res = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password, escuelas, rol }),
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = data.error || "Error creando usuario.";
      return;
    }

    mensaje.textContent = "Usuario creado correctamente.";
    document.getElementById("crearUsuario").value = "";
    document.getElementById("crearPassword").value = "";
    document.getElementById("crearEscuelas").value = "";

    adminCargarUsuarios();
  } catch (e) {
    console.error(e);
    mensaje.textContent = "Error de conexión.";
  }
}

async function guardarCambiosUsuario() {
  const usuario = document.getElementById("editarUsuario").value.trim();
  const password = document.getElementById("editarPassword").value.trim();
  const escuelas = document.getElementById("editarEscuelas").value.trim();
  const rol = document.getElementById("editarRol").value;
  const mensaje = document.getElementById("editarMensaje");

  mensaje.textContent = "";

  if (!usuario) {
    mensaje.textContent = "Debe indicar un usuario.";
    return;
  }

  try {
    const res = await fetch(`/api/admin/usuarios/${encodeURIComponent(usuario)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, escuelas, rol }),
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = data.error || "Error editando usuario.";
      return;
    }

    mensaje.textContent = "Usuario actualizado.";
    adminCargarUsuarios();
  } catch (e) {
    console.error(e);
    mensaje.textContent = "Error de conexión.";
  }
}

// ===========================
//   ADMIN - LOGS
// ===========================

async function adminCargarLogs() {
  const cont = document.getElementById("tablaLogs");
  cont.textContent = "Cargando logs...";

  try {
    const res = await fetch("/api/admin/logs?limit=200");
    const data = await res.json();

    if (!res.ok) {
      cont.textContent = data.error || "Error cargando logs.";
      return;
    }

    const logs = data.logs || [];
    if (!logs.length) {
      cont.textContent = "No hay registros en la bitácora.";
      return;
    }

    const tabla = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Fecha/Hora</th>
        <th>Usuario</th>
        <th>Acción</th>
        <th>Escuela</th>
        <th>Detalle</th>
      </tr>
    `;
    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");
    logs.forEach((l) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${l.fechaHora}</td>
        <td>${l.usuario}</td>
        <td>${l.accion}</td>
        <td>${l.escuela}</td>
        <td>${l.detalle}</td>
      `;
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);

    cont.innerHTML = "";
    cont.appendChild(tabla);
  } catch (e) {
    console.error(e);
    cont.textContent = "Error de conexión.";
  }
}

// ===========================
//   ADMIN - RESUMEN
// ===========================

async function adminCargarResumen() {
  const cont = document.getElementById("tablaResumen");
  cont.textContent = "Cargando resumen...";

  try {
    const res = await fetch("/api/admin/resumen");
    const data = await res.json();

    if (!res.ok) {
      cont.textContent = data.error || "Error cargando resumen.";
      return;
    }

    const lista = data.resumen || [];
    if (!lista.length) {
      cont.textContent = "No hay datos para mostrar.";
      return;
    }

    const tabla = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Escuela</th>
        <th>Total de registros</th>
      </tr>
    `;
    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");
    lista.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.escuela}</td>
        <td>${r.total}</td>
      `;
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);

    cont.innerHTML = "";
    cont.appendChild(tabla);
  } catch (e) {
    console.error(e);
    cont.textContent = "Error de conexión.";
  }
}

// ===========================
//   INICIALIZAR APP
// ===========================

document.addEventListener("DOMContentLoaded", async () => {
  await cargarUsuarioYEscuelas();
  mostrarVista("lista");
});
