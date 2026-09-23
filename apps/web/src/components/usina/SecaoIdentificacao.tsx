import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { EVENTO_FOTO_USINA } from "../FundoUsina";
import { FotoAutenticada } from "../FotoAutenticada";
import { SecaoExpansivel } from "../SecaoExpansivel";

export interface UsinaCompleta {
  id: string;
  nome: string;
  identificadorInterno: string;
  municipio: string | null;
  uf: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  fusoHorario: string;
  potenciaDcKwp: number;
  potenciaAcKw: number | null;
  baseFcPadrao: "AC" | "DC";
  inicioOperacao: string | null;
  situacao: "IMPLANTACAO" | "OPERACAO" | "DESATIVADA";
  observacoes: string | null;
  fotoUrl: string | null;
  planoIrradiacao: "GHI" | "POA" | null;
  totalModulos: number | null;
  totalCombinerBoxes: number | null;
  totalTrackers: number | null;
  totalDispositivosAuxiliares: number | null;
  ultimaSincronizacaoNominais: string | null;
}

interface Props {
  usina: UsinaCompleta | null;
  novaUsina: boolean;
  onSalvo: (usina: UsinaCompleta) => void;
  onPendenciaChange: (pendente: boolean) => void;
}

const VAZIO: Partial<UsinaCompleta> = {
  nome: "",
  identificadorInterno: "",
  municipio: "",
  uf: "",
  fusoHorario: "America/Sao_Paulo",
  baseFcPadrao: "DC",
  situacao: "IMPLANTACAO",
};

