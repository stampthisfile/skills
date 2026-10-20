# stampthisfile agent skills

Skills that let AI agents timestamp files in Bitcoin with
[stampthisfile](https://stampthisfile.com), built on
[OpenTimestamps](https://opentimestamps.org). A stamp proves that a file
existed no later than a given date. Only the file's SHA-256 hash is sent,
never the file. You pay per hash in USDC with [x402](https://x402.org), with
no account or API key. Each stamp comes back as a standard `.ots` proof that
anyone can verify without trusting us.

## Install

```sh
npx skills add stampthisfile/skills
```

Works with Claude Code, Cursor, Codex and the other agents
[skills](https://skills.sh) supports.

## Skills

| Skill | What it does |
| --- | --- |
| [stampthisfile-bitcoin-timestamps](skills/stampthisfile-bitcoin-timestamps/SKILL.md) | Timestamp files, documents, designs, code, datasets and logs in Bitcoin. Verify and upgrade `.ots` proofs. Explains when a stamp helps as evidence, and when a signature, notary or qualified timestamp is needed instead. Includes `scripts/stamp.mjs` (hash, price, stamp, upgrade, verify). |

## Without a skill

Agents can also start from
[stampthisfile.com/llms.txt](https://stampthisfile.com/llms.txt) and
[stampthisfile.com/evidence.md](https://stampthisfile.com/evidence.md), or
the [OpenAPI spec](https://stampthisfile.com/openapi.json).

## License

MIT
