"""Similitud semántica entre requisitos y fragmentos de texto.

Backend preferido: intfloat/multilingual-e5-base (sentence-transformers), solo si está en la caché local.
Respaldo: TF-IDF de caracteres, que no necesita ningún modelo. Mismo enfoque que el módulo de matching de GTH.
"""
import logging
import threading

import numpy as np

log = logging.getLogger("talentai")
MODELO_E5 = "intfloat/multilingual-e5-base"


class Embedder:
    def __init__(self, preferido="e5"):
        self.backend = "tfidf"
        self._modelo = None
        if preferido == "e5":
            try:
                from sentence_transformers import SentenceTransformer
                self._modelo = SentenceTransformer(MODELO_E5, device="cpu", local_files_only=True)
                self.backend = "e5"
            except Exception as e:  # sin librería o sin modelo en caché
                log.warning("e5 no disponible (%s); se usa tfidf", e)

    def similitudes(self, consultas: list[str], textos: list[str]) -> np.ndarray:
        """Matriz [len(consultas) x len(textos)] de similitud coseno."""
        if not consultas or not textos:
            return np.zeros((len(consultas), len(textos)))
        if self.backend == "e5":
            q = self._modelo.encode([f"query: {c}" for c in consultas], normalize_embeddings=True, batch_size=32)
            t = self._modelo.encode([f"passage: {x}" for x in textos], normalize_embeddings=True, batch_size=32)
            return np.clip(q @ t.T, -1, 1)
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), lowercase=True, strip_accents="unicode",
                              sublinear_tf=True)
        m = vec.fit_transform(list(consultas) + list(textos))
        return cosine_similarity(m[: len(consultas)], m[len(consultas):])


_compartido = None
_candado = threading.Lock()


def embedder_compartido() -> Embedder:
    """Una sola instancia por proceso: cargar e5 tarda ~20 s y ocupa ~1 GB de RAM."""
    global _compartido
    with _candado:
        if _compartido is None:
            _compartido = Embedder("e5")
        return _compartido


def escala_contenido(sim: float, backend: str) -> float:
    """Lleva una similitud a 0-100 con umbrales por backend: e5 da similitudes comprimidas (~0.75-0.90)
    y tfidf muy bajas (~0-0.4). Se usa donde no hay un grupo con el cual reescalar (una sola entrevista)."""
    lo, hi = (0.78, 0.88) if backend == "e5" else (0.03, 0.30)
    return float(np.clip((sim - lo) / (hi - lo), 0, 1) * 100)