export function SecaoIdentificacao({ usina, novaUsina, onSalvo, onPendenciaChange }: Props) {
  const [form, setForm] = useState<Partial<UsinaCompleta>>(usina ?? VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  useEffect(() => {
    setForm(usina ?? VAZIO);
  }, [usina]);

  function alterar<K extends keyof UsinaCompleta>(campo: K, valor: UsinaCompleta[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    onPendenciaChange(true);
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome,
        identificadorInterno: form.identificadorInterno,
        municipio: form.municipio || undefined,
        uf: form.uf || undefined,
        endereco: form.endereco || undefined,
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        potenciaDcKwp: Number(form.potenciaDcKwp),
        potenciaAcKw: form.potenciaAcKw ?? undefined,
        baseFcPadrao: form.baseFcPadrao,
        fusoHorario: form.fusoHorario,
        inicioOperacao: form.inicioOperacao || undefined,
        planoIrradiacao: form.planoIrradiacao || undefined,
        observacoes: form.observacoes || undefined,
      };

      const resposta = novaUsina
        ? await api.post<UsinaCompleta>("/usinas", payload)
        : await api.put<UsinaCompleta>(`/usinas/${usina!.id}`, payload);

      onSalvo(resposta.data);
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarFoto(arquivo: File) {
    if (!usina) return;
    setEnviandoFoto(true);
    const dados = new FormData();
    dados.append("foto", arquivo);
    try {
      const { data } = await api.post<{ fotoUrl: string }>(`/usinas/${usina.id}/foto`, dados, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSalvo({ ...usina, fotoUrl: data.fotoUrl });
      window.dispatchEvent(new Event(EVENTO_FOTO_USINA));
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Falha ao enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function removerFoto() {
    if (!usina) return;
    await api.delete(`/usinas/${usina.id}/foto`);
    onSalvo({ ...usina, fotoUrl: null });
    window.dispatchEvent(new Event(EVENTO_FOTO_USINA));
  }

  return (
    <SecaoExpansivel titulo="Identificação" defaultAberta pendente={false}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Nome da usina</label>
          <input
            value={form.nome ?? ""}
            onChange={(e) => alterar("nome", e.target.value as never)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Identificador interno</label>
          <input
            disabled={!novaUsina}
            value={form.identificadorInterno ?? ""}
            onChange={(e) => alterar("identificadorInterno", e.target.value as never)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Município</label>
          <input
            value={form.municipio ?? ""}
            onChange={(e) => alterar("municipio", e.target.value as never)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">UF</label>
          <input
            maxLength={2}
            value={form.uf ?? ""}
            onChange={(e) => alterar("uf", e.target.value.toUpperCase() as never)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Potência instalada (MWp)</label>
          <input
            type="number"
            step="0.001"
            value={form.potenciaDcKwp ? form.potenciaDcKwp / 1000 : ""}
            onChange={(e) => alterar("potenciaDcKwp", Number(e.target.value) * 1000 as never)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Potência CA (MW)</label>
          <input
            type="number"
            step="0.001"
            value={form.potenciaAcKw ? form.potenciaAcKw / 1000 : ""}
            onChange={(e) => alterar("potenciaAcKw", (e.target.value ? Number(e.target.value) * 1000 : null) as never)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <p className="text-os-cinza text-xs mt-1">Usada no FC-AC. Não substitui a potência DC automaticamente.</p>
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Base padrão do Fator de Capacidade</label>
          <select
            value={form.baseFcPadrao ?? "DC"}
            onChange={(e) => alterar("baseFcPadrao", e.target.value as never)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="DC">DC (kWp)</option>
            <option value="AC">AC (kW nominal)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Início de operação</label>
          <input
            type="date"
            value={form.inicioOperacao?.slice(0, 10) ?? ""}
            onChange={(e) => alterar("inicioOperacao", e.target.value as never)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-os-azul-marinho mb-1">Situação</label>
          <select
            value={form.situacao ?? "IMPLANTACAO"}
            onChange={(e) => alterar("situacao", e.target.value as never)}
            disabled={novaUsina}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm disabled:bg-slate-50"
          >
            <option value="IMPLANTACAO">Implantação</option>
            <option value="OPERACAO">Operação</option>
            <option value="DESATIVADA">Desativada</option>
          </select>
          <p className="text-os-cinza text-xs mt-1">Desativar não apaga dados nem altera disponibilidade automaticamente.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDetalhesAbertos((v) => !v)}
        className="text-os-azul-marinho text-sm underline mb-3"
      >
        {detalhesAbertos ? "Ocultar dados complementares" : "Mostrar dados complementares"}
      </button>

      {detalhesAbertos && (
        <div className="grid grid-cols-2 gap-4 mb-4 bg-slate-50 rounded-md p-4">
          <div>
            <label className="block text-sm text-os-azul-marinho mb-1">Fuso horário</label>
            <input
              value={form.fusoHorario ?? ""}
              onChange={(e) => alterar("fusoHorario", e.target.value as never)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-os-azul-marinho mb-1">Endereço</label>
            <input
              value={form.endereco ?? ""}
              onChange={(e) => alterar("endereco", e.target.value as never)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div />
          <div>
            <label className="block text-sm text-os-azul-marinho mb-1">Latitude</label>
            <input
              type="number"
              step="0.000001"
              value={form.latitude ?? ""}
              onChange={(e) => alterar("latitude", (e.target.value ? Number(e.target.value) : null) as never)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-os-azul-marinho mb-1">Longitude</label>
            <input
              type="number"
              step="0.000001"
              value={form.longitude ?? ""}
              onChange={(e) => alterar("longitude", (e.target.value ? Number(e.target.value) : null) as never)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-os-azul-marinho mb-1">Plano de irradiação</label>
            <select
              value={form.planoIrradiacao ?? ""}
              onChange={(e) => alterar("planoIrradiacao", (e.target.value || null) as never)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Não definido</option>
              <option value="GHI">GHI — horizontal global</option>
              <option value="POA">POA — plano dos módulos</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-os-azul-marinho mb-1">Observações</label>
            <textarea
              value={form.observacoes ?? ""}
              onChange={(e) => alterar("observacoes", e.target.value as never)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              rows={2}
            />
          </div>

          {!novaUsina && usina && (
            <div className="col-span-2">
              <label className="block text-sm text-os-azul-marinho mb-2">Foto da usina</label>
              <div className="flex items-center gap-4">
                <FotoAutenticada caminho={usina.fotoUrl} alt={usina.nome} className="w-32 h-24 object-cover rounded-md border border-slate-200" />
                <div className="space-x-2">
                  <input
                    ref={inputFotoRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && enviarFoto(e.target.files[0])}
                  />
                  <button
                    type="button"
                    disabled={enviandoFoto}
                    onClick={() => inputFotoRef.current?.click()}
                    className="border border-os-azul-marinho text-os-azul-marinho rounded-md px-3 py-1.5 text-sm disabled:opacity-60"
                  >
                    {enviandoFoto ? "Enviando..." : usina.fotoUrl ? "Substituir foto" : "Enviar foto da usina"}
                  </button>
                  {usina.fotoUrl && (
                    <button type="button" onClick={removerFoto} className="text-os-estado-vermelho text-sm underline">
                      Remover
                    </button>
                  )}
                </div>
              </div>
              <p className="text-os-cinza text-xs mt-1">JPG, PNG ou WebP, até 10 MB.</p>
            </div>
          )}
        </div>
      )}

      {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}

      <button
        type="button"
        onClick={salvar}
        disabled={salvando || !form.nome || !form.identificadorInterno || !form.potenciaDcKwp}
        className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60"
      >
        {salvando ? "Salvando..." : "Salvar identificação"}
      </button>
    </SecaoExpansivel>
  );
}
