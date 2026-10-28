# DISENO.md — contrato del diseño "Chasis ITPR, piel por recinto"

Para quien construye una pantalla y no vio la maqueta. Aquí está todo lo necesario: los nombres, las clases con su
marcado mínimo, las APIs de JavaScript y las reglas. La maqueta (`.diseno/institucional/mockup.html`, `institucional.css`,
`institucional.js` y las capturas de `shots/`) es la referencia visual; este documento manda en los nombres.

## 1. La idea en cuatro líneas

- Un solo corte: la losa del logo ITPR, un bloque cuyo borde superior sube **30°** hacia la derecha. Todo lo demás es
  cuadrado (0 de radio en botones, campos, tarjetas, tablas y placas; sin píldoras, sin sombras en reposo, sin contornos
  de adorno).
- Cada pantalla es una **pila de capítulos** (`.cap`) de color plano de lado a lado, pegados sin hueco.
- Tres recintos = tres pieles (`ITPR`, `San Juan` / Tiburones, `Manatí` / Pumas), seis paletas (claro y oscuro) que cambian con
  un atributo en `<html>`. Nada se vuelve a pintar al cambiar de recinto.
- El idioma de los **estados** (apto, observación, falla, incompleto, borrador) nunca usa solo el color: forma + glifo +
  palabra + patrón.

## 2. Archivos y quién es dueño de qué

| Archivo | Dueño | Qué es |
|---|---|---|
| `docs/tokens.css` | fundación | Las seis paletas (tokens) y los derivados. No se cambian valores sin volver a verificar el contraste. |
| `docs/estilo.css` | fundación | Base, chasis (barra, navegación, pie), héroe, botones, campos, estados, mosaico de cifras, tabs, tablas, movimiento, impresión. |
| `docs/campus.js` | fundación | Recinto, modo, transición, tarjetas de recinto, chip de la barra, entradas, titulares, aviso. |
| `docs/router.js` | fundación | `barra()`, `navBaja()`, `pie()`, `pintar()`, `irA()`. |
| `docs/index.html`, `docs/sw.js`, `docs/manifest.json` | fundación | Script del `<head>`, sprite de glifos, `#toast`, precache. |
| `docs/v-acceso.css` | agente de **acceso** | Entrada, registro, lista Mis hojas (`acceso.js`). |
| `docs/v-dashboard.css` | agente de **dashboard** | Inicio del estudiante y del instructor: cifras, gráficas, Gente (`dashboard.js`, `graficas.js`, `resumen.js`). |
| `docs/v-tablero.css` | agente de **tablero** | El taller del instructor: el día, informes, inventario, revisar, gente, QR (`tablero.js`, `admin.js`, `codigo.js`, `informes.js`, `taller.js`). |
| `docs/v-editor.css` | agente de **editor** | La hoja, el reporte impreso y calificar (`editor.js`). |
| `pruebas/arnes.mjs`, `ui.mjs`, `marcas.mjs` | fundación / integración | Arnés, pruebas de interfaz, auditoría de marcas. |

Una pantalla portada **no edita** `estilo.css`, `tokens.css`, `campus.js` ni `router.js`. Si le falta algo, lo pide (o lo
define en su `v-*.css` con un nombre propio). Lo suyo en `v-*.css` va con las reglas de esta página.

### Orden de carga y capas

`tokens.css` → `estilo.css` → `v-acceso.css` → `v-dashboard.css` → `v-tablero.css` → `v-editor.css`.

- `estilo.css` pone el reset (elementos sueltos y campos base) en `@layer reset`, que pierde contra cualquier regla sin capa.
- La hoja anterior (`legado.css`) ya no existe: todas las pantallas están portadas. Cada `<main>` ocupa todo el ancho y las
  pantallas empiezan con capítulos (`.cap`); las páginas de aviso sueltas usan `.aviso-pagina` y `.cargando` (en `estilo.css`).

## 3. Tokens

Todo el color sale de tokens (`docs/tokens.css`). Nunca escribas un hex en una pantalla, salvo `#fff`/`#000` en impresión.
Están declarados en `[data-recinto="itpr|sanjuan|manati"]` (claro) y `[data-modo="oscuro"] [data-recinto=…]` (oscuro, y por
`prefers-color-scheme: dark` cuando `<html>` no trae `data-modo`). Cualquier elemento puede llevar su propio `data-recinto` y
trae su paleta completa.

