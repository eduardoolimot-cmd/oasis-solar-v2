import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useFiltros } from "../context/FiltrosContext";
import { formatarDataBr } from "../lib/formatarData";

interface Inversor {
  id: string;
  identificacao: string;
}

interface Skid {
  id: string;
  nome: string;
  inversores: Inversor[];
}

interface UsinaResumo {
  id: string;
  nome: string;
}

interface LancamentoGeracao {
  id: string;
  data: string;
  energiaKwh: number;
  origem: string | null;
  skid: { id: string; nome: string } | null;
  inversor: { id: string; identificacao: string } | null;
}

interface LancamentoIrradiacao {
  id: string;
  data: string;
  irradiacaoKwhM2: number;
  plano: string | null;
  skid: { id: string; nome: string } | null;
}

interface Fechamento {
  mes: number;
  situacao: "PARCIAL" | "FECHADO";
}

// Uma linha da tabela = um lançamento de geração (data + SKID + inversor) com a irradiação do dia ao
// lado. Dias que só têm irradiação lançada aparecem como linha própria, sem geração.
interface Linha {
  chave: string;
  dia: string;
  skidNome: string;
  inversorNome: string;
  geracao: LancamentoGeracao | null;
  irradiacao: LancamentoIrradiacao | null;
  irradiacaoCompartilhada: boolean;
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const LIMITE_LISTA = 500;

const campo = "w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm";
const campoNumero = "w-28 border border-slate-300 rounded px-2 py-1.5 text-sm text-right";

function mensagemDeErro(err: unknown, padrao: string) {
  return (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || padrao;
}

function numeroValido(texto: string): number | null {
  if (texto.trim() === "") return null;
  const valor = Number(texto);
  return Number.isNaN(valor) || valor < 0 ? null : valor;
}

/// Número de uma célula colada do Excel: aceita tanto "1234.56" quanto o formato PT-BR "1234,56"
/// ou "1.234,56" (milhar com ponto, decimal com vírgula).
function parseNumeroColado(texto: string): number | null {
  let limpo = texto.trim();
  if (limpo === "") return null;
  if (limpo.includes(",") && limpo.includes(".")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  else if (limpo.includes(",")) limpo = limpo.replace(",", ".");
  const valor = Number(limpo);
  return Number.isNaN(valor) || valor < 0 ? null : valor;
}

function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function LancamentoDados() {
  const { usinaAtivaId, setUsinaAtivaId, ano } = useFiltros();
  const [usinas, setUsinas] = useState<UsinaResumo[]>([]);
  const [skids, setSkids] = useState<Skid[]>([]);
  const [naoAtribuidos, setNaoAtribuidos] = useState<Inversor[]>([]);
  const [geracoes, setGeracoes] = useState<LancamentoGeracao[]>([]);
  const [irradiacoes, setIrradiacoes] = useState<LancamentoIrradiacao[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);

  // Linha de novo lançamento (primeira linha da tabela).
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [skidId, setSkidId] = useState("");
  const [inversorId, setInversorId] = useState("");
  const [energiaKwh, setEnergiaKwh] = useState("");
  const [irradiacaoKwhM2, setIrradiacaoKwhM2] = useState("");
  const [irradiacaoDoDia, setIrradiacaoDoDia] = useState<number | null>(null);
  const irradiacaoPreenchidaAuto = useRef(false);
  const campoGeracaoRef = useRef<HTMLInputElement>(null);
  const [salvando, setSalvando] = useState(false);
  const [colando, setColando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const { temPermissao } = useAuth();
  const podeCriar = temPermissao("lancamentos", "criar");
  const podeEditar = temPermissao("lancamentos", "editar");
  const podeExcluir = temPermissao("lancamentos", "cancelar");

  // Filtros da tabela (independentes da linha de novo lançamento).
  const [filtroInicio, setFiltroInicio] = useState(`${ano}-01-01`);
  const [filtroFim, setFiltroFim] = useState(`${ano}-12-31`);
  const [filtroSkid, setFiltroSkid] = useState("");
  const [filtroInversor, setFiltroInversor] = useState("");

  // Edição da linha: só os valores (kWh e kWh/m²); data/SKID/inversor identificam o lançamento —
  // para mudá-los, exclui-se a linha e lança-se de novo.
  const [editando, setEditando] = useState<{ chave: string; geracao: string; irradiacao: string } | null>(null);

  useEffect(() => {
    api.get<UsinaResumo[]>("/usinas").then(({ data }) => setUsinas(data));
  }, []);

  useEffect(() => {
    setFiltroInicio(`${ano}-01-01`);
    setFiltroFim(`${ano}-12-31`);
  }, [ano]);

  useEffect(() => {
    setFiltroSkid("");
    setFiltroInversor("");
    setEditando(null);
  }, [usinaAtivaId]);

  function carregarListas() {
    if (!usinaAtivaId) return;
    const periodo = { inicio: filtroInicio || undefined, fim: filtroFim || undefined };
    api
      .get(`/usinas/${usinaAtivaId}/lancamentos/geracao`, { params: { ...periodo, skidId: filtroSkid || undefined, inversorId: filtroInversor || undefined } })
      .then(({ data }) => setGeracoes(data));
    // Irradiação é do dia (usina inteira): busca sem filtro de SKID para aparecer ao lado de qualquer linha.
    api.get(`/usinas/${usinaAtivaId}/lancamentos/irradiacao`, { params: periodo }).then(({ data }) => setIrradiacoes(data));
  }

  function carregar() {
    if (!usinaAtivaId) return;
    api.get(`/usinas/${usinaAtivaId}/skids`).then(({ data }) => {
      setSkids(data.skids);
      setNaoAtribuidos(data.naoAtribuidos);
    });
    api.get(`/usinas/${usinaAtivaId}/fechamento`, { params: { ano } }).then(({ data }) => setFechamentos(data));
    carregarListas();
  }

  useEffect(carregar, [usinaAtivaId, ano]);
  useEffect(carregarListas, [usinaAtivaId, filtroInicio, filtroFim, filtroSkid, filtroInversor]);

  // Irradiação é lançada uma vez por dia (nível "geral" da usina) — se o dia escolhido já tem uma,
  // a linha de novo lançamento já vem com esse valor (evita sobrescrever com um número diferente ao
  // lançar a geração de outro inversor no mesmo dia).
  async function buscarIrradiacaoDoDia(diaConsultado: string, cancelado: () => boolean = () => false) {
    if (!usinaAtivaId || !diaConsultado) {
      setIrradiacaoDoDia(null);
      return;
    }
    const { data: lancamentos } = await api.get<LancamentoIrradiacao[]>(`/usinas/${usinaAtivaId}/lancamentos/irradiacao`, {
      params: { inicio: diaConsultado, fim: diaConsultado },
    });
    if (cancelado()) return;
    const geral = lancamentos.find((l) => l.skid === null);
    setIrradiacaoDoDia(geral ? geral.irradiacaoKwhM2 : null);
    if (geral) {
      setIrradiacaoKwhM2(String(geral.irradiacaoKwhM2));
      irradiacaoPreenchidaAuto.current = true;
    } else if (irradiacaoPreenchidaAuto.current) {
      setIrradiacaoKwhM2("");
      irradiacaoPreenchidaAuto.current = false;
    }
  }

  useEffect(() => {
    let cancelado = false;
    buscarIrradiacaoDoDia(data, () => cancelado);
    return () => {
      cancelado = true;
    };
  }, [usinaAtivaId, data]);

  const inversoresDoSkid = skidId ? skids.find((s) => s.id === skidId)?.inversores ?? [] : naoAtribuidos;
  const inversoresDoFiltro = filtroSkid ? skids.find((s) => s.id === filtroSkid)?.inversores ?? [] : skids.flatMap((s) => s.inversores);

  async function adicionar() {
    if (!usinaAtivaId || !podeCriar) return;
    setErro(null);
    setMensagem(null);
    if (!data) return setErro("Informe a data.");
    const energia = numeroValido(energiaKwh);
    const irradiacao = numeroValido(irradiacaoKwhM2);
    if (energiaKwh.trim() === "" && irradiacaoKwhM2.trim() === "") return setErro("Informe a geração e/ou a irradiação.");
    if (energiaKwh.trim() !== "" && energia === null) return setErro("Geração inválida: informe um número maior ou igual a zero.");
    if (irradiacaoKwhM2.trim() !== "" && irradiacao === null) return setErro("Irradiação inválida: informe um número maior ou igual a zero.");

    setSalvando(true);
    try {
      if (energia !== null) {
        await api.post(`/usinas/${usinaAtivaId}/lancamentos/geracao`, { skidId: skidId || null, inversorId: inversorId || null, data, energiaKwh: energia });
      }
      // Só grava a irradiação se ela é nova ou mudou — não gera registro de edição à toa.
      if (irradiacao !== null && irradiacao !== irradiacaoDoDia) {
        await api.post(`/usinas/${usinaAtivaId}/lancamentos/irradiacao`, { skidId: null, data, irradiacaoKwhM2: irradiacao, plano: "POA" });
      }
      setEnergiaKwh("");
      // Para lançar vários inversores do mesmo SKID em sequência: já avança para o próximo.
      if (inversorId) {
        const indice = inversoresDoSkid.findIndex((i) => i.id === inversorId);
        setInversorId(inversoresDoSkid[indice + 1]?.id ?? "");
      }
      setMensagem("Lançamento adicionado à tabela.");
      carregarListas();
      buscarIrradiacaoDoDia(data);
      campoGeracaoRef.current?.focus();
    } catch (err: unknown) {
      setErro(mensagemDeErro(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  }

  // Colar uma ou duas colunas copiadas do Excel (várias linhas) no campo de Geração ou Irradiação
  // da linha de novo lançamento: cada linha colada vira um lançamento, em dias consecutivos a
  // partir da "Data" selecionada (1ª linha = a própria data, 2ª linha = dia seguinte, e assim por
  // diante) — mesmo SKID/Inversor já escolhidos no formulário. Duas colunas coladas (separadas por
  // tabulação, como o Excel copia um intervalo de células) alimentam geração e irradiação ao mesmo
  // tempo, nessa ordem — mesma ordem das colunas da própria tabela — não importa em qual dos dois
  // campos a colagem foi feita. Uma coluna só alimenta apenas o campo onde a colagem ocorreu (não
  // muda o outro). Célula em branco pula aquele dia/campo (sem desalinhar as datas seguintes);
  // célula com texto que não é número cancela a colagem inteira (nunca lança "o que der certo" e
  // deixa o resto silenciosamente errado ou desalinhado).
  async function colarColuna(campoAlvo: "geracao" | "irradiacao", linhasColadas: string[]) {
    if (!usinaAtivaId || !podeCriar) return;
    if (!data) return setErro("Informe a data antes de colar.");

    const linhas = linhasColadas.map((linhaTexto, i) => {
      const celulas = linhaTexto.split("\t").map((c) => c.trim());
      const duasColunas = celulas.length >= 2;
      const geracaoTexto = duasColunas ? celulas[0] : campoAlvo === "geracao" ? celulas[0] : "";
      const irradiacaoTexto = duasColunas ? celulas[1] : campoAlvo === "irradiacao" ? celulas[0] : "";
      return {
        dia: i,
        geracaoTexto,
        geracaoValor: geracaoTexto === "" ? null : parseNumeroColado(geracaoTexto),
        irradiacaoTexto,
        irradiacaoValor: irradiacaoTexto === "" ? null : parseNumeroColado(irradiacaoTexto),
      };
    });

    const primeiraInvalida = linhas.find(
      (l) => (l.geracaoTexto !== "" && l.geracaoValor === null) || (l.irradiacaoTexto !== "" && l.irradiacaoValor === null)
    );
    if (primeiraInvalida) {
      const textoInvalido = primeiraInvalida.geracaoValor === null && primeiraInvalida.geracaoTexto !== "" ? primeiraInvalida.geracaoTexto : primeiraInvalida.irradiacaoTexto;
      return setErro(
        `Colagem cancelada: valor inválido na linha ${primeiraInvalida.dia + 1} da cópia ("${textoInvalido}", dia ${formatarDataBr(somarDias(data, primeiraInvalida.dia))}). Corrija na planilha e cole novamente.`
      );
    }
    const totalGeracao = linhas.filter((l) => l.geracaoValor !== null).length;
    const totalIrradiacao = linhas.filter((l) => l.irradiacaoValor !== null).length;
    if (totalGeracao === 0 && totalIrradiacao === 0) return setErro("Nada para colar: todas as linhas copiadas estão em branco.");

    setErro(null);
    setMensagem(null);
    setColando(true);
    try {
      const operacoes: { tipo: "geracao" | "irradiacao"; promessa: Promise<unknown> }[] = [];
      for (const l of linhas) {
        const diaAlvo = somarDias(data, l.dia);
        if (l.geracaoValor !== null) {
          operacoes.push({
            tipo: "geracao",
            promessa: api.post(`/usinas/${usinaAtivaId}/lancamentos/geracao`, { skidId: skidId || null, inversorId: inversorId || null, data: diaAlvo, energiaKwh: l.geracaoValor }),
          });
        }
        if (l.irradiacaoValor !== null) {
          operacoes.push({
            tipo: "irradiacao",
            promessa: api.post(`/usinas/${usinaAtivaId}/lancamentos/irradiacao`, { skidId: null, data: diaAlvo, irradiacaoKwhM2: l.irradiacaoValor, plano: "POA" }),
          });
        }
      }
      const resultados = await Promise.allSettled(operacoes.map((o) => o.promessa));
      const falhas = resultados
        .map((r, i) => ({ r, tipo: operacoes[i].tipo }))
        .filter((x): x is { r: PromiseRejectedResult; tipo: "geracao" | "irradiacao" } => x.r.status === "rejected");
      const diaFinal = formatarDataBr(somarDias(data, linhas[linhas.length - 1].dia));
      const partes = [
        totalGeracao > 0 ? `${totalGeracao} de geração` : null,
        totalIrradiacao > 0 ? `${totalIrradiacao} de irradiação` : null,
      ].filter((p): p is string => p !== null);
      if (falhas.length === 0) {
        setMensagem(`Lançamentos criados (${partes.join(", ")}) — de ${formatarDataBr(data)} a ${diaFinal}.`);
      } else {
        setErro(`${falhas.length} lançamento(s) falharam ao colar (${falhas[0].tipo === "geracao" ? "geração" : "irradiação"}) — ${mensagemDeErro(falhas[0].r.reason, "erro desconhecido")}`);
      }
      carregarListas();
      buscarIrradiacaoDoDia(data);
    } finally {
      setColando(false);
    }
  }

  // Só intercepta quando a colagem tem mais de uma linha (uma coluna copiada) — colar um valor só
  // segue o comportamento normal do campo.
  function aoColar(campoAlvo: "geracao" | "irradiacao") {
    return (e: ClipboardEvent<HTMLInputElement>) => {
      const texto = e.clipboardData.getData("text/plain");
      let linhas = texto.split(/\r\n|\r|\n/);
      if (linhas.length > 1 && linhas[linhas.length - 1].trim() === "") linhas = linhas.slice(0, -1); // 1 quebra de linha final = só o fim da cópia
      if (linhas.length <= 1 && !linhas[0]?.includes("\t")) return;
      e.preventDefault();
      colarColuna(campoAlvo, linhas);
    };
  }

  function teclaNovaLinha(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      adicionar();
    }
  }

  const linhas = useMemo<Linha[]>(() => {
    const geralPorDia = new Map<string, LancamentoIrradiacao>();
    const porSkidDia = new Map<string, LancamentoIrradiacao>();
    irradiacoes.forEach((l) => {
      const dia = l.data.slice(0, 10);
      if (l.skid) porSkidDia.set(`${dia}|${l.skid.id}`, l);
      else geralPorDia.set(dia, l);
    });

    const usadas = new Set<string>();
    const resultado: Linha[] = geracoes.map((g) => {
      const dia = g.data.slice(0, 10);
      let irradiacao: LancamentoIrradiacao | null = null;
      let compartilhada = false;
      if (g.skid && !g.inversor) irradiacao = porSkidDia.get(`${dia}|${g.skid.id}`) ?? null;
      if (!irradiacao) {
        irradiacao = geralPorDia.get(dia) ?? null;
        compartilhada = irradiacao !== null;
      }
      if (irradiacao) usadas.add(irradiacao.id);
      return {
        chave: `g:${g.id}`,
        dia,
        skidNome: g.skid?.nome ?? "Usina",
        inversorNome: g.inversor?.identificacao ?? "—",
        geracao: g,
        irradiacao,
        irradiacaoCompartilhada: compartilhada,
      };
    });

    // Com filtro de SKID/inversor ativo, dias só com irradiação não pertencem a nenhum recorte.
    if (!filtroSkid && !filtroInversor) {
      irradiacoes
        .filter((l) => !usadas.has(l.id))
        .forEach((l) =>
          resultado.push({
            chave: `i:${l.id}`,
            dia: l.data.slice(0, 10),
            skidNome: l.skid?.nome ?? "Usina",
            inversorNome: "—",
            geracao: null,
            irradiacao: l,
            irradiacaoCompartilhada: false,
          })
        );
    }

    return resultado.sort((a, b) => b.dia.localeCompare(a.dia) || a.skidNome.localeCompare(b.skidNome) || a.inversorNome.localeCompare(b.inversorNome, undefined, { numeric: true }));
  }, [geracoes, irradiacoes, filtroSkid, filtroInversor]);

  function iniciarEdicao(linha: Linha) {
    setEditando({
      chave: linha.chave,
      geracao: linha.geracao ? String(linha.geracao.energiaKwh) : "",
      irradiacao: linha.irradiacao ? String(linha.irradiacao.irradiacaoKwhM2) : "",
    });
  }

  async function salvarEdicao(linha: Linha) {
    if (!usinaAtivaId || !editando) return;
    const operacoes: Promise<unknown>[] = [];
    if (linha.geracao) {
      const valor = numeroValido(editando.geracao);
      if (valor === null) return alert("Geração inválida: informe um número maior ou igual a zero.");
      if (valor !== linha.geracao.energiaKwh) operacoes.push(api.put(`/usinas/${usinaAtivaId}/lancamentos/geracao/${linha.geracao.id}`, { energiaKwh: valor }));
    }
    const valorIrradiacao = numeroValido(editando.irradiacao);
    if (linha.irradiacao) {
      if (valorIrradiacao === null) return alert("Irradiação inválida: informe um número maior ou igual a zero (para remover o lançamento, exclua a linha).");
      if (valorIrradiacao !== linha.irradiacao.irradiacaoKwhM2) operacoes.push(api.put(`/usinas/${usinaAtivaId}/lancamentos/irradiacao/${linha.irradiacao.id}`, { irradiacaoKwhM2: valorIrradiacao }));
    } else if (editando.irradiacao.trim() !== "") {
      // Dia ainda sem irradiação lançada: preencher na edição cria o lançamento do dia.
      if (valorIrradiacao === null) return alert("Irradiação inválida: informe um número maior ou igual a zero.");
      operacoes.push(api.post(`/usinas/${usinaAtivaId}/lancamentos/irradiacao`, { skidId: null, data: linha.dia, irradiacaoKwhM2: valorIrradiacao, plano: "POA" }));
    }
    setMensagem(null);
    try {
      await Promise.all(operacoes);
      setEditando(null);
      carregarListas();
      buscarIrradiacaoDoDia(data);
    } catch (err: unknown) {
      alert(mensagemDeErro(err, "Não foi possível salvar a edição."));
    }
  }

  // Exclui o lançamento de geração da linha; a irradiação do dia só é excluída em linhas sem geração
  // (ela é compartilhada pelas demais linhas do mesmo dia).
  async function excluirLinha(linha: Linha) {
    if (!usinaAtivaId) return;
    const alvo = linha.geracao ? { tipo: "geracao", id: linha.geracao.id } : linha.irradiacao ? { tipo: "irradiacao", id: linha.irradiacao.id } : null;
    if (!alvo) return;
    if (!confirm("Excluir esta linha? A exclusão fica registrada no histórico.")) return;
    setMensagem(null);
    try {
      await api.delete(`/usinas/${usinaAtivaId}/lancamentos/${alvo.tipo}/${alvo.id}`);
      carregarListas();
      buscarIrradiacaoDoDia(data);
    } catch (err: unknown) {
      alert(mensagemDeErro(err, "Não foi possível excluir."));
    }
  }

  async function alternarFechamento(mes: number, situacaoAtual: "PARCIAL" | "FECHADO" | undefined) {
    if (!usinaAtivaId) return;
    const novaSituacao = situacaoAtual === "FECHADO" ? "PARCIAL" : "FECHADO";
    await api.put(`/usinas/${usinaAtivaId}/fechamento`, { ano, mes, situacao: novaSituacao });
    carregar();
  }

  if (!usinaAtivaId) {
    return <p className="text-os-cinza text-sm">Selecione uma usina na barra superior para lançar dados.</p>;
  }

  const temAcoes = podeEditar || podeExcluir;
  const filtrosAtivos = filtroSkid || filtroInversor;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-1">Lançamento de Dados</h1>
      <p className="text-os-cinza text-sm mb-4">
        Preencha a linha destacada no topo da tabela e tecle Enter para adicionar. Também dá para colar do Excel nos campos de Geração ou Irradiação: uma coluna colada vira um lançamento por linha, em dias consecutivos a partir da Data selecionada; colando duas colunas juntas (geração e irradiação lado a lado), os dois campos são preenchidos ao mesmo tempo. Para corrigir, use editar/excluir na própria linha — edições preservam o valor anterior no histórico.
      </p>

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <div className="col-span-2">
          <label className="block text-xs text-os-azul-marinho mb-1">Usina</label>
          <select
            value={usinaAtivaId ?? ""}
            onChange={(e) => {
              setUsinaAtivaId(e.target.value || null);
              setSkidId("");
              setInversorId("");
            }}
            className={campo}
          >
            {usinas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-os-azul-marinho mb-1">De</label>
          <input type="date" value={filtroInicio} onChange={(e) => setFiltroInicio(e.target.value)} className={campo} />
        </div>
        <div>
          <label className="block text-xs text-os-azul-marinho mb-1">Até</label>
          <input type="date" value={filtroFim} onChange={(e) => setFiltroFim(e.target.value)} className={campo} />
        </div>
        <div>
          <label className="block text-xs text-os-azul-marinho mb-1">Filtrar SKID</label>
          <select
            value={filtroSkid}
            onChange={(e) => {
              setFiltroSkid(e.target.value);
              setFiltroInversor("");
            }}
            className={campo}
          >
            <option value="">Todos</option>
            {skids.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-os-azul-marinho mb-1">Filtrar inversor</label>
          <select value={filtroInversor} onChange={(e) => setFiltroInversor(e.target.value)} className={campo}>
            <option value="">Todos</option>
            {inversoresDoFiltro.map((i) => <option key={i.id} value={i.id}>{i.identificacao}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-os-azul-marinho font-medium text-sm">
          Lançamentos ({linhas.length}{geracoes.length >= LIMITE_LISTA || irradiacoes.length >= LIMITE_LISTA ? "+" : ""})
        </h2>
        <button
          type="button"
          onClick={() => {
            setFiltroInicio(`${ano}-01-01`);
            setFiltroFim(`${ano}-12-31`);
            setFiltroSkid("");
            setFiltroInversor("");
          }}
          className="border border-slate-300 text-os-cinza rounded-md px-3 py-1 text-xs"
        >
          Limpar filtros
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-auto max-h-[640px] mb-2">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">SKID</th>
              <th className="text-left px-3 py-2 font-medium">Inversor</th>
              <th className="text-right px-3 py-2 font-medium">Geração realizada (kWh)</th>
              <th className="text-right px-3 py-2 font-medium">Irradiação realizada (kWh/m²)</th>
              {(temAcoes || podeCriar) && <th className="px-3 py-2 w-40"></th>}
            </tr>
          </thead>
          <tbody>
            {podeCriar && (
              <tr className="bg-os-amarelo/20 border-y border-slate-200 align-top">
                <td className="px-3 py-2">
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} onKeyDown={teclaNovaLinha} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={skidId}
                    onChange={(e) => {
                      setSkidId(e.target.value);
                      setInversorId("");
                    }}
                    className="border border-slate-300 rounded px-2 py-1.5 text-sm max-w-[11rem]"
                  >
                    <option value="">Usina inteira</option>
                    {skids.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select value={inversorId} onChange={(e) => setInversorId(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5 text-sm max-w-[11rem]">
                    <option value="">{skidId ? "SKID inteiro" : "Sem inversor"}</option>
                    {inversoresDoSkid.map((i) => <option key={i.id} value={i.id}>{i.identificacao}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    ref={campoGeracaoRef}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="kWh"
                    value={energiaKwh}
                    onChange={(e) => setEnergiaKwh(e.target.value)}
                    onKeyDown={teclaNovaLinha}
                    onPaste={aoColar("geracao")}
                    disabled={colando}
                    title="Também aceita colar do Excel: uma coluna vira um lançamento por linha (dias consecutivos a partir da Data); duas colunas (geração + irradiação) alimentam os dois campos de uma vez."
                    className={campoNumero}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="kWh/m²"
                    value={irradiacaoKwhM2}
                    onChange={(e) => setIrradiacaoKwhM2(e.target.value)}
                    onKeyDown={teclaNovaLinha}
                    onPaste={aoColar("irradiacao")}
                    disabled={colando}
                    title="Também aceita colar do Excel: uma coluna vira um lançamento por linha (dias consecutivos a partir da Data); duas colunas (geração + irradiação) alimentam os dois campos de uma vez."
                    className={campoNumero}
                  />
                  {irradiacaoDoDia !== null && <p className="text-os-cinza text-xs mt-1">Já lançada neste dia</p>}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={adicionar} disabled={salvando || colando} className="bg-os-azul-marinho text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-60">
                    {colando ? "Colando..." : salvando ? "Salvando..." : "Adicionar"}
                  </button>
                </td>
              </tr>
            )}
            {(erro || mensagem) && (
              <tr>
                <td colSpan={6} className={`px-3 py-2 text-sm ${erro ? "text-os-estado-vermelho" : "text-os-estado-verde"}`}>{erro ?? mensagem}</td>
              </tr>
            )}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-os-cinza">{filtrosAtivos ? "Nenhum lançamento para os filtros selecionados." : "Nenhum lançamento no período. Use a linha destacada acima para começar."}</td>
              </tr>
            )}
            {linhas.map((linha) => {
              const emEdicao = editando?.chave === linha.chave;
              const teclaEdicao = (e: KeyboardEvent) => {
                if (e.key === "Enter") salvarEdicao(linha);
                if (e.key === "Escape") setEditando(null);
              };
              return (
                <tr key={linha.chave} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 whitespace-nowrap">{formatarDataBr(linha.dia)}</td>
                  <td className="px-3 py-1.5">{linha.skidNome}</td>
                  <td className="px-3 py-1.5">{linha.inversorNome}</td>
                  <td className="px-3 py-1.5 text-right">
                    {!linha.geracao ? (
                      <span className="text-os-cinza">—</span>
                    ) : emEdicao ? (
                      <input type="number" step="any" min="0" autoFocus value={editando.geracao} onChange={(e) => setEditando({ ...editando, geracao: e.target.value })} onKeyDown={teclaEdicao} className={campoNumero} />
                    ) : (
                      linha.geracao.energiaKwh.toLocaleString("pt-BR")
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {emEdicao ? (
                      <input type="number" step="any" min="0" placeholder="kWh/m²" value={editando.irradiacao} onChange={(e) => setEditando({ ...editando, irradiacao: e.target.value })} onKeyDown={teclaEdicao} title="A irradiação é uma só por dia: a alteração vale para todas as linhas deste dia." className={campoNumero} />
                    ) : !linha.irradiacao ? (
                      <span className="text-os-cinza">—</span>
                    ) : (
                      <span title={linha.irradiacaoCompartilhada ? "Irradiação do dia (compartilhada pelas linhas do mesmo dia)" : undefined}>{linha.irradiacao.irradiacaoKwhM2.toLocaleString("pt-BR")}</span>
                    )}
                  </td>
                  {(temAcoes || podeCriar) && (
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {emEdicao ? (
                        <>
                          <button onClick={() => salvarEdicao(linha)} className="text-os-estado-verde underline mr-3">salvar</button>
                          <button onClick={() => setEditando(null)} className="text-os-cinza underline">cancelar</button>
                        </>
                      ) : (
                        <>
                          {podeEditar && <button onClick={() => iniciarEdicao(linha)} className="text-os-azul-marinho underline mr-3">editar</button>}
                          {podeExcluir && <button onClick={() => excluirLinha(linha)} className="text-os-estado-vermelho underline">excluir</button>}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-os-cinza text-xs mb-6">
        A irradiação é uma só por dia (medição da usina): ao lançar a geração de vários inversores no mesmo dia, o valor do dia é mantido. Data, SKID e inversor não são editáveis — para mudá-los, exclua a linha e lance de novo.
      </p>

      <h2 className="text-os-azul-marinho font-medium text-sm mb-2">Fechamento de competência — {ano}</h2>
      <div className="flex flex-wrap gap-2">
        {MESES.map((nome, i) => {
          const mes = i + 1;
          const f = fechamentos.find((x) => x.mes === mes);
          const fechado = f?.situacao === "FECHADO";
          return (
            <button
              key={mes}
              onClick={() => alternarFechamento(mes, f?.situacao)}
              className={`text-xs px-3 py-1.5 rounded-full border ${fechado ? "bg-os-estado-verde/10 border-os-estado-verde text-os-estado-verde" : "bg-slate-50 border-slate-300 text-os-cinza"}`}
            >
              {nome.slice(0, 3)} · {fechado ? "Fechado" : "Parcial"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
