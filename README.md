# Búsqueda del tesoro — arquitectura inicial

Esta carpeta es un andamiaje inicial del frontend, no una versión funcional completa del juego.

## Contenido
- `index.html` conserva las vistas principales del juego y usa `styles.css`.
- `config.js` contiene configuración pública de demostración.
- `js/models/` contiene clases iniciales de dominio.
- `js/modules/` separa registro, interfaz, geolocalización, proximidad y mapa.
- `js/api.js` deja definidos los puntos de integración con el backend, aún sin conectar.

## Ejecutar localmente
Los módulos ES deben abrirse desde un servidor HTTP/HTTPS, no directamente mediante `file://`.
Podés usar la extensión Live Server de Visual Studio Code o el servidor de desarrollo que prefieras.

## Importante
- El registro actual es solo demostrativo y no persiste datos.
- El modo ensayo usa coordenadas de ejemplo de Buenos Aires.
- El desbloqueo por proximidad en el navegador es únicamente visual. La autorización definitiva debe recalcularse y validarse en el servidor.
- No publicar datos personales ni credenciales secretas en archivos del frontend.
- La base de datos y las funciones del backend se definirán en una etapa posterior.
