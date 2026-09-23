import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useFiltros } from "../context/FiltrosContext";
import { formatarDataBr } from "../lib/formatarData";

interface Usina {
  id: string;
  nome: string;
  identificadorInterno: string;
  municipio: string | null;
  uf: string | null;
  potenciaDcKwp: number;
  inicioOperacao: string | null;
  situacao: string;
}

export function CadastroUsinas() {
  const { temPermissao } = useAuth();
  const { setUsinaAtivaId } = useFiltros();
  const navigate = useNavigate();
  const [usinas, setUsinas] = useState<Usina[]>([]);
  const [carregando, setCarregando] = useState(true);

  // O Painel Principal é sempre dirigido pelo filtro "Usina ativa" da barra superior — este link
  // só define o filtro e navega para lá, em vez de abrir uma página própria por usina.
  function abrirNoPainel(usinaId: string) {
    setUsinaAtivaId(usinaId);
    navigate("/painel");
  }

  function carregar() {
    setCarregando(true);
    api
      .get<Usina[]>("/usinas")
      .then(({ data }) => setUsinas(data))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  const podeCriar = temPermissao("cadastro_usinas", "criar");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-os-azul-marinho">Cadastro de Usinas</h1>
        {podeCriar && (
          <Link to="/usinas/nova" className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm hover:opacity-90">
            Cadastrar usina
          </Link>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-os-azul-marinho text-white">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-left px-4 py-2 font-medium">Município/UF</th>
              <th className="text-left px-4 py-2 font-medium">Potência (MWp)</th>
              <th className="text-left px-4 py-2 font-medium">Início operação</th>
              <th className="text-left px-4 py-2 font-medium">Situação</th>
              <th className="text-left px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td colSpan={6} className="px-4 py-4 text-os-cinza">Carregando...</td></tr>
            )}
            {!carregando && usinas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-4 text-os-cinza">Nenhuma usina cadastrada.</td></tr>
            )}
            {usinas.map((u, i) => (
              <tr key={u.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                <td className="px-4 py-2">{u.nome}</td>
                <td className="px-4 py-2">{u.municipio ? `${u.municipio}/${u.uf}` : "—"}</td>
                <td className="px-4 py-2">{(u.potenciaDcKwp / 1000).toFixed(3)}</td>
                <td className="px-4 py-2">{u.inicioOperacao ? formatarDataBr(u.inicioOperacao) : "—"}</td>
                <td className="px-4 py-2">{u.situacao}</td>
                <td className="px-4 py-2 space-x-3">
                  <button onClick={() => abrirNoPainel(u.id)} className="text-os-azul-marinho underline">
                    painel
                  </button>
                  <Link to={`/usinas/${u.id}/configuracoes`} className="text-os-azul-marinho underline">
                    editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
