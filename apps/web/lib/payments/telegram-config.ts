export function telegramPaymentConfig() {
  // CLI-provided values may include a final newline; IDs and Telegram tokens never include whitespace.
  const token=process.env.MIRO_TELEGRAM_BOT_TOKEN?.trim(), chatId=process.env.MIRO_TELEGRAM_CHAT_ID?.trim()
  const approverId=process.env.MIRO_TELEGRAM_APPROVER_ID?.trim(), adminId=process.env.MIRO_TELEGRAM_ADMIN_ID?.trim()
  const webhookSecret=process.env.MIRO_TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!token || !chatId || !approverId || !adminId || !webhookSecret) return null
  if (!/^-?\d+$/.test(chatId) || !/^\d+$/.test(approverId) || !/^[a-f0-9-]{36}$/i.test(adminId)) throw new Error('INVALID_TELEGRAM_CONFIGURATION')
  return {token,chatId,approverId,adminId,webhookSecret}
}
