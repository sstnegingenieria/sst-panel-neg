# ¿Hay salida al retraso de la fuente?

*Medido el 14-nov-2026. Cinco preguntas, cinco respuestas con número.*

**Resumen: no hay fuente más oportuna en datos abiertos, mover el horario no
gana nada, y el retraso cuesta el 11 % de los procesos que calificarían.**

---

## 1 · ¿Hay otro conjunto con menos latencia? NO

El catálogo de datos.gov.co reporta 154 resultados para «SECOP». Revisé los que
podrían servir:

| conjunto | qué es | actualizado | publicación más reciente que contiene |
|---|---|---|---|
| **`p6dx-8zbt`** | SECOP II · Procesos de Contratación | 14-nov 05:54 UTC | **2026-11-12** |
| `a8sx-pfr3` | «SECOP II» | 14-nov 05:54 UTC | **2026-11-12** |
| `jbjy-vk9h` | SECOP II · Contratos Electrónicos | 13-nov 19:27 UTC | 2026-11-12 (firma) |
| `rpmr-utcd` | **SECOP Integrado** | 13-nov 19:47 UTC | — |
| `m9wx-2ibj` | «SECOP II» (vista de 245 filas) | 14-nov 05:54 UTC | 2026-11-04 |

### `a8sx-pfr3` es el mismo conjunto, con otro nombre

Mismo número de filas exacto (**9.487.636**), misma hora de actualización al
segundo, mismo techo del 12-nov. Es un alias, no una alternativa.

### `rpmr-utcd` (SECOP Integrado) no sirve, y no es cuestión de latencia

Es un conjunto de **contratos firmados**, no de procesos abiertos. Sus 22
columnas son `fecha_de_firma_del_contrato`, `numero_del_contrato`,
`nom_raz_social_contratista`, `valor_contrato`. **No tiene fecha de publicación
del proceso ni plazo de recepción de ofertas** — los dos datos sobre los que se
decide si todavía se puede presentar. La primera fila de muestra está
`Liquidado`.

Son 23 millones de filas de contratos ya adjudicados. Para un radar que busca
procesos ANTES del cierre, es el conjunto equivocado por construcción. (De
paso: sus campos de fecha tienen basura — máximos en 2099 y 8201.)

**Conclusión:** `p6dx-8zbt` es el único conjunto con procesos abiertos y plazo
de ofertas. Y los tres conjuntos grandes de SECOP II topan todos en el 12-nov,
lo cual confirma que el retraso es de la fuente y no de un conjunto en
particular.

---

## 2 · ¿Colombia Compra documenta un canal más oportuno? NO

Del *Manual para el uso de Datos Abiertos del SECOP* (M-MUDA-02, versión de
sep-2024), leído completo:

> «Colombia Compra Eficiente **actualiza diariamente** la información del portal
> de Datos Abiertos del SECOP.»

Lo único que el manual ofrece como canal:

> «En el menú exportar también se encuentran las opciones de imprimir, utilizar
> un **enlace OData** para que la información se actualice automáticamente y un
> **API** para el libre acceso al conjunto de datos.»

Los dos son funciones propias de la plataforma Socrata **sobre el mismo
conjunto de datos.gov.co**. No hay un servicio aparte de colombiacompra.gov.co.

Lo que el manual **no** tiene, buscado término por término:

| busqué | resultado |
|---|---|
| retraso, latencia, demora | **nada** |
| notificación, alerta, webhook, suscripción | **nada** |
| endpoint OCDS propio | **nada** — menciona la Alianza para las Contrataciones Abiertas en la introducción, sin endpoint |
| tiempo real | **nada** |

### La distinción que importa

**La actualización sí es diaria.** Lo que llega con retraso es lo que entra en
esa actualización. El conjunto se refrescó hoy a las 00:54 de Bogotá y aun así
su contenido llega hasta el 12. «Actualización diaria» describe el trabajo de
carga, no que el dato esté al día.

### Sobre raspar el portal

El manual no documenta ningún otro canal. Así que lo único que queda, si se
quiere ver un proceso el mismo día que se publica, es **el portal web de SECOP
II**, y lo digo como lo que es:

- **No está documentado como canal de integración.** No hay contrato de
  servicio, ni estabilidad prometida, ni versión.
- **Puede romperse sin aviso**: un cambio de maquetación deja el radar ciego, y
  ciego en silencio, que es la peor forma.
- **Hay que revisar los términos de uso del portal** antes de hacerlo. No los
  he leído y no voy a afirmar que estén permitidos.
- **Es más código y más frágil** que una consulta a una API.

Lo reporto para que lo decida Giovanny. No lo construyo por iniciativa propia.

---

## 3 · ¿A qué hora se actualiza? A medianoche — y el radar ya corre después

| conjunto | `rowsUpdatedAt` (UTC) | hora de Bogotá |
|---|---|---|
| `s484-c9k3` | 05:34 | 00:34 |
| `tauh-5jvn` | 05:34 | 00:34 |
| `qmzu-gj57` | 05:48 | 00:48 |
| **`p6dx-8zbt`** | **05:54** | **00:54** |
| `ibyt-yi2f` | 06:19 | 01:19 |
| `cb9c-h8sn` | 07:29 | 02:29 |

Seis conjuntos distintos, todos cargados entre las **00:34 y las 02:29 de
Bogotá**. No es una observación suelta: la ventana nocturna es consistente
entre conjuntos independientes.

**El radar corre a las 06:30.** Ya está cuatro horas después de la carga.

