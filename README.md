# La Silbatina

El muro donde los hinchas silban al fútbol argentino. Cada hincha deja un mensaje y tiene 5 silbidos para repartir; el mensaje más silbado ocupa el tablero.

## Correr local

```
npm install
DATABASE_URL=postgres://usuario@localhost:5432/silbatina ADMIN_KEY=una-clave npm start
```

## Variables de entorno

- `DATABASE_URL`: conexión a Postgres (las tablas se crean solas al arrancar).
- `ADMIN_KEY`: clave para quitar mensajes. Entrá a `/#moderar`, cargala y aparece "Quitar" en cada mensaje.
- `HASH_SALT`: sal para los hashes de sesión e IP.

No hay registro: cada navegador recibe una cookie anónima. En la base solo se guarda el hash de esa cookie y de la IP.
