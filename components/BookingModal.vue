<script setup lang="ts">
import { TIPOS_IDENTIFICACION } from '~/types'
import type { PreparePaymentPublicResponse, PublicEstablecimiento, PublicPaymentMethod, PublicProfesional, PublicProfile, PublicServicio } from '~/types'

const props = defineProps<{
  profile: PublicProfile
  servicio: PublicServicio
  profesionalIdInicial?: string
}>()
const emit = defineEmits<{ close: [] }>()

const booking = usePublicBooking()
const { getToken } = useRecaptcha()

type Step = 'calendario' | 'contacto' | 'pago' | 'success'
const step = ref<Step>('calendario')

// --- Paso 1: profesional, establecimiento, calendario y horarios ---

const loadingInicial = ref(true)
const profesionalesDelServicioIds = ref<string[]>([])
const profesionalesCompletos = ref<PublicProfesional[]>([])
const establecimientosCompletos = ref<PublicEstablecimiento[]>([])

const profesionalId = ref('')
const establecimientoId = ref('')
const establecimientosDelProfesionalIds = ref<string[]>([])
const loadingProfesionalDetail = ref(false)

const profesionalesDisponibles = computed(() =>
  profesionalesCompletos.value.filter(p => profesionalesDelServicioIds.value.includes(p.id))
)
const profesionalElegido = computed(() => profesionalesCompletos.value.find(p => p.id === profesionalId.value) ?? null)
const establecimientosOptions = computed(() =>
  establecimientosCompletos.value.filter(w => establecimientosDelProfesionalIds.value.includes(w.id))
)

async function elegirProfesional(id: string) {
  profesionalId.value = id
  establecimientoId.value = ''
  fecha.value = ''
  horaInicio.value = ''
  horaFin.value = ''
  loadingProfesionalDetail.value = true
  try {
    const estabs = await booking.getEstablecimientosDelProfesional(props.profile.id, id)
    establecimientosDelProfesionalIds.value = (estabs.data ?? []).map(e => e.warehouse_id)
    if (establecimientosDelProfesionalIds.value.length === 1) {
      establecimientoId.value = establecimientosDelProfesionalIds.value[0]!
    }
  } catch {
    establecimientosDelProfesionalIds.value = []
  } finally {
    loadingProfesionalDetail.value = false
  }
}

onMounted(async () => {
  try {
    const [porServicio, profs, estabs] = await Promise.all([
      booking.getProfesionalesDelServicio(props.profile.id, props.servicio.id),
      booking.getProfesionales(props.profile.id),
      booking.getEstablecimientos(props.profile.id),
    ])
    profesionalesDelServicioIds.value = (porServicio.data ?? []).map(p => p.profesional_id)
    profesionalesCompletos.value = profs.data ?? []
    establecimientosCompletos.value = estabs.data ?? []

    if (props.profesionalIdInicial && profesionalesDelServicioIds.value.includes(props.profesionalIdInicial)) {
      await elegirProfesional(props.profesionalIdInicial)
    } else if (profesionalesDelServicioIds.value.length === 1) {
      await elegirProfesional(profesionalesDelServicioIds.value[0]!)
    }
  } finally {
    loadingInicial.value = false
  }
})

const fecha = ref('')
const horaInicio = ref('')
const horaFin = ref('')
const slots = ref<{ hora_inicio: string; hora_fin: string }[]>([])
const loadingSlots = ref(false)
const slotsError = ref('')

const hoyDate = new Date()
const mesMostrado = ref(new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 1))

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const nombreMes = computed(() => `${MESES[mesMostrado.value.getMonth()]} ${mesMostrado.value.getFullYear()}`)

const puedeRetroceder = computed(() =>
  mesMostrado.value.getFullYear() > hoyDate.getFullYear()
  || (mesMostrado.value.getFullYear() === hoyDate.getFullYear() && mesMostrado.value.getMonth() > hoyDate.getMonth())
)

function mesAnterior() {
  if (!puedeRetroceder.value) return
  mesMostrado.value = new Date(mesMostrado.value.getFullYear(), mesMostrado.value.getMonth() - 1, 1)
}
function mesSiguiente() {
  mesMostrado.value = new Date(mesMostrado.value.getFullYear(), mesMostrado.value.getMonth() + 1, 1)
}

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
const hoyIso = isoDate(hoyDate.getFullYear(), hoyDate.getMonth(), hoyDate.getDate())