| Token | Uso |
|---|---|
| `--paper` | fondo de la página |
| `--surface`, `--surface-2`, `--raise` | superficies: normal, un escalón más oscuro, la más clara (campos, tarjetas flotantes) |
| `--ink`, `--ink-2`, `--ink-3` | texto: pleno, secundario, terciario (`--ink-3` también es el borde de un control) |
| `--rule`, `--rule-soft` | líneas de tabla; decorativas, no son borde de control |
| `--accent`, `--accent-hover`, `--accent-soft`, `--accent-fg` | color de acción y de información; `--accent-fg` es el texto sobre `--accent` |
| `--field`, `--field-ink`, `--field-ink-2`, `--field-up`, `--field-down` | el campo de color de marca (barra, héroe, pie) y su texto; `-up` un escalón más claro, `-down` más oscuro |
| `--marker`, `--marker-ink` | el color de marca del recinto (amarillo ITPR y Pumas, rojo Tiburones). **Solo marcador**: subrayado activo, botón del héroe, última columna, tajos decorativos. Nunca en un chip, fondo de fila ni texto de estado. |
| `--ok`, `--ok-bg`, `--obs`, `--obs-bg`, `--bad`, `--bad-bg`, `--on-bad` | veredictos. `--on-bad` es el texto sobre un relleno sólido de `--bad`. |
| `--placa`, `--placa-ink` | la placa clara (blanco) de los logos |
| `--foco` | color del anillo de foco (en `.campo`/`.campo-oscuro` pasa a `--marker`) |
| `--pat-obs`, `--pat-inc`, `--pat-obs-sw`, `--pat-no-sw` | texturas de estado (rayas duras, no degradados) |
| `--tan30` (.5774) | la pendiente del corte |
| `--ex --ey --hx --hy --dur --ent` | personalidad de movimiento del recinto |


### Tipografía: una familia, cinco escalones

`--ff` = Libre Franklin 400–800 (enlace de Google Fonts en `index.html`, el service worker la guarda al primer uso). Si no ha
bajado se pinta con "Franklin Ajustada", una cara local con `size-adjust` (métricas aproximadas).

| Escalón | Valor | Clase / uso |
|---|---|---|
| `--t-hero` | `clamp(2.75rem,1rem+6.4cqw,6.5rem)`, 800, MAYÚSCULAS, interlínea .9 | `.h1`: los dos renglones de título de pantalla |
| `--t-fig` | `clamp(3rem,1.5rem+3.8cqw,5.5rem)`, 800, cifras tabulares | cifras de KPI (`.kpi-v`), centro de la dona |
| `--t-head` | `clamp(1.75rem,1.2rem+1.6cqw,2.625rem)`, 700 | `.h2`: encabezado de capítulo |
| `--t-body` | `1rem` | texto |
| `--t-small` | `.875rem` | notas, etiquetas |

Reglas: nada por debajo de 13px; **sin rótulos en mayúsculas pequeñas**, sin monoespaciado; `font-variant-numeric:tabular-nums`
en todo número (clase `.num` o ya incluido en `.kpi-v`, `td.n`). `cqw` es un porcentaje del ancho de **la app** (`#app`), no del
navegador. `.h3` (1.375rem/700) es el título de bloque pequeño. Además: `.lead` (1.125rem), `.suave` (texto secundario, se adapta a
`.campo`), `.pie-nota`/`.pista` (nota pequeña).

## 4. La rejilla de capítulos

`#app` lleva `class="app"` (ya está en `index.html`): es un **contenedor de tamaño** (`container: app / inline-size`). Las
pantallas no preguntan por el ancho del navegador sino por el de la app:

```css
@container app (min-width:760px){ … }   /* tableta y escritorio  */
@container app (max-width:759px){ … }   /* teléfono              */
@container app (min-width:1100px){ … }  /* escritorio ancho      */
```

`--m` es el margen lateral (16 / 32 / 48 px según el ancho). Un capítulo es una banda de color de lado a lado con su contenido
en `.in` (ancho máximo 1440, `padding-inline: var(--m)`):

