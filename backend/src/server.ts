import 'dotenv/config'
import { createApp } from './app'

const app = createApp()
const PORT = Number(process.env.PORT ?? 3334)

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})
