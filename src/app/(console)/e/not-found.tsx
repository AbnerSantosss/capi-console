/**
 * O `notFound()` lançado no `layout.tsx` de `[slug]` não é pego pelo
 * `not-found.tsx` do próprio `[slug]` (ele fica dentro daquele layout): quem
 * pega é o do segmento de cima, este. Mesma tela, "Empresa não encontrada".
 */
export { default } from './[slug]/not-found';
