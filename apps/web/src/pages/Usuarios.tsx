import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import {
  EstadoPermissoes,
  estadoAPartirDePermissoes,
  estadoVazio,
  MatrizPermissoes,
  permissoesAPartirDoEstado,
} from "../components/usuarios/MatrizPermissoes";
import { PermissaoLinha } from "../components/usuarios/tipos";

interface UsuarioLinha {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMIN" | "USUARIO";
  ativo: boolean;
  ultimoAcesso: string | null;
  permissoes: PermissaoLinha[];
}

interface UsinaOpcao {
  id: string;
  nome: string;
}

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLinha[]>([]);
  const [usinas, setUsinas] = useState<UsinaOpcao[]>([]);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);

  // Janela de cadastro/edição: `emEdicao === null` com `modalAberto` = novo usuário.
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<UsuarioLinha | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<"ADMIN" | "USUARIO">("USUARIO");
  const [estadoPermissoes, setEstadoPermissoes] = useState<EstadoPermissoes>(estadoVazio());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    api.get<UsuarioLinha[]>("/usuarios").then(({ data }) => setUsuarios(data));
    api.get<UsinaOpcao[]>("/usinas").then(({ data }) => setUsinas(data));
  }

  useEffect(carregar, []);

  function abrirNovo() {
    setEmEdicao(null);
    setNome("");
    setEmail("");
    setPerfil("USUARIO");
    setEstadoPermissoes(estadoVazio());
    setErro(null);
    setModalAberto(true);
  }

  function abrirEdicao(usuario: UsuarioLinha) {
    setEmEdicao(usuario);
    setNome(usuario.nome);
    setEmail(usuario.email);
    setPerfil(usuario.perfil);
    setEstadoPermissoes(estadoAPartirDePermissoes(usuario.permissoes));
    setErro(null);
    setModalAberto(true);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (perfil === "USUARIO" && !estadoPermissoes.todasUsinas && estadoPermissoes.usinasSelecionadas.size === 0) {
      setErro("Selecione ao menos uma usina, ou marque \"Todas as usinas\".");
      return;
    }
    const permissoes = perfil === "USUARIO" ? permissoesAPartirDoEstado(estadoPermissoes) : [];
    setSalvando(true);
    try {
      if (emEdicao) {
        await api.put(`/usuarios/${emEdicao.id}`, { nome, email, perfil });
        await api.put(`/usuarios/${emEdicao.id}/permissoes`, { permissoes });
      } else {
        const { data } = await api.post("/usuarios", { nome, email, perfil, permissoes });
        setSenhaGerada(data.senhaTemporaria);
      }
      setModalAberto(false);
      carregar();
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível salvar o usuário.");
    } finally {
      setSalvando(false);
    }
  }

  async function redefinirSenha(id: string) {
    const { data } = await api.post(`/usuarios/${id}/redefinir-senha`);
    setSenhaGerada(data.senhaTemporaria);
  }

  async function desativar(id: string) {
    try {
      await api.post(`/usuarios/${id}/desativar`);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Erro ao desativar.");
    }
  }

  async function reativar(id: string) {
    try {
      await api.post(`/usuarios/${id}/reativar`);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Erro ao reativar.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-os-azul-marinho">Usuários e Acessos</h1>
        <button onClick={abrirNovo} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm hover:opacity-90">
          Novo usuário
        </button>
      </div>

      {senhaGerada && (
        <div className="bg-os-amarelo/20 border border-os-amarelo text-os-azul-marinho text-sm rounded-md px-4 py-3 mb-4 flex items-center justify-between gap-3">
          <span>Senha temporária gerada: <strong>{senhaGerada}</strong> (exibida apenas uma vez, comunique com segurança)</span>
          <button onClick={() => setSenhaGerada(null)} className="text-os-azul-marinho underline shrink-0">fechar</button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-os-azul-marinho text-white">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-left px-4 py-2 font-medium">E-mail</th>
              <th className="text-left px-4 py-2 font-medium">Perfil</th>
              <th className="text-left px-4 py-2 font-medium">Situação</th>
              <th className="text-left px-4 py-2 font-medium">Último acesso</th>
              <th className="text-left px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u, i) => (
              <tr key={u.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                <td className="px-4 py-2">{u.nome}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.perfil === "ADMIN" ? "Administrador" : "Usuário"}</td>
                <td className="px-4 py-2">{u.ativo ? "Ativo" : "Desativado"}</td>
                <td className="px-4 py-2 text-os-cinza">{u.ultimoAcesso ? new Date(u.ultimoAcesso).toLocaleString("pt-BR") : "Nunca acessou"}</td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  <button onClick={() => abrirEdicao(u)} className="text-os-azul-marinho underline">editar / permissões</button>
                  <button onClick={() => redefinirSenha(u.id)} className="text-os-azul-marinho underline">redefinir senha</button>
                  {u.ativo ? (
                    <button onClick={() => desativar(u.id)} className="text-os-estado-vermelho underline">desativar</button>
                  ) : (
                    <button onClick={() => reativar(u.id)} className="text-os-estado-verde underline">reativar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30 p-4">
          <form onSubmit={salvar} className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-os-azul-marinho mb-4">{emEdicao ? `Editar usuário · ${emEdicao.nome}` : "Novo usuário"}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-sm text-os-azul-marinho mb-1">Nome</label>
                <input required value={nome} onChange={(e) => setNome(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-os-azul-marinho mb-1">E-mail</label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-os-azul-marinho mb-1">Perfil</label>
                <select value={perfil} onChange={(e) => setPerfil(e.target.value as "ADMIN" | "USUARIO")} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
                  <option value="USUARIO">Usuário</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
            </div>

            {perfil === "ADMIN" ? (
              <p className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-os-cinza mb-5">
                Administradores têm acesso a todos os módulos e usinas, incluindo Usuários e Acessos, Notificações e Histórico e a área de Administração.
              </p>
            ) : (
              <div className="mb-5">
                <MatrizPermissoes estado={estadoPermissoes} onChange={setEstadoPermissoes} usinas={usinas} />
              </div>
            )}

            {!emEdicao && (
              <p className="text-os-cinza text-xs mb-4">Uma senha temporária será gerada ao salvar e exibida uma única vez.</p>
            )}
            {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModalAberto(false)} className="border border-slate-300 rounded-md px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={salvando} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm disabled:opacity-60">
                {salvando ? "Salvando..." : emEdicao ? "Salvar alterações" : "Criar usuário"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