```html
<section class="cap campo-s2" aria-labelledby="h-x">
  <div class="in">
    <h2 class="h2 rev" id="h-x">Cómo va el taller</h2>
    …
  </div>
</section>
```

Colores de capítulo: `.campo` (el campo de marca), `.campo-oscuro` (un escalón más oscuro), `.campo-s2` (`--surface-2`), sin clase (el papel).
Dentro de `.campo` y `.campo-oscuro` el texto es `--field-ink` y el foco es `--marker`.

**Trampas del contenedor**
- Un contenedor es el bloque de contención de todo `position: fixed`. Por eso: la navegación de abajo es `position: sticky` y es
  el **último hijo de `#app`**; los diálogos (`<dialog>`), avisos y menús flotantes viven **fuera de `#app`** (directo en `<body>`).
- `#app` tiene `overflow-x: clip`: nada empuja la página de lado. No uses `overflow-x: hidden` en ancestros (rompe `sticky`).
- Las animaciones de entrada que viajan lateral (`--ex`) se anulan por debajo de 600px de pantalla (solo vertical).

`.solo-esc` (oculto en teléfono) y `.solo-tel` (oculto en tableta y escritorio) están en `estilo.css`.

### Teléfono: pestañas de una sección a la vez

```html
<div class="app" data-sec="resumen">                      <!-- el contenedor lleva la sección activa; también sirve cualquier ancestro -->
  <div class="tabs-m" role="tablist" aria-label="Secciones del panel">
    <button type="button" role="tab" data-sec="resumen"  aria-selected="true">Resumen</button>
    <button type="button" role="tab" data-sec="graficas" aria-selected="false">Gráficas</button>
    <button type="button" role="tab" data-sec="gente"    aria-selected="false">Gente</button>
  </div>
  <section class="cap" data-s="resumen">…</section>
  <section class="cap" data-s="graficas">…</section>
  <section class="cap" data-s="gente">…</section>
</div>
```

El CSS oculta, en teléfono, las secciones `data-s` que no sean la de `data-sec` (en tableta y escritorio se ven todas y `.tabs-m`
desaparece). **Tu JS** cambia `data-sec` del ancestro y los `aria-selected` al pulsar un tab. `.tabs-m` es `sticky` arriba y su
subrayado activo tiene el extremo cortado a 30° (con espacio propio: no queda tapado por el primer capítulo).

## 5. Componentes (clases y marcado)

### 5.1 Botones

```html
<button class="btn" type="button">Guardar</button>                 <!-- primario: fondo --accent, esquina superior derecha cortada -->
<a class="btn marca-b" href="…">El día <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>  <!-- marcador: SOLO sobre .campo -->
<button class="btn sec" type="button">Informes</button>             <!-- secundario sobre .campo (translúcido) -->
<button class="btn tenue" type="button">Gestionar</button>          <!-- secundario sobre papel (también .ghost) -->
<button class="btn peligro" type="button">Eliminar</button>        <!-- peligro: bad-bg con texto bad; al roce sólido -->
<button class="btn chico">…</button>   <button class="btn ancho">…</button>
```

- 52px de alto (44 en `.chico`), 0 de radio, sin sombra. Presionar = `scale(.97)` en 80ms; el roce (`(hover:hover) and (pointer:fine)`)
  mueve el botón `translate(var(--hx), var(--hy))`.
- El `clip-path` del botón se abre 10px por fuera para no recortar el anillo de foco: **no le pongas `overflow` ni otro `clip-path`**.
- Los iconos dentro de un botón son `<svg viewBox="0 0 24 24">` con trazo (`stroke="currentColor"`, ya estilizado por `.btn svg`).
- Un enlace que parece texto: `.enlace` (acento, subrayado de 2px, 44px de alto táctil).

### 5.2 Campos de formulario

```html
<label class="campo-f">Usuario<input id="x" name="x"></label>
<label class="campo-f">Grupo<select>…</select></label>
<label class="campo-f">Comentario<textarea></textarea></label>
```

