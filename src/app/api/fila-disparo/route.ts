import { NextRequest, NextResponse } from 'next/server';
import { montarFilaDisparo, dispararFila } from '@/lib/batch-processor';
import { acharMarca } from '@/lib/config-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Pode receber entregas como: { deliveries: [...] }, { data: [...] } ou diretamente [...]
    let rawEntregas = body.deliveries || body.data || body.itens || body;
    if (!Array.isArray(rawEntregas)) {
      if (typeof rawEntregas === 'object' && rawEntregas !== null) {
        rawEntregas = [rawEntregas];
      } else {
        return NextResponse.json(
          { erro: 'Formato inválido. Esperava um array de entregas de webhook.' },
          { status: 400 }
        );
      }
    }

    const brandId = String(body.brandId || 'default');
    const marca = await acharMarca(brandId);
    if (!marca) {
      return NextResponse.json({ erro: 'Marca não encontrada.' }, { status: 404 });
    }

    // 1. Monta a fila com deduplicação por (usuário, evento) e enriquecimento de atribuição cruzada
    const resumo = montarFilaDisparo(rawEntregas);

    const dryRun = body.dryRun !== false; // Padrão é dryRun: true para segurança

    if (dryRun) {
      return NextResponse.json({
        modo: 'dryRun',
        mensagem: 'Fila montada e deduplicada com sucesso. Nenhum evento foi disparado.',
        resumo: {
          totalEntregasBrutas: resumo.totalEntregasBrutas,
          totalIgnoradosTestes: resumo.totalIgnoradosTestes,
          totalEventosFila: resumo.totalEventosFila,
          usuariosUnicos: resumo.usuariosUnicos,
          porEvento: resumo.porEvento,
        },
        fila: resumo.fila.map((ev) => ({
          id: ev.id,
          metaEventName: ev.metaEventName,
          rawEvent: ev.rawEvent,
          userEmail: ev.userEmail,
          userName: ev.userName,
          userPhone: ev.userPhone,
          orderId: ev.orderId,
          value: ev.value,
          currency: ev.currency,
          eventTimeIso: ev.eventTimeIso,
          temFbc: ev.temFbc,
          temFbp: ev.temFbp,
          emqNota: ev.emq.nota,
          valido: ev.valido,
          expirado7Dias: ev.expirado7Dias,
          errosValidacao: ev.errosValidacao,
          atribuicao: {
            campaignId: ev.atribuicao.campaignId,
            adsetId: ev.atribuicao.adsetId,
            adId: ev.atribuicao.adId,
            placement: ev.atribuicao.placement,
            links: ev.atribuicao.links,
          },
        })),
      });
    }

    // Disparo real
    const testEventCode =
      body.testEventCode !== undefined ? body.testEventCode : marca.testCode;

    const resultadoDisparo = await dispararFila({
      fila: resumo.fila,
      brandId,
      testEventCode,
      delayMs: typeof body.delayMs === 'number' ? body.delayMs : 250,
    });

    return NextResponse.json({
      modo: testEventCode ? 'teste' : 'producao',
      testEventCode: testEventCode || null,
      resultado: resultadoDisparo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: 'Falha no processamento da fila: ' + msg }, { status: 500 });
  }
}
