# TalentAI · versión de escritorio

Aplicación de escritorio (Python + PySide6) para la selección de personal, con tres partes que se ven como
segmentos en la barra superior:

| Parte | Qué hace | Modelo |
|---|---|---|
| **1 · Análisis de CV** | Ranking de CVs (PDF, Word, texto) contra los requisitos ponderados de la convocatoria. Para cada requisito muestra el fragmento del CV que lo respalda. | `intfloat/multilingual-e5-base` (TF-IDF de respaldo) |
| **2 · Análisis de entrevista (video)** | Muestra el video con subtítulos sincronizados y, al costado, el análisis; cada ▶ mm:ss de la evidencia o la transcripción lleva el video a ese momento. Extrae el audio del video, lo transcribe y puntúa **contenido** (60%), **fluidez** (20%) y **claridad** (20%), con la evidencia y el minuto exacto de cada requisito. | Whisper `large-v3` (faster-whisper) en GPU |
| **3 · Resultado final** | Combina CV y entrevista con pesos ajustables; el reclutador registra su decisión y nota. Exporta a Excel o CSV. | — |

Todo se procesa en la PC: los modelos se cargan solo desde la caché local y no se envía ningún dato afuera.

## Cómo abrirla

Doble clic en `iniciar.bat`, o:

```
.venv\Scripts\python.exe app.py
```

Para una demo rápida: en la Parte 1, botón **Cargar ejemplo** (incluye los videos de `ejemplos/entrevistas`; uno sin CV entra como «solo entrevista»; con **Abrir…** se puede cambiar a `convocatoria_practicante_ia.json`) → **Analizar CVs** → marcar en «Entrevista» →
Parte 2 → **Transcribir y analizar** → Parte 3.

## Datos desde Supabase (proyecto GTH)

En la Parte 1, **Importar aviso de Supabase (Bumeran)…** lista los avisos que el scraper de GTH guardó en
Supabase. Al importar uno se cargan sus requisitos (`avisos.criterios`), sus postulantes (experiencia,
estudios e idiomas de `postulaciones.datos_json`) y el **ranking e5 ya calculado** (`ranking_embeddings`), con la
evidencia de cada requisito. Los avisos que aún no tienen ranking se pueden calcular en la PC con «Analizar CVs».

- **Solo lectura**: la conexión se abre en modo read-only; TalentAI no crea esquemas ni tablas y no escribe en Supabase.
- Las entrevistas, la preselección y las decisiones se guardan en la PC, en `datos/aviso_<id>.json`. Si se vuelve a importar el mismo aviso (por ejemplo, con postulantes nuevos), ese trabajo se conserva.
- La conexión usa `SUPABASE_DB_URL`, tomada de la variable de entorno, del `.env` de esta carpeta o del `.env` del scraper (`INTERFAZ/GTH_Interfaz/scraping/.env`).
- Va por el puerto de Postgres (5432). Algunas redes (universidad, wifi pública) lo bloquean; en ese caso el botón muestra «No se pudo conectar» y hay que usar otra red.

## Entorno

El `.venv` se creó con `--system-site-packages` sobre el Python de Anaconda, que ya trae `faster-whisper`,
`ctranslate2` (con CUDA), `PySide6`, `pdfplumber`, `scikit-learn` y `pandas`. Al `.venv` se le agregó
`sentence-transformers` (para e5) y `pyside6-essentials` + `pyside6-addons` 6.9.2 (el PySide6 de anaconda no trae
QtMultimedia, necesario para el reproductor). Para recrearlo:

```
C:\Users\aaron\anaconda3\python.exe -m venv --system-site-packages .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Modelos usados desde `%USERPROFILE%\.cache\huggingface\hub`:
- `Systran/faster-whisper-large-v3`: en la RTX 2060 transcribe ~40 s de audio en ~17 s (float16). Sin GPU usa la CPU en int8 (mucho más lento).
- `intfloat/multilingual-e5-base`: la primera carga tarda ~30-50 s; luego se reutiliza.

## Cómo se calcula cada puntaje

**Parte 1 (CV):** el CV se divide en fragmentos (viñetas, líneas, oraciones). Para cada requisito se toma el
fragmento más parecido y el score es el promedio ponderado. Con e5 las similitudes salen muy juntas, así que se
reescalan de 0 a 100 **dentro de la convocatoria** (el mejor CV = 100). Es un puntaje relativo: el orden no cambia.

**Parte 2 (entrevista):**
- *Contenido*: cada oración (y cada par de oraciones) de la transcripción se compara con cada requisito. Si la evidencia es una negación («no tengo experiencia en…»), el puntaje de ese requisito se multiplica por 0.3.
- *Fluidez*: 100 si habla entre 110 y 160 palabras por minuto; baja en forma lineal hasta 0 en 60 o 220. Se restan 15 puntos por cada pausa de más de 3 s por minuto (máx. 40).
- *Claridad*: mitad dicción (confianza media de Whisper por palabra, de 55% a 95%) y mitad muletillas (−12 puntos por cada muletilla cada 100 palabras). Para poder contarlas, se le pide a Whisper una transcripción literal.

No se analiza el rostro, los gestos, la apariencia, la voz como rasgo personal ni las emociones.

**Parte 3:** `final = CV × peso_CV + entrevista × (100 − peso_CV)`. Si falta una parte, se usa la que exista
(columna «Base»).

## Estructura

```
app.py                      punto de entrada
iniciar.bat                 lanzador con doble clic
talentai/
  textos.py                 lectura de PDF/DOCX/TXT y fragmentación
  embeddings.py             e5 / TF-IDF
  matching_cv.py            Parte 1
  audio.py                  Parte 2 (Whisper + métricas)
  proyecto.py               datos de la sesión y guardado en JSON
  ventana.py, pagina_*.py   interfaz (PySide6)
  ui_comun.py, estilo.py    segmentos, tarjetas, tareas en segundo plano, estilos
herramientas/
  crear_ejemplos.py         genera CVs y entrevistas ficticias (voz de Windows + ffmpeg)
  prueba_ui.py              recorre las 3 partes sin pantalla y guarda capturas
pruebas/test_nucleo.py      pruebas del núcleo
ejemplos/                   datos ficticios para la demo
datos/sesion.json           sesión guardada automáticamente
```

## Pruebas

```
.venv\Scripts\python.exe -m unittest discover pruebas
.venv\Scripts\python.exe herramientas\prueba_ui.py capturas
```

## Limitaciones conocidas

- Los PDF escaneados como imagen no tienen texto: se avisa y se omiten (no hay OCR).
- Los umbrales de contenido (similitud e5 de 0.78 a 0.88 → 0-100) y de fluidez son heurísticos; conviene calibrarlos con entrevistas reales.
- La detección de negaciones es por patrones y no cubre todas las formas de negar.
