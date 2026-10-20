"""Datos de la sesión de trabajo (convocatoria, candidatos y resultados) y su guardado local en JSON."""
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

DECISIONES = ["Pendiente", "Avanza", "En espera", "Descartado"]


@dataclass
class Requisito:
    texto: str
    peso: float


@dataclass
class Convocatoria:
    titulo: str = ""
    requisitos: list[Requisito] = field(default_factory=list)

    def pesos_normalizados(self):
        total = sum(max(r.peso, 0) for r in self.requisitos)
        return [max(r.peso, 0) / total if total else 1 / max(len(self.requisitos), 1) for r in self.requisitos]

    def firma(self) -> str:
        """Cambia si cambian los requisitos o los pesos: los resultados anteriores quedan desactualizados."""
        return "|".join(f"{r.texto.strip()}:{r.peso:g}" for r in self.requisitos)


@dataclass
class Candidato:
    id: str
    nombre: str
    archivo_cv: str
    texto_cv: str = ""
    fragmentos: list[str] = field(default_factory=list)
    cv: dict | None = None            # resultado de la Parte 1 (ver matching_cv.rankear)
    archivo_video: str = ""
    entrevista: dict | None = None    # resultado de la Parte 2 (ver audio.analizar_entrevista)
    preseleccionado: bool = False
    decision: str = "Pendiente"
    nota: str = ""

    @staticmethod
    def nuevo(nombre, archivo_cv, texto, fragmentos):
        return Candidato(id=uuid.uuid4().hex[:8], nombre=nombre, archivo_cv=str(archivo_cv), texto_cv=texto,
                         fragmentos=fragmentos)


@dataclass
class Proyecto:
    convocatoria: Convocatoria = field(default_factory=Convocatoria)
    candidatos: list[Candidato] = field(default_factory=list)
    peso_cv: int = 50                 # % del CV en el puntaje final; el resto es la entrevista
    top_n: int = 5                    # cuántos de los primeros del ranking se invitan a entrevista
    actualizado: str = ""
    origen: dict | None = None        # {"tipo": "supabase", "aviso_id": ...} si vino de un aviso de Bumeran

    def candidato(self, cid):
        return next((c for c in self.candidatos if c.id == cid), None)

    def guardar(self, ruta):
        self.actualizado = datetime.now().isoformat(timespec="seconds")
        ruta = Path(ruta)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        tmp = ruta.with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(self), ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(ruta)   # escritura atómica: un corte de luz no deja el archivo a medias

    @staticmethod
    def cargar(ruta):
        datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
        conv = datos.get("convocatoria") or {}
        return Proyecto(
            convocatoria=Convocatoria(conv.get("titulo", ""), [Requisito(**r) for r in conv.get("requisitos", [])]),
            candidatos=[Candidato(**c) for c in datos.get("candidatos", [])],
            peso_cv=datos.get("peso_cv", 50), top_n=datos.get("top_n", 5), actualizado=datos.get("actualizado", ""), origen=datos.get("origen"))


def puntaje_final(c: Candidato, peso_cv: int):
    """Promedio ponderado CV/entrevista en 0-100. Si falta una parte, se usa la que exista (y se indica)."""
    cv = c.cv["score"] * 100 if c.cv else None
    ent = c.entrevista["puntaje"] if c.entrevista else None
    if cv is not None and ent is not None:
        return cv * peso_cv / 100 + ent * (100 - peso_cv) / 100, "completo"
    if cv is not None:
        return cv, "solo CV"
    if ent is not None:
        return ent, "solo entrevista"
    return None, "sin datos"
