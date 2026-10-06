import type {
  CitaPublicaCreada,
  ClienteAuthVerifyResponse,
  ClienteCheckResponse,
  ClienteResolveResponse,
  CrearCitaPublicaPayload,
  DisponibilidadSlot,
  PreparePaymentPublicPayload,
  PreparePaymentPublicResponse,
  PublicCategoriaServicio,
  PublicEstablecimiento,
  PublicPaymentMethod,
  PublicProfesional,
  PublicProfile,
  PublicServicio,
  TransactionPublic,
} from '~/types'

export function usePublicBooking() {
  const auth = usePublicApi('auth')
  const apotheca = usePublicApi('apotheca')
  const professionalis = usePublicApi('professionalis')
  const collector = usePublicApi('collector')

  return {
    getProfile: (slug: string) =>
      auth.get<PublicProfile>(`/public/profiles/${slug}`),

    getCategorias: (profileId: string) =>
      apotheca.get<PublicCategoriaServicio[]>(`/public/profiles/${profileId}/categorias-servicio`),

    getServicios: (profileId: string) =>
      apotheca.get<PublicServicio[]>(`/public/profiles/${profileId}/servicios`),

    getEstablecimientos: (profileId: string) =>
      apotheca.get<PublicEstablecimiento[]>(`/public/profiles/${profileId}/establecimientos`),

    getProfesionales: (profileId: string) =>
      professionalis.get<PublicProfesional[]>(`/public/profiles/${profileId}/profesionales`),

    getServiciosDelProfesional: (profileId: string, profesionalId: string) =>
      professionalis.get<{ servicio_id: string }[]>(`/public/profiles/${profileId}/profesionales/${profesionalId}/servicios`),

    getEstablecimientosDelProfesional: (profileId: string, profesionalId: string) =>
      professionalis.get<{ warehouse_id: string }[]>(`/public/profiles/${profileId}/profesionales/${profesionalId}/establecimientos`),

    getDisponibilidad: (profileId: string, profesionalId: string, establecimientoId: string, fecha: string, duracionMinutos: number) =>
      professionalis.get<DisponibilidadSlot[]>(`/public/profiles/${profileId}/profesionales/${profesionalId}/disponibilidad`, {
        establecimiento_id: establecimientoId,
        fecha,
        duracion_minutos: String(duracionMinutos),
      }),

    crearCita: (profileId: string, payload: CrearCitaPublicaPayload) =>
      professionalis.post<CitaPublicaCreada>(`/public/profiles/${profileId}/citas`, payload),

    checkCliente: (profileId: string, identificacion: string) =>
      professionalis.get<ClienteCheckResponse>(`/public/profiles/${profileId}/clientes/check`, { identificacion }),

    resolverCliente: (profileId: string, identificacion: string, verificationId: string) =>
      professionalis.get<ClienteResolveResponse>(`/public/profiles/${profileId}/clientes/resolve`, { identificacion, verification_id: verificationId }),

    solicitarCodigoCliente: (email: string, recaptchaToken?: string) =>
      auth.post<{ message: string }>('/public/cliente-auth/request-code', { email, recaptchaToken }),

    verificarCodigoCliente: (email: string, code: string) =>
      auth.post<ClienteAuthVerifyResponse>('/public/cliente-auth/verify-code', { email, code }),

    vincularTransaccion: (profileId: string, citaId: string, transactionId: string) =>
      professionalis.patch<{ id: string; transaction_id: string }>(`/public/profiles/${profileId}/citas/${citaId}/transaction`, {
        transaction_id: transactionId,
      }),

    // El cliente ya hizo su parte (eligió efectivo, o subió el comprobante de una
    // transferencia) — marca la cita para que expirarPendientes.php (professionalis) nunca
    // la borre automáticamente a las 24h, solo le recuerde al negocio confirmarla. El motivo
    // solo se usa para redactar bien el correo de recordatorio al negocio.
    marcarRequiereConfirmacion: (profileId: string, citaId: string, motivo: 'efectivo' | 'comprobante') =>
      professionalis.patch<{ id: string; requiere_confirmacion_negocio: boolean }>(
        `/public/profiles/${profileId}/citas/${citaId}/requiere-confirmacion`,
        { motivo }
      ),

    getPaymentMethods: (profileId: string) =>
      collector.get<PublicPaymentMethod[]>(`/public/profiles/${profileId}/payment-methods`),

    prepararPago: (profileId: string, paymentMethodId: string, payload: PreparePaymentPublicPayload) =>
      collector.post<PreparePaymentPublicResponse>(`/public/profiles/${profileId}/payment-methods/${paymentMethodId}/prepare`, payload),

    subirComprobante: (transactionId: string, comprobanteBase64: string, mimeType: string) =>
      collector.post<TransactionPublic>(`/public/transactions/${transactionId}/comprobante`, {
        comprobante_base64: comprobanteBase64,
        mime_type: mimeType,
      }),
  }
}
