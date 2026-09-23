import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

const CHAVE_TOKEN = "oasis_solar_token";

export function obterToken(): string | null {
  return localStorage.getItem(CHAVE_TOKEN);
}

export function definirToken(token: string | null) {
  if (token) localStorage.setItem(CHAVE_TOKEN, token);
  else localStorage.removeItem(CHAVE_TOKEN);
}

api.interceptors.request.use((config) => {
  const token = obterToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      definirToken(null);
      if (location.pathname !== "/login") location.href = "/login";
    }
    return Promise.reject(err);
  }
);

/// Baixa um arquivo autenticado (foto, exportação Excel) e dispara o download no navegador. Não
/// dá para usar <a href> puro porque essas rotas exigem o header Authorization.
export async function baixarArquivo(caminho: string, nomeArquivoSugerido: string) {
  const resposta = await api.get(caminho, { responseType: "blob" });
  disparaDownload(resposta.data, resposta.headers, nomeArquivoSugerido);
}

/// Mesma ideia de baixarArquivo, mas para rotas que geram o arquivo a partir de um corpo enviado
/// por POST (ex.: emitir um relatório) — o nome sugerido só é usado se o servidor não indicar um
/// nome via Content-Disposition.
export async function baixarArquivoPost(caminho: string, params: Record<string, unknown>, body: unknown, nomeArquivoSugerido: string) {
  const resposta = await api.post(caminho, body, { params, responseType: "blob" });
  disparaDownload(resposta.data, resposta.headers, nomeArquivoSugerido);
}

function disparaDownload(blob: Blob, headers: Record<string, unknown>, nomeArquivoSugerido: string) {
  const disposicao = headers["content-disposition"];
  const nomeDoServidor = typeof disposicao === "string" ? disposicao.match(/filename="?([^"]+)"?/)?.[1] : undefined;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeDoServidor ?? nomeArquivoSugerido;
  link.click();
  URL.revokeObjectURL(url);
}

/// Busca uma imagem autenticada (caminho "/uploads/arquivo.jpg", já sem o prefixo "/api", que o
/// cliente acrescenta) e devolve uma object URL para uso em <img
/// src>. O chamador deve revogar a URL (URL.revokeObjectURL) quando não precisar mais dela.
export async function carregarImagemAutenticada(caminho: string): Promise<string> {
  const resposta = await api.get(caminho, { responseType: "blob" });
  return URL.createObjectURL(resposta.data);
}
