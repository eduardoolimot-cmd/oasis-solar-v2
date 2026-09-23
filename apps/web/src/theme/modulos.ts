import {
  BarChart3,
  Bell,
  Factory,
  FileText,
  LayoutDashboard,
  LucideIcon,
  PencilLine,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

// Ordem fixa do menu lateral — ver Especificação, seção "Navegação e funcionamento geral".
// Itens "somenteAdmin" aparecem apenas ao administrador (Notificações e Histórico, Usuários e
// Acessos e Administração).

export interface ItemMenu {
  chave: string;
  rotulo: string;
  rota: string;
  icone: LucideIcon;
  somenteAdmin?: boolean;
}

export const ITENS_MENU: ItemMenu[] = [
  { chave: "painel", rotulo: "Painel Principal", rota: "/painel", icone: LayoutDashboard },
  { chave: "cadastro_usinas", rotulo: "Cadastro de Usinas", rota: "/usinas", icone: Factory },
  { chave: "lancamentos", rotulo: "Lançamento de Dados", rota: "/lancamentos", icone: PencilLine },
  { chave: "manutencao", rotulo: "Manutenção e Estoque", rota: "/manutencao", icone: Wrench },
  { chave: "financeiro", rotulo: "Financeiro", rota: "/financeiro", icone: Wallet },
  { chave: "comparativo", rotulo: "Comparativo", rota: "/comparativo", icone: BarChart3 },
  { chave: "ranking", rotulo: "Ranking de Ativos", rota: "/ranking", icone: Trophy },
  { chave: "relatorios", rotulo: "Relatórios", rota: "/relatorios", icone: FileText },
  { chave: "notificacoes", rotulo: "Notificações e Histórico", rota: "/notificacoes", icone: Bell, somenteAdmin: true },
  { chave: "usuarios", rotulo: "Usuários e Acessos", rota: "/usuarios", icone: Users, somenteAdmin: true },
  { chave: "administracao", rotulo: "Administração", rota: "/administracao", icone: ShieldCheck, somenteAdmin: true },
];