`label.f` (el nombre viejo) es sinónimo de `.campo-f`. Los `input/select/textarea` ya son cuadrados, con borde de **2px `--ink-3`**
(nunca `--rule`), 52px, fondo `--raise` y foco con anillo (`--foco`) de 3px. Texto de 16px (iOS no hace zoom). `.pista` es la nota
pequeña bajo un campo. Los `checkbox`/`radio` conservan el control nativo con `accent-color`.

Conmutador de dos o más opciones: `<div class="conmuta" role="group" aria-label="…"><button aria-pressed="true">Entrar</button><button aria-pressed="false">Crear cuenta</button></div>`.
Filtros en fichas: `<div class="pestanas" role="group" aria-label="Filtrar"><button aria-pressed="true">Todos</button>…</div>`
(admite `<small>` con una cuenta).

Mensajes de `#aviso`: `class="error"` (bad-bg, barra de 6px) o `class="exito"` (ok-bg). Se usan con `aviso(texto, tipo)` de `nucleo.js`.

### 5.3 Estados (el idioma, lo más importante)

Cinco veredictos, y `data-v` siempre vale `apto | obs | no | inc | bor` (más `sin` = sin empezar en filas):

| `data-v` | Significa | Glifo (id en el sprite) | Barra izquierda de fila |
|---|---|---|---|
| `apto` | Apto / todo bien | círculo con visto `#g-apto` | 3px continua, `--ok` |
| `obs` | Con observaciones | **triángulo lleno** `#g-obs` (sin signo de exclamación) | 6px con rayas a 135° (`--pat-obs`) |
| `no` | No apto / falla | cuadrado redondeado con X `#g-no` | 6px sólida `--bad` |
| `inc` | Incompleto | círculo discontinuo con **!** `#g-inc` (el único uso de "!") | 6px segmentada 7/4 (`--pat-inc`) + fondo `--bad-bg` |
| `bor` | Borrador | círculo medio lleno `#g-bor` | sin barra |

Más `#g-info` (cuadrado con "i"): el aviso que **no es un veredicto** ("Piden ser instructor", "Esperan tu aprobación").

Chip: `chipEstado(v, texto?, grande?)` de `campus.js`, o a mano:

```html
<span class="estado" data-v="obs"><svg class="g" aria-hidden="true"><use href="#g-obs"/></svg>Con observaciones</span>
<span class="estado estado-lg" data-v="inc">…Incompleto</span>
```

Fila con barra: `class="fila-v"` + `data-v` (la barra sale de `::before`; la fila `inc` además se tiñe de `--bad-bg`):

```html
<button class="t-fila fila-v" data-v="no">…</button>
<tr data-v="inc">…</tr>   <!-- en table.datos la barra va en la primera celda -->
```

Muestra de leyenda y de gráfica: `<span class="sw" data-v="apto|obs|no" aria-hidden="true"></span>` (cuadrado de 18px con la textura del veredicto).
Texturas de dona en SVG: `url(#px-apto)`, `url(#px-obs)`, `url(#px-no)` (patrones del sprite).

**Reglas del idioma (no negociables)**
1. El color nunca va solo: todo estado lleva forma + glifo + **palabra escrita**; en filas y gráficas también el patrón.
2. Los glifos son **solo para veredictos**. Ningún triángulo lleno, círculo con visto, cuadrado con X o círculo discontinuo se usa
   como adorno de recinto, botón o tarjeta. Los avisos que no son veredicto usan `#g-info` y el tono de información
   (`--accent-soft`/`--ink`), jamás `--obs`.
3. El rojo de marca de Tiburones y el oro de Pumas/ITPR son **marcadores**, nunca van dentro de un chip de estado, un fondo de fila, una
   alerta ni una gráfica de veredictos.
4. En el editor, los botones segmentados (`.seg`) y las filas del reporte impreso usan los mismos glifos (la maqueta no los cubrió).
5. Sustituyen a `.pill`, `.exclama`, `.fila-falta`, `.rrow em`. `.tarjeta[data-v="obs"]::before` usa `var(--obs)` (rayas), nunca `--marker`.

### 5.4 Héroe

