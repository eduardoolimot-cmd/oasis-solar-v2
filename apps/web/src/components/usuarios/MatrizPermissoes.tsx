import { PermissaoLinha } from "./tipos";

// Módulos configuráveis e as ações que cada um realmente usa no sistema. "Usuários e Acessos" e
// "Notificações e Histórico" são exclusivos do administrador e não aparecem aqui.
export const MATRIZ: { modulo: string; rotulo: string; acoes: { chave: string; rotulo: string }[] }[] = [
  { modulo: "painel", rotulo: "Painel Principal", acoes: [{ chave: "visualizar", rotulo: "Ver" }] },
  {
    modulo: "cadastro_usinas",
    rotulo: "Cadastro de Usinas",
    acoes: [
      { chave: "visualizar", rotulo: "Ver" },
      { chave: "criar", rotulo: "Criar" },
      { chave: "editar", rotulo: "Editar" },
      { chave: "desativar", rotulo: "Desativar" },
      { chave: "exportar", rotulo: "Exportar" },
    ],
  },
  {
    modulo: "lancamentos",
    rotulo: "Lançamento de Dados",
    acoes: [
      { chave: "visualizar", rotulo: "Ver" },
      { chave: "criar", rotulo: "Lançar" },
      { chave: "editar", rotulo: "Editar" },
      { chave: "cancelar", rotulo: "Excluir" },
      { chave: "reprocessar", rotulo: "Reprocessar" },
    ],
  },
  {
    modulo: "manutencao",
    rotulo: "Manutenção (OS)",
    acoes: [
      { chave: "visualizar", rotulo: "Ver" },
      { chave: "criar", rotulo: "Criar" },
      { chave: "editar", rotulo: "Editar" },
      { chave: "cancelar", rotulo: "Excluir" },
    ],
  },
  {
    modulo: "estoque",
    rotulo: "Estoque",
    acoes: [
      { chave: "visualizar", rotulo: "Ver" },
      { chave: "criar", rotulo: "Criar" },
      { chave: "editar", rotulo: "Editar/Excluir" },
      { chave: "movimentar", rotulo: "Movimentar" },
      { chave: "ajustar", rotulo: "Ajustar" },
    ],
  },
  {
    modulo: "financeiro",
    rotulo: "Financeiro",
    acoes: [
      { chave: "visualizar", rotulo: "Ver" },
      { chave: "criar", rotulo: "Criar" },
      { chave: "editar", rotulo: "Editar" },
      { chave: "cancelar", rotulo: "Cancelar" },
    ],
  },
  { modulo: "comparativo", rotulo: "Comparativo", acoes: [{ chave: "visualizar", rotulo: "Ver" }] },
  { modulo: "ranking", rotulo: "Ranking de Ativos", acoes: [{ chave: "visualizar", rotulo: "Ver" }] },
  {
    modulo: "relatorios",
    rotulo: "Relatórios",
    acoes: [
      { chave: "visualizar", rotulo: "Ver/Baixar" },
      { chave: "criar", rotulo: "Emitir" },
    ],
  },
];

export interface EstadoPermissoes {
  marcadas: Set<string>; // "modulo:acao"
  todasUsinas: boolean;
  incluirFuturas: boolean;
  usinasSelecionadas: Set<string>;
}

export function estadoVazio(): EstadoPermissoes {
  return { marcadas: new Set(), todasUsinas: true, incluirFuturas: false, usinasSelecionadas: new Set() };
}

export function estadoAPartirDePermissoes(permissoes: PermissaoLinha[]): EstadoPermissoes {
  const estado = estadoVazio();
  estado.todasUsinas = permissoes.length === 0 || permissoes.some((p) => p.usinaId === null);
  estado.incluirFuturas = permissoes.some((p) => p.usinaId === null && p.incluirFuturas);
  for (const p of permissoes) {
    estado.marcadas.add(`${p.modulo}:${p.acao}`);
    if (p.usinaId) estado.usinasSelecionadas.add(p.usinaId);
  }
  return estado;
}

export function permissoesAPartirDoEstado(estado: EstadoPermissoes): Omit<PermissaoLinha, "usina">[] {
  const escopos: (string | null)[] = estado.todasUsinas ? [null] : [...estado.usinasSelecionadas];
  const resultado: Omit<PermissaoLinha, "usina">[] = [];
  for (const chave of estado.marcadas) {
    const [modulo, acao] = chave.split(":");
    for (const usinaId of escopos) {
      resultado.push({ usinaId, incluirFuturas: usinaId === null ? estado.incluirFuturas : false, modulo, acao });
    }
  }
  return resultado;
}

interface Props {
  estado: EstadoPermissoes;
  onChange: (novo: EstadoPermissoes) => void;
  usinas: { id: string; nome: string }[];
}

export function MatrizPermissoes({ estado, onChange, usinas }: Props) {
  function alternar(modulo: string, acao: string) {
    const chave = `${modulo}:${acao}`;
    const marcadas = new Set(estado.marcadas);
    if (marcadas.has(chave)) {
      marcadas.delete(chave);
      // Sem "Ver" não faz sentido manter as demais ações do módulo.
      if (acao === "visualizar") for (const c of [...marcadas]) if (c.startsWith(`${modulo}:`)) marcadas.delete(c);
    } else {
      marcadas.add(chave);
      marcadas.add(`${modulo}:visualizar`);
    }
    onChange({ ...estado, marcadas });
  }

  function alternarUsina(id: string) {
    const usinasSelecionadas = new Set(estado.usinasSelecionadas);
    if (usinasSelecionadas.has(id)) usinasSelecionadas.delete(id);
    else usinasSelecionadas.add(id);
    onChange({ ...estado, usinasSelecionadas });
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-os-azul-marinho mb-2">Usinas que o usuário pode acessar</h3>
      <div className="border border-slate-200 rounded-md p-3 mb-4">
        <label className="flex items-center gap-2 text-sm mb-1">
          <input type="radio" checked={estado.todasUsinas} onChange={() => onChange({ ...estado, todasUsinas: true })} />
          Todas as usinas
        </label>
        {estado.todasUsinas && (
          <label className="flex items-center gap-2 text-xs text-os-cinza ml-6 mb-2">
            <input type="checkbox" checked={estado.incluirFuturas} onChange={(e) => onChange({ ...estado, incluirFuturas: e.target.checked })} />
            Incluir usinas cadastradas no futuro
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={!estado.todasUsinas} onChange={() => onChange({ ...estado, todasUsinas: false })} />
          Somente as usinas selecionadas
        </label>
        {!estado.todasUsinas && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-2 ml-6">
            {usinas.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={estado.usinasSelecionadas.has(u.id)} onChange={() => alternarUsina(u.id)} />
                {u.nome}
              </label>
            ))}
          </div>
        )}
      </div>

      <h3 className="text-sm font-medium text-os-azul-marinho mb-2">O que o usuário pode acessar e fazer</h3>
      <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
        {MATRIZ.map((linha) => (
          <div key={linha.modulo} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-sm text-os-azul-marinho font-medium sm:w-48 shrink-0">{linha.rotulo}</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {linha.acoes.map((a) => (
                <label key={a.chave} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={estado.marcadas.has(`${linha.modulo}:${a.chave}`)} onChange={() => alternar(linha.modulo, a.chave)} />
                  {a.rotulo}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
