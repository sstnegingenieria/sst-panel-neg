"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ingerirRadarSecopManana: () => ingerirRadarSecopManana,
  ingerirRadarSecopTarde: () => ingerirRadarSecopTarde
});
module.exports = __toCommonJS(index_exports);
var import_scheduler = require("firebase-functions/v2/scheduler");
var import_firebase_functions = require("firebase-functions");
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");
var import_node_crypto = require("node:crypto");

// ../src/utils/sigp/semaforo.ts
var SEMAFORO_VERSION = "v1.0";
var DEPARTAMENTOS_NEG = [
  "Distrito Capital de Bogot\xE1",
  "Cundinamarca"
];
function normalizarDepartamento(d) {
  return d.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}
var DEPARTAMENTOS_NEG_NORM = DEPARTAMENTOS_NEG.map(normalizarDepartamento);
function esTerritorioNeg(departamento) {
  return DEPARTAMENTOS_NEG_NORM.includes(normalizarDepartamento(departamento));
}
function calcularSemaforo(input) {
  if (input.modalidad !== "minima_cuantia") {
    return {
      semaforo: "rojo",
      motivos: ["MODALIDAD_SIN_HISTORIAL"],
      version: SEMAFORO_VERSION
    };
  }
  const motivos = [];
  if (input.tiene_sorteo) motivos.push("SORTEO");
  if (input.limitacion_mipyme && !esTerritorioNeg(input.departamento)) {
    motivos.push("LIMITACION_MIPYME");
  }
  if (input.requiere_lectura) motivos.push("REQUIERE_LECTURA");
  return {
    semaforo: motivos.length > 0 ? "amarillo" : "verde",
    motivos,
    version: SEMAFORO_VERSION
  };
}

// ../functions/scripts/vocabulario-neg-v1.0.json
var vocabulario_neg_v1_0_default = {
  version: "v1.0",
  definicion: "L\xE9xico del trabajo que NEG hace, para clasificar un proceso de SECOP II cuando su c\xF3digo UNSPC todav\xEDa no est\xE1 asignado. Un objeto contratado que contiene CUALQUIERA de los t\xE9rminos (unigramas o bigramas, sobre el texto normalizado sin tildes y en may\xFAsculas) se clasifica como \xABprobable\xBB y pasa a lectura humana. El l\xE9xico NO decide por s\xED solo: el c\xF3digo UNSPC, cuando existe, manda.",
  derivacion: "Derivado de los datos, no redactado. Corpus POSITIVO (395 objetos): los 23 procesos que NEG gan\xF3 en SECOP II (dataset p6dx-8zbt, nit_del_proveedor_adjudicado=900975870 \u2014 24 filas que colapsan a 23 procesos) m\xE1s los 372 registros del registro hist\xF3rico CM-FT-CPG-26 de Karen le\xEDdos de producci\xF3n (coleccion licitaciones, migrado=true, los 372 con objeto no vac\xEDo). Corpus NEGATIVO (16.807 objetos): los procesos de 2025 de Bogot\xE1 + Cundinamarca en las modalidades de ingesta cuyo c\xF3digo UNSPC existe y est\xE1 FUERA de las tres familias del RUP de NEG \u2014 es decir, lo que NEG no hace, con etiqueta real y no supuesta. M\xE9todo: unigramas y bigramas de 4+ caracteres sin palabras funcionales; para cada t\xE9rmino, frecuencia documental en positivos y en negativos, y lift = (DF_pos + 1/n_pos) / (DF_neg + 1/n_neg). Corte: DF_pos >= 8 documentos y lift >= 10.",
  metricas: {
    corpus_positivo: 395,
    corpus_positivo_detalle: "23 ganados en SECOP + 372 del registro de Karen",
    corpus_negativo: 16807,
    terminos: 48,
    recall_positivos_pct: 84.8,
    recall_ganados: "19 de 23",
    falsos_positivos_fondo_pct: 7.1,
    falsos_positivos_fondo: "1.197 de 16.807",
    validacion_independiente: "Derivando el l\xE9xico SOLO del registro de Karen (372 objetos, sin mirar los ganados de SECOP) y midi\xE9ndolo contra los 23 que NEG gan\xF3: 19 de 23 (83%) con 7,3% de falsos positivos en el fondo. La cifra de recall de este documento NO es la prueba \u2014 esa es en muestra; la prueba es el 83% fuera de muestra.",
    carga_medida: "Sobre las 2.303 filas UNSPECIFIED de octubre y noviembre de 2026 en el territorio (lo que el radar ve hoy), el l\xE9xico marca 316 como \xABprobable\xBB \u2014 111 de ellas m\xEDnima cuant\xEDa (verdes) y el resto menor cuant\xEDa, que el portero del sem\xE1foro ya frena. Son unas 11 por d\xEDa h\xE1bil, de las cuales ~4 llegan en verde. Con el filtro por familia a nivel de API, en todo octubre se habr\xEDan visto 21 procesos."
  },
  excluidos: {
    clientes_y_lugares: [
      "PALACIO",
      "PALACIO JUSTICIA",
      "REGISTRADURIA",
      "REGISTRADURIA MUNICIPAL",
      "SEDE REGISTRADURIA",
      "SEDE DELEGACION",
      "ICBF",
      "TORRE",
      "TORRES",
      "TUNJA",
      "HUILA",
      "CAUCA"
    ],
    motivo_clientes_y_lugares: "Salieron con lift alto porque describen A QUI\xC9N le vendi\xF3 NEG y D\xD3NDE, no QU\xC9 hace. Dejarlos har\xEDa que el radar marque cualquier proceso de la Registradur\xEDa o del ICBF, incluida la cafeter\xEDa, y cualquiera en Tunja. Son un artefacto de la clientela del registro hist\xF3rico.",
    forma_contractual: [
      "PRECIOS",
      "UNITARIOS",
      "FIJOS",
      "FORMULA",
      "REAJUSTE",
      "SISTEMA PRECIOS",
      "PRECIOS UNITARIOS",
      "UNITARIOS FIJOS",
      "FIJOS FORMULA",
      "FORMULA REAJUSTE",
      "REAJUSTE ADECUACION",
      "CONTRATAR SISTEMA"
    ],
    motivo_forma_contractual: "Describen la FORMA del contrato (precios unitarios fijos, sin f\xF3rmula de reajuste), no el trabajo. Discriminan bien porque la obra se contrata as\xED y el software no, pero dependen de la redacci\xF3n del pliego y no del objeto; incluirlos sumaba 1,5 puntos de recall y 1,7 de falsos positivos. Quedan registrados ac\xE1 para que la decisi\xF3n sea revisable."
  },
  limitaciones: "El l\xE9xico sale de lo que NEG PERSIGUI\xD3 (registro de Karen) y de lo que GAN\xD3 (SECOP), no de lo que PODR\xCDA hacer: un servicio nuevo que NEG nunca haya cotizado no est\xE1 en el l\xE9xico y saldr\xEDa \xABno\xBB. Por eso el agregado de cada corrida cuenta los descartes por motivo \u2014 incluidos los que el c\xF3digo descarta pese a coincidir el texto \u2014 y por eso el l\xE9xico es un documento versionado y no una constante: se revisa con la evidencia de las corridas. Dos huecos medidos y conocidos: (1) de los 23 procesos que NEG gan\xF3, 3 tienen c\xF3digo presente y FUERA de las tres familias (V1.30171706 adecuaci\xF3n de ambientes, V1.31162800 ferreter\xEDa, V1.83101800 subestaci\xF3n el\xE9ctrica) \u2014 con la regla de clasificaci\xF3n vigente esos tres habr\xEDan salido \xABno\xBB; el texto coincide en 2 de los 3, as\xED que el agregado los cuenta como descartados-por-c\xF3digo-con-texto-coincidente. (2) NEG ha ganado en Antioquia y Boyac\xE1, fuera del territorio de la ingesta.",
  terminos: [
    "LOCATIVAS INFRAESTRUCTURAS",
    "MANTENIMIENTO CUBIERTA",
    "REPARACION CONSERVACION",
    "MEJORAMIENTO ADECUACIONES",
    "INTEGRAL REPARACION",
    "CONSERVACION MEJORAMIENTO",
    "MANTENIMIENTO SEDE",
    "INFRAESTRUCTURA FISICA",
    "CUBIERTAS",
    "CUBIERTA",
    "ADECUACIONES LOCATIVAS",
    "PLANTA FISICA",
    "ADECUACION MANTENIMIENTO",
    "EJECUCION OBRAS",
    "IMPERMEABILIZACION",
    "CONTRATAR ADECUACION",
    "MEJORAMIENTO INFRAESTRUCTURA",
    "INFRAESTRUCTURAS",
    "CORRECTIVO INFRAESTRUCTURA",
    "REALIZAR OBRAS",
    "ADECUACIONES",
    "OBRAS MANTENIMIENTO",
    "LOCATIVAS",
    "ADECUACION MEJORAMIENTO",
    "MEJORAMIENTO MANTENIMIENTO",
    "ADECUACION INFRAESTRUCTURA",
    "MANTENIMIENTO INSTALACIONES",
    "MANTENIMIENTO INFRAESTRUCTURA",
    "REPARACIONES LOCATIVAS",
    "FISICA",
    "PREVENTIVOS CORRECTIVOS",
    "CIVILES",
    "MANTENIMIENTO ADECUACION",
    "ADECUACION",
    "OBRAS",
    "REPARACIONES",
    "ACTIVIDADES MANTENIMIENTO",
    "BIENES INMUEBLES",
    "MANTENIMIENTOS PREVENTIVOS",
    "FISICAS",
    "MANTENIMIENTOS",
    "MANTENIMIENTO MEJORAMIENTO",
    "PREVENTIVOS",
    "EDIFICIO",
    "INFRAESTRUCTURA",
    "CONTRATAR OBRAS",
    "REPARACION",
    "REALIZAR ACTIVIDADES"
  ],
  frecuencias: {
    "LOCATIVAS INFRAESTRUCTURAS": {
      pos: 8,
      fondo: 0,
      lift: 382.9
    },
    "MANTENIMIENTO CUBIERTA": {
      pos: 8,
      fondo: 2,
      lift: 127.6
    },
    "REPARACION CONSERVACION": {
      pos: 11,
      fondo: 3,
      lift: 127.6
    },
    "MEJORAMIENTO ADECUACIONES": {
      pos: 11,
      fondo: 3,
      lift: 127.6
    },
    "INTEGRAL REPARACION": {
      pos: 10,
      fondo: 3,
      lift: 117
    },
    "CONSERVACION MEJORAMIENTO": {
      pos: 12,
      fondo: 4,
      lift: 110.6
    },
    "MANTENIMIENTO SEDE": {
      pos: 19,
      fondo: 7,
      lift: 106.4
    },
    "INFRAESTRUCTURA FISICA": {
      pos: 48,
      fondo: 21,
      lift: 94.8
    },
    CUBIERTAS: {
      pos: 29,
      fondo: 13,
      lift: 91.2
    },
    CUBIERTA: {
      pos: 30,
      fondo: 14,
      lift: 87.9
    },
    "ADECUACIONES LOCATIVAS": {
      pos: 21,
      fondo: 11,
      lift: 78
    },
    "PLANTA FISICA": {
      pos: 10,
      fondo: 5,
      lift: 78
    },
    "ADECUACION MANTENIMIENTO": {
      pos: 44,
      fondo: 25,
      lift: 73.6
    },
    "EJECUCION OBRAS": {
      pos: 9,
      fondo: 5,
      lift: 70.9
    },
    IMPERMEABILIZACION: {
      pos: 20,
      fondo: 12,
      lift: 68.7
    },
    "CONTRATAR ADECUACION": {
      pos: 13,
      fondo: 9,
      lift: 59.6
    },
    "MEJORAMIENTO INFRAESTRUCTURA": {
      pos: 17,
      fondo: 12,
      lift: 58.9
    },
    INFRAESTRUCTURAS: {
      pos: 11,
      fondo: 8,
      lift: 56.7
    },
    "CORRECTIVO INFRAESTRUCTURA": {
      pos: 8,
      fondo: 6,
      lift: 54.7
    },
    "REALIZAR OBRAS": {
      pos: 10,
      fondo: 8,
      lift: 52
    },
    ADECUACIONES: {
      pos: 48,
      fondo: 41,
      lift: 49.6
    },
    "OBRAS MANTENIMIENTO": {
      pos: 20,
      fondo: 18,
      lift: 47
    },
    LOCATIVAS: {
      pos: 39,
      fondo: 36,
      lift: 46
    },
    "ADECUACION MEJORAMIENTO": {
      pos: 15,
      fondo: 16,
      lift: 40
    },
    "MEJORAMIENTO MANTENIMIENTO": {
      pos: 14,
      fondo: 22,
      lift: 27.7
    },
    "ADECUACION INFRAESTRUCTURA": {
      pos: 11,
      fondo: 18,
      lift: 26.9
    },
    "MANTENIMIENTO INSTALACIONES": {
      pos: 11,
      fondo: 19,
      lift: 25.5
    },
    "MANTENIMIENTO INFRAESTRUCTURA": {
      pos: 20,
      fondo: 36,
      lift: 24.1
    },
    "REPARACIONES LOCATIVAS": {
      pos: 12,
      fondo: 22,
      lift: 24
    },
    FISICA: {
      pos: 63,
      fondo: 113,
      lift: 23.9
    },
    "PREVENTIVOS CORRECTIVOS": {
      pos: 9,
      fondo: 17,
      lift: 23.6
    },
    CIVILES: {
      pos: 8,
      fondo: 16,
      lift: 22.5
    },
    "MANTENIMIENTO ADECUACION": {
      pos: 41,
      fondo: 80,
      lift: 22.1
    },
    ADECUACION: {
      pos: 144,
      fondo: 285,
      lift: 21.6
    },
    OBRAS: {
      pos: 52,
      fondo: 111,
      lift: 20.1
    },
    REPARACIONES: {
      pos: 15,
      fondo: 33,
      lift: 20
    },
    "ACTIVIDADES MANTENIMIENTO": {
      pos: 14,
      fondo: 31,
      lift: 19.9
    },
    "BIENES INMUEBLES": {
      pos: 14,
      fondo: 31,
      lift: 19.9
    },
    "MANTENIMIENTOS PREVENTIVOS": {
      pos: 8,
      fondo: 19,
      lift: 19.1
    },
    FISICAS: {
      pos: 8,
      fondo: 21,
      lift: 17.4
    },
    MANTENIMIENTOS: {
      pos: 18,
      fondo: 52,
      lift: 15.3
    },
    "MANTENIMIENTO MEJORAMIENTO": {
      pos: 16,
      fondo: 50,
      lift: 14.2
    },
    PREVENTIVOS: {
      pos: 9,
      fondo: 30,
      lift: 13.7
    },
    EDIFICIO: {
      pos: 20,
      fondo: 66,
      lift: 13.3
    },
    INFRAESTRUCTURA: {
      pos: 100,
      fondo: 336,
      lift: 12.8
    },
    "CONTRATAR OBRAS": {
      pos: 8,
      fondo: 30,
      lift: 12.4
    },
    REPARACION: {
      pos: 27,
      fondo: 114,
      lift: 10.4
    },
    "REALIZAR ACTIVIDADES": {
      pos: 12,
      fondo: 54,
      lift: 10.1
    }
  }
};

