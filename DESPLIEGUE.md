# Despliegue del backend de DemocrAXSSY en Oracle Cloud (OCI) con Docker

El frontend ya está publicado en `https://democraxssy-grupod.duckdns.org`. Esta guía despliega **solo el backend**.

## 1. ¿Docker o Terraform? → Docker (con Docker Compose)

| | Docker Compose | Terraform |
|---|---|---|
| Qué hace | Empaqueta y ejecuta el backend | Crea infraestructura (VM, red, IP) en la nube |
| Despliegue en vivo | **Un comando**: `docker compose up -d --build` (menos de 1 minuto) | `terraform apply` crea una VM (varios minutos) y luego igual hay que instalar la app |
| Preparación | Instalar Docker en la VM (1 comando) | Llaves API de OCI, OCIDs, región, archivos `.tf` |
| Riesgo en la demo | Bajo | Medio/alto (permisos, cuotas, "Out of capacity") |
| HTTPS | Lo resuelve Caddy dentro del mismo Compose | No lo resuelve |

**Por qué Docker:** Terraform solo *crea* el servidor; no instala ni arranca tu backend. Para este proyecto habría
que usar Terraform **y además** otra cosa. Docker solo resuelve todo: empaqueta el backend con su versión exacta de
Node (que necesita `node:sqlite`), agrega HTTPS y se levanta "en caliente" con un comando, igual cada vez.

## 2. ¿Por qué hay que agregar archivos al repositorio del backend?

**No se cambió ni una línea del código del backend.** Lo que se agregó son archivos de *configuración de
despliegue*: instrucciones para que Docker sepa cómo armar y arrancar el servidor. Es la práctica normal en
cualquier proyecto (por eso se dice "infraestructura como código"): las instrucciones viven junto al código, en Git,
así cualquiera del grupo (o el profesor) puede desplegar exactamente lo mismo con un comando, y en la VM solo
hay que hacer `git clone`/`git pull`. Si no estuvieran en el repo, habría que escribirlos a mano en el servidor
cada vez.

| Archivo | Qué es, en simple |
|---|---|
| `Dockerfile` | La "receta" de la imagen del backend: usa Node 24, instala dependencias, copia los `.js` y ejecuta `node server.js`. La base SQLite se guarda en un volumen para que no se pierda. |
| `.dockerignore` | Lista de cosas que NO se copian a la imagen (`node_modules`, la base local, `.git`, pruebas). |
| `docker-compose.yml` | Dice qué contenedores levantar juntos: `backend` (tu Node) y `caddy` (HTTPS). |
| `Caddyfile` | Configuración de Caddy: escucha HTTP (80) y HTTPS (443) y le pasa todo al backend. |
| `variables.ejemplo` | Plantilla del archivo `.env`, donde va el nombre de dominio del backend. |
| `DESPLIEGUE.md` | Esta guía. |

### Por qué Caddy

Tu `server.js` habla HTTP. Para HTTPS hace falta un certificado válido (si no, el navegador lo rechaza, y el
frontend en `https://…duckdns.org` no podría conectarse). Caddy se pone delante, **pide y renueva solo un
certificado gratis de Let's Encrypt**, y reenvía las peticiones al backend. Así el backend responde por:

```
Internet ──► VM de OCI
              ├─ :443  HTTPS ─┐
              ├─ :80   HTTP  ─┴─► Caddy ──► backend Node (puerto 3000) ──► SQLite (volumen)
              └─ :3000 HTTP directo al backend
```

CORS ya está bien: el backend responde `Access-Control-Allow-Origin: *`, así que acepta al frontend de DuckDNS.
Lo probé en local con la petición previa (OPTIONS) que hace el navegador desde ese origen, y con tu
`pruebas/prueba-api.mjs` por HTTPS, por HTTP y por el puerto 3000: 0 fallas en los tres.

## 3. Subir los archivos a GitHub (en tu computadora)

En la carpeta del backend (PowerShell o la terminal de Visual Studio):