const celdas = computed(() => {
  const y = mesMostrado.value.getFullYear()
  const m = mesMostrado.value.getMonth()
  const totalDias = new Date(y, m + 1, 0).getDate()
  const primerDia = new Date(y, m, 1).getDay() // 0=domingo
  const offset = (primerDia + 6) % 7 // recorrido semana L..D -> 0=lunes

  const out: { day: number | null; iso: string | null; disabled: boolean }[] = []
  for (let i = 0; i < offset; i++) out.push({ day: null, iso: null, disabled: true })
  for (let d = 1; d <= totalDias; d++) {
    const iso = isoDate(y, m, d)
    out.push({ day: d, iso, disabled: iso < hoyIso })
  }
  return out
})

async function elegirFecha(iso: string) {
  fecha.value = iso
  horaInicio.value = ''
  horaFin.value = ''
  loadingSlots.value = true
  slotsError.value = ''
  slots.value = []
  try {
    const duracion = props.servicio.duracion_minutos ?? 30
    const res = await booking.getDisponibilidad(props.profile.id, profesionalId.value, establecimientoId.value, iso, duracion)
    slots.value = res.data ?? []
  } catch {
    slotsError.value = 'No pudimos cargar los horarios disponibles. Intenta de nuevo.'
  } finally {
    loadingSlots.value = false
  }
}

function elegirSlot(s: { hora_inicio: string; hora_fin: string }) {
  horaInicio.value = s.hora_inicio
  horaFin.value = s.hora_fin
}

function fechaLegible(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })
}

// --- Paso 2: datos de contacto (idéntico al wizard de /agendar) ---

const submitError = ref('')
const submitting = ref(false)
const nombreContacto = ref('')
const telefonoContacto = ref('')
const email = ref('')
const tipoIdentificacion = ref('05')
const identificacion = ref('')
const notas = ref('')
const aceptaTerminos = ref(false)
const citaId = ref('')

const identidadResuelta = ref(false)
const identidadVerificacion = ref<{ requerida: boolean; emailHint: string | null } | null>(null)
const verificandoIdentidad = ref(false)
const verificationId = ref('')
const otpEmail = ref('')
const otpEnviado = ref(false)
const otpEnviando = ref(false)
const otpCode = ref('')
const otpVerificando = ref(false)
const otpError = ref('')

async function verificarIdentificacion() {
  if (verificandoIdentidad.value) return
  submitError.value = ''
  if (!identificacion.value) {
    submitError.value = 'Completa tu número de identificación.'
    return
  }
  verificandoIdentidad.value = true
  try {
    const check = await booking.checkCliente(props.profile.id, identificacion.value)
    if (check.data?.requiere_verificacion) {
      identidadVerificacion.value = { requerida: true, emailHint: check.data.email_hint ?? null }
    } else {
      identidadResuelta.value = true
    }
  } catch {
    identidadResuelta.value = true
  } finally {
    verificandoIdentidad.value = false
  }
}

