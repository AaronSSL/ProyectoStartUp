"""Parte 2: análisis de la entrevista en video a partir de su audio.

1. Whisper large-v3 (faster-whisper, el modelo que ya está en la caché de la PC) transcribe el audio del video
   con la marca de tiempo de cada palabra. Usa la GPU (CUDA) si existe; si no, la CPU en int8.
2. Con la transcripción se miden:
   - Contenido: qué tanto responde a cada requisito de la convocatoria (embeddings, como en la Parte 1),
     con el fragmento y el minuto exacto que lo respaldan.
   - Fluidez: palabras por minuto mientras habla y pausas largas.
   - Claridad: confianza del reconocimiento de cada palabra (dicción) y muletillas por cada 100 palabras.
No se analizan rostro, gestos, voz como rasgo personal ni emociones: solo lo que la persona dice y cómo lo dice,
para que cada punto del puntaje se pueda explicar con evidencia.
"""
import logging
import re
import threading
from collections import Counter

import numpy as np

from .embeddings import Embedder, escala_contenido
from .proyecto import Convocatoria

log = logging.getLogger("talentai")

EXTENSIONES_VIDEO = (".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".wmv", ".mp3", ".wav", ".m4a", ".ogg", ".flac")
MODELO_WHISPER = "large-v3"
# Sin esta pista, Whisper "limpia" las muletillas y no se podrían contar.
PISTA_LITERAL = "Eh, este... bueno, o sea, mmm, la verdad es que, pues, digamos que sí."

PESOS = {"contenido": 0.6, "fluidez": 0.2, "claridad": 0.2}
PPM_IDEAL = (110, 160)
PPM_LIMITES = (60, 220)
PAUSA = 1.0          # s entre palabras para contar como pausa
PAUSA_LARGA = 3.0    # s

# Muletillas: patrones sobre el texto en minúsculas. "este", "bueno", "pues" y "tipo" solo cuentan como
# muletilla cuando van seguidos de una pausa escrita (coma o puntos suspensivos), no como palabra normal.
MULETILLAS = {
    "eh / em / mmm": r"\b(e+h+|e+m+|m{2,}|a+h+)\b",
    "este…": r"\beste\b(?=\s*(,|\.\.\.|…))",
    "o sea": r"\bo sea\b",
    "bueno…": r"\bbueno\b(?=\s*(,|\.\.\.|…))",
    "pues…": r"\bpues\b(?=\s*(,|\.\.\.|…))",
    "digamos": r"\bdigamos\b",
    "tipo…": r"\btipo\b(?=\s*(,|\.\.\.|…))",
    "¿no?": r"¿\s*no\s*\?",
    "como que": r"\bcomo que\b",
}

_modelo = None
_dispositivo = ""
_candado = threading.Lock()


def cargar_whisper():
    """Carga Whisper una sola vez por proceso (~3 GB en GPU con float16)."""
    global _modelo, _dispositivo
    with _candado:
        if _modelo is None:
            from faster_whisper import WhisperModel
            try:
                import ctranslate2
                if ctranslate2.get_cuda_device_count() < 1:
                    raise RuntimeError("sin GPU CUDA")
                _modelo = WhisperModel(MODELO_WHISPER, device="cuda", compute_type="float16", local_files_only=True)
                _dispositivo = "GPU (CUDA, float16)"
            except Exception as e:
                log.warning("Whisper en GPU no disponible (%s); se usa CPU", e)
                _modelo = WhisperModel(MODELO_WHISPER, device="cpu", compute_type="int8", local_files_only=True)
                _dispositivo = "CPU (int8)"
        return _modelo, _dispositivo


def transcribir(ruta, progreso=None, cancelado=lambda: False) -> dict:
    modelo, dispositivo = cargar_whisper()
    segmentos, info = modelo.transcribe(str(ruta), language="es", word_timestamps=True, vad_filter=True, beam_size=5,
                                        initial_prompt=PISTA_LITERAL, condition_on_previous_text=False)
    duracion = float(info.duration or 0)
    salida = []
    for s in segmentos:  # generador: Whisper avanza a medida que se recorre
        if cancelado():
            raise InterruptedError("Transcripción cancelada")
        # float(): faster-whisper devuelve tipos de numpy, que no se guardan bien en JSON
        salida.append({"inicio": round(float(s.start), 2), "fin": round(float(s.end), 2), "texto": s.text.strip(),
                       "palabras": [{"w": w.word.strip(), "ini": round(float(w.start), 2), "fin": round(float(w.end), 2),
                                     "p": round(float(w.probability), 3)} for w in (s.words or [])]})
        if progreso and duracion:
            progreso(min(99, int(100 * s.end / duracion)), f"Transcribiendo… {mmss(s.end)} de {mmss(duracion)}")
    return {"segmentos": salida, "duracion": round(duracion, 2), "idioma": info.language,
            "prob_idioma": round(float(info.language_probability or 0), 3), "dispositivo": dispositivo,
            "modelo": f"Whisper {MODELO_WHISPER}"}


def mmss(seg) -> str:
    seg = int(round(seg or 0))
    return f"{seg // 60:02d}:{seg % 60:02d}"


def _lineal(x, lo, hi):
    return float(np.clip((x - lo) / (hi - lo), 0, 1))


def puntaje_ritmo(ppm):
    a, b = PPM_IDEAL
    lo, hi = PPM_LIMITES
    if a <= ppm <= b:
        return 100.0
    return 100 * (_lineal(ppm, lo, a) if ppm < a else 1 - _lineal(ppm, b, hi))


def contar_muletillas(texto: str) -> Counter:
    t = texto.lower()
    return Counter({k: n for k, patron in MULETILLAS.items() if (n := len(re.findall(patron, t)))})


def oraciones(segmentos):
    """Oraciones de la transcripción con el tiempo exacto de su primera y última palabra."""
    out, actual = [], []
    for s in segmentos:
        palabras = s["palabras"] or [{"w": s["texto"], "ini": s["inicio"], "fin": s["fin"]}]
        for w in palabras:
            if w["w"]:
                actual.append(w)
                if re.search(r"[.?!…]$", w["w"]):
                    out.append(actual)
                    actual = []
    if actual:
        out.append(actual)
    return [{"inicio": o[0]["ini"], "fin": o[-1]["fin"], "texto": " ".join(w["w"] for w in o)} for o in out]


def lineas_subtitulo(segmentos, max_chars=70):
    """Subtítulos en líneas cortas a partir de los tiempos de cada palabra (Whisper puede dar bloques de 30 s)."""
    out, actual = [], []
    for s in segmentos:
        for w in s["palabras"] or [{"w": s["texto"], "ini": s["inicio"], "fin": s["fin"]}]:
            if not w["w"]:
                continue
            if actual and len(" ".join(x["w"] for x in actual + [w])) > max_chars:
                out.append(actual)
                actual = []
            actual.append(w)
            if re.search(r"[.?!…]$", w["w"]) or (re.search(r",$", w["w"]) and len(" ".join(x["w"] for x in actual)) > max_chars * 0.6):
                out.append(actual)
                actual = []
    if actual:
        out.append(actual)
    return [{"inicio": l[0]["ini"], "fin": l[-1]["fin"], "texto": " ".join(x["w"] for x in l)} for l in out]


def ventanas(segmentos, max_chars=300):
    """Cada oración y cada par de oraciones seguidas: la evidencia de un requisito suele ocupar una o dos.
    Ventanas más largas mezclan temas y diluyen la similitud."""
    ors = oraciones(segmentos)
    out = list(ors)
    for a, b in zip(ors, ors[1:]):
        if len(a["texto"]) + len(b["texto"]) < max_chars:
            out.append({"inicio": a["inicio"], "fin": b["fin"], "texto": f"{a['texto']} {b['texto']}"})
    return out


# "no tengo experiencia en cobranzas", "nunca he usado Excel", "sin experiencia": el texto se parece al requisito
# pero lo niega. Los embeddings no distinguen la negación, así que se marca y se reduce el puntaje.
NEGACION = re.compile(r"\b(no|nunca|jam[aá]s|sin|tampoco)\b(\s+\w+){0,3}?\s*\b(tengo|tuve|he|cuento|manejo|conozco|s[eé]|"
                      r"experiencia|conocimiento|domino|us[eé]|trabaj[eé])\b", re.I)
FACTOR_NEGACION = 0.3
UMBRAL_SUSTENTO = 50   # puntaje de contenido desde el que un requisito cuenta como sustentado


def niega(texto: str) -> bool:
    return bool(NEGACION.search(texto))


def metricas_habla(segmentos, duracion) -> dict:
    palabras = [w for s in segmentos for w in s["palabras"] if w["w"]]
    n = len(palabras)
    gaps = [b["ini"] - a["fin"] for a, b in zip(palabras, palabras[1:])]
    pausas = [g for g in gaps if g >= PAUSA]
    habla = sum(max(w["fin"] - w["ini"], 0) for w in palabras) + sum(g for g in gaps if 0 < g < PAUSA)
    texto = " ".join(s["texto"] for s in segmentos)
    tokens = re.findall(r"[a-záéíóúüñ]+", texto.lower())
    mulet = contar_muletillas(texto)
    return {
        "palabras": n, "duracion": duracion, "tiempo_habla": round(habla, 1),
        "ppm": round(n / (habla / 60), 1) if habla > 1 else 0.0,
        "pausas": len(pausas), "pausas_largas": sum(g >= PAUSA_LARGA for g in pausas),
        "pausa_max": round(max(pausas), 1) if pausas else 0.0,
        "prob_media": round(float(np.mean([w["p"] for w in palabras])), 3) if palabras else 0.0,
        "muletillas": dict(mulet), "muletillas_total": sum(mulet.values()),
        "muletillas_100": round(100 * sum(mulet.values()) / n, 2) if n else 0.0,
        "diversidad": round(len(set(tokens)) / len(tokens), 3) if tokens else 0.0,
    }


def analizar_entrevista(trans: dict, conv: Convocatoria, emb: Embedder) -> dict:
    segs = trans["segmentos"]
    m = metricas_habla(segs, trans["duracion"])
    if m["palabras"] < 5:
        raise ValueError("El audio casi no tiene voz reconocible: revise que el video tenga sonido.")

    # Contenido: mejor ventana de la transcripción para cada requisito
    vent = ventanas(segs)
    reqs = [r.texto for r in conv.requisitos]
    pesos = conv.pesos_normalizados()
    sim = emb.similitudes(reqs, [v["texto"] for v in vent]) if reqs else np.zeros((0, len(vent)))
    por_req = []
    for k, req in enumerate(reqs):
        j = int(np.argmax(sim[k]))
        puntaje = escala_contenido(sim[k, j], emb.backend)
        negado = niega(vent[j]["texto"])
        por_req.append({"requisito": req, "sim": float(sim[k, j]), "negacion": negado,
                        "puntaje": round(puntaje * (FACTOR_NEGACION if negado else 1), 1),
                        "evidencia": vent[j]["texto"], "inicio": vent[j]["inicio"], "fin": vent[j]["fin"]})
    contenido = float(sum(p["puntaje"] * w for p, w in zip(por_req, pesos))) if por_req else 0.0

    # Fluidez: ritmo dentro del rango recomendado, menos las pausas largas por minuto
    minutos = max(m["duracion"] / 60, 0.5)
    pen_pausas = min(40.0, 15.0 * m["pausas_largas"] / minutos)
    fluidez = max(0.0, puntaje_ritmo(m["ppm"]) - pen_pausas)

    # Claridad: dicción (confianza de Whisper) y muletillas
    diccion = 100 * _lineal(m["prob_media"], 0.55, 0.95)
    mulet = max(0.0, 100 - 12 * m["muletillas_100"])
    claridad = 0.5 * diccion + 0.5 * mulet

    sub = {"contenido": round(contenido, 1), "fluidez": round(fluidez, 1), "claridad": round(claridad, 1)}
    total = sum(sub[k] * w for k, w in PESOS.items())
    return {"puntaje": round(total, 1), **sub, "metricas": m, "por_requisito": por_req, "backend": emb.backend,
            "firma": conv.firma(), "observaciones": observaciones(m, por_req), "transcripcion": trans}


def observaciones(m, por_req) -> list[str]:
    obs = []
    a, b = PPM_IDEAL
    ritmo = "dentro del rango recomendado" if a <= m["ppm"] <= b else ("algo lento" if m["ppm"] < a else "algo acelerado")
    obs.append(f"Ritmo de {m['ppm']:.0f} palabras por minuto mientras habla: {ritmo} ({a}-{b}).")
    if m["pausas_largas"]:
        obs.append(f"{m['pausas_largas']} pausa(s) de más de {PAUSA_LARGA:.0f} s; la más larga, de {m['pausa_max']:.1f} s.")
    else:
        obs.append(f"Sin pausas de más de {PAUSA_LARGA:.0f} s.")
    if m["muletillas_total"]:
        detalle = ", ".join(f"«{k}» ×{n}" for k, n in sorted(m["muletillas"].items(), key=lambda x: -x[1]))
        obs.append(f"{m['muletillas_total']} muletilla(s), {m['muletillas_100']:.1f} por cada 100 palabras: {detalle}.")
    else:
        obs.append("No se detectaron muletillas.")
    obs.append(f"Dicción: el reconocimiento tuvo una confianza media de {m['prob_media'] * 100:.0f}% por palabra.")
    if por_req:
        mejor = max(por_req, key=lambda p: p["puntaje"])
        peor = min(por_req, key=lambda p: p["puntaje"])
        if mejor["puntaje"] >= UMBRAL_SUSTENTO:
            obs.append(f"Lo que mejor sustentó: «{mejor['requisito']}» (min {mmss(mejor['inicio'])}).")
        else:
            obs.append(f"Ningún requisito quedó bien sustentado en la entrevista (todos por debajo de {UMBRAL_SUSTENTO}).")
        if peor is not mejor:
            obs.append(f"Lo que menos abordó: «{peor['requisito']}»; conviene repreguntar sobre ello.")
        negados = {}
        for p in por_req:
            if p["negacion"]:
                negados.setdefault((p["evidencia"], p["inicio"]), []).append(p["requisito"])
        for (evidencia, inicio), reqs in negados.items():
            obs.append(f"Lo más cercano a {', '.join(f'«{r}»' for r in reqs)} es una negación (min {mmss(inicio)}): "
                       f"«{evidencia}». Se redujo el puntaje de contenido.")
    return obs
