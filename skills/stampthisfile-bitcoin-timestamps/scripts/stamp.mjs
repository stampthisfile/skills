#!/usr/bin/env node
/**
 * stampthisfile from the command line: hash files locally, pay with x402
 * (USDC, EIP-3009), save standard OpenTimestamps proofs, upgrade them once
 * Bitcoin confirms, and verify them. Node 18+.
 *
 *   node stamp.mjs hash <file>...                   SHA-256 of each file (nothing is sent)
 *   node stamp.mjs price <file>...                  what stamping these would cost (free: the 402)
 *   node stamp.mjs stamp <file>... [--max 0.25] [--yes] [--webhook https://…]
 *                                                   pay and stamp; needs X402_PAYER_KEY and `npm i viem`
 *   node stamp.mjs upgrade <file>...                fetch the latest proof (complete once in Bitcoin)
 *   node stamp.mjs verify <file> [<file>.ots]       check a proof against the file (completes a pending one)
 *
 * Writes <file>.ots (the proof) and <file>.stamp.json (stamp id, URLs, signed
 * receipt) next to each file. Only `stamp` pays, and it refuses to spend more
 * than --max USD in total (default 0.25) and asks first unless --yes.
 * The key is read from X402_PAYER_KEY only, never printed.
 * Base URL: STAMPTHISFILE_URL (default https://stampthisfile.com).
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

const BASE = (process.env.STAMPTHISFILE_URL || 'https://stampthisfile.com').replace(/\/+$/, '')
const [command, ...rest] = process.argv.slice(2)
const flags = {}
const files = []
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]
  if (a === '--yes') flags.yes = true
  else if (a.startsWith('--')) flags[a.slice(2)] = rest[++i]
  else files.push(a)
}

const die = (msg, code = 1) => {
  console.error(msg)
  process.exit(code)
}
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const sidecar = (file) => `${file}.stamp.json`

async function json(res) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { error: { message: text.slice(0, 300) } }
  }
}

async function ask402(hashes, webhook) {
  const body = JSON.stringify({ hashes, ...(webhook ? { webhook: { url: webhook } } : {}) })
  const res = await fetch(`${BASE}/v1/stamps`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  if (res.status !== 402) die(`Expected 402 from ${BASE}/v1/stamps, got ${res.status}: ${JSON.stringify(await json(res)).slice(0, 300)}`)
  return { body, required: await json(res) }
}

async function main() {
  if (!command || command === 'help' || command === '--help') {
    console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0])
    return
  }
  if (!files.length) die(`Usage: node stamp.mjs ${command} <file>...`, 2)
  for (const f of files) if (!existsSync(f)) die(`No such file: ${f}`, 2)

  if (command === 'hash') {
    for (const f of files) console.log(`${sha256(f)}  ${f}`)
    return
  }

  if (command === 'price') {
    const { required } = await ask402(files.map(sha256))
    const a = required.accepts[0]
    console.log(`${required.error}\n(${a.amount} atomic units of ${a.asset} on ${a.network}, to ${a.payTo})`)
    return
  }

  if (command === 'stamp') {
    const key = process.env.X402_PAYER_KEY
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) die('Set X402_PAYER_KEY to the private key (0x + 64 hex) of a wallet holding a little USDC on the network the 402 asks for. No ETH is needed.', 2)
    let accounts
    try {
      accounts = await import('viem/accounts')
    } catch {
      die('This command needs viem: run `npm i viem` next to this script (or in your project), then retry.', 2)
    }
    const account = accounts.privateKeyToAccount(key)
    const hashes = files.map(sha256)
    if (new Set(hashes).size !== hashes.length) die('Two of these files have the same content (same SHA-256); stamp each content once.', 2)
    const { body, required } = await ask402(hashes, flags.webhook)
    const accepted = required.accepts.find((a) => a.scheme === 'exact' && a.network.startsWith('eip155:'))
    if (!accepted) die(`No exact/EVM payment option in the 402: ${JSON.stringify(required.accepts)}`)
    const usd = Number(accepted.amount) / 1e6
    const max = Number(flags.max ?? '0.25')
    console.log(`${required.error}\nTo pay: ${usd} USDC on ${accepted.network} to ${accepted.payTo}, from ${account.address}.`)
    if (!(usd <= max)) die(`Refusing: ${usd} USD is more than --max ${max}.`)
    if (!flags.yes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      const answer = await rl.question('Pay? [y/N] ')
      rl.close()
      if (answer.trim().toLowerCase() !== 'y') die('Not paid.')
    }
    const now = Math.floor(Date.now() / 1000)
    const authorization = {
      from: account.address,
      to: accepted.payTo,
      value: accepted.amount,
      validAfter: String(now - 60),
      validBefore: String(now + Math.min(accepted.maxTimeoutSeconds ?? 300, 300)),
      nonce: `0x${randomBytes(32).toString('hex')}`,
    }
    const signature = await account.signTypedData({
      domain: {
        name: accepted.extra?.name ?? 'USD Coin',
        version: accepted.extra?.version ?? '2',
        chainId: Number(accepted.network.split(':')[1]),
        verifyingContract: accepted.asset,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
    })
    // Echo the 402's extensions (bazaar), as x402 clients should.
    const payload = { x402Version: required.x402Version, resource: required.resource, accepted, payload: { signature, authorization }, ...(required.extensions ? { extensions: required.extensions } : {}) }
    const header = Buffer.from(JSON.stringify(payload)).toString('base64')
    // The same request with the payment. A network error here is safe to retry with the same header and body: it is never charged twice.
    const res = await fetch(`${BASE}/v1/stamps`, { method: 'POST', headers: { 'content-type': 'application/json', 'PAYMENT-SIGNATURE': header }, body })
    const out = await json(res)
    if (!res.ok) die(`Not stamped (${res.status}): ${out.error?.message ?? out.error ?? JSON.stringify(out).slice(0, 300)}`)
    const settlement = res.headers.get('payment-response')
    const tx = settlement ? JSON.parse(Buffer.from(settlement, 'base64').toString()).transaction : undefined
    files.forEach((f, i) => {
      const s = out.stamps[i]
      if (s.hash !== hashes[i]) die(`Unexpected answer order for ${f}`)
      writeFileSync(`${f}.ots`, Buffer.from(s.ots, 'base64'))
      writeFileSync(sidecar(f), JSON.stringify({ id: s.id, hash: s.hash, status: s.status, status_url: s.status_url, ots_url: s.ots_url, batch_id: out.batch_id, receipt: out.receipt }, null, 2) + '\n')
      console.log(`${f}: ${s.id} (pending) → ${f}.ots`)
    })
    console.log(tx ? `Paid: transaction ${tx}` : 'Settlement did not answer; the proofs were delivered anyway.')
    console.log('Bitcoin confirms the proofs within a few hours; then run: node stamp.mjs upgrade <file>...')
    return
  }

  if (command === 'upgrade') {
    for (const f of files) {
      if (!existsSync(sidecar(f))) die(`${f}: no ${sidecar(f)}; was it stamped with this script?`)
      const meta = JSON.parse(readFileSync(sidecar(f), 'utf8'))
      const status = await json(await fetch(meta.status_url))
      const ots = await fetch(meta.ots_url)
      if (!ots.ok) die(`${f}: ${meta.ots_url} answered ${ots.status}`)
      writeFileSync(`${f}.ots`, Buffer.from(await ots.arrayBuffer()))
      writeFileSync(sidecar(f), JSON.stringify({ ...meta, status: status.status, bitcoin: status.bitcoin }, null, 2) + '\n')
      console.log(`${f}: ${status.status}${status.statement ? ` — ${status.statement}` : status.note ? ` — ${status.note}` : ''}`)
    }
    return
  }

  if (command === 'verify') {
    const [file, proof = `${files[0]}.ots`] = files
    if (!existsSync(proof)) die(`No proof at ${proof}`, 2)
    const res = await fetch(`${BASE}/v1/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash: sha256(file), ots: readFileSync(proof).toString('base64') }),
    })
    const out = await json(res)
    if (!res.ok) die(`Verify failed (${res.status}): ${out.error?.message ?? JSON.stringify(out)}`)
    console.log(out.status === 'complete' ? `valid: ${out.statement}` : out.status === 'pending' ? `valid but pending: ${out.note}` : `INVALID: ${out.reason}`)
    // A pending proof the calendars have since committed comes back complete: keep that one (it contains the old one).
    if (out.upgraded && out.ots) {
      writeFileSync(proof, Buffer.from(out.ots, 'base64'))
      console.log(`${proof} was pending; saved the complete proof over it.`)
    }
    if (out.status === 'invalid') process.exit(1)
    return
  }

  die(`Unknown command "${command}". Commands: hash, price, stamp, upgrade, verify`, 2)
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)))
