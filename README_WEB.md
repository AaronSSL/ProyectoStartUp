# Palomar Talent · versión web

Prototipo de startup (curso Proyecto StartUP): selección de personal con IA para cualquier empresa. Es la evolución
web de la app de escritorio de esta misma carpeta (`app.py`, `talentai/`), que sigue funcionando igual.

| Parte | Qué hace | Modelo (en el navegador) |
|---|---|---|
| **1 · Análisis de CV** | Ranking de CVs (PDF, Word, texto) contra los requisitos ponderados; para cada requisito, la frase del CV que lo respalda. | `Xenova/multilingual-e5-small` |
| **2 · Análisis de entrevista** | Video con subtítulos y, al costado, el análisis: contenido (60%), fluidez (20%) y claridad (20%), con el minuto de cada evidencia (▶ mm:ss). | `Xenova/whisper-small` (o `whisper-base`) |
| **3 · Resultado final** | CV + entrevista con pesos ajustables, decisión y nota por candidato; exporta CSV. | — |

Además: **espacios de trabajo por empresa**, **Integraciones** con LinkedIn, Bumeran y Computrabajo (la empresa solicita
la configuración y soporte técnico la realiza; en el prototipo no hay extracción real) y una **empresa demo** con datos
ficticios para recorrer todo.

## Cómo funciona sin servidor

- Los modelos corren en el navegador con [transformers.js](https://huggingface.co/docs/transformers.js): se descargan
  una sola vez desde Hugging Face (~120 MB e5 + ~350-500 MB Whisper small) y quedan en la caché del navegador.
- Con Chrome o Edge y una tarjeta gráfica, Whisper usa **WebGPU**; si no, el procesador (WASM, más lento).
- Los datos de cada empresa (convocatorias, CVs, videos, decisiones) se guardan en el navegador (IndexedDB).
  Los CVs y las entrevistas **no se suben a ningún servidor**.
- Diferencia con la versión de escritorio: en el navegador Whisper no da la confianza por palabra, así que la
  «dicción» de la claridad se reemplaza por la **continuidad** (palabras repetidas / frases reiniciadas).

## Desarrollo

```
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas de la lógica (vitest)
npm run build      # versión de producción en dist/
```

## Despliegue en Vercel

Proyecto Vite estático: *Framework preset* «Vite», *Build command* `npm run build`, *Output directory* `dist`.
No necesita variables de entorno.

## Estructura (web)

```
index.html, vite.config.ts, package.json
public/demo/                 CVs y 2 entrevistas FICTICIAS para la empresa demo
src/lib/textos.ts            lectura de PDF/DOCX/TXT y fragmentación (de talentai/textos.py)
src/lib/matchingCv.ts        Parte 1 (de talentai/matching_cv.py)
src/lib/entrevista.ts        Parte 2: métricas y puntajes (de talentai/audio.py)
src/lib/ia.worker.ts         Whisper y e5 con transformers.js, fuera del hilo de la interfaz
src/lib/almacen.ts           IndexedDB por empresa
src/vistas/                  pantallas (bienvenida, convocatorias, partes 1-3, integraciones, ajustes)
```
