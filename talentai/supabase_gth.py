"""Lectura (solo lectura) del Supabase del proyecto GTH: avisos de Bumeran, postulantes y ranking e5.

TalentAI no crea tablas ni escribe en Supabase: la conexión se abre en modo read-only. Las entrevistas y las
decisiones del reclutador se guardan en la sesión local (datos/*.json).

Cadena de conexión: variable de entorno SUPABASE_DB_URL, o la línea SUPABASE_DB_URL= de .env en esta carpeta,
o la del scraper de GTH (INTERFAZ/GTH_Interfaz/scraping/.env).
"""
import json
import os
import re
from datetime import datetime
from pathlib import Path

from .proyecto import Candidato, Convocatoria, Proyecto, Requisito

RAIZ = Path(__file__).resolve().parents[1]
ENV_CANDIDATOS = [RAIZ / ".env", RAIZ.parent / "INTERFAZ" / "GTH_Interfaz" / "scraping" / ".env"]


def _url():
    if os.environ.get("SUPABASE_DB_URL"):
        return os.environ["SUPABASE_DB_URL"]
    for ruta in ENV_CANDIDATOS:
        if ruta.exists():
            for linea in ruta.read_text(encoding="utf-8").splitlines():
                if linea.strip().startswith("SUPABASE_DB_URL="):
                    return linea.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def configurado() -> bool:
    return bool(_url())


def conectar():
    import psycopg
    from psycopg.rows import dict_row
    url = _url()
    if not url:
        raise RuntimeError("No se encontró SUPABASE_DB_URL (ni en el entorno ni en .env).")
    cx = psycopg.connect(url, row_factory=dict_row, connect_timeout=20, prepare_threshold=None)
    cx.read_only = True   # garantía: ninguna sentencia de esta app puede modificar Supabase
    return cx


def _json(v):
    return json.loads(v) if isinstance(v, str) else v


def listar_avisos(cx) -> list[dict]:
    return cx.execute("""
        select a.aviso_id, a.titulo, a.publicado_el, a.ultimo_csv_at, a.ranking_at, a.criterios_version,
               (select count(*) from postulaciones p where p.aviso_id = a.aviso_id and p.en_ultimo_csv = 1) as postulantes,
               (select count(*) from ranking_embeddings r where r.aviso_id = a.aviso_id
                  and r.criterios_version = a.criterios_version) as con_score
        from avisos a
        where a.en_ultima_lista = 1 and a.ultimo_csv_at is not null
        order by a.publicado_el desc nulls last""").fetchall()