// ../src/types/sigp/vocabularioNeg.ts
var VOCABULARIO_NEG_VERSION = vocabulario_neg_v1_0_default.version;
var TERMINOS_NEG = vocabulario_neg_v1_0_default.terminos;
var FRECUENCIAS_NEG = vocabulario_neg_v1_0_default.frecuencias;
var PALABRAS_FUNCIONALES = [
  "PARA",
  "COMO",
  "ESTE",
  "ESTA",
  "ESTOS",
  "ESTAS",
  "DESDE",
  "HASTA",
  "SOBRE",
  "ENTRE",
  "SEGUN",
  "DEMAS",
  "CUAL",
  "CUALES",
  "TODO",
  "TODA",
  "TODOS",
  "TODAS",
  "OTRO",
  "OTRA",
  "OTROS",
  "OTRAS",
  "MISMO",
  "MISMA",
  "DICHO",
  "DICHA",
  "ANTE",
  "BAJO",
  "CADA",
  "SINO",
  "PERO",
  "DEL",
  "LAS",
  "LOS",
  "POR",
  "CON",
  "QUE",
  "SUS",
  "UNA",
  "UNO",
  "UNOS",
  "UNAS",
  "SIN",
  "SER",
  "SEA",
  "SON",
  "ESE",
  "ESA",
  "ANO",
  "ANOS",
  "DONDE",
  "CUYO",
  "CUYA",
  "VIGENCIA",
  "VIGENCIAS",
  "OBJETO",
  "ACUERDO",
  "MARCO",
  "NOMBRE",
  "NECESARIAS",
  "NECESARIOS",
  "UBICADAS",
  "UBICADOS",
  "REQUERIDAS",
  "REQUERIDOS"
];
var FUNCIONALES = new Set(PALABRAS_FUNCIONALES);
var LARGO_MINIMO_PALABRA = 4;
function normalizarObjeto(texto2) {
  return (texto2 ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9ÑÜ]+/g, " ").replace(/\s+/g, " ").trim();
}
function terminosDelObjeto(texto2) {
  const palabras = normalizarObjeto(texto2).split(" ").filter((p) => p.length >= LARGO_MINIMO_PALABRA && !FUNCIONALES.has(p));
  const salida = new Set(palabras);
  for (let i = 0; i < palabras.length - 1; i++) {
    salida.add(`${palabras[i]} ${palabras[i + 1]}`);
  }
  return salida;
}
function coincideVocabulario(objeto, terminos = TERMINOS_NEG) {
  const presentes = terminosDelObjeto(objeto);
  const hallados = terminos.filter((t) => presentes.has(t));
  return { coincide: hallados.length > 0, terminos: hallados };
}
function terminosVigentes(registro) {
  const v = registro?.versiones?.[registro.version_actual];
  if (!v || !Array.isArray(v.terminos) || v.terminos.length === 0) return TERMINOS_NEG;
  return v.terminos;
}
function versionVocabularioVigente(registro) {
  const v = registro?.versiones?.[registro.version_actual];
  if (!v || !Array.isArray(v.terminos) || v.terminos.length === 0) {
    return `${VOCABULARIO_NEG_VERSION} (empaquetada)`;
  }
  return registro.version_actual;
}

