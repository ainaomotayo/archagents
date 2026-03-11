-- Sentinel LSP client for Neovim (requires nvim-lspconfig)
-- Add to your init.lua or lua/plugins/ configuration:
--
--   require("sentinel-lsp")
--
-- Prerequisites:
--   1. npm install -g @sentinel/sentinel-lsp
--   2. Set environment variables: SENTINEL_API_URL, SENTINEL_API_TOKEN, SENTINEL_ORG_ID

local lspconfig = require("lspconfig")
local configs = require("lspconfig.configs")

if not configs.sentinel then
  configs.sentinel = {
    default_config = {
      cmd = { "sentinel-lsp", "--stdio" },
      filetypes = { "*" },
      root_dir = lspconfig.util.root_pattern(".git", "package.json", "pyproject.toml"),
      settings = {},
      init_options = {},
    },
  }
end

lspconfig.sentinel.setup({
  handlers = {
    -- Registered at setup time (not on_attach) so notifications arriving
    -- during initialize are not dropped
    ["sentinel/connectionStatus"] = function(_, result)
      local status = result and result.status or "unknown"
      if status == "connected" then
        vim.notify("Sentinel: connected", vim.log.levels.INFO)
      elseif status == "offline" then
        vim.notify("Sentinel: API offline — showing cached findings", vim.log.levels.WARN)
      elseif status == "auth_error" then
        vim.notify("Sentinel: authentication error — check API token", vim.log.levels.ERROR)
      end
    end,
  },
})