```html
<section class="cap hero campo" aria-labelledby="h-ins">
  ${ilustracion()}                                            <!-- campus.js: losas / aleta / zarpazos de fondo -->
  <div class="in hero-in">
    <div class="hero-txt">
      <h1 class="h1" id="h-ins"><span class="linea"><span>Panel del</span></span> <span class="linea"><span>taller</span></span></h1>
      <p class="hero-sub rev">Martes, 20 de octubre de 2026 · Sistema ITPR</p>
      <div class="hero-acc rev"><a class="btn marca-b" href="…">El día</a> <button class="btn sec">Informes</button></div>
    </div>
  </div>
  ${placaHero()}                                              <!-- campus.js: la placa blanca cortada a 30° con el escudo; último hijo -->
</section>
```

- Variante baja: `class="cap hero campo hero-chico"`. El título va en **dos renglones enmascarados** (`.linea > span`) con un espacio
  entre ellos (así se lee "Panel del taller").
- La máscara recorta solo en vertical. **Nombres largos** ("Guillermina"): `prepararEntradas()` llama a `ajustarTitulares()`, que achica
  el titular por pasos (`--fit`) hasta que cabe y, como último recurso, parte la palabra (`.h1.parte`). Si cambias el texto de un
  `.h1` después de pintar, llama `ajustarTitulares(raiz)`. No uses `white-space:nowrap` en un titular.
- El título por recinto (para entrada y paneles): ITPR «Revisa con método.», San Juan «Revisa a fondo.», Manatí «Revisa con garra.»
  (`RECINTOS` no los trae; escríbelos en tu pantalla según `recintoActual()`).
- La placa (`.placa`) es la losa: su borde superior sube 30°. `--pw` es el ancho; el alto es `0.8 × --pw`. Teléfono: la placa mide ≥ 250px de
  ancho para que el escudo pase de 90px. **No muevas, gires ni recortes el escudo.**

### 5.5 Mosaico de cifras (KPI)

```html
<section class="cap" data-s="resumen"><div class="kpis">
  <a class="kpi kpi-grande rev" href="…"><span class="kpi-e">Entregadas</span><b class="kpi-v">31</b><small class="kpi-s"><b>8</b> hoy · 18 estudiantes</small></a>
  <a class="kpi rev" href="…"><span class="kpi-e">Estudiantes</span><b class="kpi-v">18</b><small class="kpi-s">3 sin empezar</small></a>
  <a class="kpi alerta rev" href="…"><span class="kpi-e">${glifo("inc")}Incompletos</span><b class="kpi-v">4</b><small class="kpi-s">Fuera del informe final</small></a>
  <a class="kpi info rev" href="…"><span class="kpi-e">${glifo("info")}Piden ser instructor</span><b class="kpi-v">2</b><small class="kpi-s">Esperan tu aprobación</small></a>
  <div class="kpi kpi-leyenda rev"><h3>Cómo leer los estados</h3><ul><li data-v="apto">${glifo("apto")}<span>Apto: círculo con visto</span></li>…</ul></div>
</div></section>
```

Mosaico sin huecos: cuadrícula `1.7fr 1fr 1fr 1fr` × 2 filas con **una tarjeta dominante** (`.kpi-grande`, dos filas, `--accent`). Bajo 1100px de app: dos
columnas y la grande ocupa el ancho. `.kpi` puede ser `<a>`, `<button>` o `<div>`. `.alerta` = incompletos (rosa + barra segmentada, "!" en el glifo);
`.info` = aviso azul que no es veredicto. En el teléfono el `.kpis` del estudiante usa 2 columnas.

### 5.6 Tablas

```html
<div class="tabla-env rev"><table class="datos apila">
  <caption class="sr">Informes</caption>
  <thead><tr><th scope="col">Equipo</th><th scope="col" class="n">Puntos</th></tr></thead>
  <tbody><tr data-v="inc"><td class="primera"><b>XYZ99</b><small>HP EliteDesk</small></td><td class="n" data-l="Puntos">33/37</td></tr></tbody>
</table></div>
```

`table.datos` es la tabla base (encabezado `--surface-2`, filas con línea `--rule`, `tr[data-v]` pone la barra en la primera celda, `td.n` a la
derecha con cifras tabulares). **Con `class="apila"`**, bajo 900px de app las filas pasan a tarjetas: cada `<td>` lleva `data-l="Etiqueta"`; `td.primera` ocupa
el ancho, `td.sec` se oculta, `td.v-celda` va a todo el ancho. Así Informes y Usuarios **no hacen scroll lateral en 768px**.

