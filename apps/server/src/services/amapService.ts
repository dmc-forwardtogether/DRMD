import { createHash } from "node:crypto"

/**
 * 高德地图 Web API 数字签名
 * 参考: https://lbs.amap.com/faq/account/key/72
 *
 * 签名规则:
 * 1. 将所有请求参数(不含sig)按 key 字母序排序
 * 2. 拼接为 key1=value1&key2=value2... 格式
 * 3. 末尾追加 secret
 * 4. MD5 哈希，结果作为 sig 参数值
 */
export function amapSign(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== "sig" && params[k] !== undefined && params[k] !== "")
    .sort()

  const raw = sorted.map((k) => `${k}=${params[k]}`).join("&") + secret
  return createHash("md5").update(raw, "utf8").digest("hex")
}

/**
 * 构建高德 API 请求 URL
 * - 有 secret: 自动计算 sig 数字签名
 * - 无 secret: 仅使用 key (兼容旧版/个人开发者)
 */
export function buildAmapUrl(
  baseUrl: string,
  params: Record<string, string | number | undefined>
): string {
  const key = process.env.AMAP_API_KEY
  if (!key) {
    throw new Error("AMAP_API_KEY not configured")
  }

  const secret = process.env.AMAP_API_SECRET || ""

  const sanitized: Record<string, string> = { key }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      sanitized[k] = String(v)
    }
  }

  const searchParams = new URLSearchParams(sanitized)

  if (secret) {
    // 数字签名模式 (更安全, 更高 QPS)
    const sig = amapSign(sanitized, secret)
    searchParams.set("sig", sig)
  }

  return `${baseUrl}?${searchParams.toString()}`
}

/**
 * Amap POI 类型码 → 我们的分类 code 映射
 * 高德 POI 分类: https://lbs.amap.com/api/webservice/download
 */
export const AMAP_CATEGORY_MAP: Record<string, string> = {
  "05": "dining",        // 餐饮服务
  "06": "retail",        // 购物服务
  "08": "entertainment", // 体育休闲服务
  "07": "service"        // 生活服务
}

/**
 * Amap 周边搜索分类码 (types 参数)
 * 用于缩小搜索范围
 */
export const AMAP_SEARCH_TYPES = {
  all: "050000|060000|080000|070000",
  dining: "050000",
  retail: "060000",
  entertainment: "080000",
  service: "070000"
} as const
