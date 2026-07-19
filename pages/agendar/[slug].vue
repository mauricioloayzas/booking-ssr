<script setup lang="ts">
import { TIPOS_IDENTIFICACION } from '~/types'
import type { PreparePaymentPublicResponse, PublicPaymentMethod } from '~/types'

const route = useRoute()
const config = useRuntimeConfig()
const slug = route.params.slug as string
const booking = usePublicBooking()
const { getToken } = useRecaptcha()

const { data: profileRes } = await useAsyncData(`profile-${slug}`, () =>
  booking.getProfile(slug).catch(() => null)
)
const profile = computed(() => profileRes.value?.data ?? null)

if (!profile.value) {
  throw createError({ statusCode: 404, statusMessage: 'No encontramos este negocio' })
}

const canonicalUrl = `${config.public.siteUrl}/agendar/${slug}`

useSeoMeta({
  title: `Agenda tu cita — ${profile.value.name}`,
  description: `Reserva tu cita en línea con ${profile.value.name}. Elige el servicio, el profesional y el horario que prefieras.`,
  ogTitle: `Agenda tu cita — ${profile.value.name}`,
  ogDescription: `Reserva tu cita en línea con ${profile.value.name}.`,
  ogType: 'website',
  ogUrl: canonicalUrl,
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
    }),
  }],
})

const { data: bootstrap, pending: loadingBootstrap } = await useAsyncData(`bootstrap-${profile.value.id}`, async () => {
  const [cats, profs, servs, warehouses] = await Promise.all([
    booking.getCategorias(profile.value!.id),
    booking.getProfesionales(profile.value!.id),
    booking.getServicios(profile.value!.id),
    booking.getEstablecimientos(profile.value!.id),
  ])
  return {
    categorias: cats.data ?? [],
    profesionales: profs.data ?? [],
    servicios: servs.data ?? [],
    establecimientos: warehouses.data ?? [],
  }
})

type Step = 'categoria' | 'profesional' | 'servicio' | 'establecimiento' | 'fecha' | 'hora' | 'contacto' | 'pago' | 'success'
const volviendoDePayphone = route.query.pago === 'ok'
const step = ref<Step>(volviendoDePayphone ? 'success' : 'categoria')
const submitError = ref('')
const submitting = ref(false)

const categoriaId = ref('')
const profesionalId = ref('')
const servicioId = ref('')
const establecimientoId = ref('')
const fecha = ref('')
const horaInicio = ref('')
const horaFin = ref('')
const nombreContacto = ref('')
const telefonoContacto = ref('')
const email = ref('')
const tipoIdentificacion = ref('05')
const identificacion = ref('')
const notas = ref('')
const resultado = ref<{ fecha: string; hora_inicio: string; hora_fin: string } | null>(null)
const successMensaje = ref('')

const identidadVerificacion = ref<{ requerida: boolean; emailHint: string | null } | null>(null)
const verificandoIdentidad = ref(false)
const verificationId = ref('')
const otpEmail = ref('')
const otpEnviado = ref(false)
const otpEnviando = ref(false)
const otpCode = ref('')
const otpVerificando = ref(false)
const otpError = ref('')

const citaId = ref('')
const paymentMethods = ref<PublicPaymentMethod[]>([])
const loadingPaymentMethods = ref(false)
const metodoSeleccionado = ref<PublicPaymentMethod | null>(null)
const pagoError = ref('')
const pagoLoading = ref(false)
const bankTransaction = ref<PreparePaymentPublicResponse | null>(null)
const comprobanteBase64 = ref('')
const comprobanteMimeType = ref('')
const comprobanteFileName = ref('')

const serviciosDelProfesionalIds = ref<string[]>([])
const establecimientosDelProfesionalIds = ref<string[]>([])
const loadingProfesionalDetail = ref(false)