### 5.7 Placas y marcas oficiales (ley)

Reglas de `docs/img/LEEME.md`, que mandan sobre cualquier gusto:

- Nunca girar, recortar, estirar, recolorear, ponerles sombra o filtro. Escalar siempre proporcional (`height:auto`).
- **Nunca semitransparentes**: ni la marca ni ningún ancestro suyo hasta la placa (`.placa-wrap`) anima `opacity`. Un escudo a medio opacar se mezcla con el
  campo que tiene detrás (el rojo se ve a través del escudo de Tiburones, el cuadro dorado del ITPR se pone oliva). La placa del héroe entra destapándose con
  `clip-path` y llega con `transform` solamente; los `llega-*` no bajan de la placa (en la revelación viajan en su propia capa y el héroe no las recorta).
- **Nada cruza una marca**: mientras dura una transición (cambio de recinto o de modo) `campus.js` (`alzarMarcas`) le da `view-transition-name` a
  `.placa-wrap`, `.sello`, `.placas-pie` y `.f-placa`: salen de la foto de la página y van en capas propias encima, así el filo de color de la revelación
  pasa por debajo. Entre una placa y la siguiente solo hay un fundido de 200 ms entre dos placas blancas opacas. Si añades otra pieza con marca, agrégala a `MARCAS`.
- **Ninguna marca ni ninguno de sus ancestros lleva `transform` al reposo** (las llegadas animadas terminan en `none`).
  Excepción acordada: durante los ≤ 0,9 s de la llegada (entrada de la pantalla y cambio de recinto) `.placa-wrap` puede trasladarse y escalar
  **parejo** (nunca girar ni deformar), siempre con `transform-origin:100% 100%` y sin salirse del héroe: `pruebas/marcas.mjs` congela cada
  animación en varios puntos y comprueba que el escudo queda dentro del ancestro que recorta. Y **ningún `clip-path` de un
  ancestro puede tocar la caja de la imagen** (la placa del héroe tiene un corte arriba a la izquierda, lejos del escudo; ya está calculado).
- Los escudos van **solo sobre una placa clara** (`--placa`, blanco) con ≥ 12 % del alto de la marca libre por cada lado, sin tajos, aletas, rayas ni texto adentro.
- DEPR solo sobre una placa **rectangular** clara. Nunca sobre campo oscuro ni de color; nunca invertido.
- La marca ITPR (`itpr-marca.webp`) nunca sobre `#05568D` ni sobre oro sin su placa blanca. El lockup Manatí: `itpr-manati.webp` sobre placas claras;
  `itpr-manati-claro.webp` solo sobre oscuros que no sean `#05568D`.
- El escudo de Tiburones nunca sobre rojo.
- Anchos mínimos (px CSS): tiburón 72, puma 64, marca ITPR 24, lockup Manatí 160, DEPR 140. Por debajo se usa la marca ITPR o el favicon.
- `pruebas/marcas.mjs` lo comprueba (3 recintos × claro/oscuro × 360/375/390/1280): corre `node pruebas/marcas.mjs prof` para revisar una pantalla con sesión.

Placas de pie (`.placa-campus`, `.placa-depr`) y de héroe (`.placa-wrap > .placa`) están en `estilo.css`; no las rehagas.

### 5.8 Pie y navegación (los pone el router)

`pintar()` arma: `barra()` + `<main id="principal">vista</main>` + `pie()` + `navBaja()`. **No repitas ninguno en tu vista.** En el editor no se pinta ni
pie ni navegación de abajo. `pie()` trae el aval del Departamento de Educación, la placa del recinto (marca ITPR, escudo o lockup de Manatí), la placa DEPR, las tres
tarjetas para cambiar de recinto y el nombre del recinto a todo el ancho recortado abajo. La barra trae el sello ITPR en su placa blanca, el chip del recinto, el
modo, quién eres, `Salir`, y (desde 760px) la navegación de arriba con subrayado cortado a 30°. En el teléfono, la navegación de abajo: Inicio · Mis hojas (con
insignia de incompletas) · Nuevo (relleno con `--marker`; instructores: El taller) · Salir, con `padding-bottom: env(safe-area-inset-bottom)`.

