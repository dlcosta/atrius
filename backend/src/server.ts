import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { registerRoutes } from './routes'

const app = express()
const PORT = Number(process.env.PORT ?? 3334)
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

registerRoutes(app)

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})
