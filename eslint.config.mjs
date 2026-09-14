import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Saida gerada pelo Claude Design (ds-bundle e .ds-sync sao ignorados no
    // git; .design-sync/previews sao previews gerados pelo conversor). Nada
    // disso entra no build do console nem e importado por src/ — lintar
    // bundle de terceiros so produz ruido (hooks de dentro do React, regras
    // inexistentes citadas em comentarios do vendor).
    "ds-bundle/**",
    ".ds-sync/**",
    ".design-sync/**",
  ]),
]);

export default eslintConfig;
