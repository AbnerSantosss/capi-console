'use client';

import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  BookOpen,
  Building2,
  Clock,
  Eraser,
  Gauge,
  Inbox,
  Plug,
  Plus,
  Target,
  Wand2,
  Workflow,
} from '@/components/ui/icones';

import { useEventStore, agoraLocal } from '@/stores/useEventStore';

/**
 * Paleta de comandos (Ctrl+K / Cmd+K).
 *
 * Deliberadamente NAO expoe "disparar": a acao que gasta dinheiro real fica
 * so no botao primario, que passa pela confirmacao de producao.
 */
export function CommandPalette({ onAbrirMarcas }: { onAbrirMarcas: () => void }) {
  const [aberta, setAberta] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const naRaiz = pathname === '/';

  const reset = useEventStore((s) => s.reset);
  const setField = useEventStore((s) => s.setField);
  const orderId = useEventStore((s) => s.orderId);

  useEffect(() => {
    const porTeclado = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAberta((v) => !v);
      }
      if (e.key === 'Escape') setAberta(false);
    };
    const porEvento = () => setAberta(true);

    document.addEventListener('keydown', porTeclado);
    window.addEventListener('capi:abrir-paleta', porEvento);
    return () => {
      document.removeEventListener('keydown', porTeclado);
      window.removeEventListener('capi:abrir-paleta', porEvento);
    };
  }, []);

  const fechar = () => setAberta(false);

  if (!aberta) return null;

  return (
    <div
      /* Sem `backdrop-blur`: o véu preto a 60% já separa a paleta do fundo, e
         desfoque em véu é custo de GPU em toda a tela para um efeito que
         ninguém consegue nomear. FASE 3b tirou os cinco do produto; só o
         cabeçalho ficou com o dele, porque ali o conteúdo corre POR BAIXO de
         uma barra translúcida e sem desfoque o texto se embaralha. */
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      onClick={() => setAberta(false)}
    >
      <Command
        label="Paleta de comandos"
        className="w-full max-w-lg overflow-hidden rounded-dialog border border-line-control bg-surface-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input
          autoFocus
          placeholder="Buscar um comando…"
          className="w-full border-b border-line-control bg-transparent px-4 py-3.5 text-body text-fg-body outline-none placeholder:text-fg-muted"
        />

        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-caption text-fg-muted">
            Nenhum comando encontrado.
          </Command.Empty>

          {naRaiz && (
            <Command.Group
              heading="Formulário"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-muted [&_[cmdk-group-heading]]:uppercase"
            >
            <Item
              icone={Clock}
              onSelect={() => {
                fechar();
                setField('eventTime', agoraLocal());
                toast.success('Data ajustada para agora.');
              }}
            >
              Marcar o evento como agora
            </Item>
            <Item
              icone={Wand2}
              onSelect={() => {
                fechar();
                setField(
                  'eventId',
                  orderId ? `order_${orderId}` : `evt_${Date.now()}`
                );
                toast.success('ID do evento gerado.');
              }}
            >
              Gerar o ID do evento
            </Item>
            <Item
              icone={Eraser}
              onSelect={() => {
                fechar();
                reset();
                toast.success('Formulário limpo.');
              }}
            >
              Limpar o formulário
            </Item>
            </Command.Group>
          )}

          {/* Empresa antes de "Ir para" porque ela nao e um destino: e o
              escopo de TODO o resto da paleta. Trocar de empresa muda quais
              Pixels, quais regras e qual caixa de entrada as outras linhas vao
              encontrar, entao ela vem primeiro.

              Como os dois itens chegam la: por `window.dispatchEvent`, o mesmo
              recurso que ja abre esta paleta a partir do botao do cabecalho
              (`capi:abrir-paleta`, no useEffect acima). Quem escuta e o
              `SeletorDeEmpresa` — ele e dono do menu e do dialogo, e nao
              aceita props por contrato. A alternativa seria um contexto novo
              so para dois cliques; o barramento ja existia e ja e o padrao
              deste arquivo. */}
          <Command.Group
            heading="Empresa"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-muted [&_[cmdk-group-heading]]:uppercase"
          >
            <Item
              icone={Building2}
              onSelect={() => {
                fechar();
                window.dispatchEvent(new CustomEvent('capi:trocar-empresa'));
              }}
            >
              Trocar de empresa
            </Item>
            <Item
              icone={Plus}
              onSelect={() => {
                fechar();
                window.dispatchEvent(new CustomEvent('capi:adicionar-empresa'));
              }}
            >
              Adicionar empresa
            </Item>
          </Command.Group>

          <Command.Group
            heading="Ir para"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-muted [&_[cmdk-group-heading]]:uppercase"
          >
            {/* O Painel abre a lista porque e a tela de chegada do console
                (D-2') e a mesma primeira posicao que ele ocupa na navegacao:
                quem digita ⌘K sem saber onde olhar deve cair no numero, nao
                numa tela de trabalho. */}
            <Item icone={Gauge} onSelect={() => { fechar(); router.push('/painel'); }}>
              Painel de eventos (o que chegou e de onde veio)
            </Item>
            {/* Depois dele vem a primeira tela do fluxo: sem webhook e sem tag
                nao ha o que disparar, nem manual nem automatico. A tomada
                (`Plug`) e dela; o automatico ficou com o fluxo (`Workflow`),
                que e o que ele virou depois que o recebimento saiu de la. */}
            <Item icone={Plug} onSelect={() => { fechar(); router.push('/instalacao'); }}>
              Instalação (webhook e tag do site)
            </Item>
            <Item icone={Target} onSelect={() => { fechar(); onAbrirMarcas(); }}>
              Pixel e token
            </Item>
            <Item
              icone={Inbox}
              onSelect={() => {
                fechar();
                if (naRaiz) {
                  document
                    .getElementById('secao-origem')
                    ?.scrollIntoView({
                      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'auto'
                        : 'smooth',
                    });
                } else {
                  router.push('/automatico?aba=inbox');
                }
              }}
            >
              Caixa de entrada
            </Item>
            <Item icone={Workflow} onSelect={() => { fechar(); router.push('/automatico'); }}>
              Disparo automático (regras e retornos)
            </Item>
            <Item icone={BookOpen} onSelect={() => { fechar(); router.push('/guia'); }}>
              Guia
            </Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function Item({
  icone: Icone,
  onSelect,
  children,
}: {
  icone: React.ElementType;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      // A linha ativa era `bg-surface-2`: 1.13:1 e MAIS escura que o fundo da
      // paleta — descendo com as setas não dava para ver onde se estava. Quem
      // cumpre os 3:1 de §1.4.11 é a barra azul; o fill translúcido só ajuda.
      className="flex cursor-pointer items-center gap-2.5 rounded-control border-l-2 border-transparent px-3 py-2.5 text-body text-fg-body data-[selected=true]:border-tinta-texto data-[selected=true]:bg-tinta/15 data-[selected=true]:text-fg-strong"
    >
      <Icone className="size-4 text-fg-muted" aria-hidden />
      {children}
    </Command.Item>
  );
}

export default CommandPalette;
