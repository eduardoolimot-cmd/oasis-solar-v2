import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { formatarDataBr as formatarData } from "../../lib/formatarData";

interface OS {
  id: string;
  titulo: string;
  tipo: "CORRETIVA" | "PREVENTIVA";
  status: "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA";
  prioridade: "BAIXA" | "MEDIA" | "ALTA";
  skid: { id: string; nome: string } | null;
  dataPrevista: string | null;
}

function corStatus(status: OS["status"]): string {
  if (status === "CONCLUIDA") return "bg-os-estado-verde/15 text-os-estado-verde";
  if (status === "CANCELADA") return "bg-slate-100 text-os-cinza";
  if (status === "EM_ANDAMENTO") return "bg-os-azul-claro/20 text-os-azul-marinho";
  return "bg-os-amarelo/20 text-os-azul-marinho";
}

function formatarDataBr(iso: string): string {
  return formatarData(iso, { weekday: "short", day: "2-digit", month: "long", year: "numeric" });
}

interface Props {
  usinaId: string;
}

export function AbaCalendario({ usinaId }: Props) {
  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  const [ordens, setOrdens] = useState<OS[] | null>(null);

  useEffect(() => {
    const [ano, mes] = mesAno.split("-").map(Number);
    const desde = `${mesAno}-01`;
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const ate = `${mesAno}-${String(ultimoDia).padStart(2, "0")}`;
    setOrdens(null);
    api.get(`/usinas/${usinaId}/ordens-servico`, { params: { desde, ate } }).then(({ data }) => setOrdens(data));
  }, [usinaId, mesAno]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, OS[]>();
    for (const os of ordens ?? []) {
      if (!os.dataPrevista) continue;
      const chave = os.dataPrevista.slice(0, 10);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(os);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [ordens]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-os-azul-marinho">Mês</label>
        <input type="month" value={mesAno} onChange={(e) => setMesAno(e.target.value)} className="border border-slate-300 rounded-md px-3 py-1.5 text-sm" />
      </div>

      {ordens === null && <p className="text-os-cinza text-sm">Carregando...</p>}

      {ordens !== null && porDia.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-os-cinza text-sm">Nenhuma OS com data prevista neste mês.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {porDia.map(([data, lista]) => (
          <div key={data} className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-2 capitalize">{formatarDataBr(data)}</h3>
            <div className="flex flex-col gap-2">
              {lista.map((os) => (
                <div key={os.id} className="flex items-center justify-between border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                  <div>
                    <span className="text-sm text-os-azul-marinho font-medium">{os.titulo}</span>
                    <span className="text-xs text-os-cinza ml-2">
                      {os.tipo === "CORRETIVA" ? "Corretiva" : "Preventiva"} · {os.skid?.nome ?? "Usina inteira"}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${corStatus(os.status)}`}>{os.status.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
