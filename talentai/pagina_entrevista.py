"""Parte 2 · Análisis de la entrevista en video (a partir de su audio, con Whisper)."""
import html
import os
import re
from pathlib import Path

from PySide6.QtCore import QSize, Qt, Signal
from PySide6.QtWidgets import (QFileDialog, QGridLayout, QHBoxLayout, QLabel, QListWidget, QListWidgetItem,
                               QMessageBox, QProgressBar, QPushButton, QSplitter, QTabWidget, QTextBrowser,
                               QVBoxLayout, QWidget)

from . import audio
from .embeddings import embedder_compartido
from .estilo import COLOR_PARTE, SUAVE, color_puntaje
from .pagina_cv import RAIZ, barra_html
from .reproductor import Reproductor
from .ui_comun import Tarea, TarjetaPuntaje, boton_primario, etiqueta, tarjeta

AVISO = ("Se analiza solo el audio: lo que la persona dice y cómo lo dice. No se evalúan rostro, gestos, apariencia "
         "ni emociones, y todo se procesa en esta PC. El resultado es una ayuda: la decisión es del reclutador.")


class PaginaEntrevista(QWidget):
    cambio = Signal()
    ir_resultado = Signal()

    def __init__(self, ventana):
        super().__init__()
        self.v = ventana
        self.tarea = None
        self.actual = None
        div = QSplitter(Qt.Horizontal)
        div.setChildrenCollapsible(False)
        div.addWidget(self._panel_izquierdo())
        div.addWidget(self._panel_derecho())
        div.setSizes([270, 1050])
        col = QVBoxLayout(self)
        col.setContentsMargins(16, 14, 16, 14)
        col.addWidget(div)

    @property
    def proyecto(self):
        return self.v.proyecto

    # ------------------------------------------------------------------ construcción
    def _panel_izquierdo(self):
        panel = QWidget()
        col = QVBoxLayout(panel)
        col.setContentsMargins(0, 0, 8, 0)
        col.setSpacing(10)
        t = tarjeta()
        c = QVBoxLayout(t)
        c.addWidget(etiqueta("Candidatos", "titulo"))
        c.addWidget(etiqueta("★ = preseleccionado en la Parte 1. Se puede analizar a cualquiera.", "ayuda", wrap=True))
        self.lista = QListWidget()
        self.lista.setTextElideMode(Qt.ElideNone)
        self.lista.setUniformItemSizes(False)
        self.lista.currentItemChanged.connect(lambda *_: self._elegir())
        c.addWidget(self.lista, 1)
        self.asignar = QPushButton("Asignar video de la entrevista…")
        self.asignar.clicked.connect(self._asignar_video)
        c.addWidget(self.asignar)
        col.addWidget(t, 1)

        self.analizar = boton_primario("Transcribir y analizar", 2)
        self.analizar.clicked.connect(self._analizar)
        self.cancelar = QPushButton("Cancelar")
        self.cancelar.setVisible(False)
        self.cancelar.clicked.connect(lambda: self.tarea and self.tarea.cancelar())
        self.progreso = QProgressBar()
        self.progreso.setVisible(False)
        self.estado = etiqueta("", "ayuda", wrap=True)
        aviso = QLabel(AVISO)
        aviso.setObjectName("aviso")
        aviso.setWordWrap(True)
        fila = QHBoxLayout()
        fila.addWidget(self.analizar, 1)
        fila.addWidget(self.cancelar)
        col.addLayout(fila)
        col.addWidget(self.progreso)
        col.addWidget(self.estado)
        col.addWidget(aviso)
        return panel

    def _panel_derecho(self):
        panel = QWidget()
        col = QVBoxLayout(panel)
        col.setContentsMargins(8, 0, 0, 0)
        col.setSpacing(10)
        cab = QHBoxLayout()
        self.nombre = QLabel("Elija un candidato")
        self.nombre.setStyleSheet("font-size: 15pt; font-weight: 700;")
        self.video = etiqueta("", "ayuda")
        textos = QVBoxLayout()
        textos.setSpacing(0)
        textos.addWidget(self.nombre)
        textos.addWidget(self.video)
        cab.addLayout(textos, 1)
        self.abrir = QPushButton("Abrir en otro reproductor")
        self.abrir.clicked.connect(self._abrir_video)
        cab.addWidget(self.abrir)
        col.addLayout(cab)

        # Video a la izquierda y el análisis al costado
        cuerpo = QSplitter(Qt.Horizontal)
        cuerpo.setChildrenCollapsible(False)
        self.reproductor = Reproductor()
        cuerpo.addWidget(self.reproductor)

        analisis = QWidget()
        ca = QVBoxLayout(analisis)
        ca.setContentsMargins(8, 0, 0, 0)
        ca.setSpacing(10)
        grid = QGridLayout()
        grid.setSpacing(8)
        pesos = audio.PESOS
        self.t_total = TarjetaPuntaje("Puntaje de la entrevista", "0-100", grande=True)
        self.t_cont = TarjetaPuntaje(f"Contenido · {pesos['contenido']:.0%}", "Responde a los requisitos")
        self.t_flu = TarjetaPuntaje(f"Fluidez · {pesos['fluidez']:.0%}", "Ritmo y pausas")
        self.t_cla = TarjetaPuntaje(f"Claridad · {pesos['claridad']:.0%}", "Dicción y muletillas")
        grid.addWidget(self.t_total, 0, 0, 1, 3)
        for i, w in enumerate((self.t_cont, self.t_flu, self.t_cla)):
            grid.addWidget(w, 1, i)
        ca.addLayout(grid)

        self.pestanas = QTabWidget()
        self.evidencia = QTextBrowser()
        self.metricas = QTextBrowser()
        self.transcripcion = QTextBrowser()
        self.observaciones = QTextBrowser()
        for w in (self.evidencia, self.transcripcion):   # los [mm:ss] llevan el video a ese momento
            w.setOpenLinks(False)
            w.anchorClicked.connect(lambda url: self.reproductor.ir_a(float(url.toString().split(":", 1)[1])))
        self.pestanas.addTab(self.evidencia, "Evidencia")
        self.pestanas.addTab(self.observaciones, "Observaciones")
        self.pestanas.addTab(self.metricas, "Métricas")
        self.pestanas.addTab(self.transcripcion, "Transcripción")
        ca.addWidget(self.pestanas, 1)
        cuerpo.addWidget(analisis)
        cuerpo.setSizes([520, 530])
        col.addWidget(cuerpo, 1)
        fila = QHBoxLayout()
        fila.addStretch()
        siguiente = boton_primario("Ver resultado final  →", 3)
        siguiente.clicked.connect(self.ir_resultado)
        fila.addWidget(siguiente)
        col.addLayout(fila)
        return panel

    # ------------------------------------------------------------------ lista
    def refrescar(self):
        elegido = self.actual
        self.lista.blockSignals(True)
        self.lista.clear()
        firma = self.proyecto.convocatoria.firma()
        orden = sorted(self.proyecto.candidatos, key=lambda c: (not c.preseleccionado, c.cv["ranking"] if c.cv else 999, c.nombre))
        for c in orden:
            estado = "sin video"
            if c.entrevista:
                estado = f"✓ {c.entrevista['puntaje']:.0f}" + ("  (desactualizado)" if c.entrevista.get("firma") != firma else "")
            elif c.archivo_video:
                estado = "video listo"
            it = QListWidgetItem(f"{'★ ' if c.preseleccionado else '    '}{c.nombre}\n      {estado}")
            it.setData(Qt.UserRole, c.id)
            it.setSizeHint(QSize(0, 2 * self.lista.fontMetrics().height() + 14))   # dos líneas siempre visibles
            self.lista.addItem(it)
            if c.id == elegido:
                self.lista.setCurrentItem(it)
        self.lista.blockSignals(False)
        if self.lista.currentRow() < 0 and self.lista.count():
            self.lista.setCurrentRow(0)
        self._elegir()

    def _candidato(self):
        it = self.lista.currentItem()
        return self.proyecto.candidato(it.data(Qt.UserRole)) if it else None

    def _elegir(self):
        c = self._candidato()
        self.actual = c.id if c else None
        ocupado = self.tarea is not None
        self.asignar.setEnabled(bool(c) and not ocupado)
        self.analizar.setEnabled(bool(c and c.archivo_video) and not ocupado)
        self.abrir.setEnabled(bool(c and c.archivo_video))
        if not c:
            self._video_cargado = None
            self.reproductor.cargar(None)
            self.nombre.setText("Elija un candidato")
            self.video.setText("")
            self._mostrar(None)
            return
        self.nombre.setText(c.nombre)
        segmentos = c.entrevista["transcripcion"]["segmentos"] if c.entrevista else []
        if getattr(self, "_video_cargado", None) != c.archivo_video:
            self._video_cargado = c.archivo_video
            self.reproductor.cargar(c.archivo_video, segmentos)
        else:
            self.reproductor.poner_segmentos(segmentos)
        self.video.setText(f"Video: {Path(c.archivo_video).name}" if c.archivo_video else "Sin video asignado")
        if c.entrevista and c.entrevista.get("firma") != self.proyecto.convocatoria.firma():
            self.analizar.setText("Recalcular con la convocatoria actual")
        else:
            self.analizar.setText("Transcribir y analizar" if not c.entrevista else "Volver a transcribir y analizar")
        self._mostrar(c.entrevista)

    def _asignar_video(self):
        c = self._candidato()
        if not c:
            return
        filtro = "Video o audio (" + " ".join(f"*{e}" for e in audio.EXTENSIONES_VIDEO) + ")"
        ruta, _ = QFileDialog.getOpenFileName(self, f"Video de la entrevista de {c.nombre}",
                                              str(RAIZ / "ejemplos" / "entrevistas"), filtro)
        if ruta:
            c.archivo_video = str(Path(ruta).resolve())
            c.entrevista = None
            self.cambio.emit()
            self.refrescar()

    def _abrir_video(self):
        c = self._candidato()
        if c and c.archivo_video and Path(c.archivo_video).exists():
            os.startfile(c.archivo_video)
        elif c:
            QMessageBox.warning(self, "Video no encontrado", c.archivo_video or "Sin video")

    # ------------------------------------------------------------------ análisis
    def _analizar(self):
        c = self._candidato()
        if not c or not c.archivo_video:
            return
        if not self.proyecto.convocatoria.requisitos:
            QMessageBox.information(self, "Falta la convocatoria", "Defina los requisitos en la Parte 1.")
            return
        if not Path(c.archivo_video).exists():
            QMessageBox.warning(self, "Video no encontrado", c.archivo_video)
            return
        # Si solo cambió la convocatoria, se reutiliza la transcripción (no hace falta volver a pasar Whisper)
        reutilizar = (c.entrevista["transcripcion"] if c.entrevista and
                      c.entrevista.get("firma") != self.proyecto.convocatoria.firma() else None)

        def trabajo(ruta, conv, trans, progreso, cancelado):
            if trans is None:
                progreso(1, "Cargando Whisper large-v3 (solo la primera vez)…")
                audio.cargar_whisper()
                progreso(3, "Extrayendo el audio del video y transcribiendo…")
                trans = audio.transcribir(ruta, progreso, cancelado)
            progreso(99, "Analizando contenido, fluidez y claridad…")
            return audio.analizar_entrevista(trans, conv, embedder_compartido())

        self._ocupado(True)
        self.tarea = Tarea(trabajo, c.archivo_video, self.proyecto.convocatoria, reutilizar, parent=self)
        self.tarea.progreso.connect(lambda p, m: (self.progreso.setValue(p), self.estado.setText(m)))
        self.tarea.listo.connect(lambda r, cid=c.id: self._fin(cid, r))
        self.tarea.fallo.connect(self._fallo)
        self.tarea.iniciar()

    def _ocupado(self, si):
        self.progreso.setVisible(si)
        self.progreso.setValue(0)
        self.cancelar.setVisible(si)
        self.analizar.setEnabled(not si)
        self.asignar.setEnabled(not si)

    def _fin(self, cid, resultado):
        self.tarea = None
        self._ocupado(False)
        c = self.proyecto.candidato(cid)
        if c:
            c.entrevista = resultado
            tr = resultado["transcripcion"]
            self.estado.setText(f"Listo: {audio.mmss(tr['duracion'])} de audio · {resultado['metricas']['palabras']} "
                                f"palabras · {tr['modelo']} en {tr['dispositivo']}.")
        self.cambio.emit()
        self.refrescar()

    def _fallo(self, mensaje):
        self.tarea = None
        self._ocupado(False)
        self.estado.setText(mensaje)
        self._elegir()
        if "cancelada" not in mensaje:
            QMessageBox.critical(self, "No se pudo analizar la entrevista", mensaje)

    def detener(self):
        if self.tarea:
            self.tarea.cancelar()
            self.tarea.hilo.wait(5000)

    # ------------------------------------------------------------------ resultados
    def _mostrar(self, r):
        if not r:
            for t in (self.t_total, self.t_cont, self.t_flu, self.t_cla):
                t.poner(None)
            vacio = f"<p style='color:{SUAVE}'>Asigne el video de la entrevista y presione «Transcribir y analizar».</p>"
            for w in (self.evidencia, self.metricas, self.transcripcion, self.observaciones):
                w.setHtml(vacio)
            return
        m = r["metricas"]
        self.t_total.poner(r["puntaje"], f"{r['transcripcion']['modelo']} · {audio.mmss(m['duracion'])} de audio")
        self.t_cont.poner(r["contenido"])
        self.t_flu.poner(r["fluidez"], f"{m['ppm']:.0f} palabras/min · {m['pausas_largas']} pausa(s) largas")
        self.t_cla.poner(r["claridad"], f"{m['muletillas_total']} muletilla(s) · dicción {m['prob_media'] * 100:.0f}%")
        e = html.escape
        color = COLOR_PARTE[2]

        partes = [f"<p style='color:{SUAVE}; font-size:9pt'>Para cada requisito, el momento de la entrevista que mejor "
                  "lo respalda. Haga clic en ▶ para ver ese momento del video.</p>"]
        reqs = self.proyecto.convocatoria.requisitos
        for k, p in enumerate(r["por_requisito"]):
            peso = f" · peso {reqs[k].peso:g}%" if k < len(reqs) else ""
            neg = (" <span style='color:#b91c1c'>· lo niega, puntaje reducido</span>" if p.get("negacion") else "")
            partes.append(f"<p style='margin:10px 0 0 0'><b>R{k + 1}. {e(p['requisito'])}</b> <span style='color:{SUAVE}'>"
                          f"{peso} · <b style='color:{color_puntaje(p['puntaje'])}'>{p['puntaje']:.0f}</b></span>{neg}</p>"
                          f"{barra_html(p['puntaje'] / 100, color)}"
                          f"<p style='margin:0'><a href='t:{p['inicio']}' style='color:{color}; font-weight:600; text-decoration:none'>"
                          f"▶ {audio.mmss(p['inicio'])}</a>"
                          f" “{e(p['evidencia'])}”</p>")
        self.evidencia.setHtml("".join(partes))

        self.observaciones.setHtml("<ul>" + "".join(f"<li style='margin-bottom:6px'>{e(o)}</li>" for o in r["observaciones"])
                                   + "</ul>")

        filas = [("Duración del video", audio.mmss(m["duracion"])),
                 ("Tiempo hablando", f"{audio.mmss(m['tiempo_habla'])} ({m['tiempo_habla'] / max(m['duracion'], 1) * 100:.0f}%)"),
                 ("Palabras", m["palabras"]),
                 ("Palabras por minuto (mientras habla)", f"{m['ppm']:.0f}  · recomendado {audio.PPM_IDEAL[0]}-{audio.PPM_IDEAL[1]}"),
                 (f"Pausas de más de {audio.PAUSA:.0f} s", m["pausas"]),
                 (f"Pausas de más de {audio.PAUSA_LARGA:.0f} s", f"{m['pausas_largas']} · la más larga: {m['pausa_max']:.1f} s"),
                 ("Muletillas", f"{m['muletillas_total']} ({m['muletillas_100']:.1f} por cada 100 palabras)"),
                 ("Confianza media del reconocimiento (dicción)", f"{m['prob_media'] * 100:.0f}%"),
                 ("Variedad de vocabulario (palabras distintas / total)", f"{m['diversidad'] * 100:.0f}%"),
                 ("Idioma detectado", f"{r['transcripcion']['idioma']}"),
                 ("Modelo", f"{r['transcripcion']['modelo']} · {r['transcripcion']['dispositivo']} · "
                            f"contenido con {r['backend']}")]
        if m["muletillas"]:
            filas.insert(7, ("Detalle de muletillas", ", ".join(f"«{k}» ×{n}" for k, n in m["muletillas"].items())))
        self.metricas.setHtml("<table cellpadding='6' width='100%'>" + "".join(
            f"<tr><td style='color:{SUAVE}'>{e(a)}</td><td><b>{e(str(b))}</b></td></tr>" for a, b in filas) + "</table>")

        patrones = [re.compile(p, re.I) for p in audio.MULETILLAS.values()]

        def resaltar(texto):
            t = e(texto)
            for p in patrones:
                t = p.sub(lambda x: f"<span style='background:#fef3c7; color:#92400e'>{x.group(0)}</span>", t)
            return t

        self.transcripcion.setHtml(
            f"<p style='color:{SUAVE}; font-size:9pt'>Muletillas resaltadas. Haga clic en ▶ para ir a ese "
            "momento del video.</p>" + "".join(
                f"<p style='margin:4px 0'><a href='t:{s['inicio']}' style='color:{color}; font-weight:600; text-decoration:none'>"
                f"▶ {audio.mmss(s['inicio'])}</a> "
                f"{resaltar(s['texto'])}</p>" for s in audio.oraciones(r["transcripcion"]["segmentos"])))
