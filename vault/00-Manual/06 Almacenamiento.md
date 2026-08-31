---
tipo: manual
paso: 6
tags: [manual, disco]
---
# 06 · Almacenamiento

El disco es la pieza que más falla y la que se lleva los datos cuando muere. Tres cosas: salud, errores y espacio.

## Salud del disco (S.M.A.R.T.)
```powershell
Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus, OperationalStatus
```
`HealthStatus` debe decir **Healthy**. Si dice *Warning* o *Unhealthy* es Falla: respalda los datos de inmediato antes de seguir probando.

## Errores del sistema de archivos
```
chkdsk C: /f /r
```
Como C: está en uso, Windows pide programarlo para el próximo reinicio; contesta `S`. El `/r` busca sectores dañados y puede tardar horas en discos mecánicos grandes — no lo empieces a las 2:50 pm. Para una revisión rápida sin reparar: `chkdsk C:` sin parámetros.

## Espacio libre
Menos de **15% libre** en C: es Observación; menos de 5% es Falla, porque Windows ya no puede actualizar ni crear temporales. Libera con *Sensor de almacenamiento* o `cleanmgr`.

> [!danger] Cuidado
> Un disco mecánico que hace clics repetidos o chirridos se está muriendo. No corras `chkdsk /r` sobre él: la prueba puede rematarlo. Respalda primero.

Anterior: [[05 Memoria RAM]] · Siguiente: [[07 Arranque de Windows]]
