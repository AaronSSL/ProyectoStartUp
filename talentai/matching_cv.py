"""Parte 1: ranking de CVs por requisito.

Para cada requisito se busca el fragmento del CV más parecido (esa es la evidencia) y el score del candidato es
el promedio ponderado de esas similitudes. Con e5 las similitudes salen muy juntas, así que el score y cada
similitud por requisito se reescalan a 0-1 dentro de la convocatoria (el mejor = 1); el orden no cambia.
"""
import numpy as np

from .embeddings import Embedder
from .proyecto import Candidato, Convocatoria


def rankear(conv: Convocatoria, candidatos: list[Candidato], emb: Embedder, progreso=None) -> dict:
    """Calcula y devuelve {candidato.id: resultado}; resultado = {score, score_bruto, ranking, backend,
    firma, por_requisito: [{requisito, sim, sim_bruta, evidencia}]}."""
    reqs = [r.texto for r in conv.requisitos]
    pesos = np.array(conv.pesos_normalizados())
    if not reqs:
        raise ValueError("La convocatoria no tiene requisitos")
    textos, dueños = [], []
    for c in candidatos:
        for f in c.fragmentos:
            textos.append(f)
            dueños.append(c.id)
    if progreso:
        progreso(10, f"Comparando {len(textos)} fragmentos de {len(candidatos)} CV ({emb.backend})…")
    sim = emb.similitudes(reqs, textos) if textos else np.zeros((len(reqs), 0))
    dueños = np.array(dueños)

    filas = {}
    for i, c in enumerate(candidatos):
        cols = np.where(dueños == c.id)[0]
        por_req = []
        for k, req in enumerate(reqs):
            if len(cols):
                j = cols[int(np.argmax(sim[k, cols]))]
                por_req.append({"requisito": req, "sim_bruta": float(sim[k, j]), "evidencia": textos[j]})
            else:
                por_req.append({"requisito": req, "sim_bruta": None, "evidencia": ""})
        brutas = np.array([p["sim_bruta"] if p["sim_bruta"] is not None else 0.0 for p in por_req])
        filas[c.id] = {"score_bruto": float(brutas @ pesos) if len(cols) else 0.0, "sin_texto": not len(cols),
                       "por_requisito": por_req}
        if progreso:
            progreso(10 + int(85 * (i + 1) / len(candidatos)), f"Puntuando {c.nombre}…")

    _reescalar(filas, len(reqs), reescalar=emb.backend == "e5")
    orden = sorted(filas, key=lambda cid: filas[cid]["score_bruto"], reverse=True)
    for pos, cid in enumerate(orden, 1):
        filas[cid].update(ranking=pos, backend=emb.backend, firma=conv.firma())
    return filas


def _min_max(valores):
    v = [x for x in valores if x is not None]
    if len(v) < 2 or max(v) - min(v) < 1e-9:
        return valores
    lo, hi = min(v), max(v)
    return [None if x is None else (x - lo) / (hi - lo) for x in valores]


def _reescalar(filas, n_reqs, reescalar):
    validos = [cid for cid, f in filas.items() if not f["sin_texto"]]
    if reescalar:
        scores = _min_max([filas[cid]["score_bruto"] for cid in validos])
        for cid, s in zip(validos, scores):
            filas[cid]["score"] = round(s, 4)
        for k in range(n_reqs):
            sims = _min_max([filas[cid]["por_requisito"][k]["sim_bruta"] for cid in validos])
            for cid, s in zip(validos, sims):
                filas[cid]["por_requisito"][k]["sim"] = None if s is None else round(s, 4)
    else:
        for cid in validos:
            filas[cid]["score"] = round(filas[cid]["score_bruto"], 4)
            for p in filas[cid]["por_requisito"]:
                p["sim"] = p["sim_bruta"]
    for cid, f in filas.items():
        if f["sin_texto"]:
            f["score"] = 0.0
            for p in f["por_requisito"]:
                p["sim"] = None
        f.setdefault("score", round(f["score_bruto"], 4))
        for p in f["por_requisito"]:
            p.setdefault("sim", p["sim_bruta"])
