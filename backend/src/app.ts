import express, { Express } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { registerRoutes } from './routes'

// Monta a aplicacao Express (middlewares + rotas) sem iniciar o listen().
// Permite testar as rotas com supertest sem subir um servidor real.
export function createApp(): Express {
  const app = express()
  const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

  app.use(cors({
    origin: FRONTEND_URL,
    credentials: true,
  }))
  app.use(express.json())
  app.use(cookieParser())

  registerRoutes(app)

  return app
}
