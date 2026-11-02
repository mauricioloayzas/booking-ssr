export interface ApiResponse<T> {
  data: T
}

export interface PublicProfile {
  id: string
  name: string
  url_name: string
  type: string
  descripcion?: string | null
  direccion?: string | null
  logo_url?: string | null
  banner_url?: string | null
  telefono_contacto?: string | null
}

export interface PublicCategoriaServicio {
  id: string
  nombre: string
}

export interface PublicProfesional {
  id: string
  nombre: string
  categoria_ids: string[]
  foto_url?: string | null
  bio?: string | null
}

export interface PublicServicio {
  id: string
  name: string
  description?: string | null
  sale_price: number
  duracion_minutos: number | null
  categoria_servicio_id: string | null
}

export interface PublicHorario {
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  hora_inicio_break: string | null
  hora_fin_break: string | null
}

export interface PublicEstablecimiento {
  id: string
  name: string
  address: string | null
}

export interface DisponibilidadSlot {
  hora_inicio: string
  hora_fin: string
}

export interface CrearCitaPublicaPayload {
  profesional_id: string
  establecimiento_id: string
  servicio_id?: string
  nombre_contacto: string
  telefono_contacto: string
  email: string
  tipo_identificacion: string
  identificacion: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  notas?: string
  verification_id?: string
}

export const TIPOS_IDENTIFICACION = [
  { value: '05', label: 'Cédula' },
  { value: '04', label: 'RUC' },
  { value: '06', label: 'Pasaporte' },
] as const

export interface CitaPublicaCreada {
  id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: string
}

export type GatewayType = 'payphone' | 'payphone_split' | 'bank' | 'effective'

export interface BankConfigurationData {
  banco: string
  tipo_cuenta: string
  numero_cuenta: string
  titular: string
  identificacion: string
  email_notificacion?: string | null
}

export interface PublicPaymentMethod {
  id: string
  gateway_type: GatewayType
  configuration_data: BankConfigurationData | null
  /** Solo en payphone_split: si el negocio activó que el cliente pague la comisión de Payphone. */
  recargo_habilitado?: boolean
  /** Porcentaje del recargo cuando recargo_habilitado es true (ej. 5.75) — null si está apagado. */
  recargo_porcentaje?: number | null
}

export interface PreparePaymentPublicPayload {
  amount: number
  reference_id: string
  url_return_reference?: string
  recaptchaToken?: string
}

export interface PreparePaymentPublicResponse {
  transaction_id: string
  status?: string
  configuration_data?: BankConfigurationData
  pay_with_card?: string | null
  pay_with_payphone?: string | null
}

export interface TransactionPublic {
  id: string
  status: string
}

export interface ClienteCheckResponse {
  exists: boolean
  requiere_verificacion: boolean
  email_hint?: string | null
}

export interface ClienteAuthVerifyResponse {
  verification_id: string
  cliente_auth_id: string
  email: string
  expires_at: string
}

export interface ClienteResolveResponse {
  exists: boolean
  razon_social?: string
  telefono?: string | null
  email?: string | null
}