// ../src/utils/sigp/secopMapeo.ts
var CAMPO_SECOP = {
  id_secop: "id_del_proceso",
  numero_proceso: "referencia_del_proceso",
  "entidad.nombre": "entidad",
  "entidad.nit": "nit_entidad",
  "entidad.departamento": "departamento_entidad",
  "entidad.ciudad": "ciudad_entidad",
  "entidad.orden": "ordenentidad",
  objeto: "descripci_n_del_procedimiento",
  categoria_unspsc: "codigo_principal_de_categoria",
  modalidad: "modalidad_de_contratacion",
  presupuesto_oficial: "precio_base",
  lotes: "numero_de_lotes",
  "cronograma.publicacion": "fecha_de_publicacion_del",
  // Verificado contra el dato (B.1b): es la fecha de RECEPCIÓN DE OFERTAS, o
  // sea el cierre — cae entre 4 y 13 días después de la publicación y coincide
  // con `fecha_de_apertura_de_respuesta` en las mínimas cuantías. Es además el
  // respaldo de fecha cuando no hay publicación (trampa 12).
  "cronograma.cierre": "fecha_de_recepcion_de",
  url_proceso: "urlproceso",
  ofertas_recibidas: "respuestas_al_procedimiento",
  "ganador.nit": "nit_del_proveedor_adjudicado",
  "ganador.nombre": "nombre_del_proveedor",
  oferta_ganador: "valor_total_adjudicacion"
};
var CENTINELAS_SECOP = ["NO DEFINIDO", "NO DEFINIDA", "N/A", "NA", "SIN DEFINIR"];
function norm(v) {
  if (v === null || v === void 0) return "";
  return String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}
