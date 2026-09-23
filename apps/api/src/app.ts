import cors from "cors";
import express from "express";
import authRoutes from "./modules/auth/auth.routes";
import alertasRoutes from "./modules/auditoria/alertas.routes";
import auditoriaRoutes from "./modules/auditoria/auditoria.routes";
import climaRoutes from "./modules/usinas/clima.routes";
import adminRoutes from "./modules/admin/admin.routes";
import produtividadeRoutes from "./modules/usinas/produtividade.routes";
import degradacaoRoutes from "./modules/usinas/degradacao.routes";
import disponibilidadeRoutes from "./modules/usinas/disponibilidade.routes";
import estoqueRoutes from "./modules/estoque/estoque.routes";
import fcRoutes from "./modules/usinas/fc.routes";
import financeiroRoutes from "./modules/financeiro/financeiro.routes";
import geracaoBrutaRoutes from "./modules/usinas/geracaoBruta.routes";
import inversoresRoutes from "./modules/usinas/inversores.routes";
import irradiacaoRoutes from "./modules/usinas/irradiacao.routes";
import lancamentosRoutes from "./modules/lancamentos/lancamentos.routes";
import eventosRoutes from "./modules/manutencao/eventos.routes";
import ordensServicoRoutes from "./modules/manutencao/ordensServico.routes";
import preventivasRoutes from "./modules/manutencao/preventivas.routes";
import painelRoutes from "./modules/painel/painel.routes";
import prRoutes from "./modules/usinas/pr.routes";
import previsoesRoutes from "./modules/usinas/previsoes.routes";
import previsoesSkidRoutes from "./modules/usinas/previsoesSkid.routes";
import relatoriosRoutes from "./modules/relatorios/relatorios.routes";
import skidsRoutes from "./modules/usinas/skids.routes";
import uploadsRoutes from "./modules/uploads/uploads.routes";
import usinasRoutes from "./modules/usinas/usinas.routes";
import usuariosRoutes from "./modules/usuarios/usuarios.routes";

export function criarApp() {
  const app = express();

  // exposedHeaders: Content-Disposition precisa ser legível pelo JS do frontend para nomear o
  // arquivo baixado (relatórios, exportações) — sem isso o navegador expõe o header só ao próprio
  // <a download>, não ao código que lê a resposta antes de disparar o download.
  app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173", exposedHeaders: ["Content-Disposition"] }));
  app.use(express.json());

  app.get("/api/saude", (_req, res) => res.json({ ok: true, sistema: "OASIS SOLAR" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/usuarios", usuariosRoutes);
  app.use("/api/usinas", usinasRoutes);
  app.use("/api/usinas", skidsRoutes);
  app.use("/api/usinas", inversoresRoutes);
  app.use("/api/usinas", degradacaoRoutes);
  app.use("/api/usinas", previsoesRoutes);
  app.use("/api/usinas", previsoesSkidRoutes);
  app.use("/api/usinas", lancamentosRoutes);
  app.use("/api/usinas", geracaoBrutaRoutes);
  app.use("/api/usinas", climaRoutes);
  app.use("/api/usinas", produtividadeRoutes);
  app.use("/api/usinas", prRoutes);
  app.use("/api/usinas", fcRoutes);
  app.use("/api/usinas", irradiacaoRoutes);
  app.use("/api/usinas", disponibilidadeRoutes);
  app.use("/api/usinas", eventosRoutes);
  app.use("/api/usinas", ordensServicoRoutes);
  app.use("/api/usinas", preventivasRoutes);
  app.use("/api/usinas", financeiroRoutes);
  app.use("/api/usinas", relatoriosRoutes);
  app.use("/api/estoque", estoqueRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/uploads", uploadsRoutes);
  app.use("/api/painel", painelRoutes);
  app.use("/api/auditoria", auditoriaRoutes);
  app.use("/api/auditoria", alertasRoutes);

  app.use((_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ erro: "Erro interno do servidor." });
  });

  return app;
}