**Mover el horario no gana nada.** El dato del 13 no estaba a las 00:54 de hoy
y no iba a estar a las 06:30 tampoco. El problema no es que lleguemos temprano
a la carga: es que la carga no trae el día anterior.

---

## 4 · El daño, con número: **11 %**

Procesos publicados desde el 14-oct en el territorio, que **calificarían** con
el léxico v1.1. Umbral de armado de `evaluarVentana` con
`horas_utiles_dia = 4`: mínima necesita 1 día hábil, menor necesita 2.

| | mínima cuantía | menor cuantía |
|---|---|---|
| procesos que califican | 99 | 156 |
| ya eran intrabajables sin retraso | 0 | 1 |
| **los mata el retraso de 2 días** | **10 (10,1 %)** | **19 (12,2 %)** |
| siguen trabajables | 89 | 136 |

**Combinado: 29 de 255 — el 11,4 %.** Al ritmo del último mes, unos **29 al
mes**, del orden de **350 al año**.

### La forma de la distribución explica por qué duele

En mínima cuantía, la ventana típica es de **4 días hábiles** (32 de 99), y hay
**10 procesos con solo 2 días hábiles**. Esos son exactamente los que mueren:
pierden los dos días y quedan en cero.

Y no son ruido. Los diez que mata:

- *ADECUACIÓN Y MANTENIMIENTO A INSTITUCIONES EDUCATIVAS DE PUERTO SALGAR*
- *REPARACIONES LOCATIVAS EN LA CUBIERTA DEL BIEN DE INTERÉS CULTURAL*
- *REALIZAR ADECUACIONES LOCATIVAS Y MANTENIMIENTO DE LA INFRAESTRUCTURA*
- *REALIZAR LAS OBRAS DE ADECUACIÓN Y PREPARACIÓN DEL TERRENO*

Es el trabajo de NEG, en su territorio, con el léxico reconociéndolo bien.

> **Límite de esta medición:** los días hábiles se cuentan de lunes a viernes,
> **sin festivos**. Colombia tiene 18 al año, así que el daño real es algo
> mayor que el 11,4 %. También supone un retraso parejo de 2 días; el medido
> fue de 2 días para el 11-nov y de al menos 2 para el 12, pero no he medido
> su variación.

---

## 5 · El régimen especial: la decisión se parte en dos

Procesos de régimen especial en el territorio, 2026:

| | |
|---|---|
| total | **48.425** |
| de esos, los que **calificarían** | **1.666** |
| por día hábil | **7,4** |

**Así, entero, no se puede.** La cola actual trae unos 2.662 al año de las dos
modalidades; agregar 1.666 la aumenta un 63 % de un golpe, y justo cuando el
acto 1c ya va a duplicar el volumen de decisión de Karen.

### Pero el caso de la U. Militar no es ese

| sub-modalidad | los que calificarían |
|---|---|
| `Contratación régimen especial` | **1.599** |
| **`Contratación régimen especial (con ofertas)`** | **67** |

**«Con ofertas» son 67 en todo 2026 — 0,3 por día hábil.** Y es la sub-modalidad
de la Universidad Militar. La muestra de lo que traería:

- *Mantenimiento de diferentes áreas de la Institución Educativa* (Colegio Antonio José de Sucre)
- *MANTENIMIENTO INTEGRAL DE LA INSTITUCIÓN* (Colegio María Josefa Canelones)
- *Rediseño, adecuación y apertura de ruta segura de evacuación* (Colegio San Agustín)
- *Prestación de servicio de reparación…* (Colegio Francisco de Paula Santander)
- *SERVICIOS DE MANTENIMIENTO PREVENTIVO, CORRECTIVO…* (Universidad Nacional)
- *MANTENIMIENTO PREVENTIVO, PREDICTIVO Y CORRECTIVO A LOS EQUIPOS RED CONTRA INCENDIO* (Colegio John F. Kennedy)

Colegios y universidades contratando mantenimiento y adecuaciones. Es el
trabajo de NEG.

**La diferencia entre las dos sub-modalidades es que «con ofertas» tiene
competencia abierta** — por eso trae listas de precalificados y por eso es
ofertable. La otra es, en su mayoría, contratación directa de régimen
especial, donde no hay a qué presentarse.

**Recomendación:** agregar solo `Contratación régimen especial (con ofertas)`.
67 procesos al año, 0,3 por día hábil, material bueno, y abre las listas de
precalificados. Dejar la otra afuera.

---

## Lo que sale de las cinco

1. **No hay fuente alternativa en datos abiertos.** Medido en cinco conjuntos.
2. **No hay canal documentado más oportuno.** El manual promete carga diaria y
   ofrece OData y API sobre el mismo conjunto.
3. **Mover el horario no sirve.** La carga es a medianoche y el radar ya corre
   cuatro horas después.
4. **El retraso cuesta el 11,4 %** de lo que calificaría — unos 350 procesos al
   año, y son trabajo de NEG en su territorio.
5. **El régimen especial «con ofertas» son 67 al año** y vale la pena; el
   régimen especial completo son 1.666 y no.

Lo que queda, y es decisión de negocio y no de datos: si ese 11 % justifica
raspar un portal no documentado, con todo lo que eso implica, o si se acepta
que la cola es la de anteayer y se trabaja el 89 % que sí llega a tiempo.

**Lo que no cambia nada de esto:** afinar el léxico. Era la pregunta y la
respuesta es que no.
