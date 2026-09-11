import type { Hue } from './conteudo';
import styles from './guide.module.css';

/** Classe que define --hue no elemento. Ver guide.module.css. */
export const CLASSE_HUE: Record<Hue, string> = {
  manual: styles.hueManual,
  auto: styles.hueAuto,
  dados: styles.hueDados,
  qualidade: styles.hueQualidade,
  regras: styles.hueRegras,
};
