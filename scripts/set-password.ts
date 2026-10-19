// Первоначальная настройка мастера: задать/сменить пароль ЛОКАЛЬНО.
//
// Запуск из корня проекта (Node.js, без Bun):
//   npm run setup:password            # интерактивно, ввод скрыт
//   npm run setup:password -- --stdin # пароль из stdin (скрипты/CI)
//   npm run setup:password -- --reset # смена уже заданного пароля
//
// Почему CLI, а не веб-форма: ненастроенный экземпляр закрыт (fail-closed),
// и «захватить» первичную настройку удалённо нельзя — только с машины,
// где лежит база. Смена пароля аннулирует все сессии.

import { PrismaClient } from '@prisma/client'
import { createInterface } from 'readline'
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64
const MAXMEM = 64 * 1024 * 1024

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAXMEM })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key.toString('hex')}`
}

/** Скрытый ввод (raw mode); в не-терминале просто читает строку. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin
    process.stdout.write(question)
    if (stdin.isTTY) {
      stdin.setRawMode(true)
      stdin.setEncoding('utf8')
      let input = ''
      const onData = (ch: string) => {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.removeListener('data', onData)
          process.stdout.write('\n')
          resolve(input.trim())
        } else if (ch === '\u0003') {
          // Ctrl+C
          process.stdout.write('\n')
          process.exit(1)
        } else if (ch === '\u007f') {
          input = input.slice(0, -1)
        } else {
          input += ch
        }
      }
      stdin.on('data', onData)
    } else {
      const rl = createInterface({ input: stdin, output: process.stdout })
      rl.question('', (line) => { rl.close(); resolve(line.trim()) })
    }
  })
}

async function readStdinLine(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk))
    const s = Buffer.concat(chunks).toString('utf8')
    if (s.includes('\n')) return s.split('\n')[0].trim()
  }
  return Buffer.concat(chunks).toString('utf8').trim()
}

async function main() {
  const args = process.argv.slice(2)
  const useStdin = args.includes('--stdin')
  const allowReset = args.includes('--reset')

  const db = new PrismaClient()
  try {
    let s = await db.appSettings.findUnique({ where: { id: 1 } })
    if (!s) s = await db.appSettings.create({ data: { id: 1 } })

    if (s.passHash && !allowReset) {
      console.error('Пароль уже задан. Для смены добавьте флаг --reset (все сессии будут аннулированы):')
      console.error('  npm run setup:password -- --reset')
      process.exit(1)
    }

    let password: string
    let confirm: string
    if (useStdin) {
      password = await readStdinLine()
      confirm = password
    } else {
      password = await askHidden("Новый пароль мастера (мин. 6 символов): ")
      confirm = await askHidden("Повторите пароль: ")
    }

    if (password.length < 6) {
      console.error('ОТКАЗ: пароль короче 6 символов.')
      process.exit(1)
    }
    if (password !== confirm) {
      console.error('ОТКАЗ: пароли не совпадают.')
      process.exit(1)
    }

    const hash = await hashPassword(password)
    await db.appSettings.update({ where: { id: 1 }, data: { passHash: hash, passSalt: '' } })
    await db.session.deleteMany({})

    console.log('Пароль мастера установлен (scrypt, N=16384). Все прежние сессии аннулированы.')
    console.log('Теперь вход в веб-интерфейсе: экран «Вход мастера» → этот пароль.')
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
