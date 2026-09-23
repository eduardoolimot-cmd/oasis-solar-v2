import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";
import { api, baixarArquivo } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface Registro {
  data: string;
  usuario: string | null;
}

interface InfoBackup {
  tipoBanco: "SQLite" | "PostgreSQL";
  backupDoBancoPelaInterface: boolean;
  tamanhoBancoBytes: number | null;
  arquivosEnviados: number;
  ultimoBackup: Registro | null;
  ultimaRestauracao: Registro | null;
  backupsDeSeguranca: { nome: string; tamanhoBytes: number; data: string }[];
  tamanhoMaximoRestauracaoBytes: number;
}

interface ResultadoRestauracao {
  backupDeSeguranca: string;
  usuarios: number;
  usinas: number;
  arquivosRestaurados: number | null;
}

const PALAVRA_CONFIRMACAO = "RESTAURAR";

function fmtTamanho(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

/// Erros de rotas com responseType "blob" chegam como Blob — lê o texto para mostrar a mensagem.
async function mensagemDeErro(err: unknown, padrao: string): Promise<string> {
  const dados = (err as { response?: { data?: unknown } })?.response?.data;
  if (dados instanceof Blob) {
    try {
      return JSON.parse(await dados.text()).erro ?? padrao;
    } catch {
      return padrao;
    }
  }
  return (dados as { erro?: string } | undefined)?.erro ?? padrao;
}

export function Administracao() {
  const { sair } = useAuth();
  const [info, setInfo] = useState<InfoBackup | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erroRestauracao, setErroRestauracao] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoRestauracao | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  function carregar() {
    api.get<InfoBackup>("/admin/backup/info").then(({ data }) => setInfo(data));
  }

  useEffect(carregar, []);

  async function gerarBackup() {
    setErro(null);
    setGerando(true);
    try {
      await baixarArquivo("/admin/backup", "oasis_solar_backup.zip");
      carregar();
    } catch (err) {
      setErro(await mensagemDeErro(err, "Não foi possível gerar o backup."));
    } finally {
      setGerando(false);
    }
  }

  async function baixarSeguranca(nome: string) {
    try {
      await baixarArquivo(`/admin/backup/seguranca/${encodeURIComponent(nome)}`, nome);
    } catch (err) {
      setErroRestauracao(await mensagemDeErro(err, "Não foi possível baixar o backup de segurança."));
    }
  }

  async function restaurar() {
    if (!arquivo) return;
    setErroRestauracao(null);
    setProgresso(0);
    const dados = new FormData();
    dados.append("confirmacao", confirmacao);
    dados.append("arquivo", arquivo);
    try {
      const { data } = await api.post<ResultadoRestauracao>("/admin/restauracao", dados, {
        onUploadProgress: (e) => setProgresso(e.total ? Math.round((e.loaded / e.total) * 100) : null),
      });
      setResultado(data);
    } catch (err) {
      setErroRestauracao(await mensagemDeErro(err, "Não foi possível restaurar o backup."));
    } finally {
      setProgresso(null);
    }
  }

  const enviando = progresso !== null;
  const tamanhoExcedido = !!arquivo && !!info && arquivo.size > info.tamanhoMaximoRestauracaoBytes;
  const podeRestaurar = !!arquivo && confirmacao === PALAVRA_CONFIRMACAO && !enviando && !tamanhoExcedido;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-1">Administração</h1>
      <p className="text-os-cinza text-sm mb-6">Área exclusiva do administrador.</p>

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-6">
        <h2 className="text-os-azul-marinho font-semibold mb-1">Backup completo dos dados</h2>
        <p className="text-os-cinza text-sm mb-4">
          Gera um arquivo .zip com uma cópia íntegra do banco de dados e de todos os arquivos enviados (fotos de usinas, de ordens de serviço e imagens do
          estoque). Guarde o arquivo em local seguro, fora deste servidor.
        </p>

        {info && (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
            <div>
              <dt className="text-os-cinza text-xs">Banco de dados</dt>
              <dd className="font-medium text-os-azul-marinho">{info.tipoBanco}</dd>
            </div>
            <div>
              <dt className="text-os-cinza text-xs">Tamanho do banco</dt>
              <dd className="font-medium text-os-azul-marinho">{fmtTamanho(info.tamanhoBancoBytes)}</dd>
            </div>
            <div>
              <dt className="text-os-cinza text-xs">Arquivos enviados</dt>
              <dd className="font-medium text-os-azul-marinho">{info.arquivosEnviados}</dd>
            </div>
            <div>
              <dt className="text-os-cinza text-xs">Último backup</dt>
              <dd className="font-medium text-os-azul-marinho">
                {info.ultimoBackup ? fmtData(info.ultimoBackup.data) : "Nunca"}
                {info.ultimoBackup?.usuario && <span className="block text-os-cinza text-xs font-normal">por {info.ultimoBackup.usuario}</span>}
              </dd>
            </div>
          </dl>
        )}

        {info && !info.backupDoBancoPelaInterface && (
          <p className="bg-os-amarelo/20 border border-os-amarelo text-os-azul-marinho text-sm rounded-md px-3 py-2 mb-4">
            Este ambiente usa PostgreSQL: o backup do banco deve ser feito com pg_dump no servidor. A geração pela interface só está disponível para banco SQLite.
          </p>
        )}
        {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}

        <button
          onClick={gerarBackup}
          disabled={gerando || (info !== null && !info.backupDoBancoPelaInterface)}
          className="inline-flex items-center gap-2 bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60"
        >
          <Download size={16} />
          {gerando ? "Gerando backup..." : "Gerar e baixar backup"}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl">
        <h2 className="text-os-azul-marinho font-semibold mb-1">Restaurar backup</h2>
        <p className="text-os-cinza text-sm mb-4">
          Substitui o banco de dados deste sistema pelo arquivo enviado: o .zip gerado em "Gerar e baixar backup" (banco e fotos) ou um arquivo de banco .db
          (só o banco; as fotos atuais são mantidas). Use para levar os dados de um computador para o servidor ou para voltar a um backup anterior.
        </p>

        <div className="flex gap-2 bg-os-estado-vermelho/10 border border-os-estado-vermelho/40 text-os-azul-marinho text-sm rounded-md px-3 py-2 mb-4">
          <AlertTriangle size={18} className="text-os-estado-vermelho shrink-0 mt-0.5" />
          <span>
            Todos os dados atuais serão trocados pelos do backup, e o que foi lançado depois dele deixa de aparecer. Antes da troca o sistema salva
            automaticamente uma cópia do estado atual (lista abaixo), que pode ser restaurada para desfazer. Depois da restauração é preciso entrar novamente.
          </span>
        </div>

        {info && !info.backupDoBancoPelaInterface ? (
          <p className="text-os-cinza text-sm">Disponível apenas com banco SQLite.</p>
        ) : resultado ? (
          <div className="bg-os-azul-claro/10 border border-os-azul-claro/50 rounded-md px-4 py-3 text-sm text-os-azul-marinho">
            <p className="flex items-center gap-2 font-semibold mb-1">
              <CheckCircle2 size={18} className="text-os-azul-claro" /> Backup restaurado.
            </p>
            <p>
              {resultado.usinas} usinas e {resultado.usuarios} usuários no banco restaurado
              {resultado.arquivosRestaurados !== null ? `; ${resultado.arquivosRestaurados} arquivos restaurados.` : "; arquivos (fotos) mantidos."}
            </p>
            <p className="text-os-cinza mb-3">Estado anterior salvo em: {resultado.backupDeSeguranca}</p>
            <button onClick={sair} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm hover:opacity-90">
              Entrar novamente
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={campoArquivo}
                type="file"
                accept=".zip,.db"
                className="hidden"
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] ?? null);
                  setErroRestauracao(null);
                }}
              />
              <button
                onClick={() => campoArquivo.current?.click()}
                disabled={enviando}
                className="inline-flex items-center gap-2 border border-os-azul-marinho text-os-azul-marinho rounded-md px-4 py-2 text-sm hover:bg-os-azul-marinho/5 disabled:opacity-60"
              >
                <Upload size={16} /> Escolher arquivo
              </button>
              <span className="text-sm text-os-cinza">{arquivo ? `${arquivo.name} (${fmtTamanho(arquivo.size)})` : "Nenhum arquivo selecionado (.zip ou .db)"}</span>
            </div>
            {tamanhoExcedido && info && (
              <p className="text-os-estado-vermelho text-sm">Arquivo maior que o limite de {fmtTamanho(info.tamanhoMaximoRestauracaoBytes)}.</p>
            )}

            <label className="block text-sm text-os-azul-marinho">
              Para confirmar, digite <strong>{PALAVRA_CONFIRMACAO}</strong>
              <input
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value.toUpperCase())}
                disabled={enviando}
                className="block mt-1 w-56 border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </label>

            {erroRestauracao && <p className="text-os-estado-vermelho text-sm">{erroRestauracao}</p>}

            <button
              onClick={restaurar}
              disabled={!podeRestaurar}
              className="bg-os-estado-vermelho text-white rounded-md px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {enviando ? (progresso !== null && progresso < 100 ? `Enviando... ${progresso}%` : "Restaurando...") : "Restaurar backup"}
            </button>
          </div>
        )}

        {info && info.backupsDeSeguranca.length > 0 && (
          <div className="mt-6">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-2">Backups de segurança (estado antes de cada restauração)</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-os-cinza text-xs border-b border-slate-200">
                  <th className="py-1.5 font-normal">Arquivo</th>
                  <th className="py-1.5 font-normal">Data</th>
                  <th className="py-1.5 font-normal text-right">Tamanho</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {info.backupsDeSeguranca.map((b) => (
                  <tr key={b.nome} className="border-b border-slate-100">
                    <td className="py-1.5 text-os-azul-marinho">{b.nome}</td>
                    <td className="py-1.5">{fmtData(b.data)}</td>
                    <td className="py-1.5 text-right">{fmtTamanho(b.tamanhoBytes)}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => baixarSeguranca(b.nome)} className="inline-flex items-center gap-1 text-os-azul-claro hover:underline">
                        <Download size={14} /> Baixar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-os-cinza text-xs mt-2">Para desfazer uma restauração, baixe o arquivo correspondente e envie-o acima.</p>
          </div>
        )}
        {info?.ultimaRestauracao && (
          <p className="text-os-cinza text-xs mt-3">
            Última restauração: {fmtData(info.ultimaRestauracao.data)}
            {info.ultimaRestauracao.usuario ? ` por ${info.ultimaRestauracao.usuario}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
