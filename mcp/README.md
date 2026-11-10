# Hynish Archive MCP server

One file, no dependencies. It needs Node 18 or newer. It reads the public data files of the Hynish Archive
(https://protbhai.github.io/hynish-archive/api/v1/) and offers them to an AI as eight read-only tools:

`search`, `get_record`, `timeline`, `case_status`, `get_document`, `changes_since`, `missing_records`, `society_facts`

## Set up

1. Save `hynish-mcp.mjs` from https://protbhai.github.io/hynish-archive/mcp/hynish-mcp.mjs
2. Claude Code: `claude mcp add hynish -- node /path/to/hynish-mcp.mjs`
3. Claude Desktop or another client: add a server with command `node` and argument `/path/to/hynish-mcp.mjs`.

## Try it without an AI

    node hynish-mcp.mjs --call search "{\"query\":\"election\"}"
    node hynish-mcp.mjs --call case_status "{}"

## Settings (environment variables, all optional)

- `HYNISH_BASE_URL`: where the site is. Default https://protbhai.github.io/hynish-archive
- `HYNISH_PUBLIC_DIR`: read the public data from a local folder instead of the web.
- `HYNISH_PRIVATE_DIR`: a local folder with the owner's private store. Only the owner has one. Nothing private is fetched from the web.

Dated archive, not a live status service. Not legal advice.
