"""TalentAI — aplicación de escritorio para la selección de personal.

Parte 1: ranking de CVs contra los requisitos de la convocatoria (embeddings e5, con tfidf de respaldo).
Parte 2: análisis de la entrevista en video a partir de su audio (transcripción con Whisper).
Parte 3: resultado consolidado; la decisión final siempre la toma el reclutador.
"""
import os

# torch y ctranslate2 (Whisper) traen cada uno su runtime de OpenMP; sin esto el proceso aborta al cargar ambos.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
# Los modelos se usan solo desde la caché local: la app nunca descarga nada ni envía datos fuera de la PC.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
# El reproductor decodifica el video por CPU: la GPU queda para Whisper. Si Qt intenta usar Direct3D con la GPU
# ocupada, la creación del dispositivo falla por falta de memoria y el reproductor se cae al pausar.
os.environ.setdefault("QT_FFMPEG_DECODING_HW_DEVICE_TYPES", ",")

__version__ = "1.0.0"
