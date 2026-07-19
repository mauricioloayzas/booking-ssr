# Clichín — Booking SSR

SSR público (sin login) para que los clientes de un negocio en Clichín agenden su cita: `/agendar/{url_name}`. Modelado sobre `vaco/profiles-ssr`, pero resolviendo el negocio por **path** (`clichin.com/agendar/slug`) en vez de por subdominio, para no depender de DNS wildcard ni certificado ACM.

## Arquitectura

```
clichin.com/agendar/{slug}  →  API Gateway (HTTP API)  →  Lambda (este proyecto)
                                                                 ↓
                                          Nuxt SSR renderiza el HTML (lee el slug de la ruta)
                                                                 ↓
                              Llama a los endpoints /public/... de orchestrator, apotheca
                              y professionalis (mismos backends que ya usa el admin, nuevos
                              endpoints sin auth agregados para este SSR)
                                                                 ↓
                                        Assets estáticos (JS/CSS): bucket S3 dedicado
```

No hay backend propio: reutiliza los backends existentes de Clichín vía sus nuevos endpoints `/public/...`.

## Cómo apuntar `clichin.com/agendar/*` a este Lambda

Este `serverless.yml` despliega su propio API Gateway HTTP API con su propia URL (`https://xxxx.execute-api...`). Para que responda bajo `clichin.com/agendar/*` hace falta, además, uno de:

- **Custom domain + base path mapping en API Gateway** (más simple, no requiere CloudFront): registrar `clichin.com` como dominio custom en este HTTP API con base path `agendar`.
- **CloudFront** si `clichin.com` ya se sirve detrás de una distribución: agregar un *behavior* con path pattern `/agendar/*` apuntando a este API Gateway como origen adicional.

Ese paso de infraestructura (y el certificado ACM para `clichin.com` en este API Gateway) es responsabilidad de quien administra el hosting actual del dominio — no está automatizado en este repo.

## Deploy

```bash
cp .env.example .env   # completar con las URLs reales de los backends + site key de reCAPTCHA

npm install
npm run deploy:dev     # build + sync de assets a S3 + sls deploy --stage dev
npm run deploy:prod
```

El primer deploy crea el bucket S3 de assets (`clichin-booking-assets-{stage}`) vía CloudFormation.

## SEO

- Cada página `/agendar/{slug}` genera `<title>`, meta description, Open Graph, `rel=canonical` y JSON-LD (`LocalBusiness`) específicos del negocio, renderizados server-side.
- `/robots.txt` y `/sitemap.xml` son rutas dinámicas (`server/routes/`) — el sitemap se genera en cada request consultando `GET /public/profiles` de orchestrator, así que siempre refleja los negocios activos actuales sin redeploy.
