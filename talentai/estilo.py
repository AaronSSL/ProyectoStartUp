"""Paleta y hoja de estilo Qt. Cada parte del proceso tiene su propio color para distinguir los segmentos."""

from pathlib import Path

_IMG = Path(__file__).resolve().parent / "img"
AGARRE_H = (_IMG / "agarre_h.svg").as_posix()   # tres puntos en horizontal (divisor arriba/abajo)
AGARRE_V = (_IMG / "agarre_v.svg").as_posix()   # tres puntos en vertical (divisor izquierda/derecha)

COLOR_PARTE = {1: "#2563eb", 2: "#7c3aed", 3: "#059669"}
FONDO = "#f4f5f7"
TEXTO = "#1f2937"
SUAVE = "#6b7280"
BORDE = "#e2e5ea"


def color_puntaje(valor):
    if valor is None:
        return SUAVE
    return "#047857" if valor >= 70 else ("#b45309" if valor >= 40 else "#b91c1c")


QSS = f"""
QWidget {{ font-family: 'Segoe UI'; font-size: 10pt; color: {TEXTO}; }}
QMainWindow, QWidget#raiz {{ background: {FONDO}; }}
QFrame#cabecera {{ background: #111827; }}
QLabel#marca {{ color: white; font-size: 17pt; font-weight: 700; }}
QLabel#marcaSub {{ color: #9ca3af; font-size: 9pt; }}
QLabel#cabeceraInfo {{ color: #e5e7eb; font-size: 10pt; }}
QPushButton#cabeceraBtn {{ background: transparent; color: #d1d5db; border: 1px solid #374151; border-radius: 6px;
    padding: 5px 12px; }}
QPushButton#cabeceraBtn:hover {{ background: #1f2937; color: white; }}

QFrame#barraSegmentos {{ background: white; border-bottom: 1px solid {BORDE}; }}
QPushButton[segmento="true"] {{ background: white; border: none; border-bottom: 4px solid transparent; text-align: left;
    padding: 10px 18px 8px 18px; }}
QPushButton[segmento="true"]:hover {{ background: #f9fafb; }}

QFrame[clase="tarjeta"] {{ background: white; border: 1px solid {BORDE}; border-radius: 10px; }}
QLabel[clase="titulo"] {{ font-size: 11pt; font-weight: 600; }}
QLabel[clase="ayuda"] {{ color: {SUAVE}; font-size: 9pt; }}
QLabel#aviso {{ background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 8px 10px; color: #4c1d95;
    font-size: 9pt; }}

QPushButton {{ background: white; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 12px; }}
QPushButton:hover {{ background: #f3f4f6; }}
QPushButton:disabled {{ color: #9ca3af; background: #f9fafb; }}
QPushButton[clase="primario"] {{ color: white; border: none; font-weight: 600; padding: 8px 14px; }}
QPushButton[clase="primario"]:disabled {{ background: #cbd5e1; color: white; }}
QPushButton#p1 {{ background: {COLOR_PARTE[1]}; }} QPushButton#p1:hover {{ background: #1d4ed8; }}
QPushButton#p2 {{ background: {COLOR_PARTE[2]}; }} QPushButton#p2:hover {{ background: #6d28d9; }}
QPushButton#p3 {{ background: {COLOR_PARTE[3]}; }} QPushButton#p3:hover {{ background: #047857; }}
QPushButton#p1:disabled, QPushButton#p2:disabled, QPushButton#p3:disabled {{ background: #cbd5e1; }}

QLineEdit, QTableWidget, QListWidget, QTextBrowser, QComboBox, QSpinBox {{ background: white; border: 1px solid #d1d5db;
    border-radius: 6px; }}
QLineEdit {{ padding: 5px 8px; }}
QTableWidget {{ gridline-color: #eef0f3; selection-background-color: #e0e7ff; selection-color: {TEXTO}; }}
QHeaderView::section {{ background: #f9fafb; border: none; border-bottom: 1px solid {BORDE}; padding: 6px;
    font-weight: 600; color: #374151; }}
QListWidget::item {{ padding: 6px; }}
QListWidget::item:selected {{ background: #ede9fe; color: {TEXTO}; }}
QProgressBar {{ border: 1px solid #d1d5db; border-radius: 5px; background: white; height: 10px; text-align: center;
    font-size: 8pt; }}
QProgressBar::chunk {{ border-radius: 4px; background: #6366f1; }}
QTabWidget::pane {{ border: 1px solid {BORDE}; border-radius: 8px; background: white; top: -1px; }}
QTabBar::tab {{ padding: 7px 14px; border: none; color: {SUAVE}; }}
QTabBar::tab:selected {{ color: {TEXTO}; border-bottom: 2px solid {COLOR_PARTE[2]}; font-weight: 600; }}
QSlider::groove:horizontal {{ height: 6px; background: #e5e7eb; border-radius: 3px; }}
QSlider::handle:horizontal {{ width: 16px; margin: -6px 0; border-radius: 8px; background: {COLOR_PARTE[3]}; }}
QSplitter::handle {{ background: transparent; }}
QSplitter::handle:vertical {{ height: 10px; image: url({AGARRE_H}); }}
QSplitter::handle:horizontal {{ width: 10px; image: url({AGARRE_V}); }}
QSplitter::handle:hover {{ background: #e0e7ff; border-radius: 4px; }}
"""
