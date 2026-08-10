# Tool/MCP contract

Tools are registered by name and version. Each tool declares whether it has side effects and whether approval is required. The runtime invokes tools through `src/tool-registry.mjs`; it does not execute arbitrary shell commands.

Required tool metadata:

- `name`: stable identifier
- `version`: compatibility version
- `sideEffect`: boolean
- `requiresApproval`: boolean
- `input`/`output`: JSON-serializable contract

The default tool policy is dry-run plus approval for side effects.