# ------------------------------------------------------------------ del CSV de Bumeran al texto del CV
def _limpiar(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def fragmentos_bumeran(datos: dict) -> list[str]:
    """Una pieza por experiencia, estudio e idiomas, igual que el módulo de matching de GTH."""
    return [texto for _, texto in fragmentos_con_clave(datos)]


def evidencia_completa(etiqueta: str, por_clave: dict) -> str:
    """El scraper guarda la evidencia como etiqueta ("Exp[1] Gestor de cobranza"); se muestra el texto completo."""
    m = re.match(r"^(Exp\[\d+\]|Est\[\d+\]|Idiomas)", etiqueta or "")
    return por_clave.get(m.group(1), etiqueta) if m else (etiqueta or "")


def fragmentos_con_clave(datos: dict) -> list[tuple[str, str]]:
    out = []
    for i in range(1, 30):
        puesto = _limpiar(datos.get(f"Exp[{i}] Puesto"))
        if not puesto:
            continue
        partes = [f"Experiencia: {puesto}."]
        area = ", ".join(x for x in (_limpiar(datos.get(f"Exp[{i}] Area")), _limpiar(datos.get(f"Exp[{i}] SubArea"))) if x)
        if area:
            partes.append(f"Área: {area}.")
        if _limpiar(datos.get(f"Exp[{i}] Industria")):
            partes.append(f"Industria: {_limpiar(datos.get(f'Exp[{i}] Industria'))}.")
        desc = _limpiar(datos.get(f"Exp[{i}] Descripción") or datos.get(f"Exp[{i}] Descripcion"))
        if desc:
            partes.append(f"Funciones: {desc}")
        out.append((f"Exp[{i}]", " ".join(partes)))
    for i in range(1, 30):
        titulo = _limpiar(datos.get(f"Est[{i}] Titulo"))
        if not titulo:
            continue
        nivel = " ".join(x for x in (_limpiar(datos.get(f"Est[{i}] Nivel")),
                                      f"({_limpiar(datos.get(f'Est[{i}] Estado'))})" if _limpiar(datos.get(f"Est[{i}] Estado")) else "") if x)
        area = _limpiar(datos.get(f"Est[{i}] Area"))
        out.append((f"Est[{i}]", f"Estudios: {titulo}." + (f" Nivel: {nivel}." if nivel else "") + (f" Área: {area}." if area else "")))
    if _limpiar(datos.get("Idiomas")):
        out.append(("Idiomas", f"Idiomas: {_limpiar(datos.get('Idiomas'))}"))
    return out


# ------------------------------------------------------------------ importar un aviso como sesión
def _criterios(aviso):
    crit = _json(aviso.get("criterios")) or []
    if crit:
        return [Requisito(c["label"], float(c.get("weightPct") or 0)) for c in crit]
    # Aviso aún sin criterios calculados por el scraper: se usa el título como único requisito (editable)
    return [Requisito(aviso.get("titulo") or "Requisitos del aviso", 100.0)]


def importar_aviso(aviso_id: str, progreso=None, cancelado=lambda: False) -> Proyecto:
    with conectar() as cx:
        if progreso:
            progreso(10, "Leyendo el aviso…")
        aviso = cx.execute("select aviso_id, titulo, criterios, criterios_version, ultimo_csv_at, ranking_at "
                           "from avisos where aviso_id = %s", (aviso_id,)).fetchone()
        if not aviso:
            raise ValueError(f"El aviso {aviso_id} no existe en Supabase")
        if progreso:
            progreso(30, "Leyendo postulantes…")
        filas = cx.execute("select clave, id_postulante, nombre, apellido, datos_json from postulaciones "
                           "where aviso_id = %s and en_ultimo_csv = 1 order by id_postulante", (aviso_id,)).fetchall()
        if cancelado():
            raise InterruptedError("Importación cancelada")
        if progreso:
            progreso(60, f"Leyendo el ranking e5 de {len(filas)} postulantes…")
        ranking = cx.execute(
            "select clave, backend, ranking, score, score_bruto, req_sims, req_sims_bruto, req_fragmentos, calculado_at "
            "from ranking_embeddings where aviso_id = %s and criterios_version = %s",
            (aviso_id, aviso["criterios_version"] or "")).fetchall()
    proyecto = armar_proyecto(aviso, filas, ranking)
    if progreso:
        progreso(100, "Listo")
    return proyecto


def armar_proyecto(aviso: dict, filas: list[dict], filas_ranking: list[dict]) -> Proyecto:
    """Convierte las filas leídas de Supabase en una sesión de TalentAI (convocatoria, candidatos y scores)."""
    aviso_id = aviso["aviso_id"]
    ranking = {r["clave"]: r for r in filas_ranking}
    conv = Convocatoria(aviso["titulo"] or f"Aviso {aviso_id}", _criterios(aviso))
    firma = conv.firma()
    candidatos = []
    for f in filas:
        piezas = fragmentos_con_clave(_json(f["datos_json"]) or {})
        frag, por_pieza = [t for _, t in piezas], dict(piezas)
        nombre = (" ".join(x for x in (_limpiar(f.get("nombre")).title(), _limpiar(f.get("apellido")).title()) if x)
                  or f.get("id_postulante") or f["clave"])
        c = Candidato(id=f["clave"], nombre=nombre, archivo_cv=f"Bumeran · {f.get('id_postulante') or f['clave']}",
                      texto_cv="\n".join(frag), fragmentos=frag)
        r = ranking.get(f["clave"])
        if r and r["score"] is not None:
            sims, brutas, evid = _json(r.get("req_sims")) or [], _json(r.get("req_sims_bruto")) or [], _json(r.get("req_fragmentos")) or []
            c.cv = {"score": float(r["score"]), "score_bruto": float(r.get("score_bruto") or r["score"]),
                    "ranking": int(r["ranking"]), "backend": r["backend"], "firma": firma, "sin_texto": not frag,
                    "fuente": "supabase", "calculado": str(r.get("calculado_at") or "")[:16],
                    "por_requisito": [{"requisito": req.texto,
                                       "sim": sims[k] if k < len(sims) else None,
                                       "sim_bruta": brutas[k] if k < len(brutas) else None,
                                       "evidencia": evidencia_completa(evid[k], por_pieza) if k < len(evid) else ""}
                                      for k, req in enumerate(conv.requisitos)]}
        candidatos.append(c)
    return Proyecto(convocatoria=conv, candidatos=candidatos,
                    origen={"tipo": "supabase", "aviso_id": aviso_id, "con_score": len(ranking),
                            "importado": datetime.now().isoformat(timespec="seconds")})


def combinar_con_local(nuevo: Proyecto, anterior: Proyecto | None) -> Proyecto:
    """Al volver a importar un aviso se conserva lo hecho en la PC: videos, entrevistas, preselección y decisiones."""
    if not anterior:
        return nuevo
    previos = {c.id: c for c in anterior.candidatos}
    for c in nuevo.candidatos:
        p = previos.get(c.id)
        if p:
            c.archivo_video, c.entrevista, c.preseleccionado = p.archivo_video, p.entrevista, p.preseleccionado
            c.decision, c.nota = p.decision, p.nota
    nuevo.peso_cv = anterior.peso_cv
    return nuevo
