"""Piezas de interfaz compartidas: segmentos de la barra superior, tarjetas, tareas en segundo plano."""
import traceback

from PySide6.QtCore import QObject, QThread, Qt, Signal
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QPushButton, QVBoxLayout

from .estilo import BORDE, COLOR_PARTE, SUAVE, color_puntaje


class Segmento(QFrame):
    """Un segmento de la barra superior: número, título, subtítulo de estado y un color propio por parte."""
    elegido = Signal(int)

    def __init__(self, numero, titulo, subtitulo):
        super().__init__()
        self.numero, self.color = numero, COLOR_PARTE[numero]
        self.setObjectName(f"segmento{numero}")
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(68)
        fila = QHBoxLayout(self)
        fila.setContentsMargins(18, 10, 18, 10)
        fila.setSpacing(12)
        self.circulo = QLabel(str(numero))
        self.circulo.setFixedSize(34, 34)
        self.circulo.setAlignment(Qt.AlignCenter)
        textos = QVBoxLayout()
        textos.setSpacing(1)
        self.titulo = QLabel(titulo)
        self.sub = QLabel(subtitulo)
        textos.addWidget(self.titulo)
        textos.addWidget(self.sub)
        fila.addWidget(self.circulo)
        fila.addLayout(textos, 1)
        self.activar(False)

    def mousePressEvent(self, _):
        self.elegido.emit(self.numero)

    def subtitulo(self, texto):
        self.sub.setText(texto)

    def activar(self, activo):
        c = self.color
        r, g, b = (int(c[i:i + 2], 16) for i in (1, 3, 5))
        fondo = f"rgba({r}, {g}, {b}, 0.07)" if activo else "white"
        self.setStyleSheet(f"#segmento{self.numero} {{ background: {fondo}; border: none; border-bottom: 4px solid "
                           f"{c if activo else 'transparent'}; border-right: 1px solid {BORDE}; }}")
        self.circulo.setStyleSheet(f"background: {c if activo else 'white'}; color: {'white' if activo else c}; "
                                   f"border: 2px solid {c}; border-radius: 17px; font-weight: 700; font-size: 11pt;")
        self.titulo.setStyleSheet(f"font-size: 11pt; font-weight: {700 if activo else 600}; "
                                  f"color: {c if activo else '#374151'}; background: transparent;")
        self.sub.setStyleSheet(f"font-size: 9pt; color: {SUAVE}; background: transparent;")


def tarjeta():
    f = QFrame()
    f.setProperty("clase", "tarjeta")
    return f


def etiqueta(texto, clase=None, wrap=False):
    lab = QLabel(texto)
    if clase:
        lab.setProperty("clase", clase)
    lab.setWordWrap(wrap)
    return lab


def boton_primario(texto, parte):
    b = QPushButton(texto)
    b.setProperty("clase", "primario")
    b.setObjectName(f"p{parte}")
    b.setCursor(Qt.PointingHandCursor)
    return b


class TarjetaPuntaje(QFrame):
    """Tarjeta con un puntaje 0-100 grande y su descripción."""

    def __init__(self, titulo, detalle, grande=False):
        super().__init__()
        self.setProperty("clase", "tarjeta")
        col = QVBoxLayout(self)
        col.setContentsMargins(14, 10, 14, 10)
        col.setSpacing(2)
        self.t = etiqueta(titulo, "ayuda")
        self.v = QLabel("—")
        self.v.setStyleSheet(f"font-size: {26 if grande else 20}pt; font-weight: 700; border: none;")
        self.d = etiqueta(detalle, "ayuda", wrap=True)
        for w in (self.t, self.v, self.d):
            col.addWidget(w)

    def poner(self, valor, detalle=None):
        self.v.setText("—" if valor is None else f"{valor:.0f}")
        self.v.setStyleSheet(self.v.styleSheet().split("color:")[0] + f"color: {color_puntaje(valor)};")
        if detalle is not None:
            self.d.setText(detalle)


class _Trabajador(QObject):
    progreso = Signal(int, str)
    listo = Signal(object)
    fallo = Signal(str)

    def __init__(self, fn, args):
        super().__init__()
        self.fn, self.args, self.cancelar = fn, args, False

    def correr(self):
        try:
            r = self.fn(*self.args, progreso=lambda p, m: self.progreso.emit(int(p), m), cancelado=lambda: self.cancelar)
            self.listo.emit(r)
        except InterruptedError as e:
            self.fallo.emit(str(e))
        except Exception as e:
            traceback.print_exc()
            self.fallo.emit(f"{type(e).__name__}: {e}")


class Tarea(QObject):
    """Ejecuta fn(*args, progreso=, cancelado=) en un hilo aparte para no congelar la ventana."""
    progreso = Signal(int, str)
    listo = Signal(object)
    fallo = Signal(str)

    def __init__(self, fn, *args, parent=None):
        super().__init__(parent)
        self.hilo = QThread()
        self.t = _Trabajador(fn, args)
        self.t.moveToThread(self.hilo)
        self.hilo.started.connect(self.t.correr)
        self.t.progreso.connect(self.progreso)
        self.t.listo.connect(self._fin_ok)
        self.t.fallo.connect(self._fin_error)

    def iniciar(self):
        self.hilo.start()

    def cancelar(self):
        self.t.cancelar = True

    def _fin_ok(self, r):
        self.hilo.quit()
        self.hilo.wait()
        self.listo.emit(r)

    def _fin_error(self, m):
        self.hilo.quit()
        self.hilo.wait()
        self.fallo.emit(m)
