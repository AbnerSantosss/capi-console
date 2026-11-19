import 'server-only';
import nodemailer from 'nodemailer';

/**
 * Envio de e-mail do console (hoje só o link de troca de senha).
 *
 * Tudo vem do ambiente: SMTP_HOST, SMTP_PORT (465 = TLS direto), SMTP_USER,
 * SMTP_PASS e SMTP_FROM (opcional; sem ele, o remetente é o SMTP_USER).
 * Nada daqui vai para log: a senha do SMTP é segredo.
 */

export function emailConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function enviarEmail(para: string, assunto: string, texto: string, html: string): Promise<void> {
  const porta = Number(process.env.SMTP_PORT || 465);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    secure: porta === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const remetente = process.env.SMTP_FROM || `Polen Track <${process.env.SMTP_USER}>`;
  await transporte.sendMail({ from: remetente, to: para, subject: assunto, text: texto, html });
}
