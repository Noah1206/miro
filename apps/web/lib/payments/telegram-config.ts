export function telegramPaymentConfig() {
  const token=process.env.MIRO_TELEGRAM_BOT_TOKEN, chatId=process.env.MIRO_TELEGRAM_CHAT_ID
  const approverId=process.env.MIRO_TELEGRAM_APPROVER_ID, adminId=process.env.MIRO_TELEGRAM_ADMIN_ID
  const webhookSecret=process.env.MIRO_TELEGRAM_WEBHOOK_SECRET
  if (!token || !chatId || !approverId || !adminId || !webhookSecret) return null
  if (!/^-?\d+$/.test(chatId) || !/^\d+$/.test(approverId) || !/^[a-f0-9-]{36}$/i.test(adminId)) throw new Error('INVALID_TELEGRAM_CONFIGURATION')
  return {token,chatId,approverId,adminId,webhookSecret}
}
