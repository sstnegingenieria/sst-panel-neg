# Stash del incidente del PR #65 — bloques C3 de firestore.rules (WIP)

**Qué es**: el contenido del stash compartido `compras-c3-firestore-rules-wip`
que quedó en el checkout principal desde la era del módulo Compras C3
(creado sobre `8c62a8d`, la bitácora del C2 — 02/03-ago-2026) y se encontró
el 09-nov-2026 durante la limpieza del checkout. El parche está al lado:
[`2026-08-03-stash-compras-c3-pr65.patch`](./2026-08-03-stash-compras-c3-pr65.patch)
(+55/−2 sobre `firestore.rules`).

**Qué contiene**: el borrador de los tres bloques de reglas del C3 —
(1) la vía de MARCELA sobre órdenes de compra (`aprobada → comprada` con
`hasOnly` de estado/valor_real/soporte/historial), (2) la corrección de
monto de una compra (`comprada → comprada`, monto corregible con traza,
estado terminal), y (3) la proyección `compras_proyecto` que escribe solo
la CF.

**Veredicto (09-nov-2026)**: NO es trabajo inconcluso — es el WIP previo al
incidente del **PR #65** (una sesión paralela sobrescribió `firestore.rules`
sin commitear entre el E2E y el commit de otra; el PR #64 salió SIN los
bloques C3 y se restauraron exactos en el #65). Comparado línea a línea
contra las reglas vigentes: toda la sustancia está en producción desde el
#64/#65; las únicas diferencias son comentarios con otra redacción y dos
variantes de formato. Se archiva como registro del incidente —el origen de
la práctica de worktrees por carril (cap. 10 del CLAUDE.md)— y el stash se
descartó del checkout compartido tras este commit
(SHA del stash: `725843ea09adad3723cc1af07f1275ffdfa3075c`).
