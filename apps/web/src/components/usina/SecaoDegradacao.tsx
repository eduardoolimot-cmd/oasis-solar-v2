import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { SecaoExpansivel } from "../SecaoExpansivel";

interface Degradacao {
  id: string;
  perdaPrimeiroAnoPct: number;
  perdaAnualConstantePct: number;
  dataBase: string;
  documentoOrigem: string | null;
  versao: number;
}

interface Props {
  usinaId: string;
}

export function SecaoDegradacao({ usinaId }: Props) {
  const [atual, setAtual] = useState<Degradacao | null>(null);
  const [previa, setPrevia] = useState<(number | null)[] | null>(null);
  const [perdaPrimeiroAno, setPerdaPrimeiroAno] = useState("0.5");
  const [perdaAnual, setPerdaAnual] = useState("0.5");
  const [dataBase, setDataBase] = useState(new Date().toISOString().slice(0, 10));
  const [documentoOrigem, setDocumentoOrigem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    api.get(`/usinas/${usinaId}/degradacao`).then(({ data }) => {
      setAtual(data.atual);
      setPrevia(data.previa);
      if (data.atual) {
        setPerdaPrimeiroAno(String(data.atual.perdaPrimeiroAnoPct));
        setPerdaAnual(String(data.atual.perdaAnualConstantePct));
        setDataBase(data.atual.dataBase.slice(0, 10));
        setDocumentoOrigem(data.atual.documentoOrigem ?? "");
      }
    });
  }

  useEffect(carregar, [usinaId]);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const { data } = await api.post(`/usinas/${usinaId}/degradacao`, {
        perdaPrimeiroAnoPct: Number(perdaPrimeiroAno),
        perdaAnualConstantePct: Number(perdaAnual),
        dataBase,
        documentoOrigem: documentoOrigem || undefined,
      });
      setAtual(data.atual);
      setPrevia(data.previa);
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const anosDestaque = [1, 2, 3, 10, 20, 30];

  return (
    <SecaoExpansivel
      titulo="Degradação esperada"
      subtitulo={atual ? `Versão ${atual.versao} vigente` : "Nenhuma curva cadastrada ainda"}
    >
      <p className="text-os-cinza text-xs mb-4">
        A curva é aplicada automaticamente às previsões de energia (geração prevista/E_Grid, P50, P90 e meta de FC) a partir da data-base, que é o início do ano 1 de operação (as simulações PVsyst são do ano 0, sem degradação: a redução do ano 1 é a perda no primeiro ano, e cada ano seguinte soma a perda anual). Os valores cadastrados em Metas mensais permanecem os do PVsyst; irradiação e PR previstos não são degradados.
      </p>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Perda no primeiro ano (%)</label>
          <input type="number" step="0.01" min={0} value={perdaPrimeiroAno} onChange={(e) => setPerdaPrimeiroAno(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Perda anual constante após o 1º ano (p.p.)</label>
          <input type="number" step="0.01" min={0} value={perdaAnual} onChange={(e) => setPerdaAnual(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Data-base</label>
          <input type="date" value={dataBase} onChange={(e) => setDataBase(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="col-span-3">
          <label className="block text-sm text-os-azul-marinho mb-1">Documento de origem (garantia ou estudo)</label>
          <input value={documentoOrigem} onChange={(e) => setDocumentoOrigem(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
      </div>

      {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}

      <button type="button" onClick={salvar} disabled={salvando} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm mb-6 disabled:opacity-60">
        {salvando ? "Salvando..." : "Salvar nova versão"}
      </button>

      {previa && (
        <div>
          <h3 className="text-os-azul-marinho font-medium text-sm mb-2">Prévia de retenção (30 anos)</h3>
          <div className="grid grid-cols-6 gap-2 text-center text-sm">
            {anosDestaque.map((ano) => (
              <div key={ano} className="bg-slate-50 rounded-md p-2">
                <div className="text-os-cinza text-xs">Ano {ano}</div>
                <div className="text-os-azul-marinho font-semibold">
                  {previa[ano - 1] !== null ? `${previa[ano - 1]!.toFixed(2)}%` : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SecaoExpansivel>
  );
}
