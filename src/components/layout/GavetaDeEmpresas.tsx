'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Building2, ChevronDown, X } from '@/components/ui/icones';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Insignia } from '@/components/empresa/SeletorDeEmpresa';
import { slugDoEndereco } from '@/lib/empresa-do-endereco';
import type { EmpresaPublica } from '@/stores/useEmpresaStore';
import { ConteudoDaLateral, useListaDeEmpresas } from './LateralDeEmpresas';
import styles from './console.module.css';

/**
 * A gaveta de empresas (V3 do v7): abaixo de `lg`, onde a lateral não cabe.
 *
 * O botão fica no começo do cabeçalho e mostra a empresa ABERTA, a do
 * endereço: errar de empresa custa evento real no Pixel errado, então o nome
 * dela aparece em toda largura, inclusive no celular. Um toque abre a gaveta
 * com o mesmo conteúdo da lateral (`ConteudoDaLateral`): marca, "Nova
 * empresa", a lista, Ajuda, Preferências e Sair. Escolher qualquer coisa
 * fecha a gaveta.
 *
 * A gaveta é o `Dialog` de `ui/dialog.tsx` (não há `sheet` no projeto, e
 * nenhum foi criado). As classes `.lateral` e `.gaveta` de
 * `console.module.css` o encostam à esquerda, na altura inteira da janela, com
 * o mesmo fundo da lateral. O `Dialog` traz o que uma gaveta precisa: foco
 * preso dentro, Esc fecha, clique no véu fecha, e o foco volta ao botão.
 *
 * "Trocar de empresa" na paleta (`capi:trocar-empresa`) abre esta gaveta em
 * qualquer largura: é o jeito de trocar sem tirar a mão do teclado.
 */
export function GavetaDeEmpresas({ empresas: doServidor }: { empresas: EmpresaPublica[] }) {
  const pathname = usePathname();
  const empresas = useListaDeEmpresas(doServidor);
  const [aberta, setAberta] = React.useState(false);

  React.useEffect(() => {
    const abrir = () => setAberta(true);
    window.addEventListener('capi:trocar-empresa', abrir);
    return () => window.removeEventListener('capi:trocar-empresa', abrir);
  }, []);

  const slug = slugDoEndereco(pathname);
  const daTela = slug ? empresas.find((e) => e.slug === slug) : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-expanded={aberta}
        aria-label={
          daTela ? `Empresa aberta: ${daTela.nome}. Trocar de empresa` : 'Escolher empresa'
        }
        title={daTela?.nome}
        // V9: anel de foco ciano, igual ao da lateral e das abas (`.focoCiano`),
        // e 48px de altura sob toque (`.alvoDeToque`, `pointer: coarse`).
        className={`${styles.focoCiano} ${styles.alvoDeToque} flex h-control-sm max-w-[55%] min-w-0 shrink-0 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface-1 py-0 pr-2 pl-1.5 text-left text-label shadow-realce transition-colors hover:border-line-control hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 aria-expanded:bg-surface-2 lg:hidden`}
      >
        {daTela ? (
          <Insignia empresa={daTela} className="size-[1.375rem] rounded-control" />
        ) : (
          <span
            aria-hidden
            className="flex size-[1.375rem] shrink-0 items-center justify-center rounded-control bg-surface-2 text-fg-muted"
          >
            <Building2 className="size-3.5" />
          </span>
        )}
        <span className="min-w-0 truncate font-medium text-fg-strong">
          {daTela ? daTela.nome : 'Escolher empresa'}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
      </button>

      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent
          showCloseButton={false}
          aria-label="Empresas"
          className={`${styles.lateral} ${styles.gaveta}`}
        >
          {/* O título existe para o leitor de tela anunciar a gaveta; à vista,
              o rótulo "Empresas" da lista já diz a mesma coisa. O `aria-label`
              acima é a reserva do mesmo nome, caso o título deixe de existir. */}
          <DialogTitle className="sr-only">Empresas</DialogTitle>
          <ConteudoDaLateral
            empresas={empresas}
            aoEscolher={() => setAberta(false)}
            acaoDoTopo={
              <DialogClose
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Fechar a lista de empresas" />
                }
              >
                <X aria-hidden />
              </DialogClose>
            }
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default GavetaDeEmpresas;
