/**
 * Biblioteca de cenas do console (padrão HyperFrames §2). Toda cena animada
 * de qualquer aba sai daqui; nenhuma aba escreve `@keyframes` próprio.
 *
 *   <Palco assunto="webhook">
 *     <Balao x="50%" y="12%" centro forte>Venda PIX aprovada ✓</Balao>
 *     <Trilha comBalao>
 *       <No rotulo="Plataforma" /> <Fio /> <No rotulo="Console" forte ordem={1} />
 *       <Fio ordem={1} /> <No rotulo="Meta" ordem={2} />
 *     </Trilha>
 *   </Palco>
 *
 * Um `<Palco>` por arquivo .tsx. `Funil` e `IconeDoAssunto` não são palcos.
 */

export { ASSUNTOS, ICONE_DO_ASSUNTO } from './assuntos';
export type { Assunto, Estado, Ordem } from './assuntos';
export { Palco } from './Palco';
export type { AlturaDoPalco, PropsDoPalco } from './Palco';
export { Balao } from './Balao';
export type { PropsDoBalao } from './Balao';
export { No } from './No';
export type { PropsDoNo } from './No';
export { Fio } from './Fio';
export type { PropsDoFio } from './Fio';
export { Trilha } from './Trilha';
export type { PropsDaTrilha } from './Trilha';
export { JanelaDoNavegador, CodigoComCursor } from './JanelaDoNavegador';
export type { PropsDaJanela } from './JanelaDoNavegador';
export { SeloDePasso } from './SeloDePasso';
export type { PropsDoSelo } from './SeloDePasso';
export { CartaoDePasso } from './CartaoDePasso';
export type { PropsDoCartao } from './CartaoDePasso';
export { Funil, MAXIMO_DE_ETAPAS, MAXIMO_DO_ROTULO } from './Funil';
export type { EtapaDoFunil, PropsDoFunil, RamoDoFunil } from './Funil';
export { IconeDoAssunto, MolduraDeIcone, classesDoIcone } from './IconeDoAssunto';
export type { PropsDaMoldura, PropsDoIconeDoAssunto } from './IconeDoAssunto';
