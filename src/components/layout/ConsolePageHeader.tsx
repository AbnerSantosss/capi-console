import type { ElementType, ReactNode } from 'react';

import styles from './console.module.css';

export function ConsolePageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  icon: ElementType;
  action?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderLead}>
        <span className={styles.pageHeaderIcon} aria-hidden="true">
          <Icon size={22} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.pageTitle}>{title}</h1>
          <p className={styles.pageDescription}>{description}</p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

