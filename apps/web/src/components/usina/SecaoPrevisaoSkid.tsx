import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { SecaoExpansivel } from "../SecaoExpansivel";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface LinhaMes {
  mes: number;
  geracaoEGridKwh: number | null;
  irradiacaoGlobEffKwhM2: number | null;
  prPct: number | null;
}

interface InversorResumo {
  id: string;
  identificacao: string;
}

interface SkidPrevisao {
  skidId: string;
  nome: string;
  potenciaFvKwp: number | null;
  inversores: InversorResumo[];
  versao: number | null;
  documentoOrigem: string | null;
  responsavel: string | null;
  meses: LinhaMes[];
  porInversor: { mes: number; geracaoEGridKwh: number | null }[];
}

interface Props {
  usinaId: string;
}

function gradeVazia(): LinhaMes[] {
  return Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, geracaoEGridKwh: null, irradiacaoGlobEffKwhM2: null, prPct: null }));
}

export function SecaoPrevisaoSkid({ usinaId }: Props) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [skids, setSkids] = useState<SkidPrevisao[]>([]);
  const [skidAtivoId, setSkidAtivoId] = useState<string | null>(null);
  const [grade, setGrade] = useState<LinhaMes[]>(gradeVazia());
  const [porInversor, setPorInversor] = useState<{ mes: number; geracaoEGridKwh: number | null }[]>([]);
  const [documentoOrigem, setDocumentoOrigem] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function carregar() {
    api.get(`/usinas/${usinaId}/previsoes-skid`, { params: { ano } }).then(({ data }) => {
      setSkids(data.skids);
      const atual = data.skids.find((s: SkidPrevisao) => s.skidId === skidAtivoId) ?? data.skids[0] ?? null;
      setSkidAtivoId(atual?.skidId ?? null);
    });
  }

  useEffect(carregar, [usinaId, ano]);

  useEffect(() => {
    const skid = skids.find((s) => s.skidId === skidAtivoId);
    if (!skid) {
      setGrade(gradeVazia());
      setPorInversor([]);
      setDocumentoOrigem("");
      setResponsavel("");
      return;
    }
    setGrade(skid.meses);
    setPorInversor(skid.porInversor);
    setDocumentoOrigem(skid.documentoOrigem ?? "");
    setResponsavel(skid.responsavel ?? "");
  }, [skidAtivoId, skids]);

  function alterarCelula(mes: number, chave: keyof Omit<LinhaMes, "mes">, valor: string) {
    setGrade((atual) => atual.map((l) => (l.mes === mes ? { ...l, [chave]: valor === "" ? null : Number(valor) } : l)));
  }

  async function salvar() {
    if (!skidAtivoId) return;
    setErro(null);
    setAviso(null);
    setSalvando(true);
    try {
      const { data } = await api.put(
        `/usinas/${usinaId}/skids/${skidAtivoId}/previsoes-skid`,
        { meses: grade, documentoOrigem, responsavel },
        { params: { ano } }
      );
      setAviso("Salvo. A previsão mensal da usina (geração/irradiação/PR previstos) foi recalculada a partir dos SKIDs.");
      setPorInversor(data.porInversor);
      carregar();
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const skidAtivo = skids.find((s) => s.skidId === skidAtivoId);
  const nInversores = skidAtivo?.inversores.length ?? 0;

  return (
    <SecaoExpansivel
      titulo="Dados mensais por SKID (PVsyst)"
      subtitulo="Performance Ratio, Geração (E_Grid) e Irradiação Efetiva (GlobEff) mensais, por SKID"
    >
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label className="text-sm text-os-azul-marinho">Ano</label>
        <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="border border-slate-300 rounded-md px-3 py-1.5 text-sm">
          {Array.from({ length: 6 }, (_, i) => anoAtual - i).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {skids.length === 0 && <span className="text-os-cinza text-xs">Cadastre ao menos um SKID em "SKIDs e Inversores" para lançar dados mensais.</span>}

        <div className="flex gap-1 flex-wrap">
          {skids.map((s) => (
            <button
              key={s.skidId}
              onClick={() => setSkidAtivoId(s.skidId)}
              className={`px-3 py-1.5 text-xs rounded-md border ${
                s.skidId === skidAtivoId ? "bg-os-azul-marinho text-white border-os-azul-marinho" : "border-slate-300 text-os-azul-marinho"
              }`}
            >
              {s.nome}
            </button>
          ))}
        </div>
      </div>

      {skidAtivo && (
        <>
          <p className="text-os-cinza text-xs mb-3">
            {skidAtivo.versao ? `Versão ${skidAtivo.versao} vigente` : "Nenhum dado cadastrado"} para {skidAtivo.nome} em {ano}
            {skidAtivo.potenciaFvKwp ? ` · Potência FV: ${skidAtivo.potenciaFvKwp.toLocaleString("pt-BR")} kWp` : " · Potência FV não cadastrada (PR previsto e ponderação da usina não calculáveis para este SKID)"}
            {" · "}
            {nInversores} inversor(es) ativo(s) — a geração mensal digitada abaixo é o total do SKID e é dividida automaticamente entre eles.
          </p>

          {aviso && <p className="text-os-estado-verde text-xs mb-3">{aviso}</p>}
          {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}

          <div className="overflow-x-auto border border-slate-200 rounded-md mb-3">
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
                <tr className="border-t border-slate-100">
                  <td className="sticky left-0 bg-white px-3 py-1.5 whitespace-nowrap">
                    Geração Mensal (E_Grid) <span className="text-os-cinza">(kWh, total do SKID)</span>
                  </td>
                  {grade.map((linha) => (
                    <td key={linha.mes} className="px-1 py-1">
                      <input
                        type="number"
                        value={linha.geracaoEGridKwh ?? ""}
                        onChange={(e) => alterarCelula(linha.mes, "geracaoEGridKwh", e.target.value)}
                        className="w-full border border-slate-200 rounded px-1 py-1 text-xs text-center"
                      />
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100 bg-slate-50">
                  <td className="sticky left-0 bg-slate-50 px-3 py-1.5 whitespace-nowrap">
                    Irradiação Mensal Efetiva (GlobEff) <span className="text-os-cinza">(kWh/m²)</span>
                  </td>
                  {grade.map((linha) => (
                    <td key={linha.mes} className="px-1 py-1">
                      <input
                        type="number"
                        value={linha.irradiacaoGlobEffKwhM2 ?? ""}
                        onChange={(e) => alterarCelula(linha.mes, "irradiacaoGlobEffKwhM2", e.target.value)}
                        className="w-full border border-slate-200 rounded px-1 py-1 text-xs text-center"
                      />
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="sticky left-0 bg-white px-3 py-1.5 whitespace-nowrap">
                    Performance Ratio Mensal (PR) <span className="text-os-cinza">(%)</span>
                  </td>
                  {grade.map((linha) => (
                    <td key={linha.mes} className="px-1 py-1">
                      <input
                        type="number"
                        value={linha.prPct ?? ""}
                        onChange={(e) => alterarCelula(linha.mes, "prPct", e.target.value)}
                        className="w-full border border-slate-200 rounded px-1 py-1 text-xs text-center"
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-md mb-4">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-slate-100">
                  <th className="sticky left-0 bg-slate-100 text-left px-3 py-2 min-w-[220px] text-os-cinza font-medium">
                    Divisão automática por inversor (kWh)
                  </th>
                  {MESES.map((m) => (
                    <th key={m} className="px-2 py-2 min-w-[80px] text-os-cinza font-medium">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nInversores === 0 && (
                  <tr>
                    <td colSpan={13} className="px-3 py-2 text-os-cinza italic">Sem inversores ativos vinculados a este SKID — não calculável.</td>
                  </tr>
                )}
                {skidAtivo.inversores.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-100">
                    <td className="sticky left-0 bg-white px-3 py-1.5 whitespace-nowrap">{inv.identificacao}</td>
                    {porInversor.map((p) => (
                      <td key={p.mes} className="px-2 py-1.5 text-center text-os-cinza italic">
                        {p.geracaoEGridKwh !== null ? p.geracaoEGridKwh.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
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

          <button onClick={salvar} disabled={salvando} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm disabled:opacity-60">
            {salvando ? "Salvando..." : "Salvar (nova versão)"}
          </button>
        </>
      )}
    </SecaoExpansivel>
  );
}
