import "dotenv/config";
import { criarApp } from "./app";

const PORT = Number(process.env.PORT) || 3333;
const app = criarApp();

app.listen(PORT, () => {
  console.log(`OASIS SOLAR API rodando em http://localhost:${PORT}`);
});
