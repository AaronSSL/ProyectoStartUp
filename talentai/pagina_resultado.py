"""Parte 3 · Resultado final: CV + entrevista con pesos ajustables; el reclutador registra su decisión."""
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QAbstractItemView, QComboBox, QFileDialog, QHBoxLayout, QHeaderView, QLabel,
                               QMessageBox, QPushButton, QSlider, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget)

from .estilo import color_puntaje
from .proyecto import DECISIONES, puntaje_final
from .ui_comun import etiqueta, tarjeta

COLUMNAS = ["#", "Candidato", "Score CV", "Entrevista", "Puntaje final", "Tiene", "Decisión del reclutador", "Nota"]
BASE = {"completo": "CV + entrevista", "solo CV": "solo CV", "solo entrevista": "solo entrevista", "sin datos": "—"}


class PaginaResultado(QWidget):
    cambio = Signal()

    def __init__(self, ventana):
        super().__init__()
        self.v = ventana
        self._cargando = False
        col = QVBoxLayout(self)
        col.setContentsMargins(16, 14, 16, 14)
        col.setSpacing(10)

        t = tarjeta()
        fila = QHBoxLayout(t)
        textos = QVBoxLayout()
        textos.addWidget(etiqueta("Peso de cada parte en el puntaje final", "titulo"))
        textos.addWidget(etiqueta("Si a alguien le falta una parte, se usa la que tenga (columna «Tiene»).", "ayuda"))
        fila.addLayout(textos, 1)
        self.lab_cv = QLabel()
        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(0, 100)
        self.slider.setSingleStep(5)
        self.slider.setPageStep(10)
        self.slider.setFixedWidth(260)
        self.slider.valueChanged.connect(self._peso)
        self.lab_ent = QLabel()
        for w in (self.lab_cv, self.slider, self.lab_ent):
            fila.addWidget(w)
        col.addWidget(t)

        t2 = tarjeta()
        c2 = QVBoxLayout(t2)
        cab = QHBoxLayout()
        textos2 = QVBoxLayout()
        textos2.setSpacing(0)
        textos2.addWidget(etiqueta("Resultado consolidado", "titulo"))
        textos2.addWidget(etiqueta("Orden: primero, siempre, quienes tienen CV analizado y entrevista (filas verdes); "
                                   "después los que tienen solo una parte. Dentro de cada grupo, por puntaje final.", "ayuda", wrap=True))
        cab.addLayout(textos2, 1)
        for texto, fn in (("Exportar a Excel…", self._exportar_excel), ("Exportar CSV…", self._exportar_csv)):
            b = QPushButton(texto)
            b.clicked.connect(fn)
            cab.addWidget(b)
        c2.addLayout(cab)
        self.tabla = QTableWidget(0, len(COLUMNAS))
        self.tabla.setHorizontalHeaderLabels(COLUMNAS)
        self.tabla.verticalHeader().setVisible(False)
        self.tabla.setSelectionBehavior(QAbstractItemView.SelectRows)
        h = self.tabla.horizontalHeader()
        h.setSectionResizeMode(QHeaderView.ResizeToContents)
        h.setSectionResizeMode(1, QHeaderView.Stretch)
        h.setSectionResizeMode(7, QHeaderView.Stretch)
        self.tabla.itemChanged.connect(self._nota)
        c2.addWidget(self.tabla, 1)
        aviso = QLabel("Modo copiloto: TalentAI ordena y explica; la decisión de quién avanza la toma y registra el "
                       "reclutador. Cada puntaje se puede rastrear hasta su evidencia en las Partes 1 y 2.")
        aviso.setObjectName("aviso")
        aviso.setWordWrap(True)
        c2.addWidget(aviso)
        col.addWidget(t2, 1)

    @property
    def proyecto(self):
        return self.v.proyecto

    def _peso(self, valor):
        valor = round(valor / 5) * 5
        self.lab_cv.setText(f"CV  <b>{valor}%</b>")
        self.lab_ent.setText(f"<b>{100 - valor}%</b>  Entrevista")
        if not self._cargando and valor != self.proyecto.peso_cv:
            self.proyecto.peso_cv = valor
            self.refrescar()
            self.cambio.emit()

    def filas(self):
        datos = []
        for c in self.proyecto.candidatos:
            final, base = puntaje_final(c, self.proyecto.peso_cv)
            datos.append((c, final, base))
        # Primero, siempre, quienes enviaron ambas partes (CV analizado y entrevista); luego el resto por puntaje
        return sorted(datos, key=lambda x: (x[2] != "completo", x[1] is None, -(x[1] or 0), x[0].nombre))

    def refrescar(self):
        self._cargando = True
        self.slider.setValue(self.proyecto.peso_cv)
        self._cargando = False
        self._peso(self.proyecto.peso_cv)
        self._cargando = True
        datos = self.filas()
        self.tabla.setRowCount(len(datos))
        for f, (c, final, base) in enumerate(datos):
            valores = [str(f + 1) if final is not None else "—", c.nombre,
                       f"{c.cv['score'] * 100:.0f}" if c.cv else "—",
                       f"{c.entrevista['puntaje']:.0f}" if c.entrevista else "—",
                       f"{final:.0f}" if final is not None else "—", BASE.get(base, base)]
            for j, texto in enumerate(valores):
                it = QTableWidgetItem(texto)
                it.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)
                if j != 1:
                    it.setTextAlignment(Qt.AlignCenter)
                if base == "completo":
                    it.setBackground(QColor("#ecfdf5"))
                    if j == 5:
                        it.setForeground(QColor("#047857"))
                if j == 4 and final is not None:
                    it.setForeground(QColor(color_puntaje(final)))
                    fuente = it.font()
                    fuente.setBold(True)
                    fuente.setPointSize(fuente.pointSize() + 1)
                    it.setFont(fuente)
                self.tabla.setItem(f, j, it)
            combo = QComboBox()
            combo.addItems(DECISIONES)
            combo.setCurrentText(c.decision)
            combo.currentTextChanged.connect(lambda texto, cid=c.id: self._decision(cid, texto))
            self.tabla.setCellWidget(f, 6, combo)
            nota = QTableWidgetItem(c.nota)
            nota.setData(Qt.UserRole, c.id)
            nota.setToolTip("Doble clic para escribir la justificación")
            self.tabla.setItem(f, 7, nota)
        self._cargando = False

    def _decision(self, cid, texto):
        c = self.proyecto.candidato(cid)
        if c:
            c.decision = texto
            self.cambio.emit()

    def _nota(self, it):
        if self._cargando or it.column() != 7:
            return
        c = self.proyecto.candidato(it.data(Qt.UserRole))
        if c:
            c.nota = it.text()
            self.cambio.emit()

    # ------------------------------------------------------------------ exportar
    def _tabla_exportable(self):
        import pandas as pd
        reqs = self.proyecto.convocatoria.requisitos
        filas = []
        for pos, (c, final, base) in enumerate(self.filas(), 1):
            fila = {"Puesto": pos if final is not None else None, "Candidato": c.nombre,
                    "Score CV": round(c.cv["score"] * 100, 1) if c.cv else None,
                    "Entrevista": c.entrevista["puntaje"] if c.entrevista else None,
                    "Contenido": c.entrevista["contenido"] if c.entrevista else None,
                    "Fluidez": c.entrevista["fluidez"] if c.entrevista else None,
                    "Claridad": c.entrevista["claridad"] if c.entrevista else None,
                    "Puntaje final": round(final, 1) if final is not None else None, "Tiene": BASE.get(base, base),
                    "Decisión": c.decision, "Nota": c.nota, "Archivo CV": c.archivo_cv, "Video": c.archivo_video}
            for k, r in enumerate(reqs):
                p = (c.cv or {}).get("por_requisito", [])
                fila[f"R{k + 1} CV: evidencia"] = p[k]["evidencia"] if k < len(p) else ""
            filas.append(fila)
        return pd.DataFrame(filas)

    def _exportar_excel(self):
        ruta, _ = QFileDialog.getSaveFileName(self, "Exportar a Excel", "resultado_talentai.xlsx", "Excel (*.xlsx)")
        if not ruta:
            return
        import pandas as pd
        try:
            with pd.ExcelWriter(ruta) as x:
                self._tabla_exportable().to_excel(x, sheet_name="Resultado", index=False)
                pd.DataFrame([{"Requisito": r.texto, "Peso %": r.peso} for r in self.proyecto.convocatoria.requisitos]
                             ).to_excel(x, sheet_name="Convocatoria", index=False)
            QMessageBox.information(self, "Exportado", f"Archivo guardado:\n{ruta}")
        except Exception as e:
            QMessageBox.critical(self, "No se pudo exportar", str(e))

    def _exportar_csv(self):
        ruta, _ = QFileDialog.getSaveFileName(self, "Exportar CSV", "resultado_talentai.csv", "CSV (*.csv)")
        if ruta:
            try:
                self._tabla_exportable().to_csv(ruta, index=False, sep=";", encoding="utf-8-sig")
                QMessageBox.information(self, "Exportado", f"Archivo guardado:\n{ruta}")
            except Exception as e:
                QMessageBox.critical(self, "No se pudo exportar", str(e))
