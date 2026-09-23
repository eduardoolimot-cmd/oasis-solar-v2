import path from "node:path";
import { Router } from "express";
import { UPLOADS_DIR } from "../../lib/upload";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { usinasAutorizadas } from "../../middleware/permissao";

// Servido via rota autenticada (não express.static público): "Acesso aos arquivos deve respeitar
// os mesmos limites do cadastro e da usina" (especificação, seção Fotos). Um arquivo em /uploads
// pode ser a foto de uma usina, a imagem de um item do catálogo (global, compartilhado entre
// usinas) ou uma foto de Ordem de Serviço — cada origem tem sua própria regra de permissão.
const router = Router();
router.use(autenticar);

router.get("/:arquivo", async (req, res) => {
  const url = `/uploads/${req.params.arquivo}`;

  const usina = await prisma.usina.findFirst({ where: { fotoUrl: url } });
  if (usina) {
    const permitidas = await usinasAutorizadas(req.usuario!, "cadastro_usinas", "visualizar");
    if (permitidas && !permitidas.includes(usina.id)) return res.status(403).json({ erro: "Sem permissão para este arquivo." });
    return res.sendFile(path.join(UPLOADS_DIR, req.params.arquivo));
  }

  const item = await prisma.itemCatalogo.findFirst({ where: { imagemUrl: url } });
  if (item) {
    const permitidas = await usinasAutorizadas(req.usuario!, "estoque", "visualizar");
    if (permitidas && permitidas.length === 0) return res.status(403).json({ erro: "Sem permissão para este arquivo." });
    return res.sendFile(path.join(UPLOADS_DIR, req.params.arquivo));
  }

  const fotoOs = await prisma.fotoOrdemServico.findFirst({ where: { url }, select: { ordemServico: { select: { usinaId: true } } } });
  if (fotoOs) {
    const permitidas = await usinasAutorizadas(req.usuario!, "manutencao", "visualizar");
    if (permitidas && !permitidas.includes(fotoOs.ordemServico.usinaId)) return res.status(403).json({ erro: "Sem permissão para este arquivo." });
    return res.sendFile(path.join(UPLOADS_DIR, req.params.arquivo));
  }

  res.status(404).json({ erro: "Arquivo não encontrado." });
});

export default router;
