---
name: stampthisfile-bitcoin-timestamps
description: "Timestamp files in Bitcoin with stampthisfile (https://stampthisfile.com) and OpenTimestamps: prove a file, document, contract draft, design, photo, code, dataset, model output or log existed no later than a date, with a standard .ots proof anyone can verify without trusting the service. The file never leaves the machine: only its SHA-256 hash is sent. Paid per hash in USDC with x402, with no account or API key. Also verifies .ots proofs, upgrades pending proofs once Bitcoin confirms them, and explains when a stamp helps as evidence (copyright, prior creation, trade secrets, audit trails) and when a signature, notary or qualified eIDAS timestamp is needed instead. Use when the user wants to timestamp a file, get proof of existence or a blockchain timestamp, protect a creative work or idea by date, anchor a hash in Bitcoin, or check an .ots file."
---

# Bitcoin timestamps with stampthisfile

stampthisfile (https://stampthisfile.com) timestamps **SHA-256 hashes** in
Bitcoin with [OpenTimestamps](https://opentimestamps.org). You send hashes,
never files. It is paid per hash with [x402](https://x402.org) (USDC on Base),
with no account or key. You get back a standard `.ots` proof. The proof is
*pending* at first and becomes *complete* when Bitcoin confirms it, usually
within 1–6 hours. A complete proof shows the exact bytes existed **no later
than** the time of a Bitcoin block (± a couple of hours). It doesn't depend on
stampthisfile: opentimestamps.org or any OTS tool verifies it.

## Decide first: is a stamp what the user needs?

Read https://stampthisfile.com/evidence.md before stamping anything that
matters. In short:

- **A stamp proves** that this exact content existed by a date. It does
  **not** prove who made it, that it is true or original, or anything about
  an edited copy.
- **Stamp** final or important versions of creative work, designs, code,
  contract drafts, research notes, datasets and model outputs, and audit or
  agent logs. Stamp them early, not once a dispute has started.
- **Stamp and sign** when you will also need to show who made or agreed to
  the content.
- **Point the user elsewhere** when they need any of these:
  - a legal presumption of date (a qualified eIDAS timestamp);
  - a legal formality such as a deed, a will or property (a notary);
  - an identity check;
  - time to the minute;
  - help with a dispute that has already started (a lawyer).
- **Courts:** no court has yet ruled on OpenTimestamps by name. Courts in
  China (2018) and France (2025) accepted Bitcoin-anchored timestamps
  alongside other evidence. In the EU it is admissible (eIDAS Art. 41), but
  it carries no legal presumption.

## Wording

When you tell the user what a stamp means:

- **Say** "timestamped in Bitcoin", "existed no later than [block time,
  approximately]", "independently verifiable proof".
- **Never say** "notarized", "certified", "legally binding", "guaranteed in
  court" or "proof of ownership".
- **A pending proof** is not yet "in Bitcoin". Don't describe it as anchored.

## Price and payment

- **Price:** the 402 answer gives it. It is per hash; at the time of writing,
  0.05 USDC on Base.
- **Before paying:** ask the user, state the total, and never exceed the
  budget they approved. Asking for the price is free (it's the 402).
- **Gas:** the payer wallet needs USDC on Base and no ETH, because the
  facilitator pays the gas. An exchange account such as Coinbase can't sign
  the payment. The funds must be in a wallet whose key the agent or user
  controls.
- **Batches:** up to 100 hashes go in one request, at the per-hash price,
  in one payment.

## The script (easiest)

`scripts/stamp.mjs`, next to this file, needs Node 18+. For `stamp`, it also
needs `npm i viem` and `X402_PAYER_KEY`.

```sh
S=<this skill's folder>/scripts/stamp.mjs
node $S hash contract.pdf                       # the SHA-256; nothing is sent
node $S price contract.pdf design.png           # the total, free
X402_PAYER_KEY=0x… node $S stamp contract.pdf design.png --max 0.25
#   writes contract.pdf.ots (the proof) and contract.pdf.stamp.json (id, URLs, signed receipt)
node $S upgrade contract.pdf                    # a few hours later: fetches the complete proof
node $S verify contract.pdf                     # checks contract.pdf.ots; completes it if it was pending
```

- **Safety:** `stamp` refuses to pay more than `--max` USD in total (default
  0.25), and asks before paying unless you pass `--yes`.
- **Keys:** never print or log the private key.

## The HTTP API (any x402 client)

1. **Hash** the file locally: `sha256sum file` (Linux), `shasum -a 256 file`
   (macOS), or `crypto.subtle.digest('SHA-256', bytes)`.
2. **Ask for the price:** `POST https://stampthisfile.com/v1/stamps` with
   `{"hashes": ["<sha256 hex>", …]}`. The answer is `402`, and the x402
   `PaymentRequired` is in the body and in the base64 `PAYMENT-REQUIRED`
   header. Each hash must be 64 hex characters and appear only once.
   Optionally add a webhook:
   `"webhook": {"url": "https://…", "signing_key": "whsec_…"}`.
3. **Pay:** sign the `exact` USDC (EIP-3009) authorization with your x402
   client, then repeat the **same request** with
   `PAYMENT-SIGNATURE: <base64 PaymentPayload>`. Echo the 402's
   `extensions`.
4. **Save the result.** You get `200` with
   `{batch_id, stamps: [{id, hash, status: "pending", ots (base64), ots_url, status_url}], receipt}`.
   - Save each `ots` as `<file>.ots`.
   - Keep the `id` and the signed `receipt`.
   - Retrying with the same payment and the same body returns the same
     answer, and you are never charged twice.
5. **Fetch the complete proof later.** `GET /v1/stamps/{id}` shows the
   status (`pending`, `complete` with `bitcoin.height` and `block_time`, or
   `failed`). Once it is `complete`, download `GET /v1/stamps/{id}.ots` again
   and replace the pending proof.
6. **Or use a webhook:** it delivers `stamps.completed` for the whole request.
   Every delivery is signed in the Standard Webhooks format: always `v1a`
   with Ed25519 (the public key is at
   https://stampthisfile.com/.well-known/stampthisfile-keys), and also `v1`
   HMAC if you gave a `signing_key`.

**Verify (free):** `POST /v1/verify` with
`{"hash": "<sha256>", "ots": "<base64 .ots>"}` returns `complete`, `pending`
or `invalid`. If you send a pending proof that the calendars have since
committed, it comes back `complete` with `"upgraded": true` and the completed
proof in `ots` (base64). Save that in place of the pending file.

## Keep the stamp useful

- Keep the original file **byte-identical**. Re-saving or stripping metadata
  breaks the match.
- Keep the `.ots` next to the file and back both up.
- Upgrade to the complete proof once Bitcoin confirms it.
- Record the context yourself: who made the file, what it is, where it is
  stored. The stamp proves none of that.
- **Many files:** stamp a manifest, a sorted list of `sha256  path` lines,
  and keep the manifest with the files.

## Reference

The live documentation takes precedence over this file:

- https://stampthisfile.com/llms.txt (the API, payment details and webhooks)
- https://stampthisfile.com/openapi.json
- https://stampthisfile.com/evidence.md (evidence guidance and court research)

Errors are JSON: `{"error": {"code", "message"}}`. A 400 is never charged. A
503 means nothing was charged; retry shortly.
