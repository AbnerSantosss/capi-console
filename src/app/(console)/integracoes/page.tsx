import { redirecionarRotaAntiga, type BuscaDaPagina } from '../redirecionar-rota-antiga';

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — NÃO REMOVA ESTA ROTA.
 *
 * `/integracoes` é o endereço que está salvo em favorito, colado em conversa e
 * citado em nota de projeto desde o primeiro dia do console. Apagar a rota
 * transforma cada um desses links num 404 silencioso — e quem colou o link não
 * tem como saber que o endereço novo existe.
 *
 * Mesmo princípio da decisão irreversível #10 (a URL de webhook de um segmento
 * continua aceita para sempre): endereço publicado não expira. Isto não é uma
 * migração com data para acabar; é uma porta que fica aberta.
 *
 * Desde a V2 (v7) o destino é `/e/<slug>/regras` da empresa ativa, com o
 * `?aba=` traduzido como em `/automatico`. Por isso 307 (`redirect()`) e não
 * mais 308: o destino depende da empresa ativa, e o navegador guardaria um 308
 * para sempre. Quem responde é o proxy; esta página é a reserva
 * (`redirecionar-rota-antiga.ts`).
 */
export const dynamic = 'force-dynamic';

export default async function IntegracoesEnderecoAntigo({
  searchParams,
}: {
  searchParams: Promise<BuscaDaPagina>;
}) {
  return redirecionarRotaAntiga('/integracoes', searchParams);
}