const categorias = computed(() => bootstrap.value?.categorias ?? [])
const profesionalesFiltrados = computed(() =>
  (bootstrap.value?.profesionales ?? []).filter(p => p.categoria_ids.includes(categoriaId.value))
)
const profesionalSeleccionado = computed(() =>
  (bootstrap.value?.profesionales ?? []).find(p => p.id === profesionalId.value) ?? null
)
const serviciosOptions = computed(() =>
  (bootstrap.value?.servicios ?? [])
    .filter(s => serviciosDelProfesionalIds.value.includes(s.id))
    .filter(s => s.categoria_servicio_id === categoriaId.value)
)
const servicioSeleccionado = computed(() => serviciosOptions.value.find(s => s.id === servicioId.value) ?? null)
const establecimientosOptions = computed(() =>
  (bootstrap.value?.establecimientos ?? []).filter(w => establecimientosDelProfesionalIds.value.includes(w.id))
)
const establecimientoSeleccionado = computed(() => establecimientosOptions.value.find(w => w.id === establecimientoId.value) ?? null)

const hoy = new Date().toISOString().slice(0, 10)

function seleccionarCategoria(id: string) {
  categoriaId.value = id
  profesionalId.value = ''
  servicioId.value = ''
  establecimientoId.value = ''
  step.value = 'profesional'
}

async function seleccionarProfesional(id: string) {
  profesionalId.value = id
  servicioId.value = ''
  establecimientoId.value = ''
  loadingProfesionalDetail.value = true
  try {
    const [servs, estabs] = await Promise.all([
      booking.getServiciosDelProfesional(profile.value!.id, id),
      booking.getEstablecimientosDelProfesional(profile.value!.id, id),
    ])
    serviciosDelProfesionalIds.value = (servs.data ?? []).map(s => s.servicio_id)
    establecimientosDelProfesionalIds.value = (estabs.data ?? []).map(e => e.warehouse_id)
  } catch {
    serviciosDelProfesionalIds.value = []
    establecimientosDelProfesionalIds.value = []
  } finally {
    loadingProfesionalDetail.value = false
  }
  step.value = 'servicio'
}

function seleccionarServicio(id: string) {
  servicioId.value = id
  if (establecimientosOptions.value.length === 1) {
    establecimientoId.value = establecimientosOptions.value[0]!.id
    step.value = 'fecha'
  } else {
    step.value = 'establecimiento'
  }
}

function seleccionarEstablecimiento(id: string) {
  establecimientoId.value = id
  step.value = 'fecha'
}

const slots = ref<{ hora_inicio: string; hora_fin: string }[]>([])
const loadingSlots = ref(false)
const slotsError = ref('')

async function irAHorarios() {
  if (!fecha.value) return
  step.value = 'hora'
  loadingSlots.value = true
  slotsError.value = ''
  slots.value = []
  try {
    const duracion = servicioSeleccionado.value?.duracion_minutos ?? 30
    const res = await booking.getDisponibilidad(
      profile.value!.id,
      profesionalId.value,
      establecimientoId.value,
      fecha.value,
      duracion
    )
    slots.value = res.data ?? []
  } catch {
    slotsError.value = 'No pudimos cargar los horarios disponibles. Intenta de nuevo.'
  } finally {
    loadingSlots.value = false
  }
}

function seleccionarSlot(slot: { hora_inicio: string; hora_fin: string }) {
  horaInicio.value = slot.hora_inicio
  horaFin.value = slot.hora_fin
  step.value = 'contacto'
}

async function confirmar() {
  submitError.value = ''
  if (!nombreContacto.value || !telefonoContacto.value || !email.value) {
    submitError.value = 'Completa tu nombre, teléfono y email.'
    return
  }
  if (!identificacion.value) {
    submitError.value = 'Completa tu número de identificación.'
    return
  }

  if (!verificationId.value) {
    verificandoIdentidad.value = true
    try {
      const check = await booking.checkCliente(profile.value!.id, identificacion.value)
      if (check.data?.requiere_verificacion) {
        identidadVerificacion.value = {
          requerida: true,
          emailHint: check.data.email_hint ?? null,
        }
        otpEmail.value = email.value
        verificandoIdentidad.value = false
        return
      }
    } catch {
      // Falla abierto: si la pista de UX no responde, no bloqueamos el agendamiento.
      // El control real (bloqueante) está en el backend al crear la cita.
    }
    verificandoIdentidad.value = false
  }

  await crearCitaFinal()
}

