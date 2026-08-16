import type { AssetType } from './types'

export interface ClassifyInput {
  assetType?: AssetType | 'STOCK'
  code?: string
  name?: string
}

/**
 * 已知 A 股代码 → 板块分类。
 * 仅用于名称里没有行业关键词、仅靠名字分不出来的少数标的（按需要补充）。
 * 例如「大华股份 / 润建股份」名字里没有 科技 关键词，但都属于科技板块。
 */
const KNOWN_STOCK: Record<string, string> = {
  '002236': '科技', // 大华股份（安防 / 智慧物联）
  '002929': '科技', // 润建股份（通信服务 / 算力）
}

/**
 * 板块分类关键词规则：按顺序匹配，命中即返回（越具体越靠前）。
 * 「海外」放最后，避免把「恒生科技 / 纳斯达克」这类先吞成海外而丢掉科技属性。
 */
const RULES: [RegExp, string][] = [
  // 科技（最具体优先）
  [
    /芯片|半导体|科创|科技|人工智能|AI|机器人|数据|算力|电子信息|软件|互联网|5G|通信|智能|元宇|光电|传感/,
    '科技',
  ],
  // 金属 / 材料
  [/有色|矿业|黄金|金属|材料|钢铁|稀土|锆|铜|铝|新材|锂/, '金属'],
  // 能源
  [/能源|石油|煤炭|电力|燃气|光伏|锂电|电池|储能|风电|新能源/, '能源'],
  // 医药
  [/医药|医疗|生物|健康|制药|疫苗|中药|器械/, '医药'],
  // 消费
  [/消费|食品|酒|饮料|零售|家电|汽车|家居|农业|农|牧|渔/, '消费'],
  // 金融
  [/银行|证券|保险|金融/, '金融'],
  // 地产
  [/地产|物业|房产/, '地产'],
  // 军工
  [/军工|国防/, '军工'],
  // 海外（最宽，放最后）
  [
    /纳斯达克|标普|恒生|QDII|港股通|美股|美国|日本|德国|法国|英国|欧洲|亚太|全球|香港/,
    '海外',
  ],
]

/**
 * 把一只标的归类到板块（科技 / 金属 / 能源 / 医药 / 消费 / 金融 / 地产 / 军工 / 海外 / 其他）。
 * 纯前端、确定性、无网络依赖——适合做分布环展示；
 * 若以后要做「可编辑分类」，把这个函数的返回值当作默认值存进数据库即可。
 */
export function classifyCategory(input: ClassifyInput): string {
  const name = (input.name ?? '').toUpperCase()
  const code = input.code ?? ''

  if (input.assetType === 'STOCK' && KNOWN_STOCK[code]) {
    return KNOWN_STOCK[code]
  }
  for (const [re, cat] of RULES) {
    if (re.test(name)) return cat
  }
  return '其他'
}
