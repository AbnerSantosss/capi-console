export interface RespostaMeta {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
  raw?: string;
}

export interface Atribuicao {
  campaignId: string;
  adsetId: string;
  adId: string;
  placement: string;
  utms: Record<string, string | undefined>;
  links: {
    campanha?: string;
    conjunto?: string;
    anuncio?: string;
    biblioteca?: string;
  };
  faltando: string[];
}

export interface DispatchResult {
  sucesso: boolean;
  httpStatus: number;
  dados?: {
    httpStatus?: number;
    resposta?: RespostaMeta;
    eventoMontado?: Record<string, unknown>;
    atribuicao?: Atribuicao;
    erros?: string[];
  };
  erros?: string[];
}
