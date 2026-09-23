import { useEffect, useState } from "react";
import { api, baixarArquivoPost } from "../api/client";
import { useFiltros } from "../context/FiltrosContext";
import { formatarDataBr } from "../lib/formatarData";

interface RelatorioEmitido {
  id: string;
  tipo: string;
  formato: "PDF" | "XLSX" | "CSV";
  periodoInicio: string;
  periodoFim: string;
  responsavel: string | null;
  criadoEm: string;
}

const FORMATOS = [
  { chave: "PDF", rotulo: "PDF" },
  { chave: "XLSX", rotulo: "Excel" },
  { chave: "CSV", rotulo: "CSV" },
] as const;

export function Relatorios() {
  const { usinaAtivaId, ano, modo, mes } = useFiltros();
  const [historico, setHistorico] = useState<RelatorioEmitido[] | null>(null);
  const [responsavel, setResponsavel] = useState("");
  const [formato, setFormato] = useState<(typeof FORMATOS)[number]["chave"]>("PDF");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    if (!usinaAtivaId) return;
    api.get(`/usinas/${usinaAtivaId}/relatorios`).then(({ data }) => setHistorico(data));
  }

  useEffect(carregar, [usinaAtivaId]);

  async function gerarRelatorio() {
    if (!usinaAtivaId) return;
    setErro(null);
    setGerando(true);
    try {
      await baixarArquivoPost(
        `/usinas/${usinaAtivaId}/relatorios`,
        { ano, modo, mes },
        { responsavel: responsavel || undefined, formato },
        `relatorio.${formato.toLowerCase()}`
      );
      carregar();
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  async function baixarDoHistorico(relatorio: RelatorioEmitido, formatoEscolhido: string) {
    if (!usinaAtivaId) return;
    await baixarArquivoPost(
      `/usinas/${usinaAtivaId}/relatorios/${relatorio.id}/arquivo`,
      { formato: formatoEscolhido },
      undefined,
      `relatorio.${formatoEscolhido.toLowerCase()}`
    );
  }

  if (!usinaAtivaId) {
    return <p className="text-os-cinza text-sm">Selecione uma usina na barra superior para gerar relatórios.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-1">Relatórios</h1>
      <p className="text-os-cinza text-sm mb-4">
        Relatório de Geração Solar — dados da instalação, resumo operacional (geração, irradiação e PR
        previstos × realizados, chuva acumulada), geração por SKID e histórico de manutenção/ocorrências,
        no mesmo período do filtro da barra superior. Cada emissão fica preservada com a fotografia dos
        dados daquele momento e nunca é apagada automaticamente.
      </p>

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 max-w-2xl">
        <h3 className="text-os-azul-marinho font-medium text-sm mb-3">Gerar novo relatório</h3>
        {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-os-azul-marinho mb-1">Responsável (assinatura no relatório)</label>
            <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-os-azul-marinho mb-1">Formato</label>
            <select value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)} className="border border-slate-300 rounded-md px-3 py-2 text-sm">
              {FORMATOS.map((f) => (
                <option key={f.chave} value={f.chave}>{f.rotulo}</option>
              ))}
            </select>
          </div>
          <button onClick={gerarRelatorio} disabled={gerando} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm disabled:opacity-60">
            {gerando ? "Gerando..." : "Gerar e baixar"}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-os-azul-marinho text-white">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Emitido em</th>
              <th className="text-left px-4 py-2 font-medium">Período</th>
              <th className="text-left px-4 py-2 font-medium">Responsável</th>
              <th className="text-left px-4 py-2 font-medium">Formato original</th>
              <th className="text-right px-4 py-2 font-medium">Baixar novamente</th>
            </tr>
          </thead>
          <tbody>
            {historico === null && (
              <tr><td colSpan={5} className="px-4 py-4 text-os-cinza">Carregando...</td></tr>
            )}
            {historico?.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-4 text-os-cinza">Nenhum relatório emitido ainda.</td></tr>
            )}
            {historico?.map((r, i) => (
              <tr key={r.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                <td className="px-4 py-2">{new Date(r.criadoEm).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-2">{formatarDataBr(r.periodoInicio)} a {formatarDataBr(r.periodoFim)}</td>
                <td className="px-4 py-2">{r.responsavel ?? "—"}</td>
                <td className="px-4 py-2">{r.formato}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {FORMATOS.map((f) => (
                    <button key={f.chave} onClick={() => baixarDoHistorico(r, f.chave)} className="text-os-azul-marinho underline text-xs ml-3">
                      {f.rotulo}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