async function solicitarCodigoOtp() {
  if (otpEnviando.value) return
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
  if (otpVerificando.value) return
  otpError.value = ''
  if (!otpCode.value) {
    otpError.value = 'Ingresa el código que te enviamos.'
    return
  }
  otpVerificando.value = true
  try {
    const res = await booking.verificarCodigoCliente(otpEmail.value, otpCode.value)
    verificationId.value = res.data.verification_id
    try {
      const resolved = await booking.resolverCliente(props.profile.id, identificacion.value, verificationId.value)
      if (resolved.data?.exists) {
        nombreContacto.value = resolved.data.razon_social ?? nombreContacto.value
        telefonoContacto.value = resolved.data.telefono ?? telefonoContacto.value
        email.value = resolved.data.email ?? email.value
      }
    } catch {
      // Best-effort: si falla el autocompletado, igual puede llenar el resto a mano.
    }
    otpEnviado.value = false
    otpCode.value = ''
    identidadVerificacion.value = null
    identidadResuelta.value = true
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

async function confirmar() {
  submitError.value = ''
  if (!nombreContacto.value || !telefonoContacto.value || !email.value) {
    submitError.value = 'Completa tu nombre, teléfono y email.'
    return
  }
  if (!aceptaTerminos.value) {
    submitError.value = 'Debes aceptar los Términos y la Política de Privacidad para continuar.'
    return
  }
  if (submitting.value) return
  submitting.value = true
  try {
    const res = await booking.crearCita(props.profile.id, {
      profesional_id: profesionalId.value,
      establecimiento_id: establecimientoId.value,
      servicio_id: props.servicio.id,
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
    citaId.value = res.data.id
    step.value = 'pago'
    await cargarMetodosPago()
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number }; statusCode?: number })?.response?.status
      ?? (e as { statusCode?: number })?.statusCode
    if (status === 403) {
      identidadResuelta.value = false
      identidadVerificacion.value = { requerida: true, emailHint: null }
      otpEmail.value = email.value
      verificationId.value = ''
    }
    submitError.value = (e as { data?: { error?: string } })?.data?.error || 'No pudimos registrar tu cita. Intenta de nuevo.'
  } finally {
    submitting.value = false
  }
}

// --- Paso 3: pago (idéntico al wizard de /agendar) ---

const paymentMethods = ref<PublicPaymentMethod[]>([])
const loadingPaymentMethods = ref(false)
const metodoSeleccionado = ref<PublicPaymentMethod | null>(null)
const pagoError = ref('')
const pagoLoading = ref(false)
const bankTransaction = ref<PreparePaymentPublicResponse | null>(null)
const comprobanteBase64 = ref('')
const comprobanteMimeType = ref('')
const successMensaje = ref('')

async function cargarMetodosPago() {
  loadingPaymentMethods.value = true
  try {
    const res = await booking.getPaymentMethods(props.profile.id)
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
  payphone_split: 'Tarjeta (Payphone)',
  effective: 'Efectivo en el local',
}
const TIPO_CUENTA_LABELS: Record<string, string> = { ahorros: 'Ahorros', corriente: 'Corriente' }

function paymentOptionSub(pm: PublicPaymentMethod): string | null {
  if (pm.gateway_type !== 'bank' || !pm.configuration_data) return null
  const { tipo_cuenta, numero_cuenta } = pm.configuration_data
  const tipoLabel = tipo_cuenta ? (TIPO_CUENTA_LABELS[tipo_cuenta] ?? tipo_cuenta) : ''
  return [tipoLabel, numero_cuenta].filter(Boolean).join(' · ') || null
}

function montoConRecargo(pm: PublicPaymentMethod): number {
  const base = props.servicio.sale_price
  if (!pm.recargo_habilitado || !pm.recargo_porcentaje) return base
  return base / (1 - pm.recargo_porcentaje / 100)
}

function paymentOptionLabel(pm: PublicPaymentMethod): string {
  if (pm.gateway_type === 'bank' && pm.configuration_data) {
    return pm.configuration_data.banco ? `Transferencia — ${pm.configuration_data.banco}` : gatewayLabels.bank!
  }
  const label = gatewayLabels[pm.gateway_type] ?? pm.gateway_type
  if ((pm.gateway_type === 'payphone' || pm.gateway_type === 'payphone_split') && pm.recargo_habilitado) {
    return `${label} (+${pm.recargo_porcentaje}% recargo) — $${montoConRecargo(pm).toFixed(2)}`
  }
  return label
}

function hayRecargoPayphone(): boolean {
  return paymentMethods.value.some(pm => (pm.gateway_type === 'payphone' || pm.gateway_type === 'payphone_split') && pm.recargo_habilitado)
}

function terminarSinPago(mensaje: string) {
  successMensaje.value = mensaje
  step.value = 'success'
}

async function elegirMetodo(pm: PublicPaymentMethod) {
  pagoError.value = ''
  metodoSeleccionado.value = pm
  if (pm.gateway_type === 'effective') {
    await booking.marcarRequiereConfirmacion(props.profile.id, citaId.value, 'efectivo').catch(() => {})
    terminarSinPago('Pagarás directamente en el local. Te esperamos.')
    return
  }
  if (pm.gateway_type === 'payphone' || pm.gateway_type === 'payphone_split') {
    await pagarConPayphone(pm)
  } else if (pm.gateway_type === 'bank') {
    await generarDatosBancarios()
  }
}

async function pagarConPayphone(_pm: PublicPaymentMethod) {
  pagoLoading.value = true
  pagoError.value = ''
  try {
    const recaptchaToken = await getToken('preparar_pago_publico')
    const returnUrl = `${window.location.origin}${window.location.pathname}?pago=ok`
    const res = await booking.prepararPago(props.profile.id, metodoSeleccionado.value!.id, {
      amount: props.servicio.sale_price,
      reference_id: citaId.value,
      url_return_reference: returnUrl,
      recaptchaToken,
    })
    await booking.vincularTransaccion(props.profile.id, citaId.value, res.data.transaction_id).catch(() => {})
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
  if (!metodoSeleccionado.value) return
  pagoLoading.value = true
  pagoError.value = ''
  try {
    const recaptchaToken = await getToken('preparar_pago_publico')
    const res = await booking.prepararPago(props.profile.id, metodoSeleccionado.value.id, {
      amount: props.servicio.sale_price,
      reference_id: citaId.value,
      recaptchaToken,
    })
    bankTransaction.value = res.data
    await booking.vincularTransaccion(props.profile.id, citaId.value, res.data.transaction_id).catch(() => {})
  } catch (e: unknown) {
    pagoError.value = (e as { data?: { error?: string } })?.data?.error || 'No pudimos generar los datos de pago. Intenta de nuevo.'
  } finally {
    pagoLoading.value = false
  }
}

function onComprobanteChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  comprobanteMimeType.value = file.type
  const reader = new FileReader()
  reader.onload = () => {
    comprobanteBase64.value = (reader.result as string).split(',')[1] ?? ''
  }
  reader.readAsDataURL(file)
}

async function handleSubirComprobante() {
  if (!bankTransaction.value || !comprobanteBase64.value) return
  pagoLoading.value = true
  pagoError.value = ''
  try {
    await booking.subirComprobante(bankTransaction.value.transaction_id, comprobanteBase64.value, comprobanteMimeType.value)
    await booking.marcarRequiereConfirmacion(props.profile.id, citaId.value, 'comprobante').catch(() => {})
    terminarSinPago('Recibimos tu comprobante. El negocio lo revisará y confirmará tu cita.')
  } catch (e: unknown) {
    pagoError.value = (e as { data?: { error?: string } })?.data?.error || 'No pudimos subir el comprobante. Intenta de nuevo.'
  } finally {
    pagoLoading.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-box">
      <button class="modal-close" type="button" @click="emit('close')">✕</button>

      <template v-if="step === 'calendario'">
        <h2 class="modal-title">{{ servicio.name }}</h2>
        <p class="modal-sub">
          ${{ servicio.sale_price.toFixed(2) }}<template v-if="servicio.duracion_minutos"> · {{ servicio.duracion_minutos }} min</template>
        </p>

        <div v-if="loadingInicial" class="state-container"><p>Cargando…</p></div>

        <template v-else>
          <div v-if="!profesionalesDisponibles.length" class="state-container">
            <p>Este servicio no tiene profesionales disponibles por ahora.</p>
          </div>

          <template v-else-if="!profesionalId">
            <p class="field-label">¿Con quién?</p>
            <div class="option-list">
              <button v-for="p in profesionalesDisponibles" :key="p.id" class="option-btn" type="button" @click="elegirProfesional(p.id)">
                {{ p.nombre }}
              </button>
            </div>
          </template>

          <template v-else>
            <div class="staff-chip">
              <img v-if="profesionalElegido?.foto_url" :src="profesionalElegido.foto_url" :alt="profesionalElegido.nombre" class="staff-chip-photo">
              <span>{{ profesionalElegido?.nombre }}</span>
              <button v-if="profesionalesDisponibles.length > 1" type="button" class="link-btn" @click="profesionalId = ''">Cambiar</button>
            </div>

            <div v-if="loadingProfesionalDetail" class="state-container"><p>Cargando…</p></div>
            <div v-else-if="!establecimientosOptions.length" class="state-container">
              <p>Este profesional no tiene establecimientos configurados.</p>
            </div>
            <template v-else-if="establecimientosOptions.length > 1 && !establecimientoId">
              <p class="field-label">¿En qué sucursal?</p>
              <div class="option-list">
                <button v-for="w in establecimientosOptions" :key="w.id" class="option-btn" type="button" @click="establecimientoId = w.id">
                  {{ w.name }}
                  <span v-if="w.address" class="sub">{{ w.address }}</span>
                </button>
              </div>
            </template>

            <template v-else>
              <div class="calendar-layout">
                <div class="calendar">
                  <div class="calendar-header">
                    <button type="button" class="cal-nav" :disabled="!puedeRetroceder" @click="mesAnterior">‹</button>
                    <span>{{ nombreMes }}</span>
                    <button type="button" class="cal-nav" @click="mesSiguiente">›</button>
                  </div>
                  <div class="calendar-grid">
                    <span v-for="d in ['L', 'M', 'M', 'J', 'V', 'S', 'D']" :key="d" class="calendar-dow">{{ d }}</span>
                    <button
                      v-for="(c, i) in celdas"
                      :key="i"
                      type="button"
                      class="calendar-day"
                      :class="{ empty: !c.iso, selected: c.iso === fecha, disabled: c.disabled }"
                      :disabled="!c.iso || c.disabled"
                      @click="c.iso && elegirFecha(c.iso)"
                    >{{ c.day }}</button>
                  </div>
                </div>
                <div class="slots-panel">
                  <p v-if="!fecha" class="hint">Elige un día en el calendario</p>
                  <p v-else-if="loadingSlots" class="hint">Buscando horarios…</p>
                  <p v-else-if="slotsError" class="alert-error">{{ slotsError }}</p>
                  <p v-else-if="!slots.length" class="hint">No hay horarios disponibles ese día.</p>
                  <div v-else class="slot-grid">
                    <button
                      v-for="s in slots" :key="s.hora_inicio" class="slot-btn"
                      :class="{ selected: horaInicio === s.hora_inicio }" type="button" @click="elegirSlot(s)"
                    >{{ s.hora_inicio }}</button>
                  </div>
                </div>
              </div>

              <button class="btn btn-primary" style="margin-top:14px;" type="button" :disabled="!horaInicio" @click="step = 'contacto'">
                Continuar
              </button>
            </template>
          </template>
        </template>
      </template>

      <template v-else-if="step === 'contacto'">
        <button class="btn btn-back" type="button" @click="step = 'calendario'">← Atrás</button>
        <div v-if="submitError" class="alert-error">{{ submitError }}</div>

        <div class="contacto-layout">
          <div class="summary-col card">
            <div class="summary-row"><span class="label">Servicio</span><span class="value">{{ servicio.name }}</span></div>
            <div v-if="servicio.duracion_minutos" class="summary-row"><span class="label">Duración</span><span class="value">{{ servicio.duracion_minutos }} min</span></div>
            <div class="summary-row"><span class="label">Precio</span><span class="value">${{ servicio.sale_price.toFixed(2) }}</span></div>
            <div class="summary-row"><span class="label">Con</span><span class="value">{{ profesionalElegido?.nombre }}</span></div>
            <div class="summary-row"><span class="label">Día</span><span class="value">{{ fechaLegible(fecha) }}</span></div>
            <div class="summary-row"><span class="label">Hora</span><span class="value">{{ horaInicio }} - {{ horaFin }}</span></div>
          </div>

          <div class="form-col">
            <template v-if="!identidadResuelta && !identidadVerificacion?.requerida">
              <div class="field">
                <label for="modal-tipo-identificacion">Tipo de identificación</label>
                <select id="modal-tipo-identificacion" v-model="tipoIdentificacion">
                  <option v-for="t in TIPOS_IDENTIFICACION" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
              </div>
              <div class="field">
                <label for="modal-identificacion">Número de {{ TIPOS_IDENTIFICACION.find(t => t.value === tipoIdentificacion)?.label.toLowerCase() }}</label>
                <input id="modal-identificacion" v-model="identificacion" type="text">
              </div>
              <button class="btn btn-primary" type="button" :disabled="verificandoIdentidad" @click="verificarIdentificacion">
                {{ verificandoIdentidad ? 'Comprobando…' : 'Continuar' }}
              </button>
            </template>

            <div v-else-if="identidadVerificacion?.requerida" class="card" style="background: var(--gray-50); margin-top: 0;">
              <p>
                <strong>Esta identificación ya está registrada.</strong>
                Verifica tu email para continuar<template v-if="identidadVerificacion.emailHint"> ({{ identidadVerificacion.emailHint }})</template>.
              </p>
              <div v-if="otpError" class="alert-error">{{ otpError }}</div>

              <template v-if="!otpEnviado">
                <div class="field">
                  <label for="modal-otp-email">Tu email registrado</label>
                  <input id="modal-otp-email" v-model="otpEmail" type="email">
                </div>
                <button class="btn btn-primary" type="button" :disabled="otpEnviando" @click="solicitarCodigoOtp">
                  {{ otpEnviando ? 'Enviando…' : 'Enviar código' }}
                </button>
              </template>
              <template v-else>
                <div class="field">
                  <label for="modal-otp-code">Código de verificación</label>
                  <input id="modal-otp-code" v-model="otpCode" type="text" inputmode="numeric" maxlength="6">
                </div>
                <button class="btn btn-primary" type="button" :disabled="otpVerificando" @click="verificarCodigoOtp">
                  {{ otpVerificando ? 'Verificando…' : 'Verificar' }}
                </button>
                <button class="btn btn-outline" style="margin-top:8px;" type="button" @click="otpEnviado = false">Reenviar código</button>
              </template>
              <button class="btn btn-outline" style="margin-top:8px;" type="button" @click="cancelarVerificacionIdentidad">Cancelar</button>
            </div>

            <template v-else>
              <div class="field">
                <label for="modal-nombre">Nombre completo</label>
                <input id="modal-nombre" v-model="nombreContacto" type="text">
              </div>
              <div class="field">
                <label for="modal-telefono">Teléfono</label>
                <input id="modal-telefono" v-model="telefonoContacto" type="tel">
              </div>
              <div class="field">
                <label for="modal-email">Email</label>
                <input id="modal-email" v-model="email" type="email" required>
              </div>
              <div class="field">
                <label for="modal-notas">Notas (opcional)</label>
                <textarea id="modal-notas" v-model="notas" rows="2" />
              </div>

              <div class="consent-check">
                <input id="modal-acepta-terminos" v-model="aceptaTerminos" type="checkbox">
                <label for="modal-acepta-terminos">
                  Acepto los <a href="https://www.mauloasan.com/terms" target="_blank" rel="noopener">Términos y Condiciones</a>
                  y la <a href="https://www.mauloasan.com/privacy" target="_blank" rel="noopener">Política de Privacidad</a>.
                </label>
              </div>

              <button class="btn btn-primary" type="button" :disabled="submitting" @click="confirmar">
                {{ submitting ? 'Agendando…' : 'Agendar' }}
              </button>
            </template>
          </div>
        </div>
      </template>

      <template v-else-if="step === 'pago'">
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
              v-for="pm in paymentMethods" :key="pm.id" class="option-btn" type="button" :disabled="pagoLoading"
              @click="elegirMetodo(pm)"
            >
              {{ paymentOptionLabel(pm) }}
              <span v-if="paymentOptionSub(pm)" class="sub">{{ paymentOptionSub(pm) }}</span>
            </button>
            <p v-if="hayRecargoPayphone()" class="payment-note">
              * Este negocio aplica un recargo al pagar con Payphone para cubrir la comisión de la pasarela.
            </p>
          </div>

          <div v-else-if="metodoSeleccionado.gateway_type === 'payphone' || metodoSeleccionado.gateway_type === 'payphone_split'" class="state-container">
            <p>{{ pagoLoading ? 'Redirigiendo a Payphone…' : 'Preparando el pago…' }}</p>
          </div>

          <div v-else-if="metodoSeleccionado.gateway_type === 'bank'">
            <div v-if="pagoLoading && !bankTransaction" class="state-container"><p>Generando datos de pago…</p></div>
            <div v-else-if="bankTransaction" class="card" style="background: var(--gray-50); margin-top: 0;">
              <div class="summary-row"><span class="label">Banco</span><span class="value">{{ bankTransaction.configuration_data?.banco }}</span></div>
              <div class="summary-row"><span class="label">Tipo de cuenta</span><span class="value">{{ bankTransaction.configuration_data?.tipo_cuenta }}</span></div>
              <div class="summary-row"><span class="label">Número de cuenta</span><span class="value">{{ bankTransaction.configuration_data?.numero_cuenta }}</span></div>
              <div class="summary-row"><span class="label">Titular</span><span class="value">{{ bankTransaction.configuration_data?.titular }}</span></div>
              <div class="summary-row"><span class="label">Monto a transferir</span><span class="value">${{ servicio.sale_price.toFixed(2) }}</span></div>

              <div class="field" style="margin-top: 14px;">
                <label for="modal-comprobante">Sube tu comprobante de transferencia</label>
                <input id="modal-comprobante" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" @change="onComprobanteChange">
              </div>
              <button class="btn btn-primary" type="button" :disabled="pagoLoading || !comprobanteBase64" @click="handleSubirComprobante">
                {{ pagoLoading ? 'Subiendo…' : 'Ya transferí, subir comprobante' }}
              </button>
            </div>
          </div>
        </template>
      </template>

      <template v-else-if="step === 'success'">
        <div class="confirmation">
          <div class="icon">✅</div>
          <h2>¡Listo!</h2>
          <p>{{ successMensaje }}</p>
          <button class="btn btn-primary" style="margin-top:16px;" type="button" @click="emit('close')">Cerrar</button>
        </div>
      </template>
    </div>
  </div>
</template>
