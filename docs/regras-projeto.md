# Premissas e Regras do Atrius

Documento de validacao do produto para alinhar regras de negocio, operacao e usabilidade antes das proximas mudancas de interface.

Esta primeira versao separa tres tipos de informacao:

- **Implementado hoje**: regra ou comportamento ja presente no sistema.
- **Decidido para o novo fluxo**: premissa aprovada para guiar a proxima UX.
- **Pendente de validacao**: ponto que ainda precisa de decisao antes de virar regra definitiva.

## Objetivo do sistema

**Decidido para o novo fluxo**

- Planejar e acompanhar producao em duas etapas: tanque e envase.
- Permitir que usuarios com pouca habilidade em computador criem, agendem e operem ordens com poucos passos.
- Fazer o fluxo principal ser manual, guiado e previsivel.
- Reduzir a necessidade de navegar entre muitas telas para executar tarefas simples.
- Simplificar o cadastro de tempos para apenas preparacao e producao.

## Origem das ordens

**Decidido para o novo fluxo**

- Toda ordem deve ser criada por cadastro manual.
- O sistema nao deve depender de demanda ERP para criar ordens.
- A nova UX deve priorizar o fluxo "criar ordem manual e ja agendar".

**Implementado hoje**

- O projeto ainda possui modulos e codigo relacionados a demanda ERP, Olist/Tiny e pedidos importados.
- Esses modulos existem no repositorio, mas nao devem ser tratados como origem principal de ordens daqui para frente.

**Decidido para o novo fluxo**

- Modulos ERP/demanda ficam fora da navegacao principal e nao fazem parte do fluxo operacional comum.
- Codigo e rotas antigas podem permanecer como legado tecnico ate uma limpeza estrutural futura.

## Entidades principais

**Implementado hoje**

- **Ordem de producao**: unidade central do planejamento e da operacao.
- **Tanque**: recurso usado para producao em litros.
- **Maquina de envase**: recurso usado para ordens de envase.
- **Produto**: referencia de SKU, nome, cor, volume base e tempos.
- **Turno**: janela operacional cadastrada em minutos do dia.
- **Operador**: pessoa responsavel por iniciar, pausar, retomar e finalizar ordens.
- **Agendamento**: vinculo entre ordem, recurso, data e horario.
- **Log de auditoria**: historico das movimentacoes e alteracoes relevantes.

## Fluxo de producao

**Decidido para o novo fluxo**

- Tanque produz volume em litros.
- Envase consome saldo de uma ordem de tanque.
- Envase precisa de uma ordem de tanque de origem.
- O fluxo desejado sera criar e agendar em uma unica jornada guiada.
- Calendario serve como visualizacao e ajuste, nao como etapa obrigatoria para usuario comum.
- A interface nao deve mais pedir `Prep.`, `Prod.` e `Limp.` como tres tempos separados.
- O novo fluxo deve pedir somente tempo de preparacao e tempo de producao.

**Implementado hoje**

- Existem fluxos de criacao separados para tanque e envase.
- O calendario exibe recursos e ordens agendadas.
- Ordens sem horario podem aparecer como "Para agendar" ou pendentes de agendamento.
- O calendario permite agendar e reagendar ordens visualmente.
- Alguns fluxos tecnicos ainda armazenam preparacao, producao e limpeza como campos separados.

## Regras de tempos

**Decidido para o novo fluxo**

- O tempo de preparacao unifica preparacao, setup, ajustes e limpeza.
- O tempo de producao representa apenas o tempo produtivo principal.
- O total da ordem deve ser calculado como preparacao + producao.
- Campos antigos de limpeza podem continuar existindo internamente por compatibilidade, mas nao devem aparecer como uma etapa separada para o usuario comum.
- Textos da interface devem evitar separar limpeza como tempo proprio quando o objetivo for cadastrar ou agendar uma ordem.

**Implementado hoje**

