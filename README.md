# nprojects

Contador de tiempo multiproyecto. Beta como app web instalable desde Chrome y Edge; después llegará la app para Windows. Este repositorio aloja la web de lista de espera y la web app en beta.

## La web

Web estática, sin dependencias ni compilación, servida con GitHub Pages desde `main`:

- `index.html` · contenido de la página
- `styles.css` · estilos
- `app.js` · envío del formulario de la lista de espera
- `config.js` · URL y clave pública de Supabase (vacías = modo demostración)

Para probarla en local basta con abrir `index.html` en el navegador.

## La web app (beta)

En `app/`: la herramienta en sí, servida en `/app/`. Sin compilación.

- Los datos de cada usuario se guardan solo en su navegador (`localStorage`); se pueden exportar e importar en JSON.
- Se puede instalar como app desde Chrome o Edge (`manifest.webmanifest`).
- Envía a Supabase, si el usuario no lo desactiva, una fila anónima por día de uso (`usage_daily`) y los comentarios que escriba (`feedback`). Nunca nombres de proyectos ni tiempos.

## Supabase

Proyecto «nprojects». Tablas `waitlist`, `usage_daily` y `feedback`: la web solo puede insertar, nunca leer.
