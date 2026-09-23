import { useEffect, useState } from "react";
import { api, baixarArquivo } from "../api/client";

interface InfoBackup {
  tipoBanco: "SQLite" | "PostgreSQL";
  backupDoBancoPelaInterface: boolean;
  tamanhoBancoBytes: number | null;
  arquivosEnviados: number;
  ultimoBackup: { data: string; usuario: string | null } | null;
}

function fmtTamanho(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Administracao() {
  const [info, setInfo] = useState<InfoBackup | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
    } catch (err: unknown) {
      // A resposta de erro vem como blob (responseType "blob") — lê o texto para mostrar a mensagem.
      const blob = (err as { response?: { data?: Blob } })?.response?.data;
      let mensagem = "Não foi possível gerar o backup.";
      if (blob instanceof Blob) {
        try {
          mensagem = JSON.parse(await blob.text()).erro ?? mensagem;
        } catch {
          /* mantém a mensagem padrão */
        }
      }
      setErro(mensagem);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-1">Administração</h1>
      <p className="text-os-cinza text-sm mb-6">Área exclusiva do administrador.</p>

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl">
        <h2 className="text-os-azul-marinho font-semibold mb-1">Backup completo dos dados</h2>
        <p className="text-os-cinza text-sm mb-4">
          Gera um arquivo .zip com uma cópia íntegra do banco de dados e de todos os arquivos enviados (fotos de usinas e imagens do estoque).
          Guarde o arquivo em local seguro, fora deste servidor.
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
                {info.ultimoBackup ? new Date(info.ultimoBackup.data).toLocaleString("pt-BR") : "Nunca"}
                {info.ultimoBackup?.usuario && <span className="block text-os-cinza text-xs font-normal">por {info.ultimoBackup.usuario}</span>}
              </dd>
            </div>
          </dl>
        )}

        {info && !info.backupDoBancoPelaInterface && (
          <p className="bg-os-amarelo/20 border border-os-amarelo text-os-azul-marinho text-sm rounded-md px-3 py-2 mb-4">
            Este ambiente usa PostgreSQL: o backup do banco deve ser feito com pg_dump no servidor. A geração pela interface só está disponível para o banco SQLite de desenvolvimento.
          </p>
        )}
        {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}

        <button
          onClick={gerarBackup}
          disabled={gerando || (info !== null && !info.backupDoBancoPelaInterface)}
          className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60"
        >
          {gerando ? "Gerando backup..." : "Gerar e baixar backup"}
        </button>
      </div>
    </div>
  );
}
