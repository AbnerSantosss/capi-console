import type { ReactNode } from 'react';

import { ConsoleBackground } from './ConsoleBackground';
import styles from './console.module.css';

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <ConsoleBackground />
      <div className={styles.content}>{children}</div>
    </div>
  );
}

