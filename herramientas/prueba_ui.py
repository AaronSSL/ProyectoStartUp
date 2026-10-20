"""Prueba de humo de la interfaz sin pantalla: recorre las tres partes con el ejemplo y guarda capturas.

    python herramientas/prueba_ui.py CARPETA_CAPTURAS
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import talentai  # noqa: F401,E402
from PySide6.QtCore import QTimer  # noqa: E402
from PySide6.QtGui import QFont  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

from talentai import ventana as mod_ventana  # noqa: E402
from talentai.estilo import QSS  # noqa: E402

salida = Path(sys.argv[1] if len(sys.argv) > 1 else "capturas")
salida.mkdir(parents=True, exist_ok=True)
mod_ventana.SESION = salida / "sesion_prueba.json"   # no toca la sesión real del usuario
if mod_ventana.SESION.exists():
    mod_ventana.SESION.unlink()

app = QApplication(sys.argv)
app.setFont(QFont("Segoe UI", 10))
app.setStyleSheet(QSS)
v = mod_ventana.Ventana()
v.resize(1360, 860)
v.show()
pasos = []


def captura(nombre):
    app.processEvents()
    v.grab().save(str(salida / f"{nombre}.png"))
    print("captura", nombre, flush=True)


def fallar(m):
    print("ERROR", m, flush=True)
    app.exit(1)


def paso1():
    v.p1.cargar_ejemplo()
    v.p1.tarea = None
    v.p1._analizar()
    v.p1.tarea.listo.connect(lambda _: QTimer.singleShot(300, paso2))
    v.p1.tarea.fallo.connect(fallar)


def paso2():
    p = v.proyecto
    print("ranking:", [(c.nombre, c.cv["ranking"], round(c.cv["score"] * 100)) for c in sorted(p.candidatos, key=lambda c: c.cv["ranking"])], flush=True)
    for c in p.candidatos:
        c.preseleccionado = c.cv["ranking"] <= 3 or bool(c.archivo_video)
    v.p1.refrescar()
    v.p1.tabla.selectRow(0)
    captura("1_analisis_cv")
    v.ir(2)
    pend = [c for c in p.candidatos if c.archivo_video]
    analizar_siguiente(pend)


def analizar_siguiente(pend):
    if not pend:
        return QTimer.singleShot(300, paso3)
    c = pend.pop(0)
    for i in range(v.p2.lista.count()):
        if v.p2.lista.item(i).data(0x0100) == c.id:
            v.p2.lista.setCurrentRow(i)
    v.p2._analizar()
    v.p2.tarea.listo.connect(lambda r, c=c: (print("entrevista", c.nombre, r["puntaje"], r["contenido"], r["fluidez"], r["claridad"], flush=True),
                                             QTimer.singleShot(300, lambda: analizar_siguiente(pend))))
    v.p2.tarea.fallo.connect(fallar)


def paso3():
    lucia = next(i for i in range(v.p2.lista.count()) if "Lucia" in v.p2.lista.item(i).text())
    v.p2.lista.setCurrentRow(lucia)
    captura("2_entrevista_evidencia")
    v.p2.pestanas.setCurrentIndex(3)
    captura("2_entrevista_transcripcion")
    diego = next(i for i in range(v.p2.lista.count()) if "Diego" in v.p2.lista.item(i).text())
    v.p2.lista.setCurrentRow(diego)
    v.p2.pestanas.setCurrentIndex(1)
    captura("2_entrevista_observaciones_diego")
    v.ir(3)
    v.p3.slider.setValue(40)
    captura("3_resultado")
    df = v.p3._tabla_exportable()
    print(df[["Puesto", "Candidato", "Score CV", "Entrevista", "Puntaje final", "Base"]].to_string(), flush=True)
    v.guardar()
    print("sesion guardada", mod_ventana.SESION.stat().st_size, "bytes", flush=True)
    v.close()
    app.exit(0)


QTimer.singleShot(500, paso1)
sys.exit(app.exec())
