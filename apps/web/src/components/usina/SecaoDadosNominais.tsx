import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { SecaoExpansivel } from "../SecaoExpansivel";
import { UsinaCompleta } from "./SecaoIdentificacao";

interface Inversor {
  id: string;
  identificacao: string;
  quantidadeModulos: number | null;
  kwCa: number | null;
  modelo: string | null;
  marca: string | null;
  moduloWp: number | null;
  skid: { id: string; nome: string } | null;
}

interface Props {
  usina: UsinaCompleta;
  onUsinaAtualizada: (usina: UsinaCompleta) => void;
  onPendenciaChange: (pendente: boolean) => void;
}

export function SecaoDadosNominais({ usina, onUsinaAtualizada, onPendenciaChange }: Props) {
  const [inversores, setInversores] = useState<Inversor[]>([]);
  const [totalModulos, setTotalModulos] = useState(usina.totalModulos ?? "");
  const [totalCombinerBoxes, setTotalCombinerBoxes] = useState(usina.totalCombinerBoxes ?? "");
  const [totalTrackers, setTotalTrackers] = useState(usina.totalTrackers ?? "");
  const [totalDispositivosAuxiliares, setTotalDispositivosAuxiliares] = useState(usina.totalDispositivosAuxiliares ?? "");
  const [salvando, setSalvando] = useState(false);

  function carregarInversores() {
    api.get<Inversor[]>(`/usinas/${usina.id}/inversores`).then(({ data }) => setInversores(data));
  }

  useEffect(carregarInversores, [usina.id]);

  useEffect(() => {
    setTotalModulos(usina.totalModulos ?? "");
    setTotalCombinerBoxes(usina.totalCombinerBoxes ?? "");
    setTotalTrackers(usina.totalTrackers ?? "");
    setTotalDispositivosAuxiliares(usina.totalDispositivosAuxiliares ?? "");
  }, [usina]);

  const potenciaDcAgregadaKwp = inversores.reduce((soma, inv) => {
    if (!inv.quantidadeModulos || !inv.moduloWp) return soma;
    return soma + (inv.quantidadeModulos * inv.moduloWp) / 1000;
  }, 0);
  const temAgregado = inversores.some((inv) => inv.quantidadeModulos && inv.moduloWp);
  const divergencia = temAgregado ? Math.abs(potenciaDcAgregadaKwp - usina.potenciaDcKwp) : 0;
  const divergenciaRelevante = temAgregado && usina.potenciaDcKwp > 0 && divergencia / usina.potenciaDcKwp > 0.02;

  async function salvarQuantidades() {
    setSalvando(true);
    try {
      const payload = {
        totalModulos: totalModulos === "" ? undefined : Number(totalModulos),
        totalCombinerBoxes: totalCombinerBoxes === "" ? undefined : Number(totalCombinerBoxes),
        totalTrackers: totalTrackers === "" ? undefined : Number(totalTrackers),
        totalDispositivosAuxiliares: totalDispositivosAuxiliares === "" ? undefined : Number(totalDispositivosAuxiliares),
      };
      const { data } = await api.put<UsinaCompleta>(`/usinas/${usina.id}`, payload);
      onUsinaAtualizada(data);
      onPendenciaChange(false);
    } finally {
      setSalvando(false);
    }
  }

  async function atualizarInversor(id: string, campo: keyof Inversor, valor: string) {
    const numerico = campo === "modelo" || campo === "marca" ? undefined : valor === "" ? null : Number(valor);
    const payload =
      campo === "modelo" || campo === "marca" ? { [campo]: valor || undefined } : { [campo]: numerico ?? undefined };
    await api.put(`/usinas/${usina.id}/inversores/${id}`, payload);
    carregarInversores();
  }

  return (
    <SecaoExpansivel
      titulo="Dados nominais"
      subtitulo="Potências (mesma fonte da Identificação), quantidades e inversores"
    >
      <div className="flex items-center justify-between mb-4 text-xs text-os-cinza">
        <span>
          Última sincronização: {usina.ultimaSincronizacaoNominais ? new Date(usina.ultimaSincronizacaoNominais).toLocaleString("pt-BR") : "nunca"}
        </span>
        <button type="button" disabled title="Sem integração de monitoramento configurada nesta versão" className="border border-slate-200 text-os-cinza rounded-md px-3 py-1.5 cursor-not-allowed">
          Buscar do monitoramento (indisponível)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3 bg-slate-50 rounded-md p-4">
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Potência instalada (MWp)</label>
          <input disabled value={usina.potenciaDcKwp / 1000} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-slate-100" />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Potência CA (MW)</label>
          <input disabled value={usina.potenciaAcKw ? usina.potenciaAcKw / 1000 : ""} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-slate-100" />
        </div>
      </div>
      <p className="text-os-cinza text-xs mb-4">Editáveis apenas na seção Identificação — fonte única para evitar divergência.</p>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Total de módulos FV</label>
          <input type="number" min={0} value={totalModulos} onChange={(e) => { setTotalModulos(e.target.value === "" ? "" : Number(e.target.value)); onPendenciaChange(true); }} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Combiner boxes</label>
          <input type="number" min={0} value={totalCombinerBoxes} onChange={(e) => { setTotalCombinerBoxes(e.target.value === "" ? "" : Number(e.target.value)); onPendenciaChange(true); }} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Trackers</label>
          <input type="number" min={0} value={totalTrackers} onChange={(e) => { setTotalTrackers(e.target.value === "" ? "" : Number(e.target.value)); onPendenciaChange(true); }} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Dispositivos auxiliares</label>
          <input type="number" min={0} value={totalDispositivosAuxiliares} onChange={(e) => { setTotalDispositivosAuxiliares(e.target.value === "" ? "" : Number(e.target.value)); onPendenciaChange(true); }} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
      </div>
      <button type="button" onClick={salvarQuantidades} disabled={salvando} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm mb-6 disabled:opacity-60">
        {salvando ? "Salvando..." : "Salvar dados nominais"}
      </button>

      <h3 className="text-os-azul-marinho font-medium text-sm mb-2">Inversores ({inversores.length})</h3>
      <p className="text-os-cinza text-xs mb-2">Cadastre inversores na seção SKIDs/Inversores. Aqui, edite os dados técnicos de cada um.</p>
      <div className="border border-slate-200 rounded-md overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-os-azul-marinho">Identificação</th>
              <th className="text-left px-3 py-2 font-medium text-os-azul-marinho">SKID</th>
              <th className="text-left px-3 py-2 font-medium text-os-azul-marinho">Qtd. módulos</th>
              <th className="text-left px-3 py-2 font-medium text-os-azul-marinho">Wp do módulo</th>
              <th className="text-left px-3 py-2 font-medium text-os-azul-marinho">kW CA</th>
              <th className="text-left px-3 py-2 font-medium text-os-azul-marinho">Marca</th>
              <th className="text-left px-3 py-2 font-medium text-os-azul-marinho">Modelo</th>
            </tr>
          </thead>
          <tbody>
            {inversores.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-3 text-os-cinza text-xs">Nenhum inversor cadastrado ainda.</td></tr>
            )}
            {inversores.map((inv) => (
              <tr key={inv.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5">{inv.identificacao}</td>
                <td className="px-3 py-1.5 text-os-cinza">{inv.skid?.nome ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <input type="number" defaultValue={inv.quantidadeModulos ?? ""} onBlur={(e) => atualizarInversor(inv.id, "quantidadeModulos", e.target.value)} className="w-24 border border-slate-200 rounded px-2 py-1 text-xs" />
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" defaultValue={inv.moduloWp ?? ""} onBlur={(e) => atualizarInversor(inv.id, "moduloWp", e.target.value)} className="w-20 border border-slate-200 rounded px-2 py-1 text-xs" />
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" defaultValue={inv.kwCa ?? ""} onBlur={(e) => atualizarInversor(inv.id, "kwCa", e.target.value)} className="w-20 border border-slate-200 rounded px-2 py-1 text-xs" />
                </td>
                <td className="px-3 py-1.5">
                  <input defaultValue={inv.marca ?? ""} onBlur={(e) => atualizarInversor(inv.id, "marca", e.target.value)} className="w-24 border border-slate-200 rounded px-2 py-1 text-xs" />
                </td>
                <td className="px-3 py-1.5">
                  <input defaultValue={inv.modelo ?? ""} onBlur={(e) => atualizarInversor(inv.id, "modelo", e.target.value)} className="w-24 border border-slate-200 rounded px-2 py-1 text-xs" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-md p-3 text-sm ${divergenciaRelevante ? "bg-os-amarelo/20 text-os-azul-marinho" : "bg-slate-50 text-os-cinza"}`}>
        <strong>Conferência: </strong>
        {temAgregado ? (
          <>
            soma (quantidade × Wp) dos inversores = {potenciaDcAgregadaKwp.toFixed(2)} kWp, cadastrado = {usina.potenciaDcKwp} kWp.
            {divergenciaRelevante && " Divergência acima de 2% — conferir cadastro."}
          </>
        ) : (
          "Informe quantidade de módulos e Wp por inversor para habilitar a conferência."
        )}
      </div>
    </SecaoExpansivel>
  );
}