- O tempo de preparacao do novo fluxo e gravado em `setup_time_minutes`.
- `cleaning_time_minutes` deve ser enviado como `0` nas novas criacoes do fluxo principal.
- Registros antigos que tenham preparacao e limpeza separados continuam sendo exibidos como preparacao unificada na interface principal.

**Pendente tecnico futuro**

- Avaliar se vale criar uma migracao de banco para consolidar historicamente `setup_time_minutes` + `cleaning_time_minutes`.

## Estados e regras de status

**Implementado hoje**

- `BACKLOG`: ordem criada, ainda sem horario.
- `WAITING_TANK`: envase aguardando tanque de origem.
- `READY_TO_SCHEDULE`: ordem pronta para agendar, quando aplicavel.
- `SCHEDULED`: ordem com data, horario e recurso definidos.
- `IN_PRODUCTION`: ordem em execucao.
- `PAUSED`: ordem pausada.
- `COMPLETED`: ordem concluida.
- `CANCELED`: ordem cancelada.

Status operacionais em portugues usados no sistema:

- `aguardando`
- `produzindo`
- `pausada`
- `limpeza`
- `concluida`
- `atrasada`
- `cancelada`

O status `limpeza`, quando existir por legado ou controle interno, nao deve obrigar o usuario comum a informar um tempo de limpeza separado.

**Decidido para o novo fluxo**

- `BACKLOG` continua existindo como status tecnico para ordens sem horario.
- Na interface principal, `BACKLOG` nao deve aparecer como termo para usuario; usar "Para agendar" ou "Sem horario".
- `READY_TO_SCHEDULE` fica como status legado/compatibilidade, mas nao deve ser destacado no fluxo simplificado.
- Ordem manual pode nascer sem horario quando o usuario ainda nao souber a hora; nesse caso fica em "Para agendar".

## Regras de agendamento

**Implementado hoje**

- Nao e permitido agendar producao em horario passado.
- Nao deve haver sobreposicao de horario no mesmo tanque.
- Nao deve haver sobreposicao de horario na mesma maquina de envase.
- Data e horario geram `inicio_agendado`.
- Duracao gera `fim_calculado`.
- No novo fluxo, duracao deve ser calculada como preparacao + producao.
- Preparacao inclui o que antes era tratado separadamente como prep/setup e limpeza.
- Turnos sao usados para identificar a janela operacional em que o horario cai.
- Quando nao ha turno compativel, o sistema pode usar turno manual em alguns fluxos.

**Decidido para o novo fluxo**

- Horario fora de turno pode continuar permitido como `manual` no modo avancado.
- Para usuario comum, a experiencia deve favorecer horarios guiados e mensagens claras.
- Reagendar por arrastar no calendario fica tratado como modo avancado, nao como etapa obrigatoria do operador simples.

## Regras de tanque

**Implementado hoje**

- Tanque usa litros como unidade principal.
- Volume planejado nao pode ultrapassar a capacidade do tanque selecionado.
- Ordem de tanque pode alimentar uma ou mais ordens de envase.
- Saldo do tanque e calculado comparando litros produzidos e litros ja envasados.
- Balanceamento de tanque pode ser:
  - `BALANCED`: volume produzido e envasado estao dentro da tolerancia.
  - `UNDER`: ainda falta envasar volume do tanque.
  - `OVER`: envase excede o volume disponivel do tanque.
- A tolerancia tecnica atual para balanceamento e de `0.01 L`.

## Regras de envase

**Implementado hoje**

- Envase precisa de tanque de origem.
- Envase consome saldo disponivel do tanque.
- Volume de envase nao pode exceder saldo do tanque de origem.
- Maquina de envase e o recurso usado para validacao de conflito.
- Calculo pode considerar volume por embalagem, unidades por caixa, unidades avulsas e caixas estimadas.
- Envase pode ficar como `WAITING_TANK` quando depende de tanque ainda nao liberado.

**Decidido para o novo fluxo**

- Envase pode ser cadastrado/agendado antes do tanque concluir.
- Quando depender de tanque ainda nao liberado, deve ficar como `WAITING_TANK`.
- Para o usuario, esse estado deve aparecer como "Aguardando tanque".

