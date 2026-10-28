# Logos del ITPR, Tiburones, Pumas y DEPR

Todos los archivos salen de los originales en `C:/Users/eonei/Desktop/Logo y colores/` (solo lectura).
Ningun logo fue redibujado ni recoloreado, salvo la variante `itpr-manati-claro.webp` (ver abajo), que ya no se publica: la app siempre pone el lockup sobre placa blanca y su copia vive en `.diseno/assets/`.
Todos los `.webp` son lossy calidad 80 con canal alfa sin perdida (alphaQuality 100). Total de `docs/img`: unos 298 KB (298 400 bytes con este archivo).

| Archivo | Px | Bytes | Fondo | Origen y proceso |
|---|---|---|---|---|
| `tiburon.webp` | 538 x 560 | 64 706 | transparente | `ITPR San Juan tiburon.png` (2000x2000). Recortado al contenido (+4 px), reducido a 560 px de alto. El PNG ya traia alfa limpio; el halo rosado tenue es el contorno blanco original del rotulo. |
| `puma.webp` | 640 x 508 | 36 354 | transparente | `ITPR Manati puma.png` (4219x3375, fondo gris casi blanco #F8F8F8 con margenes negros transparentes y una marca de agua tipo destello en la esquina inferior derecha, que queda fuera del recorte). Fondo exterior eliminado por relleno desde el borde, bordes antialias reconstruidos contra azul / amarillo (sin halo blanco), blancos internos llevados a #FFFFFF. Se conserva la firma `ERS 2015`. |
| `itpr-marca.webp` | 320 x 374 | 14 322 | transparente | Solo la marca ITPR (bloque azul inclinado, `itpr` blanco, tres cuadros dorados), recortada de `ITPR Manati.png`. |
| `itpr-manati.webp` | 800 x 365 | 59 918 | transparente | Lockup completo de Manati (marca + INSTITUTO TECNOLOGICO / DE PUERTO RICO / MANATI + dos lineas azules) de `ITPR Manati.png`, recortado y reducido a 800 px. Texto gris pensado para fondos claros. |
| `itpr-manati-claro.webp` | 800 x 365 | 60 692 | transparente | Igual que el anterior, con el texto gris (INSTITUTO TECNOLOGICO y MANATI) cambiado a #F2F2F2. El naranja, las lineas azules, el bloque azul, el `itpr` blanco y los cuadros dorados no se tocan. |
| `depr.webp` | 1000 x 323 | 53 714 | transparente | `DEPR-Logo-2025-1.svg` (804x260, 1.1 MB, trae el escudo como imagen incrustada) renderizado con Edge a 1000 px de ancho (factor 1.244; a 2x hubiera sido 1608 px, fuera del presupuesto de peso). |
| `favicon.png` | 64 x 64 | 2 693 | transparente | Marca ITPR centrada, paleta de 256 colores. Los navegadores lo reducen a 32 / 16 px. |
| `../icono-512.png` | 512 x 512 | 25 181 | #05568D solido | Marca ITPR centrada, alto 60 % del lado (cabe en el circulo seguro de 80 % de un icono maskable). PNG de paleta. |
| `../icono-192.png` | 192 x 192 | 5 993 | #05568D solido | Igual, a 192 px. |

La hoja de contacto con todos los archivos sobre blanco, carbon #1B1D17, azul ITPR #05568D, azul Tiburones #24527B, rojo #E42927 y oro #FDD808 esta en `.diseno/assets/hoja-contacto.png`.

## Reglas de uso

- **Nunca** recolorear, estirar, rotar, poner sombra, contorno o filtro a ninguna marca. Escalar siempre con proporcion fija (`height:auto`).
- **Espacio libre**: al menos 12 % del alto del logo por cada lado. Nada de texto, bordes ni otras marcas dentro de esa zona.
- **Tamano minimo** (ancho en CSS px): tiburon 72, puma 64, marca ITPR 24, lockup Manati 160, DEPR 140. Por debajo de eso, usar `itpr-marca.webp` o el favicon.
- Para pantallas 3x, los archivos alcanzan para mostrarlos hasta unos 180 px de ancho (tiburon), 210 px (puma), 260 px (lockup Manati) y 330 px (DEPR).

| Archivo | Sobre que fondo | No usar sobre |
|---|---|---|
| `tiburon.webp` | blanco, claros, carbon, azul oscuro (#24527B, #05568D). Tiene contorno blanco propio. | rojo #E42927 o #FE0000: el rotulo rojo se funde con el fondo; poner una placa blanca o carbon detras. |
| `puma.webp` | cualquier fondo oscuro o claro; el ovalo azul y el amarillo se mantienen. El vientre del puma es blanco opaco: sobre fondos de color forma una cuna blanca en la esquina inferior izquierda del ovalo (en blanco se ve igual que el original). | oro / amarillo plano como fondo del ovalo, porque el puma amarillo pierde contraste. |
| `itpr-marca.webp` | blanco, carbon, rojo, azul Tiburones. | oro #FDD808 (los cuadros dorados se pierden) y azul #05568D (la faceta azul oscura de abajo a la derecha desaparece). |
| `itpr-manati.webp` | fondos claros: blanco, #F7F7F7, arena. | cualquier fondo oscuro o saturado: el texto gris no se lee. |
| `itpr-manati-claro.webp` | oscuros o saturados: carbon #1B1D17, azul #24527B, rojo. Evitar sobre #05568D (las lineas azules desaparecen). | blanco / claros y oro (el texto casi blanco no se lee). |
| `depr.webp` | **siempre sobre placa clara** (#FFFFFF o #F7F7F7) con el espacio libre indicado. Texto azul marino #1C2854; la linea dorada del logo es #E5BD44. | cualquier fondo oscuro o de color: el azul marino no se lee. Nunca invertirlo. |
| `icono-*.png` | iconos PWA / pantalla de inicio (hechos para poder declararse `any maskable`). | no usar dentro de la interfaz como logo; para eso `itpr-marca.webp`. |
| `favicon.png` | pestana del navegador. | |

## Advertencias conocidas

- Los originales del Tiburon y del Puma son imagenes rasterizadas (parecen generadas): la leyenda circular del tiburon tiene erratas de tipografia (`INSNI` antes de `INSTITUTO`, `TECNOLOGICO` con macron). Se dejaron tal cual por ser la marca entregada; si existe el vector oficial, conviene sustituirlo.
- Los iconos PWA usan el azul solido #05568D que se pidio. Dos facetas oscuras del bloque azul de la marca (abajo a la derecha) tienen casi el mismo azul que el fondo, asi que el contorno del bloque se pierde en esa esquina; los cuadros dorados y el `itpr` blanco siguen siendo claros.
- El logo DEPR lleva el escudo como imagen de baja resolucion incrustada en el SVG; a 1000 px se ve suave, es el limite del original.
- La paleta de Manati (#F7F7F7, #1B5391, #5A736E, #000000, #104F98) no incluye el amarillo dorado del puma. Medidos en el logo: amarillo #F8C424, azul del ovalo #125099 (muestras 18,80,153 / 16,78,150), blanco #FFFFFF.

## Regenerar

Los scripts de proceso estan en `.diseno/assets/_tmp/` (necesitan `npm install --no-save sharp` en esa carpeta y Playwright con Edge del repo).
