# Swagger 契约基线

这里保存 `admin`、`user`、`order`、`notify` 分组的原始 OpenAPI 快照，用于递归比较路径、方法、参数、必填项、请求体、响应和嵌套 schema。

## 使用方式

```bash
pnpm swagger:baseline
pnpm swagger:check
```

- `swagger:baseline` 使用当前 `SWAGGER_BASELINE`（默认 `2026-08-14`）写入一份新的基线。
- `swagger:check` 将实时文档与基线递归比较；存在差异时会以非零状态退出。
- 当某个分组从不可用（例如 HTTP 404）变为可用，或反向变化时，检查会单独标记为“服务状态变化”，不会输出无意义的整份 JSON 差异。
- 可通过 `SWAGGER_ROOT_URL` 覆盖 Swagger 服务地址，通过 `SWAGGER_BASELINE` 指定快照目录。
- 快照不包含账号、密码、token 或任何真实业务写入结果。
