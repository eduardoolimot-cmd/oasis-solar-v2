import fs from "node:fs";
import path from "node:path";
import multer from "multer";

export const UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB, conforme especificação

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const extensao = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extensao}`);
  },
});

export const uploadFoto = multer({
  storage,
  limits: { fileSize: TAMANHO_MAXIMO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!TIPOS_ACEITOS.includes(file.mimetype)) {
      cb(new Error("Formato inválido. Aceitos: JPG, PNG ou WebP."));
      return;
    }
    cb(null, true);
  },
});

/// Confere a assinatura binária real do arquivo (não apenas o cabeçalho Content-Type informado
/// pelo navegador) — "Validar formato real e tamanho" (especificação, seção Fotos).
export function assinaturaValida(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 12) return false;
  if (mimetype === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === "image/png") {
    const assinaturaPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return assinaturaPng.every((byte, i) => buffer[i] === byte);
  }
  if (mimetype === "image/webp") {
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}
