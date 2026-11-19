import styles from './console.module.css';

/**
 * Fundo das rotas internas.
 *
 * Redesenho de 18/11/2026 (decisao D-R2 do dono): a imagem de fundo e o grao
 * de papel sairam. Sobra a camada lisa do `.background` (a subida de luz do
 * `::before`, sem matiz), atras do conteudo. Sem estado, efeito nem evento:
 * o fundo chega pronto no HTML do servidor.
 *
 * O login nao usa este componente: ele vive fora do route group (console) e
 * carrega o proprio fundo em `LoginForm.tsx`.
 */
export function ConsoleBackground() {
  return <div className={styles.background} aria-hidden="true" />;
}
