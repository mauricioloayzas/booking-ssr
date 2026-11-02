<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const slug = route.params.slug as string
const profesionalId = route.params.id as string
const booking = usePublicBooking()

const { data: profileRes } = await useAsyncData(`staff-profile-${slug}`, () =>
  booking.getProfile(slug).catch(() => null)
)
const profile = computed(() => profileRes.value?.data ?? null)

if (!profile.value) {
  throw createError({ statusCode: 404, statusMessage: 'No encontramos este negocio' })
}

const { data: staffRes } = await useAsyncData(`staff-detalle-${profile.value.id}-${profesionalId}`, async () => {
  const [profs, cats, servs, serviciosDelProf, horarios] = await Promise.all([
    booking.getProfesionales(profile.value!.id),
    booking.getCategorias(profile.value!.id),
    booking.getServicios(profile.value!.id),
    booking.getServiciosDelProfesional(profile.value!.id, profesionalId),
    booking.getHorariosProfesional(profile.value!.id, profesionalId),
  ])
  return {
    profesional: (profs.data ?? []).find(p => p.id === profesionalId) ?? null,
    categorias: cats.data ?? [],
    servicios: servs.data ?? [],
    servicioIds: (serviciosDelProf.data ?? []).map(s => s.servicio_id),
    horarios: horarios.data ?? [],
  }
}).catch(() => null)

const profesional = computed(() => staffRes.value?.profesional ?? null)

if (!profesional.value) {
  throw createError({ statusCode: 404, statusMessage: 'No encontramos a este profesional' })
}

const canonicalUrl = `${config.public.siteUrl}/${slug}/profesional/${profesionalId}`

useSeoMeta({
  title: `${profesional.value.nombre} — ${profile.value.name}`,
  description: profesional.value.bio || `Agenda tu cita con ${profesional.value.nombre} en ${profile.value.name}.`,
  ogTitle: `${profesional.value.nombre} — ${profile.value.name}`,
  ogImage: profesional.value.foto_url || undefined,
  twitterCard: 'summary',
})
useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })

function iniciales(nombre: string) {
  return nombre.trim().slice(0, 2).toUpperCase()
}

const serviciosDelStaff = computed(() => {
  const ids = staffRes.value?.servicioIds ?? []
  return (staffRes.value?.servicios ?? []).filter(s => ids.includes(s.id))
})

const categoriasDelStaff = computed(() => {
  const todasLasCategorias = staffRes.value?.categorias ?? []
  const idsPresentes = new Set(serviciosDelStaff.value.map(s => s.categoria_servicio_id))
  return todasLasCategorias.filter(c => idsPresentes.has(c.id))
})

const busqueda = ref('')
const categoriaFiltro = ref<string | null>(null)

function toggleCategoriaFiltro(id: string) {
  categoriaFiltro.value = categoriaFiltro.value === id ? null : id
}

const serviciosFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return serviciosDelStaff.value.filter((s) => {
    if (categoriaFiltro.value && s.categoria_servicio_id !== categoriaFiltro.value) return false
    if (!q) return true
    return s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)
  })
})

const DIA_LABELS: Record<number, string> = {
  1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo',
}

const horarioOrdenado = computed(() =>
  [...(staffRes.value?.horarios ?? [])].sort((a, b) => a.dia_semana - b.dia_semana)
)

function rangosDelDia(h: { hora_inicio: string; hora_fin: string; hora_inicio_break: string | null; hora_fin_break: string | null }) {
  if (h.hora_inicio_break && h.hora_fin_break) {
    return `${h.hora_inicio} - ${h.hora_inicio_break} y ${h.hora_fin_break} - ${h.hora_fin}`
  }
  return `${h.hora_inicio} - ${h.hora_fin}`
}
</script>

<template>
  <div class="navbar">
    <div class="container">
      <span class="brand">Clichín</span>
    </div>
  </div>
  <main class="container">
    <NuxtLink :to="`/${slug}`" class="btn btn-back">← {{ profile.name }}</NuxtLink>

    <div class="staff-hero">
      <img v-if="profesional.foto_url" :src="profesional.foto_url" :alt="profesional.nombre" class="staff-hero-photo">
      <div v-else class="staff-hero-photo staff-photo-placeholder">{{ iniciales(profesional.nombre) }}</div>
      <h1 class="hero-name">{{ profesional.nombre }}</h1>
    </div>

    <p v-if="profesional.bio" class="card" style="margin-top: 12px;">{{ profesional.bio }}</p>

    <template v-if="horarioOrdenado.length">
      <h2 style="margin-top: 28px;">Horario de atención</h2>
      <div class="card schedule-card">
        <div v-for="h in horarioOrdenado" :key="h.dia_semana" class="schedule-row">
          <span class="schedule-day">{{ DIA_LABELS[h.dia_semana] }}</span>
          <span class="schedule-hours">{{ rangosDelDia(h) }}</span>
        </div>
      </div>
    </template>

    <template v-if="serviciosDelStaff.length">
      <h2 style="margin-top: 28px;">Servicios</h2>
      <input v-model="busqueda" type="search" class="search-input" placeholder="Buscar servicio...">

      <div v-if="categoriasDelStaff.length > 1" class="tag-list">
        <button
          v-for="c in categoriasDelStaff"
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
        <p>No encontramos servicios con ese criterio.</p>
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
          <NuxtLink :to="`/agendar/${slug}?servicio_id=${s.id}&profesional_id=${profesionalId}`" class="btn btn-outline service-btn">
            Agendar
          </NuxtLink>
        </div>
      </div>
    </template>
    <div v-else class="state-container">
      <p>{{ profesional.nombre }} no tiene servicios disponibles por ahora.</p>
    </div>
  </main>
</template>
