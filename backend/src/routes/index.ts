import { Express } from 'express'
import maquinasRouter from './maquinas'
import produtosRouter from './produtos'
import tanquesRouter from './tanques'
import operadoresRouter from './operadores'
import turnosRouter from './turnos'
import backlogRouter from './backlog'
import producaoRouter from './producao'
import demandaRouter from './demanda'
import monitoramentoRouter from './monitoramento'
import historicoRouter from './historico'
import conferenciaRouter from './conferencia'
import sincronizarRouter from './sincronizar'
import envaseRouter from './envase'
import olistRouter from './olist'
import novoFluxoRouter from './novo-fluxo'
import ordensRouter from './ordens'
import callbackRouter from './callback'

export function registerRoutes(app: Express) {
  app.use('/api/maquinas', maquinasRouter)
  app.use('/api/produtos', produtosRouter)
  app.use('/api/tanques', tanquesRouter)
  app.use('/api/operadores', operadoresRouter)
  app.use('/api/turnos', turnosRouter)
  app.use('/api/backlog', backlogRouter)
  app.use('/api/producao', producaoRouter)
  app.use('/api/demanda', demandaRouter)
  app.use('/api/monitoramento', monitoramentoRouter)
  app.use('/api/historico', historicoRouter)
  app.use('/api/conferencia', conferenciaRouter)
  app.use('/api/sincronizar', sincronizarRouter)
  app.use('/api/envase', envaseRouter)
  app.use('/api/olist', olistRouter)
  app.use('/api/novo-fluxo', novoFluxoRouter)
  app.use('/api/ordens', ordensRouter)
  app.use('/callback', callbackRouter)
}