async function crearCitaFinal() {
  submitting.value = true
  try {
    const res = await booking.crearCita(profile.value!.id, {
      profesional_id: profesionalId.value,
      establecimiento_id: establecimientoId.value,
      servicio_id: servicioId.value || undefined,
      nombre_contacto: nombreContacto.value,
      telefono_contacto: telefonoContacto.value,
      email: email.value,
      tipo_identificacion: tipoIdentificacion.value,
      identificacion: identificacion.value,
      fecha: fecha.value,
      hora_inicio: horaInicio.value,
      hora_fin: horaFin.value,
      notas: notas.value || undefined,
      verification_id: verificationId.value || undefined,
    })
    resultado.value = {
      fecha: res.data.fecha,
      hora_inicio: res.data.hora_inicio,
      hora_fin: res.data.hora_fin,
    }
    citaId.value = res.data.id
    step.value = 'pago'
    await cargarMetodosPago()
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number }; statusCode?: number })?.response?.status
      ?? (e as { statusCode?: number })?.statusCode
    if (status === 403) {
      // Puede pasar en una carrera: alguien reclamó la identidad entre el chequeo y el envío.
      identidadVerificacion.value = { requerida: true, emailHint: null }
      otpEmail.value = email.value
      verificationId.value = ''
    }
    submitError.value = (e as { data?: { error?: string } })?.data?.error || 'No pudimos registrar tu cita. Intenta de nuevo.'
  } finally {
    submitting.value = false
  }
}

async function solicitarCodigoOtp() {
  otpError.value = ''
  if (!otpEmail.value) {
    otpError.value = 'Ingresa tu email.'
    return
  }
  otpEnviando.value = true
  try {
    const recaptchaToken = await getToken('solicitar_codigo_cliente')
    await booking.solicitarCodigoCliente(otpEmail.value, recaptchaToken)
    otpEnviado.value = true
  } catch (e: unknown) {
    otpError.value = (e as { data?: { error?: string } })?.data?.error || 'No pudimos enviar el código. Intenta de nuevo.'
  } finally {
    otpEnviando.value = false
  }
}

async function verificarCodigoOtp() {
  otpError.value = ''
  if (!otpCode.value) {
    otpError.value = 'Ingresa el código que te enviamos.'
    return
  }
  otpVerificando.value = true
  try {
    const res = await booking.verificarCodigoCliente(otpEmail.value, otpCode.value)
    verificationId.value = res.data.verification_id
    identidadVerificacion.value = null
    otpEnviado.value = false
    otpCode.value = ''
    await crearCitaFinal()
  } catch (e: unknown) {
    otpError.value = (e as { data?: { error?: string } })?.data?.error || 'Código incorrecto o expirado.'
  } finally {
    otpVerificando.value = false
  }
}

function cancelarVerificacionIdentidad() {
  identidadVerificacion.value = null
  otpEnviado.value = false
  otpCode.value = ''
  otpError.value = ''
}

async function cargarMetodosPago() {
  loadingPaymentMethods.value = true
  try {
    const res = await booking.getPaymentMethods(profile.value!.id)
    paymentMethods.value = res.data ?? []
  } catch {
    paymentMethods.value = []
  } finally {
    loadingPaymentMethods.value = false
  }
}

const gatewayLabels: Record<string, string> = {
  bank: 'Transferencia bancaria',
  payphone: 'Tarjeta (Payphone)',
  effective: 'Efectivo en el local',
}

