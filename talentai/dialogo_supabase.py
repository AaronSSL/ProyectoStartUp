"""Diálogo para elegir un aviso de Bumeran guardado en Supabase (proyecto GTH) e importarlo como sesión."""
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QAbstractItemView, QDialog, QHBoxLayout, QHeaderView, QLabel, QPushButton,
                               QTableWidget, QTableWidgetItem, QVBoxLayout)

from . import supabase_gth
from .ui_comun import Tarea, boton_primario, etiqueta


def _fecha(v):
    return str(v or "")[:10]


class DialogoSupabase(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Importar aviso desde Supabase")
        self.resize(820, 520)
        self.aviso_id = None
        col = QVBoxLayout(self)
        col.addWidget(etiqueta("Avisos de Bumeran en Supabase", "titulo"))
        col.addWidget(etiqueta("Se leen los postulantes y el ranking e5 que calculó el scraper. Solo lectura: "
                               "nada se modifica en Supabase. Las entrevistas y decisiones se guardan en esta PC.",
                               "ayuda", wrap=True))
        self.tabla = QTableWidget(0, 5)
        self.tabla.setHorizontalHeaderLabels(["Aviso", "Puesto", "Publicado", "Postulantes", "Score e5"])
        self.tabla.verticalHeader().setVisible(False)
        self.tabla.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.tabla.setSelectionMode(QAbstractItemView.SingleSelection)
        self.tabla.setEditTriggers(QAbstractItemView.NoEditTriggers)
        h = self.tabla.horizontalHeader()
        h.setSectionResizeMode(QHeaderView.ResizeToContents)
        h.setSectionResizeMode(1, QHeaderView.Stretch)
        self.tabla.itemSelectionChanged.connect(lambda: self.importar.setEnabled(bool(self.tabla.selectedItems())))
        self.tabla.itemDoubleClicked.connect(lambda _: self._aceptar())
        col.addWidget(self.tabla, 1)
        self.estado = QLabel("Conectando con Supabase…")
        self.estado.setProperty("clase", "ayuda")
        fila = QHBoxLayout()
        fila.addWidget(self.estado, 1)
        cancelar = QPushButton("Cancelar")
        cancelar.clicked.connect(self.reject)
        self.importar = boton_primario("Importar aviso", 1)
        self.importar.setEnabled(False)
        self.importar.clicked.connect(self._aceptar)
        fila.addWidget(cancelar)
        fila.addWidget(self.importar)
        col.addLayout(fila)

        def trabajo(progreso, cancelado):
            with supabase_gth.conectar() as cx:
                return supabase_gth.listar_avisos(cx)

        self.tarea = Tarea(trabajo, parent=self)
        self.tarea.listo.connect(self._llenar)
        self.tarea.fallo.connect(lambda m: self.estado.setText(f"No se pudo conectar: {m}"))
        self.tarea.iniciar()

    def _llenar(self, avisos):
        self.tabla.setRowCount(len(avisos))
        for f, a in enumerate(avisos):
            score = (f"✓ {a['con_score']}" if a["con_score"] >= a["postulantes"] and a["postulantes"]
                     else f"{a['con_score']} de {a['postulantes']}" if a["con_score"] else "pendiente")
            for j, v in enumerate([a["aviso_id"], a["titulo"] or "", _fecha(a["publicado_el"]), str(a["postulantes"]), score]):
                it = QTableWidgetItem(v)
                it.setData(Qt.UserRole, a["aviso_id"])
                if j in (2, 3, 4):
                    it.setTextAlignment(Qt.AlignCenter)
                self.tabla.setItem(f, j, it)
        con = sum(1 for a in avisos if a["con_score"])
        self.estado.setText(f"{len(avisos)} avisos · {con} con ranking e5. Los «pendiente» se pueden analizar "
                            "en la PC con «Analizar CVs».")

    def _aceptar(self):
        items = self.tabla.selectedItems()
        if items:
            self.aviso_id = items[0].data(Qt.UserRole)
            self.accept()

    def done(self, r):
        if self.tarea.hilo.isRunning():
            self.tarea.hilo.wait(3000)
        super().done(r)
