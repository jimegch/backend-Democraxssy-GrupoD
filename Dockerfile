# Imagen del backend de DemocrAXSSY.
# Node 24 trae node:sqlite sin banderas experimentales.
FROM node:24-alpine

WORKDIR /app

# Primero solo las dependencias, para aprovechar la caché de Docker.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Luego el código del servidor.
COPY *.js ./

# La base de datos vive en un volumen para que no se pierda
# al reconstruir o reiniciar el contenedor.
ENV NODE_ENV=production \
    PORT=3000 \
    DB_RUTA=/data/democraxssy.db
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000

CMD ["node", "server.js"]
