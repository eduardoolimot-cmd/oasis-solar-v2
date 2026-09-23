import { Fragment, useEffect, useRef, useState } from "react";
import { api, baixarArquivo } from "../../api/client";
import { SecaoExpansivel } from "../SecaoExpansivel";

const METRICAS = [
  { chave: "geracaoP50Kwh", rotulo: "Geração bruta P50", unidade: "kWh/mês", grupo: "Geração bruta", calculada: false },
  { chave: "geracaoP90Kwh", rotulo: "Geração bruta P90", unidade: "kWh/mês", grupo: "Geração bruta", calculada: false },
  { chave: "dispGeracaoMetaPct", rotulo: "Disponibilidade de geração", unidade: "%", grupo: "Disponibilidade", calculada: false },
  { chave: "dispComunicacaoMetaPct", rotulo: "Disponibilidade de comunicação", unidade: "%", grupo: "Disponibilidade", calculada: false },
] as const;

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type LinhaMensal = Record<string, number | null> & { mes: number };
type Grade = LinhaMensal[];

interface Props {
  usinaId: string;
}

function gradeVazia(): Grade {
  return Array.from({ length: 12 }, (_, i) => ({ mes: i + 1 }));
}

export function SecaoMetasMensais({ usinaId }: Props) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [grade, setGrade] = useState<Grade>(gradeVazia());
  const [versao, setVersao] = useState<number | null>(null);
  const [documentoOrigem, setDocumentoOrigem] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [ultimaImportacao, setUltimaImportacao] = useState<{ arquivo: string; data: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previaImportacao, setPreviaImportacao] = useState<{ dados: unknown; nomeArquivo: string; resumo: { linhasReconhecidas: number; rotulosDesconhecidos: string[]; rotulosDuplicados: string[]; erros: { mes: number; metrica: string; motivo: string }[] } } | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  function carregar() {
    api.get(`/usinas/${usinaId}/previsoes`, { params: { ano } }).then(({ data }) => {
      setGrade(data.meses);
      setVersao(data.versao);
      setDocumentoOrigem(data.documentoOrigem ?? "");
      setResponsavel(data.responsavel ?? "");
      setAvisos(data.avisos ?? []);
      setUltimaImportacao(data.ultimaImportacao);
    });
  }

  useEffect(carregar, [usinaId, ano]);

  function alterarCelula(mes: number, chave: string, valor: string) {
    setGrade((atual) =>
      atual.map((linha) => (linha.mes === mes ? { ...linha, [chave]: valor === "" ? null : Number(valor) } : linha))
    );
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const meses = grade.map((linha) => {
        const { mes, ...resto } = linha;
        const limpo: Record<string, number | null> = { mes };
        for (const m of METRICAS) {
          if (!m.calculada) limpo[m.chave] = (resto as Record<string, number | null>)[m.chave] ?? null;
        }
        return limpo;
      });
      const { data } = await api.put(`/usinas/${usinaId}/previsoes`, { meses, documentoOrigem, responsavel }, { params: { ano } });
      setGrade(data.meses);
      setVersao(data.versao);
      setAvisos(data.avisos ?? []);
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function exportarExcel() {
    await baixarArquivo(`/usinas/${usinaId}/previsoes/exportar?ano=${ano}`, `metas_${ano}.xlsx`);
  }

  async function selecionarArquivoImportacao(arquivo: File) {
    setErro(null);
    const dados = new FormData();
    dados.append("arquivo", arquivo);
    try {
      const { data } = await api.post(`/usinas/${usinaId}/previsoes/importar`, dados, {
        params: { ano },
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreviaImportacao({ dados: data.previa.meses, nomeArquivo: data.nomeArquivo, resumo: data.previa });
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível ler a planilha.");
    }
  }

  async function confirmarImportacao() {
    if (!previaImportacao) return;
    setSalvando(true);
    try {
      const { data } = await api.post(
        `/usinas/${usinaId}/previsoes/importar/confirmar`,
        { nomeArquivo: previaImportacao.nomeArquivo, meses: previaImportacao.dados, documentoOrigem, responsavel },
        { params: { ano } }
      );
      setGrade(data.meses);
      setVersao(data.versao);
      setUltimaImportacao(data.ultimaImportacao);
      setPreviaImportacao(null);
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível confirmar a importação.");
    } finally {
      setSalvando(false);
    }
  }

  let grupoAnterior = "";

  return (
    <SecaoExpansivel titulo="Metas mensais" subtitulo={versao ? `Versão ${versao} vigente — ano ${ano}` : `Nenhuma meta cadastrada para ${ano}`}>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-os-azul-marinho">Ano</label>
        <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="border border-slate-300 rounded-md px-3 py-1.5 text-sm">
          {Array.from({ length: 6 }, (_, i) => anoAtual - i).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {avisos.length > 0 && (
        <div className="bg-os-amarelo/20 border border-os-amarelo text-os-azul-marinho text-xs rounded-md px-3 py-2 mb-3">
          {avisos.map((a, i) => <div key={i}>{a}</div>)}
        </div>
      )}
      {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}

      <div className="overflow-x-auto border border-slate-200 rounded-md mb-4">
        <table className="text-xs w-full">
          <thead>
            <tr className="bg-os-azul-marinho text-white">
              <th className="sticky left-0 bg-os-azul-marinho text-left px-3 py-2 min-w-[220px]">Métrica</th>
              {MESES.map((m) => (
                <th key={m} className="px-2 py-2 min-w-[80px]">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICAS.map((metrica) => {
              const mostrarGrupo = metrica.grupo !== grupoAnterior;
              grupoAnterior = metrica.grupo;
              return (
                <Fragment key={metrica.chave}>
                  {mostrarGrupo && (
                    <tr key={`grupo-${metrica.grupo}`} className="bg-slate-100">
                      <td colSpan={13} className="px-3 py-1 text-os-cinza font-medium">{metrica.grupo}</td>
                    </tr>
                  )}
                  <tr key={metrica.chave} className="border-t border-slate-100">
                    <td className="sticky left-0 bg-white px-3 py-1.5 whitespace-nowrap">
                      {metrica.rotulo} <span className="text-os-cinza">({metrica.unidade})</span>
                    </td>
                    {grade.map((linha) => (
                      <td key={linha.mes} className="px-1 py-1">
                        {metrica.calculada ? (
                          <span className="block text-center text-os-cinza italic">
                            {linha[metrica.chave] !== null && linha[metrica.chave] !== undefined ? (linha[metrica.chave] as number).toFixed(2) : "—"}
                          </span>
                        ) : (
                          <input
                            type="number"
                            value={linha[metrica.chave] ?? ""}
                            onChange={(e) => alterarCelula(linha.mes, metrica.chave, e.target.value)}
                            className="w-full border border-slate-200 rounded px-1 py-1 text-xs text-center"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Documento de origem</label>
          <input value={documentoOrigem} onChange={(e) => setDocumentoOrigem(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Responsável</label>
          <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={salvar} disabled={salvando} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm disabled:opacity-60">
          {salvando ? "Salvando..." : "Salvar (nova versão)"}
        </button>
        <button onClick={exportarExcel} className="border border-os-azul-marinho text-os-azul-marinho rounded-md px-4 py-2 text-sm">
          Exportar Excel
        </button>
        <input ref={inputArquivoRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && selecionarArquivoImportacao(e.target.files[0])} />
        <button onClick={() => inputArquivoRef.current?.click()} className="border border-os-azul-marinho text-os-azul-marinho rounded-md px-4 py-2 text-sm">
          Importar Excel
        </button>
        {ultimaImportacao && (
          <span className="text-os-cinza text-xs">
            Última importação: {ultimaImportacao.arquivo} em {new Date(ultimaImportacao.data).toLocaleString("pt-BR")}
          </span>
        )}
      </div>

      {previaImportacao && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <h2 className="text-os-azul-marinho font-semibold mb-3">Prévia da importação — {previaImportacao.nomeArquivo}</h2>

            <p className="text-sm mb-2">Linhas reconhecidas: {previaImportacao.resumo.linhasReconhecidas} de {METRICAS.filter((m) => !m.calculada).length} editáveis.</p>

            {previaImportacao.resumo.rotulosDesconhecidos.length > 0 && (
              <p className="text-os-estado-vermelho text-sm mb-2">
                Rótulos desconhecidos: {previaImportacao.resumo.rotulosDesconhecidos.join(", ")}
              </p>
            )}
            {previaImportacao.resumo.rotulosDuplicados.length > 0 && (
              <p className="text-os-estado-vermelho text-sm mb-2">
                Rótulos duplicados: {previaImportacao.resumo.rotulosDuplicados.join(", ")}
              </p>
            )}
            {previaImportacao.resumo.erros.length > 0 && (
              <div className="text-os-estado-vermelho text-xs mb-3">
                {previaImportacao.resumo.erros.map((e, i) => (
                  <div key={i}>Mês {e.mes} · {e.metrica}: {e.motivo}</div>
                ))}
              </div>
            )}

            <p className="text-os-cinza text-xs mb-4">
              Confirmar substitui a versão vigente por uma nova (a anterior é preservada no histórico).
            </p>

            <div className="flex justify-end gap-2">
              <button onClick={() => setPreviaImportacao(null)} className="border border-slate-300 rounded-md px-4 py-2 text-sm">Cancelar</button>
              <button onClick={confirmarImportacao} disabled={salvando} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm disabled:opacity-60">
                {salvando ? "Confirmando..." : "Confirmar importação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SecaoExpansivel>
  );
}
