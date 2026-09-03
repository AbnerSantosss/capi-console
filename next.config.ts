import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O runtime do container copia so .next/standalone: imagem menor e sem
  // node_modules de build. Sem isso o Dockerfile nao tem server.js para rodar.
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;
