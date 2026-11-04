<script setup lang="ts">
import type { PublicServicio } from '~/types'

const route = useRoute()
const config = useRuntimeConfig()
const slug = route.params.slug as string
const booking = usePublicBooking()

const { data: profileRes } = await useAsyncData(`perfil-profile-${slug}`, () =>
  booking.getProfile(slug).catch(() => null)
)
const profile = computed(() => profileRes.value?.data ?? null)

if (!profile.value) {
  throw createError({ statusCode: 404, statusMessage: 'No encontramos este negocio' })
}

const { data: profesionalesRes } = await useAsyncData(`perfil-profesionales-${profile.value.id}`, () =>
  booking.getProfesionales(profile.value!.id).catch(() => null)
)
const profesionales = computed(() => profesionalesRes.value?.data ?? [])

const { data: catalogoRes } = await useAsyncData(`perfil-catalogo-${profile.value.id}`, async () => {
  try {
    const [cats, servs] = await Promise.all([
      booking.getCategorias(profile.value!.id),
      booking.getServicios(profile.value!.id),
    ])
    return { categorias: cats.data ?? [], servicios: servs.data ?? [] }
  } catch {
    return { categorias: [], servicios: [] }
  }
})
const categorias = computed(() => catalogoRes.value?.categorias ?? [])
const servicios = computed(() => catalogoRes.value?.servicios ?? [])

const busqueda = ref('')
const categoriaFiltro = ref<string | null>(null)

function toggleCategoriaFiltro(id: string) {
  categoriaFiltro.value = categoriaFiltro.value === id ? null : id
}

const serviciosFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return servicios.value.filter((s) => {
    if (categoriaFiltro.value && s.categoria_servicio_id !== categoriaFiltro.value) return false
    if (!q) return true
    return s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)
  })
})

function nombreCategoria(id: string | null) {
  return categorias.value.find(c => c.id === id)?.nombre ?? null
}

const canonicalUrl = `${config.public.siteUrl}/${slug}`

useSeoMeta({
  title: profile.value.name,
  description: profile.value.descripcion || `Reserva tu cita en línea con ${profile.value.name}.`,
  ogTitle: profile.value.name,
  ogDescription: profile.value.descripcion || `Reserva tu cita en línea con ${profile.value.name}.`,
  ogType: 'website',
  ogUrl: canonicalUrl,
  ogImage: profile.value.banner_url || profile.value.logo_url || undefined,
  twitterCard: 'summary',
})
useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: profile.value.name,
      url: canonicalUrl,
      ...(profile.value.direccion ? { address: profile.value.direccion } : {}),
      ...(profile.value.telefono_contacto ? { telephone: profile.value.telefono_contacto } : {}),
      ...(profile.value.logo_url ? { logo: profile.value.logo_url } : {}),
    }),
  }],
})

function iniciales(nombre: string) {
  return nombre.trim().slice(0, 2).toUpperCase()
}

const mapsUrl = computed(() =>
  profile.value?.direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.value.direccion)}`
    : null
)

function irAServicios() {
  document.getElementById('servicios')?.scrollIntoView({ behavior: 'smooth' })
}

const modalServicio = ref<PublicServicio | null>(null)
// Tras un pago con Payphone, el navegador vuelve aquí tras un full-redirect — el modal
// perdió todo su estado en el camino, así que avisamos con un banner simple en vez de
// intentar reabrirlo con el servicio/día/hora que ya no tenemos.
const volviendoDePayphone = route.query.pago === 'ok'
</script>

<template>
  <div class="navbar">
    <div class="container">
      <span class="brand">Clichín</span>
    </div>
  </div>
  <main>
    <div
      class="hero-banner"
      :style="profile.banner_url ? { background: `url('${profile.banner_url}') center / cover` } : {}"
    />
    <div class="container">
      <div v-if="volviendoDePayphone" class="card" style="background: var(--green-50); color: var(--green-600); margin-top: 16px;">
        Tu pago fue procesado. {{ profile.name }} confirmará tu cita en breve.
      </div>

      <div class="hero-info">
        <img v-if="profile.logo_url" :src="profile.logo_url" :alt="profile.name" class="hero-logo">
        <div v-else class="hero-logo hero-logo-placeholder">{{ iniciales(profile.name) }}</div>
        <h1 class="hero-name">{{ profile.name }}</h1>
      </div>

      <div class="business-meta">
        <div v-if="profile.direccion" class="business-meta-row">
          📍
          <a v-if="mapsUrl" :href="mapsUrl" target="_blank" rel="noopener">{{ profile.direccion }}</a>
          <span v-else>{{ profile.direccion }}</span>
        </div>
        <div v-if="profile.telefono_contacto" class="business-meta-row">
          📞 {{ profile.telefono_contacto }}
        </div>
      </div>

      <iframe
        v-if="profile.direccion"
        class="map-embed"
        :src="`https://maps.google.com/maps?q=${encodeURIComponent(profile.direccion)}&output=embed`"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      />

      <p v-if="profile.descripcion" class="card" style="margin-top: 16px;">{{ profile.descripcion }}</p>

      <button v-if="servicios.length" type="button" class="btn btn-primary" style="margin-top: 20px;" @click="irAServicios">
        Reservar cita
      </button>
      <NuxtLink v-else :to="`/agendar/${slug}`" class="btn btn-primary" style="margin-top: 20px;">
        Reservar cita
      </NuxtLink>

      <template v-if="servicios.length">
        <h2 id="servicios" style="margin-top: 32px;">Servicios</h2>
        <input v-model="busqueda" type="search" class="search-input" placeholder="Buscar servicio...">

        <div v-if="categorias.length" class="tag-list">
          <button
            v-for="c in categorias"
            :key="c.id"
            type="button"
            class="tag-btn"
            :class="{ selected: categoriaFiltro === c.id }"
            @click="toggleCategoriaFiltro(c.id)"
          >
            {{ c.nombre }}
          </button>
        </div>

        <div v-if="!serviciosFiltrados.length" class="state-container">
          <p>
            No encontramos servicios
            <template v-if="nombreCategoria(categoriaFiltro)"> en "{{ nombreCategoria(categoriaFiltro) }}"</template>
            con ese criterio.
          </p>
        </div>
        <div v-else class="service-grid">
          <div v-for="s in serviciosFiltrados" :key="s.id" class="service-card">
            <div class="service-info">
              <p class="service-name">{{ s.name }}</p>
              <p v-if="s.description" class="service-desc">{{ s.description }}</p>
              <p class="service-sub">
                ${{ s.sale_price.toFixed(2) }}<template v-if="s.duracion_minutos"> · {{ s.duracion_minutos }} min</template>
              </p>
            </div>
            <button type="button" class="btn btn-outline service-btn" @click="modalServicio = s">
              Agendar
            </button>
          </div>
        </div>
      </template>

      <template v-if="profesionales.length">
        <h2 style="margin-top: 32px;">Nuestro equipo</h2>
        <div class="staff-grid">
          <NuxtLink v-for="p in profesionales" :key="p.id" :to="`/${slug}/profesional/${p.id}`" class="staff-card">
            <img v-if="p.foto_url" :src="p.foto_url" :alt="p.nombre" class="staff-photo">
            <div v-else class="staff-photo-placeholder">{{ iniciales(p.nombre) }}</div>
            <p class="staff-name">{{ p.nombre }}</p>
          </NuxtLink>
        </div>
      </template>
    </div>
  </main>

  <BookingModal v-if="modalServicio" :profile="profile" :servicio="modalServicio" @close="modalServicio = null" />
</template>