## Regras de operacao

**Implementado hoje**

- Para iniciar, pausar, retomar ou finalizar, deve haver operador selecionado.
- So uma ordem pode estar em andamento ou pausada por recurso.
- Pausa exige observacao.
- Retomar recalcula previsao de termino com base no tempo restante.
- Concluir tanque pode liberar envases que estavam aguardando.
- Acoes operacionais relevantes geram eventos e/ou logs.

**Decidido para o novo fluxo**

- Operador continua obrigatorio para iniciar, pausar, retomar e finalizar.
- No painel operacional, o operador deve ser selecionado por recurso, evitando repetir a escolha em cada ordem.

## Monitoramento

**Decidido para o novo fluxo**

- A visao principal deve ser para operador simples.
- Priorizar informacoes operacionais imediatas:
  - o que esta acontecendo agora;
  - proximas ordens;
  - ordens pausadas;
  - ordens atrasadas;
  - acoes possiveis.
- Indicadores gerenciais devem ficar em area secundaria.
- Modo TV deve mostrar informacao grande e direta, sem excesso de tabela.

**Implementado hoje**

- O sistema possui painel operacional, modo TV e pagina de monitoramento com indicadores.
- O monitoramento atual mistura informacao operacional com indicadores gerenciais e historico detalhado.

## Usabilidade

**Decidido para o novo fluxo**

- Fluxo principal recomendado: assistente unico para criar e agendar manualmente.
- Calendario com arrastar e soltar deve virar modo avancado.
- Evitar termos tecnicos como "backlog" na interface principal.
- Usar botoes grandes, etapas curtas, feedback por popup e mensagens claras.
- A interface deve ser adequada para usuarios com pouca familiaridade com computador.

**Implementado/decidido para o novo fluxo**

- "backlog" deve aparecer para o usuario como "Para agendar" ou "Sem horario".
- "recurso" deve ser evitado na UI principal; usar "tanque" ou "maquina".
- `planning_status` nao deve aparecer para usuario final.

## Pontos pendentes para validacao futura

- Se o fluxo legado em `ordens` continua convivendo com `ordens_tanque_novo_fluxo` e `ordens_envase_novo_fluxo` ou se havera consolidacao futura.
- Se havera uma migracao de banco para zerar/consolidar historicamente `cleaning_time_minutes`.
- Quando remover definitivamente telas, rotas e componentes ligados a demanda ERP/importacao.

## Mudancas de interface e API nesta etapa

**Implementado nesta etapa**

- Nenhuma mudanca de API.
- Nenhuma mudanca de banco.
- Fluxo principal passou a usar preparacao + producao, sem campo separado de limpeza para usuario comum.
- Textos principais de `backlog` foram trocados por "Para agendar" ou "Sem horario".
- Sincronizacao/importacao ERP foi removida do painel operacional principal.
- Esta etapa tambem atualiza este documento de referencia e validacao.

## Premissas atuais confirmadas

- O documento deve ser versionado em `docs/regras-projeto.md`.
- Esta primeira versao e descritiva e serve para validacao.
- A linguagem deve ser simples, em portugues, para servir tanto para produto quanto para desenvolvimento.
- Ordens sempre serao criadas manualmente no fluxo principal.
- ERP/demanda nao e mais origem de criacao de ordens no fluxo desejado.
- Tempos do novo fluxo serao apenas preparacao + producao; limpeza nao sera um campo separado para o usuario comum.
- Tempo de preparacao e gravado tecnicamente em `setup_time_minutes`; `cleaning_time_minutes` fica `0` nas novas ordens do fluxo principal.
- Ordens sem horario podem existir, mas devem aparecer na UI como "Para agendar" ou "Sem horario".
- Envase antes do tanque concluido e permitido com status "Aguardando tanque".
- Operador e selecionado por recurso no painel operacional.
- Scripts locais `run-localhost.ps1` e `stop-localhost.ps1` devem permanecer no repositorio como apoio de desenvolvimento local.
