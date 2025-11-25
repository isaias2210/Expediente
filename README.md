# Plataforma IFARHU – Expedientes por Escuela (v2)

- Login con roles (admin / user)
- Cada usuario puede tener múltiples escuelas asignadas
- El ADMIN puede asignar y editar escuelas de cada usuario desde la web
- Base de datos en Google Sheets (una hoja por escuela)
- Búsqueda por cédula
- Registros: fecha, estudiante, cédula, documento entregado, nota, teléfono, observación, subido_por

## Configuración rápida

1. Ejecuta:

```bash
npm install
```

2. Crea un archivo `.env` en la raíz con:

```env
PORT=3000
SESSION_SECRET=TU_SECRETO_AQUI

GOOGLE_SPREADSHEET_ID=TU_ID_DE_GOOGLE_SHEET
GOOGLE_SERVICE_ACCOUNT_EMAIL=tu-service-account@proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nLINEAS\nAQUI\n-----END PRIVATE KEY-----\n"
```

3. En tu Google Sheet crea:
- Hoja `usuarios`
- Hoja `auditoria`
- Una hoja por escuela (Ej: `Escuela_A`, `Escuela_B`)

### Hoja usuarios

Columnas: usuario | contraseña | escuelas | rol

Ejemplo:

| usuario | contraseña | escuelas              | rol   |
|--------|------------|-----------------------|-------|
| admin  | admin123   | *                     | admin |
| maria  | 1234       | Escuela_A,Escuela_B   | user  |

El admin luego podrá editar las escuelas desde el panel web.

### Columnas de cada hoja de escuela

| fecha | estudiante | cedula | documento_entregado | nota | telefono | observacion | subido_por |

### Hoja auditoria

| fecha | usuario | accion | escuela | detalle |