Las clases de la barra (`.barra`, `.marca-app`, `.nav-p`, `.rec-btn`, `.menu-rec`, `.nav-baja`, `.insignia`, `.conexion`, `.quien`, `.sello`) son del chasis.
`#conexion` es el indicador de señal que ya usa `pintarConexion()`.

## 6. APIs de JavaScript

### `docs/campus.js` (módulo ES, sin dependencias estáticas → no hay ciclos)

| Función | Qué hace |
|---|---|
| `iniciarCampus()` | Una vez, desde `app.js`, antes del primer pintado. Lee `localStorage` (`bitacora:recinto`, `bitacora:modo`), engancha los controles (delegación en `document`) y el color de la barra del sistema. |
| `recintoActual()` / `modoActual()` | `"itpr"｜"sanjuan"｜"manati"` y `"claro"｜"oscuro"` (el modo resuelto, aunque venga del sistema). |
| `aplicarRecinto(id, {recordar=true})` | Cambia sin animación, recuerda en este equipo, actualiza textos (`[data-r="nombre|largo|mascota|sub"]`), `aria`, `.pie[data-nombre]`, `<meta name="theme-color">`. |
| `cambiarRecinto(id, origen?)` | Con la revelación y el aviso. `origen` = evento, elemento o `{x,y}`; con teclado parte del centro del elemento. También lo guarda en el perfil. |
| `alternarModo()` | Claro ↔ oscuro con fundido de 180ms. |
| `sincronizarConPerfil(perfil)` | El recinto del perfil manda si no está vacío; si lo está, se queda el del equipo (y se guarda en el perfil si se eligió a propósito). Lo llama `usarPerfil()`. |
| `guardarEnPerfil(id)` | `perfiles.recinto` del usuario en sesión; en silencio sin señal o sin la columna. Devuelve `true/false`. |
| `tilesRecinto({pie?, leyenda?})` | `{ html, montar }`: las **tres tarjetas de recinto** ("Tu recinto" en la elegida). Úsala en la entrada: `const t = tilesRecinto(); … t.html … t.montar()`. Los clics ya los atiende la delegación; `montar()` solo sincroniza `aria-pressed`. |
| `selectorRecinto({conSalir?})` | `{ html, montar }`: el chip de la barra con su menú (`role="menu"`, flechas, Escape devuelve el foco) y, en teléfono, la hoja de abajo (`<dialog>`). Lo usa `barra()`. |
| `prepararEntradas(raiz)` | Reparte el escalón (`--i`) y observa `.rev`, `.linea`, `.col`, `.dona-aro`, `.hero`, `.e-izq` para añadir `.visto` al entrar en pantalla; llama a `ajustarTitulares`. **Lo llama `pintar()` tras renderizar**; si insertas HTML después, vuélvelo a llamar con ese contenedor. |
| `ajustarTitulares(raiz)` | Achica los `.h1` que desbordan. |
| `avisar(texto)` | El aviso `aria-live` (`#toast`), 3.2s. |
| `chipEstado(v, texto?, grande?)`, `glifo(v)`, `NOMBRE_VEREDICTO` | Piezas del idioma de estados (5.3). `texto` se escapa. |
| `ilustracion()`, `placaHero()` | Fondo y placa del héroe (5.4). |
| `RECINTOS` | `{id, nombre, largo, mascota, pie, sub, aviso, crest, w, h, alt}` por recinto. |

**Escapa todo texto de usuario interpolado con `esc()`** de `nucleo.js` (nombres, seriales, comentarios). La app tiene riesgo de XSS guardado si no.

### `docs/router.js`

Exporta `iniciar`, `cargarPerfil`, `usarPerfil`, `salir`, `barra`, `irA(destino, opc)` (`"inicio" | "panel" | "instructor" | "codigo"`) y `pintar()`. Una vista es una
función `vistaX()` que **devuelve HTML** para el interior de `<main>` y una `montarX()` que engancha eventos. Los destinos de la navegación llevan
`data-nav="…"` (hay **dos copias**: barra de arriba y de abajo; en pruebas usa `[data-nav="x"]:visible`). Nunca llames `window.scrollTo` ni pintes la barra: `pintar()` lo hace.

