"""Parte 1 · Análisis de CV: convocatoria con requisitos ponderados, carga de CVs y ranking explicable."""
import html
import json
from pathlib import Path

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QAbstractItemView, QApplication, QFileDialog, QFrame, QHBoxLayout, QHeaderView, QLabel,
                               QLineEdit, QListWidget, QListWidgetItem, QMessageBox, QProgressBar, QPushButton,
                               QSpinBox, QSplitter, QTableWidget, QTableWidgetItem, QTextBrowser, QVBoxLayout, QWidget)

from . import supabase_gth
from .embeddings import embedder_compartido
from .estilo import COLOR_PARTE, SUAVE, color_puntaje
from .matching_cv import rankear
from .proyecto import Candidato, Convocatoria, Requisito
from .textos import EXTENSIONES_CV, fragmentar, leer_documento, nombre_desde_archivo
from .ui_comun import Tarea, boton_primario, etiqueta, tarjeta

RAIZ = Path(__file__).resolve().parents[1]


def barra_html(valor, color):
    """Barra horizontal 0-1 que QTextBrowser sabe dibujar (tabla con anchos en %)."""
    if valor is None:
        return f"<span style='color:{SUAVE}'>sin evidencia</span>"
    pct = max(1, min(100, round(valor * 100)))
    resto = f"<td width='{100 - pct}%' bgcolor='#eef0f3'></td>" if pct < 100 else ""
    return (f"<table width='100%' cellspacing='0' cellpadding='0' style='margin:2px 0'><tr>"
            f"<td width='{pct}%' bgcolor='{color}' height='7'></td>{resto}</tr></table>")