function terminarSinPago(mensaje: string) {
  successMensaje.value = mensaje
  step.value = 'success'
}

async function elegirMetodo(pm: PublicPaymentMethod) {
  pagoError.value = ''
  metodoSeleccionado.value = pm

  if (pm.gateway_type === 'effective') {
    terminarSinPago('Pagarás directamente en el local. Te esperamos.')
    return
  }

  if (pm.gateway_type === 'payphone') {
    await pagarConPayphone(pm)
  } else if (pm.gateway_type === 'bank') {
    await generarDatosBancarios()
  }
}

async function pagarConPayphone(pm: PublicPaymentMethod) {
  if (!servicioSeleccionado.value) {
    pagoError.value = 'No pudimos determinar el monto a pagar.'
    return
  }
  pagoLoading.value = true
  pagoError.value = ''
  try {
    const recaptchaToken = await getToken('preparar_pago_publico')
    const returnUrl = `${window.location.origin}${window.location.pathname}?pago=ok`
    const res = await booking.prepararPago(profile.value!.id, pm.id, {
      amount: servicioSeleccionado.value.sale_price,
      reference_id: citaId.value,
      url_return_reference: returnUrl,
      recaptchaToken,
    })
    await booking.vincularTransaccion(profile.value!.id, citaId.value, res.data.transaction_id).catch(() => {})
    if (res.data.pay_with_card) {
      window.location.href = res.data.pay_with_card
    } else {
      pagoError.value = 'No pudimos iniciar el pago con Payphone. Intenta de nuevo.'
    }
  } catch (e: unknown) {
    pagoError.value = (e as { data?: { error?: string } })?.data?.error || 'No pudimos iniciar el pago. Intenta de nuevo.'
  } finally {
    pagoLoading.value = false
  }
}

async function generarDatosBancarios() {
  if (!servicioSeleccionado.value || !metodoSeleccionado.value) return
  pagoLoading.value = true
  pagoError.value = ''
  try {
    const recaptchaToken = await getToken('preparar_pago_publico')
    const res = await booking.prepararPago(profile.value!.id, metodoSeleccionado.value.id, {
      amount: servicioSeleccionado.value.sale_price,
      reference_id: citaId.value,
      recaptchaToken,
    })
    bankTransaction.value = res.data
    await booking.vincularTransaccion(profile.value!.id, citaId.value, res.data.transaction_id).catch(() => {})
  } catch (e: unknown) {
    pagoError.value = (e as { data?: { error?: string } })?.data?.error || 'No pudimos generar los datos de pago. Intenta de nuevo.'
  } finally {
    pagoLoading.value = false
  }
}

function onComprobanteChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  comprobanteFileName.value = file.name
  comprobanteMimeType.value = file.type
  const reader = new FileReader()
  reader.onload = () => {
    const result = reader.result as string
    comprobanteBase64.value = result.split(',')[1] ?? ''
  }
  reader.readAsDataURL(file)
}

async function handleSubirComprobante() {
  if (!bankTransaction.value || !comprobanteBase64.value) return
  pagoLoading.value = true
  pagoError.value = ''
  try {
    await booking.subirComprobante(bankTransaction.value.transaction_id, comprobanteBase64.value, comprobanteMimeType.value)
    terminarSinPago('Recibimos tu comprobante. El negocio lo revisará y confirmará tu cita.')
  } catch (e: unknown) {
    pagoError.value = (e as { data?: { error?: string } })?.data?.error || 'No pudimos subir el comprobante. Intenta de nuevo.'
  } finally {
    pagoLoading.value = false
  }
}

const stepsOrder: Step[] = ['categoria', 'profesional', 'servicio', 'establecimiento', 'fecha', 'hora', 'contacto']
function volver() {
  const idx = stepsOrder.indexOf(step.value)
  if (idx > 0) step.value = stepsOrder[idx - 1]!
}
</script>