function texto(fila, campo) {
  const v = fila[campo];
  if (v === null || v === void 0) return "";
  if (typeof v === "object") return "";
  return String(v).replace(/\s+/g, " ").trim();
}
function textoONull(fila, campo) {
  const s = texto(fila, campo);
  if (s === "") return null;
  if (CENTINELAS_SECOP.includes(norm(s))) return null;
  return s;
}
function numeroSecop(fila, campo) {
  const v = fila[campo];
  if (v === null || v === void 0 || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
var TOPE_PRESUPUESTO_COP = 1e13;
function problemaPresupuesto(n) {
  if (n === null) return "ausente";
  if (n < 0) return "negativo";
  if (n === 0) return "cero";
  if (n > TOPE_PRESUPUESTO_COP) return "absurdo";
  return null;
}
var OFFSET_COLOMBIA_HORAS = -5;
function fechaSecopAIso(fila, campo) {
  const s = texto(fila, campo);
  if (s === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?)?$/.exec(s);
  if (!m) return null;
  const [a, mes, dia] = [+m[1], +m[2], +m[3]];
  const [hh, mm, ss] = [+(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (hh > 23 || mm > 59 || ss > 59) return null;
  if (a < 1990 || a > 2099) return null;
  const civil = new Date(Date.UTC(a, mes - 1, dia));
  if (civil.getUTCFullYear() !== a || civil.getUTCMonth() !== mes - 1 || civil.getUTCDate() !== dia) return null;
  const d = new Date(Date.UTC(a, mes - 1, dia, hh - OFFSET_COLOMBIA_HORAS, mm, ss));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function fechaReferencia(fila) {
  const pub = fechaSecopAIso(fila, CAMPO_SECOP["cronograma.publicacion"]);
  if (pub !== null) return { iso: pub, origen: "publicacion" };
  const rec = fechaSecopAIso(fila, CAMPO_SECOP["cronograma.cierre"]);
  if (rec !== null) return { iso: rec, origen: "recepcion_de_ofertas" };
  return { iso: null, origen: "ninguna" };
}
function urlSecop(fila, campo) {
  const v = fila[campo];
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && "url" in v) {
    const u = v.url;
    return typeof u === "string" ? u.trim() : "";
  }
  return "";
}
function esUrlGenerica(url) {
  if (url === "") return true;
  return !/noticeUID=|OpportunityDetail/i.test(url);
}
var FAMILIAS_RUP_NEG = ["V1.7210", "V1.7215", "V1.8110"];
var CLASES_CON_ADJUDICACION_NEG = [
  "V1.301717",
  "V1.311628",
  "V1.831018"
];
var CATEGORIA_SIN_CLASIFICAR = "UNSPECIFIED";
function categoriaONull(fila) {
  const s = textoONull(fila, CAMPO_SECOP.categoria_unspsc);
  if (s === null) return null;
  if (norm(s) === CATEGORIA_SIN_CLASIFICAR) return null;
  return s;
}
function origenCodigoNeg(categoria) {
  if (categoria === null) return null;
  const c = norm(categoria);
  if (FAMILIAS_RUP_NEG.some((f) => c.startsWith(norm(f)))) return "familia";
  if (CLASES_CON_ADJUDICACION_NEG.some((k) => c.startsWith(norm(k)))) return "clase";
  return null;
}
function familiaRup(categoria) {
  if (categoria === null) return "sin_clasificar";
  return origenCodigoNeg(categoria) !== null ? "familia_neg" : "fuera_de_familia";
}
var DEPARTAMENTOS_OBSERVADOS = ["Antioquia", "Boyac\xE1"];
function clasificarProceso(categoria, objeto, terminos, contexto) {
  const familia = familiaRup(categoria);
  const origen_codigo = origenCodigoNeg(categoria);
  const { coincide, terminos: hallados } = coincideVocabulario(objeto, terminos);
  const base = { familia, origen_codigo, habria_calificado: false };
  let v;
  if (familia === "familia_neg") {
    v = {
      ...base,
      veredicto: "si",
      // Tres señales distintas y no una: familia del RUP, clase con el texto
      // de acuerdo, y clase SIN que el texto diga nada (los de ferretería
      // pura, que entran por evidencia). Así el aporte de cada decisión se
      // mide por separado corrida por corrida.
      senal: origen_codigo === "clase" ? coincide ? "codigo_en_clase_con_texto" : "codigo_en_clase_sin_texto" : "codigo_en_familia",
      terminos: hallados,
      descartado_con_texto_coincidente: false
    };
  } else if (familia === "fuera_de_familia") {
    v = {
      ...base,
      veredicto: "no",
      senal: "codigo_fuera_de_familia",
      terminos: hallados,
      descartado_con_texto_coincidente: coincide
    };
  } else if (coincide) {
    v = {
      ...base,
      veredicto: "probable",
      senal: "texto_coincide",
      terminos: hallados,
      descartado_con_texto_coincidente: false
    };
  } else {
    v = {
      ...base,
      veredicto: "no",
      senal: "sin_codigo_ni_texto",
      terminos: [],
      descartado_con_texto_coincidente: false
    };
  }
  const depto = contexto?.departamento;
  if (depto !== void 0 && depto !== "" && !esTerritorioNeg(depto)) {
    return {
      ...v,
      veredicto: "no",
      senal: "fuera_de_territorio",
      senal_previa: v.senal,
      habria_calificado: sePersiste(v.veredicto)
    };
  }
  return v;
}
var VEREDICTOS_PERSISTIBLES = ["si", "probable"];
var sePersiste = (v) => VEREDICTOS_PERSISTIBLES.includes(v);
var MODALIDAD_SECOP = {
  "MINIMA CUANTIA": "minima_cuantia",
  "SELECCION ABREVIADA DE MENOR CUANTIA": "menor_cuantia",
  // Trampa 11: menor cuantía SIN manifestación de interés — entra.
  "SELECCION ABREVIADA MENOR CUANTIA SIN MANIFESTACION INTERES": "menor_cuantia",
  "SELECCION ABREVIADA SUBASTA INVERSA": "seleccion_abreviada",
  "LICITACION PUBLICA": "licitacion_publica",
  "LICITACION PUBLICA OBRA PUBLICA": "licitacion_publica",
  "LICITACION PUBLICA ACUERDO MARCO DE PRECIOS": "licitacion_publica",
  "CONTRATACION REGIMEN ESPECIAL": "regimen_especial",
  "CONTRATACION REGIMEN ESPECIAL (CON OFERTAS)": "regimen_especial",
  // Las que no tienen equivalente en el vocabulario del módulo caen en 'otra'
  // de forma EXPLÍCITA, no por el fallback: así se distingue "no aplica" de
  // "apareció una modalidad nueva y nadie la vio".
  "CONTRATACION DIRECTA": "otra",
  "CONTRATACION DIRECTA (CON OFERTAS)": "otra",
  "CONCURSO DE MERITOS ABIERTO": "otra",
  "CONCURSO DE MERITOS CON PRECALIFICACION": "otra",
  "SOLICITUD DE INFORMACION A LOS PROVEEDORES": "otra",
  "SUBASTA DE PRUEBA": "otra",
  "ENAJENACION DE BIENES CON SUBASTA": "otra",
  "ENAJENACION DE BIENES CON SOBRE CERRADO": "otra"
};
function mapearModalidadSecop(fila) {
  const crudo = texto(fila, CAMPO_SECOP.modalidad);
  const conocida = MODALIDAD_SECOP[norm(crudo)];
  return conocida !== void 0 ? { modalidad: conocida, crudo, imprevista: false } : { modalidad: "otra", crudo, imprevista: true };
}
function docIdSecop(idProceso, hash2) {
  const legible = idProceso.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
  return `secop_${legible}_${hash2(idProceso.trim())}`;
}
var CAMPOS_ESTABLES = [
  CAMPO_SECOP.numero_proceso,
  CAMPO_SECOP["entidad.nombre"],
  CAMPO_SECOP["entidad.nit"],
  CAMPO_SECOP["entidad.departamento"],
  CAMPO_SECOP.objeto,
  CAMPO_SECOP.modalidad,
  CAMPO_SECOP.presupuesto_oficial,
  CAMPO_SECOP["cronograma.publicacion"]
];
function colapsarPorProceso(filas) {
  const grupos = /* @__PURE__ */ new Map();
  let sin_identidad = 0;
  for (const f of filas) {
    const id = texto(f, CAMPO_SECOP.id_secop);
    if (id === "") {
      sin_identidad++;
      continue;
    }
    const g = grupos.get(id);
    if (g) g.push(f);
    else grupos.set(id, [f]);
  }
  const procesos = [];
  for (const [id_secop, g] of grupos) {
    const representante = g[0];
    const parejas = /* @__PURE__ */ new Set();
    const valores = /* @__PURE__ */ new Set();
    for (const f of g) {
      const nombre = textoONull(f, CAMPO_SECOP["ganador.nombre"]);
      const nit = textoONull(f, CAMPO_SECOP["ganador.nit"]);
      if (nombre !== null || nit !== null) parejas.add(`${nit ?? ""}|${nombre ?? ""}`);
      const v = numeroSecop(f, CAMPO_SECOP.oferta_ganador);
      if (v !== null && v > 0) valores.add(v);
    }
    const unico = parejas.size === 1 && valores.size <= 1;
    const ambigua = parejas.size > 1 || valores.size > 1;
    let ganador = null;
    let oferta_ganador = null;
    if (unico) {
      const nombre = textoONull(representante, CAMPO_SECOP["ganador.nombre"]);
      if (nombre !== null) {
        ganador = { nombre, nit: textoONull(representante, CAMPO_SECOP["ganador.nit"]) };
      }
      const [v] = [...valores];
      oferta_ganador = v ?? null;
    }
    const campos_divergentes = CAMPOS_ESTABLES.filter((c) => {
      const vistos = new Set(g.map((f) => JSON.stringify(f[c] ?? null)));
      return vistos.size > 1;
    });
    procesos.push({
      id_secop,
      representante,
      filas: g.length,
      proveedores: parejas.size,
      valores: valores.size,
      ganador,
      oferta_ganador,
      adjudicacion_ambigua: ambigua,
      campos_divergentes
    });
  }
  return { procesos, sin_identidad };
}
function entradaSemaforoSecop(d) {
  return {
    modalidad: d.modalidad,
    tiene_sorteo: false,
    limitacion_mipyme: false,
    departamento: d.entidad.departamento,
    requiere_lectura: false
  };
}
function mapearProceso(p, hash2, terminos = TERMINOS_NEG, vocabulario_version = VOCABULARIO_NEG_VERSION) {
  const f = p.representante;
  const id_secop = p.id_secop.trim();
  if (id_secop === "") return null;
  const categoria_cruda = textoONull(f, CAMPO_SECOP.categoria_unspsc);
  const categoria_unspsc = categoriaONull(f);
  const mod = mapearModalidadSecop(f);
  const presupuesto_crudo = numeroSecop(f, CAMPO_SECOP.presupuesto_oficial);
  const problema = problemaPresupuesto(presupuesto_crudo);
  const url_proceso = urlSecop(f, CAMPO_SECOP.url_proceso);
  const objeto = texto(f, CAMPO_SECOP.objeto);
  const departamento = textoONull(f, CAMPO_SECOP["entidad.departamento"]) ?? "";
  const clasificacion = clasificarProceso(categoria_unspsc, objeto, terminos, { departamento });
  const fecha = fechaReferencia(f);
  const publicacion = fechaSecopAIso(f, CAMPO_SECOP["cronograma.publicacion"]);
  const cierre = fechaSecopAIso(f, CAMPO_SECOP["cronograma.cierre"]);
  const entidad = {
    nombre: texto(f, CAMPO_SECOP["entidad.nombre"]),
    nit: texto(f, CAMPO_SECOP["entidad.nit"]),
    orden: texto(f, CAMPO_SECOP["entidad.orden"]),
    departamento,
    ciudad: textoONull(f, CAMPO_SECOP["entidad.ciudad"]) ?? ""
  };
  const sem = calcularSemaforo(entradaSemaforoSecop({ modalidad: mod.modalidad, entidad }));
  const doc = {
    consecutivo: "",
    numero_proceso: texto(f, CAMPO_SECOP.numero_proceso),
    id_secop,
    origen: "secop_ii",
    url_proceso,
    entidad,
    objeto,
    categoria_unspsc,
    modalidad: mod.modalidad,
    presupuesto_oficial: problema === null ? presupuesto_crudo : null,
    lotes: numeroSecop(f, CAMPO_SECOP.lotes) ?? 0,
    cronograma: {
      publicacion,
      manifestacion: null,
      sorteo: null,
      cierre,
      adjudicacion: null
    },
    semaforo: sem.semaforo,
    semaforo_motivos: sem.motivos,
    semaforo_version: sem.version,
    override_manual: null,
    estado: "detectada",
    motivo_descarte: null,
    oferta_neg: null,
    oferta_ganador: p.oferta_ganador,
    ganador: p.ganador,
    manifestaciones: null,
    ofertas_recibidas: numeroSecop(f, CAMPO_SECOP.ofertas_recibidas),
    migrado: false,
    capacidad_manual: null,
    activa: true,
    radar: {
      senal: clasificacion.senal,
      terminos: clasificacion.terminos,
      vocabulario_version,
      corrida: null
    }
  };
  const meta = {
    doc_id: docIdSecop(id_secop, hash2),
    clasificacion,
    origen_fecha: fecha.origen,
    familia_rup: clasificacion.familia,
    categoria_cruda,
    modalidad_cruda: mod.crudo,
    modalidad_imprevista: mod.imprevista,
    problema_presupuesto: problema,
    presupuesto_crudo,
    url_generica: esUrlGenerica(url_proceso),
    filas_origen: p.filas,
    adjudicacion_ambigua: p.adjudicacion_ambigua,
    campos_divergentes: p.campos_divergentes,
    sin_fecha_publicacion: publicacion === null
  };
  return { doc, meta };
}
function guardaIdentidad(registros) {
  const porDocId = /* @__PURE__ */ new Map();
  for (const r of registros) {
    const s = porDocId.get(r.meta.doc_id) ?? /* @__PURE__ */ new Set();
    s.add(r.doc.id_secop);
    porDocId.set(r.meta.doc_id, s);
  }
  const colisiones = [];
  for (const [doc_id, ids] of porDocId) {
    if (ids.size > 1) colisiones.push({ doc_id, ids_secop: [...ids].sort() });
  }
  return {
    procesos: new Set(registros.map((r) => r.doc.id_secop)).size,
    doc_ids: porDocId.size,
    colisiones
  };
}
var GUARD_SECOP = {
  /** Más de este % de modalidades imprevistas: apareció un vocabulario nuevo. */
  MAX_PCT_MODALIDAD_IMPREVISTA: 5,
  /**
   * Más de este % SIN NINGUNA fecha utilizable (ni publicación ni recepción):
   * la consulta está trayendo basura. Que falte la publicación ya no cuenta —
   * para eso está la cadena de respaldo de la trampa 12.
   */
  MAX_PCT_SIN_FECHA: 10,
  /** Más de este % de presupuestos inservibles. */
  MAX_PCT_PRESUPUESTO_PROBLEMA: 15
};
var MAX_EJEMPLOS_DESCARTE = 10;
function ingerirSecop(filas, hash2, opciones) {
  const terminos = opciones?.terminos ?? TERMINOS_NEG;
  const { procesos: colapsados, sin_identidad } = colapsarPorProceso(filas);
  const por_veredicto = { si: 0, probable: 0, no: 0 };
  const por_senal = {
    codigo_en_familia: 0,
    codigo_en_clase_con_texto: 0,
    codigo_en_clase_sin_texto: 0,
    codigo_fuera_de_familia: 0,
    texto_coincide: 0,
    sin_codigo_ni_texto: 0,
    fuera_de_territorio: 0
  };
  const por_familia = {
    familia_neg: 0,
    fuera_de_familia: 0,
    sin_clasificar: 0
  };
  const descartes = {
    total: 0,
    codigo_fuera_de_familia: 0,
    sin_codigo_ni_texto: 0,
    fuera_de_territorio: 0,
    con_texto_coincidente: 0,
    ejemplos_con_texto_coincidente: []
  };
  const observados = { total: 0, habrian_calificado: 0, ejemplos: [] };
  const evidencia_sin_texto = { total: 0, ejemplos: [] };
  const registros = [];
  let procesos_vistos = 0;
  for (const p of colapsados) {
    const r = mapearProceso(p, hash2, terminos, opciones?.vocabulario_version);
    if (!r) continue;
    procesos_vistos++;
    const c = r.meta.clasificacion;
    por_veredicto[c.veredicto]++;
    por_senal[c.senal]++;
    por_familia[c.familia]++;
    if (c.senal === "codigo_en_clase_sin_texto") {
      evidencia_sin_texto.total++;
      if (evidencia_sin_texto.ejemplos.length < MAX_EJEMPLOS_DESCARTE) {
        evidencia_sin_texto.ejemplos.push({
          id_secop: r.doc.id_secop,
          categoria: r.doc.categoria_unspsc,
          objeto: r.doc.objeto.slice(0, 200)
        });
      }
    }
    if (sePersiste(c.veredicto)) {
      registros.push(r);
      continue;
    }
    descartes.total++;
    if (c.senal === "codigo_fuera_de_familia") descartes.codigo_fuera_de_familia++;
    if (c.senal === "sin_codigo_ni_texto") descartes.sin_codigo_ni_texto++;
    if (c.senal === "fuera_de_territorio") {
      descartes.fuera_de_territorio++;
      observados.total++;
      if (c.habria_calificado) {
        observados.habrian_calificado++;
        if (observados.ejemplos.length < MAX_EJEMPLOS_DESCARTE) {
          observados.ejemplos.push({
            id_secop: r.doc.id_secop,
            departamento: r.doc.entidad.departamento,
            categoria: r.doc.categoria_unspsc,
            objeto: r.doc.objeto.slice(0, 200),
            senal_previa: c.senal_previa ?? c.senal
          });
        }
      }
      continue;
    }
    if (c.descartado_con_texto_coincidente) {
      descartes.con_texto_coincidente++;
      if (descartes.ejemplos_con_texto_coincidente.length < MAX_EJEMPLOS_DESCARTE) {
        descartes.ejemplos_con_texto_coincidente.push({
          id_secop: r.doc.id_secop,
          categoria: r.doc.categoria_unspsc,
          objeto: r.doc.objeto.slice(0, 200),
          terminos: c.terminos
        });
      }
    }
  }
  const por_origen_fecha = {
    publicacion: 0,
    recepcion_de_ofertas: 0,
    ninguna: 0
  };
  const presupuesto_problema = { ausente: 0, cero: 0, negativo: 0, absurdo: 0 };
  const imprevistas = /* @__PURE__ */ new Map();
  let adjudicacion_ambigua = 0;
  let sin_fecha_publicacion = 0;
  let urls_genericas = 0;
  for (const r of registros) {
    por_origen_fecha[r.meta.origen_fecha]++;
    if (r.meta.problema_presupuesto !== null) presupuesto_problema[r.meta.problema_presupuesto]++;
    if (r.meta.modalidad_imprevista) {
      imprevistas.set(r.meta.modalidad_cruda, (imprevistas.get(r.meta.modalidad_cruda) ?? 0) + 1);
    }
    if (r.meta.adjudicacion_ambigua) adjudicacion_ambigua++;
    if (r.meta.sin_fecha_publicacion) sin_fecha_publicacion++;
    if (r.meta.url_generica) urls_genericas++;
  }
  const { procesos, doc_ids, colisiones } = guardaIdentidad(registros);
  const senales = [];
  const pct = (n) => procesos === 0 ? 0 : n / procesos * 100;
  if (colisiones.length > 0) {
    senales.push(
      `COLISI\xD3N DE DOC ID: ${procesos} procesos pero ${doc_ids} documentos. ` + colisiones.map((c) => `${c.doc_id} <- [${c.ids_secop.join(", ")}]`).join(" \xB7 ")
    );
  }
  const impr = [...imprevistas.values()].reduce((a, b) => a + b, 0);
  if (pct(impr) > GUARD_SECOP.MAX_PCT_MODALIDAD_IMPREVISTA) {
    senales.push(
      `MODALIDADES IMPREVISTAS: ${impr} de ${procesos} procesos (${pct(impr).toFixed(1)} %) con un texto que no est\xE1 en MODALIDAD_SECOP: ` + [...imprevistas.keys()].join(" \xB7 ")
    );
  }
  const sin_ninguna_fecha = por_origen_fecha.ninguna;
  if (pct(sin_ninguna_fecha) > GUARD_SECOP.MAX_PCT_SIN_FECHA) {
    senales.push(
      `SIN NINGUNA FECHA UTILIZABLE: ${sin_ninguna_fecha} de ${procesos} (${pct(sin_ninguna_fecha).toFixed(1)} %) \u2014 ni publicaci\xF3n ni recepci\xF3n de ofertas. Entran marcadas, pero esta proporci\xF3n dice que la consulta est\xE1 trayendo basura.`
    );
  }
  const conProblema = Object.values(presupuesto_problema).reduce((a, b) => a + b, 0);
  if (pct(conProblema) > GUARD_SECOP.MAX_PCT_PRESUPUESTO_PROBLEMA) {
    senales.push(
      `PRESUPUESTO INSERVIBLE: ${conProblema} de ${procesos} (${pct(conProblema).toFixed(1)} %) \u2014 ausente ${presupuesto_problema.ausente}, cero ${presupuesto_problema.cero}, negativo ${presupuesto_problema.negativo}, absurdo ${presupuesto_problema.absurdo}.`
    );
  }
  return {
    registros,
    filas_vistas: filas.length,
    procesos_vistos,
    procesos,
    filas_sin_identidad: sin_identidad,
    por_veredicto,
    por_senal,
    descartes,
    evidencia_sin_texto,
    observados,
    por_familia,
    por_origen_fecha,
    vocabulario_version: opciones?.vocabulario_version ?? VOCABULARIO_NEG_VERSION,
    colisiones,
    adjudicacion_ambigua,
    sin_fecha_publicacion,
    sin_ninguna_fecha,
    presupuesto_problema,
    modalidades_imprevistas: [...imprevistas.entries()].map(([crudo, p]) => ({ crudo, procesos: p })).sort((a, b) => b.procesos - a.procesos),
    urls_genericas,
    senales,
    puede_escribir: senales.length === 0
  };
}
function construirResumenCorrida(r, contexto) {
  return {
    ejecutada_en: contexto.ejecutada_en,
    ventana: contexto.ventana,
    modo: contexto.modo,
    vocabulario_version: r.vocabulario_version,
    filas_vistas: r.filas_vistas,
    procesos_vistos: r.procesos_vistos,
    persistidos: r.procesos,
    por_veredicto: r.por_veredicto,
    por_senal: r.por_senal,
    descartes: r.descartes,
    evidencia_sin_texto: r.evidencia_sin_texto,
    observados: r.observados,
    por_familia: r.por_familia,
    por_origen_fecha: r.por_origen_fecha,
    adjudicacion_ambigua: r.adjudicacion_ambigua,
    presupuesto_problema: r.presupuesto_problema,
    modalidades_imprevistas: r.modalidades_imprevistas,
    urls_genericas: r.urls_genericas,
    senales: r.senales,
    puede_escribir: r.puede_escribir
  };
}

// ../src/utils/sigp/secopConsulta.ts
var DATASET_SECOP = "p6dx-8zbt";
var ENDPOINT_SECOP = `https://www.datos.gov.co/resource/${DATASET_SECOP}.json`;
var FAMILIAS_RUP_NEG2 = ["V1.7210", "V1.7215", "V1.8110"];
var DEPARTAMENTOS_INGESTA = [
  "Distrito Capital de Bogot\xE1",
  "Cundinamarca"
];
var MODALIDADES_INGESTA = [
  "M\xEDnima cuant\xEDa",
  "Selecci\xF3n Abreviada de Menor Cuant\xEDa",
  "Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes"
];
var LIMITE_PAGINA = 5e4;
var DIAS_SOLAPE_DEFECTO = 45;
var MODO_INGESTA_DEFECTO = "radar";
function literalSoql(v) {
  return `'${v.replace(/'/g, "''")}'`;
}
function clausulaIn(campo, valores) {
  return `${campo} in(${valores.map(literalSoql).join(",")})`;
}
function clausulaFamilias(familias = FAMILIAS_RUP_NEG2) {
  const ors = familias.map(
    (f) => `starts_with(codigo_principal_de_categoria,${literalSoql(f)})`
  );
  return `(${ors.join(" OR ")})`;
}
var EXPR_FECHA_VENTANA = "coalesce(fecha_de_publicacion_del, fecha_de_recepcion_de)";
function clausulaFechas(desde, hasta, incluir_sin_fecha = true) {
  const campo = EXPR_FECHA_VENTANA;
  const partes = [];
  if (desde) partes.push(`${campo} >= ${literalSoql(desde)}`);
  if (hasta) partes.push(`${campo} <= ${literalSoql(hasta)}`);
  if (partes.length === 0) return incluir_sin_fecha ? null : `${campo} IS NOT NULL`;
  const rango = partes.join(" AND ");
  return incluir_sin_fecha ? `(${rango} OR ${campo} IS NULL)` : `(${rango})`;
}
function whereIngesta(opciones = {}) {
  const {
    modo = MODO_INGESTA_DEFECTO,
    desde = null,
    hasta = null,
    familias = FAMILIAS_RUP_NEG2,
    departamentos = DEPARTAMENTOS_INGESTA,
    incluir_observados = true,
    modalidades = MODALIDADES_INGESTA,
    incluir_sin_fecha = true
  } = opciones;
  const deptos = incluir_observados ? [...departamentos, ...DEPARTAMENTOS_OBSERVADOS] : [...departamentos];
  const clausulas = [];
  if (modo === "historico") clausulas.push(clausulaFamilias(familias));
  clausulas.push(clausulaIn("departamento_entidad", deptos));
  clausulas.push(clausulaIn("modalidad_de_contratacion", modalidades));
  const fechas = clausulaFechas(desde, hasta, incluir_sin_fecha);
  if (fechas) clausulas.push(fechas);
  return clausulas.join(" AND ");
}
var ORDEN_INGESTA = `${EXPR_FECHA_VENTANA} ASC, id_del_proceso ASC`;
function paramsIngesta(opciones = {}) {
  const limite = Math.min(opciones.limite ?? LIMITE_PAGINA, LIMITE_PAGINA);
  const offset = opciones.offset ?? 0;
  const p = new URLSearchParams();
  p.set("$where", whereIngesta(opciones));
  p.set("$order", ORDEN_INGESTA);
  p.set("$limit", String(limite));
  p.set("$offset", String(offset));
  return p;
}
function urlIngesta(opciones = {}) {
  return `${ENDPOINT_SECOP}?${paramsIngesta(opciones).toString()}`;
}
function paramsConteo(opciones = {}) {
  const p = new URLSearchParams();
  p.set("$select", "count(1) as total");
  p.set("$where", whereIngesta(opciones));
  return p;
}
function urlConteo(opciones = {}) {
  return `${ENDPOINT_SECOP}?${paramsConteo(opciones).toString()}`;
}
function cabecerasConsulta(appToken2) {
  const h = { Accept: "application/json" };
  const t = (appToken2 ?? "").trim();
  if (t !== "") h["X-App-Token"] = t;
  return h;
}
function ventanaIngesta(marcaUltimaCorrida, ahora, solape_dias = DIAS_SOLAPE_DEFECTO) {
  const hasta = iso(ahora);
  if (!marcaUltimaCorrida) {
    return { desde: null, hasta, solape_dias, primera_corrida: true };
  }
  const base = new Date(marcaUltimaCorrida);
  if (Number.isNaN(base.getTime())) {
    return { desde: null, hasta, solape_dias, primera_corrida: true };
  }
  const desde = new Date(base.getTime() - solape_dias * 864e5);
  return { desde: iso(desde), hasta, solape_dias, primera_corrida: false };
}
var iso = (d) => d.toISOString().slice(0, 10);
function verificarCosecha(total_api, filas_cosechadas) {
  const faltan = total_api - filas_cosechadas;
  if (faltan === 0) return { completa: true, faltan: 0, senal: null };
  return {
    completa: false,
    faltan,
    senal: faltan > 0 ? `COSECHA INCOMPLETA: la API declara ${total_api} filas y se trajeron ${filas_cosechadas} (faltan ${faltan}). No se escribe con una cosecha a medias.` : `COSECHA MAYOR QUE EL CONTEO: ${filas_cosechadas} filas contra ${total_api} declaradas (${-faltan} de m\xE1s) \u2014 probable paginaci\xF3n sin $order.`
  };
}

// ../src/utils/sigp/radarRutas.ts
var COL_LICITACIONES = "licitaciones";
var RUTA_ESTADO_RADAR = "configuracion/radar_secop";
var RUTA_VOCABULARIO_NEG = "configuracion/vocabulario_neg";
var RUTAS_ESCRITURA_RADAR = [
  `${COL_LICITACIONES}/{docId}`,
  RUTA_ESTADO_RADAR
];
function rutaLicitacion(docId) {
  return `${COL_LICITACIONES}/${docId}`;
}
function segmentoValido(s) {
  if (s === "" || s === "." || s === "..") return false;
  return /^[A-Za-z0-9_.-]+$/.test(s);
}
function esRutaDeEscrituraPermitida(ruta) {
  if (typeof ruta !== "string" || ruta === "") return false;
  if (ruta !== ruta.trim()) return false;
  const partes = ruta.split("/");
  if (!partes.every(segmentoValido)) return false;
  if (ruta === RUTA_ESTADO_RADAR) return true;
  if (partes.length !== 2) return false;
  return partes[0] === COL_LICITACIONES;
}
function validarRutaEscritura(ruta) {
  if (!esRutaDeEscrituraPermitida(ruta)) {
    throw new Error(
      `RUTA NO PERMITIDA PARA EL RADAR: "${ruta}". El radar solo escribe en ${RUTAS_ESCRITURA_RADAR.join(" y ")}. Si un bloque nuevo necesita otra ruta, agr\xE9gala a RUTAS_ESCRITURA_RADAR con su caso en el test \u2014 no por ac\xE1.`
    );
  }
  return ruta;
}

// ../src/utils/sigp/radarCorrida.ts
var GUARDA_VOLUMEN = {
  /**
   * Tope de documentos que una corrida automática puede crear. Calibrado
   * contra lo medido: el territorio produce ~12,7 procesos reconocidos por
   * día hábil y el léxico marca ~11 probables por día. Con DOS corridas
   * diarias (06:30 y 14:00) cada una mueve menos todavía — la de la tarde
   * suele crear casi nada, porque lo de la mañana ya está escrito y el
   * compare-before-write no reescribe lo que no cambió. Doscientos deja
   * margen para un lunes con fin de semana acumulado y para el solape, y
   * sigue siendo una bandeja que una persona puede mirar.
   */
  MAX_CREADOS_POR_CORRIDA: 200,
  /**
   * Tope del PRIMER barrido, cuando no hay marca. Más bajo a propósito: la
   * primera corrida es la única que puede traer años de historia.
   */
  MAX_CREADOS_PRIMERA_CORRIDA: 50,
  /**
   * Días de ventana que una corrida automática puede abarcar. Más que esto
   * es un barrido histórico, y un barrido histórico se hace a mano.
   */
  MAX_DIAS_VENTANA: 120
};
var DIA_MS = 864e5;
function diasDeVentana(v) {
  if (!v.desde) return null;
  const d = new Date(v.desde).getTime();
  const h = v.hasta ? new Date(v.hasta).getTime() : Date.now();
  if (Number.isNaN(d) || Number.isNaN(h)) return null;
  return Math.max(0, Math.round((h - d) / DIA_MS));
}
function evaluarVolumen(crearia, ventana, opciones) {
  const dias_ventana = diasDeVentana(ventana);
  const tope = ventana.primera_corrida ? GUARDA_VOLUMEN.MAX_CREADOS_PRIMERA_CORRIDA : GUARDA_VOLUMEN.MAX_CREADOS_POR_CORRIDA;
  if (opciones?.autorizado_manual) {
    return {
      procede: true,
      crearia,
      tope,
      dias_ventana,
      motivo: null,
      sugerencia: null
    };
  }
  if (dias_ventana === null) {
    return {
      procede: false,
      crearia,
      tope,
      dias_ventana,
      motivo: "VENTANA SIN INICIO: la corrida abarcar\xEDa todo el hist\xF3rico del dataset.",
      sugerencia: "Primer arranque: correr con una ventana expl\xEDcita (por ejemplo los \xFAltimos 45 d\xEDas) y, si se quiere el hist\xF3rico, hacerlo como barrido manual autorizado y acotado por tramos."
    };
  }
  if (dias_ventana > GUARDA_VOLUMEN.MAX_DIAS_VENTANA) {
    return {
      procede: false,
      crearia,
      tope,
      dias_ventana,
      motivo: `VENTANA DEMASIADO ANCHA: ${dias_ventana} d\xEDas (tope ${GUARDA_VOLUMEN.MAX_DIAS_VENTANA}).`,
      sugerencia: "Una ventana as\xED es un barrido hist\xF3rico: va por tramos y con autorizaci\xF3n, no en la corrida autom\xE1tica."
    };
  }
  if (crearia > tope) {
    return {
      procede: false,
      crearia,
      tope,
      dias_ventana,
      motivo: `DEMASIADOS DOCUMENTOS NUEVOS: ${crearia} (tope ${tope}${ventana.primera_corrida ? ", primera corrida" : ""}).`,
      sugerencia: "La bandeja no se llena de golpe: acotar la ventana y repetir, o autorizar el volcado a prop\xF3sito."
    };
  }
  return { procede: true, crearia, tope, dias_ventana, motivo: null, sugerencia: null };
}
var CAMPOS_REFRESCABLES = [
  "objeto",
  "url_proceso",
  "entidad",
  "categoria_unspsc",
  "presupuesto_oficial",
  "lotes",
  "cronograma",
  "ofertas_recibidas",
  "ganador",
  "oferta_ganador"
];
var CAMPOS_PROTEGIDOS = [
  // `radar` es la PROCEDENCIA DEL NACIMIENTO: por qué el radar trajo este
  // proceso. Es historia, no estado — si se refrescara, la pregunta "¿alguno
  // de los que entraron por clase sin texto se trabajó?" dejaría de tener
  // respuesta, que es justamente para lo que existe el campo.
  "radar",
  "consecutivo",
  "id_secop",
  "origen",
  "numero_proceso",
  "modalidad",
  "semaforo",
  "semaforo_motivos",
  "semaforo_version",
  "override_manual",
  "estado",
  "motivo_descarte",
  "oferta_neg",
  "manifestaciones",
  "migrado",
  "capacidad_manual",
  "activa"
];
var igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function patchRadarSobreExistente(existente, nuevo) {
  const patch = {};
  const cambios = [];
  for (const campo of CAMPOS_REFRESCABLES) {
    const antes = existente[campo];
    const ahora = nuevo[campo];
    if (!igual(antes, ahora)) {
      ;
      patch[campo] = ahora;
      cambios.push(campo);
    }
  }
  const cambios_materiales = [];
  for (const campo of CAMPOS_PROTEGIDOS) {
    const antes = existente[campo];
    const ahora = nuevo[campo];
    if (antes !== void 0 && !igual(antes, ahora)) cambios_materiales.push(campo);
  }
  return { patch, cambios, cambios_materiales };
}
var hayQueEscribir = (p) => p.cambios.length > 0;
var ACTOR_RADAR = "radar_secop";
function sellarParaEscritura(doc, sello) {
  return {
    ...doc,
    radar: { ...doc.radar, corrida: sello.corrida },
    responsable_uid: "",
    creado_por: sello.actor,
    creado_en: sello.ahora,
    actualizado_por: sello.actor,
    actualizado_en: sello.ahora
  };
}
function fechasATimestamp(doc, hacer) {
  const c = doc.cronograma;
  return {
    ...doc,
    cronograma: {
      publicacion: c.publicacion === null ? null : hacer(c.publicacion),
      manifestacion: null,
      sorteo: null,
      cierre: c.cierre === null ? null : hacer(c.cierre),
      adjudicacion: null
    }
  };
}
function planearEscritura(registros, existentes) {
  const plan = {
    crear: [],
    refrescar: [],
    sin_cambio: 0,
    cambios_materiales: []
  };
  for (const r of registros) {
    const doc_id = r.meta.doc_id;
    const actual = existentes.get(doc_id);
    if (!actual) {
      plan.crear.push({ doc_id, doc: r.doc });
      continue;
    }
    const p = patchRadarSobreExistente(actual, r.doc);
    if (p.cambios_materiales.length > 0) {
      plan.cambios_materiales.push({ doc_id, campos: p.cambios_materiales });
    }
    if (hayQueEscribir(p)) plan.refrescar.push({ doc_id, patch: p.patch, cambios: p.cambios });
    else plan.sin_cambio++;
  }
  return plan;
}
function construirRegistroCorrida(resumen, volumen, escritura, marca_nueva) {
  return { ...resumen, volumen, escritura, marca_nueva };
}
function marcaSiguiente(ventana, escribio, marcaActual) {
  if (!escribio) return marcaActual;
  return ventana.hasta ?? marcaActual;
}
function resumenLegible(r) {
  const e = r.escritura;
  const partes = [
    `modo ${r.modo}`,
    `ventana ${r.ventana.desde ?? "(sin inicio)"} \u2192 ${r.ventana.hasta ?? "(hoy)"}`,
    `${r.filas_vistas} filas / ${r.procesos_vistos} procesos`,
    `si ${r.por_veredicto.si} \xB7 probable ${r.por_veredicto.probable} \xB7 no ${r.por_veredicto.no}`,
    e ? `creados ${e.creados} \xB7 refrescados ${e.refrescados} \xB7 sin cambio ${e.sin_cambio}` : `NO SE ESCRIBI\xD3: ${r.volumen.motivo ?? "guarda de volumen"}`
  ];
  if (r.descartes.con_texto_coincidente > 0) {
    partes.push(`descartados por c\xF3digo con texto de NEG: ${r.descartes.con_texto_coincidente}`);
  }
  if (r.observados.habrian_calificado > 0) {
    partes.push(`habr\xEDan calificado fuera del territorio: ${r.observados.habrian_calificado}`);
  }
  return partes.join(" \xB7 ");
}
var MAX_CORRIDAS_EN_HISTORIAL = 30;
var ESTADO_RADAR_INICIAL = {
  marca: null,
  solape_dias: 45,
  ultima_corrida: null,
  corridas: [],
  acumulado: {
    corridas: 0,
    corridas_detenidas: 0,
    procesos_vistos: 0,
    creados: 0,
    refrescados: 0,
    evidencia_sin_texto: 0,
    observados_habrian_calificado: 0,
    descartados_con_texto: 0
  }
};
function avanzarEstadoRadar(actual, registro, max = MAX_CORRIDAS_EN_HISTORIAL) {
  const base = actual ?? ESTADO_RADAR_INICIAL;
  const escribio = registro.escritura !== null;
  const e = registro.escritura;
  const entrada = {
    ejecutada_en: registro.ejecutada_en,
    resumen: resumenLegible(registro),
    procesos_vistos: registro.procesos_vistos,
    persistidos: e ? e.creados + e.refrescados : 0,
    escribio
  };
  const a = base.acumulado;
  return {
    marca: registro.marca_nueva ?? base.marca,
    solape_dias: base.solape_dias,
    ...base.autorizado_manual !== void 0 ? { autorizado_manual: false } : {},
    ultima_corrida: registro,
    corridas: [entrada, ...base.corridas].slice(0, max),
    acumulado: {
      corridas: a.corridas + 1,
      corridas_detenidas: a.corridas_detenidas + (escribio ? 0 : 1),
      procesos_vistos: a.procesos_vistos + registro.procesos_vistos,
      creados: a.creados + (e?.creados ?? 0),
      refrescados: a.refrescados + (e?.refrescados ?? 0),
      evidencia_sin_texto: a.evidencia_sin_texto + registro.evidencia_sin_texto.total,
      observados_habrian_calificado: a.observados_habrian_calificado + registro.observados.habrian_calificado,
      descartados_con_texto: a.descartados_con_texto + registro.descartes.con_texto_coincidente
    }
  };
}
function cuantosCrearia(reporte, existentes) {
  let n = 0;
  for (const r of reporte.registros) if (!existentes.has(r.meta.doc_id)) n++;
  return n;
}

// src/index.ts
if ((0, import_app.getApps)().length === 0) (0, import_app.initializeApp)();
var appToken = () => (process.env.SECOP_APP_TOKEN ?? "").trim();
var refLectura = (db, ruta) => db.doc(ruta);
var refEscritura = (db, ruta) => db.doc(validarRutaEscritura(ruta));
var LOTE_ESCRITURA = 400;
var LOTE_LECTURA = 200;
var hash = (s) => (0, import_node_crypto.createHash)("sha1").update(s, "utf8").digest("hex").slice(0, 8);
var trozos = (xs, n) => {
  const out = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};
async function traer(url, token) {
  const r = await fetch(url, { headers: cabecerasConsulta(token) });
  if (!r.ok) {
    const cuerpo = (await r.text()).slice(0, 300);
    throw new Error(`SECOP respondi\xF3 ${r.status}: ${cuerpo}`);
  }
  return r.json();
}
async function contar(opciones, token) {
  const j = await traer(urlConteo(opciones), token);
  const fila = Array.isArray(j) ? j[0] : void 0;
  const n = Number(fila?.total ?? NaN);
  if (!Number.isFinite(n)) throw new Error("el conteo de SECOP no vino como n\xFAmero");
  return n;
}
async function cosechar(opciones, total, token) {
  const filas = [];
  for (let offset = 0; offset < total; offset += LIMITE_PAGINA) {
    const pagina = await traer(urlIngesta({ ...opciones, offset, limite: LIMITE_PAGINA }), token);
    if (!Array.isArray(pagina)) throw new Error("una p\xE1gina de SECOP no vino como lista");
    filas.push(...pagina);
    if (pagina.length === 0) break;
  }
  return filas;
}
var OPCIONES_CORRIDA = {
  /**
   * CUENTA DE SERVICIO DEDICADA, con el unico rol que necesita:
   * `roles/datastore.user`. Sin esto, una CF de 2a generacion corre con la
   * cuenta de computo por defecto, que en este proyecto trae `roles/editor`:
   * **12.497 permisos** sobre todo el proyecto, medidos contra la API de IAM,
   * contra los **23** de datastore.user.
   *
   * ⚠ LO QUE ESTO **NO** HACE, dicho con las palabras del hallazgo:
   * `datastore.user` es **todo-o-nada sobre la base de datos**. No acota a
   * `licitaciones` ni a `configuracion/radar_secop` — IAM no llega a nivel de
   * coleccion (Firestore no acepta *conditional role bindings*) y los
   * clientes de servidor OMITEN las Security Rules. Lo que acota las rutas es
   * `radarRutas.ts` y su test, que lee este archivo.
   *
   * Todo medido y citado en `docs/radar-cuenta-de-servicio.md`.
   *
   * Si la cuenta NO existe en el proyecto, el deploy FALLA con un error de
   * IAM — por eso esta linea entro en su propio PR, despues de crearla, y no
   * junto con el codebase.
   */
  serviceAccount: "radar-secop@neg-sst-app.iam.gserviceaccount.com",
  timeZone: "America/Bogota",
  timeoutSeconds: 540,
  memory: "512MiB",
  retryCount: 0
};
async function corridaDelRadar() {
  const db = (0, import_firestore.getFirestore)();
  const token = appToken();
  const inicio = /* @__PURE__ */ new Date();
  const corridaId = inicio.toISOString();
  const [snapEstado, snapVocab] = await Promise.all([
    refLectura(db, RUTA_ESTADO_RADAR).get(),
    refLectura(db, RUTA_VOCABULARIO_NEG).get()
  ]);
  const estado = snapEstado.exists ? { ...ESTADO_RADAR_INICIAL, ...snapEstado.data() } : ESTADO_RADAR_INICIAL;
  const registroVocab = snapVocab.exists ? snapVocab.data() : null;
  const terminos = terminosVigentes(registroVocab);
  const vocabulario_version = versionVocabularioVigente(registroVocab);
  const ventana = ventanaIngesta(estado.marca, inicio, estado.solape_dias);
  const consulta = { modo: MODO_INGESTA_DEFECTO, desde: ventana.desde, hasta: ventana.hasta };
  import_firebase_functions.logger.info("radar: arranca", { ventana, vocabulario_version, con_token: token !== "" });
  const total = await contar(consulta, token);
  const filas = await cosechar(consulta, total, token);
  const cosecha = verificarCosecha(total, filas.length);
  if (!cosecha.completa) {
    throw new Error(cosecha.senal ?? "cosecha incompleta");
  }
  const reporte = ingerirSecop(filas, hash, { terminos, vocabulario_version });
  const resumen = construirResumenCorrida(reporte, {
    ejecutada_en: corridaId,
    modo: MODO_INGESTA_DEFECTO,
    ventana: { desde: ventana.desde, hasta: ventana.hasta, solape_dias: ventana.solape_dias }
  });
  const ids = reporte.registros.map((r) => r.meta.doc_id);
  const existentes = /* @__PURE__ */ new Map();
  for (const grupo of trozos(ids, LOTE_LECTURA)) {
    const snaps = await db.getAll(...grupo.map((id) => refLectura(db, rutaLicitacion(id))));
    for (const s of snaps) {
      if (s.exists) existentes.set(s.id, s.data());
    }
  }
  const volumen = evaluarVolumen(
    cuantosCrearia(reporte, new Set(existentes.keys())),
    ventana,
    { autorizado_manual: estado.autorizado_manual === true }
  );
  if (!volumen.procede || !reporte.puede_escribir) {
    const motivo = volumen.motivo ?? reporte.senales.join(" \xB7 ");
    const registro2 = construirRegistroCorrida(
      resumen,
      volumen,
      null,
      marcaSiguiente(ventana, false, estado.marca)
    );
    await refEscritura(db, RUTA_ESTADO_RADAR).set(avanzarEstadoRadar(estado, registro2), { merge: false });
    import_firebase_functions.logger.warn("radar: NO se escribi\xF3", { motivo, sugerencia: volumen.sugerencia });
    return;
  }
  const plan = planearEscritura(reporte.registros, existentes);
  const aTs = (iso2) => import_firestore.Timestamp.fromDate(new Date(iso2));
  const ahora = import_firestore.Timestamp.fromDate(inicio);
  for (const grupo of trozos(plan.crear, LOTE_ESCRITURA)) {
    const lote = db.batch();
    for (const { doc_id, doc } of grupo) {
      const conTs = fechasATimestamp(doc, aTs);
      lote.create(
        refEscritura(db, rutaLicitacion(doc_id)),
        sellarParaEscritura(conTs, { corrida: corridaId, ahora, actor: ACTOR_RADAR })
      );
    }
    await lote.commit();
  }
  for (const grupo of trozos(plan.refrescar, LOTE_ESCRITURA)) {
    const lote = db.batch();
    for (const { doc_id, patch } of grupo) {
      const p = patch.cronograma !== void 0 ? { ...patch, cronograma: fechasATimestamp(patch, aTs).cronograma } : patch;
      lote.update(refEscritura(db, rutaLicitacion(doc_id)), {
        ...p,
        actualizado_por: ACTOR_RADAR,
        actualizado_en: ahora
      });
    }
    await lote.commit();
  }
  const escritura = {
    creados: plan.crear.length,
    refrescados: plan.refrescar.length,
    sin_cambio: plan.sin_cambio,
    cambios_materiales: plan.cambios_materiales
  };
  const registro = construirRegistroCorrida(
    resumen,
    volumen,
    escritura,
    marcaSiguiente(ventana, true, estado.marca)
  );
  await refEscritura(db, RUTA_ESTADO_RADAR).set(avanzarEstadoRadar(estado, registro), { merge: false });
  import_firebase_functions.logger.info("radar: " + resumenLegible(registro));
}
var ingerirRadarSecopManana = (0, import_scheduler.onSchedule)(
  { ...OPCIONES_CORRIDA, schedule: "30 6 * * 1-5" },
  corridaDelRadar
);
var ingerirRadarSecopTarde = (0, import_scheduler.onSchedule)(
  { ...OPCIONES_CORRIDA, schedule: "0 14 * * 1-5" },
  corridaDelRadar
);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ingerirRadarSecopManana,
  ingerirRadarSecopTarde
});
//# sourceMappingURL=index.js.map
