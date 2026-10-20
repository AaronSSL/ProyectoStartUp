"""Lectura de CVs (PDF, Word, texto) y partición en fragmentos comparables con los requisitos."""
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

EXTENSIONES_CV = (".pdf", ".docx", ".txt", ".md")
MAX_FRAGMENTO = 320
MIN_FRAGMENTO = 12


def leer_documento(ruta) -> str:
    ruta = Path(ruta)
    ext = ruta.suffix.lower()
    if ext == ".pdf":
        import pdfplumber
        with pdfplumber.open(ruta) as pdf:
            return "\n".join(p.extract_text() or "" for p in pdf.pages)
    if ext == ".docx":
        return _leer_docx(ruta)
    if ext in (".txt", ".md"):
        for cod in ("utf-8", "cp1252", "latin-1"):
            try:
                return ruta.read_text(encoding=cod)
            except UnicodeDecodeError:
                continue
    raise ValueError(f"Formato no admitido: {ruta.suffix}")


def _leer_docx(ruta) -> str:
    """Texto de un .docx sin dependencias: cada párrafo <w:p> es una línea."""
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with zipfile.ZipFile(ruta) as z:
        raiz = ElementTree.fromstring(z.read("word/document.xml"))
    return "\n".join("".join(t.text or "" for t in p.iter(f"{ns}t")) for p in raiz.iter(f"{ns}p"))


def nombre_desde_archivo(ruta) -> str:
    base = re.sub(r"[_\-]+", " ", Path(ruta).stem)
    base = re.sub(r"\b(cv|curriculum|curr[ií]culum vitae|hoja de vida)\b", "", base, flags=re.I)
    return re.sub(r"\s+", " ", base).strip().title() or Path(ruta).stem


def fragmentar(texto: str) -> list[str]:
    """Divide el CV en fragmentos cortos (viñetas, líneas, oraciones) para encontrar la evidencia de cada requisito.
    Las líneas muy cortas (títulos de sección, fechas sueltas) se unen a la siguiente."""
    lineas = [re.sub(r"^[\s•●▪►✓✔\-*·–]+", "", l).strip() for l in re.split(r"\r?\n", texto or "")]
    lineas = [re.sub(r"\s+", " ", l) for l in lineas if l]
    fragmentos, pendiente = [], ""
    for linea in lineas:
        linea = f"{pendiente} {linea}".strip() if pendiente else linea
        if len(linea) < 40 and not re.search(r"[.;:]$", linea):
            pendiente = linea
            continue
        pendiente = ""
        fragmentos.extend(_partir_largo(linea))
    if pendiente:
        fragmentos.append(pendiente)
    vistos, salida = set(), []
    for f in fragmentos:
        clave = f.lower()
        if len(f) >= MIN_FRAGMENTO and clave not in vistos:
            vistos.add(clave)
            salida.append(f)
    return salida


def _partir_largo(texto: str) -> list[str]:
    if len(texto) <= MAX_FRAGMENTO:
        return [texto]
    partes, actual = [], ""
    for oracion in re.split(r"(?<=[.;!?])\s+", texto):
        if actual and len(actual) + len(oracion) + 1 > MAX_FRAGMENTO:
            partes.append(actual)
            actual = oracion
        else:
            actual = f"{actual} {oracion}".strip()
    if actual:
        partes.append(actual)
    # Una oración larguísima sin puntos se corta por palabras
    salida = []
    for p in partes:
        while len(p) > MAX_FRAGMENTO:
            corte = p.rfind(" ", 0, MAX_FRAGMENTO)
            corte = corte if corte > 0 else MAX_FRAGMENTO
            salida.append(p[:corte].strip())
            p = p[corte:].strip()
        if p:
            salida.append(p)
    return salida
