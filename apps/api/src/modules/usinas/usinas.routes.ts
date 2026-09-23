import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { assinaturaValida, uploadFoto, UPLOADS_DIR } from "../../lib/upload";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao, usinasAutorizadas } from "../../middleware/permissao";

// Cadastro completo (seções expansíveis: Identificação, Dados nominais, Degradação, SKIDs,
// Metas mensais) é escopo da Fase 2. Aqui: identificação básica, suficiente para o seletor de
// usina da barra superior e a lista do módulo Cadastro de Usinas.

const router = Router();
router.use(autenticar);

router.get("/", exigirPermissao("cadastro_usinas", "visualizar"), async (req, res) => {
  const permitidas = await usinasAutorizadas(req.usuario!, "cadastro_usinas", "visualizar");
  const usinas = await prisma.usina.findMany({
    where: permitidas ? { id: { in: permitidas } } : undefined,
    orderBy: { nome: "asc" },
  });
  res.json(usinas);
});

// Parâmetro nomeado ":usinaId" (não ":id") de propósito: o middleware exigirPermissao só
// reconhece esse nome para aplicar a checagem de permissão por usina específica — ver
// middleware/permissao.ts (extrairUsinaId). Usar ":id" aqui deixaria a rota sem essa checagem.
router.get("/:usinaId", exigirPermissao("cadastro_usinas", "visualizar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });
  res.json(usina);
});

const criarSchema = z.object({
  nome: z.string().min(1),
  identificadorInterno: z.string().min(1),
  municipio: z.string().optional(),
  uf: z.string().length(2).optional(),
  endereco: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  potenciaDcKwp: z.number().positive(),
  potenciaAcKw: z.number().positive().optional(),
  baseFcPadrao: z.enum(["AC", "DC"]).optional(),
  fusoHorario: z.string().optional(),
  inicioOperacao: z.coerce.date().optional(),
  planoIrradiacao: z.enum(["GHI", "POA"]).optional(),
  totalModulos: z.number().int().nonnegative().optional(),
  totalCombinerBoxes: z.number().int().nonnegative().optional(),
  totalTrackers: z.number().int().nonnegative().optional(),
  totalDispositivosAuxiliares: z.number().int().nonnegative().optional(),
});

router.post("/", exigirPermissao("cadastro_usinas", "criar"), async (req, res) => {
  const parsed = criarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const usina = await prisma.usina.create({ data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: usina.id,
    modulo: "cadastro_usinas",
    entidade: "Usina",
    entidadeId: usina.id,
    acao: "CRIACAO",
    valorNovo: parsed.data,
  });

  res.status(201).json(usina);
});

const editarSchema = criarSchema.partial().extend({
  situacao: z.enum(["IMPLANTACAO", "OPERACAO", "DESATIVADA"]).optional(),
  observacoes: z.string().optional(),
  // .nullable() além de .optional(): permite limpar a coordenada já cadastrada (enviar null),
  // não só omitir o campo — sem isso, uma vez definida, a latitude/longitude nunca poderia ser
  // apagada pela interface (só sobrescrita por outro valor não nulo).
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

router.put("/:usinaId", exigirPermissao("cadastro_usinas", "editar"), async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Usina não encontrada." });

  const usina = await prisma.usina.update({ where: { id: anterior.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: usina.id,
    modulo: "cadastro_usinas",
    entidade: "Usina",
    entidadeId: usina.id,
    acao: "EDICAO",
    valorAnterior: anterior,
    valorNovo: parsed.data,
  });

  res.json(usina);
});

router.post("/:usinaId/desativar", exigirPermissao("cadastro_usinas", "desativar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });

  // Desativar não apaga dados nem retira o histórico — apenas muda a situação cadastral.
  await prisma.usina.update({ where: { id: usina.id }, data: { situacao: "DESATIVADA" } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: usina.id,
    modulo: "cadastro_usinas",
    entidade: "Usina",
    entidadeId: usina.id,
    acao: "DESATIVACAO",
  });

  res.status(204).end();
});

// Foto principal da usina — uma por usina nesta versão (galeria é evolução futura). Salva o
// vínculo somente após sucesso do envio; substituição só apaga o arquivo antigo depois que o
// novo já está gravado (atômico o suficiente para não perder a foto anterior em caso de falha).
router.post(
  "/:usinaId/foto",
  exigirPermissao("cadastro_usinas", "editar"),
  uploadFoto.single("foto"),
  async (req, res) => {
    const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
    if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });
    if (!req.file) return res.status(400).json({ erro: "Nenhum arquivo enviado." });

    const buffer = fs.readFileSync(req.file.path);
    if (!assinaturaValida(buffer, req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ erro: "Arquivo não corresponde a uma imagem JPG, PNG ou WebP válida." });
    }

    const fotoAnterior = usina.fotoUrl;
    await prisma.usina.update({ where: { id: usina.id }, data: { fotoUrl: `/uploads/${req.file.filename}` } });

    if (fotoAnterior) {
      const caminhoAnterior = path.join(UPLOADS_DIR, path.basename(fotoAnterior));
      fs.rm(caminhoAnterior, { force: true }, () => {});
    }

    await registrarAuditoria({
      usuarioId: req.usuario!.id,
      usinaId: usina.id,
      modulo: "cadastro_usinas",
      entidade: "Usina",
      entidadeId: usina.id,
      acao: "EDICAO",
      campo: "fotoUrl",
      valorAnterior: fotoAnterior,
      valorNovo: `/uploads/${req.file.filename}`,
    });

    res.json({ fotoUrl: `/uploads/${req.file.filename}` });
  }
);

router.delete("/:usinaId/foto", exigirPermissao("cadastro_usinas", "editar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });
  if (!usina.fotoUrl) return res.status(204).end();

  const caminho = path.join(UPLOADS_DIR, path.basename(usina.fotoUrl));
  fs.rm(caminho, { force: true }, () => {});
  await prisma.usina.update({ where: { id: usina.id }, data: { fotoUrl: null } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: usina.id,
    modulo: "cadastro_usinas",
    entidade: "Usina",
    entidadeId: usina.id,
    acao: "EDICAO",
    campo: "fotoUrl",
    valorAnterior: usina.fotoUrl,
    valorNovo: null,
  });

  res.status(204).end();
});

export default router;
