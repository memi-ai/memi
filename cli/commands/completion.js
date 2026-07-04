const { S, log, section } = require("../ui");

module.exports = {
  name: "completion",
  aliases: ["completions", "tab-completion"],
  description: "Generate shell completion scripts",
  usage: "memi completion [bash|zsh|powershell]",
  category: "system",
  run: async (args) => {
    const shell = args[0] || "bash";
    const cmds = [
      "chat", "status", "config", "skills", "sessions", "onboard",
      "dashboard", "server", "doctor", "update", "version", "help",
      "daemon", "reset", "agent", "voice", "browser", "mcp", "sandbox",
      "memory", "plugin", "cron", "rag", "backup", "restore",
      "lang", "expose", "persona", "provider", "completion",
      "skill-import", "publish", "team", "docs",
      "telegram", "feishu", "wecom", "qq", "discord", "slack", "dingtalk",
      "bak", "st", "cf", "sk", "ss", "ob", "db", "sv", "dr", "up", "vr", "hp",
      "prov",
    ];

    if (shell === "bash") {
      log(`# memi completion: source this file or add to ~/.bashrc
_memi_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "${cmds.join(" ")}" -- "$cur") )
}
complete -F _memi_completions memi
`);
    } else if (shell === "zsh") {
      log(`# memi completion: place in /usr/local/share/zsh/site-functions/_memi
# compinit will pick it up automatically
#compdef memi

_memi() {
  local -a commands
  commands=(
    ${cmds.map(c => `"${c}:$(_memi_desc ${c})"`).join("\n    ")}
  )
  _describe 'memi' commands
}

_memi_desc() {
  case $1 in
    chat) echo "Start interactive chat" ;;
    status) echo "View system status" ;;
    help) echo "Show help" ;;
    *) echo "" ;;
  esac
}

_memi "$@"
`);
    } else if (shell === "powershell") {
      log(`# memi completion: add to your PowerShell profile
# Profile path: $PROFILE
Register-ArgumentCompleter -Native -CommandName memi -ScriptBlock {
  param(\$wordToComplete, \$commandAst, \$cursorPosition)
  ${JSON.stringify(cmds)} | Where-Object { \$_ -like "\$wordToComplete*" } | ForEach-Object { \$_ }
}
`);
    } else {
      log(`  ${S.ykb}⚠${S.r} ${S.yk}未知 shell: ${shell}${S.r}`);
      log(`  ${S.g}支持: bash, zsh, powershell${S.r}`);
      return;
    }

    log(`  ${S.gray3}# Install: memi completion ${shell} >> ~/.bashrc${S.r}`);
    log("");
  },
};
