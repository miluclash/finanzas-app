// Errores comunes a todo el proceso principal.

/** Error pensado para enseñárselo a Michael tal cual (la interfaz lo muestra sin detalles técnicos). */
export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}
