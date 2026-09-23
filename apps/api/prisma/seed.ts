import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@oasissolar.local";
  const senha = process.env.SEED_ADMIN_SENHA || "OasisSolar@2026";

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    console.log(`Usuário admin já existe: ${email}`);
    return;
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  await prisma.usuario.create({
    data: { nome: "Administrador", email, senhaHash, perfil: "ADMIN" },
  });

  console.log(`Usuário admin criado: ${email} / senha inicial: ${senha}`);
  console.log("Troque a senha após o primeiro acesso.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
