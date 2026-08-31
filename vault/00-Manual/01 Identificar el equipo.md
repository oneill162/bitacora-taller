---
tipo: manual
paso: 1
tags: [manual, inventario]
---
# 01 · Identificar el equipo

Todo reporte empieza por saber de qué máquina hablamos. La etiqueta de servicio va detrás o al lado del gabinete en desktops; debajo en laptops, y a veces dentro del compartimiento de la batería.

## Datos que van en la hoja
- Marca, modelo y número de serie (*Service Tag*)
- Tipo: torre, all-in-one, laptop, mini PC
- Sistema operativo y edición
- Número de inventario de la escuela

## Desde Windows
```
msinfo32
```
Muestra fabricante, modelo, versión del BIOS, procesador y memoria. También sirve `Win + Pausa` o *Configuración → Sistema → Información*.

```powershell
Get-CimInstance Win32_BIOS | Select-Object SerialNumber
Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model
```

> [!tip] `wmic` ya no existe
> El viejo `wmic` no viene instalado en las versiones recientes de Windows 11. Usa PowerShell con `Get-CimInstance`.

El serial es la llave: enlaza esta hoja con el historial del equipo en [[Equipos]].

Anterior: [[00 Seguridad antes de tocar nada]] · Siguiente: [[02 Inspección externa]]
