# Accesos de prueba (solo desarrollo)

Vienen de `apps/api/src/db/seed.ts`. Los teléfonos y la contraseña **no cambian** aunque se
resetee la base de datos (solo cambian los IDs internos) — si algo deja de funcionar
después de un reset, es por eso: hay que **cerrar sesión y volver a entrar**, no porque
cambien las credenciales.

No hay login por correo en ningún lado de la app - todo es por teléfono (formato con
código de país, ej. `+593991234567`), tanto para los roles de contraseña como para armar el
link de invitación de los roles de PIN.

Empresa proveedora: **Transportes Demo S.A.** (slug `demo`)
Empresa cliente: **Comercial El Sol**

## Contraseña (todas las cuentas de abajo)

```
Demo1234!
```

| Rol | Nivel | Teléfono |
|---|---|---|
| Dueño de la plataforma | 0 | `+50588880099` |
| Admin. empresa proveedora | 1 | `+50588880000` |
| Coordinador (proveedora) | 1 | `+50588880004` |
| Admin. empresa cliente | 2 | `+50588880010` |
| Coordinador (cliente) | 2 | `+50588880011` |
| Jefe (solo lectura) | 2 | `+50588880012` |
| Visualizador (solo lectura) | 2 | `+50588880013` |

## Roles de PIN (no de contraseña)

`conductor` y `cliente_solicitante` no usan teléfono+contraseña - se loguean con PIN de 6
dígitos vinculado a un dispositivo. Cada reset de base genera un código de invitación
nuevo (se imprime en la consola al correr `pnpm db:seed`), así que para estos dos pedime
que te pase el código actualizado después de un reset.

Los conductores que se dan de alta después (desde "Conductores", tanto del lado proveedora
como del lado empresa cliente con rol `cliente_conductor`) también son de PIN - cada alta
imprime/devuelve su propio código de invitación, no hay uno fijo de seed para ellos.
