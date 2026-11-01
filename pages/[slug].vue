<script setup lang="ts">
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

      <p v-if="profile.descripcion" class="card" style="margin-top: 16px;">{{ profile.descripcion }}</p>

      <NuxtLink :to="`/agendar/${slug}`" class="btn btn-primary" style="margin-top: 20px;">
        Reservar cita
      </NuxtLink>

      <template v-if="profesionales.length">
        <h2 style="margin-top: 32px;">Nuestro equipo</h2>
        <div class="staff-grid">
          <div v-for="p in profesionales" :key="p.id" class="staff-card">
            <img v-if="p.foto_url" :src="p.foto_url" :alt="p.nombre" class="staff-photo">
            <div v-else class="staff-photo-placeholder">{{ iniciales(p.nombre) }}</div>
            <p class="staff-name">{{ p.nombre }}</p>
          </div>
        </div>
      </template>
    </div>
  </main>
</template>