```powershell
cd C:\Users\usuario\source\repos\backend-Democraxssy-GrupoD
git add Dockerfile .dockerignore Caddyfile docker-compose.yml variables.ejemplo DESPLIEGUE.md
git commit -m "Despliegue con Docker y Caddy para OCI"
git push
```

Si el repositorio es privado, en la VM GitHub pedirá usuario y un *Personal Access Token* como contraseña
(GitHub → Settings → Developer settings → Personal access tokens).

## 4. Crear la máquina virtual en OCI

1. Entra a <https://cloud.oracle.com> e inicia sesión.
2. Menú ☰ → **Compute** → **Instances** → **Create instance**.
3. **Name:** `democraxssy-backend`.
4. **Image and shape** → **Edit**:
   - **Image:** *Change image* → **Canonical Ubuntu** → **24.04** (no la "Minimal").
   - **Shape:** *Change shape* → **Ampere** → `VM.Standard.A1.Flex`, **1 OCPU y 6 GB** (gratis, "Always Free-eligible").
     Si sale **"Out of capacity"**, prueba otro *Availability domain* o usa
     **Specialty and previous generation → `VM.Standard.E2.1.Micro`** (también gratis y suficiente para este backend).
5. **Networking:** que cree una **VCN nueva** con **subred pública** y marca **Assign a public IPv4 address**.
6. **Add SSH keys:** **Generate a key pair for me** → **Download private key**.
   Guárdala, por ejemplo en `C:\Users\usuario\.ssh\oci-backend.key`. **Sin esta llave no puedes entrar.**
7. **Create**. Espera el estado **Running** y copia la **Public IP address** (en esta guía: `129.146.10.20`, usa la tuya).

## 5. Abrir los puertos en OCI (Security List)

1. En la página de la instancia, en **Primary VNIC**, clic en el enlace de la **Subnet**.
2. **Security Lists** → **Default Security List for vcn-…**.
3. **Add Ingress Rules**, una por puerto (Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Source Port vacío):
   - Destination Port Range: `80`
   - Destination Port Range: `443`
   - Destination Port Range: `3000`

## 6. Entrar a la VM e instalar Docker

### 6.1 Conectarse por SSH desde Windows (PowerShell)

```powershell
# Solo la primera vez: permisos privados para la llave (si no, ssh la rechaza)
icacls C:\Users\usuario\.ssh\oci-backend.key /inheritance:r /grant:r "$($env:USERNAME):R"

ssh -i C:\Users\usuario\.ssh\oci-backend.key ubuntu@129.146.10.20
```

Escribe `yes` la primera vez. El prompt cambia a `ubuntu@democraxssy-backend`: ya estás dentro.

### 6.2 Instalar Docker

```bash
sudo apt update
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Vuelve a entrar con el mismo `ssh …` y comprueba:

```bash
docker --version
docker compose version
```

### 6.3 Abrir los puertos en el firewall de Ubuntu

Las imágenes Ubuntu de OCI traen su propio firewall además de la Security List:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

## 7. Elegir el nombre del backend (para HTTPS)

Un certificado HTTPS necesita un nombre, no una IP. Dos opciones gratis:

- **sslip.io (la más rápida, sin registro):** cambia los puntos de la IP por guiones:
  `129.146.10.20` → **`129-146-10-20.sslip.io`**. Ya funciona, no hay que configurar nada.
- **DuckDNS (como el frontend):** en <https://www.duckdns.org> crea un subdominio nuevo, por ejemplo
  `democraxssy-api`, y en **current ip** pon la IP pública de la VM → **update ip**. Queda
  **`democraxssy-api.duckdns.org`**.

## 8. Descargar el backend y desplegarlo

```bash
cd ~
git clone https://github.com/jimegch/backend-Democraxssy-GrupoD.git
cd backend-Democraxssy-GrupoD
cp variables.ejemplo .env
nano .env
```

En `nano`, cambia la línea `DOMINIO=` por tu nombre del paso 7 (ej. `DOMINIO=129-146-10-20.sslip.io`).
Guarda con **Ctrl+O**, **Enter**, y sal con **Ctrl+X**.

**El comando de despliegue ("en caliente"):**

```bash
docker compose up -d --build
```

Revisa que todo esté arriba:

```bash
docker compose ps              # backend y caddy deben decir "Up"
docker compose logs -f caddy   # espera "certificate obtained successfully"; sal con Ctrl+C
```

## 9. Probar

Desde la VM, o desde PowerShell con `curl.exe`:

```bash
curl -I https://129-146-10-20.sslip.io/api/salud    # HTTPS → 200
curl -I http://129-146-10-20.sslip.io/api/salud     # HTTP  → 200
curl -I http://129.146.10.20:3000/api/salud         # backend directo → 200
```

Luego abre `https://democraxssy-grupod.duckdns.org`, escribe en **Servidor del juego**
`https://129-146-10-20.sslip.io` (o tu nombre de DuckDNS) y presiona **Conectar**.