<template>
  <div class="navbar">
    <div class="container">
      <span class="brand">{{ profile!.name }}</span>
    </div>
  </div>

  <main class="container">
    <h1>Agenda tu cita</h1>
    <p>{{ profile!.name }}</p>

    <div v-if="loadingBootstrap" class="state-container">
      <p>Cargando…</p>
    </div>

    <template v-else>
      <button v-if="step !== 'categoria' && step !== 'pago' && step !== 'success'" class="btn btn-back" type="button" @click="volver">
        ← Atrás
      </button>

      <div v-if="step === 'categoria'" class="card">
        <div class="step-label">Paso 1 · Categoría</div>
        <div v-if="!categorias.length" class="state-container">
          <p>Este negocio todavía no tiene categorías de servicio configuradas.</p>
        </div>
        <div v-else class="option-list">
          <button
            v-for="c in categorias"
            :key="c.id"
            class="option-btn"
            :class="{ selected: categoriaId === c.id }"
            type="button"
            @click="seleccionarCategoria(c.id)"
          >
            {{ c.nombre }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 'profesional'" class="card">
        <div class="step-label">Paso 2 · Profesional</div>
        <div v-if="!profesionalesFiltrados.length" class="state-container">
          <p>No hay profesionales disponibles para esta categoría por ahora.</p>
        </div>
        <div v-else class="option-list">
          <button
            v-for="p in profesionalesFiltrados"
            :key="p.id"
            class="option-btn"
            :class="{ selected: profesionalId === p.id }"
            type="button"
            :disabled="loadingProfesionalDetail"
            @click="seleccionarProfesional(p.id)"
          >
            {{ p.nombre }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 'servicio'" class="card">
        <div class="step-label">Paso 3 · Servicio</div>
        <div v-if="loadingProfesionalDetail" class="state-container"><p>Cargando…</p></div>
        <div v-else-if="!serviciosOptions.length" class="state-container">
          <p>{{ profesionalSeleccionado?.nombre }} no tiene servicios disponibles en esta categoría.</p>
        </div>
        <div v-else class="option-list">
          <button
            v-for="s in serviciosOptions"
            :key="s.id"
            class="option-btn"
            :class="{ selected: servicioId === s.id }"
            type="button"
            @click="seleccionarServicio(s.id)"
          >
            {{ s.name }}
            <span class="sub">
              ${{ s.sale_price.toFixed(2) }}<template v-if="s.duracion_minutos"> · {{ s.duracion_minutos }} min</template>
            </span>
          </button>
        </div>
      </div>

      <div v-else-if="step === 'establecimiento'" class="card">
        <div class="step-label">Paso 4 · Establecimiento</div>
        <div v-if="!establecimientosOptions.length" class="state-container">
          <p>No hay establecimientos disponibles para este profesional.</p>
        </div>
        <div v-else class="option-list">
          <button
            v-for="w in establecimientosOptions"
            :key="w.id"
            class="option-btn"
            :class="{ selected: establecimientoId === w.id }"
            type="button"
            @click="seleccionarEstablecimiento(w.id)"
          >
            {{ w.name }}
            <span v-if="w.address" class="sub">{{ w.address }}</span>
          </button>
        </div>
      </div>

      <div v-else-if="step === 'fecha'" class="card">
        <div class="step-label">Paso 5 · Fecha</div>
        <div class="field">
          <label for="fecha">¿Qué día te queda bien?</label>
          <input id="fecha" v-model="fecha" type="date" :min="hoy">
        </div>
        <button class="btn btn-primary" type="button" :disabled="!fecha" @click="irAHorarios">
          Ver horarios disponibles
        </button>
      </div>

      <div v-else-if="step === 'hora'" class="card">
        <div class="step-label">Paso 6 · Horario</div>
        <div v-if="loadingSlots" class="state-container"><p>Buscando horarios…</p></div>
        <div v-else-if="slotsError" class="alert-error">{{ slotsError }}</div>
        <div v-else-if="!slots.length" class="state-container">
          <p>No hay horarios disponibles ese día. Prueba con otra fecha.</p>
          <button class="btn btn-outline" style="margin-top:12px;" type="button" @click="step = 'fecha'">Elegir otra fecha</button>
        </div>
        <div v-else class="slot-grid">
          <button
            v-for="s in slots"
            :key="s.hora_inicio"
            class="slot-btn"
            :class="{ selected: horaInicio === s.hora_inicio }"
            type="button"
            @click="seleccionarSlot(s)"
          >
            {{ s.hora_inicio }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 'contacto'" class="card">
        <div class="step-label">Paso 7 · Tus datos</div>
        <div v-if="submitError" class="alert-error">{{ submitError }}</div>
        <div class="field">
          <label for="nombre">Nombre completo</label>
          <input id="nombre" v-model="nombreContacto" type="text">
        </div>
        <div class="field">
          <label for="telefono">Teléfono</label>
          <input id="telefono" v-model="telefonoContacto" type="tel">
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" required>
        </div>
        <div class="field">
          <label for="tipo-identificacion">Tipo de identificación</label>
          <select id="tipo-identificacion" v-model="tipoIdentificacion">
            <option v-for="t in TIPOS_IDENTIFICACION" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </div>
        <div class="field">
          <label for="identificacion">Número de {{ TIPOS_IDENTIFICACION.find(t => t.value === tipoIdentificacion)?.label.toLowerCase() }}</label>
          <input id="identificacion" v-model="identificacion" type="text">
        </div>
        <div class="field">
          <label for="notas">Notas (opcional)</label>
          <textarea id="notas" v-model="notas" rows="2" />
        </div>

        <div v-if="identidadVerificacion?.requerida" class="card" style="background: var(--gray-50); margin-top: 0;">
          <p>
            <strong>Esta identificación ya está registrada.</strong>
            Verifica tu email para continuar<template v-if="identidadVerificacion.emailHint"> ({{ identidadVerificacion.emailHint }})</template>.
          </p>
          <div v-if="otpError" class="alert-error">{{ otpError }}</div>

          <template v-if="!otpEnviado">
            <div class="field">
              <label for="otp-email">Tu email registrado</label>
              <input id="otp-email" v-model="otpEmail" type="email">
            </div>
            <button class="btn btn-primary" type="button" :disabled="otpEnviando" @click="solicitarCodigoOtp">
              {{ otpEnviando ? 'Enviando…' : 'Enviar código' }}
            </button>
          </template>
          <template v-else>
            <div class="field">
              <label for="otp-code">Código de verificación</label>
              <input id="otp-code" v-model="otpCode" type="text" inputmode="numeric" maxlength="6">
            </div>
            <button class="btn btn-primary" type="button" :disabled="otpVerificando" @click="verificarCodigoOtp">
              {{ otpVerificando ? 'Verificando…' : 'Verificar' }}
            </button>
            <button class="btn btn-outline" style="margin-top:8px;" type="button" @click="otpEnviado = false">Reenviar código</button>
          </template>
          <button class="btn btn-outline" style="margin-top:8px;" type="button" @click="cancelarVerificacionIdentidad">Cancelar</button>
        </div>

        <template v-else>
          <div class="card" style="background: var(--gray-50); margin-top: 0;">
            <div class="summary-row"><span class="label">Profesional</span><span class="value">{{ profesionalSeleccionado?.nombre }}</span></div>
            <div v-if="servicioSeleccionado" class="summary-row"><span class="label">Servicio</span><span class="value">{{ servicioSeleccionado.name }}</span></div>
            <div class="summary-row"><span class="label">Fecha</span><span class="value">{{ fecha }}</span></div>
            <div class="summary-row"><span class="label">Hora</span><span class="value">{{ horaInicio }} - {{ horaFin }}</span></div>
          </div>

          <button class="btn btn-primary" style="margin-top:14px;" type="button" :disabled="submitting || verificandoIdentidad" @click="confirmar">
            {{ verificandoIdentidad ? 'Verificando…' : submitting ? 'Guardando…' : 'Continuar' }}
          </button>
        </template>
      </div>

      <div v-else-if="step === 'pago'" class="card">
        <div class="step-label">Paso 8 · Método de pago</div>
        <p style="margin-bottom: 14px;">Tu cita quedó registrada. Elige cómo quieres pagar.</p>
        <div v-if="pagoError" class="alert-error">{{ pagoError }}</div>

        <div v-if="loadingPaymentMethods" class="state-container"><p>Cargando…</p></div>

        <div v-else-if="!paymentMethods.length" class="state-container">
          <p>Este negocio todavía no tiene métodos de pago en línea configurados.</p>
          <button class="btn btn-primary" style="margin-top:12px;" type="button" @click="terminarSinPago('Tu cita quedó registrada. El negocio se pondrá en contacto para coordinar el pago.')">
            Continuar
          </button>
        </div>

        <template v-else>
          <div v-if="!metodoSeleccionado" class="option-list">
            <button
              v-for="pm in paymentMethods"
              :key="pm.id"
              class="option-btn"
              type="button"
              :disabled="pagoLoading"
              @click="elegirMetodo(pm)"
            >
              {{ gatewayLabels[pm.gateway_type] ?? pm.gateway_type }}
            </button>
          </div>

          <div v-else-if="metodoSeleccionado.gateway_type === 'payphone'" class="state-container">
            <p>{{ pagoLoading ? 'Redirigiendo a Payphone…' : 'Preparando el pago…' }}</p>
          </div>

          <div v-else-if="metodoSeleccionado.gateway_type === 'bank'">
            <div v-if="pagoLoading && !bankTransaction" class="state-container"><p>Generando datos de pago…</p></div>
            <div v-else-if="bankTransaction" class="card" style="background: var(--gray-50); margin-top: 0;">
              <div class="summary-row"><span class="label">Banco</span><span class="value">{{ bankTransaction.configuration_data?.banco }}</span></div>
              <div class="summary-row"><span class="label">Tipo de cuenta</span><span class="value">{{ bankTransaction.configuration_data?.tipo_cuenta }}</span></div>
              <div class="summary-row"><span class="label">Número de cuenta</span><span class="value">{{ bankTransaction.configuration_data?.numero_cuenta }}</span></div>
              <div class="summary-row"><span class="label">Titular</span><span class="value">{{ bankTransaction.configuration_data?.titular }}</span></div>
              <div class="summary-row"><span class="label">Identificación</span><span class="value">{{ bankTransaction.configuration_data?.identificacion }}</span></div>
              <div v-if="servicioSeleccionado" class="summary-row"><span class="label">Monto a transferir</span><span class="value">${{ servicioSeleccionado.sale_price.toFixed(2) }}</span></div>

              <div class="field" style="margin-top: 14px;">
                <label for="comprobante">Sube tu comprobante de transferencia</label>
                <input id="comprobante" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" @change="onComprobanteChange">
              </div>
              <button
                class="btn btn-primary"
                type="button"
                :disabled="pagoLoading || !comprobanteBase64"
                @click="handleSubirComprobante"
              >
                {{ pagoLoading ? 'Subiendo…' : 'Ya transferí, subir comprobante' }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <div v-else-if="step === 'success'" class="card confirmation">
        <div class="icon">✅</div>
        <h2>¡Listo!</h2>
        <p v-if="successMensaje">{{ successMensaje }}</p>
        <p v-else-if="volviendoDePayphone">Tu pago fue procesado. {{ profile!.name }} confirmará tu cita en breve.</p>
        <p v-else-if="resultado">
          {{ resultado.fecha }} de {{ resultado.hora_inicio }} a {{ resultado.hora_fin }}.
          {{ profile!.name }} se pondrá en contacto para confirmar.
        </p>
      </div>
    </template>
  </main>
</template>
