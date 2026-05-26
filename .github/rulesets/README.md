# GitHub Rulesets

## 使用方法

1. 打开仓库 **Settings → Rules → Rulesets**
2. 点击 **New ruleset → Import a ruleset**
3. 上传 `main-protection.json`
4. 点击 **Create**

## 规则说明

| 规则 | 说明 |
|:--|:--|
| 🚫 禁止删除分支 | `main` 不可被删除 |
| 🚫 禁止 force push | 保护提交历史完整性 |
| 📝 PR 必须审核 | 至少 1 人 approve 才能合并 |
| ✅ CI 必须通过 | Type Check + Security Audit 必须绿 |
| 📏 线性历史 | 禁止 merge commit，只允许 rebase/squash |
