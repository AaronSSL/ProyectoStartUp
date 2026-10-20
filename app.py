"""TalentAI · aplicación de escritorio.

    .venv\\Scripts\\python.exe app.py        (o doble clic en iniciar.bat)
"""
import logging
import sys
from pathlib import Path

# Con pythonw (iniciar.bat) no hay consola: sin esto, las barras de progreso de los modelos fallan al escribir.
if sys.stdout is None or sys.stderr is None:
    _log = Path(__file__).resolve().parent / "datos" / "talentai.log"
    _log.parent.mkdir(exist_ok=True)
    sys.stdout = sys.stderr = open(_log, "a", encoding="utf-8", buffering=1)

import talentai  # noqa: F401  (configura el entorno antes de importar torch / Whisper)
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QApplication

from talentai.estilo import QSS
from talentai.ventana import Ventana


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    app = QApplication(sys.argv)
    app.setApplicationName("TalentAI")
    app.setFont(QFont("Segoe UI", 10))
    app.setStyleSheet(QSS)
    v = Ventana()
    v.showMaximized()   # con el escalado de Windows (150%), 1360x860 no entra en la pantalla
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
