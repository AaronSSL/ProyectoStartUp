"""Crea datos de ejemplo FICTICIOS en ejemplos/: CVs (txt, docx, pdf), una convocatoria y dos entrevistas
en video (voz sintética de Windows + fondo negro, con ffmpeg). Sirven para la demo y las pruebas.

    python herramientas/crear_ejemplos.py
"""
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

RAIZ = Path(__file__).resolve().parents[1]
EJ = RAIZ / "ejemplos"

CONVOCATORIA = {
    "titulo": "Analista de Cobranzas",
    "requisitos": [
        {"texto": "Experiencia mínima de 2 años en cobranzas o gestión de cartera morosa", "peso": 35},
        {"texto": "Manejo de Excel intermedio o avanzado (tablas dinámicas, BUSCARV)", "peso": 20},
        {"texto": "Formación técnica o universitaria en Administración, Contabilidad o Economía", "peso": 20},
        {"texto": "Negociación y atención al cliente por teléfono", "peso": 25},
    ],
}

CVS = {
    "Lucia_Paredes_CV.txt": """LUCÍA PAREDES QUISPE
Analista de cobranzas | Lima

EXPERIENCIA
Financiera Andina S.A. — Analista de cobranzas (2021 - actualidad)
- Gestión de una cartera morosa de 600 clientes con tramos de 30 a 120 días.
- Negociación telefónica de acuerdos de pago y refinanciamientos; recuperación del 78% de la cartera vencida.
- Reportes semanales en Excel con tablas dinámicas y BUSCARV para la jefatura.
Caja Sur — Asistente de créditos (2019 - 2021)
- Atención al cliente en ventanilla y por teléfono.

EDUCACIÓN
Bachiller en Administración de Empresas — Universidad Nacional Mayor de San Marcos

HABILIDADES
Excel avanzado, SAP FI, negociación, comunicación asertiva.
""",
    "Diego_Ramos_CV.txt": """DIEGO RAMOS TORRES
Cocinero

EXPERIENCIA
Restaurante El Puerto — Cocinero (2020 - actualidad)
- Preparación de platos de la carta y control de insumos de cocina.
- Limpieza y orden del área de producción.

EDUCACIÓN
Técnico en Gastronomía — Instituto de Cocina del Perú

HABILIDADES
Trabajo en equipo, manipulación de alimentos.
""",
}

CV_DOCX = ("Mariana_Soto_CV.docx", [
    "MARIANA SOTO VEGA", "Ejecutiva de atención al cliente",
    "EXPERIENCIA",
    "Telecom Perú — Ejecutiva de call center (2022 - actualidad): atención de reclamos y retención de clientes por teléfono.",
    "Negociación de descuentos para evitar bajas; cumplimiento de metas mensuales de retención.",
    "Uso de Excel básico para registrar llamadas.",
    "EDUCACIÓN",
    "Estudiante de Contabilidad (7.º ciclo) — Universidad Privada del Norte",
])

CV_PDF = ("Jorge_Huaman_CV.pdf", [
    "JORGE HUAMÁN LIMA", "Asistente contable",
    "EXPERIENCIA",
    "Estudio Contable Ríos — Asistente contable (2020 - actualidad)",
    "- Cuentas por cobrar: seguimiento de facturas vencidas y llamadas de cobranza a clientes.",
    "- Conciliaciones bancarias en Excel con tablas dinámicas.",
    "EDUCACIÓN",
    "Contador Público — Universidad de Lima",
])

ENTREVISTAS = {
    "Lucia_Paredes_entrevista.mp4": (
        "Buenos días. Mi nombre es Lucía Paredes. Trabajo hace más de tres años en cobranzas, en Financiera Andina. "
        "Manejo una cartera morosa de unos seiscientos clientes, de treinta a ciento veinte días de atraso. "
        "Lo que más hago es negociar por teléfono acuerdos de pago y refinanciamientos, siempre con un trato cordial, "
        "porque el cliente tiene que sentir que buscamos una solución. "
        "Todas las semanas preparo reportes en Excel, con tablas dinámicas y buscarv, para medir la recuperación. "
        "Soy bachiller en Administración de Empresas. El año pasado recuperamos el setenta y ocho por ciento de la cartera vencida."),
    "Diego_Ramos_entrevista.mp4": (
        "Eh, este... bueno, mi nombre es Diego. Este... yo trabajo en un restaurante, o sea, en la cocina. "
        "Eh... preparo los platos y, este, ordeno los insumos. Digamos que... o sea, me gusta trabajar en equipo, ¿no? "
        "Bueno... de cobranzas, eh, no tengo experiencia, pero, este... puedo aprender."),
}