class PaginaCV(QWidget):
    cambio = Signal()
    ir_entrevista = Signal()

    def __init__(self, ventana):
        super().__init__()
        self.v = ventana
        self.tarea = None
        self._cargando = False

        # Arriba, la convocatoria a todo lo ancho (los requisitos se leen completos). Abajo, los CVs en una
        # columna vertical al costado y el ranking ocupando el resto.
        abajo = QSplitter(Qt.Horizontal)
        abajo.setChildrenCollapsible(False)
        abajo.addWidget(self._panel_cvs())
        abajo.addWidget(self._panel_ranking())
        abajo.setSizes([300, 1000])
        # Arriba a la izquierda, «Ver aviso / oferta» muestra u oculta el aviso con sus requisitos (completo, sin
        # recortes). Oculto, todo el espacio queda para los CVs y el ranking.
        barra = QHBoxLayout()
        self.ver_aviso = QPushButton()
        self.ver_aviso.setCheckable(True)
        self.ver_aviso.setCursor(Qt.PointingHandCursor)
        self.ver_aviso.setStyleSheet(
            f"QPushButton {{ color: {COLOR_PARTE[1]}; border: 1px solid {COLOR_PARTE[1]}; border-radius: 6px; "
            f"padding: 7px 14px; font-weight: 600; background: white; }}"
            f"QPushButton:checked {{ background: {COLOR_PARTE[1]}; color: white; }}")
        self.ver_aviso.toggled.connect(self._mostrar_aviso)
        barra.addWidget(self.ver_aviso)
        self.desde_supabase = QPushButton("⇩  Importar aviso de Supabase…")
        self.desde_supabase.setToolTip("Aviso de Bumeran con sus postulantes y el ranking e5 que el scraper de GTH "
                                       "guardó en Supabase (solo lectura)")
        self.desde_supabase.setCursor(Qt.PointingHandCursor)
        self.desde_supabase.setStyleSheet("QPushButton { padding: 7px 14px; font-weight: 600; }")
        self.desde_supabase.clicked.connect(self._importar_supabase)
        self.desde_supabase.setEnabled(supabase_gth.configurado())
        barra.addWidget(self.desde_supabase)
        barra.addSpacing(6)
        self.resumen_aviso = etiqueta("", "ayuda")
        barra.addWidget(self.resumen_aviso, 1)
        self.panel_aviso = self._panel_convocatoria()
        self.panel_aviso.setVisible(False)
        col = QVBoxLayout(self)
        col.setContentsMargins(16, 10, 16, 10)
        col.setSpacing(10)
        col.addLayout(barra)
        col.addWidget(self.panel_aviso)
        col.addWidget(abajo, 1)
        self._mostrar_aviso(False)

    # ------------------------------------------------------------------ construcción
    def _panel_convocatoria(self):
        t = tarjeta()
        t.setObjectName("convocatoria")
        t.setStyleSheet(f"#convocatoria {{ border-left: 5px solid {COLOR_PARTE[1]}; }}")
        fila = QHBoxLayout(t)
        fila.setContentsMargins(16, 12, 16, 12)
        fila.setSpacing(18)

        izq = QVBoxLayout()
        izq.setSpacing(6)
        izq.addWidget(etiqueta("Convocatoria", "titulo"))
        self.titulo = QLineEdit()
        self.titulo.setPlaceholderText("Puesto, p. ej. Analista de Cobranzas")
        self.titulo.setStyleSheet("font-size: 11pt; font-weight: 600; padding: 6px 8px;")
        self.titulo.editingFinished.connect(self._leer_convocatoria)
        izq.addWidget(self.titulo)
        izq.addWidget(etiqueta("Cada requisito tiene un código (R1, R2…) que se usa como columna en el ranking. "
                               "El score es el promedio ponderado por el peso.", "ayuda", wrap=True))
        self.suma = etiqueta("", "ayuda")
        izq.addWidget(self.suma)
        izq.addStretch()
        botones = QHBoxLayout()
        for texto, fn in (("+ Requisito", self._agregar_req), ("Quitar", self._quitar_req),
                          ("Abrir convocatoria…", self._abrir_conv)):
            b = QPushButton(texto)
            b.clicked.connect(fn)
            botones.addWidget(b)
        izq.addLayout(botones)
        fila.addLayout(izq, 2)

        der = QVBoxLayout()
        der.setSpacing(6)
        der.addWidget(etiqueta("Requisitos de la convocatoria", "titulo"))
        self.reqs = QTableWidget(0, 3)
        self.reqs.setHorizontalHeaderLabels(["Código", "Requisito", "Peso %"])
        h = self.reqs.horizontalHeader()
        h.setSectionResizeMode(0, QHeaderView.ResizeToContents)
        h.setSectionResizeMode(1, QHeaderView.Stretch)
        h.setSectionResizeMode(2, QHeaderView.ResizeToContents)
        h.sectionResized.connect(lambda *_: hasattr(self, "panel_aviso") and self.panel_aviso.isVisible() and self._ajustar_alto_reqs())
        self.reqs.verticalHeader().setVisible(False)
        self.reqs.setWordWrap(True)
        self.reqs.setStyleSheet("QTableWidget { font-size: 10.5pt; }")
        self.reqs.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.reqs.itemChanged.connect(self._leer_convocatoria)
        der.addWidget(self.reqs)
        fila.addLayout(der, 5)
        return t

    def _panel_cvs(self):
        t = tarjeta()
        c = QVBoxLayout(t)
        c.setSpacing(8)
        self.titulo_cvs = etiqueta("CVs de postulantes", "titulo")
        c.addWidget(self.titulo_cvs)
        c.addWidget(etiqueta("PDF, Word (.docx), texto o un aviso de Bumeran. Se leen solo en esta PC.", "ayuda", wrap=True))
        self.lista = QListWidget()
        c.addWidget(self.lista, 1)
        agregar = QPushButton("Agregar CVs…")
        agregar.clicked.connect(self._agregar_cvs)
        quitar = QPushButton("Quitar")
        quitar.clicked.connect(self._quitar_cv)
        fila = QHBoxLayout()
        fila.addWidget(agregar, 1)
        fila.addWidget(quitar)
        c.addLayout(fila)
        ejemplo = QPushButton("Cargar ejemplo")
        ejemplo.setToolTip("Convocatoria, CVs y entrevistas de la carpeta ejemplos/")
        ejemplo.clicked.connect(self.cargar_ejemplo)
        c.addWidget(ejemplo)
        self.analizar = boton_primario("Analizar CVs", 1)
        self.analizar.clicked.connect(self._analizar)
        self.progreso = QProgressBar()
        self.progreso.setVisible(False)
        self.estado = etiqueta("", "ayuda", wrap=True)
        c.addSpacing(6)
        c.addWidget(self.analizar)
        c.addWidget(self.progreso)
        c.addWidget(self.estado)
        return t

    def _panel_ranking(self):
        t = tarjeta()
        col = QVBoxLayout(t)
        col.setSpacing(8)
        cab = QHBoxLayout()
        cab.addWidget(etiqueta("Ranking por requisitos", "titulo"))
        cab.addStretch()
        self.backend = etiqueta("", "ayuda")
        cab.addWidget(self.backend)
        col.addLayout(cab)
        self.leyenda = etiqueta("", "ayuda", wrap=True)
        col.addWidget(self.leyenda)

        # Elegir a los primeros N para la entrevista
        top = QFrame()
        top.setObjectName("topN")
        top.setStyleSheet("#topN { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; }")
        ft = QHBoxLayout(top)
        ft.setContentsMargins(12, 8, 12, 8)
        ft.addWidget(QLabel("Invitar a entrevista a los primeros"))
        self.top_n = QSpinBox()
        self.top_n.setRange(1, 999)
        self.top_n.setFixedWidth(104)
        self.top_n.setAlignment(Qt.AlignCenter)
        self.top_n.setStyleSheet(f"QSpinBox {{ font-size: 15pt; font-weight: 700; color: {COLOR_PARTE[2]}; "
                                 f"border: 2px solid {COLOR_PARTE[2]}; border-radius: 6px; padding: 2px 4px; background: white; }}")
        self.top_n.valueChanged.connect(self._cambio_top_n)
        ft.addWidget(self.top_n)
        self.top_total = QLabel("")
        ft.addWidget(self.top_total)
        ft.addStretch()
        self.invitar = boton_primario("Pasar a los primeros a la entrevista", 2)
        self.invitar.clicked.connect(self._invitar_top)
        ft.addWidget(self.invitar)
        col.addWidget(top)

        self.tabla = QTableWidget(0, 0)
        self.tabla.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.tabla.setSelectionMode(QAbstractItemView.SingleSelection)
        self.tabla.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.tabla.verticalHeader().setVisible(False)
        self.tabla.itemSelectionChanged.connect(self._mostrar_detalle)
        self.tabla.itemChanged.connect(self._marcar_preseleccion)
        div = QSplitter(Qt.Vertical)
        div.addWidget(self.tabla)
        self.detalle = QTextBrowser()
        self.detalle.setOpenExternalLinks(False)
        div.addWidget(self.detalle)
        div.setSizes([420, 200])
        col.addWidget(div, 1)
        fila = QHBoxLayout()
        fila.addStretch()
        siguiente = boton_primario("Ir a la entrevista  →", 2)
        siguiente.clicked.connect(self.ir_entrevista)
        fila.addWidget(siguiente)
        col.addLayout(fila)
        return t

    def _mostrar_aviso(self, visible):
        self.panel_aviso.setVisible(visible)
        self.ver_aviso.setChecked(visible)
        self.ver_aviso.setText("▲  Ocultar aviso / oferta" if visible else "▼  Ver aviso / oferta")
        if visible:
            self._ajustar_alto_reqs()

    def _ajustar_alto_reqs(self):
        """La tabla de requisitos toma el alto de todas sus filas (hasta 360 px; si hay más, aparece el scroll)."""
        self.reqs.resizeRowsToContents()
        alto = self.reqs.horizontalHeader().height() + 2 * self.reqs.frameWidth() + 2
        alto += sum(self.reqs.rowHeight(f) for f in range(self.reqs.rowCount()))
        self.reqs.setFixedHeight(min(max(alto, 90), 360))

    def _actualizar_resumen(self):
        conv = self.proyecto.convocatoria
        if conv.requisitos:
            self.resumen_aviso.setText(f"<b style='color:#1f2937'>{html.escape(conv.titulo or 'Sin título')}</b>"
                                       f"  ·  {len(conv.requisitos)} requisitos: "
                                       + "  ".join(f"<b>R{k + 1}</b> {r.peso:g}%" for k, r in enumerate(conv.requisitos)))
        else:
            self.resumen_aviso.setText("Aún no hay aviso: presione «Ver aviso / oferta» para definir los requisitos, "
                                       "o use «Cargar ejemplo» / «Importar aviso de Supabase».")

    # ------------------------------------------------------------------ convocatoria
    @property
    def proyecto(self):
        return self.v.proyecto

    def refrescar(self):
        """Vuelca el proyecto en los controles (al abrir una sesión o cargar el ejemplo)."""
        self._cargando = True
        conv = self.proyecto.convocatoria
        self.titulo.setText(conv.titulo)
        self.reqs.setRowCount(0)
        for r in conv.requisitos:
            self._fila_req(r.texto, r.peso)
        self._codigos_req()
        self.top_n.setValue(max(1, self.proyecto.top_n))
        self.lista.clear()
        for c in self.proyecto.candidatos:
            tipo = ("BUMERAN" if c.archivo_cv.startswith("Bumeran") else
                    Path(c.archivo_cv).suffix.lstrip('.').upper() if c.archivo_cv else "SIN CV · solo entrevista")
            it = QListWidgetItem(f"{c.nombre}   ·   {tipo}")
            it.setData(Qt.UserRole, c.id)
            it.setToolTip(c.archivo_cv)
            self.lista.addItem(it)
        self.titulo_cvs.setText(f"CVs de postulantes ({len(self.proyecto.candidatos)})")
        self._cargando = False
        self._actualizar_resumen()
        if not conv.requisitos:
            self._mostrar_aviso(True)
        elif self.panel_aviso.isVisible():
            self._ajustar_alto_reqs()
        self._actualizar_suma()
        self._llenar_tabla()

    def _fila_req(self, texto="", peso=25.0):
        f = self.reqs.rowCount()
        self.reqs.insertRow(f)
        codigo = QTableWidgetItem()
        codigo.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)
        codigo.setTextAlignment(Qt.AlignCenter)
        codigo.setForeground(QColor(COLOR_PARTE[1]))
        fuente = codigo.font()
        fuente.setBold(True)
        codigo.setFont(fuente)
        self.reqs.setItem(f, 0, codigo)
        self.reqs.setItem(f, 1, QTableWidgetItem(texto))
        p = QTableWidgetItem(f"{peso:g}")
        p.setTextAlignment(Qt.AlignCenter)
        self.reqs.setItem(f, 2, p)

    def _codigos_req(self):
        anterior, self._cargando = self._cargando, True
        for f in range(self.reqs.rowCount()):
            self.reqs.item(f, 0).setText(f"R{f + 1}")
        self._cargando = anterior
        self._ajustar_alto_reqs()

    def _agregar_req(self):
        self._cargando = True
        self._fila_req("", 10)
        self._codigos_req()
        self._cargando = False
        self.reqs.editItem(self.reqs.item(self.reqs.rowCount() - 1, 1))

    def _quitar_req(self):
        filas = sorted({i.row() for i in self.reqs.selectedIndexes()}, reverse=True)
        for f in filas or [self.reqs.rowCount() - 1]:
            if f >= 0:
                self.reqs.removeRow(f)
        self._codigos_req()
        self._leer_convocatoria()

    def _leer_convocatoria(self, *_):
        if self._cargando:
            return
        reqs = []
        for f in range(self.reqs.rowCount()):
            texto = (self.reqs.item(f, 1).text() if self.reqs.item(f, 1) else "").strip()
            try:
                peso = float((self.reqs.item(f, 2).text() if self.reqs.item(f, 2) else "0").replace(",", ".").replace("%", ""))
            except ValueError:
                peso = 0.0
            if texto:
                reqs.append(Requisito(texto, peso))
        self.proyecto.convocatoria = Convocatoria(self.titulo.text().strip(), reqs)
        self._ajustar_alto_reqs()
        self._actualizar_resumen()
        self._actualizar_suma()
        self._llenar_tabla()
        self.cambio.emit()

    def _actualizar_suma(self):
        total = sum(r.peso for r in self.proyecto.convocatoria.requisitos)
        n = len(self.proyecto.convocatoria.requisitos)
        nota = "" if abs(total - 100) < 0.01 else "  ·  se normalizan a 100% al calcular"
        self.suma.setText(f"{n} requisito(s) · los pesos suman {total:g}%{nota}")

    def _abrir_conv(self):
        ruta, _ = QFileDialog.getOpenFileName(self, "Abrir convocatoria", str(RAIZ / "ejemplos"), "Convocatoria (*.json)")
        if ruta:
            self.cargar_convocatoria(ruta)

    def cargar_convocatoria(self, ruta):
        datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
        self.proyecto.convocatoria = Convocatoria(datos.get("titulo", ""), [Requisito(r["texto"], float(r["peso"]))
                                                                             for r in datos.get("requisitos", [])])
        self.refrescar()
        self.cambio.emit()

    # ------------------------------------------------------------------ CVs
    def _agregar_cvs(self):
        rutas, _ = QFileDialog.getOpenFileNames(self, "Agregar CVs", str(RAIZ / "ejemplos" / "cvs"),
                                                "CV (" + " ".join(f"*{e}" for e in EXTENSIONES_CV) + ")")
        self.agregar_cvs(rutas)

    def agregar_cvs(self, rutas):
        existentes = {str(Path(c.archivo_cv).resolve()) for c in self.proyecto.candidatos}
        errores, nuevos = [], 0
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            for ruta in rutas:
                if str(Path(ruta).resolve()) in existentes:
                    continue
                try:
                    texto = leer_documento(ruta)
                    frag = fragmentar(texto)
                    if not frag:
                        raise ValueError("no se encontró texto (¿PDF escaneado como imagen?)")
                    self.proyecto.candidatos.append(Candidato.nuevo(nombre_desde_archivo(ruta), Path(ruta).resolve(), texto, frag))
                    nuevos += 1
                except Exception as e:
                    errores.append(f"{Path(ruta).name}: {e}")
        finally:
            QApplication.restoreOverrideCursor()
        self.refrescar()
        if nuevos:
            self.estado.setText(f"{nuevos} CV agregado(s). Presione «Analizar CVs» para actualizar el ranking.")
        if errores:
            QMessageBox.warning(self, "Algunos CV no se pudieron leer", "\n".join(errores))
        self.cambio.emit()

    def _quitar_cv(self):
        it = self.lista.currentItem()
        if not it:
            return
        c = self.proyecto.candidato(it.data(Qt.UserRole))
        if QMessageBox.question(self, "Quitar CV", f"¿Quitar a {c.nombre} de esta sesión?") == QMessageBox.Yes:
            self.proyecto.candidatos.remove(c)
            self.refrescar()
            self.cambio.emit()

    def cargar_ejemplo(self):
        ej = RAIZ / "ejemplos"
        if not (ej / "convocatoria_analista_cobranzas.json").exists():
            QMessageBox.information(self, "Sin ejemplos", "Ejecute primero: python herramientas/crear_ejemplos.py")
            return
        if self.proyecto.candidatos and QMessageBox.question(
                self, "Cargar ejemplo", "Se reemplazará la sesión actual por la de ejemplo. ¿Continuar?") != QMessageBox.Yes:
            return
        self.v.nueva_sesion(preguntar=False)
        self.cargar_convocatoria(ej / "convocatoria_analista_cobranzas.json")
        self.agregar_cvs(sorted(str(p) for p in (ej / "cvs").iterdir() if p.suffix.lower() in EXTENSIONES_CV))
        # Las entrevistas de ejemplo se asignan por nombre (Lucia_Paredes_entrevista.mp4 → Lucia Paredes)
        # Un video sin CV (p. ej. una entrevista grabada para la demo) entra como candidato «solo entrevista».
        for video in sorted((ej / "entrevistas").glob("*.mp4")):
            nombre = nombre_desde_archivo(video).replace(" Entrevista", "")
            c = next((c for c in self.proyecto.candidatos if c.nombre == nombre), None)
            if not c:
                c = Candidato.nuevo(nombre, "", "", [])
                c.preseleccionado = True
                self.proyecto.candidatos.append(c)
            c.archivo_video = str(video.resolve())
        self.refrescar()
        self.cambio.emit()

    def _importar_supabase(self):
        from .dialogo_supabase import DialogoSupabase
        dlg = DialogoSupabase(self)
        if dlg.exec() != DialogoSupabase.Accepted or not dlg.aviso_id:
            return
        aviso_id = dlg.aviso_id

        def trabajo(aviso_id, progreso, cancelado):
            return supabase_gth.importar_aviso(aviso_id, progreso, cancelado)

        self.analizar.setEnabled(False)
        self.desde_supabase.setEnabled(False)
        self.progreso.setVisible(True)
        self.tarea = Tarea(trabajo, aviso_id, parent=self)
        self.tarea.progreso.connect(lambda p, m: (self.progreso.setValue(p), self.estado.setText(m)))
        self.tarea.listo.connect(self._fin_importacion)
        self.tarea.fallo.connect(self._fallo)
        self.tarea.iniciar()

    def _fin_importacion(self, proyecto):
        self.analizar.setEnabled(True)
        self.desde_supabase.setEnabled(True)
        self.progreso.setVisible(False)
        self.v.abrir_aviso(proyecto)
        con = sum(1 for c in proyecto.candidatos if c.cv)
        self.estado.setText(f"Aviso {proyecto.origen['aviso_id']} importado: {len(proyecto.candidatos)} postulantes, "
                            f"{con} con score e5 de Supabase."
                            + ("" if con else " Presione «Analizar CVs» para calcularlo en esta PC."))
        if self.tabla.rowCount():
            self.tabla.selectRow(0)

    # ------------------------------------------------------------------ análisis
    def _analizar(self):
        conv, cands = self.proyecto.convocatoria, self.proyecto.candidatos
        if not conv.requisitos:
            QMessageBox.information(self, "Falta la convocatoria", "Agregue al menos un requisito.")
            return
        cands = [c for c in cands if c.fragmentos]   # los candidatos «solo entrevista» no entran al ranking de CV
        if not cands:
            QMessageBox.information(self, "Faltan CVs", "Agregue los CVs de los postulantes.")
            return

        def trabajo(conv, cands, progreso, cancelado):
            progreso(2, "Cargando el modelo de embeddings e5 (solo la primera vez, ~30 s)…")
            emb = embedder_compartido()
            return rankear(conv, cands, emb, progreso)

        self.analizar.setEnabled(False)
        self.progreso.setVisible(True)
        self.progreso.setValue(0)
        self.tarea = Tarea(trabajo, conv, list(cands), parent=self)
        self.tarea.progreso.connect(lambda p, m: (self.progreso.setValue(p), self.estado.setText(m)))
        self.tarea.listo.connect(self._fin_analisis)
        self.tarea.fallo.connect(self._fallo)
        self.tarea.iniciar()

    def _fin_analisis(self, resultados):
        for c in self.proyecto.candidatos:
            if c.id in resultados:
                c.cv = resultados[c.id]
        self.analizar.setEnabled(True)
        self.progreso.setVisible(False)
        n = len(resultados)
        self.estado.setText(f"Ranking listo: {n} CV analizados.")
        self._llenar_tabla()
        if self.tabla.rowCount():
            self.tabla.selectRow(0)
        self.cambio.emit()

    def _fallo(self, mensaje):
        self.analizar.setEnabled(True)
        self.desde_supabase.setEnabled(supabase_gth.configurado())
        self.progreso.setVisible(False)
        self.estado.setText("No se pudo completar el análisis.")
        QMessageBox.critical(self, "Error en el análisis", mensaje)

    # ------------------------------------------------------------------ ranking
    def _ordenados(self):
        return sorted(self.proyecto.candidatos, key=lambda c: (c.cv is None, c.cv["ranking"] if c.cv else 0, c.nombre))

    def _llenar_tabla(self):
        reqs = self.proyecto.convocatoria.requisitos
        firma = self.proyecto.convocatoria.firma()
        cols = ["#", "Candidato", "Score CV"] + [f"R{k + 1}" for k in range(len(reqs))] + ["Entrevista"]
        self._cargando = True
        self.tabla.clear()
        self.tabla.setColumnCount(len(cols))
        self.tabla.setHorizontalHeaderLabels(cols)
        for k, r in enumerate(reqs):
            self.tabla.horizontalHeaderItem(3 + k).setToolTip(f"R{k + 1}: {r.texto} ({r.peso:g}%)")
        h = self.tabla.horizontalHeader()
        h.setSectionResizeMode(QHeaderView.ResizeToContents)
        h.setSectionResizeMode(1, QHeaderView.Stretch)
        cands = self._ordenados()
        self.tabla.setRowCount(len(cands))
        desactualizados = 0
        n_top = self.top_n.value()
        con_ranking = len(self._con_ranking())
        anterior, self._cargando = self._cargando, True
        self.top_n.setMaximum(max(1, con_ranking, self.proyecto.top_n))
        self.top_n.setValue(min(self.proyecto.top_n, con_ranking) if con_ranking else self.proyecto.top_n)
        self.top_n.setMaximum(max(1, con_ranking or self.proyecto.top_n))
        self._cargando = anterior
        n_top = self.top_n.value()
        self.top_total.setText(f"de {con_ranking} con CV analizado" if con_ranking else "(primero analice los CVs)")
        self.invitar.setText("Pasar al primero a la entrevista" if n_top == 1 else
                             f"Pasar a los {n_top} primeros a la entrevista")
        self.leyenda.setText("R1, R2… = requisitos del aviso (vea «Ver aviso / oferta»); el valor es su similitud "
                             "0-100. Las filas resaltadas en violeta son los primeros N que se invitarán a entrevista."
                             if reqs else "")
        for f, c in enumerate(cands):
            vigente = c.cv is not None and c.cv.get("firma") == firma
            desactualizados += c.cv is not None and not vigente
            celdas = [str(c.cv["ranking"]) if c.cv else "—", c.nombre,
                      f"{c.cv['score'] * 100:.0f}" if c.cv else "—"]
            sims = [p.get("sim") for p in c.cv["por_requisito"]] if vigente else [None] * len(reqs)
            celdas += ["—" if s is None else f"{s * 100:.0f}" for s in (sims + [None] * len(reqs))[:len(reqs)]]
            for j, texto in enumerate(celdas):
                it = QTableWidgetItem(texto)
                it.setData(Qt.UserRole, c.id)
                if j != 1:
                    it.setTextAlignment(Qt.AlignCenter)
                if j == 2 and c.cv:
                    it.setForeground(QColor(color_puntaje(c.cv["score"] * 100)))
                    font = it.font()
                    font.setBold(True)
                    it.setFont(font)
                if c.cv and not vigente:
                    it.setForeground(QColor("#9ca3af"))
                if vigente and c.cv["ranking"] <= n_top:
                    it.setBackground(QColor("#ede9fe"))
                    if j == 1:
                        fuente = it.font()
                        fuente.setBold(True)
                        it.setFont(fuente)
                self.tabla.setItem(f, j, it)
            marca = QTableWidgetItem("")
            marca.setFlags(Qt.ItemIsUserCheckable | Qt.ItemIsEnabled | Qt.ItemIsSelectable)
            marca.setCheckState(Qt.Checked if c.preseleccionado else Qt.Unchecked)
            marca.setData(Qt.UserRole, c.id)
            if vigente and c.cv["ranking"] <= n_top:
                marca.setBackground(QColor("#ede9fe"))
            self.tabla.setItem(f, len(cols) - 1, marca)
        self._cargando = False
        backend = next((c.cv["backend"] for c in cands if c.cv), None)
        texto = {"e5": "Modelo: multilingual-e5 · score reescalado 0-100 dentro de la convocatoria",
                 "tfidf": "Modelo: TF-IDF (respaldo sin e5)"}.get(backend, "")
        if any(c.cv and c.cv.get("fuente") == "supabase" for c in cands):
            texto = "Scores: ranking e5 de Supabase (scraper) · reescalado 0-100 dentro del aviso"
        self.backend.setText(texto)
        if desactualizados:
            self.estado.setText(f"La convocatoria cambió: {desactualizados} resultado(s) desactualizado(s). "
                                "Vuelva a presionar «Analizar CVs».")

    def _con_ranking(self):
        """Candidatos con ranking de CV vigente (los criterios no cambiaron desde que se calculó)."""
        firma = self.proyecto.convocatoria.firma()
        return [c for c in self.proyecto.candidatos if c.cv and c.cv.get("firma") == firma]

    def _cambio_top_n(self, valor):
        if self._cargando:
            return
        self.proyecto.top_n = valor
        self._llenar_tabla()
        self.cambio.emit()

    def _invitar_top(self):
        rankeados = self._con_ranking()
        if not rankeados:
            QMessageBox.information(self, "Sin ranking", "Primero presione «Analizar CVs».")
            return
        n = self.top_n.value()
        for c in rankeados:   # los «solo entrevista» (sin CV) conservan su marca
            c.preseleccionado = c.cv["ranking"] <= n
        elegidos = min(n, len(rankeados))
        self._llenar_tabla()
        self.estado.setText(f"{elegidos} candidato(s) pasan a la entrevista (Parte 2).")
        self.cambio.emit()

    def _marcar_preseleccion(self, it):
        if self._cargando or it.column() != self.tabla.columnCount() - 1:
            return
        c = self.proyecto.candidato(it.data(Qt.UserRole))
        if c:
            c.preseleccionado = it.checkState() == Qt.Checked
            self.cambio.emit()

    def _mostrar_detalle(self):
        filas = self.tabla.selectionModel().selectedRows()
        if not filas:
            return
        c = self.proyecto.candidato(self.tabla.item(filas[0].row(), 1).data(Qt.UserRole))
        if not c:
            return
        e = html.escape
        color = COLOR_PARTE[1]
        if not c.cv:
            self.detalle.setHtml(f"<h3>{e(c.nombre)}</h3><p style='color:{SUAVE}'>Aún sin analizar. "
                                 f"{len(c.fragmentos)} fragmentos de texto leídos del CV.</p>")
            return
        partes = [f"<h3 style='margin-bottom:2px'>{e(c.nombre)} · <span style='color:{color_puntaje(c.cv['score'] * 100)}'>"
                  f"{c.cv['score'] * 100:.0f}</span><span style='color:{SUAVE}; font-size:9pt'> / 100 · puesto "
                  f"{c.cv['ranking']} de {len(self.proyecto.candidatos)}</span></h3>",
                  f"<p style='color:{SUAVE}; font-size:9pt'>Para cada requisito se muestra el fragmento del CV más "
                  f"parecido (la evidencia) y su similitud relativa al resto de postulantes."
                  + (f" Fuente: Supabase, calculado por el scraper el {e(c.cv.get('calculado', ''))}."
                     if c.cv.get("fuente") == "supabase" else "") + "</p>"]
        reqs = self.proyecto.convocatoria.requisitos
        for k, p in enumerate(c.cv["por_requisito"]):
            peso = f"{reqs[k].peso:g}%" if k < len(reqs) else ""
            sim = p.get("sim")
            valor = "—" if sim is None else f"{sim * 100:.0f}"
            evid = e(p["evidencia"]) if p["evidencia"] else "<i>sin texto en el CV</i>"
            partes.append(f"<p style='margin:10px 0 0 0'><b>R{k + 1}. {e(p['requisito'])}</b> "
                          f"<span style='color:{SUAVE}'>· peso {peso} · {valor}</span></p>{barra_html(sim, color)}"
                          f"<p style='margin:0; color:#374151'>“{evid}”</p>")
        self.detalle.setHtml("".join(partes))
