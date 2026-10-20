"""Pruebas rápidas del núcleo (sin modelos pesados: usan TF-IDF y transcripciones sintéticas).

    .venv\\Scripts\\python.exe -m unittest discover pruebas
"""
import json
import tempfile
import unittest
from pathlib import Path

import talentai  # noqa: F401
from talentai import audio
from talentai.embeddings import Embedder
from talentai.matching_cv import rankear
from talentai.proyecto import Candidato, Convocatoria, Proyecto, Requisito, puntaje_final
from talentai.textos import fragmentar, leer_documento, nombre_desde_archivo

CONV = Convocatoria("Analista de Cobranzas", [Requisito("Experiencia en cobranzas y cartera morosa", 60),
                                               Requisito("Excel avanzado con tablas dinámicas", 40)])


def cand(nombre, texto):
    return Candidato.nuevo(nombre, f"{nombre}.txt", texto, fragmentar(texto))


def transcripcion(frases, ppm=140, hueco=0.3):
    """Transcripción sintética con tiempos por palabra al ritmo indicado."""
    t, segs = 0.0, []
    dur = 60 / ppm - 0.05
    for frase in frases:
        palabras = []
        for w in frase.split():
            palabras.append({"w": w, "ini": round(t, 2), "fin": round(t + dur, 2), "p": 0.95})
            t += 60 / ppm
        segs.append({"inicio": palabras[0]["ini"], "fin": palabras[-1]["fin"], "texto": frase, "palabras": palabras})
        t += hueco
    return {"segmentos": segs, "duracion": round(t, 2), "idioma": "es", "prob_idioma": 1.0,
            "dispositivo": "prueba", "modelo": "sintético"}


class TextosTest(unittest.TestCase):
    def test_fragmentos_unen_titulos_cortos_y_quitan_vinetas(self):
        frag = fragmentar("EXPERIENCIA\n• Gestión de cartera morosa de 600 clientes.\n- Reportes en Excel con tablas dinámicas.")
        self.assertEqual(frag[0], "EXPERIENCIA Gestión de cartera morosa de 600 clientes.")
        self.assertEqual(frag[1], "Reportes en Excel con tablas dinámicas.")

    def test_fragmentos_largos_se_parten(self):
        frag = fragmentar(" ".join(["Una oración bastante larga sobre cobranzas."] * 20))
        self.assertTrue(all(len(f) <= 320 for f in frag))

    def test_nombre_y_lectura_txt(self):
        self.assertEqual(nombre_desde_archivo("lucia_paredes_CV.pdf"), "Lucia Paredes")
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "cv.txt"
            ruta.write_text("Analista de cobranzas", encoding="cp1252")
            self.assertEqual(leer_documento(ruta), "Analista de cobranzas")


class MatchingTest(unittest.TestCase):
    def test_ranking_ordena_y_da_evidencia(self):
        a = cand("Ana", "Analista de cobranzas: gestión de cartera morosa.\nExcel avanzado con tablas dinámicas.")
        b = cand("Beto", "Cocinero de restaurante.\nPreparación de alimentos y control de insumos.")
        vacio = Candidato.nuevo("Vacío", "v.txt", "", [])
        res = rankear(CONV, [b, a, vacio], Embedder("tfidf"))
        self.assertEqual(res[a.id]["ranking"], 1)
        self.assertIn("cartera morosa", res[a.id]["por_requisito"][0]["evidencia"])
        self.assertEqual(res[vacio.id]["score"], 0.0)
        self.assertIsNone(res[vacio.id]["por_requisito"][0]["sim"])
        self.assertEqual(res[a.id]["firma"], CONV.firma())

    def test_pesos_normalizados(self):
        self.assertEqual(Convocatoria("x", [Requisito("a", 30), Requisito("b", 10)]).pesos_normalizados(), [0.75, 0.25])
        self.assertEqual(Convocatoria("x", [Requisito("a", 0), Requisito("b", 0)]).pesos_normalizados(), [0.5, 0.5])


class AudioTest(unittest.TestCase):
    def test_muletillas_solo_con_pausa(self):
        m = audio.contar_muletillas("Eh, este... bueno, o sea, este proyecto es bueno para mí, ¿no?")
        self.assertEqual(m["este…"], 1)          # "este proyecto" no cuenta
        self.assertEqual(m["bueno…"], 1)         # "es bueno para" no cuenta
        self.assertEqual(m["o sea"], 1)
        self.assertEqual(m["¿no?"], 1)
        self.assertEqual(m["eh / em / mmm"], 1)

    def test_ritmo(self):
        self.assertEqual(audio.puntaje_ritmo(130), 100)
        self.assertEqual(audio.puntaje_ritmo(60), 0)
        self.assertEqual(audio.puntaje_ritmo(220), 0)
        self.assertAlmostEqual(audio.puntaje_ritmo(85), 50)

    def test_negacion(self):
        self.assertTrue(audio.niega("De cobranzas, eh, no tengo experiencia."))
        self.assertTrue(audio.niega("Nunca he usado Excel"))
        self.assertFalse(audio.niega("Tengo tres años en cobranzas y no me rindo fácilmente con los clientes."))

    def test_metricas_y_analisis(self):
        tr = transcripcion(["Trabajo tres años en cobranzas gestionando cartera morosa.",
                            "Preparo reportes en Excel con tablas dinámicas."], ppm=140)
        m = audio.metricas_habla(tr["segmentos"], tr["duracion"])
        self.assertAlmostEqual(m["ppm"], 140, delta=12)
        self.assertEqual(m["pausas_largas"], 0)
        r = audio.analizar_entrevista(tr, CONV, Embedder("tfidf"))
        self.assertEqual(r["fluidez"], 100)
        self.assertIn("cobranzas", r["por_requisito"][0]["evidencia"])
        self.assertIn("Excel", r["por_requisito"][1]["evidencia"])
        self.assertGreater(r["puntaje"], 50)
        json.dumps(r)   # se puede guardar en la sesión

    def test_pausa_larga_baja_fluidez(self):
        tr = transcripcion(["Trabajo en cobranzas.", "Uso Excel.", "Negocio por teléfono."], ppm=140, hueco=4.0)
        r = audio.analizar_entrevista(tr, CONV, Embedder("tfidf"))
        self.assertEqual(r["metricas"]["pausas_largas"], 2)
        self.assertLess(r["fluidez"], 100)

    def test_audio_sin_voz(self):
        with self.assertRaises(ValueError):
            audio.analizar_entrevista(transcripcion(["Hola."]), CONV, Embedder("tfidf"))


