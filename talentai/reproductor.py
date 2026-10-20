"""Reproductor de la entrevista con subtítulos de la transcripción y salto a un minuto exacto."""
from pathlib import Path

from PySide6.QtCore import Qt, QUrl
from PySide6.QtWidgets import QHBoxLayout, QLabel, QPushButton, QSlider, QStyle, QVBoxLayout, QWidget

from .audio import lineas_subtitulo

try:
    from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
    from PySide6.QtMultimediaWidgets import QVideoWidget
    DISPONIBLE = True
except ImportError:   # PySide6 sin el módulo multimedia (p. ej. el de anaconda): queda «Abrir video»
    DISPONIBLE = False


def _mmss(ms):
    s = max(0, int(ms // 1000))
    return f"{s // 60:02d}:{s % 60:02d}"


class Reproductor(QWidget):
    def __init__(self):
        super().__init__()
        self.segmentos = []
        col = QVBoxLayout(self)
        col.setContentsMargins(0, 0, 0, 0)
        col.setSpacing(6)
        if not DISPONIBLE:
            aviso = QLabel("El reproductor integrado no está disponible en este Python.\nUse «Abrir video».")
            aviso.setAlignment(Qt.AlignCenter)
            aviso.setStyleSheet("background: #111827; color: #9ca3af; border-radius: 10px;")
            aviso.setMinimumHeight(240)
            col.addWidget(aviso, 1)
            return

        self.video = QVideoWidget()
        self.video.setMinimumSize(360, 220)
        self.video.setStyleSheet("background: #111827;")
        self.player = QMediaPlayer(self)
        self.audio = QAudioOutput(self)
        self.player.setAudioOutput(self.audio)
        self.player.setVideoOutput(self.video)
        col.addWidget(self.video, 1)

        self.subtitulo = QLabel("")
        self.subtitulo.setWordWrap(True)
        self.subtitulo.setAlignment(Qt.AlignCenter)
        self.subtitulo.setMinimumHeight(46)
        self.subtitulo.setStyleSheet("background: #111827; color: #f9fafb; border-radius: 8px; padding: 6px 10px; "
                                     "font-size: 10.5pt;")
        col.addWidget(self.subtitulo)

        fila = QHBoxLayout()
        self.boton = QPushButton()
        self.boton.setIcon(self.style().standardIcon(QStyle.SP_MediaPlay))
        self.boton.setFixedWidth(42)
        self.boton.clicked.connect(self.alternar)
        self.actual = QLabel("00:00")
        self.barra = QSlider(Qt.Horizontal)
        self.barra.sliderMoved.connect(self.player.setPosition)
        self.total = QLabel("00:00")
        for w in (self.actual, self.total):
            w.setStyleSheet("color: #6b7280; font-size: 9pt;")
        fila.addWidget(self.boton)
        fila.addWidget(self.actual)
        fila.addWidget(self.barra, 1)
        fila.addWidget(self.total)
        col.addLayout(fila)

        self.player.durationChanged.connect(lambda d: (self.barra.setRange(0, d), self.total.setText(_mmss(d))))
        self.player.positionChanged.connect(self._posicion)
        self.player.playbackStateChanged.connect(self._estado)

    @property
    def disponible(self):
        return DISPONIBLE

    def cargar(self, ruta, segmentos=None):
        self.segmentos = lineas_subtitulo(segmentos or [])
        if not DISPONIBLE:
            return
        self.player.stop()
        if ruta and Path(ruta).exists():
            self.player.setSource(QUrl.fromLocalFile(str(ruta)))
            self.subtitulo.setText("" if self.segmentos else "Transcriba el video para ver los subtítulos.")
        else:
            self.player.setSource(QUrl())
            self.subtitulo.setText("Sin video asignado")
            self.barra.setRange(0, 0)
            self.actual.setText("00:00")
            self.total.setText("00:00")

    def poner_segmentos(self, segmentos):
        self.segmentos = lineas_subtitulo(segmentos or [])
        if DISPONIBLE:
            self._posicion(self.player.position())

    def ir_a(self, segundos):
        if DISPONIBLE and not self.player.source().isEmpty():
            self.player.setPosition(int(segundos * 1000))
            self.player.play()

    def alternar(self):
        if not DISPONIBLE:
            return
        if self.player.playbackState() == QMediaPlayer.PlayingState:
            self.player.pause()
        else:
            self.player.play()

    def pausar(self):
        if DISPONIBLE and self.player.playbackState() == QMediaPlayer.PlayingState:
            self.player.pause()

    def detener(self):
        if DISPONIBLE:
            self.player.stop()
            self.player.setSource(QUrl())

    def _estado(self, estado):
        icono = QStyle.SP_MediaPause if estado == QMediaPlayer.PlayingState else QStyle.SP_MediaPlay
        self.boton.setIcon(self.style().standardIcon(icono))

    def _posicion(self, ms):
        if not self.barra.isSliderDown():
            self.barra.setValue(ms)
        self.actual.setText(_mmss(ms))
        if self.segmentos:
            t = ms / 1000
            seg = next((s for s in self.segmentos if s["inicio"] - 0.15 <= t <= s["fin"] + 0.6), None)
            self.subtitulo.setText(seg["texto"] if seg else "")
