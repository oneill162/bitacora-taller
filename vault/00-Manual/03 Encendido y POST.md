---
tipo: manual
paso: 3
tags: [manual, hardware, post]
---
# 03 · Encendido y POST

El **POST** (*Power-On Self-Test*) es la autoprueba que corre el firmware antes de cargar Windows. Es tu primer diagnóstico gratis.

## Qué observar
1. ¿Prenden las luces y gira el ventilador al oprimir el botón?
2. ¿Aparece el logo del fabricante?
3. ¿Hay pitidos, luces parpadeando en patrón, o un código en pantalla?
4. ¿Entra al BIOS/UEFI? Se accede con `F2`, `Del`, `F10` o `Esc` según la marca.
5. Dentro del BIOS: verifica **fecha y hora** correctas y que aparezcan la RAM y el disco.

> [!tip] Cómo leer los códigos
> Los pitidos y patrones de luces **significan cosas distintas en cada marca**. No los adivines: busca el manual de servicio del modelo exacto. Anota el patrón que escuchaste, no tu interpretación.

## Criterios
| Estado | Qué lo define |
|---|---|
| Bien | Enciende de una, completa el POST sin pitidos, entra al BIOS, fecha correcta |
| Observación | Enciende al segundo intento, fecha del BIOS desfasada (batería CMOS), ventilador ruidoso |
| Falla | No enciende, se apaga sola, pitidos de error, pantalla negra con ventiladores girando, reinicios en ciclo |

Anterior: [[02 Inspección externa]] · Siguiente: [[04 Interior y enfriamiento]]