class ProyectoTest(unittest.TestCase):
    def test_guardar_y_cargar(self):
        p = Proyecto(CONV, [cand("Ana", "Cobranzas y cartera morosa en financiera.")], peso_cv=40)
        p.candidatos[0].cv = {"score": 0.8}
        p.candidatos[0].entrevista = {"puntaje": 60.0}
        with tempfile.TemporaryDirectory() as d:
            p.guardar(Path(d) / "s.json")
            q = Proyecto.cargar(Path(d) / "s.json")
        self.assertEqual(q.convocatoria.firma(), CONV.firma())
        self.assertEqual(q.candidatos[0].nombre, "Ana")
        self.assertEqual(puntaje_final(q.candidatos[0], q.peso_cv), (0.8 * 100 * 0.4 + 60 * 0.6, "completo"))

    def test_puntaje_final_con_una_parte(self):
        c = cand("Ana", "texto de prueba suficiente")
        self.assertEqual(puntaje_final(c, 50), (None, "sin datos"))
        c.cv = {"score": 0.5}
        self.assertEqual(puntaje_final(c, 50), (50.0, "solo CV"))


class SupabaseTest(unittest.TestCase):
    """Conversión de filas de Supabase (sintéticas) a la sesión de TalentAI; no se conecta a la red."""
    AVISO = {"aviso_id": "999", "titulo": "Analista", "criterios_version": "Bumeran abc",
             "criterios": [{"label": "Experiencia en cobranzas", "weightPct": 60}, {"label": "Excel", "weightPct": 40}]}
    POST = [{"clave": "k1", "id_postulante": "aperez123", "nombre": "ANA", "apellido": "PÉREZ",
             "datos_json": json.dumps({"Exp[1] Puesto": "Gestora de cobranza", "Exp[1] Descripción": "Cartera morosa",
                                       "Est[1] Titulo": "Administración", "Est[1] Estado": "Graduado",
                                       "Idiomas": "Inglés básico", "Nombre": "Ana", "DNI": "00000000"})},
            {"clave": "k2", "id_postulante": "bruiz456", "nombre": "Beto", "apellido": "Ruiz", "datos_json": {}}]
    RANK = [{"clave": "k1", "backend": "e5", "ranking": 1, "score": 1.0, "score_bruto": 0.86, "req_sims": [1.0, 0.4],
             "req_sims_bruto": [0.88, 0.8], "req_fragmentos": ["Exp[1] Gestora de cobranza", "Idiomas"],
             "calculado_at": "2026-10-12T09:06:00"}]

    def test_armar_proyecto(self):
        from talentai.supabase_gth import armar_proyecto
        p = armar_proyecto(self.AVISO, self.POST, self.RANK)
        self.assertEqual([r.peso for r in p.convocatoria.requisitos], [60.0, 40.0])
        ana, beto = p.candidatos
        self.assertEqual(ana.nombre, "Ana Pérez")
        self.assertEqual(ana.cv["firma"], p.convocatoria.firma())
        self.assertEqual(ana.cv["por_requisito"][0]["evidencia"],
                         "Experiencia: Gestora de cobranza. Funciones: Cartera morosa")
        self.assertEqual(ana.cv["por_requisito"][1]["evidencia"], "Idiomas: Inglés básico")
        self.assertNotIn("00000000", ana.texto_cv)          # solo experiencia, estudios e idiomas
        self.assertIsNone(beto.cv)
        self.assertEqual(p.origen["aviso_id"], "999")

    def test_reimportar_conserva_trabajo_local(self):
        from talentai.supabase_gth import armar_proyecto, combinar_con_local
        anterior = armar_proyecto(self.AVISO, self.POST, self.RANK)
        anterior.candidatos[0].decision, anterior.candidatos[0].entrevista = "Avanza", {"puntaje": 80.0}
        anterior.peso_cv = 30
        nuevo = combinar_con_local(armar_proyecto(self.AVISO, self.POST, self.RANK), anterior)
        self.assertEqual(nuevo.candidatos[0].decision, "Avanza")
        self.assertEqual(nuevo.candidatos[0].entrevista, {"puntaje": 80.0})
        self.assertEqual(nuevo.peso_cv, 30)

    def test_aviso_sin_criterios(self):
        from talentai.supabase_gth import armar_proyecto
        p = armar_proyecto({**self.AVISO, "criterios": None}, self.POST, [])
        self.assertEqual([r.texto for r in p.convocatoria.requisitos], ["Analista"])


if __name__ == "__main__":
    unittest.main()
