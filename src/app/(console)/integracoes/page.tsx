import { permanentRedirect } from 'next/navigation';

/**
 * 🔴 COMPATIBILIDADE PERMANENTE — NÃO REMOVA ESTA ROTA.
 *
 * A tela mudou de endereço para `/automatico` (§7.3.3), mas `/integracoes` é o
 * endereço que está salvo em favorito, colado em conversa e citado em nota de
 * projeto desde o primeiro dia do console. Apagar a rota transforma cada um
 * desses links num 404 silencioso — e quem colou o link não tem como saber que
 * o endereço novo existe.
 *
 * Mesmo princípio da decisão irreversível #10 (a URL de webhook de um segmento
 * continua aceita para sempre): endereço publicado não expira. Isto não é uma
 * migração com data para acabar; é uma porta que fica aberta.
 *
 * A query string é repassada inteira para que `/integracoes?aba=inbox` chegue
 * em `/automatico?aba=inbox`. O `#hash` não trafega para o servidor, mas o
 * navegador o mantém sozinho num 308 cujo destino não traz fragmento próprio —
 * e `IntegrationsPage` sabe traduzir o hash antigo em `?aba=`.
 */
export const dynamic = 'force-dynamic';

export default async function IntegracoesEnderecoAntigo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const consulta = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (Array.isArray(valor)) {
      for (const item of valor) consulta.append(chave, item);
    } else if (valor !== undefined) {
      consulta.append(chave, valor);
    }
  }

  const texto = consulta.toString();
  // 308 (permanente): diz ao navegador e a qualquer robô que o endereço novo é
  // definitivo, sem que o antigo deixe de responder.
  permanentRedirect(texto ? `/automatico?${texto}` : '/automatico');
}