### Movimiento (`estilo.css` + `prepararEntradas`)

- Marca lo que entra con `class="rev"` (un bloque del capítulo) y titulares con `.linea`. Barras: `<i class="barra-g" style="--i:n">` (se abren con `scaleX`); columnas:
  `.col` con `.cuerpo` (`scaleY`); dona: `.dona-aro` con `.anillo` (gira y aparece). Sin script o sin `html.js` todo se ve (el contenido nunca depende del JS).
- Solo `transform` y `opacity` (y `clip-path` en las revelaciones diseñadas). **Nunca `transition: all`.** Respuesta a una acción en menos de 300ms. Presionar = `scale(.97)` en 80ms.
- El roce va **siempre** dentro de `@media (hover:hover) and (pointer:fine)`. Usa `--hx/--hy` para el desplazamiento (cada recinto lo trae distinto).
- `prefers-reduced-motion`: se quita el recorrido y quedan fundidos de 200ms. El cambio de recinto es un fundido de 180ms.
- Impresión: `@media print { *{clip-path:none} }` ya está en `estilo.css`; el reporte imprimible y el editor no llevan cortes decorativos. Lo que no se imprime lleva `.no-print`.
- Sin bucles ambientales (la deriva de las ilustraciones se quitó): ningún escudo, trazo de marca ni ilustración se anima en bucle.

## 7. Responsabilidades por área

- **acceso** — Entrada (`#f-acceso`, ids `a-*`, `m-entrar`, `m-crear` se conservan para las pruebas): héroe por recinto, `tilesRecinto()` ("Tu recinto"), la
  conmutación Entrar / Crear cuenta, el código de clase, `.e-aval` con la placa DEPR; Mis hojas (`vistaPanel`) con `.estado` en lugar de `.pill`/`.exclama`. Al crear
  cuenta manda `recinto: recintoActual()` en el cuerpo de `registro`. En el primer teléfono los campos del acceso deben verse en la primera pantalla.
- **dashboard** — Estudiante: héroe `hero-chico` ("Hola, Nombre"), `.kpis` de 4, alerta de incompletas, recientes; instructor: héroe, `.kpis` con leyenda, gráficas
  (dona, columnas, barras con textura y valor directo; la gráfica de veredictos sin marcador de marca; los ceros con una base visible), Gente en `table.datos.apila`.
  Pestañas de teléfono con `.tabs-m`.
- **tablero** — Resumen del día, filtros (`.pestanas`), filas `.fila-v` con barra de avance cortada a 30° (`clip-path: polygon(0 0,100% 0,calc(100% - var(--h)*1.732) 100%,0 100%)`),
  "Cómo leer cada fila", informes y Usuarios sin scroll lateral a 768, inventario, revisar, QR (se imprime en negro sobre blanco).
- **editor** — Los cuatro botones `.seg` con los glifos del idioma de estados, el reporte (`vistaReporte`) con las mismas marcas, impresión sin cortes, la calificación.
  Sin navegación de abajo ni pie en el editor.

Cada pantalla: sin `overflow-x` propio, nada con `white-space: nowrap` en titulares, controles de ≥ 44px en teléfono, español de Puerto Rico (es-PR), `esc()` en todo texto interpolado.

## 8. Pruebas

- `node pruebas/ui.mjs` — interfaz con Playwright sobre Edge/Chrome y Supabase de mentira (`pruebas/arnes.mjs`: `simularSupabase`, `nuevaPagina`, `entrar`, `sinDesborde`,
  `prueba`, `terminar`, `PERFILES` con `recinto`, `EQUIPOS`, `DIAGS`, `escrituras`). `sinDesborde` además intenta `scrollTo(200,0)`: la página no debe moverse.
- `node pruebas/marcas.mjs [usuario]` — auditoría de marcas oficiales.
- `node pruebas/resumen.mjs` — las cifras puras de `resumen.js`.
- Los botones de navegación existen dos veces (arriba y abajo): en pruebas usa `[data-nav="…"]:visible`.
- Subir `VERSION` en `docs/sw.js` al publicar; todo archivo nuevo de `docs/` entra en `CASCO`.