def escribir_docx(ruta, parrafos):
    cuerpo = "".join(f"<w:p><w:r><w:t xml:space=\"preserve\">{escape(p)}</w:t></w:r></w:p>" for p in parrafos)
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
           f"<w:body>{cuerpo}</w:body></w:document>")
    tipos = ('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="xml" ContentType="application/xml"/>'
             '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    with zipfile.ZipFile(ruta, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", tipos)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", doc)


def escribir_pdf(ruta, lineas):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(8.27, 11.69))
    for i, linea in enumerate(lineas):
        fig.text(0.08, 0.94 - i * 0.03, linea, fontsize=11 if i else 15, weight="bold" if i == 0 else "normal")
    fig.savefig(ruta)
    plt.close(fig)


def cuadro_video(nombre, png):
    """Cuadro fijo del video de ejemplo: silueta neutra y rótulo, para que se note que es una entrevista ficticia."""
    from PIL import Image, ImageDraw, ImageFont
    w, h = 1280, 720
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):   # degradado vertical suave
        t = y / h
        d.line([(0, y), (w, y)], fill=(int(30 + 12 * t), int(41 + 14 * t), int(59 + 20 * t)))
    d.rectangle([0, int(h * 0.78), w, h], fill=(38, 50, 70))   # mesa
    cx = w // 2
    d.ellipse([cx - 230, 330, cx + 230, 760], fill=(71, 85, 105))   # hombros
    d.ellipse([cx - 95, 150, cx + 95, 350], fill=(100, 116, 139))   # cabeza
    try:
        f1, f2 = ImageFont.truetype("segoeuib.ttf", 34), ImageFont.truetype("segoeui.ttf", 24)
    except OSError:
        f1 = f2 = ImageFont.load_default()
    d.rounded_rectangle([36, h - 118, 640, h - 34], radius=10, fill=(17, 24, 39))
    d.text((58, h - 110), nombre, font=f1, fill=(249, 250, 251))
    d.text((58, h - 68), "Entrevista de ejemplo · voz sintética", font=f2, fill=(156, 163, 175))
    img.save(png)


def voz_a_wav(texto, wav):
    """Voz sintética en español con System.Speech de Windows (Microsoft Helena)."""
    ps = ("Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
          "$v = $s.GetInstalledVoices() | ? { $_.VoiceInfo.Culture.Name -like 'es*' } | select -First 1; "
          "if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.Rate = 0; "
          f"$s.SetOutputToWaveFile('{wav}'); $s.Speak([IO.File]::ReadAllText('{wav}.txt')); $s.Dispose()")
    Path(f"{wav}.txt").write_text(texto, encoding="utf-8")
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)


def main():
    EJ.mkdir(exist_ok=True)
    (EJ / "cvs").mkdir(exist_ok=True)
    (EJ / "entrevistas").mkdir(exist_ok=True)
    (EJ / "convocatoria_analista_cobranzas.json").write_text(json.dumps(CONVOCATORIA, ensure_ascii=False, indent=2), encoding="utf-8")
    for nombre, texto in CVS.items():
        (EJ / "cvs" / nombre).write_text(texto, encoding="utf-8")
    escribir_docx(EJ / "cvs" / CV_DOCX[0], CV_DOCX[1])
    escribir_pdf(EJ / "cvs" / CV_PDF[0], CV_PDF[1])
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("Sin ffmpeg: no se crean los videos de ejemplo")
        return
    with tempfile.TemporaryDirectory() as tmp:
        for nombre, texto in ENTREVISTAS.items():
            wav = str(Path(tmp) / (Path(nombre).stem + ".wav"))
            voz_a_wav(texto, wav)
            png = str(Path(tmp) / (Path(nombre).stem + ".png"))
            cuadro_video(Path(nombre).stem.replace("_entrevista", "").replace("_", " ").replace("Lucia", "Lucía"), png)
            subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-loop", "1", "-framerate", "15", "-i", png,
                            "-i", wav, "-shortest", "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-b:a", "96k", str(EJ / "entrevistas" / nombre)], check=True)
    print("Ejemplos creados en", EJ)


if __name__ == "__main__":
    sys.exit(main())