### Nota sobre HTTP desde el frontend

El frontend está en HTTPS, y los navegadores **bloquean** que una página HTTPS llame a un servidor HTTP
("contenido mixto"). Por eso, desde `https://democraxssy-grupod.duckdns.org` se conecta al backend por **HTTPS**.
Para mostrar la conexión por **HTTP** (`http://129.146.10.20:3000`) en la demo hay dos formas:

- En Chrome, en la página del frontend: candado → **Configuración del sitio** → **Contenido no seguro** → **Permitir**, y recarga.
- O abrir el frontend local por HTTP (`npm run dev` → `http://localhost:5173`) y conectar a `http://129.146.10.20:3000`.

## 10. Guion para la demostración en vivo

**Antes de la clase** (hecho y probado): VM creada, puertos abiertos, Docker instalado, repo clonado y `.env` listo.

**Durante la demo:**

```bash
ssh -i C:\Users\usuario\.ssh\oci-backend.key ubuntu@129.146.10.20
cd ~/backend-Democraxssy-GrupoD

docker compose down            # 1) no hay nada corriendo: el frontend no puede conectar
git pull                       # 2) se baja la última versión del código
docker compose up -d --build   # 3) despliegue en caliente
docker compose ps              # 4) servicios arriba
curl -I https://129-146-10-20.sslip.io/api/salud
curl -I http://129.146.10.20:3000/api/salud
```

Después conecta el frontend y juega una partida.

Para empezar con la base de datos vacía: después de `docker compose down`, ejecuta
`docker volume rm backend-democraxssy-grupod_datos` (borra solo las partidas). **No uses `docker compose down -v`**:
borraría también el certificado, y Let's Encrypt limita cuántas veces se puede pedir.

## 11. Comandos útiles

| Comando | Qué hace |
|---|---|
| `docker compose ps` | Ver si los contenedores están corriendo |
| `docker compose logs -f backend` | Ver errores del backend en vivo |
| `docker compose restart backend` | Reiniciar solo el backend |
| `git pull && docker compose up -d --build` | Actualizar a la última versión |
| `docker compose down` | Apagar todo (los datos se conservan) |

Los contenedores tienen `restart: unless-stopped`: si la VM se reinicia, se levantan solos.

## 12. Problemas comunes

- **No responde nada:** revisa la Security List (paso 5) y el firewall de Ubuntu (paso 6.3).
- **HTTPS falla o no sale el certificado:** `docker compose logs caddy`. Casi siempre es el puerto 80 o 443 cerrado,
  `DOMINIO` mal escrito o el subdominio de DuckDNS apuntando a otra IP. Tras corregir: `docker compose up -d --force-recreate caddy`.
- **`Falta DOMINIO en el archivo .env`:** no creaste el `.env` (paso 8).
- **El frontend dice que no puede conectar por HTTP:** es el bloqueo de contenido mixto (nota del paso 9).
- **"Out of capacity" al crear la VM:** otro Availability domain, más tarde, o la shape `E2.1.Micro`.
