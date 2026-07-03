# Páginas SIGP

Páginas principales del módulo SIGP. Todas bajo la ruta /sigp/*.

Convención de rutas:
- /sigp/dashboard
- /sigp/clientes, /sigp/clientes/:id
- /sigp/solicitudes, /sigp/solicitudes/:id
- /sigp/cotizaciones, /sigp/cotizaciones/:id
- /sigp/proyectos, /sigp/proyectos/:id
- (más rutas se agregan fase a fase)

Se protegen con ProtectedRoute + rolesPermitidos según el rol requerido.
