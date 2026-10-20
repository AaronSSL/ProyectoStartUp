"""Ventana principal: cabecera, barra de segmentos (Parte 1 · 2 · 3) y el contenido de cada parte."""
from pathlib import Path

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (QFileDialog, QFrame, QHBoxLayout, QLabel, QMainWindow, QMessageBox, QPushButton,
                               QStackedWidget, QVBoxLayout, QWidget)

from .pagina_cv import RAIZ, PaginaCV
from .pagina_entrevista import PaginaEntrevista
from .pagina_resultado import PaginaResultado
from .proyecto import Proyecto
from .ui_comun import Segmento

SESION = RAIZ / "datos" / "sesion.json"


class Ventana(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("TalentAI · Selección explicable")
        self.resize(1360, 860)
        self.ruta_sesion = SESION
        self.proyecto = self._abrir_inicial()

        raiz = QWidget()
        raiz.setObjectName("raiz")
        col = QVBoxLayout(raiz)
        col.setContentsMargins(0, 0, 0, 0)
        col.setSpacing(0)
        col.addWidget(self._cabecera())
        col.addWidget(self._barra_segmentos())

        self.p1, self.p2, self.p3 = PaginaCV(self), PaginaEntrevista(self), PaginaResultado(self)
        self.pila = QStackedWidget()
        for p in (self.p1, self.p2, self.p3):
            self.pila.addWidget(p)
            p.cambio.connect(self._cambio)
        self.p1.ir_entrevista.connect(lambda: self.ir(2))
        self.p2.ir_resultado.connect(lambda: self.ir(3))
        col.addWidget(self.pila, 1)
        self.setCentralWidget(raiz)

        # Guardado automático (con una pequeña espera para no escribir en cada tecla)
        self._guardar = QTimer(self, singleShot=True, interval=800)
        self._guardar.timeout.connect(self.guardar)
        self.p1.refrescar()
        self.ir(1)
        self._resumen()

    # ------------------------------------------------------------------ cabecera y segmentos
    def _cabecera(self):
        f = QFrame()
        f.setObjectName("cabecera")
        fila = QHBoxLayout(f)
        fila.setContentsMargins(20, 10, 20, 10)
        marca = QVBoxLayout()
        marca.setSpacing(0)
        t = QLabel("TalentAI")
        t.setObjectName("marca")
        s = QLabel("Selección de personal explicable · versión de escritorio")
        s.setObjectName("marcaSub")
        marca.addWidget(t)
        marca.addWidget(s)
        fila.addLayout(marca)
        fila.addStretch()
        self.info = QLabel()
        self.info.setObjectName("cabeceraInfo")
        fila.addWidget(self.info)
        fila.addSpacing(16)
        for texto, fn in (("Nueva sesión", self.nueva_sesion), ("Abrir…", self.abrir), ("Guardar como…", self.guardar_como)):
            b = QPushButton(texto)
            b.setObjectName("cabeceraBtn")
            b.setCursor(Qt.PointingHandCursor)
            b.clicked.connect(lambda _=False, fn=fn: fn())
            fila.addWidget(b)
        return f

    def _barra_segmentos(self):
        f = QFrame()
        f.setObjectName("barraSegmentos")
        fila = QHBoxLayout(f)
        fila.setContentsMargins(0, 0, 0, 0)
        fila.setSpacing(0)
        self.segmentos = {
            1: Segmento(1, "Análisis de CV", "Ranking por requisitos"),
            2: Segmento(2, "Análisis de entrevista (video)", "Audio transcrito con Whisper"),
            3: Segmento(3, "Resultado final", "CV + entrevista · decide el reclutador"),
        }
        for n, s in self.segmentos.items():
            s.elegido.connect(self.ir)
            fila.addWidget(s, 1)
        return f

    def ir(self, n):
        if n != 2:
            self.p2.reproductor.pausar()
        for k, s in self.segmentos.items():
            s.activar(k == n)
        pagina = {1: self.p1, 2: self.p2, 3: self.p3}[n]
        if n in (2, 3):
            pagina.refrescar()
        self.pila.setCurrentWidget(pagina)

    def _resumen(self):
        p = self.proyecto
        n = len(p.candidatos)
        firma = p.convocatoria.firma()
        cv = sum(1 for c in p.candidatos if c.cv and c.cv.get("firma") == firma)
        pre = [c for c in p.candidatos if c.preseleccionado]
        ent = sum(1 for c in p.candidatos if c.entrevista)
        dec = sum(1 for c in p.candidatos if c.decision != "Pendiente")
        self.segmentos[1].subtitulo(f"{n} CV · {cv} analizados" if n else "Ranking por requisitos")
        self.segmentos[2].subtitulo(f"{len(pre)} preseleccionados · {ent} entrevistas analizadas" if n
                                    else "Audio transcrito con Whisper")
        self.segmentos[3].subtitulo(f"{dec} de {n} con decisión registrada" if n else "CV + entrevista · decide el reclutador")
        titulo = p.convocatoria.titulo or "Convocatoria sin título"
        fuente = f"Supabase · aviso {p.origen['aviso_id']}" if p.origen else Path(self.ruta_sesion).name
        self.info.setText(f"{titulo}   ·   {fuente}")

    def _cambio(self):
        self._resumen()
        self._guardar.start()

    # ------------------------------------------------------------------ sesiones
    def _abrir_inicial(self):
        if SESION.exists():
            try:
                return Proyecto.cargar(SESION)
            except Exception:
                SESION.rename(SESION.with_suffix(".danado.json"))   # se conserva para revisarlo
        return Proyecto()

    def guardar(self):
        try:
            self.proyecto.guardar(self.ruta_sesion)
        except Exception as e:
            QMessageBox.warning(self, "No se pudo guardar", str(e))

    def nueva_sesion(self, preguntar=True):
        if preguntar and self.proyecto.candidatos and QMessageBox.question(
                self, "Nueva sesión", "¿Empezar una sesión vacía? La actual queda guardada en su archivo.") != QMessageBox.Yes:
            return
        self.guardar()
        self.proyecto = Proyecto()
        self.ruta_sesion = SESION
        self.p1.refrescar()
        self.ir(1)
        self._cambio()

    def abrir_aviso(self, proyecto):
        """Sesión de un aviso de Supabase. Cada aviso tiene su archivo local (datos/aviso_<id>.json), donde se
        conservan las entrevistas y decisiones aunque se vuelva a importar."""
        from .supabase_gth import combinar_con_local
        self.guardar()
        ruta = SESION.parent / f"aviso_{proyecto.origen['aviso_id']}.json"
        anterior = None
        if ruta.exists():
            try:
                anterior = Proyecto.cargar(ruta)
            except Exception:
                anterior = None
        self.proyecto = combinar_con_local(proyecto, anterior)
        self.ruta_sesion = ruta
        self.p1.refrescar()
        self.ir(1)
        self._cambio()

    def abrir(self):
        ruta, _ = QFileDialog.getOpenFileName(self, "Abrir sesión", str(SESION.parent), "Sesión TalentAI (*.json)")
        if not ruta:
            return
        try:
            self.proyecto = Proyecto.cargar(ruta)
        except Exception as e:
            QMessageBox.critical(self, "No se pudo abrir", str(e))
            return
        self.ruta_sesion = Path(ruta)
        self.p1.refrescar()
        self.ir(1)
        self._resumen()

    def guardar_como(self):
        ruta, _ = QFileDialog.getSaveFileName(self, "Guardar sesión", str(SESION.parent / "sesion.json"),
                                              "Sesión TalentAI (*.json)")
        if ruta:
            self.ruta_sesion = Path(ruta)
            self.guardar()
            self._resumen()

    def closeEvent(self, ev):
        self.p2.reproductor.detener()
        self.p2.detener()
        if self.p1.tarea and self.p1.tarea.hilo.isRunning():
            self.p1.tarea.hilo.wait(10000)
        self.guardar()
        ev.accept()
